from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
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
