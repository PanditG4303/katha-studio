from __future__ import annotations

import base64
import hashlib
import html
import json
import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from ..database import SessionLocal, utcnow
from ..models import AppSetting, Publication, SocialAccount, UploadJob, Video
from ..utils import parse_datetime
from . import credentials

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
YOUTUBE_API = "https://www.googleapis.com/youtube/v3"
UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]
PENDING: dict[str, dict] = {}
PENDING_LOCK = threading.Lock()


class YouTubeError(RuntimeError):
    pass


def _client_secret_key() -> str:
    return "youtube_oauth_client"


def get_client_id(db: Session) -> str:
    setting = db.get(AppSetting, "youtube_client_id")
    return str(setting.value) if setting and setting.value else ""


def get_client_credentials(db: Session) -> tuple[str, str]:
    client_id = get_client_id(db)
    stored = credentials.get_json_secret(_client_secret_key()) or {}
    client_secret = stored.get("client_secret", "")
    if not client_id or not client_secret:
        raise YouTubeError(
            "Add a Google OAuth Desktop client ID and secret in Connections. "
            "Katha Studio uses the official YouTube Data API and never asks for your Google password."
        )
    return client_id, client_secret


def save_client_credentials(db: Session, client_id: str, client_secret: str) -> None:
    if not client_id.strip() or not client_secret.strip():
        raise YouTubeError("Both the Google OAuth client ID and client secret are required.")
    credentials.set_json_secret(_client_secret_key(), {"client_secret": client_secret.strip()})
    setting = db.get(AppSetting, "youtube_client_id") or AppSetting(key="youtube_client_id")
    setting.value = client_id.strip()
    db.add(setting)
    db.commit()


def client_status(db: Session) -> dict:
    configured = bool(get_client_id(db)) and credentials.has_secret(_client_secret_key())
    return {
        "configured": configured,
        "client_id": get_client_id(db),
        "secret_saved": credentials.has_secret(_client_secret_key()),
        "redirect_note": "Use the OAuth callback on the local Katha Studio backend. Desktop OAuth clients allow loopback redirects.",
        "scopes": SCOPES,
    }


def build_auth_url(db: Session, redirect_uri: str) -> dict:
    client_id, _ = get_client_credentials(db)
    state = secrets.token_urlsafe(28)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    with PENDING_LOCK:
        PENDING[state] = {
            "verifier": verifier,
            "redirect_uri": redirect_uri,
            "created": time.time(),
        }
        for key, value in list(PENDING.items()):
            if time.time() - value["created"] > 900:
                PENDING.pop(key, None)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "include_granted_scopes": "true",
    }
    return {
        "auth_url": f"{AUTH_URL}?{urlencode(params)}",
        "state": state,
        "redirect_uri": redirect_uri,
        "expires_in": 900,
    }


def handle_oauth_callback(db: Session, code: str, state: str, error: str | None = None) -> dict:
    if error:
        raise YouTubeError(f"Google authorization was not completed: {error}")
    with PENDING_LOCK:
        pending = PENDING.pop(state, None)
    if not pending:
        raise YouTubeError("This Google authorization request expired or was already used. Start the connection again.")
    client_id, client_secret = get_client_credentials(db)
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": pending["redirect_uri"],
        "code_verifier": pending["verifier"],
    }
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(TOKEN_URL, data=data)
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach Google OAuth: {exc}") from exc
    if response.status_code >= 400:
        raise YouTubeError(_oauth_error(response))
    token = response.json()
    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")
    if not access_token:
        raise YouTubeError("Google did not return an access token.")
    channel = _fetch_channel(access_token)
    account_id = channel.get("id")
    if not account_id:
        raise YouTubeError("No YouTube channel was found for this Google account.")
    snippet = channel.get("snippet") or {}
    account = (
        db.query(SocialAccount)
        .filter(SocialAccount.provider == "youtube", SocialAccount.account_id == account_id)
        .first()
    )
    token_ref = f"youtube_account_{secrets.token_urlsafe(12)}"
    token_payload = {
        "access_token": access_token,
        "refresh_token": refresh_token or "",
        "expires_at": int(time.time()) + int(token.get("expires_in") or 3600),
        "scope": token.get("scope") or " ".join(SCOPES),
        "token_type": token.get("token_type") or "Bearer",
    }
    credentials.set_json_secret(token_ref, token_payload)
    if account:
        old_ref = account.token_ref
        account.account_name = snippet.get("title") or account_id
        account.handle = snippet.get("customUrl") or ""
        account.avatar_url = (snippet.get("thumbnails") or {}).get("default", {}).get("url", "")
        account.token_ref = token_ref
        account.scopes = SCOPES
        account.status = "connected"
        account.last_synced_at = utcnow()
        if old_ref and old_ref != token_ref:
            credentials.delete_secret(old_ref)
    else:
        account = SocialAccount(
            provider="youtube",
            account_id=account_id,
            account_name=snippet.get("title") or account_id,
            handle=snippet.get("customUrl") or "",
            avatar_url=(snippet.get("thumbnails") or {}).get("default", {}).get("url", ""),
            token_ref=token_ref,
            scopes=SCOPES,
            status="connected",
            last_synced_at=utcnow(),
        )
        db.add(account)
    db.commit()
    db.refresh(account)
    return {"account_id": account.id, "channel_name": account.account_name, "channel_id": account.account_id}


