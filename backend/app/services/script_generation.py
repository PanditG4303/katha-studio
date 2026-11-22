from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import (
    Channel,
    Character,
    ContentIdea,
    DialogueLine,
    Episode,
    IdeationSession,
    Project,
    Scene,
    Video,
)
from ..utils import slugify
from . import ai
from .content_inputs import collect_source_text
from .demo import DEMO_BLUEPRINT, DEMO_EPISODES, DEMO_LABEL
from .prompts import blueprint_prompt, episode_prompt

logger = logging.getLogger(__name__)


def run_script_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    idea_ids = [int(value) for value in payload.get("idea_ids", [])]
    if not idea_ids:
        raise ValueError("Select at least one idea.")
    results = []
    errors = []
    total = len(idea_ids)
    for index, idea_id in enumerate(idea_ids):
        check_cancel()
        base_progress = (index / total) * 100
        span = 100 / total
        try:
            with SessionLocal() as db:
                idea = db.get(ContentIdea, idea_id)
                if not idea:
                    raise ValueError("An approved idea no longer exists.")
                if idea.project_id:
                    results.append({"idea_id": idea.id, "project_id": idea.project_id, "skipped": True})
                    continue
                session = db.get(IdeationSession, idea.session_id)
                if not session:
                    raise ValueError("The planning session for this idea no longer exists.")
                channel = db.get(Channel, session.channel_id)
                if not channel:
                    raise ValueError("The channel for this idea no longer exists.")
                request = dict(session.request or {})
                provider = payload.get("provider") or session.provider or request.get("provider")
                model = payload.get("model") or session.model or request.get("model")
                progress(
                    base_progress + span * 0.08,
                    f"Developing “{idea.title}” ({index + 1} of {total})…",
                )
                if session.is_demo or request.get("demo"):
                    project = _build_demo_project(db, idea, session, channel, request)
                else:
                    project = _build_ai_project(
                        db,
                        idea,
                        session,
                        channel,
                        request,
                        provider,
                        model,
                        progress=lambda value, message: progress(
                            base_progress + span * (0.08 + 0.88 * value / 100), message
                        ),
                        check_cancel=check_cancel,
                    )
                idea.selected = True
                idea.project_id = project.id
                db.commit()
                results.append(
                    {
                        "idea_id": idea.id,
                        "project_id": project.id,
                        "title": project.title,
                        "episodes": len(project.episodes),
                    }
                )
        except Exception as exc:
            logger.exception("Script generation failed for idea %s", idea_id)
            errors.append({"idea_id": idea_id, "error": str(exc)[:1500]})
    progress(100, "Script batch finished")
    return {
        "projects": results,
        "errors": errors,
        "completed": len(results),
        "failed": len(errors),
        "partial": bool(errors and results),
        "message": (
            "Some ideas could not be generated. Their errors are shown below; successful projects were kept."
            if errors and results
            else "Script generation failed." if errors else "All scripts are ready."
        ),
    }


