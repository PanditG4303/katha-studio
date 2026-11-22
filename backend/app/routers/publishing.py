from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..database import get_db, utcnow
from ..models import (
    AppSetting,
    Channel,
    Publication,
    SocialAccount,
    UploadJob,
    Video,
)
from ..schemas import (
    MetadataPrepareRequest,
    PublicationCreate,
    PublicationUpdate,
    UploadRequest,
    YouTubeClientRequest,
)
from ..serializers import (
    job_dict,
    publication_dict,
    social_account_dict,
    upload_job_dict,
    video_dict,
)
from ..services import credentials, youtube
from ..services.jobs import submit_job
from ..services.metadata import run_metadata_job
from ..services.youtube import run_youtube_upload_job
from ..utils import iso, parse_datetime

router = APIRouter(tags=["publishing"])
logger = logging.getLogger(__name__)


@router.get("/publishing/youtube/status")
def youtube_status(db: Session = Depends(get_db)):
    accounts = db.query(SocialAccount).filter(SocialAccount.provider == "youtube").all()
    return {
        "client": youtube.client_status(db),
        "accounts": [social_account_dict(account) for account in accounts],
        "setup_note": (
            "Create a Google Cloud project, enable YouTube Data API v3, and create an OAuth client of type "
            "Desktop app. Paste its client ID and secret here. Katha Studio opens Google's official consent screen."
        ),
        "quota_note": "YouTube API quotas apply. Scheduling is only reported after YouTube confirms it.",
    }


@router.post("/publishing/youtube/client")
def save_youtube_client(payload: YouTubeClientRequest, db: Session = Depends(get_db)):
    try:
        youtube.save_client_credentials(db, payload.client_id, payload.client_secret)
        return {"ok": True, **youtube.client_status(db)}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.delete("/publishing/youtube/client")
def delete_youtube_client(confirm: bool = Query(False), db: Session = Depends(get_db)):
    if not confirm:
        raise HTTPException(400, "Confirm removal of the Google OAuth client credentials.")
    credentials.delete_secret("youtube_oauth_client")
    setting = db.get(AppSetting, "youtube_client_id")
    if setting:
        db.delete(setting)
        db.commit()
    return {"ok": True, "note": "Existing YouTube accounts remain listed but cannot refresh until a client is configured again."}


@router.post("/publishing/youtube/oauth/start")
def start_youtube_oauth(request: Request, db: Session = Depends(get_db)):
    redirect_uri = str(request.base_url).rstrip("/") + "/api/youtube/oauth/callback"
    try:
        result = youtube.build_auth_url(db, redirect_uri)
        return result
    except youtube.YouTubeError as exc:
        raise HTTPException(400, str(exc))


@router.get("/youtube/oauth/callback", response_class=HTMLResponse)
def youtube_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        return HTMLResponse(_callback_page(False, f"Google authorization failed: {error}"), status_code=400)
    if not code or not state:
        return HTMLResponse(_callback_page(False, "Google did not return an authorization code."), status_code=400)
    try:
        result = youtube.handle_oauth_callback(db, code, state)
        return HTMLResponse(
            _callback_page(
                True,
                f"YouTube channel “{html.escape(result['channel_name'])}” is connected. Return to Katha Studio.",
            )
        )
    except Exception as exc:
        logger.exception("YouTube OAuth callback failed")
        return HTMLResponse(_callback_page(False, html.escape(str(exc))), status_code=400)


def _callback_page(success: bool, message: str) -> str:
    color = "#718a70" if success else "#b56c6c"
    title = "Connected" if success else "Connection not completed"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title} — Katha Studio</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf8f2;color:#3f3a46;font-family:Segoe UI,sans-serif}}
