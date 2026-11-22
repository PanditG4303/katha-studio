"""Isolated persistent browser profiles.

Each social account gets its own Chromium user-data directory. Katha Studio never
asks for social passwords, never copies cookies and never reads authentication
tokens. The browser owns its protected session storage.
"""
from __future__ import annotations

import importlib.util
import json
import logging
import os
import queue
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..config import BROWSER_SCREENSHOT_DIR, config
from ..database import SessionLocal, utcnow
from ..models import BrowserAccount
from ..utils import slugify

logger = logging.getLogger(__name__)

PLATFORMS = {
    "youtube": {"label": "YouTube", "login_url": "https://studio.youtube.com/", "color": "#c96f6f"},
    "instagram": {"label": "Instagram", "login_url": "https://www.instagram.com/", "color": "#c88f78"},
}

_runtime: "BrowserRuntime | None" = None
_runtime_lock = threading.Lock()


def browser_runtime_status() -> dict:
    chrome = _find_browser_executable()
    return {
        "playwright_installed": bool(importlib.util.find_spec("playwright")),
        "browser": chrome,
        "profiles_root": str(config.browser_profile_dir),
        "screenshots_root": str(BROWSER_SCREENSHOT_DIR),
        "platforms": PLATFORMS,
        "automation_available": bool(importlib.util.find_spec("playwright") and chrome),
        "security_note": (
            "Passwords, one-time codes, CAPTCHA and two-factor challenges are completed by you "
            "directly on the official website. Katha Studio never stores social passwords or cookies."
        ),
    }


def _find_browser_executable() -> dict:
    home = Path.home()
    program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
    program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    candidates = [
        ("chrome", program_files / "Google" / "Chrome" / "Application" / "chrome.exe"),
        ("chrome", program_files_x86 / "Google" / "Chrome" / "Application" / "chrome.exe"),
        ("chrome", local / "Google" / "Chrome" / "Application" / "chrome.exe"),
        ("msedge", program_files / "Microsoft" / "Edge" / "Application" / "msedge.exe"),
        ("msedge", program_files_x86 / "Microsoft" / "Edge" / "Application" / "msedge.exe"),
    ]
    for channel, path in candidates:
        if path.exists():
            return {"channel": channel, "path": str(path), "found": True}
    return {"channel": "", "path": "", "found": False}


# --------------------------------------------------------------------- profiles
def ensure_profiles(db: Session) -> None:
    defaults = [
        ("youtube", "YouTube 01", "youtube_01"),
        ("youtube", "YouTube 02", "youtube_02"),
        ("youtube", "YouTube 03", "youtube_03"),
        ("youtube", "YouTube 04", "youtube_04"),
        ("instagram", "Instagram 01", "instagram_01"),
        ("instagram", "Instagram 02", "instagram_02"),
    ]
    config.browser_profile_dir.mkdir(parents=True, exist_ok=True)
    for platform, label, slug in defaults:
        existing = db.query(BrowserAccount).filter(BrowserAccount.slug == slug).first()
        if existing:
            if existing.profile_dir and not Path(existing.profile_dir).exists():
                Path(existing.profile_dir).mkdir(parents=True, exist_ok=True)
                _protect_folder(Path(existing.profile_dir))
            continue
        folder = config.browser_profile_dir / slug
        folder.mkdir(parents=True, exist_ok=True)
        _protect_folder(folder)
        db.add(
            BrowserAccount(
                platform=platform,
                label=label,
                slug=slug,
                profile_dir=str(folder),
                status="not_opened",
                metadata_json={"seeded": True},
            )
        )
    db.commit()


