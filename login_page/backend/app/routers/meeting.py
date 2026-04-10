import asyncio
import json
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
import time
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token
from app.config import get_settings
from app.database import AsyncSessionLocal, get_db
from app.dependencies import get_current_user
from app.models import Meeting, MeetingSummary, Task, Transcript, TranscriptChunk, User
from app.schemas import (
    MeetingStartResponse,
    MeetingStopResponse,
    MeetingSummaryResponse,
    TaskResponse,
    TaskStatusUpdateRequest,
    TranscriptResponse,
)

settings = get_settings()
router = APIRouter(tags=["Meeting"])


class ClientConnection:
    def __init__(self, websocket: WebSocket, connection_id: str, user_id: str, name: str):
        self.websocket = websocket
        self.connection_id = connection_id
        self.user_id = user_id
        self.name = name


rooms: Dict[str, Dict[str, ClientConnection]] = defaultdict(dict)
rooms_lock = asyncio.Lock()


async def get_user_from_token(token: str | None):
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == int(user_id)))
        return result.scalar_one_or_none()


async def get_user_from_access_token(token: str | None):
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


async def safe_send(websocket: WebSocket, payload: dict):
    try:
        await websocket.send_json(payload)
    except Exception:
        # Socket may already be disconnected.
        pass


async def broadcast_room(room_id: str, payload: dict, exclude_connection_id: str | None = None):
    clients = list(rooms.get(room_id, {}).values())
    for client in clients:
        if exclude_connection_id and client.connection_id == exclude_connection_id:
            continue
        await safe_send(client.websocket, payload)


async def ensure_transcript(session: AsyncSession, meeting_id: str) -> Transcript:
    result = await session.execute(select(Transcript).where(Transcript.meeting_id == meeting_id))
    transcript = result.scalar_one_or_none()
    if transcript is None:
        transcript = Transcript(meeting_id=meeting_id, full_text="", updated_at=datetime.utcnow())
        session.add(transcript)
        await session.flush()
    return transcript


async def rebuild_transcript_full_text(session: AsyncSession, meeting_id: str) -> str:
    result = await session.execute(
        select(TranscriptChunk).where(TranscriptChunk.meeting_id == meeting_id).order_by(TranscriptChunk.sequence.asc())
    )
    chunks = result.scalars().all()
    return "\n".join([c.partial_text for c in chunks if c.partial_text])


async def process_transcript_chunk(
    session: AsyncSession,
    meeting_id: str,
    chunk_id: str,
    sequence: int,
    text_payload: str,
):
    # Deduplicate by chunk_id first.
    existing_by_chunk = await session.execute(
        select(TranscriptChunk).where(
            TranscriptChunk.meeting_id == meeting_id,
            TranscriptChunk.chunk_id == chunk_id,
        )
    )
    chunk_row = existing_by_chunk.scalar_one_or_none()
    if chunk_row:
        return {"partial_text": chunk_row.partial_text, "duplicate": True}

    # Deduplicate by sequence to prevent replayed buffered chunk from duplicating transcript.
    existing_by_sequence = await session.execute(
        select(TranscriptChunk).where(
            TranscriptChunk.meeting_id == meeting_id,
            TranscriptChunk.sequence == sequence,
        )
    )
    chunk_row = existing_by_sequence.scalar_one_or_none()
    if chunk_row:
        return {"partial_text": chunk_row.partial_text, "duplicate": True}

    if text_payload == "__FAIL__":
        raise ValueError("Chunk processing failed for this chunk")

    # Placeholder transcription behavior (transcription provider integration comes in later requirement).
    partial_text = text_payload.strip() if text_payload else f"[chunk {sequence} received]"

    chunk_row = TranscriptChunk(
        meeting_id=meeting_id,
        chunk_id=chunk_id,
        sequence=sequence,
        partial_text=partial_text,
    )
    session.add(chunk_row)
    await session.flush()

    transcript = await ensure_transcript(session, meeting_id)
    transcript.full_text = await rebuild_transcript_full_text(session, meeting_id)
    transcript.updated_at = datetime.utcnow()

    return {"partial_text": partial_text, "duplicate": False}


