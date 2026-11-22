from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Channel, Video
from . import ai
from .prompts import metadata_prompt

logger = logging.getLogger(__name__)


def run_metadata_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    with SessionLocal() as db:
        video = db.get(Video, int(payload["video_id"]))
        if not video:
            raise ValueError("Video not found.")
        channel = db.get(Channel, video.channel_id) if video.channel_id else None
        progress(15, "Preparing publishing metadata…")
        system, user = metadata_prompt(
            {
                "title": video.title,
                "description": video.description,
                "category": video.category,
                "duration": video.duration,
                "language": channel.language if channel else "Hindi",
                "project": video.project_title if hasattr(video, "project_title") else "",
            },
            {
                "name": channel.name if channel else "",
                "description": channel.description if channel else "",
                "language": channel.language if channel else "",
                "category": channel.category if channel else "",
            },
            payload.get("platform") or "youtube",
        )
        data = ai.generate_json(
            db,
            payload.get("provider"),
            payload.get("model"),
            system,
            user,
            temperature=0.55,
            max_tokens=2500,
        )
        progress(90, "Metadata prepared for review…")
        meta = data.pop("_meta", {})
        return {
            "title": str(data.get("title") or video.title)[:100],
            "description": str(data.get("description") or video.description or "")[:5000],
            "hashtags": data.get("hashtags") or [],
            "tags": data.get("tags") or [],
            "caption": str(data.get("caption") or ""),
            "suggested_time": str(data.get("suggested_time") or ""),
            "provider": meta.get("provider"),
            "model": meta.get("model"),
            "applied": False,
            "note": "Review these suggestions, then save them to the video before uploading.",
        }
