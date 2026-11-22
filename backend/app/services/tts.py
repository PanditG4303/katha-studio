from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.orm import Session

from ..config import SAPI_SCRIPT, config
from ..database import SessionLocal, utcnow
from ..models import (
    AudioAsset,
    Channel,
    Character,
    DialogueLine,
    Episode,
    Project,
    Provider,
    Scene,
    Video,
    VoiceProfile,
)
from ..utils import safe_filename, slugify, write_json
from . import credentials
from .ffmpeg import convert_to_mp3, probe
from .workspace import get_storage_roots

logger = logging.getLogger(__name__)


class TTSError(RuntimeError):
    pass


def _provider_key(db: Session, provider: str) -> str | None:
    row = db.query(Provider).filter(Provider.provider == provider).first()
    if not row or not row.credential_ref:
        return None
    return credentials.get_secret(row.credential_ref)


def list_elevenlabs_voices(db: Session) -> dict:
    key = _provider_key(db, "elevenlabs")
    if not key:
        raise TTSError("Connect ElevenLabs in Connections & Settings first.")
    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": key},
            )
    except httpx.HTTPError as exc:
        raise TTSError(f"Could not reach ElevenLabs: {exc}") from exc
    if response.status_code >= 400:
        raise TTSError(_elevenlabs_error(response))
    data = response.json()
    voices = []
    for voice in data.get("voices", []):
        labels = voice.get("labels") or {}
        voices.append(
            {
                "voice_id": voice.get("voice_id"),
                "name": voice.get("name"),
                "category": voice.get("category"),
                "description": voice.get("description") or "",
                "labels": labels,
                "preview_url": voice.get("preview_url"),
            }
        )
    return {"provider": "elevenlabs", "voices": voices, "count": len(voices)}


def list_elevenlabs_models(db: Session) -> dict:
    key = _provider_key(db, "elevenlabs")
    if not key:
        raise TTSError("Connect ElevenLabs in Connections & Settings first.")
    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                "https://api.elevenlabs.io/v1/models",
                headers={"xi-api-key": key},
            )
    except httpx.HTTPError as exc:
        raise TTSError(f"Could not reach ElevenLabs: {exc}") from exc
    if response.status_code >= 400:
        raise TTSError(_elevenlabs_error(response))
    models = []
    for model in response.json():
        models.append(
            {
                "model_id": model.get("model_id"),
                "name": model.get("name"),
                "description": model.get("description"),
                "languages": model.get("languages") or [],
                "can_do_text_to_speech": model.get("can_do_text_to_speech", True),
            }
        )
    return {"provider": "elevenlabs", "models": models}


def windows_voices() -> list[dict]:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell or not SAPI_SCRIPT.exists():
        return []
    try:
        result = subprocess.run(
            [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SAPI_SCRIPT), "-ListVoices"],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode != 0:
            return []
        data = json.loads(result.stdout.strip() or "[]")
        if isinstance(data, dict):
            data = [data]
        return data
    except Exception:
        logger.exception("Could not list Windows speech voices")
        return []


def voice_provider_options(db: Session) -> dict:
    eleven = credentials.has_secret("elevenlabs_api_key")
    windows = windows_voices()
    return {
        "providers": [
            {
                "id": "elevenlabs",
                "label": "ElevenLabs",
                "connected": eleven,
                "requires_profile": True,
                "description": "Premium multilingual voices. Requires an API key and a selected voice.",
            },
            {
                "id": "windows_sapi",
                "label": "Windows Local Voice",
                "connected": bool(windows),
                "requires_profile": False,
                "description": "Offline Windows speech voices. Useful as a fallback; quality depends on installed language packs.",
                "voices": windows,
            },
        ]
    }


