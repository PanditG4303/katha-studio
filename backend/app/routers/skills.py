from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import config
from ..database import get_db
from ..models import Skill
from ..schemas import SkillApproveRequest, SkillImportRequest, SkillInstallRequest
from ..services import skills as skills_service

router = APIRouter(prefix="/skills", tags=["skills"])
logger = logging.getLogger(__name__)


@router.get("")
def list_skills(db: Session = Depends(get_db)):
    skills_service.ensure_builtin_skills(db)
    rows = db.query(Skill).order_by(Skill.name).all()
    return {
        "skills": [skills_service.skill_dict(row) for row in rows],
        "library_path": str(config.skill_library_dir),
        "agents": [
            {"id": "claude_code", "label": "Claude Code", "path": ".claude/skills/<skill>/SKILL.md"},
            {"id": "antigravity", "label": "Antigravity", "path": ".agent/skills/<skill>/SKILL.md + shared SKILLS.md"},
            {"id": "manual", "label": "Manual", "path": ".katha/skills/<skill>/SKILL.md"},
        ],
        "note": (
            "Review a skill's files, scripts and permissions before approving it. Skills are copied into "
            "the channel's permanent project only. No skill receives credentials or browser data."
        ),
    }


@router.get("/{skill_id}")
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    return skills_service.skill_dict(skill, detail=True)


@router.post("/import")
def import_skill(payload: SkillImportRequest, db: Session = Depends(get_db)):
    try:
        skill = skills_service.import_skill(
            db, payload.path, name=payload.name, description=payload.description
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return skills_service.skill_dict(skill, detail=True)


@router.post("/{skill_id}/approve")
def approve_skill(skill_id: int, payload: SkillApproveRequest, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    skill.approved = payload.approved
    skill.status = "available" if payload.approved else "review"
    db.commit()
    return skills_service.skill_dict(skill, detail=True)


@router.post("/{skill_id}/install")
def install_skill(skill_id: int, payload: SkillInstallRequest, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    try:
        result = skills_service.install_skill(
            db, skill, channel_id=payload.channel_id, agents=payload.agents
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {**result, "skill": skills_service.skill_dict(skill)}


@router.post("/{skill_id}/uninstall")
def uninstall_skill(skill_id: int, channel_id: int, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    try:
        result = skills_service.uninstall_skill(db, skill, channel_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {**result, "skill": skills_service.skill_dict(skill)}


@router.delete("/{skill_id}")
def delete_skill(skill_id: int, confirm: bool = False, db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found.")
    if not confirm:
        raise HTTPException(400, "Confirm deletion. The shared skill library folder is removed.")
    if skill.source == "builtin":
        raise HTTPException(400, "Built-in skills cannot be deleted. Remove them from a project instead.")
    import shutil
    from pathlib import Path

    folder = Path(skill.path) if skill.path else None
    if folder and folder.exists():
        shutil.rmtree(folder)
    db.delete(skill)
    db.commit()
    return {"ok": True}
