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
    2: [
        # Animation agents, project locks, shared skills/MCP and browser publishing.
        "ALTER TABLE videos ADD COLUMN selected_agent VARCHAR(40) DEFAULT ''",
        "ALTER TABLE videos ADD COLUMN browser_account_id INTEGER",
        "ALTER TABLE videos ADD COLUMN platform_url VARCHAR(1000) DEFAULT ''",
        "ALTER TABLE videos ADD COLUMN output_state VARCHAR(40) DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS ix_videos_browser_account ON videos (browser_account_id)",
        "CREATE INDEX IF NOT EXISTS ix_browser_accounts_platform ON browser_accounts (platform, archived)",
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
                try:
                    conn.execute(text(statement))
                except Exception as exc:
                    # Fresh databases are created from the current SQLAlchemy
                    # metadata, so a column added by a migration may already
                    # exist. That is the only safe, idempotent exception.
                    if "duplicate column name" in str(exc).lower():
                        logger.debug("Migration %s column already present: %s", version, statement[:80])
                        continue
                    raise
            conn.execute(text(f"PRAGMA user_version={version}"))
        logger.info("Database schema upgraded from %s to %s", current, target)
