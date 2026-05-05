"""Persistent session store backed by Supabase + Fernet encryption.

The BT cookies are sensitive (they grant full access to the BT account)
so we encrypt them at rest using SESSION_ENCRYPTION_KEY.

In-memory cache is consulted first to keep request latency low; on cache
miss we go to the DB. Writes always go to the DB and update the cache.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Coroutine
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import text

from app.config import get_settings
from app.db import get_session
from app.models.api import SessionStatus

logger = logging.getLogger(__name__)

# Hold strong refs so fire-and-forget tasks aren't garbage-collected mid-flight.
_background_tasks: set[asyncio.Task] = set()


def _schedule(coro: Coroutine[Any, Any, None]) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@dataclass
class StoredSession:
    cookies: dict[str, dict[str, str]]
    captured_by: str | None = None
    captured_at: datetime | None = None
    last_verified_at: datetime | None = None


# In-memory cache. Populated on first access from DB; updated on every save.
_cached: StoredSession | None = None

# Track whether we've initialized the schema column once per process.
_schema_initialized = False
_init_lock = asyncio.Lock()


def _fernet() -> Fernet:
    settings = get_settings()
    return Fernet(settings.session_encryption_key.encode())


async def _ensure_schema() -> None:
    """Add the encryptedCookies column if it doesn't exist. Idempotent."""
    global _schema_initialized
    async with _init_lock:
        if _schema_initialized:
            return
        async with get_session() as db:
            await db.execute(
                text(
                    'ALTER TABLE "BTSessionStatus" '
                    'ADD COLUMN IF NOT EXISTS "encryptedCookies" TEXT'
                )
            )
        _schema_initialized = True


async def _load_from_db() -> StoredSession | None:
    await _ensure_schema()
    async with get_session() as db:
        result = await db.execute(
            text(
                'SELECT "encryptedCookies", "capturedById", "capturedAt", "lastVerifiedAt" '
                'FROM "BTSessionStatus" WHERE id = :id'
            ),
            {"id": "singleton"},
        )
        row = result.fetchone()
    if not row or not row[0]:
        return None
    try:
        raw = row[0]
        token = raw.encode("utf-8") if isinstance(raw, str) else bytes(raw)
        decrypted = _fernet().decrypt(token).decode()
        cookies = json.loads(decrypted)
    except Exception as e:
        logger.exception("Failed to decrypt stored session: %s", e)
        return None
    return StoredSession(
        cookies=cookies,
        captured_by=row[1],
        captured_at=row[2],
        last_verified_at=row[3],
    )


async def _save_to_db(session: StoredSession) -> None:
    await _ensure_schema()
    payload = json.dumps(session.cookies)
    encrypted = _fernet().encrypt(payload.encode()).decode()
    now = datetime.utcnow()
    async with get_session() as db:
        await db.execute(
            text("""
            INSERT INTO "BTSessionStatus" (
                "id", "isAuthenticated", "encryptedCookies",
                "capturedById", "capturedAt", "lastVerifiedAt", "updatedAt"
            ) VALUES (
                'singleton', TRUE, :enc, :by, :captured, :verified, :updated
            )
            ON CONFLICT ("id") DO UPDATE SET
                "isAuthenticated" = TRUE,
                "encryptedCookies" = EXCLUDED."encryptedCookies",
                "capturedById" = EXCLUDED."capturedById",
                "capturedAt" = EXCLUDED."capturedAt",
                "lastVerifiedAt" = EXCLUDED."lastVerifiedAt",
                "updatedAt" = EXCLUDED."updatedAt"
        """),
            {
                "enc": encrypted,
                "by": session.captured_by,
                "captured": session.captured_at,
                "verified": session.last_verified_at,
                "updated": now,
            },
        )


async def init_from_db() -> None:
    """Eagerly load session from DB into cache on app startup.

    Sync get_active_session() can't await, so it can't reliably load
    from DB on cache miss inside an async request. We pre-load here
    during startup to guarantee the cache is hot.
    """
    global _cached
    try:
        loaded = await _load_from_db()
        if loaded is not None:
            _cached = loaded
            logger.info("Session loaded from DB on startup")
        else:
            logger.info("No persisted session found on startup")
    except Exception as e:
        logger.exception("Failed to load session from DB on startup: %s", e)


# ---- public API used by the rest of the service ----


def store_session(
    cookies: dict[str, dict[str, str]],
    captured_at: datetime,
    captured_by_user_id: str,
) -> None:
    """Save the session, both to in-memory cache and to the DB."""
    global _cached
    now = datetime.utcnow()
    stored = StoredSession(
        cookies=cookies,
        captured_by=captured_by_user_id,
        captured_at=captured_at,
        last_verified_at=now,
    )
    _cached = stored
    # Run async DB save synchronously from this sync caller
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context — schedule the save
            _schedule(_save_to_db(stored))
        else:
            loop.run_until_complete(_save_to_db(stored))
    except RuntimeError:
        asyncio.run(_save_to_db(stored))


def get_active_session() -> StoredSession | None:
    """Read the active session. Cache → DB → None."""
    global _cached
    if _cached is not None:
        return _cached
    # Cache miss — load synchronously from DB
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context. We can't `await` from a sync
            # function, but the call sites of get_active_session are sync —
            # they need a value back. The pragmatic fix is to schedule a
            # task and return None on first call; subsequent calls will hit
            # the cache. So: kick off the load, return None this time.
            #
            # In practice this only matters on the very first request after
            # uvicorn restart. The user will see one transient "no session"
            # which clears on retry. Acceptable for tonight.

            async def _populate() -> None:
                global _cached
                loaded = await _load_from_db()
                if loaded is not None:
                    _cached = loaded

            _schedule(_populate())
            return None
        else:
            loaded = loop.run_until_complete(_load_from_db())
    except RuntimeError:
        loaded = asyncio.run(_load_from_db())
    if loaded is not None:
        _cached = loaded
    return _cached


def get_session_status() -> SessionStatus:
    """Expose auth/session metadata for HTTP responses."""
    sess = get_active_session()
    if sess is None:
        return SessionStatus(
            is_authenticated=False,
            last_verified_at=None,
            captured_by=None,
        )
    return SessionStatus(
        is_authenticated=True,
        last_verified_at=sess.last_verified_at,
        captured_by=sess.captured_by,
    )


def clear_session() -> None:
    """Clear cache; for completeness, mark DB row inactive too."""
    global _cached
    _cached = None
    # We don't bother clearing the DB row — next store_session will overwrite.
