from __future__ import annotations

import logging
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DB_PATH, config

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


DB_URL = f"sqlite:///{DB_PATH.as_posix()}"
engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def init_db() -> None:
    from . import models  # noqa: F401
    from .migrations import run_migrations
    from .seed import seed_defaults

    config.ensure_dirs()
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    with SessionLocal() as db:
        seed_defaults(db)
    backup_database()
    logger.info("Database ready at %s", DB_PATH)


def backup_database(prefix: str = "katha") -> Path | None:
    """Consistent SQLite backup using the native backup API."""
    source = Path(DB_PATH)
    if not source.exists():
        return None
    config.backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = config.backup_dir / f"{prefix}-{stamp}.db"
    try:
        src = sqlite3.connect(source)
        dst = sqlite3.connect(target)
        with dst:
            src.backup(dst)
        src.close()
        dst.close()
        backups = sorted(config.backup_dir.glob("katha-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[14:]:
            old.unlink(missing_ok=True)
        return target
    except Exception:
        logger.exception("Database backup failed")
        return None


def restore_database(backup_name: str) -> None:
    safe_name = Path(backup_name).name
    source = config.backup_dir / safe_name
    if not source.exists() or source.suffix != ".db":
        raise ValueError("Backup not found")
    engine.dispose()
    shutil.copy2(source, DB_PATH)
    logger.warning("Database restored from %s. Restart the application.", source)
