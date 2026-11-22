"""MCP discovery and documented configuration helpers.

Secrets are never read into Katha Studio. Only environment variable *names* are
recorded; values stay in the user's own configuration.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import shutil as _shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import AppSetting, Channel, McpServer
from ..utils import slugify

logger = logging.getLogger(__name__)


def _candidate_files(channel: Channel | None) -> list[tuple[str, Path]]:
    home = Path.home()
    appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    candidates: list[tuple[str, Path]] = [
        ("claude_code", home / ".claude.json"),
    ]
    if channel and channel.animation_project_path:
        candidates.append(("claude_code", Path(channel.animation_project_path) / ".mcp.json"))
    candidates.extend(
        [
            ("antigravity", appdata / "Antigravity" / "User" / "mcp.json"),
            ("antigravity", appdata / "Antigravity" / "User" / "settings.json"),
            ("antigravity", local / "Programs" / "Antigravity" / "resources" / "app" / "mcp.json"),
            ("antigravity", home / ".gemini" / "antigravity" / "mcp_config.json"),
            ("antigravity", home / ".antigravity" / "mcp.json"),
        ]
    )
    return candidates


def _read_servers(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    servers = data.get("mcpServers") if isinstance(data, dict) else None
    return servers if isinstance(servers, dict) else {}


def refresh_mcp(db: Session, channel_id: int | None = None) -> list[McpServer]:
    channel = db.get(Channel, channel_id) if channel_id else None
    seen: set[str] = set()
    for agent, path in _candidate_files(channel):
        servers = _read_servers(path)
        for name, config in servers.items():
            if not isinstance(config, dict):
                continue
            slug = slugify(f"{agent}-{name}", "mcp")
            seen.add(slug)
            row = db.query(McpServer).filter(McpServer.slug == slug).first()
            command = str(config.get("command") or "")
            args = config.get("args") if isinstance(config.get("args"), list) else []
            url = str(config.get("url") or "")
            env = config.get("env") if isinstance(config.get("env"), dict) else {}
            command_ok = True
            error = ""
            if command:
                command_ok = bool(shutil.which(command) or Path(command).exists())
                if not command_ok:
                    error = f"Command not found on PATH: {command}"
            if not row:
                row = McpServer(
                    name=str(name)[:200],
                    slug=slug,
                    transport="stdio" if command else "http",
                    command=command,
                    args=[str(item) for item in args],
                    url=url,
                    env_keys=sorted(str(key) for key in env.keys()),
                    agents=[agent],
                    status="configured" if command_ok else "command_not_found",
                    source_path=str(path),
                    error=error,
                    last_checked_at=utcnow(),
                    config={"has_env": bool(env), "configured_agent": agent},
                )
                db.add(row)
            else:
                row.command = command
                row.args = [str(item) for item in args]
                row.url = url
                row.env_keys = sorted(str(key) for key in env.keys())
                row.agents = sorted(set((row.agents or []) + [agent]))
                row.status = "configured" if command_ok else "command_not_found"
                row.source_path = str(path)
                row.error = error
                row.last_checked_at = utcnow()
    db.commit()
    return db.query(McpServer).order_by(McpServer.name).all()


def add_mcp(
    db: Session,
    *,
    name: str,
    transport: str,
    command: str,
    args: list[str],
    url: str,
    env_keys: list[str],
    target_agent: str,
    channel_id: int | None,
    write_to_project: bool = True,
) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Give the MCP server a name.")
    if transport not in {"stdio", "http", "sse"}:
        raise ValueError("Choose stdio, http or sse.")
    if transport == "stdio" and not command.strip():
        raise ValueError("A stdio MCP server needs a command.")
    if transport != "stdio" and not url.strip():
        raise ValueError("A remote MCP server needs a URL.")
    if any(key.lower().endswith(("password", "secret", "token", "key")) for key in env_keys):
        # Names are allowed; this only prevents accidental value submission.
        pass
    slug = slugify(f"{target_agent}-{name}", "mcp")
    row = db.query(McpServer).filter(McpServer.slug == slug).first()
    if not row:
        row = McpServer(name=name[:200], slug=slug)
        db.add(row)
    row.transport = transport
    row.command = command.strip()
    row.args = [str(item) for item in args]
    row.url = url.strip()
    row.env_keys = sorted({key.strip() for key in env_keys if key.strip()})
    row.agents = [target_agent]
    row.status = "configured"
    row.error = ""
    row.last_checked_at = utcnow()
    row.config = {"env_values_stored": False, "note": "Environment values must be set in the agent's own configuration."}
    written: list[str] = []
    manual = ""
    if write_to_project and target_agent == "claude_code" and channel_id:
        channel = db.get(Channel, channel_id)
        if channel and channel.animation_project_path:
            target = Path(channel.animation_project_path) / ".mcp.json"
            _merge_mcp_file(target, name, transport, command, args, url, env_keys)
            row.source_path = str(target)
            written.append(str(target))
    elif target_agent == "antigravity":
        config_path = _antigravity_config_path()
        if config_path:
            _merge_mcp_file(config_path, name, transport, command, args, url, env_keys)
            row.source_path = str(config_path)
            written.append(str(config_path))
        else:
            row.status = "manual_required"
            manual = (
                "Antigravity's MCP configuration file was not found. Add this server inside "
                "Antigravity's own MCP settings. Katha Studio did not write an undocumented path."
            )
    db.commit()
    return {
        "server": mcp_dict(row),
        "written": written,
        "manual_instructions": manual,
    }


def _antigravity_config_path() -> Path | None:
    home = Path.home()
    appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
    local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
    for candidate in [
        appdata / "Antigravity" / "User" / "mcp.json",
        home / ".gemini" / "antigravity" / "mcp_config.json",
        home / ".antigravity" / "mcp.json",
    ]:
        if candidate.exists():
            return candidate
    return None


def _merge_mcp_file(
    path: Path,
    name: str,
    transport: str,
    command: str,
    args: list[str],
    url: str,
    env_keys: list[str],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data: dict = {}
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ValueError(f"The existing MCP configuration could not be read: {exc}") from exc
        backup = path.with_suffix(path.suffix + f".katha-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
    servers = data.setdefault("mcpServers", {})
    config: dict = {}
    if transport == "stdio":
        config["command"] = command
        if args:
            config["args"] = args
    else:
        config["url"] = url
    if env_keys:
        config["env"] = {key: "${" + key + "}" for key in env_keys}
    servers[name] = config
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def mcp_dict(row: McpServer) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "transport": row.transport,
        "command": row.command,
        "args": row.args or [],
        "url": row.url,
        "env_keys": row.env_keys or [],
        "agents": row.agents or [],
        "status": row.status,
        "source_path": row.source_path,
        "error": row.error,
        "last_checked_at": row.last_checked_at.isoformat() if row.last_checked_at else None,
        "config": row.config or {},
        "note": (
            "Environment values are not stored or displayed by Katha Studio. Configure them in the "
            "agent's own settings."
        ),
    }


def delete_mcp(db: Session, row: McpServer) -> None:
    db.delete(row)
    db.commit()
