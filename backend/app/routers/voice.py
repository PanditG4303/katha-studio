from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AudioAsset,
    Character,
    Channel,
    DialogueLine,
    Episode,
    Project,
    Provider,
    Scene,
    VoiceProfile,
)
from ..schemas import (
    DialogueVoiceRequest,
    MusicImportRequest,
    MusicLyricsRequest,
    MusicUpdateRequest,
    VoiceGenerateRequest,
    VoiceProfileCreate,
    VoiceProfileUpdate,
)
from ..serializers import audio_asset_dict, job_dict, voice_profile_dict
from ..services import credentials
from ..services.jobs import submit_job
from ..services.music import run_music_import_job
from ..services.tts import (
    TTSError,
    list_elevenlabs_models,
    list_elevenlabs_voices,
    run_tts_job,
    save_voice_profile,
    voice_provider_options,
)
from ..services.workspace import get_storage_roots
from ..utils import slugify

router = APIRouter(tags=["voice-and-music"])
logger = logging.getLogger(__name__)


@router.get("/voice/providers")
def voice_providers(db: Session = Depends(get_db)):
    options = voice_provider_options(db)
    try:
        options["elevenlabs_connected"] = credentials.has_secret("elevenlabs_api_key")
    except Exception:
        options["elevenlabs_connected"] = False
    return options


@router.get("/voice/elevenlabs/voices")
def elevenlabs_voices(db: Session = Depends(get_db)):
    try:
        return list_elevenlabs_voices(db)
    except TTSError as exc:
        raise HTTPException(400, str(exc))


@router.get("/voice/elevenlabs/models")
def elevenlabs_models(db: Session = Depends(get_db)):
    try:
        return list_elevenlabs_models(db)
    except TTSError as exc:
        raise HTTPException(400, str(exc))


