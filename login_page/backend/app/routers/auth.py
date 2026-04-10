from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User
from app.schemas import (
    SignupRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
)
from app.auth import hash_password, verify_password, create_access_token
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with email and password."""

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Create new user
    new_user = User(
        name=data.name,
        email=data.email,
        password=hash_password(data.password),
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)

    # Generate JWT
    token = create_access_token(new_user.id, new_user.email)

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(new_user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate a user with email and password."""

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not user.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id, user.email)

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's profile (protected route)."""
    return UserResponse.model_validate(current_user)
