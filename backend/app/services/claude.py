from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def _claude_desktop_candidates() -> list[Path]:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
    program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)"))
    return [
        local / "AnthropicClaude" / "claude.exe",
        local / "Programs" / "Claude" / "Claude.exe",
        local / "Programs" / "claude" / "Claude.exe",
        local / "Claude" / "Claude.exe",
        local / "AnthropicClaude" / "Claude.exe",
        program_files / "Claude" / "Claude.exe",
        program_files_x86 / "Claude" / "Claude.exe",
    ]


def _running_processes(names: list[str]) -> list[str]:
    if os.name != "nt":
        return []
    running = []
    for name in names:
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {name}", "/NH"],
                capture_output=True,
                text=True,
                timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            if name.lower() in (result.stdout or "").lower():
                running.append(name)
        except Exception:
            continue
    return running


def detect_claude() -> dict:
    desktop_path = next((path for path in _claude_desktop_candidates() if path.exists()), None)
    cli_path = shutil.which("claude")
    cli_version = ""
    cli_error = ""
    if cli_path:
        try:
            result = subprocess.run(
                [cli_path, "--version"],
                capture_output=True,
                text=True,
                timeout=12,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            if result.returncode == 0:
                cli_version = (result.stdout or result.stderr).strip().splitlines()[0][:200]
            else:
                cli_error = (result.stderr or "The Claude Code CLI returned an error.").strip()[:300]
        except subprocess.TimeoutExpired:
            cli_error = "The Claude Code CLI did not respond while checking its version."
        except Exception as exc:
            cli_error = str(exc)[:300]
    config_dir = Path.home() / ".claude"
    settings_file = config_dir / "settings.json"
    global_config = Path.home() / ".claude.json"
    running = _running_processes(["Claude.exe", "claude.exe"])
    return {
        "desktop": {
            "installed": bool(desktop_path),
            "path": str(desktop_path) if desktop_path else "",
            "running": any(name.lower() == "claude.exe" for name in running),
        },
        "cli": {
            "installed": bool(cli_path),
            "path": cli_path or "",
            "version": cli_version,
            "error": cli_error,
            "config_directory_exists": config_dir.exists(),
            "settings_exists": settings_file.exists(),
            "global_config_exists": global_config.exists(),
            "env_api_key_present": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "auth_note": (
                "Claude Code sign-in is managed by the official Claude Code CLI. "
                "Katha Studio does not read or reuse private login credentials."
            ),
        },
        "handoff": {
            "mode": "folder_and_cli",
            "automatic_prompt_injection": False,
            "note": (
                "Katha Studio hands off a production package and opens the permanent channel animation folder. "
                "Start the animation task in Claude Code using the generated master prompt. Automatic injection into "
                "Claude Desktop is not officially supported, so no fake automation is used."
            ),
        },
    }
