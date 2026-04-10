import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from app.database import Base


class User(Base):
    """User model for authentication."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    # Subscription tier assigned at signup (defaults to Free plan).
    plan = Column(String(20), nullable=False, default="free")
    # Google identity link for OAuth sign-in.
    google_uid = Column(String(255), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}', email='{self.email}')>"


class Meeting(Base):
    """Meeting lifecycle record."""

    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False, default="Untitled Meeting")
    status = Column(String(30), nullable=False, default="recording")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    ended_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Meeting(id='{self.id}', user_id={self.user_id}, status='{self.status}')>"


class MeetingSummary(Base):
    """Structured AI summary output for a meeting."""

    __tablename__ = "meeting_summaries"

    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    summary = Column(String, nullable=False, default="")
    decisions_json = Column(String, nullable=False, default="[]")
    tasks_json = Column(String, nullable=False, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<MeetingSummary(meeting_id='{self.meeting_id}')>"


class Task(Base):
    """Action item extracted from a meeting summary."""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String(500), nullable=False)
    assignee = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="todo", index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def __repr__(self):
        return (
            f"<Task(id={self.id}, meeting_id='{self.meeting_id}', "
            f"user_id={self.user_id}, status='{self.status}')>"
        )


class Transcript(Base):
    """Canonical transcript for a meeting."""

    __tablename__ = "transcripts"

    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    full_text = Column(String, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Transcript(meeting_id='{self.meeting_id}', chars={len(self.full_text or '')})>"


class TranscriptChunk(Base):
    """Incremental transcript chunks for ordering, deduplication, and replay."""

    __tablename__ = "transcript_chunks"
    __table_args__ = (
        UniqueConstraint("meeting_id", "chunk_id", name="uq_transcript_chunks_meeting_chunk"),
        UniqueConstraint("meeting_id", "sequence", name="uq_transcript_chunks_meeting_sequence"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_id = Column(String(128), nullable=False)
    sequence = Column(Integer, nullable=False)
    partial_text = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<TranscriptChunk(meeting_id='{self.meeting_id}', "
            f"chunk_id='{self.chunk_id}', sequence={self.sequence})>"
        )
