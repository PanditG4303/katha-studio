"""Lightweight, transactional SQLite schema migrations.

Version 1 is the initial schema created by SQLAlchemy metadata. Future schema
changes must be appended here so existing Katha Studio databases upgrade in
place without losing projects.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

MIGRATIONS: dict[int, list[str]] = {
    1: [
        # Initial schema. SQLAlchemy create_all handles table creation.
    ],
}


def run_migrations(engine: Engine) -> None:
    with engine.begin() as conn:
        current = int(conn.execute(text("PRAGMA user_version")).scalar() or 0)
        target = max(MIGRATIONS)
        if current >= target:
            return
        for version in range(current + 1, target + 1):
            logger.info("Applying database migration %s", version)
            for statement in MIGRATIONS.get(version, []):
                conn.execute(text(statement))
            conn.execute(text(f"PRAGMA user_version={version}"))
        logger.info("Database schema upgraded from %s to %s", current, target)
