from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Character, DialogueLine, Episode, Project, Scene, Video
from ..schemas import (
    ApproveScriptRequest,
    DialogueUpdate,
    EpisodeUpdate,
    PackageGenerateRequest,
    ProjectUpdate,
    SceneUpdate,
)
from ..serializers import job_dict, project_detail, project_summary
from ..services.jobs import submit_job
from ..services.packages import run_package_job

router = APIRouter(prefix="/projects", tags=["projects"])
logger = logging.getLogger(__name__)


@router.get("")
def list_projects(
    channel_id: int | None = None,
    status: str | None = None,
    search: str | None = None,
    include_archived: bool = Query(False),
    limit: int = Query(100, ge=1, le=300),
    db: Session = Depends(get_db),
):
    query = db.query(Project).order_by(Project.updated_at.desc())
    if channel_id:
        query = query.filter(Project.channel_id == channel_id)
    if status:
        query = query.filter(Project.status == status)
    if not include_archived:
        query = query.filter(Project.archived.is_(False))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Project.title.ilike(pattern), Project.research_summary.ilike(pattern)))
    projects = query.limit(limit).all()
    return {"projects": [project_summary(db, project) for project in projects]}


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    return project_detail(db, project)


@router.patch("/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(project, field, value)
    db.commit()
    return project_detail(db, project)


@router.post("/{project_id}/archive")
def archive_project(project_id: int, archived: bool = Query(True), db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    project.archived = archived
    db.commit()
    return project_summary(db, project)


@router.post("/{project_id}/approve")
def approve_script(project_id: int, payload: ApproveScriptRequest, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    if payload.approved:
        lines = (
            db.query(DialogueLine)
            .join(Scene, DialogueLine.scene_id == Scene.id)
            .join(Episode, Scene.episode_id == Episode.id)
            .filter(Episode.project_id == project.id)
            .all()
        )
        if not project.episodes or not lines:
            raise HTTPException(400, "The project needs at least one episode with spoken dialogue before approval.")
        project.approved_at = __import__("datetime").datetime.utcnow()
        all_ready = all(line.audio_status == "ready" for line in lines)
        project.status = "VOICE_READY" if all_ready else "AWAITING_VOICE"
        for video in db.query(Video).filter(Video.project_id == project.id).all():
            video.production_status = "VOICE_READY" if all_ready else "AWAITING_VOICE"
    else:
        project.approved_at = None
        project.status = "SCRIPT_READY"
    db.commit()
    return project_detail(db, project)


@router.post("/{project_id}/package", status_code=202)
def generate_package(project_id: int, payload: PackageGenerateRequest, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    if not project.approved_at:
        raise HTTPException(400, "Approve the script before generating a production package.")
    if project.production_package_path and Path(project.production_package_path).exists() and not payload.overwrite:
        raise HTTPException(
            409,
            "A production package already exists. Confirm regenerate to replace its generated files.",
        )
    job = submit_job(
        db,
        "production_package",
        {
            "project_id": project.id,
            "include_audio": payload.include_audio,
            "overwrite": payload.overwrite,
        },
        run_package_job,
    )
    return {"job": job_dict(job)}


@router.get("/{project_id}/handoff")
def project_handoff(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    channel = project.channel
    return {
        "project_id": project.id,
        "package_path": project.production_package_path,
        "package_exists": bool(project.production_package_path and Path(project.production_package_path).exists()),
        "animation_project_path": channel.animation_project_path if channel else "",
        "animation_project_exists": bool(channel and channel.animation_project_path and Path(channel.animation_project_path).exists()),
        "animation_episode_path": project.animation_episode_path,
        "output_folder": channel.output_folder if channel else "",
        "approved": bool(project.approved_at),
    }


@router.patch("/episodes/{episode_id}")
def update_episode(episode_id: int, payload: EpisodeUpdate, db: Session = Depends(get_db)):
    episode = db.get(Episode, episode_id)
    if not episode:
        raise HTTPException(404, "Episode not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(episode, field, value)
    db.commit()
    video = db.query(Video).filter(Video.episode_id == episode.id).first()
    if video and not video.final_video_path:
        video.title = episode.title
    db.commit()
    return {"ok": True, "episode_id": episode.id}


@router.patch("/scenes/{scene_id}")
def update_scene(scene_id: int, payload: SceneUpdate, db: Session = Depends(get_db)):
    scene = db.get(Scene, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(scene, field, value)
    db.commit()
    return {"ok": True, "scene_id": scene.id}


@router.patch("/dialogue/{line_id}")
def update_dialogue(line_id: int, payload: DialogueUpdate, db: Session = Depends(get_db)):
    line = db.get(DialogueLine, line_id)
    if not line:
        raise HTTPException(404, "Dialogue line not found.")
    text_changed = payload.text is not None and payload.text.strip() != line.text
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(line, field, value)
    if text_changed:
        line.audio_status = "stale"
        line.audio_error = "Dialogue changed. Regenerate this line's audio."
        project = line.scene.episode.project
        project.approved_at = None
        project.status = "SCRIPT_READY"
        video = db.query(Video).filter(Video.episode_id == line.scene.episode_id).first()
        if video:
            video.production_status = "AWAITING_VOICE"
    db.commit()
    return {
        "ok": True,
        "line_id": line.id,
        "audio_stale": text_changed,
        "message": "Dialogue updated. Generate audio again for this line." if text_changed else "Dialogue updated.",
    }


@router.patch("/characters/{character_id}")
def update_character_voice(character_id: int, voice_profile_id: int | None = Query(None), db: Session = Depends(get_db)):
    character = db.get(Character, character_id)
    if not character:
        raise HTTPException(404, "Character not found.")
    character.voice_profile_id = voice_profile_id
    db.commit()
    return {"ok": True, "character_id": character.id, "voice_profile_id": character.voice_profile_id}
