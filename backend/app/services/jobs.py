from __future__ import annotations

import logging
import os
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from sqlalchemy.orm import Session

from ..database import SessionLocal, utcnow
from ..models import JobRecord

logger = logging.getLogger(__name__)

SYNC_JOBS = os.environ.get("KATHA_SYNC_JOBS", "").lower() in {"1", "true", "yes"}
_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="katha-job")
_lock = threading.Lock()


class JobCancelled(RuntimeError):
    pass


def _update(job_id: int, **values: Any) -> None:
    with SessionLocal() as db:
        job = db.get(JobRecord, job_id)
        if not job:
            return
        for key, value in values.items():
            setattr(job, key, value)
        db.commit()


def _cancelled(job_id: int) -> bool:
    with SessionLocal() as db:
        job = db.get(JobRecord, job_id)
        return bool(job and job.cancel_requested)


def _runner(job_id: int, func: Callable[..., dict], payload: dict) -> None:
    _update(job_id, status="running", started_at=utcnow(), message="Starting…")

    def progress(value: float, message: str = "") -> None:
        if _cancelled(job_id):
            raise JobCancelled("Cancelled by user.")
        _update(job_id, progress=max(0.0, min(100.0, float(value))), message=message[:1000])

    def check_cancel() -> None:
        if _cancelled(job_id):
            raise JobCancelled("Cancelled by user.")

    try:
        result = func(job_id=job_id, payload=payload, progress=progress, check_cancel=check_cancel) or {}
        _update(
            job_id,
            status="completed",
            progress=100,
            message="Completed",
            result=result,
            finished_at=utcnow(),
        )
    except JobCancelled as exc:
        _update(job_id, status="cancelled", message=str(exc), finished_at=utcnow())
    except Exception as exc:
        logger.exception("Background job %s failed", job_id)
        message = str(exc) or exc.__class__.__name__
        _update(
            job_id,
            status="failed",
            message=message[:1500],
            error=message[:4000],
            finished_at=utcnow(),
        )


def submit_job(
    db: Session,
    job_type: str,
    payload: dict,
    func: Callable[..., dict],
) -> JobRecord:
    job = JobRecord(type=job_type, status="queued", payload=payload, message="Queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id
    if SYNC_JOBS:
        _runner(job_id, func, payload)
        db.expire_all()
        return db.get(JobRecord, job_id)  # type: ignore[return-value]
    _executor.submit(_runner, job_id, func, payload)
    return job


def mark_interrupted_jobs() -> None:
    with SessionLocal() as db:
        jobs = db.query(JobRecord).filter(JobRecord.status.in_(["queued", "running"])).all()
        for job in jobs:
            job.status = "failed"
            job.error = "Katha Studio closed before this job finished. You can safely retry it."
            job.message = job.error
            job.finished_at = utcnow()
        db.commit()
        if jobs:
            logger.warning("Marked %s interrupted jobs as failed", len(jobs))


def request_cancel(db: Session, job_id: int) -> JobRecord:
    job = db.get(JobRecord, job_id)
    if not job:
        raise ValueError("Job not found")
    if job.status in {"completed", "failed", "cancelled"}:
        return job
    job.cancel_requested = True
    job.message = "Cancelling safely at the next checkpoint…"
    db.commit()
    return job


def job_to_dict(job: JobRecord) -> dict:
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "result": job.result or {},
        "payload": job.payload or {},
        "cancel_requested": job.cancel_requested,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