def _build_ai_project(
    db: Session,
    idea: ContentIdea,
    session: IdeationSession,
    channel: Channel,
    request: dict,
    provider: str | None,
    model: str | None,
    progress,
    check_cancel,
) -> Project:
    idea_data = {
        "title": idea.title,
        "short_description": idea.short_description,
        "hook": idea.hook,
        "story_premise": idea.story_premise,
        "why_interesting": idea.why_interesting,
        "estimated_duration_seconds": idea.estimated_duration,
        "suggested_episode_count": idea.episode_count,
        "visual_potential": idea.visual_potential,
        "source_status": idea.source_status,
    }
    channel_data = {
        "name": channel.name,
        "description": channel.description,
        "category": channel.category,
        "language": channel.language,
        "animation_style": channel.animation_style,
        "music_preferences": channel.music_preferences,
        "typography": channel.typography,
    }
    source_text = collect_source_text(db, request.get("asset_ids", []), request.get("input_text", ""))
    system, user = blueprint_prompt(idea_data, request, channel_data, source_text)
    progress(10, "Researching and building the character bible…")
    blueprint = ai.generate_json(db, provider, model, system, user, temperature=0.55, max_tokens=10000)
    check_cancel()
    meta = blueprint.get("_meta", {})
    progress(28, "Creating the project and episode plan…")
    project = _create_project_record(
        db,
        channel=channel,
        idea=idea,
        request=request,
        blueprint=blueprint,
        provider=meta.get("provider") or provider or "",
        model=meta.get("model") or model or "",
        is_demo=False,
    )
    outlines = blueprint.get("episodes") or []
    if not isinstance(outlines, list) or not outlines:
        outlines = [
            {
                "episode_number": 1,
                "title": idea.title,
                "summary": idea.short_description,
                "estimated_duration_seconds": idea.estimated_duration,
            }
        ]
    previous_summary = ""
    total_episodes = len(outlines)
    for index, outline in enumerate(outlines):
        check_cancel()
        progress(30 + (index / max(1, total_episodes)) * 62, f"Writing episode {index + 1} of {total_episodes}…")
        project_data = {
            "title": project.title,
            "logline": blueprint.get("logline", ""),
            "research_summary": project.research_summary,
            "source_status": project.source_status,
            "characters": blueprint.get("characters") or [],
            "episode_outline": outline,
        }
        system, user = episode_prompt(
            project_data,
            blueprint,
            outline,
            previous_summary,
            request,
            channel_data,
        )
        episode_data = ai.generate_json(
            db,
            meta.get("provider") or provider,
            meta.get("model") or model,
            system,
            user,
            temperature=0.72,
            max_tokens=16000,
        )
        episode = _save_episode(db, project, episode_data, outline, index + 1)
        previous_summary = f"Episode {index + 1} — {episode.title}: {episode.summary}"
        _ensure_placeholder_video(db, channel, project, episode)
        db.commit()
    project.status = "SCRIPT_READY"
    project.last_error = ""
    db.commit()
    return project


def _create_project_record(
    db: Session,
    *,
    channel: Channel,
    idea: ContentIdea,
    request: dict,
    blueprint: dict,
    provider: str,
    model: str,
    is_demo: bool,
) -> Project:
    title = str(blueprint.get("title") or idea.title)[:300]
    project = Project(
        channel_id=channel.id,
        title=title,
        slug=_unique_project_slug(db, channel.id, title),
        category=request.get("category") or channel.category,
        language=request.get("language") or channel.language,
        audience=request.get("audience") or "General audience",
        format=request.get("content_form") or "long-form",
        aspect_ratio=request.get("aspect_ratio") or "16:9",
        tone=request.get("tone") or "Cinematic",
        status="RESEARCHING",
        idea={
            "title": idea.title,
            "description": idea.short_description,
            "hook": idea.hook,
            "premise": idea.story_premise,
            "episode_count": idea.episode_count,
            "source_status": idea.source_status,
            "logline": blueprint.get("logline", ""),
        },
        research_summary=str(blueprint.get("research_summary") or ""),
        sources=blueprint.get("sources") or [],
        source_status=str(blueprint.get("source_status") or idea.source_status or ""),
        opening_hook=str(blueprint.get("opening_hook") or idea.hook or ""),
        outro=str(blueprint.get("outro") or ""),
        cta=str(blueprint.get("cta") or ""),
        animation_style=request.get("animation_style") or channel.animation_style or "",
        provider=provider,
        model=model,
        is_demo=is_demo,
    )
    db.add(project)
    db.flush()
    for char_data in blueprint.get("characters") or []:
        if not isinstance(char_data, dict) or not char_data.get("name"):
            continue
        db.add(
            Character(
                project_id=project.id,
                name=str(char_data.get("name"))[:160],
                role=str(char_data.get("role") or "Character")[:160],
                description=str(char_data.get("description") or ""),
                appearance=str(char_data.get("appearance") or ""),
                personality=str(char_data.get("personality") or ""),
                continuity_notes=str(char_data.get("continuity_notes") or ""),
            )
        )
    db.commit()
    db.refresh(project)
    return project


