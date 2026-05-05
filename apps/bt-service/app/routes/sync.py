"""Sync routes — pull data from BT into Supabase mirror tables."""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text

from app.auth import require_internal_token
from app.clients import BTAPIError, BTAuthError, BTClient
from app.config import get_settings
from app.db import get_session
from app.session_store import get_active_session
from app.sync_service import sync_bills_for_jobs, sync_cost_codes_for_job, sync_jobs, sync_vendors_global

router = APIRouter(
    prefix="/sync",
    tags=["sync"],
    dependencies=[Depends(require_internal_token)],
)


def _client_for_active_session() -> BTClient:
    session = get_active_session()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No active Buildertrend session. Admin must refresh.",
        )
    return BTClient(cookies=session.cookies)


@router.post("/all")
async def sync_all(
    vendor_concurrency: int = 4,
    skip_vendors: bool = False,
    skip_cost_codes: bool = False,
    skip_bills: bool = False,
) -> dict:
    """Run a full sync from Buildertrend.

    Order: jobs first, then all vendors in one DB transaction (single BT fetch),
    then cost codes per-job concurrently (up to vendor_concurrency in flight).

    Returns counts and timing info.
    """
    settings = get_settings()
    client = _client_for_active_session()
    started_at = datetime.now(UTC)

    errors: list[dict] = []
    job_count = 0
    vendor_count = 0
    bill_count = 0
    cost_code_count = 0

    try:
        # 1. Sync jobs first
        async with get_session() as db:
            try:
                job_count = await sync_jobs(db, client, settings.bt_builder_id)
            except (BTAuthError, BTAPIError) as e:
                errors.append({"step": "jobs", "error": str(e)})
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Job sync failed: {e}",
                ) from e

        # 2. Get the list of job IDs we just synced (read from DB)
        async with get_session() as db:
            result = await db.execute(text('SELECT "btJobId" FROM bt_jobs'))
            job_ids = [row[0] for row in result.fetchall()]

        # 3. Sync vendors once (not per-job) — they're tenant-wide in BT
        if not skip_vendors and job_ids:
            try:
                async with get_session() as db:
                    vendor_count = await sync_vendors_global(
                        db, client, settings.bt_builder_id, job_ids
                    )
            except Exception as e:
                errors.append({"step": "vendors", "error": str(e)})

        # 4. Sync cost codes per-job (these ARE job-specific) with limited concurrency
        semaphore = asyncio.Semaphore(vendor_concurrency)

        async def sync_cost_codes_one_job(job_id: int) -> int:
            async with semaphore:
                if skip_cost_codes:
                    return 0
                try:
                    async with get_session() as db:
                        return await sync_cost_codes_for_job(
                            db, client, settings.bt_builder_id, job_id
                        )
                except Exception as e:
                    errors.append({"step": "cost_codes", "jobId": job_id, "error": str(e)})
                    return 0

        results = await asyncio.gather(
            *(sync_cost_codes_one_job(jid) for jid in job_ids),
            return_exceptions=False,
        )
        cost_code_count = sum(results)

        # 5. Sync bills (per-job pagination, sequential to avoid grid endpoint deadlocks)
        if not skip_bills and job_ids:
            try:
                async with get_session() as db:
                    bill_count = await sync_bills_for_jobs(
                        db, client, settings.bt_builder_id, job_ids
                    )
            except Exception as e:
                errors.append({"step": "bills", "error": str(e)})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {e}",
        ) from e

    finished_at = datetime.now(UTC)
    duration_seconds = (finished_at - started_at).total_seconds()

    return {
        "started_at": started_at.isoformat().replace("+00:00", "Z"),
        "finished_at": finished_at.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round(duration_seconds, 2),
        "counts": {
            "jobs": job_count,
            "vendors": vendor_count,
            "cost_codes": cost_code_count,
            "bills": bill_count,
        },
        "errors": errors,
        "ok": len(errors) == 0,
    }


@router.get("/status")
async def sync_status() -> dict:
    """Report when each table was last synced (max syncedAt per table)."""
    async with get_session() as db:
        result: dict[str, str | None] = {}
        for table in ("bt_jobs", "bt_vendors", "bt_cost_codes", "bt_bills"):
            # `table` is only ever a literal from the tuple above (not user input).
            cursor = await db.execute(text(f'SELECT MAX("syncedAt") FROM {table}'))
            value = cursor.scalar()
            result[table] = (
                value.isoformat().replace("+00:00", "Z") if value is not None else None
            )
        return {"last_synced": result}
