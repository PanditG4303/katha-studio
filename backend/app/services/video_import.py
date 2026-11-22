from __future__ import annotations

import logging
import re
import time
import uuid
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import config
from ..database import SessionLocal, utcnow
from ..models import Channel, Episode, ImportHistory, Project, Video
from ..utils import normalize_path, safe_filename, slugify
from .ffmpeg import VIDEO_EXTENSIONS, MediaToolError, generate_thumbnail, validate_video
from .workspace import get_storage_roots

logger = logging.getLogger(__name__)


class ImportError(RuntimeError):
    pass


def import_video(
    db: Session,
    path: str,
    *,
    channel_id: int | None = None,
    project_id: int | None = None,
    title: str | None = None,
    source: str = "manual",
    require_stable: bool = False,
) -> dict:
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise ImportError("The selected video file could not be found.")
    normalized = normalize_path(str(file_path))
    if Path(normalized).suffix.lower() not in VIDEO_EXTENSIONS:
        raise ImportError("Choose an MP4, MOV, M4V or WebM file.")
    if require_stable and not _is_stable(file_path):
        raise ImportError("The video is still being written. Katha Studio will import it after it stabilises.")

    duplicate = db.query(Video).filter(func.lower(Video.final_video_path) == normalized.lower()).first()
    if duplicate:
        db.add(
            ImportHistory(
                file_path=normalized,
                file_size=file_path.stat().st_size,
                file_mtime=file_path.stat().st_mtime,
                video_id=duplicate.id,
                status="duplicate",
                message="This video is already in the library.",
                source=source,
            )
        )
        db.commit()
        return {"video_id": duplicate.id, "duplicate": True, "message": "This video is already in the library."}

    try:
        info = validate_video(file_path)
    except MediaToolError as exc:
        db.add(
            ImportHistory(
                file_path=normalized,
                file_size=file_path.stat().st_size,
                file_mtime=file_path.stat().st_mtime,
                status="failed",
                message=str(exc),
                source=source,
            )
        )
        db.commit()
        raise ImportError(str(exc)) from exc

    channel = db.get(Channel, channel_id) if channel_id else _infer_channel(db, normalized)
    project = db.get(Project, project_id) if project_id else _infer_project(db, channel, file_path)
    episode = _infer_episode(db, project, file_path) if project else None
    if channel is None and project:
        channel = db.get(Channel, project.channel_id)

    existing_placeholder = None
    if episode:
        existing_placeholder = (
            db.query(Video).filter(Video.episode_id == episode.id, Video.final_video_path == "").first()
        )

    thumbnail_name = f"video-{uuid.uuid4().hex[:12]}.jpg"
    thumbnail_path = config.thumbnail_dir / thumbnail_name
    try:
        generate_thumbnail(file_path, thumbnail_path, info["duration"])
    except Exception:
        logger.exception("Thumbnail generation failed for %s", file_path)
        thumbnail_path = None

    title_value = (
        title
        or (episode.title if episode else None)
        or (project.title if project and len(project.episodes) == 1 else None)
        or _title_from_filename(file_path)
    )
    video = existing_placeholder or Video(final_video_path=normalized, title=title_value)
    video.channel_id = channel.id if channel else video.channel_id
    video.project_id = project.id if project else video.project_id
    video.episode_id = episode.id if episode else video.episode_id
    video.title = title_value if not existing_placeholder else video.title
    video.category = (project.category if project else channel.category if channel else "")
    video.episode_number = episode.episode_number if episode else 1
    video.description = video.description or (episode.summary if episode else "")
    video.aspect_ratio = info["aspect_ratio"]
    video.duration = info["duration"]
    video.width = info["width"]
    video.height = info["height"]
    video.fps = info["fps"]
    video.codec = info["video_codec"]
    video.project_location = channel.animation_project_path if channel else video.project_location
    video.production_package_path = project.production_package_path if project else video.production_package_path
    video.audio_path = str(Path(episode.audio_manifest_path).parent) if episode and episode.audio_manifest_path else video.audio_path
    video.final_video_path = normalized
    video.subtitle_path = episode.subtitle_path if episode else video.subtitle_path
    video.thumbnail_source_path = str(thumbnail_path) if thumbnail_path else None
    video.thumbnail_path = str(thumbnail_path) if thumbnail_path else video.thumbnail_path
    video.production_status = "AWAITING_REVIEW"
    video.platform = video.platform or "youtube"
    video.source = source
    video.file_size = file_path.stat().st_size
    video.file_mtime = file_path.stat().st_mtime
    video.archived = False
    if not video.channel_id and channel:
        video.channel_id = channel.id
    db.add(video)
    db.flush()
    if project:
        project.status = "ANIMATION_COMPLETED"
        db.add(project)
    db.add(
        ImportHistory(
            file_path=normalized,
            file_size=file_path.stat().st_size,
            file_mtime=file_path.stat().st_mtime,
            video_id=video.id,
            status="imported",
            message="Imported and validated with FFprobe.",
            source=source,
        )
    )
    db.commit()
    db.refresh(video)
    return {
        "video_id": video.id,
        "duplicate": False,
        "title": video.title,
        "duration": video.duration,
        "matched_project": project.id if project else None,
        "matched_episode": episode.id if episode else None,
        "matched_channel": channel.id if channel else None,
        "message": "Video imported into the library.",
    }