def synthesize_elevenlabs(
    db: Session,
    profile: VoiceProfile,
    text: str,
    output_path: Path,
    language: str,
    model_override: str | None = None,
) -> None:
    key = _provider_key(db, "elevenlabs")
    if not key:
        raise TTSError("ElevenLabs is not connected. Add the API key in Connections & Settings.")
    if not profile.provider_voice_id:
        raise TTSError(f"Voice profile “{profile.name}” has no ElevenLabs voice selected.")
    provider = db.query(Provider).filter(Provider.provider == "elevenlabs").first()
    model_id = model_override or profile.model_id or (provider.default_model if provider else "")
    if not model_id:
        raise TTSError("Choose an ElevenLabs model in Connections or in the voice profile.")
    settings = profile.settings or {}
    voice_settings: dict[str, Any] = {}
    for key_name, api_name in [
        ("stability", "stability"),
        ("similarity_boost", "similarity_boost"),
        ("similarity", "similarity_boost"),
        ("style", "style"),
        ("use_speaker_boost", "use_speaker_boost"),
        ("speed", "speed"),
    ]:
        if key_name in settings and settings[key_name] is not None:
            voice_settings[api_name] = settings[key_name]
    body: dict[str, Any] = {
        "text": text,
        "model_id": model_id,
        "voice_settings": voice_settings or {"stability": 0.5, "similarity_boost": 0.75},
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {"xi-api-key": key, "Accept": "audio/mpeg", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=180) as client:
            response = client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{profile.provider_voice_id}",
                headers=headers,
                json=body,
            )
    except httpx.HTTPError as exc:
        raise TTSError(f"Could not reach ElevenLabs: {exc}") from exc
    if response.status_code >= 400:
        raise TTSError(_elevenlabs_error(response))
    if not response.content or len(response.content) < 500:
        raise TTSError("ElevenLabs returned an empty audio response.")
    output_path.write_bytes(response.content)


def synthesize_windows(
    profile: VoiceProfile | None,
    text: str,
    output_path: Path,
) -> Path:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        raise TTSError("Windows PowerShell is required for the local voice provider.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wav_path = output_path.with_suffix(".wav")
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(text)
        text_file = Path(handle.name)
    settings = profile.settings if profile else {}
    rate = int(settings.get("rate", 0)) if isinstance(settings, dict) else 0
    voice_name = profile.provider_voice_id if profile else ""
    try:
        command = [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SAPI_SCRIPT),
            "-TextFile",
            str(text_file),
            "-OutputFile",
            str(wav_path),
            "-Rate",
            str(max(-10, min(10, rate))),
        ]
        if voice_name:
            command.extend(["-Voice", voice_name])
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=180,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode != 0 or not wav_path.exists():
            detail = (result.stderr or result.stdout or "").strip()[-800:]
            raise TTSError(f"Windows voice generation failed. {detail}")
        try:
            final = convert_to_mp3(wav_path, output_path.with_suffix(".mp3"))
            wav_path.unlink(missing_ok=True)
            return final
        except Exception:
            return wav_path
    finally:
        text_file.unlink(missing_ok=True)


def _elevenlabs_error(response: httpx.Response) -> str:
    detail = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            detail_obj = payload.get("detail")
            if isinstance(detail_obj, dict):
                detail = detail_obj.get("message") or detail_obj.get("status") or ""
            elif detail_obj:
                detail = str(detail_obj)
            elif payload.get("message"):
                detail = str(payload["message"])
    except Exception:
        detail = response.text[:300]
    if response.status_code == 401:
        return "ElevenLabs rejected the API key. Check it in Connections & Settings."
    if response.status_code == 402:
        return "ElevenLabs reports that this account's plan or character limit does not allow this request. Check your ElevenLabs subscription or use the Windows local voice."
    if response.status_code == 429:
        return "ElevenLabs rate limit reached. Wait and retry, or use the Windows local voice."
    return f"ElevenLabs request failed ({response.status_code}). {detail}".strip()


