from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Channel, ContentIdea, IdeationSession
from . import ai
from .content_inputs import collect_reference_notes, collect_source_text
from .demo import DEMO_IDEAS, DEMO_LABEL
from .prompts import ideation_prompt

logger = logging.getLogger(__name__)


def run_ideation_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    session_id = int(payload["session_id"])
    with SessionLocal() as db:
        session = db.get(IdeationSession, session_id)
        if not session:
            raise ValueError("The content planning session no longer exists.")
        channel = db.get(Channel, session.channel_id)
        if not channel:
            raise ValueError("The selected channel no longer exists.")
        request = dict(session.request or {})
        try:
            progress(8, "Reading your source material…")
            source_text = collect_source_text(db, request.get("asset_ids", []), request.get("input_text", ""))
            reference_notes = collect_reference_notes(db, request.get("asset_ids", []), request.get("reference_urls", []))
            progress(22, "Evaluating the best content structure…")

            if session.is_demo or request.get("demo"):
                ideas = _demo_ideas(int(request.get("video_count", 5)))
                session.analysis = (
                    "Offline demo mode. This plan is fictional sample material, clearly labelled as demo content. "
                    "It exercises the full Katha Studio workflow without an external AI provider."
                )
                session.suggested_structure = (
                    "Two demo concepts: a connected two-part shadow-puppet story and an independent single-episode story."
                )
                provider_name, model_name = "demo", DEMO_LABEL
                progress(70, "Preparing demo concepts…")
            else:
                channel_data = {
                    "name": channel.name,
                    "description": channel.description,
                    "category": channel.category,
                    "language": channel.language,
                    "animation_style": channel.animation_style,
                    "music_preferences": channel.music_preferences,
                    "typography": channel.typography,
                }
                system, user = ideation_prompt(request, channel_data, source_text, reference_notes)
                data = ai.generate_json(
                    db,
                    request.get("provider"),
                    request.get("model"),
                    system,
                    user,
                    temperature=0.85,
                    max_tokens=9000,
                )
                progress(72, "Saving your content ideas…")
                ideas = _normalize_ideas(data.get("ideas") or [])
                session.analysis = str(data.get("analysis") or "")[:5000]
                session.suggested_structure = str(data.get("suggested_structure") or "")[:3000]
                meta = data.get("_meta", {})
                provider_name = meta.get("provider", request.get("provider") or "zen")
                model_name = meta.get("model", request.get("model") or "")

            if not ideas:
                raise ai.AIError("The provider returned no usable ideas. Try a more specific request or another model.")
            max_ideas = int(request.get("video_count", 5))
            ideas = ideas[:max_ideas]
            for idea_data in ideas:
                check_cancel()
                idea = ContentIdea(
                    session_id=session.id,
                    title=str(idea_data.get("title") or "Untitled idea")[:300],
                    short_description=str(idea_data.get("short_description") or ""),
                    hook=str(idea_data.get("hook") or ""),
                    story_premise=str(idea_data.get("story_premise") or ""),
                    why_interesting=str(idea_data.get("why_interesting") or ""),
                    estimated_duration=_as_int(idea_data.get("estimated_duration_seconds"), 600),
                    episode_count=max(1, min(30, _as_int(idea_data.get("suggested_episode_count"), 1))),
                    visual_potential=str(idea_data.get("visual_potential") or ""),
                    source_status=str(idea_data.get("source_status") or "Needs research"),
                    raw=idea_data,
                )
                db.add(idea)
            session.status = "ready"
            session.provider = provider_name
            session.model = model_name
            session.error = ""
            db.commit()
            progress(100, "Ideas ready for review")
            return {
                "session_id": session.id,
                "idea_count": len(ideas),
                "provider": provider_name,
                "model": model_name,
                "is_demo": session.is_demo,
            }
        except Exception as exc:
            session.status = "failed"
            session.error = str(exc)[:3000]
            db.commit()
            raise


def _normalize_ideas(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    ideas = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        ideas.append(
            {
                **item,
                "title": title,
                "short_description": str(item.get("short_description") or item.get("description") or ""),
                "hook": str(item.get("hook") or ""),
                "story_premise": str(item.get("story_premise") or item.get("premise") or ""),
                "why_interesting": str(item.get("why_interesting") or ""),
                "estimated_duration_seconds": _as_int(
                    item.get("estimated_duration_seconds") or item.get("estimated_duration"), 600
                ),
                "suggested_episode_count": _as_int(item.get("suggested_episode_count"), 1),
                "visual_potential": str(item.get("visual_potential") or ""),
                "source_status": str(item.get("source_status") or "Needs research"),
            }
        )
    return ideas


def _demo_ideas(count: int) -> list[dict]:
    ideas = []
    for item in DEMO_IDEAS[: max(1, count)]:
        ideas.append({**item, "demo": True, "source_status": f"DEMO ONLY — {item['source_status']}"})
    return ideas


def _as_int(value: Any, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default
