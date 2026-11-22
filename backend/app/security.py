from __future__ import annotations

import hmac
import logging
from typing import Optional

from fastapi import HTTPException, Query, Request

from .config import API_TOKEN

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {
    "/api/health",
    "/api/system/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}


def _token_from_request(request: Request) -> Optional[str]:
    header = request.headers.get("x-katha-token")
    if header:
        return header
    if request.method == "GET":
        return request.query_params.get("token")
    return None


async def require_token(request: Request, token: Optional[str] = Query(default=None)) -> None:
    if not API_TOKEN:
        return
    if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/api/youtube/oauth/callback"):
        return
    supplied = _token_from_request(request)
    if not supplied or not hmac.compare_digest(supplied, API_TOKEN):
        raise HTTPException(status_code=401, detail="Katha Studio backend authorization failed.")
