from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _env_path(name: str, default: Path) -> Path:
    raw = os.environ.get(name)
    return Path(raw).expanduser().resolve() if raw else default


APP_NAME = "Katha Studio"
APP_VERSION = "1.0.0"
DEFAULT_HOST = os.environ.get("KATHA_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("KATHA_PORT", "8765"))
API_TOKEN = os.environ.get("KATHA_API_TOKEN", "")
DISABLE_WATCHER = os.environ.get("KATHA_DISABLE_WATCHER", "").lower() in {"1", "true", "yes"}
TESTING = os.environ.get("KATHA_TESTING", "").lower() in {"1", "true", "yes"}

local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
user_documents = Path(os.environ.get("USERPROFILE", Path.home())) / "Documents"

DATA_DIR = _env_path("KATHA_DATA_DIR", local_app_data / "Katha Studio")
WORKSPACE_DIR = _env_path("KATHA_WORKSPACE_DIR", user_documents / "Katha Studio")
DB_PATH = _env_path("KATHA_DB_PATH", DATA_DIR / "katha.db")
LOG_DIR = _env_path("KATHA_LOG_DIR", DATA_DIR / "logs")
BACKUP_DIR = _env_path("KATHA_BACKUP_DIR", DATA_DIR / "backups")
THUMBNAIL_DIR = _env_path("KATHA_THUMBNAIL_DIR", DATA_DIR / "thumbnails")
UPLOAD_DIR = _env_path("KATHA_UPLOAD_DIR", DATA_DIR / "uploads")
PACKAGE_CACHE_DIR = _env_path("KATHA_PACKAGE_CACHE_DIR", DATA_DIR / "packages")
BROWSER_PROFILE_DIR = _env_path("KATHA_BROWSER_PROFILE_DIR", DATA_DIR / "BROWSER_PROFILES")
SKILL_LIBRARY_DIR = _env_path("KATHA_SKILL_LIBRARY_DIR", DATA_DIR / "skills")
AGENT_RUN_DIR = _env_path("KATHA_AGENT_RUN_DIR", DATA_DIR / "agent_runs")
BROWSER_SCREENSHOT_DIR = _env_path("KATHA_BROWSER_SCREENSHOT_DIR", DATA_DIR / "browser_screenshots")

OUTPUT_SUBFOLDERS = ["READY", "REVIEWED", "PUBLISHED", "FAILED"]

DEFAULT_DIRS = {
    "channels_root": WORKSPACE_DIR / "Channels",
    "packages_root": WORKSPACE_DIR / "Production Packages",
    "outputs_root": WORKSPACE_DIR / "Outputs",
    "assets_root": WORKSPACE_DIR / "Assets",
    "music_root": WORKSPACE_DIR / "Music Library",
    "imports_root": WORKSPACE_DIR / "Incoming Videos",
}

CREDENTIAL_SERVICE = "KathaStudio"
KEYRING_SERVICE = "KathaStudio"


def resource_path(*parts: str) -> Path:
    """Resolve a bundled resource in source and PyInstaller builds."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base.joinpath(*parts)


def _find_tool(env_name: str, candidates: list[Path], exe_name: str) -> str | None:
    raw = os.environ.get(env_name)
    if raw and Path(raw).exists():
        return str(Path(raw))
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    found = shutil.which(exe_name)
    return found


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FFMPEG_PATH = _find_tool(
    "KATHA_FFMPEG_PATH",
    [
        PROJECT_ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe",
        resource_path("tools", "ffmpeg.exe"),
    ],
    "ffmpeg",
)
FFPROBE_PATH = _find_tool(
    "KATHA_FFPROBE_PATH",
    [
        PROJECT_ROOT / "node_modules" / "ffprobe-static" / "bin" / "win32" / "x64" / "ffprobe.exe",
        resource_path("tools", "ffprobe.exe"),
    ],
    "ffprobe",
)

SAPI_SCRIPT = resource_path("app", "resources", "sapi_tts.ps1")


@dataclass
class AppConfig:
    data_dir: Path = DATA_DIR
    workspace_dir: Path = WORKSPACE_DIR
    db_path: Path = DB_PATH
    log_dir: Path = LOG_DIR
    backup_dir: Path = BACKUP_DIR
    thumbnail_dir: Path = THUMBNAIL_DIR
    upload_dir: Path = UPLOAD_DIR
    browser_profile_dir: Path = BROWSER_PROFILE_DIR
    skill_library_dir: Path = SKILL_LIBRARY_DIR
    agent_run_dir: Path = AGENT_RUN_DIR
    browser_screenshot_dir: Path = BROWSER_SCREENSHOT_DIR
    ffmpeg_path: str | None = FFMPEG_PATH
    ffprobe_path: str | None = FFPROBE_PATH
    default_dirs: dict = field(default_factory=lambda: dict(DEFAULT_DIRS))

    def ensure_dirs(self) -> None:
        for path in [
            self.data_dir,
            self.workspace_dir,
            self.log_dir,
            self.backup_dir,
            self.thumbnail_dir,
            self.upload_dir,
            self.browser_profile_dir,
            self.skill_library_dir,
            self.agent_run_dir,
            self.browser_screenshot_dir,
            *self.default_dirs.values(),
        ]:
            path.mkdir(parents=True, exist_ok=True)


config = AppConfig()
