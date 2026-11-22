"""Animation agent detection, handoff and cooperative locking.

Katha Studio never invents a connection. Claude Code is launched through the
official local CLI, Antigravity is opened as a normal desktop application, and
manual mode is a folder handoff. No credentials are read or stored here.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import AGENT_RUN_DIR, APP_VERSION, config
from ..database import SessionLocal, utcnow
from ..models import (
    AgentHandoff,
    AppSetting,
    Channel,
    Episode,
    Project,
    ProjectLock,
)
from ..utils import slugify, write_json

logger = logging.getLogger(__name__)

AGENTS = {
    "claude_code": {
        "label": "Claude Code",
        "kind": "cli",
        "accent": "lavender",
        "description": "Official Anthropic Claude Code CLI. Uses your existing Claude sign-in.",
    },
    "antigravity": {
        "label": "Google Antigravity",
        "kind": "desktop",
        "accent": "powder",
        "description": "Google Antigravity desktop agent. Opens the same permanent channel project.",
    },
    "manual": {
        "label": "Manual production",
        "kind": "manual",
        "accent": "sage",
        "description": "A complete folder and prompt handoff you can use with any tool or by hand.",
    },
}

ALLOWED_PERMISSION_MODES = {"default", "acceptEdits", "plan"}
LOCK_STALE_HOURS = 24

_processes: dict[int, subprocess.Popen] = {}
_process_lock = threading.Lock()


# --------------------------------------------------------------------- settings
def get_agent_settings(db: Session) -> dict:
    row = db.get(AppSetting, "agent_settings")
    defaults = {
        "selected_agent": "claude_code",
        "claude_path": "",
        "antigravity_path": "",
        "permission_mode": "acceptEdits",
        "keep_terminal_open": True,
        "last_handoff": {},
    }
    if row and isinstance(row.value, dict):
        return {**defaults, **row.value}
    return defaults


def save_agent_settings(db: Session, values: dict) -> dict:
    current = get_agent_settings(db)
    current.update({key: value for key, value in values.items() if value is not None})
    if current.get("permission_mode") not in ALLOWED_PERMISSION_MODES:
        current["permission_mode"] = "acceptEdits"
    row = db.get(AppSetting, "agent_settings")
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="agent_settings", value=current))
    db.commit()
    return current


def selected_agent(db: Session) -> str:
    agent = get_agent_settings(db).get("selected_agent", "claude_code")
    return agent if agent in AGENTS else "manual"


# --------------------------------------------------------------------- detection
def _which(names: list[str]) -> str:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return ""


def _claude_cli_candidates() -> list[Path]:
    home = Path.home()
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
    return [
        home / ".local" / "bin" / "claude.exe",
        home / ".local" / "bin" / "claude.cmd",
        local / "Programs" / "Claude" / "claude.exe",
        appdata / "npm" / "claude.cmd",
        appdata / "npm" / "claude.exe",
    ]


def _antigravity_candidates() -> list[Path]:
    home = Path.home()
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
    program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
    return [
        local / "Programs" / "Antigravity" / "Antigravity.exe",
        local / "Programs" / "antigravity" / "Antigravity.exe",
        local / "Antigravity" / "Antigravity.exe",
        local / "Google" / "Antigravity" / "Antigravity.exe",
        program_files / "Google" / "Antigravity" / "Antigravity.exe",
        program_files / "Antigravity" / "Antigravity.exe",
        program_files_x86 / "Google" / "Antigravity" / "Antigravity.exe",
    ]


def _running(names: list[str]) -> list[str]:
    if os.name != "nt":
        return []
    running: list[str] = []
    for name in names:
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {name}", "/NH"],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            if name.lower() in (result.stdout or "").lower():
                running.append(name)
        except Exception:
            continue
    return running


def _file_version(path: str) -> str:
    if not path or os.name != "nt":
        return ""
    escaped = path.replace("'", "''")
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                f"(Get-Item -LiteralPath '{escaped}').VersionInfo.ProductVersion",
            ],
            capture_output=True,
            text=True,
            timeout=12,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return (result.stdout or "").strip().splitlines()[0][:200]
    except Exception:
        return ""


def _version_of(path: str, args: list[str] | None = None) -> tuple[str, str]:
    if not path:
        return "", ""
    try:
        result = subprocess.run(
            [path, *(args or ["--version"])],
            capture_output=True,
            text=True,
            timeout=12,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode == 0:
            return (result.stdout or result.stderr or "").strip().splitlines()[0][:200], ""
        return "", (result.stderr or "The application returned an error.").strip()[:300]
    except subprocess.TimeoutExpired:
        return "", "The application did not respond while checking its version."
    except Exception as exc:  # noqa: BLE001
        return "", str(exc)[:300]


def detect_claude(db: Session | None = None) -> dict:
    settings = get_agent_settings(db) if db else {}
    configured = str(settings.get("claude_path") or "").strip()
    cli_path = configured if configured and Path(configured).exists() else _which(["claude", "claude.cmd", "claude.exe"])
    if not cli_path:
        cli_path = next((str(path) for path in _claude_cli_candidates() if path.exists()), "")
    version, error = _version_of(cli_path) if cli_path else ("", "")
    home = Path.home()
    config_dir = home / ".claude"
    settings_file = config_dir / "settings.json"
    global_config = home / ".claude.json"
    running = _running(["Claude.exe", "claude.exe"])
    desktop_candidates = [
        Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")) / "AnthropicClaude" / "claude.exe",
        Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")) / "Programs" / "Claude" / "Claude.exe",
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Claude" / "Claude.exe",
    ]
    desktop_path = next((str(path) for path in desktop_candidates if path.exists()), "")
    signed_in_hint = bool(config_dir.exists() or global_config.exists())
    return {
        "agent": "claude_code",
        "label": AGENTS["claude_code"]["label"],
        "installed": bool(cli_path),
        "path": cli_path,
        "version": version,
        "error": error,
        "authentication": {
            "available": signed_in_hint,
            "verified": False,
            "note": (
                "Claude Code sign-in is managed by the official CLI. Katha Studio checks only that "
                "the local Claude configuration exists; it never reads or copies credentials."
                if signed_in_hint
                else "No local Claude Code configuration was found. Run `claude` once and sign in with your Claude account."
            ),
        },
        "project_access": True,
        "busy": any(name.lower() == "claude.exe" for name in running),
        "running_processes": running,
        "desktop": {"installed": bool(desktop_path), "path": desktop_path},
        "handoff": {
            "terminal": True,
            "headless": bool(cli_path),
            "manual": True,
            "prompt_injection_into_desktop": False,
        },
    }


def detect_antigravity(db: Session | None = None) -> dict:
    settings = get_agent_settings(db) if db else {}
    configured = str(settings.get("antigravity_path") or "").strip()
    path = configured if configured and Path(configured).exists() else ""
    if not path:
        path = next((str(candidate) for candidate in _antigravity_candidates() if candidate.exists()), "")
    cli_path = _which(["antigravity", "antigravity.cmd", "antigravity.exe"])
    version = _file_version(path) if path else ""
    error = ""
    running = _running(["Antigravity.exe"])
    return {
        "agent": "antigravity",
        "label": AGENTS["antigravity"]["label"],
        "installed": bool(path or cli_path),
        "path": path or cli_path,
        "application_path": path,
        "cli_path": cli_path,
        "version": version,
        "error": error,
        "authentication": {
            "available": None,
            "verified": False,
            "note": (
                "Antigravity sign-in is handled inside Google Antigravity. Katha Studio does not read "
                "or automate its private login flow."
            ),
        },
        "project_access": True,
        "busy": bool(running),
        "running_processes": running,
        "handoff": {
            "open_project_folder": bool(path or cli_path),
            "prepared_prompt": True,
            "manual": True,
            "documented_cli_prompt": bool(cli_path),
        },
    }


def detect_manual() -> dict:
    return {
        "agent": "manual",
        "label": AGENTS["manual"]["label"],
        "installed": True,
        "path": "",
        "version": "",
        "error": "",
        "authentication": {"available": True, "verified": True, "note": "No account required."},
        "project_access": True,
        "busy": False,
        "running_processes": [],
        "handoff": {"manual": True, "prepared_prompt": True, "open_project_folder": True},
    }


def detection_payload(db: Session) -> dict:
    selected = selected_agent(db)
    locks = active_locks(db)
    return {
        "selected_agent": selected,
        "agents": [detect_claude(db), detect_antigravity(db), detect_manual()],
        "settings": {
            key: value
            for key, value in get_agent_settings(db).items()
            if key not in {"last_handoff"}
        },
        "active_locks": [lock_dict(lock) for lock in locks],
        "recent_handoffs": [handoff_dict(item) for item in recent_handoffs(db)],
        "permission_modes": sorted(ALLOWED_PERMISSION_MODES),
    }


# --------------------------------------------------------------------- locking
def _lock_query(db: Session, project_id: int | None, episode_id: int | None):
    query = db.query(ProjectLock).filter(ProjectLock.status == "active")
    if episode_id:
        query = query.filter(ProjectLock.episode_id == episode_id)
    elif project_id:
        query = query.filter(ProjectLock.project_id == project_id)
    return query


def expire_stale_locks(db: Session) -> int:
    cutoff = utcnow() - timedelta(hours=LOCK_STALE_HOURS)
    stale = (
        db.query(ProjectLock)
        .filter(ProjectLock.status == "active", ProjectLock.heartbeat_at < cutoff)
        .all()
    )
    for lock in stale:
        lock.status = "stale"
        lock.released_at = utcnow()
        _remove_lock_file(lock)
    if stale:
        db.commit()
    return len(stale)


def active_locks(db: Session) -> list[ProjectLock]:
    expire_stale_locks(db)
    return (
        db.query(ProjectLock)
        .filter(ProjectLock.status == "active")
        .order_by(ProjectLock.acquired_at.desc())
        .all()
    )


def lock_conflict(db: Session, project_id: int | None, episode_id: int | None = None) -> ProjectLock | None:
    expire_stale_locks(db)
    query = db.query(ProjectLock).filter(ProjectLock.status == "active")
    if episode_id:
        found = query.filter(ProjectLock.episode_id == episode_id).first()
        if found:
            return found
    if project_id:
        return query.filter(ProjectLock.project_id == project_id).first()
    return None


def acquire_lock(
    db: Session,
    *,
    project: Project,
    episode: Episode | None,
    agent: str,
    handoff_id: int | None,
    note: str = "",
) -> ProjectLock:
    conflict = lock_conflict(db, project.id, episode.id if episode else None)
    if conflict:
        raise LockConflict(conflict)
    owner = uuid.uuid4().hex
    lock = ProjectLock(
        scope="episode" if episode else "project",
        channel_id=project.channel_id,
        project_id=project.id,
        episode_id=episode.id if episode else None,
        agent=agent,
        handoff_id=handoff_id,
        owner_token=owner,
        status="active",
        note=note,
        acquired_at=utcnow(),
        heartbeat_at=utcnow(),
    )
    db.add(lock)
    db.commit()
    db.refresh(lock)
    _write_lock_file(lock, project, episode)
    return lock


class LockConflict(RuntimeError):
    def __init__(self, lock: ProjectLock):
        self.lock = lock
        super().__init__(
            f"{AGENTS.get(lock.agent, {}).get('label', lock.agent)} is already working on this "
            f"{'episode' if lock.episode_id else 'project'}. Release the lock or wait for it to finish."
        )


def release_lock(db: Session, lock_id: int, *, force: bool = False) -> dict:
    lock = db.get(ProjectLock, lock_id)
    if not lock:
        raise ValueError("Lock not found.")
    if lock.status != "active":
        return lock_dict(lock)
    lock.status = "released"
    lock.released_at = utcnow()
    _remove_lock_file(lock)
    db.commit()
    return lock_dict(lock)


def heartbeat_lock(db: Session, lock_id: int) -> None:
    lock = db.get(ProjectLock, lock_id)
    if lock and lock.status == "active":
        lock.heartbeat_at = utcnow()
        db.commit()


def _lock_paths(lock: ProjectLock) -> list[Path]:
    paths: list[Path] = []
    project = None
    episode = None
    with SessionLocal() as db:
        project = db.get(Project, lock.project_id) if lock.project_id else None
        episode = db.get(Episode, lock.episode_id) if lock.episode_id else None
    if project:
        channel = None
        with SessionLocal() as db:
            channel = db.get(Channel, project.channel_id)
        if channel and channel.animation_project_path:
            base = Path(channel.animation_project_path)
            paths.append(base / ".katha" / "LOCK.json")
            if episode:
                paths.append(base / "episodes" / project.slug / ".katha" / "LOCK.json")
    return paths


def _write_lock_file(lock: ProjectLock, project: Project, episode: Episode | None) -> None:
    channel = None
    with SessionLocal() as db:
        channel = db.get(Channel, project.channel_id)
    if not channel or not channel.animation_project_path:
        return
    base = Path(channel.animation_project_path)
    payload = lock_dict(lock)
    payload["message"] = (
        "This project is locked by another animation agent. Do not edit shared files until the lock is released."
    )
    targets = [base / ".katha" / "LOCK.json"]
    if episode:
        targets.append(base / "episodes" / project.slug / ".katha" / "LOCK.json")
    for target in targets:
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        except OSError:
            logger.exception("Could not write lock file %s", target)


def _remove_lock_file(lock: ProjectLock) -> None:
    for target in _lock_paths(lock):
        try:
            if not target.exists():
                continue
            data = json.loads(target.read_text(encoding="utf-8"))
            if data.get("id") == lock.id:
                target.unlink(missing_ok=True)
        except Exception:
            logger.warning("Could not remove lock file %s", target, exc_info=True)


def lock_dict(lock: ProjectLock) -> dict:
    return {
        "id": lock.id,
        "scope": lock.scope,
        "channel_id": lock.channel_id,
        "project_id": lock.project_id,
        "episode_id": lock.episode_id,
        "agent": lock.agent,
        "agent_label": AGENTS.get(lock.agent, {}).get("label", lock.agent),
        "handoff_id": lock.handoff_id,
        "status": lock.status,
        "note": lock.note,
        "acquired_at": lock.acquired_at.isoformat() if lock.acquired_at else None,
        "heartbeat_at": lock.heartbeat_at.isoformat() if lock.heartbeat_at else None,
        "released_at": lock.released_at.isoformat() if lock.released_at else None,
    }


# --------------------------------------------------------------------- handoffs
def _handoff_root(channel: Channel, project: Project) -> Path:
    if not channel.animation_project_path:
        raise ValueError("The channel does not have a permanent animation project folder.")
    return Path(channel.animation_project_path) / "episodes" / project.slug


def build_production_prompt(
    *,
    project: Project,
    channel: Channel,
    episode: Episode | None,
    package_path: Path,
    handoff_dir: Path,
) -> str:
    episodes = [episode] if episode else list(project.episodes)
    episode_lines = "\n".join(
        f"- Part {item.episode_number}: {item.title} (`{package_path / f'PART_{item.episode_number:02d}'}`)"
        for item in episodes
    )
    master_prompt = ""
    master_path = package_path / "MASTER_ANIMATION_PROMPT.md"
    if master_path.exists():
        try:
            master_prompt = master_path.read_text(encoding="utf-8")[:24000]
        except OSError:
            master_prompt = ""
    task = f"""You are the animation agent for the **{channel.name}** channel in Katha Studio.