.card{{max-width:520px;padding:44px;border-radius:28px;background:white;box-shadow:0 18px 60px -24px rgba(70,55,80,.25);text-align:center}}
.dot{{width:48px;height:48px;border-radius:50%;background:{color};margin:0 auto 20px;display:grid;place-items:center;color:white;font-size:24px}}
h1{{font-family:Georgia,serif;font-weight:500;margin:0 0 12px}}p{{line-height:1.65;color:#7c7484}}a{{color:#718a70}}</style>
</head><body><div class="card"><div class="dot">{'✓' if success else '!'}</div><h1>{title}</h1>
<p>{message}</p><p>You can close this tab and return to Katha Studio.</p></div>
<script>if({str(success).lower()}) setTimeout(() => window.close(), 1200);</script></body></html>"""


@router.get("/publishing/accounts")
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(SocialAccount).order_by(SocialAccount.created_at).all()
    return {"accounts": [social_account_dict(account) for account in accounts]}


@router.post("/publishing/youtube/accounts/{account_id}/test")
def test_youtube_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(SocialAccount, account_id)
    if not account or account.provider != "youtube":
        raise HTTPException(404, "YouTube account not found.")
    try:
        return youtube.test_account(db, account)
    except Exception as exc:
        raise HTTPException(400, str(exc))


@router.delete("/publishing/youtube/accounts/{account_id}")
def disconnect_youtube_account(
    account_id: int,
    confirm: bool = Query(False),
    db: Session = Depends(get_db),
):
    if not confirm:
        raise HTTPException(400, "Confirm disconnecting this YouTube account.")
    account = db.get(SocialAccount, account_id)
    if not account or account.provider != "youtube":
        raise HTTPException(404, "YouTube account not found.")
    youtube.disconnect_account(db, account)
    return {"ok": True}


@router.post("/publishing/uploads", status_code=202)
def upload_video(payload: UploadRequest, db: Session = Depends(get_db)):
    if not payload.confirm:
        raise HTTPException(400, "Explicit confirmation is required before uploading to YouTube.")
    video = db.get(Video, payload.video_id)
    account = db.get(SocialAccount, payload.account_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    if not account or account.provider != "youtube":
        raise HTTPException(404, "YouTube account not found.")
    if not video.final_video_path or not Path(video.final_video_path).exists():
        raise HTTPException(400, "The final video file is missing. Import or relink it first.")
    if video.youtube_video_id and video.youtube_status in {"published", "scheduled", "public", "private", "unlisted"}:
        raise HTTPException(
            409,
            "This video already has a YouTube upload. Use its existing YouTube URL or manage it in YouTube Studio.",
        )
    active = (
        db.query(UploadJob)
        .filter(UploadJob.video_id == video.id, UploadJob.status.in_(["queued", "uploading"]))
        .first()
    )
    if active:
        raise HTTPException(409, "An upload for this video is already in progress.")
    publish_at = parse_datetime(payload.publish_at)
    if publish_at and publish_at <= utcnow() + timedelta(minutes=1):
        raise HTTPException(400, "Choose a future YouTube publication time.")
    if publish_at and payload.privacy != "private":
        raise HTTPException(400, "YouTube scheduled uploads must be private until publication.")
    thumbnail = payload.thumbnail_path or video.thumbnail_path
    subtitle = payload.subtitle_path or video.subtitle_path
    metadata = {
        "title": payload.title[:100],
        "description": payload.description[:5000],
        "tags": payload.tags,
        "category_id": payload.category_id,
        "privacy": payload.privacy,
        "publish_at": iso(publish_at),
        "made_for_kids": payload.made_for_kids,
        "thumbnail_path": thumbnail if thumbnail and Path(thumbnail).exists() else None,
        "subtitle_path": subtitle if subtitle and Path(subtitle).exists() else None,
        "language": payload.language,
        "confirmed_at": utcnow().isoformat(),
    }
    upload_job = UploadJob(
        video_id=video.id,
        account_id=account.id,
        platform="youtube",
        status="queued",
        metadata_json=metadata,
    )
    db.add(upload_job)
    db.commit()
    db.refresh(upload_job)
    job = submit_job(
        db,
        "youtube_upload",
        {"upload_job_id": upload_job.id},
        run_youtube_upload_job,
    )
    return {"job": job_dict(job), "upload": upload_job_dict(upload_job)}


@router.post("/publishing/uploads/{upload_job_id}/retry", status_code=202)
def retry_upload(upload_job_id: int, db: Session = Depends(get_db)):
    old_job = db.get(UploadJob, upload_job_id)
    if not old_job:
        raise HTTPException(404, "Upload job not found.")
    if old_job.status not in {"failed", "cancelled"}:
        raise HTTPException(400, "Only failed or cancelled uploads can be retried.")
    new_job = UploadJob(
        video_id=old_job.video_id,
        account_id=old_job.account_id,
        platform="youtube",
        status="queued",
        metadata_json=old_job.metadata_json,
        attempts=(old_job.attempts or 0) + 1,
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    job = submit_job(
        db,
        "youtube_upload",
        {"upload_job_id": new_job.id},
        run_youtube_upload_job,
    )
    return {"job": job_dict(job), "upload": upload_job_dict(new_job)}


@router.get("/publishing/uploads")
def list_uploads(video_id: int | None = None, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    query = db.query(UploadJob).order_by(UploadJob.created_at.desc())
    if video_id:
        query = query.filter(UploadJob.video_id == video_id)
    jobs = query.limit(limit).all()
    return {"uploads": [upload_job_dict(job) for job in jobs]}


@router.post("/publishing/metadata/prepare", status_code=202)
def prepare_metadata(payload: MetadataPrepareRequest, db: Session = Depends(get_db)):
    if not db.get(Video, payload.video_id):
        raise HTTPException(404, "Video not found.")
    job = submit_job(
        db,
        "metadata_prepare",
        payload.model_dump(),
        run_metadata_job,
    )
    return {"job": job_dict(job)}


@router.get("/publications")
def list_publications(
    video_id: int | None = None,
    channel_id: int | None = None,
    status: str | None = None,
    limit: int = Query(100, ge=1, le=300),
    db: Session = Depends(get_db),
):
    query = db.query(Publication).order_by(Publication.scheduled_at.desc())
    if video_id:
        query = query.filter(Publication.video_id == video_id)
    if channel_id:
        query = query.filter(Publication.channel_id == channel_id)
    if status:
        query = query.filter(Publication.status == status)
    items = query.limit(limit).all()
    return {"publications": [publication_dict(item) for item in items]}


@router.post("/publications", status_code=201)
def create_publication(payload: PublicationCreate, db: Session = Depends(get_db)):
    video = db.get(Video, payload.video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    if payload.scheduled_at or payload.status in {"scheduled", "published"}:
        duplicate = (
            db.query(Publication)
            .filter(
                Publication.video_id == video.id,
                Publication.platform == payload.platform,
                Publication.status.in_(["scheduled", "published"]),
            )
            .first()
        )
        if duplicate:
            raise HTTPException(409, "This video already has a scheduled or published item on this platform.")
    publication = Publication(
        video_id=video.id,
        channel_id=payload.channel_id or video.channel_id,
        account_id=payload.account_id,
        platform=payload.platform,
        status=payload.status,
        scheduled_at=parse_datetime(payload.scheduled_at),
        notes=payload.notes,
        caption=payload.caption,
    )
    db.add(publication)
    if payload.status == "scheduled" and publication.scheduled_at:
        video.scheduled_at = publication.scheduled_at
        video.production_status = "SCHEDULED"
    db.commit()
    db.refresh(publication)
    return publication_dict(publication)


@router.patch("/publications/{publication_id}")
def update_publication(publication_id: int, payload: PublicationUpdate, db: Session = Depends(get_db)):
    publication = db.get(Publication, publication_id)
    if not publication:
        raise HTTPException(404, "Publication not found.")
    video = db.get(Video, publication.video_id)
    if payload.scheduled_at is not None:
        new_time = parse_datetime(payload.scheduled_at)
        if new_time is None:
            raise HTTPException(400, "Choose a valid schedule time.")
        if video and video.youtube_status == "scheduled" and video.youtube_video_id:
            try:
                youtube.reschedule_youtube_video(db, video, new_time)
            except youtube.YouTubeError as exc:
                raise HTTPException(400, str(exc))
        publication.scheduled_at = new_time
        if video:
            video.scheduled_at = new_time
            if publication.status == "scheduled":
                video.production_status = "SCHEDULED"
    if payload.status is not None:
        if payload.status == "cancelled" and video and video.youtube_status == "scheduled":
            raise HTTPException(
                409,
                "This publication is scheduled on YouTube. Cancel or change it in YouTube Studio first. "
                "Katha Studio will not claim a remote cancellation it did not perform.",
            )
        publication.status = payload.status
        if video:
            if payload.status == "cancelled" and video.youtube_status != "scheduled":
                video.production_status = "READY_TO_UPLOAD" if video.final_video_path else "AWAITING_REVIEW"
                video.scheduled_at = None
            elif payload.status == "published":
                video.production_status = "PUBLISHED"
                video.published_at = payload.published_at or utcnow()
    for field in ["notes", "caption", "remote_url"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(publication, field, value)
    if payload.published_at is not None:
        publication.published_at = payload.published_at
    db.commit()
    return publication_dict(publication)


@router.post("/publishing/instagram/manual", status_code=201)
def prepare_instagram_manual(payload: PublicationCreate, db: Session = Depends(get_db)):
    video = db.get(Video, payload.video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    existing = (
        db.query(Publication)
        .filter(
            Publication.video_id == video.id,
            Publication.platform == "instagram",
            Publication.status.in_(["manual_ready", "scheduled", "published"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "An Instagram item already exists for this video.")
    publication = Publication(
        video_id=video.id,
        channel_id=video.channel_id,
        platform="instagram",
        status="manual_ready",
        scheduled_at=parse_datetime(payload.scheduled_at),
        caption=payload.caption,
        notes=payload.notes or "Manual Instagram workflow. Katha Studio does not publish automatically.",
    )
    db.add(publication)
    db.commit()
    db.refresh(publication)
    return {
        **publication_dict(publication),
        "manual_workflow": True,
        "message": "Instagram is prepared as a manual workflow. Katha Studio does not claim automatic publishing.",
    }


@router.get("/calendar")
def calendar_events(
    start: str | None = None,
    end: str | None = None,
    channel_id: int | None = None,
    platform: str | None = None,
    db: Session = Depends(get_db),
):
    now = utcnow()
    try:
        start_dt = parse_datetime(start) if start else now - timedelta(days=15)
        end_dt = parse_datetime(end) if end else now + timedelta(days=45)
    except ValueError:
        raise HTTPException(400, "Invalid calendar date range.")
    if not start_dt or not end_dt or end_dt <= start_dt:
        raise HTTPException(400, "The calendar end date must be after the start date.")
    query = db.query(Publication).filter(
        or_(
            and_(Publication.scheduled_at >= start_dt, Publication.scheduled_at <= end_dt),
            and_(Publication.published_at >= start_dt, Publication.published_at <= end_dt),
        )
    )
    if channel_id:
        query = query.filter(Publication.channel_id == channel_id)
    if platform:
        query = query.filter(Publication.platform == platform)
    publications = query.order_by(Publication.scheduled_at).all()
    events = []
    for publication in publications:
        video = publication.video
        if not video:
            continue
        events.append(
            {
                **publication_dict(publication),
                "video": video_dict(db, video, compact=True),
                "channel_name": video.channel.name if video.channel else "",
            }
        )
    scheduled_video_ids = {
        item.video_id for item in db.query(Publication).filter(Publication.status.in_(["scheduled", "published"])).all()
    }
    draft_query = db.query(Video).filter(Video.archived.is_(False))
    if channel_id:
        draft_query = draft_query.filter(Video.channel_id == channel_id)
    drafts = []
    for video in draft_query.order_by(Video.updated_at.desc()).limit(80).all():
        if video.id in scheduled_video_ids:
            continue
        if video.production_status in {"PUBLISHED", "SCHEDULED", "ARCHIVED"}:
            continue
        drafts.append(video_dict(db, video, compact=True))
    failed = (
        db.query(UploadJob)
        .filter(UploadJob.status == "failed")
        .order_by(UploadJob.finished_at.desc())
        .limit(20)
        .all()
    )
    timezone_setting = db.get(AppSetting, "timezone")
    return {
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "timezone": timezone_setting.value if timezone_setting else "local",
        "events": events,
        "drafts": drafts[:40],
        "failed_uploads": [
            {**upload_job_dict(job), "video": video_dict(db, job.video, compact=True) if job.video else None}
            for job in failed
        ],
    }
