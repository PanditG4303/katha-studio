from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from .config import DEFAULT_DIRS, config
from .models import AppSetting, Provider


def seed_defaults(db: Session) -> None:
    providers = [
        {
            "provider": "zen",
            "label": "OpenCode Zen",
            "enabled": True,
            "base_url": "https://opencode.ai/inference/openai/v1",
            "models_url": "https://opencode.ai/inference/v1/models",
            "credential_ref": "zen_api_key",
        },
        {
            "provider": "openrouter",
            "label": "OpenRouter",
            "enabled": True,
            "base_url": "https://openrouter.ai/api/v1",
            "models_url": "https://openrouter.ai/api/v1/models",
            "credential_ref": "openrouter_api_key",
        },
        {
            "provider": "elevenlabs",
            "label": "ElevenLabs",
            "enabled": True,
            "base_url": "https://api.elevenlabs.io/v1",
            "models_url": "https://api.elevenlabs.io/v1/models",
            "credential_ref": "elevenlabs_api_key",
        },
        {
            "provider": "windows_sapi",
            "label": "Windows Local Voice",
            "enabled": True,
            "base_url": "",
            "models_url": "",
            "credential_ref": "",
            "config": {"note": "Uses installed Windows voices. Works offline; voice quality varies."},
        },
    ]
    for item in providers:
        existing = db.query(Provider).filter(Provider.provider == item["provider"]).first()
        if not existing:
            db.add(Provider(**item))

    settings = {
        "storage_roots": {
            "workspace_root": str(config.workspace_dir),
            "channels_root": str(DEFAULT_DIRS["channels_root"]),
            "packages_root": str(DEFAULT_DIRS["packages_root"]),
            "outputs_root": str(DEFAULT_DIRS["outputs_root"]),
            "assets_root": str(DEFAULT_DIRS["assets_root"]),
            "music_root": str(DEFAULT_DIRS["music_root"]),
            "imports_root": str(DEFAULT_DIRS["imports_root"]),
        },
        "watcher_enabled": True,
        "watcher_interval_seconds": 20,
        "timezone": "local",
        "theme": "light",
        "default_provider": "zen",
        "default_language": "Hindi",
        "youtube_category": "24",
        "onboarding_complete": False,
    }
    for key, value in settings.items():
        if not db.query(AppSetting).filter(AppSetting.key == key).first():
            db.add(AppSetting(key=key, value=value))
    db.commit()

    for path in DEFAULT_DIRS.values():
        Path(path).mkdir(parents=True, exist_ok=True)
