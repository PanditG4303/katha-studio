from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db, utcnow
from ..models import (
    Channel,
    ImportHistory,
    JobRecord,
    Project,
    Publication,
    Video,
)
from ..schemas import (
    MarkPublishedRequest,
    VideoBulkUpdate,
    VideoImportRequest,
    VideoUpdate,
)
from ..serializers import job_dict, publication_dict, video_dict
from ..services.video_import import ImportError, import_video, watcher

router = APIRouter(tags=["videos"])
logger = logging.getLogger(__name__)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    videos = db.query(Video).filter(Video.archived.is_(False)).all()
    projects = db.query(Project).filter(Project.archived.is_(False)).all()
    counts = {
        "total_videos": len(videos),
        "published": len([v for v in videos if v.production_status == "PUBLISHED"]),
        "scheduled": len([v for v in videos if v.production_status == "SCHEDULED"]),
        "ready_to_upload": len([v for v in videos if v.production_status == "READY_TO_UPLOAD"]),
        "awaiting_animation": len([v for v in videos if v.production_status == "READY_FOR_CLAUDE"]),
        "animation_in_progress": len([v for v in videos if v.production_status == "ANIMATION_IN_PROGRESS"]),
        "awaiting_voice": len([v for v in videos if v.production_status == "AWAITING_VOICE"]),
        "draft_scripts": len([p for p in projects if p.status == "SCRIPT_READY"]),
        "failed": len([v for v in videos if v.production_status == "FAILED"]),
        "awaiting_review": len([v for v in videos if v.production_status == "AWAITING_REVIEW"]),
        "output_ready": len([v for v in videos if v.output_state == "READY"]),
        "output_reviewed": len([v for v in videos if v.output_state == "REVIEWED"]),
        "output_published": len([v for v in videos if v.output_state == "PUBLISHED"]),
        "output_failed": len([v for v in videos if v.output_state == "FAILED"]),
    }
    by_channel = []
    for channel in db.query(Channel).filter(Channel.archived.is_(False)).all():
        channel_videos = [v for v in videos if v.channel_id == channel.id]
        by_channel.append(
            {
                "id": channel.id,
                "name": channel.name,
                "accent_color": channel.accent_color,
                "total": len(channel_videos),
                "published": len([v for v in channel_videos if v.production_status == "PUBLISHED"]),
                "scheduled": len([v for v in channel_videos if v.production_status == "SCHEDULED"]),
                "in_production": len(
                    [v for v in channel_videos if v.production_status not in {"PUBLISHED", "SCHEDULED", "ARCHIVED"}]
                ),
            }
        )
    by_platform = []
    for platform in ["youtube", "instagram"]:
        platform_videos = [v for v in videos if v.platform == platform]
        by_platform.append(
            {
                "platform": platform,
                "total": len(platform_videos),
                "published": len([v for v in platform_videos if v.production_status == "PUBLISHED"]),
                "scheduled": len([v for v in platform_videos if v.production_status == "SCHEDULED"]),
            }
        )
    recent = (
        db.query(Video)
        .filter(Video.archived.is_(False))
        .order_by(Video.updated_at.desc())
        .limit(8)
        .all()
    )
    upcoming = (
        db.query(Publication)
        .filter(Publication.status == "scheduled", Publication.scheduled_at >= utcnow())
        .order_by(Publication.scheduled_at)
        .limit(6)
        .all()
    )
    active_jobs = (
        db.query(JobRecord)
        .filter(JobRecord.status.in_(["queued", "running"]))
        .order_by(JobRecord.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "counts": counts,
        "by_channel": by_channel,
        "by_platform": by_platform,
        "recent_videos": [video_dict(db, video, compact=True) for video in recent],
        "upcoming_publications": [
            {**publication_dict(publication), "video": video_dict(db, publication.video, compact=True)}
            for publication in upcoming
            if publication.video
        ],
        "active_jobs": [job_dict(job) for job in active_jobs],
    }


@router.get("/videos")
def list_videos(
    search: str | None = None,
    channel_id: int | None = None,
    project_id: int | None = None,
    status: str | None = None,
    platform: str | None = None,
    youtube_status: str | None = None,
    output_state: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    archived: bool = Query(False),
    sort: str = Query("updated_at"),
    order: str = Query("desc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Video)
    if archived:
        query = query.filter(Video.archived.is_(True))
    else:
        query = query.filter(Video.archived.is_(False))
    if channel_id:
        query = query.filter(Video.channel_id == channel_id)
    if project_id:
        query = query.filter(Video.project_id == project_id)
    if status:
        query = query.filter(Video.production_status == status)
    if platform:
        query = query.filter(Video.platform == platform)
    if youtube_status:
        query = query.filter(Video.youtube_status == youtube_status)
    if output_state:
        query = query.filter(Video.output_state == output_state)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Video.title.ilike(pattern),
                Video.description.ilike(pattern),
                Video.category.ilike(pattern),
            )
        )
    if date_from:
        try:
            query = query.filter(Video.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(400, "Invalid start date.")
    if date_to:
        try:
            end = datetime.fromisoformat(date_to)
            if len(date_to) <= 10:
                end = end + timedelta(days=1)
            query = query.filter(Video.created_at <= end)
        except ValueError:
            raise HTTPException(400, "Invalid end date.")
    total = query.count()
    sort_fields = {
        "updated_at": Video.updated_at,
        "created_at": Video.created_at,
        "title": Video.title,
        "duration": Video.duration,
        "scheduled_at": Video.scheduled_at,
        "published_at": Video.published_at,
        "production_status": Video.production_status,
    }
    sort_column = sort_fields.get(sort, Video.updated_at)
    query = query.order_by(sort_column.desc() if order == "desc" else sort_column.asc())
    videos = query.offset(offset).limit(limit).all()
    return {
        "videos": [video_dict(db, video, compact=True) for video in videos],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/videos/{video_id}")
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    return video_dict(db, video)


@router.patch("/videos/{video_id}")
def update_video(video_id: int, payload: VideoUpdate, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("channel_id") and not db.get(Channel, updates["channel_id"]):
        raise HTTPException(404, "Channel not found.")
    if updates.get("project_id") and not db.get(Project, updates["project_id"]):
        raise HTTPException(404, "Project not found.")
    for field, value in updates.items():
        if value is not None:
            setattr(video, field, value)
    db.commit()
    return video_dict(db, video)


@router.post("/videos/bulk-update")
def bulk_update(payload: VideoBulkUpdate, db: Session = Depends(get_db)):
    videos = db.query(Video).filter(Video.id.in_(payload.video_ids)).all()
    if not videos:
        raise HTTPException(404, "No matching videos.")
    for video in videos:
        for field in ["channel_id", "production_status", "platform", "category", "output_state", "archived", "tags"]:
            value = getattr(payload, field)
            if value is not None:
                setattr(video, field, value)
    db.commit()
    return {"ok": True, "updated": len(videos)}


@router.post("/videos/import")
def manual_import(payload: VideoImportRequest, db: Session = Depends(get_db)):
    try:
        result = import_video(
            db,
            payload.path,
            channel_id=payload.channel_id,
            project_id=payload.project_id,
            title=payload.title,
            source=payload.source,
            require_stable=payload.wait_for_stable,
            output_state=payload.output_state,
        )
        return result
    except ImportError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception("Manual video import failed")
        raise HTTPException(500, f"Video import failed: {exc}")


@router.post("/videos/rescan")
def rescan_watchers(db: Session = Depends(get_db)):
    try:
        results = watcher.scan_once()
        return {"imported": results, "count": len(results)}
    except Exception as exc:
        raise HTTPException(500, f"Watch folder scan failed: {exc}")


@router.post("/videos/{video_id}/refresh-metadata")
def refresh_video_metadata(video_id: int, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    if not video.final_video_path or not Path(video.final_video_path).exists():
        raise HTTPException(400, "The final video file is not available.")
    try:
        from ..services.ffmpeg import validate_video

        info = validate_video(video.final_video_path)
        video.duration = info["duration"]
        video.width = info["width"]
        video.height = info["height"]
        video.fps = info["fps"]
        video.codec = info["video_codec"]
        video.aspect_ratio = info["aspect_ratio"]
        video.file_size = Path(video.final_video_path).stat().st_size
        video.file_mtime = Path(video.final_video_path).stat().st_mtime
        db.commit()
        return video_dict(db, video)
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.post("/videos/{video_id}/mark-published")
def mark_published(video_id: int, payload: MarkPublishedRequest, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    if not payload.youtube_url.startswith(("https://youtube.com/", "https://www.youtube.com/", "https://youtu.be/")):
        raise HTTPException(400, "Enter a valid YouTube video URL.")
    video.youtube_url = payload.youtube_url
    video.youtube_status = "published"
    video.production_status = "PUBLISHED"
    video.published_at = payload.published_at or utcnow()
    publication = (
        db.query(Publication)
        .filter(Publication.video_id == video.id, Publication.platform == "youtube")
        .order_by(Publication.created_at.desc())
        .first()
    )
    if not publication:
        publication = Publication(video_id=video.id, platform="youtube")
        db.add(publication)
    publication.status = "published"
    publication.published_at = video.published_at
    publication.remote_url = payload.youtube_url
    publication.channel_id = video.channel_id
    db.commit()
    return video_dict(db, video)


@router.post("/videos/{video_id}/archive")
def archive_video(video_id: int, archived: bool = Query(True), db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    video.archived = archived
    video.production_status = "ARCHIVED" if archived else "READY_TO_UPLOAD"
    db.commit()
    return video_dict(db, video)


@router.get("/imports/history")
def import_history(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    history = db.query(ImportHistory).order_by(ImportHistory.created_at.desc()).limit(limit).all()
    return {
        "imports": [
            {
                "id": item.id,
                "file_path": item.file_path,
                "file_size": item.file_size,
                "video_id": item.video_id,
                "status": item.status,
                "message": item.message,
                "source": item.source,
                "created_at": item.created_at.isoformat(),
            }
            for item in history
        ]
    }
