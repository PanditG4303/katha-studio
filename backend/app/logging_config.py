from __future__ import annotations

import logging
import re
from logging.handlers import RotatingFileHandler

from .config import config

REDACT_PATTERNS = [
    re.compile(r"(sk-[A-Za-z0-9_\-]{8,})"),
    re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]{8,}", re.IGNORECASE),
    re.compile(r'("?(?:api[_-]?key|token|secret|refresh_token|access_token)"?\s*[:=]\s*"?)[^"\s,}]+', re.IGNORECASE),
]


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
            for pattern in REDACT_PATTERNS:
                if pattern.groups:
                    message = pattern.sub(r"\1[redacted]", message)
                else:
                    message = pattern.sub("[redacted]", message)
            record.msg = message
            record.args = ()
        except Exception:
            pass
        return True


def configure_logging(level: str = "INFO") -> None:
    config.log_dir.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        handler = RotatingFileHandler(
            config.log_dir / "katha-backend.log",
            maxBytes=4_000_000,
            backupCount=4,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s — %(message)s"))
        handler.addFilter(RedactionFilter())
        root.addHandler(handler)
        console = logging.StreamHandler()
        console.setFormatter(logging.Formatter("%(levelname)s %(name)s — %(message)s"))
        console.addFilter(RedactionFilter())
        root.addHandler(console)
    for noisy in ["httpx", "httpcore"]:
        logging.getLogger(noisy).setLevel(logging.WARNING)
