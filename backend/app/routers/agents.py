from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentHandoff, Channel, Episode, Project, ProjectLock
from ..schemas import AgentSettingsUpdate, HandoffLaunchRequest, HandoffRequest
from ..services import agents
from ..services.workspace import initialize_channel_workspace

router = APIRouter(prefix="/agents", tags=["animation agents"])
logger = logging.getLogger(__name__)


@router.get("")
def get_agents(db: Session = Depends(get_db)):
    return agents.detection_payload(db)


@router.patch("/settings")
def update_agent_settings(payload: AgentSettingsUpdate, db: Session = Depends(get_db)):
    values = payload.model_dump(exclude_unset=True)
    if values.get("selected_agent") and values["selected_agent"] not in agents.AGENTS:
        raise HTTPException(400, "Choose Claude Code, Antigravity or Manual production.")
    saved = agents.save_agent_settings(db, values)
    return {
        "ok": True,
        "settings": {key: value for key, value in saved.items() if key != "last_handoff"},
        "agents": agents.detection_payload(db),
    }


@router.get("/handoffs")
def list_handoffs(limit: int = Query(30, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.query(AgentHandoff).order_by(AgentHandoff.created_at.desc()).limit(limit).all()
    return {"handoffs": [agents.handoff_dict(row) for row in rows]}


@router.get("/handoffs/{handoff_id}")
def get_handoff(handoff_id: int, db: Session = Depends(get_db)):
    handoff = db.get(AgentHandoff, handoff_id)
    if not handoff:
        raise HTTPException(404, "Handoff not found.")
    data = agents.handoff_dict(handoff)
    data["prompt"] = handoff.prompt
    return data


@router.post("/handoffs")
def create_handoff(payload: HandoffRequest, db: Session = Depends(get_db)):
    project = db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    channel = db.get(Channel, project.channel_id)
    if not channel:
        raise HTTPException(404, "The project's channel no longer exists.")
    episode = db.get(Episode, payload.episode_id) if payload.episode_id else None
    if payload.episode_id and (not episode or episode.project_id != project.id):
        raise HTTPException(400, "Choose an episode that belongs to this project.")
    agent = payload.agent or agents.selected_agent(db)
    permission_mode = payload.permission_mode or agents.get_agent_settings(db).get("permission_mode", "acceptEdits")
    try:
        initialize_channel_workspace(db, channel)
        handoff = agents.create_handoff(
            db,
            project=project,
            channel=channel,
            episode=episode,
            agent=agent,
            mode=payload.mode,
            permission_mode=permission_mode,
        )
    except agents.LockConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return agents.handoff_dict(handoff)


@router.post("/handoffs/{handoff_id}/launch")
def launch_handoff(handoff_id: int, payload: HandoffLaunchRequest, db: Session = Depends(get_db)):
    handoff = db.get(AgentHandoff, handoff_id)
    if not handoff:
        raise HTTPException(404, "Handoff not found.")
    if handoff.status in {"cancelled", "completed", "failed"}:
        raise HTTPException(409, f"This handoff is {handoff.status}. Prepare a new one.")
    mode = payload.mode or handoff.mode
    permission_mode = payload.permission_mode or agents.get_agent_settings(db).get("permission_mode", "acceptEdits")
    try:
        if mode == "headless":
            agents.launch_headless(db, handoff, permission_mode)
            return agents.handoff_dict(handoff)
        if mode == "terminal":
            return agents.launch_terminal(db, handoff)
        if handoff.agent == "antigravity":
            return agents.launch_antigravity(db, handoff)
        if handoff.agent == "manual":
            return agents.mark_manual_handoff(db, handoff)
        return agents.launch_terminal(db, handoff)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/handoffs/{handoff_id}/complete")
def complete_handoff(handoff_id: int, db: Session = Depends(get_db)):
    handoff = db.get(AgentHandoff, handoff_id)
    if not handoff:
        raise HTTPException(404, "Handoff not found.")
    agents.complete_handoff(db, handoff)
    return agents.handoff_dict(handoff)


@router.post("/handoffs/{handoff_id}/cancel")
def cancel_handoff(handoff_id: int, db: Session = Depends(get_db)):
    handoff = db.get(AgentHandoff, handoff_id)
    if not handoff:
        raise HTTPException(404, "Handoff not found.")
    agents.cancel_handoff(db, handoff)
    return agents.handoff_dict(handoff)


@router.post("/handoffs/{handoff_id}/heartbeat")
def heartbeat_handoff(handoff_id: int, db: Session = Depends(get_db)):
    handoff = db.get(AgentHandoff, handoff_id)
    if not handoff:
        raise HTTPException(404, "Handoff not found.")
    locks = (
        db.query(ProjectLock)
        .filter(ProjectLock.handoff_id == handoff.id, ProjectLock.status == "active")
        .all()
    )
    for lock in locks:
        agents.heartbeat_lock(db, lock.id)
    return {"ok": True, "locks": len(locks)}


@router.get("/locks")
def list_locks(db: Session = Depends(get_db)):
    return {"locks": [agents.lock_dict(lock) for lock in agents.active_locks(db)]}


@router.post("/locks/{lock_id}/release")
def release_lock(lock_id: int, db: Session = Depends(get_db)):
    try:
        lock = agents.release_lock(db, lock_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "lock": lock}


@router.get("/projects/{project_id}/status")
def project_agent_status(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found.")
    lock = agents.lock_conflict(db, project.id)
    handoffs = (
        db.query(AgentHandoff)
        .filter(AgentHandoff.project_id == project.id)
        .order_by(AgentHandoff.created_at.desc())
        .limit(8)
        .all()
    )
    return {
        "project_id": project.id,
        "selected_agent": agents.selected_agent(db),
        "lock": agents.lock_dict(lock) if lock else None,
        "handoffs": [agents.handoff_dict(row) for row in handoffs],
        "project_handoff_dir": str(
            Path(project.production_package_path).parent if project.production_package_path else ""
        ),
    }