## Real paths
- Permanent channel animation project: `{channel.animation_project_path}`
- Production package: `{package_path}`
- Handoff folder: `{handoff_dir}`
- Final output folder: `{channel.output_folder}`
- Preferred finished-video folder: `{Path(channel.output_folder or '') / 'READY'}`
- Project lock file: `{Path(channel.animation_project_path or '') / '.katha' / 'LOCK.json'}`

## Required task
Inspect the project instructions, read the screenplay, use the supplied audio, and animate the
required episode(s) for **{project.title}**.

1. Read `AGENTS.md`, `CLAUDE.md` (or `.agent/rules/katha-animation.md` in Antigravity),
   `CHARACTER_BIBLE.md`, `VISUAL_STYLE_GUIDE.md`, `AUDIO_GUIDE.md`,
   `ANIMATION_CONVENTIONS.md` and `ASSET_MANIFEST.json` in the permanent project.
2. Read the package `MASTER_STORY.md`, `CHARACTER_BIBLE.md`, `VISUAL_STYLE_GUIDE.md`,
   `RESEARCH_SOURCES.md` and `MASTER_ANIMATION_PROMPT.md`.
3. Read the part folders:
{episode_lines}
4. Inspect every supplied audio clip in each part's `AUDIO/` folder and align it to
   `AUDIO_MANIFEST.json` and `SCENE_TIMELINE.json`. Supplied audio is final.
