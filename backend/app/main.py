from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import async_session, init_db
from app.logging_config import setup_logging
from app.plugins import plugin_manager
from app.routers import ai, attachments, auth, channels, console, export, notes, plugins, schedules, servers
from app.routers.settings import router as settings_router
from app.routers import websocket as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.DEBUG)
    await init_db()
    # Scan and load all plugins (builtin + community)
    async with async_session() as db:
        await plugin_manager.scan_plugins(db)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(servers.router)
app.include_router(channels.router)
app.include_router(notes.router)
app.include_router(schedules.router)
app.include_router(ai.router)
app.include_router(console.router)
app.include_router(plugins.router)
app.include_router(attachments.router)
app.include_router(export.router)
app.include_router(settings_router)
app.include_router(ws_router.router)

# Mount static files for uploads
upload_dir = Path(settings.UPLOAD_DIR)
upload_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}