def create_profile(db: Session, platform: str, label: str) -> BrowserAccount:
    if platform not in PLATFORMS:
        raise ValueError("Choose YouTube or Instagram.")
    label = label.strip()
    if not label:
        raise ValueError("Give the account a label.")
    base = slugify(f"{platform}_{label}", platform)
    slug = base
    index = 2
    while db.query(BrowserAccount).filter(BrowserAccount.slug == slug).first():
        slug = f"{base}_{index}"
        index += 1
    folder = config.browser_profile_dir / slug
    folder.mkdir(parents=True, exist_ok=True)
    _protect_folder(folder)
    account = BrowserAccount(
        platform=platform,
        label=label[:200],
        slug=slug,
        profile_dir=str(folder),
        status="not_opened",
        metadata_json={"created_by": "user"},
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _protect_folder(folder: Path) -> None:
    """Best-effort Windows ACL so other local users cannot read the profile."""
    if os.name != "nt":
        return
    user = os.environ.get("USERNAME") or ""
    if not user:
        return
    try:
        subprocess.run(
            ["icacls", str(folder), "/inheritance:r", "/grant:r", f"{user}:(OI)(CI)F"],
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except Exception:
        logger.warning("Could not restrict browser profile permissions for %s", folder, exc_info=True)


def profile_dict(account: BrowserAccount) -> dict:
    runtime = get_runtime()
    worker = runtime.worker_for(account.id)
    meta = _read_meta(account)
    return {
        "id": account.id,
        "platform": account.platform,
        "platform_label": PLATFORMS.get(account.platform, {}).get("label", account.platform),
        "label": account.label,
        "slug": account.slug,
        "profile_dir": account.profile_dir,
        "status": account.status,
        "detected_identity": account.detected_identity,
        "identity_verified": account.identity_verified,
        "last_used_at": account.last_used_at.isoformat() if account.last_used_at else None,
        "last_check_at": account.last_check_at.isoformat() if account.last_check_at else None,
        "error": account.error,
        "archived": account.archived,
        "browser_open": bool(worker and worker.is_open),
        "busy": bool(worker and worker.busy),
        "profile_exists": bool(account.profile_dir and Path(account.profile_dir).exists()),
        "meta": meta,
    }


def _read_meta(account: BrowserAccount) -> dict:
    if not account.profile_dir:
        return {}
    path = Path(account.profile_dir) / "katha_profile.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_meta(account_id: int, values: dict) -> None:
    with SessionLocal() as db:
        account = db.get(BrowserAccount, account_id)
        if not account or not account.profile_dir:
            return
        path = Path(account.profile_dir) / "katha_profile.json"
        existing = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                existing = {}
        existing.update(values)
        existing["updated_at"] = datetime.now().isoformat()
        existing["note"] = "Metadata only. Passwords, cookies and tokens are never stored here."
        try:
            path.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        except OSError:
            pass


def update_account(account_id: int, **values: Any) -> None:
    with SessionLocal() as db:
        account = db.get(BrowserAccount, account_id)
        if not account:
            return
        for key, value in values.items():
            if hasattr(account, key):
                setattr(account, key, value)
        db.commit()


def delete_profile(db: Session, account: BrowserAccount, confirm: bool) -> dict:
    if not confirm:
        raise ValueError("Confirm removal of this browser profile.")
    runtime = get_runtime()
    runtime.close(account.id, wait=True)
    folder = Path(account.profile_dir) if account.profile_dir else None
    removed = False
    if folder and folder.exists():
        shutil.rmtree(folder)
        removed = True
    db.delete(account)
    db.commit()
    return {"ok": True, "removed_folder": removed, "profile_dir": str(folder) if folder else ""}


# --------------------------------------------------------------------- runtime
def get_runtime() -> "BrowserRuntime":
    global _runtime
    with _runtime_lock:
        if _runtime is None:
            _runtime = BrowserRuntime()
        return _runtime


class BrowserWorker(threading.Thread):
    def __init__(self, account_id: int, profile_dir: str, platform: str):
        super().__init__(name=f"katha-browser-{account_id}", daemon=True)
        self.account_id = account_id
        self.profile_dir = profile_dir
        self.platform = platform
        self.commands: queue.Queue = queue.Queue()
        self.playwright = None
        self.context = None
        self.page = None
        self.is_open = False
        self.busy = False
        self.stopped = threading.Event()
        self._stop_requested = False

    def submit(self, command: dict, wait: bool = False, timeout: float = 120.0) -> dict:
        done = threading.Event()
        command["_done"] = done
        command["_result"] = {"ok": False, "error": "No result."}
        self.commands.put(command)
        if wait:
            done.wait(timeout)
            return command["_result"]
        return {"ok": True, "queued": True}

    def close(self, wait: bool = False) -> None:
        if not self.is_alive():
            self._shutdown_context()
            return
        self.submit({"type": "close"}, wait=wait, timeout=30)
        self._stop_requested = True

    def run(self) -> None:
        while not self._stop_requested:
            try:
                command = self.commands.get(timeout=0.5)
            except queue.Empty:
                continue
            if command is None:
                break
            self.busy = True
            try:
                result = self._dispatch(command)
                command["_result"] = result or {"ok": True}
            except Exception as exc:  # noqa: BLE001
                logger.exception("Browser command failed for account %s", self.account_id)
                command["_result"] = {"ok": False, "error": str(exc)[:2000]}
                update_account(self.account_id, status="error", error=str(exc)[:2000])
            finally:
                self.busy = False
                command["_done"].set()
                self.commands.task_done()
        self._shutdown_context()

    def _dispatch(self, command: dict) -> dict:
        kind = command.get("type")
        if kind == "open":
            return self._open(command)
        if kind == "close":
            self._shutdown_context()
            update_account(self.account_id, status="closed")
            return {"ok": True}
        if kind == "test":
            return self._test(command)
        if kind == "publish":
            from .browser_publish import run_publish

            return run_publish(self, command)
        return {"ok": False, "error": f"Unknown browser command: {kind}"}

    def _launch(self, headless: bool) -> None:
        from playwright.sync_api import sync_playwright

        if self.context:
            return
        browser = _find_browser_executable()
        if not browser["found"]:
            raise RuntimeError(
                "Google Chrome or Microsoft Edge was not found. Install Chrome/Edge or install "
                "the Playwright Chromium runtime, then try again."
            )
        self.playwright = sync_playwright().start()
        kwargs = {
            "user_data_dir": self.profile_dir,
            "headless": headless,
            "channel": browser["channel"],
            "args": ["--no-first-run", "--no-default-browser-check"],
            "viewport": {"width": 1440, "height": 940},
            "locale": "en-US",
        }
        try:
            self.context = self.playwright.chromium.launch_persistent_context(**kwargs)
        except Exception:
            if self.playwright:
                self.playwright.stop()
                self.playwright = None
            raise
        self.context.set_default_timeout(20_000)
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        self.page.set_default_timeout(20_000)

    def _open(self, command: dict) -> dict:
        headless = bool(command.get("headless", False))
        url = command.get("url") or PLATFORMS.get(self.platform, {}).get("login_url")
        self._launch(headless=headless)
        self.is_open = True
        if url:
            try:
                self.page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            except Exception as exc:
                update_account(self.account_id, status="error", error=str(exc)[:1000])
                return {"ok": False, "error": f"The login page could not be opened: {exc}"}
        update_account(
            self.account_id,
            status="browser_open",
            last_used_at=utcnow(),
            error="",
        )
        _write_meta(self.account_id, {"status": "browser_open", "last_opened": datetime.now().isoformat()})
        return {"ok": True, "message": "Browser profile opened. Sign in directly on the website."}

    def _test(self, command: dict) -> dict:
        from .browser_publish import detect_identity

        was_open = self.context is not None
        if not self.context:
            self._launch(headless=bool(command.get("headless", True)))
        try:
            result = detect_identity(self.page, self.platform)
        finally:
            if not was_open and command.get("close_after", True):
                self._shutdown_context()
        status = result.get("status", "unknown")
        update_account(
            self.account_id,
            status=status,
            detected_identity=result.get("identity", "")[:300],
            identity_verified=bool(result.get("verified")),
            last_check_at=utcnow(),
            last_used_at=utcnow(),
            error=result.get("error", "")[:2000],
        )
        _write_meta(
            self.account_id,
            {
                "status": status,
                "identity": result.get("identity", ""),
                "verified": bool(result.get("verified")),
                "last_check": datetime.now().isoformat(),
            },
        )
        return result

    def _shutdown_context(self) -> None:
        self.is_open = False
        try:
            if self.context:
                self.context.close()
        except Exception:
            logger.debug("Browser context close failed", exc_info=True)
        self.context = None
        self.page = None
        try:
            if self.playwright:
                self.playwright.stop()
        except Exception:
            logger.debug("Playwright stop failed", exc_info=True)
        self.playwright = None


class BrowserRuntime:
    def __init__(self) -> None:
        self.workers: dict[int, BrowserWorker] = {}
        self._lock = threading.Lock()
        self.confirmations: dict[int, dict] = {}

    def worker_for(self, account_id: int) -> BrowserWorker | None:
        with self._lock:
            return self.workers.get(account_id)

    def _worker(self, account_id: int) -> BrowserWorker:
        with SessionLocal() as db:
            account = db.get(BrowserAccount, account_id)
            if not account:
                raise ValueError("Browser account not found.")
            if not account.profile_dir:
                raise ValueError("This profile has no folder.")
            Path(account.profile_dir).mkdir(parents=True, exist_ok=True)
            platform = account.platform
        with self._lock:
            worker = self.workers.get(account_id)
            if worker and worker.is_alive():
                return worker
            worker = BrowserWorker(account_id, account.profile_dir, platform)
            self.workers[account_id] = worker
            worker.start()
            return worker

    def open(self, account_id: int, headless: bool = False) -> dict:
        worker = self._worker(account_id)
        return worker.submit({"type": "open", "headless": headless}, wait=True, timeout=90)

    def close(self, account_id: int, wait: bool = False) -> dict:
        worker = self.worker_for(account_id)
        if not worker:
            return {"ok": True, "message": "Profile is not open."}
        worker.close(wait=wait)
        return {"ok": True}

    def test(self, account_id: int) -> dict:
        worker = self._worker(account_id)
        return worker.submit({"type": "test", "headless": True}, wait=True, timeout=120)

    def start_publish(self, account_id: int, job_id: int, video_id: int, metadata: dict) -> dict:
        worker = self._worker(account_id)
        confirm = threading.Event()
        cancel = threading.Event()
        with self._lock:
            self.confirmations[job_id] = {"confirm": confirm, "cancel": cancel}
        worker.submit(
            {
                "type": "publish",
                "job_id": job_id,
                "video_id": video_id,
                "metadata": metadata,
                "confirm": confirm,
                "cancel": cancel,
            }
        )
        return {"ok": True, "job_id": job_id}

    def confirm(self, job_id: int) -> dict:
        with self._lock:
            item = self.confirmations.get(job_id)
        if not item:
            return {"ok": False, "error": "This publish job is not waiting for confirmation."}
        item["confirm"].set()
        return {"ok": True}

    def cancel(self, job_id: int) -> dict:
        with self._lock:
            item = self.confirmations.get(job_id)
        if item:
            item["cancel"].set()
            item["confirm"].set()
        return {"ok": True}

    def forget(self, job_id: int) -> None:
        with self._lock:
            self.confirmations.pop(job_id, None)

    def stop_all(self) -> None:
        with self._lock:
            workers = list(self.workers.values())
        for worker in workers:
            try:
                worker.close(wait=True)
            except Exception:
                logger.warning("Could not close browser worker", exc_info=True)