@router.get("/voice/profiles")
def list_voice_profiles(channel_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(VoiceProfile).order_by(VoiceProfile.created_at)
    if channel_id:
        query = query.filter(
            (VoiceProfile.channel_id == channel_id) | (VoiceProfile.channel_id.is_(None))
        )
    return {"profiles": [voice_profile_dict(db, profile) for profile in query.all()]}


@router.post("/voice/profiles", status_code=201)
def create_voice_profile(payload: VoiceProfileCreate, db: Session = Depends(get_db)):
    if payload.channel_id and not db.get(Channel, payload.channel_id):
        raise HTTPException(404, "Channel not found.")
    try:
        profile = save_voice_profile(db, payload.model_dump())
    except TTSError as exc:
        raise HTTPException(400, str(exc))
    return voice_profile_dict(db, profile)


@router.patch("/voice/profiles/{profile_id}")
def update_voice_profile(profile_id: int, payload: VoiceProfileUpdate, db: Session = Depends(get_db)):
    profile = db.get(VoiceProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Voice profile not found.")
    try:
        profile = save_voice_profile(db, payload.model_dump(exclude_unset=True), profile)
    except TTSError as exc:
        raise HTTPException(400, str(exc))
    return voice_profile_dict(db, profile)


@router.delete("/voice/profiles/{profile_id}")
def delete_voice_profile(
    profile_id: int,
    confirm: bool = Query(False),
    db: Session = Depends(get_db),
):
    if not confirm:
        raise HTTPException(400, "Confirm deletion of this voice profile.")
    profile = db.get(VoiceProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Voice profile not found.")
    for channel in db.query(Channel).all():
        if channel.narrator_voice in {profile.name, str(profile.id)}:
            channel.narrator_voice = ""
    db.query(Character).filter(Character.voice_profile_id == profile.id).update({Character.voice_profile_id: None})
    db.query(DialogueLine).filter(DialogueLine.voice_profile_id == profile.id).update({DialogueLine.voice_profile_id: None})
    db.delete(profile)
    db.commit()
    return {"ok": True}


@router.post("/voice/generate", status_code=202)
def generate_voice(payload: VoiceGenerateRequest, db: Session = Depends(get_db)):
    project = db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    if payload.provider == "elevenlabs" and not credentials.has_secret("elevenlabs_api_key"):
        raise HTTPException(400, "ElevenLabs is not connected. Add the API key in Connections & Settings.")
    if payload.voice_profile_id:
        profile = db.get(VoiceProfile, payload.voice_profile_id)
        if not profile:
            raise HTTPException(404, "Voice profile not found.")
        if profile.provider != payload.provider:
            raise HTTPException(400, "The selected voice profile belongs to a different provider.")
    if payload.provider not in {"elevenlabs", "windows_sapi"}:
        raise HTTPException(400, "Unsupported voice provider.")
    job = submit_job(
        db,
        "voice_generation",
        payload.model_dump(),
        run_tts_job,
    )
    return {"job": job_dict(job)}


@router.post("/voice/lines/{line_id}/regenerate", status_code=202)
def regenerate_line(line_id: int, payload: DialogueVoiceRequest, db: Session = Depends(get_db)):
    line = db.get(DialogueLine, line_id)
    if not line:
        raise HTTPException(404, "Dialogue line not found.")
    profile = db.get(VoiceProfile, payload.voice_profile_id)
    if not profile:
        raise HTTPException(404, "Voice profile not found.")
    project = line.scene.episode.project
    provider = payload.provider or profile.provider
    if provider != profile.provider:
        raise HTTPException(400, "The voice profile does not match the selected provider.")
    if provider == "elevenlabs" and not credentials.has_secret("elevenlabs_api_key"):
        raise HTTPException(400, "ElevenLabs is not connected.")
    job = submit_job(
        db,
        "voice_generation",
        {
            "project_id": project.id,
            "provider": provider,
            "voice_profile_id": profile.id,
            "line_ids": [line.id],
            "episode_id": line.scene.episode_id,
            "language": project.language,
            "overwrite": True,
        },
        run_tts_job,
    )
    return {"job": job_dict(job)}


@router.get("/music")
def list_music(
    channel_id: int | None = None,
    project_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(AudioAsset).filter(AudioAsset.kind == "music").order_by(AudioAsset.created_at.desc())
    if channel_id:
        query = query.filter(AudioAsset.channel_id == channel_id)
    if project_id:
        query = query.filter(AudioAsset.project_id == project_id)
    if search:
        query = query.filter(AudioAsset.title.ilike(f"%{search.strip()}%"))
    assets = query.limit(200).all()
    return {"tracks": [audio_asset_dict(asset, db) for asset in assets]}


@router.post("/music/import", status_code=202)
def import_music(payload: MusicImportRequest, db: Session = Depends(get_db)):
    if not Path(payload.path).exists():
        raise HTTPException(400, "The selected audio file could not be found.")
    if payload.channel_id and not db.get(Channel, payload.channel_id):
        raise HTTPException(404, "Channel not found.")
    if payload.project_id and not db.get(Project, payload.project_id):
        raise HTTPException(404, "Project not found.")
    job = submit_job(
        db,
        "music_import",
        payload.model_dump(),
        run_music_import_job,
    )
    return {"job": job_dict(job)}


@router.patch("/music/{asset_id}")
def update_music(asset_id: int, payload: MusicUpdateRequest, db: Session = Depends(get_db)):
    asset = db.get(AudioAsset, asset_id)
    if not asset or asset.kind != "music":
        raise HTTPException(404, "Music track not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(asset, field, value)
    db.commit()
    return audio_asset_dict(asset, db)


@router.post("/music/{asset_id}/lyrics")
def save_lyrics(asset_id: int, payload: MusicLyricsRequest, db: Session = Depends(get_db)):
    asset = db.get(AudioAsset, asset_id)
    if not asset or asset.kind != "music":
        raise HTTPException(404, "Music track not found.")
    cleaned = []
    for entry in payload.lyrics:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        try:
            start = float(entry.get("start", 0))
            end = float(entry.get("end", start + 3))
        except (TypeError, ValueError):
            continue
        cleaned.append({"start": max(0.0, start), "end": max(start + 0.5, end), "text": text})
    asset.lyrics = sorted(cleaned, key=lambda item: item["start"])
    db.commit()
    return {"ok": True, "lyrics": asset.lyrics}