def resolve_voice_profile(
    db: Session,
    line: DialogueLine,
    project: Project,
    channel: Channel,
    provider: str,
    requested_profile_id: int | None,
) -> VoiceProfile | None:
    if requested_profile_id:
        profile = db.get(VoiceProfile, requested_profile_id)
        if not profile:
            raise TTSError("The selected voice profile no longer exists.")
        return profile
    if line.voice_profile_id:
        profile = db.get(VoiceProfile, line.voice_profile_id)
        if profile:
            return profile
    character = (
        db.query(Character)
        .filter(Character.project_id == project.id, Character.name == line.speaker)
        .first()
    )
    if character and character.voice_profile_id:
        profile = db.get(VoiceProfile, character.voice_profile_id)
        if profile:
            return profile
    if channel.narrator_voice:
        try:
            narrator_id = int(channel.narrator_voice)
            profile = db.get(VoiceProfile, narrator_id)
            if profile:
                return profile
        except (TypeError, ValueError):
            profile = (
                db.query(VoiceProfile)
                .filter(
                    VoiceProfile.channel_id == channel.id,
                    VoiceProfile.name == channel.narrator_voice,
                    VoiceProfile.provider == provider,
                )
                .first()
            )
            if profile:
                return profile
    profile = (
        db.query(VoiceProfile)
        .filter(
            VoiceProfile.channel_id == channel.id,
            VoiceProfile.provider == provider,
            VoiceProfile.role.in_(["Main narrator", "Narrator"]),
        )
        .first()
    )
    if profile:
        return profile
    if provider == "windows_sapi":
        return (
            db.query(VoiceProfile)
            .filter(VoiceProfile.channel_id == channel.id, VoiceProfile.provider == provider)
            .first()
        )
    return None


def run_tts_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    project_id = int(payload["project_id"])
    provider = payload.get("provider") or "elevenlabs"
    overwrite = bool(payload.get("overwrite"))
    requested_profile_id = payload.get("voice_profile_id")
    line_ids = payload.get("line_ids")
    episode_id = payload.get("episode_id")
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if not project:
            raise ValueError("Project not found.")
        channel = db.get(Channel, project.channel_id)
        if not channel:
            raise ValueError("Channel not found.")
        query = (
            db.query(DialogueLine)
            .join(Scene, DialogueLine.scene_id == Scene.id)
            .join(Episode, Scene.episode_id == Episode.id)
            .filter(Episode.project_id == project.id)
            .order_by(Episode.episode_number, Scene.scene_number, DialogueLine.line_order)
        )
        if episode_id:
            query = query.filter(Episode.id == int(episode_id))
        if line_ids:
            query = query.filter(DialogueLine.id.in_([int(v) for v in line_ids]))
        if not overwrite:
            query = query.filter(DialogueLine.audio_status != "ready")
        lines = query.all()
        if not lines:
            return {
                "message": "Every selected dialogue line already has audio.",
                "generated": 0,
                "failed": 0,
                "skipped": True,
            }
        roots = get_storage_roots(db)
        staging_root = Path(roots["workspace_root"]) / "Projects" / channel.slug / project.slug / "AUDIO"
        generated = 0
        failures = []
        total = len(lines)
        provider_row = db.query(Provider).filter(Provider.provider == provider).first()
        if provider == "elevenlabs" and not credentials.has_secret("elevenlabs_api_key"):
            raise TTSError("ElevenLabs is not connected. Add its API key in Connections & Settings.")
        for index, line in enumerate(lines):
            check_cancel()
            scene = db.get(Scene, line.scene_id)
            episode = db.get(Episode, scene.episode_id) if scene else None
            if not scene or not episode:
                continue
            progress(
                (index / total) * 100,
                f"Voicing scene {scene.scene_number}, line {line.line_order} ({index + 1}/{total})…",
            )
            profile = resolve_voice_profile(db, line, project, channel, provider, requested_profile_id)
            if provider == "elevenlabs" and not profile:
                error = "No ElevenLabs voice profile is assigned. Choose a voice in Voice & Music Lab."
                line.audio_status = "failed"
                line.audio_error = error
                failures.append({"line_id": line.id, "error": error})
                db.commit()
                continue
            if provider != "windows_sapi" and provider != "elevenlabs":
                raise TTSError(f"Unsupported voice provider: {provider}")
            speaker_slug = slugify(line.speaker, "speaker")
            filename = (
                f"part_{episode.episode_number:02d}_scene_{scene.scene_number:02d}_"
                f"{speaker_slug}_{line.line_order:02d}.mp3"
            )
            output_dir = staging_root / f"PART_{episode.episode_number:02d}"
            output_path = output_dir / filename
            try:
                if provider == "elevenlabs":
                    assert profile is not None
                    synthesize_elevenlabs(
                        db,
                        profile,
                        line.text,
                        output_path,
                        payload.get("language") or project.language,
                        payload.get("model_id"),
                    )
                else:
                    output_path = synthesize_windows(profile, line.text, output_path)
                info = probe(output_path)
                duration = float(info.get("duration") or 0)
                line.audio_path = str(output_path)
                line.audio_duration = round(duration, 3)
                line.audio_status = "ready"
                line.audio_error = ""
                line.provider = provider
                if profile:
                    line.voice_profile_id = profile.id
                asset = db.query(AudioAsset).filter(AudioAsset.path == str(output_path)).first()
                if not asset:
                    asset = AudioAsset(
                        channel_id=channel.id,
                        project_id=project.id,
                        episode_id=episode.id,
                        kind="voice",
                        title=f"Part {episode.episode_number} · Scene {scene.scene_number} · {line.speaker}",
                        path=str(output_path),
                        rights_note="Generated voiceover for this project.",
                    )
                    db.add(asset)
                asset.duration = round(duration, 3)
                asset.metadata_json = {
                    "dialogue_line_id": line.id,
                    "speaker": line.speaker,
                    "provider": provider,
                    "voice_profile": profile.name if profile else "Windows default",
                    "scene": scene.scene_number,
                    "episode": episode.episode_number,
                }
                db.commit()
                generated += 1
            except Exception as exc:
                logger.exception("Voice generation failed for line %s", line.id)
                line.audio_status = "failed"
                line.audio_error = str(exc)[:1500]
                failures.append({"line_id": line.id, "error": str(exc)[:1500]})
                db.commit()
        # Update project/video status from actual line states.
        _refresh_voice_status(db, project, channel)
        progress(100, "Voice generation finished")
        return {
            "generated": generated,
            "failed": len(failures),
            "failures": failures,
            "staging_audio": str(staging_root),
            "message": (
                f"Generated {generated} audio clip(s). {len(failures)} failed."
                if failures
                else f"Generated {generated} audio clip(s)."
            ),
            "partial": bool(failures and generated),
        }


