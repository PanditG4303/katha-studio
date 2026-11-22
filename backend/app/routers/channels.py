from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Channel, Project, ReferenceStyle, VoiceProfile
from ..schemas import ChannelCreate, ChannelUpdate
from ..serializers import channel_dict, project_summary, reference_style_dict, voice_profile_dict
from ..services.tts import windows_voices
from ..services.workspace import get_storage_roots, initialize_channel_workspace, unique_channel_slug
from ..utils import safe_filename

router = APIRouter(prefix="/channels", tags=["channels"])
logger = logging.getLogger(__name__)


@router.get("")
def list_channels(include_archived: bool = Query(False), db: Session = Depends(get_db)):
    query = db.query(Channel).order_by(Channel.created_at.asc())
    if not include_archived:
        query = query.filter(Channel.archived.is_(False))
    channels = query.all()
    return {"channels": [channel_dict(db, channel) for channel in channels]}


@router.post("", status_code=201)
def create_channel(payload: ChannelCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Give the channel a name.")
    slug = unique_channel_slug(db, name)
    roots = get_storage_roots(db)
    channel = Channel(
        name=name,
        slug=slug,
        description=payload.description,
        category=payload.category,
        language=payload.language,
        preferred_formats=payload.preferred_formats,
        animation_style=payload.animation_style,
        narrator_voice=payload.narrator_voice,
        voice_settings=payload.voice_settings,
        subtitle_preferences=payload.subtitle_preferences,
        typography=payload.typography,
        music_preferences=payload.music_preferences,
        accent_color=payload.accent_color,
        is_demo=payload.is_demo,
        output_folder=payload.output_folder,
        watch_folder=payload.watch_folder,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    try:
        initialize_channel_workspace(db, channel)
        if payload.logo_path:
            _copy_logo(channel, payload.logo_path, db)
        voices = windows_voices()
        if voices:
            voice = VoiceProfile(
                channel_id=channel.id,
                name="Local narrator",
                role="Main narrator",
                provider="windows_sapi",
                provider_voice_id=voices[0].get("name", ""),
                model_id="windows-sapi",
                language=channel.language,
                settings={"rate": 0},
                description="Offline Windows voice. You can replace it with an ElevenLabs voice at any time.",
            )
            db.add(voice)
            db.commit()
            channel.narrator_voice = "Local narrator"
            db.commit()
    except Exception as exc:
        logger.exception("Channel workspace setup failed")
        db.delete(channel)
        db.commit()
        raise HTTPException(500, f"The channel could not be created: {exc}")
    return channel_dict(db, channel)


@router.get("/{channel_id}")
def get_channel(channel_id: int, db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    data = channel_dict(db, channel)
    projects = (
        db.query(Project)
        .filter(Project.channel_id == channel.id)
        .order_by(Project.created_at.desc())
        .limit(30)
        .all()
    )
    data["projects"] = [project_summary(db, project) for project in projects]
    profiles = (
        db.query(VoiceProfile)
        .filter(VoiceProfile.channel_id == channel.id)
        .order_by(VoiceProfile.created_at)
        .all()
    )
    data["voice_profiles"] = [voice_profile_dict(db, profile) for profile in profiles]
    styles = (
        db.query(ReferenceStyle)
        .filter(ReferenceStyle.channel_id == channel.id)
        .order_by(ReferenceStyle.created_at.desc())
        .all()
    )
    data["reference_styles"] = [reference_style_dict(style) for style in styles]
    data["workspace_exists"] = bool(
        channel.animation_project_path and Path(channel.animation_project_path).exists()
    )
    return data


@router.patch("/{channel_id}")
def update_channel(channel_id: int, payload: ChannelUpdate, db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    update = payload.model_dump(exclude_unset=True)
    logo_path = update.pop("logo_path", None)
    for field, value in update.items():
        if value is not None:
            setattr(channel, field, value)
    db.commit()
    if logo_path:
        _copy_logo(channel, logo_path, db)
    if update.get("channels_root") or update.get("animation_project_path") or update.get("output_folder") or update.get("watch_folder"):
        initialize_channel_workspace(db, channel)
    return channel_dict(db, channel)


@router.post("/{channel_id}/archive")
def archive_channel(channel_id: int, archived: bool = Query(True), db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    channel.archived = archived
    db.commit()
    return channel_dict(db, channel)


@router.post("/{channel_id}/workspace/refresh")
def refresh_workspace(channel_id: int, db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    try:
        result = initialize_channel_workspace(db, channel)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.get("/{channel_id}/assets")
def list_assets(channel_id: int, db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    project_path = Path(channel.animation_project_path) if channel.animation_project_path else None
    if not project_path or not project_path.exists():
        return {"folders": [], "files": []}
    files = []
    folders = []
    for path in project_path.rglob("*"):
        if ".git" in path.parts:
            continue
        if path.is_dir():
            folders.append(str(path.relative_to(project_path)).replace("\\", "/"))
        elif path.is_file() and path.name != ".keep":
            try:
                size = path.stat().st_size
            except OSError:
                size = 0
            files.append(
                {
                    "name": path.name,
                    "relative_path": str(path.relative_to(project_path)).replace("\\", "/"),
                    "path": str(path),
                    "size": size,
                    "kind": path.suffix.lower().lstrip(".") or "file",
                }
            )
    return {"folders": folders[:200], "files": files[:500]}


def _copy_logo(channel: Channel, logo_path: str, db: Session) -> None:
    source = Path(logo_path)
    if not source.exists():
        raise HTTPException(400, "The selected logo file could not be found.")
    if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        raise HTTPException(400, "Choose a PNG, JPG, WEBP or SVG logo.")
    target_dir = Path(channel.channels_root) / channel.slug / "branding" if channel.channels_root else Path(channel.animation_project_path or "") / "visual_assets"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"channel_logo{source.suffix.lower()}"
    shutil.copy2(source, target)
    channel.logo_path = str(target)
    db.commit()
