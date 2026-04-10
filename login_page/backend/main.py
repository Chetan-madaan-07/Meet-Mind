import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import create_tables
from app.routers.auth import router as auth_router
from app.routers.meeting import router as meeting_router
from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    await create_tables()
    yield


app = FastAPI(
    title="Meet-Mind API",
    description="Authentication API for Meet-Mind mobile app",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth_router)
app.include_router(meeting_router)

# Serve the browser meeting-room client from /meeting
meeting_room_path = Path(__file__).resolve().parents[2] / "meeting_room"
if meeting_room_path.exists():
    app.mount("/meeting", StaticFiles(directory=str(meeting_room_path), html=True), name="meeting")


@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "message": "Meet-Mind API is running"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
