from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Use SQLite for development by default, PostgreSQL for production
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./meet_mind.db"
    )
    DB_SCHEMA: str = os.getenv("DB_SCHEMA", "public")
    JWT_SECRET: str = "change-this-to-a-secure-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRY_MINUTES: int = 60
    JWT_REFRESH_EXPIRY_DAYS: int = 30
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
