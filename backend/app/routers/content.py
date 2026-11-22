from __future__ import annotations

import logging
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..config import config
from ..database import get_db
from ..models import Asset, Channel, ContentIdea, IdeationSession, Project, ReferenceStyle
from ..schemas import GenerateScriptsRequest, IdeationRequest, ReferenceAnalyzeRequest, ReferenceUrlRequest
from ..serializers import ideation_dict, job_dict, reference_style_dict
from ..services import ai
from ..services.content_inputs import extract_text
from ..services.ffmpeg import AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, probe
from ..services.ideation import run_ideation_job
from ..services.jobs import submit_job
from ..services.references import ReferenceError, analyze_reference_file, inspect_url
from ..services.script_generation import run_script_job
from ..services.workspace import get_storage_roots
from ..utils import safe_filename, unique_path

router = APIRouter(prefix="/content", tags=["content"])
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024


@router.post("/uploads")
async def upload_files(
    files: list[UploadFile] = File(...),
    channel_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    if channel_id and not db.get(Channel, channel_id):
        raise HTTPException(404, "Channel not found.")
    results = []
    for upload in files:
        original = safe_filename(upload.filename or "upload")
        extension = Path(original).suffix.lower()
        allowed = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS | IMAGE_EXTENSIONS | {".pdf", ".docx", ".txt", ".md", ".json", ".srt", ".vtt", ".csv"}
        if extension not in allowed:
            raise HTTPException(400, f"{original}: this file type is not supported.")
        target = config.upload_dir / f"{uuid.uuid4().hex[:10]}_{original}"
        size = 0
        try:
            with target.open("wb") as handle:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, f"{original} is larger than the 2 GB upload limit.")
                    handle.write(chunk)
        except HTTPException:
            target.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()
        kind = "document"
        metadata = {"original_name": upload.filename, "size": size, "mime_type": upload.content_type or mimetypes.guess_type(original)[0] or ""}
        if extension in VIDEO_EXTENSIONS:
            kind = "reference_video"
            try:
                info = probe(target)
                metadata.update(
                    {
                        "duration": info["duration"],
                        "width": info["width"],
                        "height": info["height"],
                        "fps": info["fps"],
                        "aspect_ratio": info["aspect_ratio"],
                        "summary": (
                            f"Reference video, {info['width']}×{info['height']}, {info['duration']:.1f}s. "
                            "Analyse it for local style guidance before using it."
                        ),
                    }
                )
            except Exception as exc:
                metadata["warning"] = str(exc)
        elif extension in AUDIO_EXTENSIONS:
            kind = "reference_audio"
            try:
                info = probe(target)
                metadata.update({"duration": info["duration"], "audio_codec": info["audio_codec"]})
            except Exception as exc:
                metadata["warning"] = str(exc)
        elif extension in IMAGE_EXTENSIONS:
            kind = "reference_image"
        elif extension in {".txt", ".md", ".pdf", ".docx", ".json", ".srt", ".vtt", ".csv"}:
            text = extract_text(target, limit=8000)
            metadata["text_excerpt"] = text[:2000]
            metadata["text_length"] = len(text)
        asset = Asset(
            channel_id=channel_id,
            kind=kind,
            name=upload.filename or original,
            path=str(target),
            mime_type=metadata.get("mime_type", ""),
            metadata_json=metadata,
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        results.append(
            {
                "id": asset.id,
                "name": asset.name,
                "kind": asset.kind,
                "path": asset.path,
                "metadata": asset.metadata_json,
            }
        )
    return {"assets": results}


@router.get("/assets")
def list_assets(channel_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Asset).order_by(Asset.created_at.desc())
    if channel_id:
        query = query.filter(Asset.channel_id == channel_id)
    return {
        "assets": [
            {
                "id": asset.id,
                "channel_id": asset.channel_id,
                "kind": asset.kind,
                "name": asset.name,
                "path": asset.path,
                "mime_type": asset.mime_type,
                "metadata": asset.metadata_json or {},
                "created_at": asset.created_at.isoformat(),
            }
            for asset in query.limit(100).all()
        ]
    }


@router.post("/ideation", status_code=202)
def create_ideation(payload: IdeationRequest, db: Session = Depends(get_db)):
    channel = db.get(Channel, payload.channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found.")
    if not payload.prompt.strip() and not payload.input_text.strip() and not payload.asset_ids:
        raise HTTPException(400, "Describe an idea, paste source material, or attach a reference.")
    if not payload.demo:
        try:
            provider = ai.resolve_provider(db, payload.provider)
            if not (payload.model or provider.default_model):
                raise ai.AINotConfigured(
                    f"Choose a model for {provider.label} in Connections & Settings before generating ideas."
                )
        except ai.AIError as exc:
            raise HTTPException(400, str(exc))
    session = IdeationSession(
        channel_id=channel.id,
        request=payload.model_dump(),
        status="generating",
        is_demo=payload.demo,
        provider="demo" if payload.demo else (payload.provider or "zen"),
        model=payload.model or "",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    job = submit_job(
        db,
        "ideation",
        {"session_id": session.id},
        run_ideation_job,
    )
    return {"session": ideation_dict(db, session), "job": job_dict(job)}


@router.get("/ideation")
def list_ideation(channel_id: int | None = None, limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    query = db.query(IdeationSession).order_by(IdeationSession.created_at.desc())
    if channel_id:
        query = query.filter(IdeationSession.channel_id == channel_id)
    return {"sessions": [ideation_dict(db, session) for session in query.limit(limit).all()]}


@router.get("/ideation/{session_id}")
def get_ideation(session_id: int, db: Session = Depends(get_db)):
    session = db.get(IdeationSession, session_id)
    if not session:
        raise HTTPException(404, "Content planning session not found.")
    return ideation_dict(db, session)


@router.post("/ideation/{session_id}/scripts", status_code=202)
def generate_scripts(session_id: int, payload: GenerateScriptsRequest, db: Session = Depends(get_db)):
    session = db.get(IdeationSession, session_id)
    if not session:
        raise HTTPException(404, "Content planning session not found.")
    if session.status not in {"ready", "completed"}:
        raise HTTPException(400, "Wait for the ideas to finish generating first.")
    ideas = db.query(ContentIdea).filter(ContentIdea.session_id == session.id, ContentIdea.id.in_(payload.idea_ids)).all()
    if not ideas:
        raise HTTPException(400, "Select at least one valid idea.")
    for idea in ideas:
        idea.selected = True
    db.commit()
    job = submit_job(
        db,
        "script_generation",
        {
            "idea_ids": [idea.id for idea in ideas],
            "provider": payload.provider or session.provider,
            "model": payload.model or session.model,
            "session_id": session.id,
        },
        run_script_job,
    )
    return {"job": job_dict(job), "selected": len(ideas)}


@router.get("/ideas/{idea_id}")
def get_idea(idea_id: int, db: Session = Depends(get_db)):
    idea = db.get(ContentIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea not found.")
    project = db.get(Project, idea.project_id) if idea.project_id else None
    return {
        "id": idea.id,
        "title": idea.title,
        "selected": idea.selected,
        "project_id": idea.project_id,
        "project_status": project.status if project else None,
    }


@router.post("/references/analyze")
def analyze_reference(payload: ReferenceAnalyzeRequest, db: Session = Depends(get_db)):
    if payload.channel_id and not db.get(Channel, payload.channel_id):
        raise HTTPException(404, "Channel not found.")
    try:
        result = analyze_reference_file(
            db,
            payload.path,
            payload.name,
            payload.channel_id,
            payload.source_url,
            payload.save_to_channel,
            payload.apply_style,
        )
        return result
    except ReferenceError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception("Reference analysis failed")
        raise HTTPException(500, f"Reference analysis failed: {exc}")


@router.post("/references/url")
def inspect_reference_url(payload: ReferenceUrlRequest):
    try:
        return inspect_url(payload.url)
    except ReferenceError as exc:
        raise HTTPException(400, str(exc))


@router.get("/references")
def list_references(channel_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(ReferenceStyle).order_by(ReferenceStyle.created_at.desc())
    if channel_id:
        query = query.filter(ReferenceStyle.channel_id == channel_id)
    return {"references": [reference_style_dict(style) for style in query.limit(50).all()]}


@router.post("/references/{reference_id}/apply/{channel_id}")
def apply_reference(reference_id: int, channel_id: int, db: Session = Depends(get_db)):
    style = db.get(ReferenceStyle, reference_id)
    channel = db.get(Channel, channel_id)
    if not style or not channel:
        raise HTTPException(404, "Reference style or channel not found.")
    channel.animation_style = (
        (channel.animation_style + "\n\n" if channel.animation_style else "")
        + f"Style reference '{style.name}': {style.summary}"
    )
    db.commit()
    return {"ok": True}