def extract_task_from_line(line: str) -> dict | None:
    text = (line or "").strip()
    if not text:
        return None

    lower = text.lower()
    if "no action" in lower or "no next step" in lower:
        return None
    if not any(keyword in lower for keyword in ["todo", "action", "will ", "follow up", "next step"]):
        return None

    assignee = None
    prefix_match = re.match(r"^([A-Za-z][A-Za-z ]{1,40})\s*:\s*(.+)$", text)
    if prefix_match:
        assignee = prefix_match.group(1).strip()
        text = prefix_match.group(2).strip()
    else:
        inline_match = re.match(r"^([A-Za-z][A-Za-z ]{1,40})\s+(?:will|to|needs to)\s+(.+)$", text, re.IGNORECASE)
        if inline_match:
            assignee = inline_match.group(1).strip()
            text = inline_match.group(2).strip()

    if not text:
        return None

    return {"text": text[:500], "assignee": assignee[:100] if assignee else None}


def generate_structured_summary(full_text: str) -> dict:
    """
    Lightweight structured summary generator used until LLM integration is plugged in.
    """
    cleaned = (full_text or "").strip()
    if not cleaned:
        return {
            "summary": "No transcript content was captured for this meeting.",
            "decisions": [],
            "tasks": [],
        }

    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    summary = " ".join(lines[:3])

    decisions = [
        line
        for line in lines
        if any(keyword in line.lower() for keyword in ["decide", "decision", "agreed"])
    ][:10]
    tasks = []
    for line in lines:
        task_item = extract_task_from_line(line)
        if task_item:
            tasks.append(task_item)
        if len(tasks) >= 15:
            break

    return {
        "summary": summary or "Meeting captured successfully.",
        "decisions": decisions,
        "tasks": tasks,
    }


