from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.config import get_settings

settings = get_settings()

# Async SQLAlchemy engine with SQLite or PostgreSQL support
engine_kwargs = {
    "echo": False,
}

# Only set pool settings for PostgreSQL (not needed for SQLite)
if "postgresql" in settings.DATABASE_URL or "postgres" in settings.DATABASE_URL:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
else:
    # SQLite needs special async setup
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db():
    """Dependency that provides a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all database tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_schema_compatibility(conn)


async def ensure_schema_compatibility(conn):
    """
    Lightweight schema updates for local/dev environments without migrations.
    Keeps existing SQLite databases usable when new columns are introduced.
    """
    if "sqlite" in settings.DATABASE_URL:
        result = await conn.execute(text("PRAGMA table_info(users)"))
        column_names = {row[1] for row in result.fetchall()}
        if "plan" not in column_names:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN plan VARCHAR(20) NOT NULL DEFAULT 'free'")
            )
        if "google_uid" not in column_names:
            await conn.execute(text("ALTER TABLE users ADD COLUMN google_uid VARCHAR(255)"))
        await conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_uid ON users(google_uid)")
        )

        meeting_columns_result = await conn.execute(text("PRAGMA table_info(meetings)"))
        meeting_columns = {row[1] for row in meeting_columns_result.fetchall()}
        if "title" not in meeting_columns:
            await conn.execute(
                text("ALTER TABLE meetings ADD COLUMN title VARCHAR(200) NOT NULL DEFAULT 'Untitled Meeting'")
            )
        if "ended_at" not in meeting_columns:
            await conn.execute(text("ALTER TABLE meetings ADD COLUMN ended_at DATETIME"))
    elif "postgresql" in settings.DATABASE_URL or "postgres" in settings.DATABASE_URL:
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free'")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_uid VARCHAR(255)")
        )
        await conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_uid ON users(google_uid)")
        )
        await conn.execute(
            text("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Untitled Meeting'")
        )
        await conn.execute(
            text("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP")
        )