def _fetch_channel(access_token: str) -> dict:
    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{YOUTUBE_API}/channels",
                params={"part": "snippet,contentDetails", "mine": "true"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach YouTube: {exc}") from exc
    if response.status_code >= 400:
        raise YouTubeError(_google_error(response, "fetch the YouTube channel"))
    items = response.json().get("items") or []
    if not items:
        raise YouTubeError("No YouTube channel was found for this Google account.")
    return items[0]


def _oauth_error(response: httpx.Response) -> str:
    try:
        detail = response.json().get("error_description") or response.json().get("error") or ""
    except Exception:
        detail = response.text[:300]
    if response.status_code == 400 and "redirect_uri" in str(detail).lower():
        return (
            "Google rejected the OAuth redirect. Confirm the OAuth client type is Desktop app and "
            "try connecting again from Katha Studio."
        )
    return f"Google OAuth failed ({response.status_code}). {detail}".strip()


def _google_error(response: httpx.Response, action: str) -> str:
    detail = ""
    reason = ""
    try:
        payload = response.json()
        error = payload.get("error") or {}
        if isinstance(error, dict):
            detail = error.get("message") or ""
            errors = error.get("errors") or []
            if errors and isinstance(errors, list):
                reason = (errors[0] or {}).get("reason", "")
        elif error:
            detail = str(error)
    except Exception:
        detail = response.text[:300]
    if reason in {"quotaExceeded", "dailyLimitExceeded"} or response.status_code == 403 and "quota" in detail.lower():
        return (
            "YouTube API quota is exhausted for this Google Cloud project. Wait for the quota reset, "
            "request a quota increase, or use a different OAuth client/project."
        )
    if reason in {"uploadLimitExceeded", "youtubeSignupRequired"}:
        return "YouTube does not allow uploads for this account or has reached its upload limit."
    if response.status_code == 401:
        return "The YouTube authorization expired. Refresh the connection in Connections & Settings."
    if response.status_code == 403:
        return f"YouTube denied this action. {detail}".strip()
    return f"Could not {action} ({response.status_code}). {detail}".strip()


def get_access_token(db: Session, account: SocialAccount, force_refresh: bool = False) -> str:
    token = credentials.get_json_secret(account.token_ref)
    if not token:
        raise YouTubeError("This YouTube account's secure token is missing. Reconnect the account.")
    expires_at = int(token.get("expires_at") or 0)
    if not force_refresh and expires_at > time.time() + 90:
        return str(token["access_token"])
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        raise YouTubeError("The YouTube refresh token is missing. Reconnect the account.")
    client_id, client_secret = get_client_credentials(db)
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(
                TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach Google to refresh the connection: {exc}") from exc
    if response.status_code >= 400:
        account.status = "error"
        db.commit()
        raise YouTubeError(_oauth_error(response))
    data = response.json()
    token["access_token"] = data.get("access_token")
    token["expires_at"] = int(time.time()) + int(data.get("expires_in") or 3600)
    if data.get("refresh_token"):
        token["refresh_token"] = data["refresh_token"]
    credentials.set_json_secret(account.token_ref, token)
    account.status = "connected"
    account.last_synced_at = utcnow()
    db.commit()
    return str(token["access_token"])


def test_account(db: Session, account: SocialAccount) -> dict:
    token = get_access_token(db, account, force_refresh=True)
    channel = _fetch_channel(token)
    account.account_name = (channel.get("snippet") or {}).get("title") or account.account_name
    account.last_synced_at = utcnow()
    account.status = "connected"
    db.commit()
    return {"ok": True, "account_name": account.account_name, "account_id": account.account_id}


def disconnect_account(db: Session, account: SocialAccount) -> None:
    if account.token_ref:
        credentials.delete_secret(account.token_ref)
    for video in db.query(Video).filter(Video.youtube_account_id == account.id).all():
        video.youtube_account_id = None
    db.delete(account)
    db.commit()


def run_youtube_upload_job(*, job_id: int, payload: dict, progress, check_cancel) -> dict:
    upload_job_id = int(payload["upload_job_id"])
    with SessionLocal() as db:
        upload_job = db.get(UploadJob, upload_job_id)
        if not upload_job:
            raise ValueError("Upload job not found.")
        video = db.get(Video, upload_job.video_id)
        account = db.get(SocialAccount, upload_job.account_id) if upload_job.account_id else None
        if not video or not account:
            raise YouTubeError("The video or YouTube account for this upload no longer exists.")
        if not video.final_video_path or not Path(video.final_video_path).exists():
            raise YouTubeError("The final video file is missing. Import or relink the video first.")
        metadata = upload_job.metadata_json or {}
        upload_job.status = "uploading"
        upload_job.started_at = utcnow()
        upload_job.progress = 2
        video.youtube_status = "uploading"
        db.commit()
        try:
            progress(2, "Validating the upload…")
            file_path = Path(video.final_video_path)
            title = str(metadata.get("title") or video.title).strip()[:100]
            if not title:
                raise YouTubeError("A YouTube title is required.")
            description = str(metadata.get("description") or video.description or "")[:5000]
            tags = _limit_tags(metadata.get("tags") or video.tags or [])
            category_id = str(metadata.get("category_id") or "24")
            privacy = str(metadata.get("privacy") or "private")
            if privacy not in {"private", "unlisted", "public"}:
                raise YouTubeError("Visibility must be private, unlisted or public.")
            publish_at = parse_datetime(metadata.get("publish_at"))
            if publish_at and publish_at <= utcnow() + timedelta(minutes=1):
                raise YouTubeError("A YouTube scheduled time must be at least one minute in the future.")
            if publish_at and privacy != "private":
                raise YouTubeError("YouTube requires scheduled videos to be private until the scheduled time.")
            token = get_access_token(db, account)
            progress(6, "Creating a resumable YouTube upload…")
            body = {
                "snippet": {
                    "title": title,
                    "description": description,
                    "tags": tags,
                    "categoryId": category_id,
                },
                "status": {
                    "privacyStatus": privacy,
                    "selfDeclaredMadeForKids": bool(metadata.get("made_for_kids", False)),
                },
            }
            if publish_at:
                body["status"]["publishAt"] = publish_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": str(file_path.stat().st_size),
                "X-Upload-Content-Type": "video/mp4",
            }
            try:
                with httpx.Client(timeout=60) as client:
                    response = client.post(
                        f"{UPLOAD_API}/videos",
                        params={"uploadType": "resumable", "part": "snippet,status"},
                        headers=headers,
                        json=body,
                    )
            except httpx.HTTPError as exc:
                raise YouTubeError(f"Could not start the YouTube upload: {exc}") from exc
            if response.status_code >= 400:
                raise YouTubeError(_google_error(response, "start the YouTube upload"))
            upload_url = response.headers.get("Location")
            if not upload_url:
                raise YouTubeError("YouTube did not return a resumable upload URL.")
            progress(10, "Uploading video to YouTube…")
            result = _upload_file_chunks(db, upload_job, video, upload_url, token, file_path, progress, check_cancel)
            remote_id = result.get("id")
            if not remote_id:
                raise YouTubeError("YouTube did not return a video ID.")
            remote_status = (result.get("status") or {}).get("publishAt")
            confirmed_scheduled = bool(publish_at and remote_status)
            url = f"https://www.youtube.com/watch?v={remote_id}"
            warnings = []
            progress(92, "Uploading thumbnail…")
            if metadata.get("thumbnail_path") and Path(metadata["thumbnail_path"]).exists():
                thumb_result = _upload_thumbnail(token, remote_id, Path(metadata["thumbnail_path"]))
                if not thumb_result.get("ok"):
                    warnings.append(thumb_result.get("error", "Thumbnail upload failed."))
            progress(95, "Uploading subtitles…")
            if metadata.get("subtitle_path") and Path(metadata["subtitle_path"]).exists():
                caption_result = _upload_captions(token, remote_id, Path(metadata["subtitle_path"]))
                if not caption_result.get("ok"):
                    warnings.append(caption_result.get("error", "Subtitle upload failed."))
            upload_job.status = "completed"
            upload_job.progress = 100
            upload_job.remote_video_id = remote_id
            upload_job.remote_url = url
            upload_job.finished_at = utcnow()
            upload_job.error = ""
            video.youtube_video_id = remote_id
            video.youtube_url = url
            video.youtube_account_id = account.id
            video.youtube_status = "scheduled" if confirmed_scheduled else privacy
            video.scheduled_at = publish_at if confirmed_scheduled else None
            video.published_at = utcnow() if privacy == "public" else None
            video.production_status = (
                "SCHEDULED" if confirmed_scheduled else "PUBLISHED" if privacy == "public" else "AWAITING_REVIEW"
            )
            publication = (
                db.query(Publication)
                .filter(Publication.video_id == video.id, Publication.platform == "youtube")
                .order_by(Publication.created_at.desc())
                .first()
            )
            if not publication:
                publication = Publication(video_id=video.id, platform="youtube")
                db.add(publication)
            publication.channel_id = video.channel_id
            publication.account_id = account.id
            publication.status = (
                "scheduled" if confirmed_scheduled else "published" if privacy == "public" else "uploaded"
            )
            publication.scheduled_at = publish_at if confirmed_scheduled else None
            publication.published_at = utcnow() if not confirmed_scheduled and privacy == "public" else None
            publication.remote_url = url
            publication.caption = description[:1000]
            db.commit()
            progress(100, "YouTube upload complete")
            return {
                "video_id": video.id,
                "youtube_video_id": remote_id,
                "youtube_url": url,
                "visibility": privacy,
                "scheduled": confirmed_scheduled,
                "scheduled_at": publish_at.isoformat() if confirmed_scheduled and publish_at else None,
                "warnings": warnings,
                "message": (
                    "YouTube confirmed the scheduled upload."
                    if confirmed_scheduled
                    else "Video uploaded to YouTube."
                ),
            }
        except Exception as exc:
            upload_job.status = "failed"
            upload_job.error = str(exc)[:3000]
            upload_job.finished_at = utcnow()
            video.youtube_status = "failed"
            db.commit()
            raise


def reschedule_youtube_video(db: Session, video: Video, publish_at: datetime) -> dict:
    if not video.youtube_video_id or not video.youtube_account_id:
        raise YouTubeError("This video is not linked to an uploaded YouTube video.")
    if publish_at <= utcnow() + timedelta(minutes=1):
        raise YouTubeError("Choose a future YouTube publication time.")
    account = db.get(SocialAccount, video.youtube_account_id)
    if not account:
        raise YouTubeError("The YouTube account for this video is no longer connected.")
    token = get_access_token(db, account)
    body = {
        "id": video.youtube_video_id,
        "status": {
            "privacyStatus": "private",
            "publishAt": publish_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        },
    }
    try:
        with httpx.Client(timeout=30) as client:
            response = client.put(
                f"{YOUTUBE_API}/videos",
                params={"part": "status"},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=body,
            )
    except httpx.HTTPError as exc:
        raise YouTubeError(f"Could not reach YouTube to reschedule: {exc}") from exc
    if response.status_code >= 400:
        raise YouTubeError(_google_error(response, "reschedule the video"))
    data = response.json()
    confirmed = (data.get("status") or {}).get("publishAt")
    if not confirmed:
        raise YouTubeError(
            "YouTube did not confirm the new schedule. The previous schedule may still be active; check YouTube Studio."
        )
    video.scheduled_at = publish_at
    video.youtube_status = "scheduled"
    video.production_status = "SCHEDULED"
    db.commit()
    return {"ok": True, "publish_at": confirmed}


def _upload_file_chunks(
    db: Session,
    upload_job: UploadJob,
    video: Video,
    upload_url: str,
    token: str,
    file_path: Path,
    progress,
    check_cancel,
) -> dict:
    total = file_path.stat().st_size
    chunk_size = 8 * 1024 * 1024
    offset = 0
    result = None
    with open(file_path, "rb") as handle, httpx.Client(timeout=600) as client:
        while offset < total:
            check_cancel()
            handle.seek(offset)
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            end = offset + len(chunk) - 1
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Length": str(len(chunk)),
                "Content-Range": f"bytes {offset}-{end}/{total}",
                "Content-Type": "video/mp4",
            }
            response = None
            for attempt in range(3):
                try:
                    response = client.put(upload_url, headers=headers, content=chunk)
                except httpx.HTTPError as exc:
                    if attempt == 2:
                        raise YouTubeError(f"Upload connection failed: {exc}") from exc
                    time.sleep(2 + attempt * 2)
                    continue
                if response.status_code in {500, 502, 503, 504} and attempt < 2:
                    time.sleep(2 + attempt * 2)
                    continue
                break
            assert response is not None
            if response.status_code in {200, 201}:
                result = response.json()
                offset = total
            elif response.status_code == 308:
                range_header = response.headers.get("Range", "")
                if range_header:
                    try:
                        offset = int(range_header.split("-")[-1]) + 1
                    except ValueError:
                        offset = end + 1
                else:
                    offset = end + 1
            elif response.status_code == 401:
                raise YouTubeError("YouTube authorization expired during upload. Refresh the connection and retry.")
            else:
                raise YouTubeError(_google_error(response, "upload the video"))
            percent = min(90, 10 + int((offset / max(total, 1)) * 80))
            upload_job.progress = percent
            video.youtube_status = "uploading"
            db.commit()
            progress(percent, f"Uploading to YouTube… {min(100, int(offset / max(total, 1) * 100))}%")
    if not result:
        raise YouTubeError("YouTube did not confirm the completed upload. Retry the upload.")
    return result


