from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.db import engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict:
    """Liveness probe. No auth required."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict:
    """Readiness probe — confirms the database is reachable."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unreachable",
        ) from exc
    return {"status": "ok"}