5. Reuse shared characters, rigs, backgrounds, props, expressions, effects, fonts and templates.
   Never overwrite a shared asset; add a versioned copy and update `ASSET_MANIFEST.json`.
6. Render the finished video(s) into `{Path(channel.output_folder or '') / 'READY'}`.
   Do not delete or move the package, source audio or previous renders.
7. Report the absolute output path, duration, resolution, frame rate, codec and any assumptions.
8. Do not read or export credentials, browser profiles, cookies or private account data.
9. Respect the project lock. If `.katha/LOCK.json` names another agent, stop and ask the user.

Katha Studio will validate and import the finished video from the output folder. Do not claim the
episode is complete until a real file exists there.

## Package master prompt
{master_prompt or '(The package does not contain MASTER_ANIMATION_PROMPT.md yet. Follow the package documents and this task.)'}
"""
    return task


def create_handoff(
    db: Session,
    *,
    project: Project,
    channel: Channel,
    episode: Episode | None,
    agent: str,
    mode: str,
    permission_mode: str = "acceptEdits",
) -> AgentHandoff:
    if agent not in AGENTS:
        raise ValueError("Choose Claude Code, Antigravity or Manual production.")
    if mode not in {"prepare", "manual", "terminal", "headless"}:
        raise ValueError("Unknown handoff mode.")
    if not project.production_package_path:
        raise ValueError("Generate the production package before handing off to an animation agent.")
    package_path = Path(project.production_package_path)
    if not package_path.exists():
        raise ValueError("The production package folder is missing. Regenerate the package.")
    episode_dir = _handoff_root(channel, project)
    episode_dir.mkdir(parents=True, exist_ok=True)
    conflict = lock_conflict(db, project.id, episode.id if episode else None)
    if conflict:
        raise LockConflict(conflict)

    handoff = AgentHandoff(
        channel_id=channel.id,
        project_id=project.id,
        episode_id=episode.id if episode else None,
        agent=agent,
        mode=mode,
        status="preparing",
        working_dir=str(channel.animation_project_path or ""),
        package_path=str(package_path),
        prompt="",
        command="",
    )
    db.add(handoff)
    db.commit()
    db.refresh(handoff)

    lock = acquire_lock(
        db,
        project=project,
        episode=episode,
        agent=agent,
        handoff_id=handoff.id,
        note=f"{AGENTS[agent]['label']} production handoff",
    )

    handoff_dir = episode_dir / "handoffs" / f"{handoff.id:04d}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    handoff_dir.mkdir(parents=True, exist_ok=True)
    prompt = build_production_prompt(
        project=project,
        channel=channel,
        episode=episode,
        package_path=package_path,
        handoff_dir=handoff_dir,
    )
    prompt_path = handoff_dir / "PRODUCTION_TASK.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    (episode_dir / "PRODUCTION_TASK.md").write_text(prompt, encoding="utf-8")
    handoff.prompt = prompt
    handoff.prompt_path = str(prompt_path)
    handoff.status = "prepared"
    handoff.command = _command_preview(agent, handoff, permission_mode)

    metadata = {
        "app": "Katha Studio",
        "app_version": APP_VERSION,
        "handoff_id": handoff.id,
        "agent": agent,
        "agent_label": AGENTS[agent]["label"],
        "mode": mode,
        "created_at": datetime.now().isoformat(),
        "project": {"id": project.id, "title": project.title, "slug": project.slug},
        "episode": (
            {"id": episode.id, "number": episode.episode_number, "title": episode.title}
            if episode
            else None
        ),
        "working_dir": handoff.working_dir,
        "package_path": str(package_path),
        "prompt_path": str(prompt_path),
        "output_folder": channel.output_folder,
        "ready_folder": str(Path(channel.output_folder or "") / "READY"),
        "lock": lock_dict(lock),
        "contains_credentials": False,
    }
    write_json(handoff_dir / "AGENT_HANDOFF.json", metadata)
    write_json(episode_dir / "AGENT_HANDOFF.json", metadata)
    (episode_dir / "HANDOFF.md").write_text(
        f"""# Katha Studio handoff — {project.title}

