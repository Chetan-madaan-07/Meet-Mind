from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User
from app.schemas import (
    SignupRequest,
    LoginRequest,
    GoogleAuthRequest,
    RefreshTokenRequest,
    AccessTokenResponse,
    TokenResponse,
    UserResponse,
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_google_id_token,
    exchange_google_auth_code,
)
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
        plan="free",
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)

    # Generate tokens
    access_token = create_access_token(new_user.id, new_user.email)
    refresh_token = create_refresh_token(new_user.id, new_user.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
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

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id, user.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_access_token(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Issue a fresh access token from a valid refresh token."""
    payload = decode_refresh_token(data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    access_token = create_access_token(user.id, user.email)
    return AccessTokenResponse(access_token=access_token)


@router.post("/google", response_model=TokenResponse)
async def google_sign_in(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Google OAuth sign-in.
    Supports:
    1) Authorization code exchange (preferred).
    2) ID token verification.
    3) Firebase identity payload (email + uid) for mobile clients that already verified with Firebase SDK.
    """
    identity = None

    if data.code:
        identity = await exchange_google_auth_code(data.code)
    elif data.id_token:
        identity = await verify_google_id_token(data.id_token)
    elif data.email and data.uid:
        identity = {
            "email": data.email.lower(),
            "uid": data.uid,
            "name": data.name or data.email.split("@")[0],
        }

    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google OAuth credential",
        )

    # Prefer exact Google UID match; otherwise try account linking by email.
    result = await db.execute(select(User).where(User.google_uid == identity["uid"]))
    user = result.scalar_one_or_none()

    if user is None:
        result = await db.execute(select(User).where(User.email == identity["email"]))
        user = result.scalar_one_or_none()
        if user:
            user.google_uid = identity["uid"]
            if not user.name and identity.get("name"):
                user.name = identity["name"]
        else:
            # No password required for Google-created accounts.
            user = User(
                name=identity.get("name") or identity["email"].split("@")[0],
                email=identity["email"],
                password="",
                plan="free",
                google_uid=identity["uid"],
            )
            db.add(user)
            await db.flush()
            await db.refresh(user)

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id, user.email)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's profile (protected route)."""
    return UserResponse.model_validate(current_user)
