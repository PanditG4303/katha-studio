from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BrowserAccount, BrowserPublish, Video
from ..schemas import (
    BrowserAccountCreate,
    BrowserAccountUpdate,
    BrowserConfirmRequest,
    BrowserOpenRequest,
    BrowserPublishRequest,
)
from ..serializers import browser_publish_dict
from ..services import browser_manager
from ..services.browser_manager import PLATFORMS

router = APIRouter(prefix="/browser", tags=["browser"])
logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"queued", "preparing", "awaiting_confirmation", "publishing"}


@router.get("")
def browser_overview(db: Session = Depends(get_db)):
    browser_manager.ensure_profiles(db)
    accounts = (
        db.query(BrowserAccount)
        .filter(BrowserAccount.archived.is_(False))
        .order_by(BrowserAccount.platform, BrowserAccount.label)
        .all()
    )
    jobs = db.query(BrowserPublish).order_by(BrowserPublish.created_at.desc()).limit(40).all()
    return {
        "runtime": browser_manager.browser_runtime_status(),
        "accounts": [browser_manager.profile_dict(account) for account in accounts],
        "jobs": [browser_publish_dict(job, db) for job in jobs],
        "platforms": PLATFORMS,
        "security_note": (
            "Each account uses an isolated persistent Chromium profile. Sign in manually on the "
            "official website. Katha Studio never stores social passwords, cookies or session tokens."
        ),
    }


@router.post("/accounts")
def create_account(payload: BrowserAccountCreate, db: Session = Depends(get_db)):
    try:
        account = browser_manager.create_profile(db, payload.platform, payload.label)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return browser_manager.profile_dict(account)


