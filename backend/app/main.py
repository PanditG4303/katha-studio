from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import API_TOKEN, APP_NAME, APP_VERSION, DISABLE_WATCHER, config
from .database import backup_database, init_db
from .logging_config import configure_logging
from .routers import agents, browser, channels, content, mcp, media, projects, publishing, skills, system, videos, voice
from .security import require_token
from .services.jobs import mark_interrupted_jobs
from .services.video_import import watcher

configure_logging(os.environ.get("KATHA_LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    init_db()
    mark_interrupted_jobs()
    if not DISABLE_WATCHER:
        watcher.start()
    logger.info("%s %s backend started", APP_NAME, APP_VERSION)
    yield
    watcher.stop()
    from .services import agents as agent_service
    from .services import browser_manager

    agent_service.stop_all()
    browser_manager.get_runtime().stop_all()
    backup_database("shutdown")
    logger.info("Katha Studio backend stopped")


app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    description="Local backend for Katha Studio. Binds to 127.0.0.1 and never requires cloud hosting.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Katha Studio hit an unexpected error. Check the diagnostics and backend log."},
    )


api = APIRouter(prefix="/api", dependencies=[Depends(require_token)])
for router in [
    system.router,
    channels.router,
    content.router,
    projects.router,
    voice.router,
    videos.router,
    publishing.router,
    media.router,
    agents.router,
    skills.router,
    mcp.router,
    browser.router,
]:
    api.include_router(router)
app.include_router(api)


@app.get("/")
def root():
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "authentication": "local API token required" if API_TOKEN else "local development mode",
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    icon = config.data_dir / "icon.ico"
    if icon.exists():
        return JSONResponse(status_code=204, content=None)
    return JSONResponse(status_code=204, content=None)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=int(os.environ.get("KATHA_PORT", "8765")),
        reload=False,
    )
