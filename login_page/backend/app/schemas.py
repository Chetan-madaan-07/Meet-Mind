import datetime
from pydantic import BaseModel, EmailStr, Field, model_validator


# Request schemas
class SignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, examples=["John Doe"])
    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., min_length=8, max_length=128, examples=["securepass123"])


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., examples=["john@example.com"])
    password: str = Field(..., min_length=1, examples=["securepass123"])


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class GoogleAuthRequest(BaseModel):
    code: str | None = None
    id_token: str | None = None
    email: EmailStr | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    uid: str | None = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_google_payload(self):
        has_oauth_credential = bool(self.code or self.id_token)
        has_firebase_identity = bool(self.email and self.uid)
        if not has_oauth_credential and not has_firebase_identity:
            raise ValueError(
                "Provide either OAuth credential (code/id_token) or Firebase identity (email + uid)."
            )
        return self


# Response schemas
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: "UserResponse"


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeetingStartResponse(BaseModel):
    meeting_id: str
    status: str
    started_at: datetime.datetime


class TranscriptResponse(BaseModel):
    meeting_id: str
    full_text: str
    chunks_count: int
    updated_at: datetime.datetime | None = None


class MeetingStopResponse(BaseModel):
    meeting_id: str
    status: str


class TaskSummaryItem(BaseModel):
    id: int
    text: str
    assignee: str | None = None
    status: str


class MeetingSummaryResponse(BaseModel):
    meeting_id: str
    status: str
    meeting_title: str | None = None
    meeting_date: datetime.datetime | None = None
    duration_seconds: int | None = None
    summary: str | None = None
    decisions: list[str] = Field(default_factory=list)
    tasks: list[TaskSummaryItem] = Field(default_factory=list)


class TaskStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(todo|in_progress|done)$")


class TaskResponse(BaseModel):
    id: int
    meeting_id: str
    user_id: int
    text: str
    assignee: str | None = None
    status: str
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    plan: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True