def _refresh_voice_status(db: Session, project: Project, channel: Channel) -> None:
    episodes = db.query(Episode).filter(Episode.project_id == project.id).all()
    all_ready = True
    any_ready = False
    for episode in episodes:
        lines = (
            db.query(DialogueLine)
            .join(Scene, DialogueLine.scene_id == Scene.id)
            .filter(Scene.episode_id == episode.id)
            .all()
        )
        ready = bool(lines) and all(line.audio_status == "ready" for line in lines)
        if ready:
            any_ready = True
            episode.status = "VOICE_READY"
            video = db.query(Video).filter(Video.episode_id == episode.id).first()
            if video and video.production_status in {"AWAITING_VOICE", "SCRIPT_READY", "VOICE_READY"}:
                video.production_status = "VOICE_READY"
                video.audio_path = str(Path(lines[0].audio_path).parent) if lines and lines[0].audio_path else video.audio_path
        else:
            all_ready = False
    if all_ready and episodes:
        project.status = "VOICE_READY"
    elif any_ready:
        project.status = "AWAITING_VOICE"
    db.commit()


def save_voice_profile(db: Session, data: dict, profile: VoiceProfile | None = None) -> VoiceProfile:
    if data.get("provider") not in {"elevenlabs", "windows_sapi"}:
        raise TTSError("Unsupported voice provider.")
    if profile is None:
        profile = VoiceProfile()
        db.add(profile)
    for field in [
        "channel_id",
        "name",
        "role",
        "provider",
        "provider_voice_id",
        "model_id",
        "language",
        "settings",
        "description",
        "is_demo",
    ]:
        if field in data and data[field] is not None:
            setattr(profile, field, data[field])
    if not profile.name:
        raise TTSError("Give this voice profile a name.")
    db.commit()
    db.refresh(profile)
    return profile


def preview_line_audio_path(db: Session, line_id: int) -> Path | None:
    line = db.get(DialogueLine, line_id)
    if line and line.audio_path and Path(line.audio_path).exists():
        return Path(line.audio_path)
    return None


def regenerate_single_line(
    db: Session, line: DialogueLine, profile: VoiceProfile, provider: str, output_path: Path
) -> Path:
    if provider == "elevenlabs":
        synthesize_elevenlabs(db, profile, line.text, output_path, line.scene.episode.project.language)
        return output_path
    return synthesize_windows(profile, line.text, output_path)