def _infer_channel(db: Session, path: str) -> Channel | None:
    normalized = Path(path).resolve()
    for channel in db.query(Channel).all():
        for folder in [channel.watch_folder, channel.output_folder]:
            if folder:
                try:
                    base = Path(folder).resolve()
                    if normalized == base or base in normalized.parents:
                        return channel
                except Exception:
                    continue
    return None


def _infer_project(db: Session, channel: Channel | None, file_path: Path) -> Project | None:
    if not channel:
        return None
    stem = slugify(file_path.stem)
    projects = db.query(Project).filter(Project.channel_id == channel.id).order_by(Project.created_at.desc()).all()
    for project in projects:
        if project.slug and (project.slug in stem or slugify(project.title) in stem):
            return project
    ready = [p for p in projects if p.status in {"READY_FOR_CLAUDE", "ANIMATION_IN_PROGRESS", "ANIMATION_COMPLETED"}]
    if len(ready) == 1:
        return ready[0]
    return None


def _infer_episode(db: Session, project: Project | None, file_path: Path) -> Episode | None:
    if not project:
        return None
    episodes = (
        db.query(Episode)
        .filter(Episode.project_id == project.id)
        .order_by(Episode.episode_number)
        .all()
    )
    if len(episodes) == 1:
        return episodes[0]
    stem = file_path.stem.lower()
    for episode in episodes:
        patterns = [
            rf"part[\s_\-]*0*{episode.episode_number}\b",
            rf"episode[\s_\-]*0*{episode.episode_number}\b",
            rf"ep[\s_\-]*0*{episode.episode_number}\b",
        ]
        if any(re.search(pattern, stem) for pattern in patterns):
            return episode
    return None


def _title_from_filename(file_path: Path) -> str:
    title = re.sub(r"[_\-]+", " ", file_path.stem)
    title = re.sub(r"\s+", " ", title).strip()
    return title[:300] or "Imported video"


def _is_stable(path: Path, min_age_seconds: float = 5.0) -> bool:
    try:
        stat = path.stat()
    except OSError:
        return False
    return time.time() - stat.st_mtime >= min_age_seconds and stat.st_size > 1024


class WatcherService:
    def __init__(self) -> None:
        self._seen: dict[str, tuple[int, float, float]] = {}
        self._imported: set[str] = set()
        self._stop = None
        self._thread = None

    def start(self) -> None:
        import threading

        if self._thread and self._thread.is_alive():
            return
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="katha-watcher", daemon=True)
        self._thread.start()
        logger.info("Video folder watcher started")

    def stop(self) -> None:
        if self._stop:
            self._stop.set()

    def _loop(self) -> None:
        while self._stop and not self._stop.wait(8):
            try:
                self.scan_once()
            except Exception:
                logger.exception("Folder watcher scan failed")

    def scan_once(self) -> list[dict]:
        from ..models import AppSetting

        results = []
        with SessionLocal() as db:
            enabled_setting = db.get(AppSetting, "watcher_enabled")
            if enabled_setting is not None and not enabled_setting.value:
                return results
            channels = db.query(Channel).filter(Channel.archived.is_(False)).all()
            for channel in channels:
                folders = {channel.watch_folder, channel.output_folder}
                for folder in folders:
                    if not folder:
                        continue
                    directory = Path(folder)
                    if not directory.exists():
                        continue
                    for file_path in directory.iterdir():
                        if not file_path.is_file() or file_path.suffix.lower() not in VIDEO_EXTENSIONS:
                            continue
                        key = normalize_path(str(file_path)).lower()
                        if key in self._imported:
                            continue
                        try:
                            stat = file_path.stat()
                        except OSError:
                            continue
                        previous = self._seen.get(key)
                        if previous and previous[0] == stat.st_size and previous[1] == stat.st_mtime:
                            if time.time() - previous[2] < 8:
                                continue
                        else:
                            self._seen[key] = (stat.st_size, stat.st_mtime, time.time())
                            continue
                        try:
                            result = import_video(
                                db,
                                str(file_path),
                                channel_id=channel.id,
                                source="watch_folder",
                                require_stable=True,
                            )
                            self._imported.add(key)
                            results.append(result)
                            logger.info("Imported watched video %s", file_path.name)
                        except ImportError as exc:
                            logger.warning("Watched video not imported yet: %s", exc)
                            # Allow retry on a later scan unless the file is known-good but duplicate.
                            self._seen.pop(key, None)
                        except Exception:
                            logger.exception("Unexpected import failure for %s", file_path)
                            self._seen.pop(key, None)
        return results


watcher = WatcherService()