def validate_summary_payload(payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    if not isinstance(payload.get("summary"), str):
        return False
    if not isinstance(payload.get("decisions"), list):
        return False
    if not isinstance(payload.get("tasks"), list):
        return False
    if any(not isinstance(item, str) or not item.strip() for item in payload["decisions"]):
        return False
    for item in payload["tasks"]:
        if not isinstance(item, dict):
            return False
        text = item.get("text")
        assignee = item.get("assignee")
        if not isinstance(text, str) or not text.strip():
            return False
        if len(text.strip()) > 500:
            return False
        if assignee is not None and (not isinstance(assignee, str) or not assignee.strip()):
            return False
    return True


def normalize_task_items(raw_tasks: list, transcript_text: str = "") -> list[dict]:
    normalized = []
    transcript_lc = (transcript_text or "").lower()
    for item in raw_tasks:
        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            assignee = item.get("assignee")
            assignee = str(assignee).strip() if assignee is not None else None
        else:
            text = str(item or "").strip()
            assignee = None
        if not text:
            continue
        if assignee and assignee.lower() not in transcript_lc:
            assignee = None
        normalized.append(
            {
                "text": text[:500],
                "assignee": assignee[:100] if assignee else None,
            }
        )
    return normalized


async def sync_tasks_for_meeting(session: AsyncSession, meeting: Meeting, extracted_tasks: list[dict]):
    existing_result = await session.execute(select(Task).where(Task.meeting_id == meeting.id))
    existing_tasks = existing_result.scalars().all()
    existing_by_key = {
        ((task.text or "").strip().lower(), (task.assignee or "").strip().lower()): task
        for task in existing_tasks
    }

    incoming_keys = set()
    for item in extracted_tasks:
        task_text = str(item.get("text") or "").strip()[:500]
        assignee_raw = item.get("assignee")
        assignee = str(assignee_raw).strip()[:100] if assignee_raw else None
        if not task_text:
            continue

        key = (task_text.lower(), (assignee or "").lower())
        incoming_keys.add(key)
        if key in existing_by_key:
            continue

        session.add(
            Task(
                meeting_id=meeting.id,
                user_id=meeting.user_id,
                text=task_text,
                assignee=assignee,
                status="todo",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )

    for task in existing_tasks:
        key = ((task.text or "").strip().lower(), (task.assignee or "").strip().lower())
        if key not in incoming_keys:
            await session.delete(task)


async def run_meeting_summary_pipeline(meeting_id: str):
    """
    Async summarization pipeline. Retries structured generation up to 3 attempts.
    """
    async with AsyncSessionLocal() as session:
        meeting_result = await session.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = meeting_result.scalar_one_or_none()
        if meeting is None:
            return

        transcript_result = await session.execute(select(Transcript).where(Transcript.meeting_id == meeting_id))
        transcript = transcript_result.scalar_one_or_none()
        full_text = transcript.full_text if transcript else ""

        payload = None
        for _ in range(3):
            candidate = generate_structured_summary(full_text)
            if validate_summary_payload(candidate):
                payload = candidate
                break

        if payload is None:
            meeting.status = "failed"
            await session.commit()
            return

        normalized_tasks = normalize_task_items(payload.get("tasks") or [], full_text)

        summary_result = await session.execute(
            select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id)
        )
        summary_row = summary_result.scalar_one_or_none()
        if summary_row is None:
            summary_row = MeetingSummary(
                meeting_id=meeting_id,
                summary=payload["summary"],
                decisions_json=json.dumps(payload["decisions"]),
                tasks_json=json.dumps(normalized_tasks),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(summary_row)
        else:
            summary_row.summary = payload["summary"]
            summary_row.decisions_json = json.dumps(payload["decisions"])
            summary_row.tasks_json = json.dumps(normalized_tasks)
            summary_row.updated_at = datetime.utcnow()

        await sync_tasks_for_meeting(session, meeting, normalized_tasks)

        meeting.status = "done"
        await session.commit()


def get_meeting_duration_seconds(meeting: Meeting) -> int | None:
    if meeting.ended_at is None or meeting.created_at is None:
        return None
    seconds = int((meeting.ended_at - meeting.created_at).total_seconds())
    return max(0, seconds)


@router.post("/api/meetings/start", response_model=MeetingStartResponse)
async def start_meeting(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start a meeting session and return a unique meeting_id.
    Enforces Free plan monthly meeting limit (5/month).
    """
    if current_user.plan == "free":
        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        if now.month == 12:
            next_month_start = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_month_start = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

        result = await db.execute(
            select(func.count(Meeting.id)).where(
                Meeting.user_id == current_user.id,
                Meeting.created_at >= month_start,
                Meeting.created_at < next_month_start,
            )
        )
        meetings_this_month = result.scalar_one()

        if meetings_this_month >= 5:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Free plan limit reached: maximum 5 meetings per month.",
            )

    meeting = Meeting(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=f"Meeting {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        status="recording",
    )
    db.add(meeting)
    await db.flush()
    await db.refresh(meeting)

    return MeetingStartResponse(
        meeting_id=meeting.id,
        status=meeting.status,
        started_at=meeting.created_at,
    )


@router.get("/api/meetings/{meeting_id}/transcript", response_model=TranscriptResponse)
async def get_meeting_transcript(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting_result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = meeting_result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    transcript_result = await db.execute(select(Transcript).where(Transcript.meeting_id == meeting_id))
    transcript = transcript_result.scalar_one_or_none()

    chunks_count_result = await db.execute(
        select(func.count(TranscriptChunk.id)).where(TranscriptChunk.meeting_id == meeting_id)
    )
    chunks_count = chunks_count_result.scalar_one()

    return TranscriptResponse(
        meeting_id=meeting_id,
        full_text=transcript.full_text if transcript else "",
        chunks_count=chunks_count,
        updated_at=transcript.updated_at if transcript else None,
    )


@router.post("/api/meetings/{meeting_id}/stop", response_model=MeetingStopResponse)
async def stop_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stop recording and kick off async summarization pipeline.
    """
    meeting_result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = meeting_result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    if meeting.status == "processing":
        return MeetingStopResponse(meeting_id=meeting_id, status="processing")
    if meeting.status == "done":
        return MeetingStopResponse(meeting_id=meeting_id, status="done")

    meeting.status = "processing"
    meeting.ended_at = datetime.utcnow()
    await db.flush()

    # Fire-and-forget async task. Celery integration can replace this later without API contract changes.
    asyncio.create_task(run_meeting_summary_pipeline(meeting_id))

    return MeetingStopResponse(meeting_id=meeting_id, status="processing")


@router.get("/api/meetings/{meeting_id}/summary", response_model=MeetingSummaryResponse)
async def get_meeting_summary(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meeting_result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == current_user.id)
    )
    meeting = meeting_result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    summary_result = await db.execute(
        select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id)
    )
    summary_row = summary_result.scalar_one_or_none()

    task_result = await db.execute(
        select(Task).where(Task.meeting_id == meeting_id, Task.user_id == current_user.id).order_by(Task.created_at.asc())
    )
    task_rows = task_result.scalars().all()
    task_payload = [
        {
            "id": task.id,
            "text": task.text,
            "assignee": task.assignee,
            "status": task.status,
        }
        for task in task_rows
    ]

    if summary_row is None:
        return MeetingSummaryResponse(
            meeting_id=meeting_id,
            status=meeting.status,
            meeting_title=meeting.title,
            meeting_date=meeting.created_at,
            duration_seconds=get_meeting_duration_seconds(meeting),
            tasks=task_payload,
        )

    try:
        decisions = json.loads(summary_row.decisions_json or "[]")
    except json.JSONDecodeError:
        decisions = []

    return MeetingSummaryResponse(
        meeting_id=meeting_id,
        status=meeting.status,
        meeting_title=meeting.title,
        meeting_date=meeting.created_at,
        duration_seconds=get_meeting_duration_seconds(meeting),
        summary=summary_row.summary,
        decisions=decisions,
        tasks=task_payload,
    )


@router.patch("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    payload: TaskStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task_result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = task_result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status != payload.status:
        task.status = payload.status
        task.updated_at = datetime.utcnow()
        await db.flush()

    return TaskResponse.model_validate(task)


@router.websocket("/ws/transcription/{meeting_id}")
async def transcription_socket(websocket: WebSocket, meeting_id: str):
    await websocket.accept()

    token = websocket.query_params.get("token")
    user = await get_user_from_access_token(token)
    if user is None:
        await safe_send(
            websocket,
            {"type": "error", "code": "AUTH_ERROR", "message": "Invalid or missing access token"},
        )
        await websocket.close(code=4401)
        return

    async with AsyncSessionLocal() as session:
        meeting_result = await session.execute(
            select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == user.id)
        )
        meeting = meeting_result.scalar_one_or_none()
        if meeting is None:
            await safe_send(
                websocket,
                {"type": "error", "code": "NOT_FOUND", "message": "Meeting not found"},
            )
            await websocket.close(code=4404)
            return

        await ensure_transcript(session, meeting_id)
        await session.commit()

    await safe_send(
        websocket,
        {"type": "transcription_ready", "meetingId": meeting_id, "status": "recording"},
    )

    async def handle_chunk_message(data: dict):
        chunk_id = str(data.get("chunk_id") or f"chunk-{uuid.uuid4().hex[:8]}")
        sequence = data.get("sequence")
        text_payload = data.get("text") or ""

        if sequence is None:
            raise ValueError("Missing 'sequence' in chunk message")
        if not isinstance(sequence, int):
            raise ValueError("'sequence' must be an integer")

        started_at = time.perf_counter()
        async with AsyncSessionLocal() as session:
            chunk_result = await process_transcript_chunk(
                session=session,
                meeting_id=meeting_id,
                chunk_id=chunk_id,
                sequence=sequence,
                text_payload=text_payload,
            )
            await session.commit()

        latency_ms = int((time.perf_counter() - started_at) * 1000)
        await safe_send(
            websocket,
            {
                "type": "partial_transcript",
                "meetingId": meeting_id,
                "chunk_id": chunk_id,
                "sequence": sequence,
                "text": chunk_result["partial_text"],
                "duplicate": chunk_result["duplicate"],
                "latency_ms": latency_ms,
            },
        )

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "chunk":
                try:
                    await handle_chunk_message(data)
                except Exception as exc:
                    # Independent chunk processing: report error and continue.
                    await safe_send(
                        websocket,
                        {
                            "type": "chunk_error",
                            "chunk_id": data.get("chunk_id"),
                            "sequence": data.get("sequence"),
                            "message": str(exc),
                        },
                    )

            elif message_type == "sync_buffer":
                chunks = data.get("chunks") or []
                for chunk in chunks:
                    try:
                        await handle_chunk_message(
                            {
                                "type": "chunk",
                                "chunk_id": chunk.get("chunk_id"),
                                "sequence": chunk.get("sequence"),
                                "text": chunk.get("text") or "",
                            }
                        )
                    except Exception as exc:
                        await safe_send(
                            websocket,
                            {
                                "type": "chunk_error",
                                "chunk_id": chunk.get("chunk_id"),
                                "sequence": chunk.get("sequence"),
                                "message": str(exc),
                            },
                        )

                await safe_send(
                    websocket,
                    {"type": "sync_complete", "synced_count": len(chunks)},
                )

            elif message_type == "get_full_transcript":
                async with AsyncSessionLocal() as session:
                    transcript_result = await session.execute(
                        select(Transcript).where(Transcript.meeting_id == meeting_id)
                    )
                    transcript = transcript_result.scalar_one_or_none()
                await safe_send(
                    websocket,
                    {
                        "type": "full_transcript",
                        "meetingId": meeting_id,
                        "text": transcript.full_text if transcript else "",
                    },
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


@router.websocket("/ws/meeting/{room_id}")
async def meeting_socket(websocket: WebSocket, room_id: str):
    await websocket.accept()

    token = websocket.query_params.get("token")
    provided_name = (websocket.query_params.get("name") or "").strip()

    user = await get_user_from_token(token)
    if user:
        user_id = str(user.id)
        display_name = user.name
    else:
        user_id = f"guest-{uuid.uuid4().hex[:8]}"
        display_name = provided_name or f"Guest-{user_id[-4:]}"

    connection_id = f"conn-{uuid.uuid4().hex[:10]}"
    connection = ClientConnection(
        websocket=websocket,
        connection_id=connection_id,
        user_id=user_id,
        name=display_name,
    )

    async with rooms_lock:
        existing_participants = [
            {"id": c.connection_id, "name": c.name, "userId": c.user_id}
            for c in rooms[room_id].values()
            if c.connection_id != connection_id
        ]
        rooms[room_id][connection_id] = connection

    await safe_send(
        websocket,
        {
            "type": "room_state",
            "roomId": room_id,
            "self": {"id": connection_id, "name": display_name, "userId": user_id},
            "participants": existing_participants,
        },
    )

    await broadcast_room(
        room_id,
        {
            "type": "participant_joined",
            "participant": {"id": connection_id, "name": display_name, "userId": user_id},
        },
        exclude_connection_id=connection_id,
    )

    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "signal":
                target_id = data.get("target")
                signal = data.get("signal")
                if not target_id or not signal:
                    continue

                async with rooms_lock:
                    target = rooms.get(room_id, {}).get(str(target_id))

                if target:
                    await safe_send(
                        target.websocket,
                        {
                            "type": "signal",
                            "from": {
                                "id": connection_id,
                                "name": display_name,
                                "userId": user_id,
                            },
                            "signal": signal,
                        },
                    )

            elif message_type == "chat":
                text = (data.get("text") or "").strip()
                if not text:
                    continue

                await broadcast_room(
                    room_id,
                    {
                        "type": "chat",
                        "from": {
                            "id": connection_id,
                            "name": display_name,
                            "userId": user_id,
                        },
                        "text": text,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                )

    except WebSocketDisconnect:
        pass
    except Exception:
        # Keep room stable even if one client fails unexpectedly.
        pass
    finally:
        async with rooms_lock:
            room = rooms.get(room_id, {})
            if connection_id in room:
                room.pop(connection_id, None)
            is_empty = not room
            if is_empty:
                rooms.pop(room_id, None)

        await broadcast_room(
            room_id,
            {
                "type": "participant_left",
                "participant": {"id": connection_id, "name": display_name, "userId": user_id},
            },
        )
