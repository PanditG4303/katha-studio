from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import McpServer
from ..schemas import McpCreateRequest
from ..services import mcp as mcp_service

router = APIRouter(prefix="/mcp", tags=["mcp"])
logger = logging.getLogger(__name__)


@router.get("")
def list_mcp(channel_id: int | None = None, refresh: bool = False, db: Session = Depends(get_db)):
    if refresh:
        rows = mcp_service.refresh_mcp(db, channel_id)
    else:
        rows = db.query(McpServer).order_by(McpServer.name).all()
    return {
        "servers": [mcp_service.mcp_dict(row) for row in rows],
        "agents": [
            {"id": "claude_code", "label": "Claude Code", "config": "~/.claude.json or project .mcp.json"},
            {"id": "antigravity", "label": "Antigravity", "config": "Antigravity's own MCP settings"},
        ],
        "security_note": (
            "Katha Studio reads server definitions and environment variable names only. Secret values "
            "stay in your own agent configuration and are never displayed."
        ),
    }


@router.post("")
def add_mcp(payload: McpCreateRequest, db: Session = Depends(get_db)):
    try:
        result = mcp_service.add_mcp(
            db,
            name=payload.name,
            transport=payload.transport,
            command=payload.command,
            args=payload.args,
            url=payload.url,
            env_keys=payload.env_keys,
            target_agent=payload.target_agent,
            channel_id=payload.channel_id,
            write_to_project=payload.write_to_project,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return result


@router.post("/refresh")
def refresh_mcp(channel_id: int | None = None, db: Session = Depends(get_db)):
    rows = mcp_service.refresh_mcp(db, channel_id)
    return {"servers": [mcp_service.mcp_dict(row) for row in rows]}


@router.delete("/{server_id}")
def delete_mcp(server_id: int, db: Session = Depends(get_db)):
    row = db.get(McpServer, server_id)
    if not row:
        raise HTTPException(404, "MCP server not found.")
    mcp_service.delete_mcp(db, row)
    return {"ok": True}
