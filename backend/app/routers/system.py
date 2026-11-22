from __future__ import annotations

import logging
import os
import platform
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..config import APP_NAME, APP_VERSION, DB_PATH, LOG_DIR, config
from ..database import SessionLocal, backup_database, get_db
from ..models import AppSetting, Channel, JobRecord, Project, Provider, Video
from ..schemas import CredentialRequest, GeneralSettings, ProviderTestRequest, ProviderUpdate, StorageSettings
from ..serializers import channel_dict, job_dict
from ..services import ai, credentials
from ..services.claude import detect_claude
from ..services.ffmpeg import tools_status
from ..services.jobs import job_to_dict, request_cancel
from ..services.tts import windows_voices
from ..services.workspace import get_storage_roots
from ..utils import disk_free_gb, iso

router = APIRouter(tags=["system"])
logger = logging.getLogger(__name__)


def _setting(db: Session, key: str, default=None):
    row = db.get(AppSetting, key)
    return row.value if row else default


def _provider_payload(db: Session, row: Provider) -> dict:
    key_ref = row.credential_ref
    return {
        "provider": row.provider,
        "label": row.label,
        "enabled": row.enabled,
        "base_url": row.base_url,
        "models_url": row.models_url,
        "default_model": row.default_model,
        "config": row.config or {},
        "status": row.status,
        "last_tested_at": iso(row.last_tested_at),
        "last_error": row.last_error,
        "credential_status": credentials.credential_status(key_ref) if key_ref else "not_required",
    }


@router.get("/health")
def health():
    return {"ok": True, "app": APP_NAME, "version": APP_VERSION, "time": datetime.now().isoformat()}


@router.get("/system/info")
def system_info(db: Session = Depends(get_db)):
    tools = tools_status()
    return {
        "app": APP_NAME,
        "version": APP_VERSION,
        "platform": platform.platform(),
        "python": platform.python_version(),
        "data_dir": str(config.data_dir),
        "database_path": str(DB_PATH),
        "log_dir": str(LOG_DIR),
        "workspace_dir": str(config.workspace_dir),
        "storage_roots": get_storage_roots(db),
        "media_tools": tools,
        "disk_free_gb": disk_free_gb(config.workspace_dir),
        "keyring": "available" if credentials.credential_status("katha_probe") != "unavailable" else "unavailable",
        "claude": detect_claude(),
        "windows_voices": windows_voices(),
        "counts": {
            "channels": db.query(func.count(Channel.id)).scalar() or 0,
            "projects": db.query(func.count(Project.id)).scalar() or 0,
            "videos": db.query(func.count(Video.id)).scalar() or 0,
        },
    }


@router.get("/system/providers")
def list_providers(db: Session = Depends(get_db)):
    rows = db.query(Provider).order_by(Provider.provider).all()
    return {"providers": [_provider_payload(db, row) for row in rows]}


