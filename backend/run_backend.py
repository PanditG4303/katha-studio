"""Entrypoint used by the packaged Katha Studio backend."""
from __future__ import annotations

import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    host = os.environ.get("KATHA_HOST", "127.0.0.1")
    port = int(os.environ.get("KATHA_PORT", "8765"))
    log_level = os.environ.get("KATHA_LOG_LEVEL", "info").lower()
    uvicorn.run(app, host=host, port=port, log_level=log_level)
