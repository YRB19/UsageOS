"""Run database migrations at startup.

Why this exists: the app used to rely only on Base.metadata.create_all(), which creates
missing tables but never adds columns to existing ones, so upgrades silently missed
schema changes. Now Alembic brings any database (new, or created by an older UsageOS)
up to the latest schema. The migrations are idempotent, so this is safe to run every time.

A Postgres advisory lock makes sure that when uvicorn starts several workers, only one
of them migrates at a time.
"""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app.database import sync_engine

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_LOCK_ID = 727274  # arbitrary, just has to be the same across workers


def run_migrations() -> None:
    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False  # keep uvicorn's logging intact

    with sync_engine.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(:id)"), {"id": _LOCK_ID})
        try:
            logger.info("Running database migrations")
            command.upgrade(cfg, "head")
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})
            lock_conn.commit()
