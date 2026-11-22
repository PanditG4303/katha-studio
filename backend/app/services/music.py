from __future__ import annotations

import logging
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import AudioAsset, Channel, Project
from ..utils import safe_filename, slugify
from .ffmpeg import AUDIO_EXTENSIONS, MediaToolError, probe, waveform_and_energy
from .workspace import get_storage_roots

logger = logging.getLogger(__name__)


class MusicError(RuntimeError):
    pass


def run_music_import_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    source = Path(payload.get("path", ""))
    if not source.exists():
        raise MusicError("The selected audio file could not be found.")
    if source.suffix.lower() not in AUDIO_EXTENSIONS:
        raise MusicError("Choose an MP3, WAV, M4A, AAC, FLAC or OGG audio file.")
    with SessionLocal() as db:
        channel = db.get(Channel, payload.get("channel_id")) if payload.get("channel_id") else None
        project = db.get(Project, payload.get("project_id")) if payload.get("project_id") else None
        progress(8, "Reading audio metadata…")
        try:
            info = probe(source)
        except MediaToolError as exc:
            raise MusicError(str(exc)) from exc
        if not info.get("has_audio"):
            raise MusicError("This file does not contain an audio stream.")
        roots = get_storage_roots(db)
        target = source
        if payload.get("copy_to_library", True):
            progress(20, "Copying into the music library…")
            folder_name = slugify(channel.name, "general") if channel else "General"
            target_dir = Path(roots["music_root"]) / folder_name
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / safe_filename(source.name)
            index = 2
            while target.exists():
                target = target_dir / f"{Path(safe_filename(source.name)).stem}_{index}{source.suffix.lower()}"
                index += 1
            shutil.copy2(source, target)
        check_cancel()
        progress(48, "Analysing waveform, energy and approximate tempo…")
        analysis = {}
        warning = ""
        try:
            analysis = waveform_and_energy(target)
        except Exception as exc:
            logger.warning("Audio analysis unavailable: %s", exc)
            warning = f"Waveform/tempo analysis was unavailable: {exc}"
        check_cancel()
        progress(85, "Saving the song project…")
        title = (payload.get("title") or source.stem).strip()[:300]
        asset = AudioAsset(
            channel_id=channel.id if channel else None,
            project_id=project.id if project else None,
            kind="music",
            title=title,
            path=str(target),
            duration=float(info.get("duration") or analysis.get("duration") or 0),
            bpm=analysis.get("bpm"),
            energy=analysis.get("energy"),
            waveform=analysis.get("waveform") or [],
            sections=analysis.get("sections") or [],
            lyrics=[],
            tags=payload.get("tags") or [],
            rights_note=payload.get("rights_note") or "User-provided audio. User is responsible for rights.",
            metadata_json={
                "source_path": str(source),
                "copied": str(target) != str(source),
                "audio_codec": info.get("audio_codec"),
                "format": info.get("format"),
                "size": info.get("size"),
                "analysis_warning": warning,
                "workflow": payload.get("workflow") or "",
                "bpm_note": "BPM is a lightweight local estimate, not a definitive analysis.",
            },
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        progress(100, "Audio imported")
        return {
            "asset_id": asset.id,
            "title": asset.title,
            "duration": asset.duration,
            "bpm": asset.bpm,
            "energy": asset.energy,
            "warning": warning,
            "path": asset.path,
        }
