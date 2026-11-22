"""Real browser publishing workflows with explicit confirmation gates.

Selectors are best-effort against the official web interfaces. If the site does
not confirm an action, Katha Studio records a failure or a manual-required state
instead of claiming success.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from ..config import BROWSER_SCREENSHOT_DIR
from ..database import SessionLocal, utcnow
from ..models import BrowserAccount, BrowserPublish, Publication, Video
from .browser_manager import PLATFORMS, update_account

logger = logging.getLogger(__name__)

CHALLENGE_PHRASES = [
    "unusual traffic",
    "captcha",
    "verify it's you",
    "verify it’s you",
    "two-step verification",
    "2-step verification",
    "confirm your identity",
    "security check",
    "suspicious activity",
    "challenge",
]


def _job(job_id: int):
    with SessionLocal() as db:
        job = db.get(BrowserPublish, job_id)
        if not job:
            return None
        return job


def _update(job_id: int, **values: Any) -> None:
    with SessionLocal() as db:
        job = db.get(BrowserPublish, job_id)
        if not job:
            return
        for key, value in values.items():
            if hasattr(job, key):
                setattr(job, key, value)
        db.commit()


def _log(job_id: int, message: str) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {message}\n"
    with SessionLocal() as db:
        job = db.get(BrowserPublish, job_id)
        if job:
            job.log = ((job.log or "") + line)[-60000:]
            db.commit()
    logger.info("Browser publish %s: %s", job_id, message)


def _screenshot(page, job_id: int, label: str) -> str | None:
    try:
        BROWSER_SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        target = BROWSER_SCREENSHOT_DIR / f"publish-{job_id:04d}-{label}-{int(time.time())}.png"
        page.screenshot(path=str(target), full_page=False)
        _update(job_id, screenshot_path=str(target))
        return str(target)
    except Exception:
        logger.debug("Screenshot failed", exc_info=True)
        return None


def _body_text(page) -> str:
    try:
        return (page.locator("body").inner_text(timeout=5000) or "").lower()
    except Exception:
        return ""


def _challenge(page) -> str:
    text = _body_text(page)
    for phrase in CHALLENGE_PHRASES:
        if phrase in text:
            return phrase
    return ""


def _wait(page, seconds: float) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def _first_text(page, selectors: list[str], timeout: int = 2500) -> str:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible(timeout=timeout):
                value = (locator.inner_text(timeout=timeout) or "").strip()
                if value:
                    return value
        except Exception:
            continue
    return ""


def _click_text(page, texts: list[str], timeout: int = 4000) -> bool:
    for text in texts:
        try:
            locator = page.get_by_text(text, exact=False).first
            if locator.count() and locator.is_visible(timeout=timeout):
                locator.click(timeout=timeout)
                return True
        except Exception:
            continue
    # Polymer buttons often expose text in a nested node.
    for text in texts:
        try:
            clicked = page.evaluate(
                """(label) => {
                    const candidates = Array.from(document.querySelectorAll('button, tp-yt-paper-item, div[role="button"], ytcp-button, a'));
                    const target = candidates.find((el) => (el.innerText || '').trim().toLowerCase().includes(label.toLowerCase()));
                    if (!target) return false;
                    target.click();
                    return true;
                }""",
                text,
            )
            if clicked:
                return True
        except Exception:
            continue
    return False


def _click(page, selectors: list[str], timeout: int = 8000) -> bool:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible(timeout=timeout):
                locator.click(timeout=timeout)
                return True
        except Exception:
            continue
    return False


def _set_editable(page, selectors: list[str], text: str, job_id: int, label: str) -> bool:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if not locator.count() or not locator.is_visible(timeout=3000):
                continue
            locator.click(timeout=5000)
            page.keyboard.press("Control+A")
            page.keyboard.insert_text(text)
            _log(job_id, f"Filled {label}.")
            return True
        except Exception:
            continue
    _log(job_id, f"Could not fill {label}; the site may have changed.")
    return False


def _detect_youtube(page) -> dict:
    try:
        page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=45_000)
    except Exception as exc:
        return {"status": "error", "verified": False, "identity": "", "error": f"YouTube Studio did not load: {exc}"}
    _wait(page, 4)
    url = page.url or ""
    if "accounts.google.com" in url or "/signin" in url:
        return {
            "status": "login_required",
            "verified": False,
            "identity": "",
            "error": "This profile is not signed in to YouTube. Open the profile and sign in manually.",
        }
    challenge = _challenge(page)
    if challenge:
        return {
            "status": "challenge",
            "verified": False,
            "identity": "",
            "error": f"YouTube requested manual verification ({challenge}). Complete it in the opened browser.",
        }
    identity = _first_text(
        page,
        [
            "ytcp-navigation-drawer #channel-name",
            "#channel-name",
            "ytcp-account-settings #channel-name",
            "ytd-topbar-menu-button-renderer #channel-name",
        ],
    )
    if not identity:
        try:
            label = page.locator("#avatar-btn").first.get_attribute("aria-label", timeout=3000) or ""
            if label and "account" not in label.lower():
                identity = label.strip()
        except Exception:
            pass
    if not identity:
        try:
            title = page.title() or ""
            if " - YouTube Studio" in title:
                candidate = title.split(" - YouTube Studio")[0].strip()
                if candidate and candidate.lower() != "youtube studio":
                    identity = candidate
        except Exception:
            pass
    if identity:
        return {"status": "logged_in", "verified": True, "identity": identity[:300], "error": ""}
    return {
        "status": "logged_in_unverified",
        "verified": False,
        "identity": "",
        "error": (
            "A YouTube session exists but the channel identity could not be read. Katha Studio will not "
            "upload until the channel name is visible in YouTube Studio."
        ),
    }


def _detect_instagram(page) -> dict:
    try:
        page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=45_000)
    except Exception as exc:
        return {"status": "error", "verified": False, "identity": "", "error": f"Instagram did not load: {exc}"}
    _wait(page, 4)
    url = page.url or ""
    if "/accounts/login" in url or "/accounts/emailsignup" in url:
        return {
            "status": "login_required",
            "verified": False,
            "identity": "",
            "error": "This profile is not signed in to Instagram. Open the profile and sign in manually.",
        }
    challenge = _challenge(page)
    if challenge:
        return {
            "status": "challenge",
            "verified": False,
            "identity": "",
            "error": f"Instagram requested manual verification ({challenge}). Complete it in the opened browser.",
        }
    username = ""
    try:
        hrefs = page.eval_on_selector_all(
            'a[role="link"], a[href]',
            "els => els.map(el => el.getAttribute('href') || '')",
        )
        excluded = {
            "/",
            "/explore/",
            "/reels/",
            "/direct/",
            "/accounts/",
            "/emails/",
            "/about/",
            "/developer/",
            "/legal/",
        }
        for href in hrefs:
            if re.fullmatch(r"/[A-Za-z0-9._]{2,40}/", href or "") and href not in excluded:
                username = href.strip("/")
                break
    except Exception:
        pass
    if username:
        return {"status": "logged_in", "verified": True, "identity": f"@{username}", "error": ""}
    return {
        "status": "logged_in_unverified",
        "verified": False,
        "identity": "",
        "error": (
            "An Instagram session exists but the account identity could not be read. Katha Studio will "
            "not publish until the profile is identifiable."
        ),
    }


def detect_identity(page, platform: str) -> dict:
    if platform == "youtube":
        return _detect_youtube(page)
    if platform == "instagram":
        return _detect_instagram(page)
    return {"status": "error", "verified": False, "identity": "", "error": "Unsupported platform."}


# --------------------------------------------------------------------- entrypoint
def run_publish(worker, command: dict) -> dict:
    job_id = int(command["job_id"])
    video_id = int(command["video_id"])
    metadata = command.get("metadata") or {}
    worker._current_confirm = command.get("confirm")  # noqa: SLF001 - scoped to this job
    worker._current_cancel = command.get("cancel")  # noqa: SLF001
    with SessionLocal() as db:
        job = db.get(BrowserPublish, job_id)
        account = db.get(BrowserAccount, job.browser_account_id) if job else None
        video = db.get(Video, video_id)
        if not job or not account or not video:
            return {"ok": False, "error": "The publish job, account or video no longer exists."}
        platform = account.platform
        account_label = account.label
        video_path = video.final_video_path
        thumbnail_path = video.thumbnail_path
        subtitle_path = video.subtitle_path
    try:
        if not video_path or not Path(video_path).exists():
            raise RuntimeError("The final video file is missing on disk. Restore it and retry.")
        _update(job_id, status="preparing", stage="Opening the browser profile", started_at=utcnow(), attempts=1)
        _log(job_id, f"Opening the {PLATFORMS.get(platform, {}).get('label', platform)} profile: {account_label}")
        if not worker.context:
            worker._launch(headless=False)  # noqa: SLF001 - the worker owns its Playwright objects
        worker.is_open = True
        page = worker.page
        _log(job_id, "Verifying the signed-in account identity before any upload.")
        identity = detect_identity(page, platform)
        if not identity.get("verified"):
            _screenshot(page, job_id, "identity")
            raise RuntimeError(identity.get("error") or "The signed-in account identity could not be confirmed.")
        _log(job_id, f"Confirmed identity: {identity.get('identity')}")
        update_account(
            job.browser_account_id,
            status="logged_in",
            detected_identity=identity.get("identity", "")[:300],
            identity_verified=True,
            last_check_at=utcnow(),
            last_used_at=utcnow(),
            error="",
        )
        if platform == "youtube":
            result = _youtube(worker, page, job_id, video_id, metadata, identity, video_path, thumbnail_path, subtitle_path)
        elif platform == "instagram":
            result = _instagram(worker, page, job_id, video_id, metadata, identity, video_path)
        else:
            raise RuntimeError("Unsupported publishing platform.")
        return result
    except Exception as exc:  # noqa: BLE001
        message = str(exc)[:4000]
        logger.exception("Browser publish %s failed", job_id)
        _update(job_id, status="failed", stage="Failed", error=message, finished_at=utcnow())
        _log(job_id, f"Failed: {message}")
        with SessionLocal() as db:
            job = db.get(BrowserPublish, job_id)
            if job:
                update_account(job.browser_account_id, status="error", error=message[:2000])
        return {"ok": False, "error": message}


def _wait_for_confirmation(worker, job_id: int, page, confirm, cancel, platform: str) -> bool:
    _update(job_id, status="awaiting_confirmation", stage="Ready for your confirmation in Katha Studio")
    _log(job_id, "Stopped before the final platform action. Waiting for explicit confirmation.")
    _screenshot(page, job_id, "before-confirmation")
    deadline = time.time() + 900
    while time.time() < deadline:
        if cancel.is_set():
            _update(job_id, status="cancelled", stage="Cancelled before publishing", finished_at=utcnow())
            _log(job_id, "Cancelled by the user. Nothing was published.")
            return False
        if confirm.wait(1.5):
            _update(job_id, status="publishing", stage="Confirmed — completing the platform action", confirmed_at=utcnow())
            _log(job_id, "Confirmation received. Completing the action.")
            return True
        # The user may complete the action manually in the visible browser.
        text = _body_text(page)
        if platform == "youtube" and ("video published" in text or "video scheduled" in text):
            _update(job_id, status="publishing", stage="Detected manual completion", confirmed_at=utcnow())
            _log(job_id, "The browser shows the video was published or scheduled manually.")
            return True
        if platform == "instagram" and ("your post has been shared" in text or "post shared" in text):
            _update(job_id, status="publishing", stage="Detected manual completion", confirmed_at=utcnow())
            _log(job_id, "The browser shows the post was shared manually.")
            return True
    _update(
        job_id,
        status="manual_required",
        stage="Confirmation timed out",
        error="No confirmation was received within 15 minutes. Review the browser and complete the action manually.",
        finished_at=utcnow(),
    )
    _log(job_id, "Confirmation timed out. Nothing was claimed as published.")
    return False


def _youtube(worker, page, job_id, video_id, metadata, identity, video_path, thumbnail_path, subtitle_path) -> dict:
    _log(job_id, "Opening YouTube Studio upload.")
    _update(job_id, stage="Opening YouTube Studio")
    if not _click(page, ["#create-icon", "ytcp-button#create-icon"]):
        _click_text(page, ["Create"])
    _wait(page, 1.5)
    if not _click_text(page, ["Upload videos", "Upload video"]):
        raise RuntimeError("The YouTube Studio upload button could not be found. The interface may have changed.")
    _wait(page, 2)
    try:
        file_input = page.locator('input[type="file"]').first
        file_input.set_input_files(video_path, timeout=30_000)
    except Exception as exc:
        raise RuntimeError(f"The video file could not be attached to the YouTube upload: {exc}") from exc
    _log(job_id, "Video file attached. Waiting for the details form.")
    _update(job_id, stage="Uploading the video file")
    _wait(page, 8)

    title = str(metadata.get("title") or "")[:100]
    description = str(metadata.get("description") or "")[:5000]
    tags = [str(tag) for tag in (metadata.get("tags") or []) if str(tag).strip()]
    _set_editable(page, ["#title-textarea #textbox", "#title-textarea [contenteditable='true']", "#textbox"], title, job_id, "title")
    _set_editable(
        page,
        ["#description-textarea #textbox", "#description-textarea [contenteditable='true']"],
        description,
        job_id,
        "description",
    )
    if tags:
        if _click_text(page, ["Show more"]):
            _wait(page, 1)
        for selector in ["#tags-container input", "ytcp-form-input-container#tags-container input", "input[aria-label*='Tags']"]:
            try:
                field = page.locator(selector).first
                if field.count() and field.is_visible(timeout=3000):
                    field.click()
                    for tag in tags[:15]:
                        field.type(tag, delay=10)
                        page.keyboard.press("Enter")
                    _log(job_id, "Tags entered.")
                    break
            except Exception:
                continue
        else:
            _log(job_id, "Tags were not available in this YouTube Studio layout; continuing without them.")

    if thumbnail_path and Path(thumbnail_path).exists():
        try:
            image_input = page.locator('input[type="file"][accept*="image"]').last
            image_input.set_input_files(thumbnail_path, timeout=20_000)
            _wait(page, 2)
            _log(job_id, "Thumbnail attached.")
        except Exception:
            _log(job_id, "Thumbnail input was not available; the upload continues without a custom thumbnail.")
    if subtitle_path and Path(subtitle_path).exists():
        _log(
            job_id,
            "Subtitle upload is not automated in this browser flow. The SRT remains in the library for "
            "YouTube Studio's Subtitles page or the existing API upload.",
        )

    _update(job_id, stage="Filling visibility and schedule")
    for _ in range(7):
        if page.locator("#done-button").count() and page.locator("#done-button").first.is_visible():
            break
        _click(page, ["tp-yt-paper-radio-button[name='VIDEO_MADE_FOR_KIDS_NOT_MFK']"], timeout=2000)
        if not _click(page, ["#next-button"], timeout=4000):
            _click_text(page, ["Next"])
        _wait(page, 1.5)

    visibility = str(metadata.get("visibility") or "private").lower()
    scheduled_at = metadata.get("scheduled_at")
    schedule_dt = None
    if scheduled_at:
        try:
            schedule_dt = datetime.fromisoformat(str(scheduled_at).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            schedule_dt = None
    radio = "SCHEDULE" if schedule_dt else {"public": "PUBLIC", "unlisted": "UNLISTED", "private": "PRIVATE"}.get(visibility, "PRIVATE")
    if not _click(page, [f"tp-yt-paper-radio-button[name='{radio}']"], timeout=4000):
        _log(job_id, f"Visibility option {radio} was not found; review it in the browser.")
    if schedule_dt:
        try:
            inputs = page.locator("ytcp-datetime-picker input")
            count = inputs.count()
            if count >= 1:
                date_value = schedule_dt.strftime("%m/%d/%Y")
                time_value = schedule_dt.strftime("%I:%M %p")
                inputs.nth(0).click()
                page.keyboard.press("Control+A")
                page.keyboard.type(date_value)
                page.keyboard.press("Tab")
                if count >= 2:
                    inputs.nth(1).click()
                    page.keyboard.press("Control+A")
                    page.keyboard.type(time_value)
                    page.keyboard.press("Tab")
                _log(job_id, f"Schedule set to {date_value} {time_value} (verify in the browser).")
            else:
                _log(job_id, "The schedule date/time fields were not found; review the schedule in the browser.")
        except Exception:
            _log(job_id, "The schedule fields could not be set automatically; review the schedule in the browser.")

    _wait(page, 1)
    if _challenge(page):
        raise RuntimeError("YouTube requested manual verification. Complete it in the browser and retry; nothing was published.")
    if not _wait_for_confirmation(worker, job_id, page, worker_confirm(worker), worker_cancel(worker), "youtube"):
        return {"ok": False, "status": "cancelled"}

    _update(job_id, stage="Completing the YouTube action")
    if not _click(page, ["#done-button"], timeout=10_000):
        if not _click_text(page, ["Publish", "Schedule", "Save"]):
            raise RuntimeError("The final YouTube button could not be found. Nothing was published.")
    _log(job_id, "Final YouTube action clicked. Waiting for the website to confirm.")
    _wait(page, 8)
    confirmed_text = _body_text(page)
    remote_url = ""
    try:
        links = page.eval_on_selector_all(
            "a[href*='youtu.be/'], a[href*='youtube.com/watch']",
            "els => els.map(el => el.href)",
        )
        remote_url = next((url for url in links if url), "")
    except Exception:
        pass
    status = ""
    published_phrases = ("video published", "your video has been published", "video is published")
    scheduled_phrases = ("video scheduled", "your video has been scheduled", "video is scheduled")
    if any(phrase in confirmed_text for phrase in published_phrases):
        status = "published"
    elif any(phrase in confirmed_text for phrase in scheduled_phrases):
        status = "scheduled"
    if not status:
        _screenshot(page, job_id, "unconfirmed")
        raise RuntimeError(
            "YouTube did not display a published or scheduled confirmation. Katha Studio will not claim "
            "success. Check YouTube Studio and the screenshot, then retry or mark it manually."
        )
    _screenshot(page, job_id, "confirmed")
    _update(
        job_id,
        status=status,
        stage="Confirmed by YouTube",
        remote_url=remote_url,
        remote_id=_youtube_id(remote_url),
        finished_at=utcnow(),
    )
    _log(job_id, f"YouTube confirmed: {status}. URL: {remote_url or '(not exposed)'}")
    _record_publication(video_id, job_id, "youtube", status, remote_url, metadata)
    return {"ok": True, "status": status, "remote_url": remote_url}


def worker_confirm(worker):
    event = getattr(worker, "_current_confirm", None)
    if event is None:
        raise RuntimeError("This publish job lost its confirmation channel. Start the publish again.")
    return event


def worker_cancel(worker):
    event = getattr(worker, "_current_cancel", None)
    if event is None:
        raise RuntimeError("This publish job lost its confirmation channel. Start the publish again.")
    return event


def _instagram(worker, page, job_id, video_id, metadata, identity, video_path) -> dict:
    _log(job_id, "Opening the Instagram create flow.")
    _update(job_id, stage="Opening Instagram")
    clicked = False
    for selector in [
        'svg[aria-label="New post"]',
        'svg[aria-label="New Post"]',
        'a[href="/create/select/"]',
        'div[role="button"]:has-text("Create")',
    ]:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible(timeout=3000):
                locator.click()
                clicked = True
                break
        except Exception:
            continue
    if not clicked:
        raise RuntimeError("The Instagram create button could not be found. The interface may have changed.")
    _wait(page, 2)
    try:
        page.locator('input[type="file"]').first.set_input_files(video_path, timeout=30_000)
    except Exception as exc:
        raise RuntimeError(f"The video could not be attached to Instagram: {exc}") from exc
    _log(job_id, "Video attached. Advancing the Instagram dialog.")
    _update(job_id, stage="Preparing the Instagram post")
    _wait(page, 4)
    for _ in range(3):
        _click_text(page, ["Next"])
        _wait(page, 2)
    caption = str(metadata.get("description") or metadata.get("caption") or "")
    if caption:
        filled = False
        for selector in [
            'div[contenteditable="true"][aria-label*="caption"]',
            'textarea[aria-label*="caption"]',
            'div[contenteditable="true"]',
        ]:
            try:
                locator = page.locator(selector).last
                if locator.count() and locator.is_visible(timeout=3000):
                    locator.click()
                    page.keyboard.insert_text(caption[:2200])
                    filled = True
                    break
            except Exception:
                continue
        _log(job_id, "Caption filled." if filled else "Caption field was not found; review it in the browser.")
    if metadata.get("scheduled_at"):
        raise RuntimeError(
            "Instagram's web interface does not offer reliable scheduling for this workflow. "
            "Nothing was published. Use Publish now or the manual completion option."
        )
    if _challenge(page):
        raise RuntimeError("Instagram requested manual verification. Complete it in the browser; nothing was published.")
    if not _wait_for_confirmation(worker, job_id, page, worker_confirm(worker), worker_cancel(worker), "instagram"):
        return {"ok": False, "status": "cancelled"}
    _update(job_id, stage="Completing the Instagram share")
    if not _click_text(page, ["Share", "Post"]):
        raise RuntimeError("The Instagram Share button could not be found. Nothing was published.")
    _log(job_id, "Share clicked. Waiting for Instagram to confirm.")
    confirmed = False
    for _ in range(30):
        _wait(page, 2)
        text = _body_text(page)
        if "your post has been shared" in text or "post shared" in text:
            confirmed = True
            break
        if _challenge(page):
            break
    remote_url = ""
    try:
        links = page.eval_on_selector_all(
            "a[href*='/p/'], a[href*='/reel/']",
            "els => els.map(el => el.href)",
        )
        remote_url = next((url for url in links if url), "")
    except Exception:
        pass
    if not confirmed:
        _screenshot(page, job_id, "unconfirmed")
        raise RuntimeError(
            "Instagram did not display a confirmed share message. Katha Studio will not claim success. "
            "Check the profile and the screenshot, then retry or complete it manually."
        )
    _screenshot(page, job_id, "confirmed")
    _update(
        job_id,
        status="published",
        stage="Confirmed by Instagram",
        remote_url=remote_url,
        remote_id=_instagram_id(remote_url),
        finished_at=utcnow(),
    )
    _log(job_id, f"Instagram confirmed the post. URL: {remote_url or '(not exposed)'}")
    _record_publication(video_id, job_id, "instagram", "published", remote_url, metadata)
    return {"ok": True, "status": "published", "remote_url": remote_url}


def _youtube_id(url: str) -> str:
    match = re.search(r"(?:youtu\.be/|v=)([A-Za-z0-9_-]{6,})", url or "")
    return match.group(1) if match else ""


def _instagram_id(url: str) -> str:
    match = re.search(r"/(?:p|reel)/([A-Za-z0-9_-]+)", url or "")
    return match.group(1) if match else ""


def _record_publication(video_id: int, job_id: int, platform: str, status: str, remote_url: str, metadata: dict) -> None:
    with SessionLocal() as db:
        job = db.get(BrowserPublish, job_id)
        video = db.get(Video, video_id)
        if not video or not job:
            return
        now = utcnow()
        video.production_status = "PUBLISHED" if status == "published" else "SCHEDULED"
        video.platform = platform
        video.platform_url = remote_url
        video.browser_account_id = job.browser_account_id
        if platform == "youtube":
            video.youtube_url = remote_url or video.youtube_url
            video.youtube_video_id = _youtube_id(remote_url) or video.youtube_video_id
            video.youtube_status = "published" if status == "published" else "scheduled"
        if status == "published":
            video.published_at = now
        else:
            video.scheduled_at = job.scheduled_at or video.scheduled_at
        publication = (
            db.query(Publication)
            .filter(Publication.video_id == video.id, Publication.platform == platform)
            .order_by(Publication.created_at.desc())
            .first()
        )
        if not publication:
            publication = Publication(video_id=video.id, platform=platform)
            db.add(publication)
        publication.channel_id = video.channel_id
        publication.status = status
        publication.remote_url = remote_url
        publication.caption = str(metadata.get("description") or "")[:5000]
        publication.scheduled_at = job.scheduled_at
        publication.published_at = now if status == "published" else None
        publication.notes = f"Browser profile: {job.browser_account_id}. Confirmed by {platform}."
        db.commit()
