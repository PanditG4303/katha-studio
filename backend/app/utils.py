from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .database import utcnow


def slugify(value: str, fallback: str = "untitled") -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    if not slug:
        digest = hashlib.sha1((value or fallback).encode("utf-8")).hexdigest()[:8]
        slug = f"{fallback}-{digest}"
    return slug[:100]


def safe_filename(value: str, fallback: str = "file") -> str:
    name = Path(value).name
    stem = Path(name).stem
    suffix = Path(name).suffix.lower()
    stem = re.sub(r"[^A-Za-z0-9_\-\u0900-\u097F]+", "_", stem).strip("_") or fallback
    return f"{stem[:120]}{suffix}"


def unique_path(directory: Path, filename: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    candidate = directory / safe_filename(filename)
    if not candidate.exists():
        return candidate
    stem, suffix = candidate.stem, candidate.suffix
    index = 2
    while True:
        candidate = directory / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def human_duration(seconds: float | int | None) -> str:
    seconds = int(seconds or 0)
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def disk_free_gb(path: Path) -> float:
    try:
        usage = shutil.disk_usage(path)
        return round(usage.free / (1024**3), 2)
    except Exception:
        return 0.0


def ensure_inside(base: Path, candidate: Path) -> bool:
    try:
        base = base.resolve()
        candidate = candidate.resolve()
        return candidate == base or base in candidate.parents
    except Exception:
        return False


def now_stamp() -> str:
    return utcnow().strftime("%Y%m%d-%H%M%S")


def local_display(value: datetime | None) -> str:
    if not value:
        return ""
    return value.strftime("%d %b %Y, %I:%M %p")


def normalize_path(value: str) -> str:
    return os.path.normpath(os.path.abspath(os.path.expanduser(value)))