@router.patch("/accounts/{account_id}")
def update_account(account_id: int, payload: BrowserAccountUpdate, db: Session = Depends(get_db)):
    account = db.get(BrowserAccount, account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(account, field, value)
    db.commit()
    return browser_manager.profile_dict(account)


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, confirm: bool = Query(False), db: Session = Depends(get_db)):
    account = db.get(BrowserAccount, account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    try:
        result = browser_manager.delete_profile(db, account, confirm)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return result


@router.post("/accounts/{account_id}/open")
def open_account(account_id: int, payload: BrowserOpenRequest, db: Session = Depends(get_db)):
    account = db.get(BrowserAccount, account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    if not browser_manager.browser_runtime_status()["automation_available"]:
        raise HTTPException(
            400,
            "Browser automation is not available. Install Python Playwright and Google Chrome or "
            "Microsoft Edge, then try again. You can still open the profile folder manually.",
        )
    try:
        result = browser_manager.get_runtime().open(account_id, headless=payload.headless)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"The browser profile could not be opened: {exc}") from exc
    db.refresh(account)
    return {"result": result, "account": browser_manager.profile_dict(account)}


@router.post("/accounts/{account_id}/close")
def close_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(BrowserAccount, account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    result = browser_manager.get_runtime().close(account_id)
    account.status = "closed"
    db.commit()
    return result


@router.post("/accounts/{account_id}/test")
def test_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(BrowserAccount, account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    if not browser_manager.browser_runtime_status()["automation_available"]:
        raise HTTPException(400, "Browser automation is not available on this computer.")
    try:
        result = browser_manager.get_runtime().test(account_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"The account could not be checked: {exc}") from exc
    db.refresh(account)
    return {"result": result, "account": browser_manager.profile_dict(account)}


@router.post("/publish")
def start_publish(payload: BrowserPublishRequest, db: Session = Depends(get_db)):
    if not payload.confirm:
        raise HTTPException(400, "Confirm that you reviewed the metadata before starting the upload.")
    video = db.get(Video, payload.video_id)
    if not video:
        raise HTTPException(404, "Video not found.")
    if not video.final_video_path or not Path(video.final_video_path).exists():
        raise HTTPException(400, "The final video file is missing on disk.")
    account = db.get(BrowserAccount, payload.browser_account_id)
    if not account:
        raise HTTPException(404, "Browser account not found.")
    if account.archived:
        raise HTTPException(400, "This browser account is archived.")
    if not account.identity_verified:
        raise HTTPException(
            400,
            "Test this browser account first. Katha Studio verifies the signed-in account identity "
            "before every upload.",
        )
    active = (
        db.query(BrowserPublish)
        .filter(
            BrowserPublish.video_id == video.id,
            BrowserPublish.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if active:
        raise HTTPException(409, f"This video already has an active publish job (#{active.id}).")
    if payload.scheduled_at and account.platform != "youtube":
        raise HTTPException(
            400,
            "Instagram's web interface does not support reliable scheduled publishing in this workflow.",
        )
    job = BrowserPublish(
        video_id=video.id,
        browser_account_id=account.id,
        platform=account.platform,
        action="publish",
        status="queued",
        stage="Queued",
        title=payload.title[:300],
        description=payload.description,
        tags=payload.tags,
        visibility=payload.visibility,
        scheduled_at=payload.scheduled_at,
        confirmation_required=True,
        attempts=1,
    )
    db.add(job)
    video.selected_agent = video.selected_agent or ""
    video.browser_account_id = account.id
    video.platform = account.platform
    db.commit()
    db.refresh(job)
    metadata = {
        "title": payload.title,
        "description": payload.description,
        "tags": payload.tags,
        "visibility": payload.visibility,
        "scheduled_at": payload.scheduled_at.isoformat() if payload.scheduled_at else None,
    }
    browser_manager.get_runtime().start_publish(account.id, job.id, video.id, metadata)
    return browser_publish_dict(job, db)


@router.get("/publishes")
def list_publishes(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(BrowserPublish).order_by(BrowserPublish.created_at.desc())
    if status:
        query = query.filter(BrowserPublish.status == status)
    jobs = query.limit(limit).all()
    return {"jobs": [browser_publish_dict(job, db) for job in jobs]}


@router.get("/publishes/{job_id}")
def get_publish(job_id: int, db: Session = Depends(get_db)):
    job = db.get(BrowserPublish, job_id)
    if not job:
        raise HTTPException(404, "Publish job not found.")
    return browser_publish_dict(job, db)


@router.post("/publishes/{job_id}/confirm")
def confirm_publish(job_id: int, payload: BrowserConfirmRequest, db: Session = Depends(get_db)):
    job = db.get(BrowserPublish, job_id)
    if not job:
        raise HTTPException(404, "Publish job not found.")
    if not payload.confirm:
        raise HTTPException(400, "Explicit confirmation is required.")
    if job.status != "awaiting_confirmation":
        raise HTTPException(409, f"This job is {job.status}, not awaiting confirmation.")
    result = browser_manager.get_runtime().confirm(job_id)
    if not result.get("ok"):
        raise HTTPException(409, result.get("error", "The confirmation could not be delivered."))
    return {"ok": True, "job": browser_publish_dict(job, db)}


@router.post("/publishes/{job_id}/cancel")
def cancel_publish(job_id: int, db: Session = Depends(get_db)):
    job = db.get(BrowserPublish, job_id)
    if not job:
        raise HTTPException(404, "Publish job not found.")
    browser_manager.get_runtime().cancel(job_id)
    if job.status in ACTIVE_STATUSES:
        job.status = "cancelled"
        job.stage = "Cancelled before publishing"
        job.finished_at = __import__("datetime").datetime.utcnow()
        db.commit()
    return {"ok": True, "job": browser_publish_dict(job, db)}


@router.post("/publishes/{job_id}/retry")
def retry_publish(job_id: int, db: Session = Depends(get_db)):
    job = db.get(BrowserPublish, job_id)
    if not job:
        raise HTTPException(404, "Publish job not found.")
    if job.status in ACTIVE_STATUSES:
        raise HTTPException(409, "This job is still active.")
    video = db.get(Video, job.video_id)
    account = db.get(BrowserAccount, job.browser_account_id)
    if not video or not account:
        raise HTTPException(400, "The video or browser account no longer exists.")
    if not account.identity_verified:
        raise HTTPException(400, "Test the browser account before retrying.")
    job.status = "queued"
    job.stage = "Queued for retry"
    job.error = ""
    job.remote_url = ""
    job.remote_id = ""
    job.screenshot_path = None
    job.confirmed_at = None
    job.finished_at = None
    job.started_at = None
    job.attempts = (job.attempts or 0) + 1
    job.log = (job.log or "") + f"\n--- Retry attempt {job.attempts} ---\n"
    db.commit()
    metadata = {
        "title": job.title,
        "description": job.description,
        "tags": job.tags or [],
        "visibility": job.visibility,
        "scheduled_at": job.scheduled_at.isoformat() if job.scheduled_at else None,
    }
    browser_manager.get_runtime().start_publish(account.id, job.id, video.id, metadata)
    return browser_publish_dict(job, db)