def _save_episode(db: Session, project: Project, data: dict, outline: dict, number: int) -> Episode:
    episode = Episode(
        project_id=project.id,
        episode_number=number,
        title=str(data.get("title") or outline.get("title") or f"Episode {number}")[:300],
        summary=str(data.get("summary") or outline.get("summary") or ""),
        narration_script=str(data.get("narration_script") or ""),
        screenplay=str(data.get("screenplay") or ""),
        opening_hook=str(data.get("opening_hook") or ""),
        outro=str(data.get("outro") or ""),
        teaser=str(data.get("teaser") or ""),
        cta=str(data.get("cta") or ""),
        estimated_duration=_as_int(
            outline.get("estimated_duration_seconds") or data.get("estimated_duration_seconds"), 600
        ),
        status="SCRIPT_READY",
        is_demo=project.is_demo,
    )
    db.add(episode)
    db.flush()
    scenes = data.get("scenes") or []
    if not isinstance(scenes, list) or not scenes:
        raise ai.AIError("The AI response did not contain usable scenes. Retry with a stronger model.")
    cursor = 0.0
    for scene_index, scene_data in enumerate(scenes):
        if not isinstance(scene_data, dict):
            continue
        start = _as_float(scene_data.get("start_time"), cursor)
        end = _as_float(scene_data.get("end_time"), start + 30)
        if end <= start:
            end = start + 30
        scene = Scene(
            episode_id=episode.id,
            scene_number=_as_int(scene_data.get("scene_number"), scene_index + 1),
            heading=str(scene_data.get("heading") or f"Scene {scene_index + 1}"),
            start_time=round(start, 2),
            end_time=round(end, 2),
            action=str(scene_data.get("action") or ""),
            visual_composition=str(scene_data.get("visual_composition") or ""),
            background=str(scene_data.get("background") or ""),
            lighting=str(scene_data.get("lighting") or ""),
            camera_movement=str(scene_data.get("camera_movement") or ""),
            expressions=str(scene_data.get("expressions") or ""),
            animation_instructions=str(scene_data.get("animation_instructions") or ""),
            sound_effects=str(scene_data.get("sound_effects") or ""),
            music_cue=str(scene_data.get("music_cue") or ""),
            transition=str(scene_data.get("transition") or "Cut"),
            continuity=str(scene_data.get("continuity") or ""),
            narration=str(scene_data.get("narration") or ""),
        )
        db.add(scene)
        db.flush()
        dialogue = scene_data.get("dialogue") or []
        if not isinstance(dialogue, list):
            dialogue = []
        line_cursor = start
        for line_index, line_data in enumerate(dialogue):
            if not isinstance(line_data, dict):
                continue
            text = str(line_data.get("text") or "").strip()
            if not text:
                continue
            line_start = _as_float(line_data.get("start_time"), line_cursor)
            line_end = _as_float(line_data.get("end_time"), line_start + max(2.0, min(10.0, len(text) / 14)))
            if line_end <= line_start:
                line_end = line_start + 4
            db.add(
                DialogueLine(
                    scene_id=scene.id,
                    line_order=line_index + 1,
                    speaker=str(line_data.get("speaker") or "Narrator")[:160],
                    speaker_type=str(line_data.get("speaker_type") or "narrator")[:40],
                    text=text,
                    emotion=str(line_data.get("emotion") or "Neutral")[:160],
                    delivery=str(line_data.get("delivery") or ""),
                    start_time=round(line_start, 2),
                    end_time=round(line_end, 2),
                )
            )
            line_cursor = line_end
        if not dialogue and scene.narration:
            db.add(
                DialogueLine(
                    scene_id=scene.id,
                    line_order=1,
                    speaker="Narrator",
                    speaker_type="narrator",
                    text=scene.narration.strip(),
                    emotion="Narrator",
                    delivery="Natural narration",
                    start_time=start,
                    end_time=min(end, start + max(3, len(scene.narration) / 14)),
                )
            )
        cursor = end
    db.commit()
    db.refresh(episode)
    if not episode.screenplay:
        episode.screenplay = _compose_screenplay(episode)
    if not episode.narration_script:
        episode.narration_script = "\n".join(
            line.text for scene in episode.scenes for line in scene.dialogue_lines if line.speaker_type == "narrator"
        )
    db.commit()
    db.refresh(episode)
    return episode


