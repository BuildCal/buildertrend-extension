"""SQLAlchemy async DB setup for bt-service.

bt-service writes BT data into Supabase tables (the bt_* mirror tables
that Prisma owns). We use SQLAlchemy Core (not ORM) and just write raw
upserts — we don't try to mirror Prisma's schema as Python models.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings


def _clean_db_url(url: str) -> str:
    """Strip Prisma-specific query params that asyncpg doesn't understand.

    `pgbouncer=true` and `connection_limit=N` are Prisma's way of saying
    "we're behind a transaction pooler, disable prepared statements."
    asyncpg achieves the same with `statement_cache_size=0` in connect_args
    (set below) and rejects unknown keyword arguments at connect time.
    """
    parsed = urlparse(url)
    prisma_only_keys = {"pgbouncer", "connection_limit"}
    cleaned_qs = [(k, v) for k, v in parse_qsl(parsed.query) if k not in prisma_only_keys]
    return urlunparse(parsed._replace(query=urlencode(cleaned_qs)))


_settings = get_settings()

# echo=False in prod; flip to True if debugging slow queries
engine = create_async_engine(
    _clean_db_url(_settings.database_url),
    echo=False,
    pool_pre_ping=True,
    # pgbouncer (Supabase transaction pooler) doesn't support prepared statements
    # See: https://github.com/MagicStack/asyncpg/issues/849
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
)

SessionFactory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async DB session, committing on success and rolling back on error."""
    async with SessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
