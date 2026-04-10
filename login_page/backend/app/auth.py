from datetime import datetime, timedelta, timezone
import httpx
from passlib.context import CryptContext
from jose import jwt, JWTError
from app.config import get_settings

settings = get_settings()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: int, email: str) -> str:
    """Create a JWT access token with user claims."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_EXPIRY_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int, email: str) -> str:
    """Create a JWT refresh token with a longer expiry."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_jwt_token(token: str) -> dict | None:
    """Decode and verify a JWT token. Returns payload or None."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def decode_access_token(token: str) -> dict | None:
    """Decode and verify an access token."""
    payload = decode_jwt_token(token)
    if payload is None:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def decode_refresh_token(token: str) -> dict | None:
    """Decode and verify a refresh token."""
    payload = decode_jwt_token(token)
    if payload is None:
        return None
    if payload.get("type") != "refresh":
        return None
    return payload


async def verify_google_id_token(id_token: str) -> dict | None:
    """
    Validate a Google ID token via Google's tokeninfo endpoint.
    Returns normalized identity or None when invalid.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
            )
    except httpx.HTTPError:
        return None

    if response.status_code != 200:
        return None

    payload = response.json()

    aud = payload.get("aud")
    if settings.GOOGLE_CLIENT_ID and aud != settings.GOOGLE_CLIENT_ID:
        return None

    if str(payload.get("email_verified", "false")).lower() not in {"true", "1"}:
        return None

    email = payload.get("email")
    uid = payload.get("sub")
    if not email or not uid:
        return None

    return {
        "email": email.lower(),
        "uid": uid,
        "name": payload.get("name") or email.split("@")[0],
    }


async def exchange_google_auth_code(code: str) -> dict | None:
    """
    Exchange Google OAuth authorization code for ID token and validate identity.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or not settings.GOOGLE_REDIRECT_URI:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
    except httpx.HTTPError:
        return None

    if response.status_code != 200:
        return None

    token_data = response.json()
    id_token = token_data.get("id_token")
    if not id_token:
        return None

    return await verify_google_id_token(id_token)