- Agent: **{AGENTS[agent]['label']}**
- Handoff folder: `{handoff_dir}`
- Production task: `{prompt_path}`
- Production package: `{package_path}`
- Permanent project: `{channel.animation_project_path}`
- Output folder: `{channel.output_folder}`
- Ready folder: `{Path(channel.output_folder or '') / 'READY'}`

Read `PRODUCTION_TASK.md` and follow it. The lock is held by this handoff until it finishes,
is cancelled, or you release it in Katha Studio.
""",
        encoding="utf-8",
    )
    project.status = "ANIMATION_IN_PROGRESS"
    db.commit()
    db.refresh(handoff)
    settings = get_agent_settings(db)
    settings["last_handoff"] = {
        "id": handoff.id,
        "agent": agent,
        "project_id": project.id,
        "episode_id": episode.id if episode else None,
        "status": handoff.status,
        "created_at": handoff.created_at.isoformat() if handoff.created_at else None,
    }
    save_agent_settings(db, settings)
    return handoff


def _command_preview(agent: str, handoff: AgentHandoff, permission_mode: str) -> str:
    if agent == "claude_code":
        return (
            f'claude -p "<production task>" --output-format stream-json --verbose '
            f'--permission-mode {permission_mode} --add-dir "{handoff.package_path}"'
        )
    if agent == "antigravity":
        return f'Antigravity.exe "{handoff.working_dir}"'
    return f'Manual folder handoff: "{handoff.working_dir}"'


def launch_terminal(db: Session, handoff: AgentHandoff) -> dict:
    """Launch the official Claude Code CLI in a visible terminal with the task."""
    if handoff.agent != "claude_code":
        raise ValueError("The visible terminal handoff is for Claude Code only.")
    detection = detect_claude(db)
    cli_path = detection.get("path") or ""
    if not cli_path:
        raise ValueError(
            "The official Claude Code CLI was not detected. Install it and run `claude` once, or use "
            "the prepared manual handoff."
        )
    prompt_path = Path(handoff.prompt_path) if handoff.prompt_path else None
    if not prompt_path or not prompt_path.exists():
        raise ValueError("The production task file is missing. Prepare the handoff again.")
    task = (
        f"Read and follow the Katha Studio production task at \"{prompt_path}\". "
        f"The permanent animation project is \"{handoff.working_dir}\". "
        "Use the supplied audio exactly as provided, respect the project lock, and render into the "
        "channel READY output folder."
    )
    try:
        creationflags = subprocess.CREATE_NEW_CONSOLE if os.name == "nt" else 0
        process = subprocess.Popen(
            [cli_path, task],
            cwd=handoff.working_dir or None,
            creationflags=creationflags,
            env={**os.environ},
        )
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Claude Code could not be launched: {exc}") from exc
    handoff.status = "launched"
    handoff.mode = "terminal"
    handoff.pid = process.pid
    handoff.started_at = utcnow()
    handoff.error = ""
    db.commit()
    return {
        "ok": True,
        "status": "launched",
        "pid": process.pid,
        "message": (
            "Claude Code opened in a new terminal with the production task. Complete sign-in there if "
            "Claude asks. The project lock stays active until you mark the handoff complete."
        ),
        "prompt_path": str(prompt_path),
        "working_dir": handoff.working_dir,
    }


def launch_antigravity(db: Session, handoff: AgentHandoff) -> dict:
    if handoff.agent != "antigravity":
        raise ValueError("This handoff is not an Antigravity handoff.")
    detection = detect_antigravity(db)
    app_path = detection.get("application_path") or detection.get("path") or ""
    if not app_path:
        raise ValueError(
            "Google Antigravity was not detected. Install it, set its path in Animation Agents, or use "
            "the manual handoff."
        )
    try:
        subprocess.Popen(
            [app_path, handoff.working_dir],
            cwd=handoff.working_dir or None,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Antigravity could not be opened with the project folder: {exc}") from exc
    handoff.status = "launched"
    handoff.mode = "manual"
    handoff.started_at = utcnow()
    handoff.error = ""
    db.commit()
    return {
        "ok": True,
        "status": "launched",
        "message": (
            "Antigravity was opened with the permanent animation project. Open the prepared "
            "PRODUCTION_TASK.md in the handoff folder and start the task there. Katha Studio does not "
            "inject prompts into Antigravity's private interface."
        ),
        "prompt_path": handoff.prompt_path,
        "working_dir": handoff.working_dir,
    }


def mark_manual_handoff(db: Session, handoff: AgentHandoff) -> dict:
    handoff.status = "launched"
    handoff.mode = "manual"
    handoff.started_at = utcnow()
    handoff.error = ""
    db.commit()
    return {
        "ok": True,
        "status": "launched",
        "message": "The handoff folder is ready. Open the folder or the production task and follow it.",
        "prompt_path": handoff.prompt_path,
        "working_dir": handoff.working_dir,
    }


def launch_headless(db: Session, handoff: AgentHandoff, permission_mode: str = "acceptEdits") -> AgentHandoff:
    if handoff.agent != "claude_code":
        raise ValueError("Headless capture is supported for the official Claude Code CLI only.")
    detection = detect_claude(db)
    cli_path = detection.get("path") or ""
    if not cli_path:
        raise ValueError(
            "The official Claude Code CLI was not detected. Install it, run `claude` once and sign in, "
            "or use the prepared manual handoff."
        )
    if permission_mode not in ALLOWED_PERMISSION_MODES:
        raise ValueError("Unsupported permission mode.")
    if not handoff.prompt_path or not Path(handoff.prompt_path).exists():
        raise ValueError("The production task file is missing. Prepare the handoff again.")
    prompt = Path(handoff.prompt_path).read_text(encoding="utf-8")
    run_dir = AGENT_RUN_DIR / f"handoff-{handoff.id:04d}"
    run_dir.mkdir(parents=True, exist_ok=True)
    command = [
        cli_path,
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        permission_mode,
        "--add-dir",
        handoff.package_path,
    ]
    handoff.status = "running"
    handoff.started_at = utcnow()
    handoff.finished_at = None
    handoff.error = ""
    handoff.output = ""
    handoff.exit_code = None
    db.commit()

    def runner() -> None:
        process: subprocess.Popen | None = None
        try:
            with open(run_dir / "stdout.log", "w", encoding="utf-8", errors="replace") as stdout_file, open(
                run_dir / "stderr.log", "w", encoding="utf-8", errors="replace"
            ) as stderr_file:
                process = subprocess.Popen(
                    command,
                    cwd=handoff.working_dir or None,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                    env={**os.environ},
                )
                if process.stdin is not None:
                    try:
                        process.stdin.write(prompt)
                        process.stdin.close()
                    except OSError:
                        logger.warning("Could not send the production prompt to Claude Code stdin")
                with _process_lock:
                    _processes[handoff.id] = process
                with SessionLocal() as run_db:
                    row = run_db.get(AgentHandoff, handoff.id)
                    if row:
                        row.pid = process.pid
                        run_db.commit()
                output_parts: list[str] = []
                assert process.stdout is not None and process.stderr is not None
                import threading as _threading

                def pump(stream, target, label: str) -> None:
                    for line in stream:
                        target.write(line)
                        target.flush()
                        output_parts.append(line)
                        if len(output_parts) > 4000:
                            del output_parts[:1000]

                threads = [
                    _threading.Thread(target=pump, args=(process.stdout, stdout_file, "stdout"), daemon=True),
                    _threading.Thread(target=pump, args=(process.stderr, stderr_file, "stderr"), daemon=True),
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join()
                code = process.wait()
                with SessionLocal() as run_db:
                    row = run_db.get(AgentHandoff, handoff.id)
                    if row:
                        row.exit_code = code
                        row.output = "".join(output_parts)[-200000:]
                        row.status = "completed" if code == 0 else "failed"
                        row.finished_at = utcnow()
                        if code != 0:
                            row.error = (
                                "Claude Code exited with code "
                                f"{code}. Read the captured log or open the handoff folder for the real error."
                            )
                        if row.status in {"completed", "failed"}:
                            _release_for_handoff(run_db, row.id)
                        run_db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Claude Code headless handoff %s failed", handoff.id)
            with SessionLocal() as run_db:
                row = run_db.get(AgentHandoff, handoff.id)
                if row:
                    row.status = "failed"
                    row.error = str(exc)[:4000]
                    row.finished_at = utcnow()
                    _release_for_handoff(run_db, row.id)
                    run_db.commit()
        finally:
            with _process_lock:
                _processes.pop(handoff.id, None)

    threading.Thread(target=runner, name=f"katha-agent-{handoff.id}", daemon=True).start()
    return handoff


def cancel_handoff(db: Session, handoff: AgentHandoff) -> AgentHandoff:
    if handoff.status in {"completed", "failed", "cancelled"}:
        return handoff
    with _process_lock:
        process = _processes.get(handoff.id)
    if process and process.poll() is None:
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/pid", str(process.pid), "/T", "/F"],
                    capture_output=True,
                    timeout=20,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            else:
                process.terminate()
        except Exception:
            logger.warning("Could not stop agent process for handoff %s", handoff.id, exc_info=True)
    handoff.status = "cancelled"
    handoff.error = "Cancelled by the user."
    handoff.finished_at = utcnow()
    _release_for_handoff(db, handoff.id)
    db.commit()
    return handoff


def complete_handoff(db: Session, handoff: AgentHandoff, note: str = "") -> AgentHandoff:
    if handoff.status in {"completed", "cancelled"}:
        return handoff
    handoff.status = "completed"
    handoff.finished_at = utcnow()
    if note:
        handoff.output = (handoff.output or "") + f"\n\n{note}"[:20000]
    _release_for_handoff(db, handoff.id)
    db.commit()
    return handoff


def _release_for_handoff(db: Session, handoff_id: int) -> None:
    locks = (
        db.query(ProjectLock)
        .filter(ProjectLock.handoff_id == handoff_id, ProjectLock.status == "active")
        .all()
    )
    for lock in locks:
        lock.status = "released"
        lock.released_at = utcnow()
        _remove_lock_file(lock)
    if locks:
        db.commit()


def recent_handoffs(db: Session, limit: int = 12) -> list[AgentHandoff]:
    return db.query(AgentHandoff).order_by(AgentHandoff.created_at.desc()).limit(limit).all()


def handoff_dict(handoff: AgentHandoff) -> dict:
    project = None
    channel = None
    episode = None
    with SessionLocal() as db:
        project = db.get(Project, handoff.project_id) if handoff.project_id else None
        channel = db.get(Channel, handoff.channel_id) if handoff.channel_id else None
        episode = db.get(Episode, handoff.episode_id) if handoff.episode_id else None
    return {
        "id": handoff.id,
        "channel_id": handoff.channel_id,
        "channel_name": channel.name if channel else "",
        "project_id": handoff.project_id,
        "project_title": project.title if project else "",
        "episode_id": handoff.episode_id,
        "episode_title": episode.title if episode else "",
        "agent": handoff.agent,
        "agent_label": AGENTS.get(handoff.agent, {}).get("label", handoff.agent),
        "mode": handoff.mode,
        "status": handoff.status,
        "working_dir": handoff.working_dir,
        "package_path": handoff.package_path,
        "prompt_path": handoff.prompt_path,
        "command": handoff.command,
        "pid": handoff.pid,
        "exit_code": handoff.exit_code,
        "output_tail": (handoff.output or "")[-6000:],
        "error": handoff.error,
        "started_at": handoff.started_at.isoformat() if handoff.started_at else None,
        "finished_at": handoff.finished_at.isoformat() if handoff.finished_at else None,
        "created_at": handoff.created_at.isoformat() if handoff.created_at else None,
    }


def stop_all() -> None:
    with _process_lock:
        items = list(_processes.items())
    for handoff_id, process in items:
        if process.poll() is None:
            try:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/pid", str(process.pid), "/T", "/F"],
                        capture_output=True,
                        timeout=15,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                else:
                    process.terminate()
            except Exception:
                logger.warning("Could not stop headless agent %s", handoff_id, exc_info=True)