def _upload_thumbnail(token: str, video_id: str, path: Path) -> dict:
    content_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    try:
        with httpx.Client(timeout=120) as client:
            response = client.post(
                f"{UPLOAD_API}/thumbnails/set",
                params={"videoId": video_id, "uploadType": "media"},
                headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
                content=path.read_bytes(),
            )
        if response.status_code >= 400:
            return {"ok": False, "error": _google_error(response, "upload the thumbnail")}
        return {"ok": True}
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Thumbnail upload failed: {exc}"}


def _upload_captions(token: str, video_id: str, path: Path) -> dict:
    language = "hi"
    try:
        snippet = json.dumps(
            {"snippet": {"videoId": video_id, "language": language, "name": "Katha Studio subtitles", "isDraft": False}},
            ensure_ascii=False,
        )
        boundary = f"katha_{secrets.token_hex(12)}"
        body = (
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{snippet}\r\n"
            f"--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8") + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
        with httpx.Client(timeout=120) as client:
            response = client.post(
                f"{UPLOAD_API}/captions",
                params={"part": "snippet", "uploadType": "multipart"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                content=body,
            )
        if response.status_code >= 400:
            return {"ok": False, "error": _google_error(response, "upload captions")}
        return {"ok": True}
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"Caption upload failed: {exc}"}


def _limit_tags(tags: Any) -> list[str]:
    if not isinstance(tags, list):
        return []
    output = []
    total = 0
    for tag in tags:
        value = str(tag).strip().replace("<", "").replace(">", "")
        if not value:
            continue
        if total + len(value) > 480:
            break
        output.append(value[:60])
        total += len(value) + 1
    return output


def refresh_all_accounts(db: Session) -> list[dict]:
    results = []
    for account in db.query(SocialAccount).filter(SocialAccount.provider == "youtube").all():
        try:
            info = test_account(db, account)
            results.append({"id": account.id, "ok": True, "name": account.account_name, **info})
        except Exception as exc:
            results.append({"id": account.id, "ok": False, "error": str(exc)})
    return results
