from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Asset, AudioAsset, Channel, DialogueLine, Video

router = APIRouter(prefix="/media", tags=["media"])


def _ensure_file(path: str | None) -> Path:
    if not path:
        raise HTTPException(404, "This file is not available.")
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "This file is no longer on disk.")
    return file_path


def _media_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed:
        return guessed
    if path.suffix.lower() in {".mp3"}:
        return "audio/mpeg"
    if path.suffix.lower() in {".mp4"}:
        return "video/mp4"
    return "application/octet-stream"


@router.get("/video/{video_id}")
def stream_video(video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    path = _ensure_file(video.final_video_path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "no-store"})


@router.get("/thumbnail/{video_id}")
def video_thumbnail(video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    path = _ensure_file(video.thumbnail_path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "max-age=300"})


@router.get("/voice/{line_id}")
def voice_audio(line_id: int, db: Session = Depends(get_db)):
    line = db.get(DialogueLine, line_id)
    if not line:
        raise HTTPException(404, "Dialogue line not found.")
    path = _ensure_file(line.audio_path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "no-store"})


@router.get("/music/{asset_id}")
def music_audio(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(AudioAsset, asset_id)
    if not asset:
        raise HTTPException(404, "Audio asset not found.")
    path = _ensure_file(asset.path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "no-store"})


@router.get("/channel-logo/{channel_id}")
def channel_logo(channel_id: int, db: Session = Depends(get_db)):
    channel = db.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    path = _ensure_file(channel.logo_path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "max-age=300"})


@router.get("/subtitle/{video_id}")
def subtitle(video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    path = _ensure_file(video.subtitle_path)
    return FileResponse(path, media_type="application/x-subrip", filename=path.name)


@router.get("/reference/{asset_id}")
def reference_file(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Reference not found.")
    path = _ensure_file(asset.path)
    return FileResponse(path, media_type=_media_type(path), headers={"Cache-Control": "no-store"})
