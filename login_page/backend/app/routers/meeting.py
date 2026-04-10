import asyncio
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User

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