def _build_demo_project(
    db: Session,
    idea: ContentIdea,
    session: IdeationSession,
    channel: Channel,
    request: dict,
) -> Project:
    if idea.title == DEMO_BLUEPRINT["title"]:
        blueprint = dict(DEMO_BLUEPRINT)
        blueprint["title"] = idea.title
        episode_map = DEMO_EPISODES
    else:
        blueprint = {
            "title": idea.title,
            "logline": idea.short_description,
            "research_summary": (
                "Original fictional demonstration material. This offline sample is not researched and is labelled as demo."
            ),
            "sources": [
                {
                    "title": "Katha Studio offline demo",
                    "url": "",
                    "note": "Fictional demonstration content. Not a research source.",
                    "type": "demo",
                }
            ],
            "source_status": "DEMO ONLY — fictional, not researched",
            "opening_hook": idea.hook,
            "outro": "This was a fictional demonstration from Katha Studio.",
            "cta": "",
            "characters": [
                {
                    "name": "Narrator",
                    "role": "Narrator",
                    "description": "Warm demonstration narrator.",
                    "appearance": "Unseen",
                    "personality": "Reflective",
                    "continuity_notes": "Demo voice.",
                    "speaker_type": "narrator",
                }
            ],
            "episodes": [
                {
                    "episode_number": 1,
                    "title": idea.title,
                    "summary": idea.short_description,
                    "estimated_duration_seconds": idea.estimated_duration,
                }
            ],
        }
        episode_map = {
            1: {
                "title": idea.title,
                "summary": idea.short_description,
                "opening_hook": idea.hook,
                "narration_script": idea.hook,
                "screenplay": f"DEMO — FICTIONAL\n\nNARRATOR\n{idea.hook}",
                "outro": "This was a fictional demonstration from Katha Studio.",
                "teaser": "",
                "cta": "",
                "scenes": [
                    {
                        "scene_number": 1,
                        "heading": "DEMO — VISUAL METAPHOR",
                        "start_time": 0,
                        "end_time": 30,
                        "action": "A simple paper-cut title card and abstract visual motif.",
                        "visual_composition": "Centered title with generous negative space.",
                        "background": "Warm cream paper texture.",
                        "lighting": "Soft ambient light.",
                        "camera_movement": "Slow push in.",
                        "expressions": "Not applicable.",
                        "animation_instructions": "Demonstrate reusable paper textures and title animation.",
                        "sound_effects": "Soft paper movement.",
                        "music_cue": "Gentle ambient bed.",
                        "transition": "Fade out.",
                        "continuity": "Demo only.",
                        "narration": idea.hook,
                        "dialogue": [
                            {
                                "speaker": "Narrator",
                                "speaker_type": "narrator",
                                "text": idea.hook,
                                "emotion": "Curious",
                                "delivery": "Natural, measured narration.",
                                "start_time": 2,
                                "end_time": 12,
                            }
                        ],
                    }
                ],
            }
        }
    project = _create_project_record(
        db,
        channel=channel,
        idea=idea,
        request=request,
        blueprint=blueprint,
        provider="demo",
        model=DEMO_LABEL,
        is_demo=True,
    )
    for index, outline in enumerate(blueprint["episodes"], start=1):
        data = episode_map.get(index) or episode_map[1]
        episode = _save_episode(db, project, data, outline, index)
        _ensure_placeholder_video(db, channel, project, episode)
    project.status = "SCRIPT_READY"
    project.research_summary = blueprint["research_summary"]
    project.last_error = ""
    db.commit()
    db.refresh(project)
    return project


def _ensure_placeholder_video(db: Session, channel: Channel, project: Project, episode: Episode) -> Video:
    existing = db.query(Video).filter(Video.episode_id == episode.id).first()
    if existing:
        return existing
    video = Video(
        channel_id=channel.id,
        project_id=project.id,
        episode_id=episode.id,
        title=episode.title,
        category=project.category,
        episode_number=episode.episode_number,
        description=episode.summary,
        hashtags=[],
        tags=[],
        aspect_ratio=project.aspect_ratio,
        project_location=channel.animation_project_path or "",
        production_package_path=project.production_package_path or "",
        final_video_path="",
        production_status="AWAITING_VOICE",
        platform="youtube",
        source="project",
        is_demo=project.is_demo,
    )
    db.add(video)
    db.flush()
    return video


def _compose_screenplay(episode: Episode) -> str:
    lines = [f"# {episode.title}", ""]
    for scene in episode.scenes:
        lines.append(scene.heading)
        lines.append("")
        if scene.action:
            lines.append(scene.action)
            lines.append("")
        for line in scene.dialogue_lines:
            lines.append(line.speaker.upper())
            lines.append(line.text)
            lines.append("")
    return "\n".join(lines)


def _unique_project_slug(db: Session, channel_id: int, title: str) -> str:
    base = slugify(title, "project")
    slug = base
    index = 2
    while db.query(Project).filter(Project.channel_id == channel_id, Project.slug == slug).first():
        slug = f"{base}-{index}"
        index += 1
    return slug


def _as_int(value: Any, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _as_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