@router.patch("/system/providers/{provider_name}")
def update_provider(provider_name: str, payload: ProviderUpdate, db: Session = Depends(get_db)):
    row = db.query(Provider).filter(Provider.provider == provider_name).first()
    if not row:
        raise HTTPException(404, "Provider not found.")
    for field in ["enabled", "default_model", "base_url", "models_url"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(row, field, value)
    db.commit()
    return _provider_payload(db, row)


@router.post("/system/providers/test")
def test_provider(payload: ProviderTestRequest, db: Session = Depends(get_db)):
    try:
        result = ai.test_provider(db, payload.provider)
        return {"ok": True, **result}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.get("/system/providers/{provider_name}/models")
def provider_models(provider_name: str, db: Session = Depends(get_db)):
    try:
        return ai.list_models(db, provider_name)
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.post("/system/credentials")
def save_credential(payload: CredentialRequest, db: Session = Depends(get_db)):
    row = db.query(Provider).filter(Provider.provider == payload.provider).first()
    if not row:
        raise HTTPException(404, "Provider not found.")
    if not payload.value.strip():
        raise HTTPException(400, "Enter a credential value.")
    try:
        credentials.set_secret(row.credential_ref or f"{row.provider}_api_key", payload.value.strip())
    except credentials.CredentialError as exc:
        raise HTTPException(500, str(exc))
    row.status = "configured"
    row.last_error = ""
    db.commit()
    return {"ok": True, "provider": row.provider, "credential_status": "configured"}


@router.delete("/system/credentials/{provider_name}")
def remove_credential(provider_name: str, db: Session = Depends(get_db)):
    row = db.query(Provider).filter(Provider.provider == provider_name).first()
    if not row:
        raise HTTPException(404, "Provider not found.")
    credentials.delete_secret(row.credential_ref or f"{row.provider}_api_key")
    row.status = "not_configured"
    row.last_error = ""
    db.commit()
    return {"ok": True, "provider": row.provider, "credential_status": "not_configured"}


@router.get("/system/settings")
def get_settings(db: Session = Depends(get_db)):
    keys = [
        "storage_roots",
        "watcher_enabled",
        "watcher_interval_seconds",
        "timezone",
        "default_provider",
        "default_language",
        "youtube_category",
        "onboarding_complete",
    ]
    settings = {key: _setting(db, key) for key in keys}
    settings["media_tools"] = tools_status()
    return settings


@router.put("/system/settings/storage")
def update_storage(payload: StorageSettings, db: Session = Depends(get_db)):
    roots = get_storage_roots(db)
    for field in ["workspace_root", "channels_root", "packages_root", "outputs_root", "assets_root", "music_root", "imports_root"]:
        value = getattr(payload, field)
        if value:
            path = Path(value).expanduser()
            if not path.is_absolute():
                raise HTTPException(400, "Storage folders must use absolute paths.")
            try:
                path.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise HTTPException(400, f"Could not create {path}: {exc}")
            roots[field] = str(path.resolve())
    setting = db.get(AppSetting, "storage_roots") or AppSetting(key="storage_roots")
    setting.value = roots
    db.add(setting)
    if payload.watcher_enabled is not None:
        row = db.get(AppSetting, "watcher_enabled") or AppSetting(key="watcher_enabled")
        row.value = payload.watcher_enabled
        db.add(row)
    if payload.watcher_interval_seconds is not None:
        row = db.get(AppSetting, "watcher_interval_seconds") or AppSetting(key="watcher_interval_seconds")
        row.value = payload.watcher_interval_seconds
        db.add(row)
    for field in ["timezone", "default_provider", "default_language"]:
        value = getattr(payload, field)
        if value:
            row = db.get(AppSetting, field) or AppSetting(key=field)
            row.value = value
            db.add(row)
    db.commit()
    return {"ok": True, "storage_roots": roots}


@router.put("/system/settings/general")
def update_general(payload: GeneralSettings, db: Session = Depends(get_db)):
    for field in ["youtube_category", "onboarding_complete"]:
        value = getattr(payload, field)
        if value is not None:
            row = db.get(AppSetting, field) or AppSetting(key=field)
            row.value = value
            db.add(row)
    db.commit()
    return {"ok": True}


@router.get("/system/jobs")
def list_jobs(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(JobRecord).order_by(JobRecord.created_at.desc())
    if status:
        query = query.filter(JobRecord.status == status)
    jobs = query.limit(limit).all()
    return {"jobs": [job_dict(job) for job in jobs]}


@router.get("/system/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(JobRecord, job_id)
    if not job:
        raise HTTPException(404, "Job not found.")
    return job_dict(job)


@router.post("/system/jobs/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db)):
    try:
        job = request_cancel(db, job_id)
        return job_dict(job)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/system/backups")
def create_backup():
    path = backup_database("manual")
    if not path:
        raise HTTPException(500, "Backup could not be created.")
    return {"ok": True, "path": str(path), "name": path.name}


@router.get("/system/backups")
def list_backups():
    config.backup_dir.mkdir(parents=True, exist_ok=True)
    backups = sorted(config.backup_dir.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {
        "backups": [
            {
                "name": path.name,
                "path": str(path),
                "size": path.stat().st_size,
                "created_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            }
            for path in backups[:20]
        ]
    }


@router.get("/system/logs")
def get_logs(lines: int = Query(200, ge=10, le=2000)):
    log_path = LOG_DIR / "katha-backend.log"
    if not log_path.exists():
        return {"lines": [], "path": str(log_path)}
    try:
        content = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        content = []
    return {"lines": content[-lines:], "path": str(log_path)}


@router.get("/system/claude")
def claude_status():
    return detect_claude()


@router.get("/system/diagnostics")
def diagnostics(db: Session = Depends(get_db)):
    checks = []
    tools = tools_status()
    checks.append({"name": "FFmpeg", "ok": tools["ffmpeg_available"], "detail": tools["ffmpeg"] or "Not found"})
    checks.append({"name": "FFprobe", "ok": tools["ffprobe_available"], "detail": tools["ffprobe"] or "Not found"})
    checks.append(
        {
            "name": "Windows Credential Manager",
            "ok": credentials.credential_status("katha_probe") != "unavailable",
            "detail": "Used for API keys and OAuth tokens.",
        }
    )
    try:
        with SessionLocal() as probe:
            probe.execute(text("SELECT 1"))
        checks.append({"name": "SQLite database", "ok": True, "detail": str(DB_PATH)})
    except Exception as exc:
        checks.append({"name": "SQLite database", "ok": False, "detail": str(exc)})
    free = disk_free_gb(config.workspace_dir)
    checks.append({"name": "Disk space", "ok": free > 1.0, "detail": f"{free} GB free"})
    claude = detect_claude()
    checks.append(
        {
            "name": "Claude Code CLI",
            "ok": claude["cli"]["installed"],
            "detail": claude["cli"]["version"] or claude["cli"]["error"] or "Not detected",
        }
    )
    checks.append(
        {
            "name": "Claude Desktop",
            "ok": claude["desktop"]["installed"],
            "detail": claude["desktop"]["path"] or "Not detected",
        }
    )
    for provider in db.query(Provider).filter(Provider.provider.in_(["zen", "openrouter", "elevenlabs"])).all():
        configured = credentials.has_secret(provider.credential_ref) if provider.credential_ref else False
        checks.append(
            {
                "name": provider.label,
                "ok": configured and provider.status != "error",
                "detail": "Connected" if configured and provider.status != "error" else provider.last_error or "Not connected",
            }
        )
    return {
        "checks": checks,
        "all_critical_ok": all(check["ok"] for check in checks[:4]),
        "time": datetime.now().isoformat(),
    }
