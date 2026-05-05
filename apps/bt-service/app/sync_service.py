"""Sync data from Buildertrend into Supabase mirror tables.

Each function fetches a slice of BT data, transforms it to match the
Prisma-owned bt_* table shape, and upserts via SQLAlchemy.
"""

from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients import BTClient


def _str_or_none(v):
    """Convert any value to str, preserving None."""
    return str(v) if v is not None else None


def _parse_bt_date(v):
    """Parse a BT-format ISO date string to datetime, or None.

    BT returns dates like '2026-04-16T13:45:53' (no timezone) or null.
    Returns None for null/empty input or unparseable strings.
    """
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    try:
        # BT dates are naive ISO format. fromisoformat handles them.
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


async def sync_jobs(session: AsyncSession, client: BTClient, builder_id: int) -> int:
    """Fetch all jobs from BT and upsert into bt_jobs. Returns row count."""
    result = client.get_jobs()
    jobs = result.get("data", {}).get("jobs", [])

    count = 0
    for j in jobs:
        job_id = j.get("jobID")
        if not job_id:
            continue
        await session.execute(
            text("""
                INSERT INTO bt_jobs (
                    "btJobId", "builderId", "name", "jobNumber", "status", "address", "syncedAt"
                )
                VALUES (:btJobId, :builderId, :name, :jobNumber, :status, :address, :syncedAt)
                ON CONFLICT ("btJobId") DO UPDATE SET
                    "name" = EXCLUDED."name",
                    "jobNumber" = EXCLUDED."jobNumber",
                    "status" = EXCLUDED."status",
                    "address" = EXCLUDED."address",
                    "syncedAt" = EXCLUDED."syncedAt"
            """),
            {
                "btJobId": job_id,
                "builderId": builder_id,
                "name": j.get("jobName") or "",
                "jobNumber": j.get("jobNumber"),
                "status": _str_or_none(j.get("jobStatus")),
                "address": j.get("street") or j.get("address"),
                "syncedAt": datetime.utcnow(),
            },
        )
        count += 1
    return count


async def sync_vendors_global(
    session: AsyncSession, client: BTClient, builder_id: int, job_ids: list[int]
) -> int:
    """Fetch vendors once (using one job's defaults) and upsert all in a single batch.

    Vendors aren't actually job-scoped in BT — every job sees the same vendor list.
    We just need any one job to query against. Pick the first job_id provided.
    Returns count of unique vendors upserted.
    """
    if not job_ids:
        return 0

    # Use the first job to fetch the vendor list
    result = client.get_bill_defaults(job_ids[0])
    groups = result.get("data", {}).get("assignedTo", {}).get("options", [])

    # Collect unique vendors first (deduped)
    vendors_by_id: dict[int, dict] = {}
    for group in groups:
        if group.get("name") != "Subs/Vendors":
            continue
        for opt in group.get("options", []):
            vendor_id = opt.get("id")
            if not vendor_id or vendor_id in vendors_by_id:
                continue
            extra = opt.get("extraData") or {}
            vendors_by_id[vendor_id] = {
                "btVendorId": vendor_id,
                "builderId": builder_id,
                "name": opt.get("name") or "",
                "email": extra.get("emailAddresses"),
                "phone": _str_or_none(extra.get("phone")),
                "userType": extra.get("userType", 2),
                "syncedAt": datetime.utcnow(),
            }

    # Sort by btVendorId so all workers (if there were any) take locks
    # in a consistent order — eliminates deadlock risk if we ever do go
    # back to per-worker writes.
    for params in sorted(vendors_by_id.values(), key=lambda p: p["btVendorId"]):
        await session.execute(
            text("""
                INSERT INTO bt_vendors (
                    "btVendorId", "builderId", "name", "email", "phone", "userType", "syncedAt"
                )
                VALUES (:btVendorId, :builderId, :name, :email, :phone, :userType, :syncedAt)
                ON CONFLICT ("btVendorId") DO UPDATE SET
                    "name" = EXCLUDED."name",
                    "email" = EXCLUDED."email",
                    "phone" = EXCLUDED."phone",
                    "userType" = EXCLUDED."userType",
                    "syncedAt" = EXCLUDED."syncedAt"
            """),
            params,
        )
    return len(vendors_by_id)


# DEPRECATED: use sync_vendors_global; vendors are not job-scoped in BT.
async def sync_vendors_for_job(
    session: AsyncSession, client: BTClient, builder_id: int, job_id: int
) -> int:
    """Fetch vendors for a specific job and upsert into bt_vendors. Returns row count."""
    result = client.get_bill_defaults(job_id)
    groups = result.get("data", {}).get("assignedTo", {}).get("options", [])

    count = 0
    for group in groups:
        if group.get("name") != "Subs/Vendors":
            continue
        for opt in group.get("options", []):
            vendor_id = opt.get("id")
            if not vendor_id:
                continue
            extra = opt.get("extraData") or {}
            await session.execute(
                text("""
                    INSERT INTO bt_vendors (
                        "btVendorId", "builderId", "name", "email", "phone", "userType", "syncedAt"
                    )
                    VALUES (:btVendorId, :builderId, :name, :email, :phone, :userType, :syncedAt)
                    ON CONFLICT ("btVendorId") DO UPDATE SET
                        "name" = EXCLUDED."name",
                        "email" = EXCLUDED."email",
                        "phone" = EXCLUDED."phone",
                        "userType" = EXCLUDED."userType",
                        "syncedAt" = EXCLUDED."syncedAt"
                """),
                {
                    "btVendorId": vendor_id,
                    "builderId": builder_id,
                    "name": opt.get("name") or "",
                    "email": extra.get("emailAddresses"),
                    "phone": _str_or_none(extra.get("phone")),
                    "userType": extra.get("userType", 2),
                    "syncedAt": datetime.utcnow(),
                },
            )
            count += 1
    return count


async def sync_cost_codes_for_job(
    session: AsyncSession, client: BTClient, builder_id: int, job_id: int
) -> int:
    """Fetch cost codes for a job and upsert into bt_cost_codes. Returns row count."""
    result = client.get_cost_codes(job_id)
    codes = result.get("data", {}).get("costCodesWithBudget", [])

    count = 0
    for c in codes:
        cc_id = c.get("id") or c.get("costCodeId")
        if not cc_id:
            continue
        await session.execute(
            text("""
                INSERT INTO bt_cost_codes (
                    "btCostCodeId", "builderId", "btJobId", "code", "title", "syncedAt"
                )
                VALUES (:btCostCodeId, :builderId, :btJobId, :code, :title, :syncedAt)
                ON CONFLICT ("btCostCodeId") DO UPDATE SET
                    "code" = EXCLUDED."code",
                    "title" = EXCLUDED."title",
                    "syncedAt" = EXCLUDED."syncedAt"
            """),
            {
                "btCostCodeId": cc_id,
                "builderId": builder_id,
                "btJobId": job_id,
                "code": _str_or_none(
                    c.get("code") or c.get("displayCode") or c.get("displayName")
                )
                or "",
                "title": _str_or_none(
                    c.get("title") or c.get("name") or c.get("displayName")
                )
                or "",
                "syncedAt": datetime.utcnow(),
            },
        )
        count += 1
    return count


async def sync_bills_for_jobs(
    session: AsyncSession,
    client: BTClient,
    builder_id: int,
    job_ids: list[int],
) -> int:
    """Fetch all bills (any status) for the given jobs and upsert into bt_bills.

    Paginates through BT's grid endpoint until all pages consumed.
    Returns total bill count upserted.
    """
    if not job_ids:
        return 0

    all_bill_count = 0

    # BT's grid endpoint returns one page at a time. We hit each job
    # separately because the grid endpoint takes jobIds[] as a filter.
    # All-status filter is "0,1,2,3,4,5,6,7,8,9,-2".
    for job_id in job_ids:
        page = 1
        page_size = 250
        while True:
            try:
                result = client.get_bills_grid(
                    page=page,
                    page_size=page_size,
                    status_filter="0,1,2,3,4,5,6,7,8,9,-2",
                    job_ids=[job_id],
                )
            except Exception as e:
                # Log and skip this job — don't abort the whole sync
                import logging

                logging.getLogger(__name__).warning(
                    "Failed to fetch bills for job %s page %s: %s", job_id, page, e
                )
                break

            data = result.get("data", {})
            bills = data.get("data", [])
            total_pages = data.get("totalPages", 1)

            if not bills:
                break

            # Sort by btBillId for consistent lock order (deadlock prevention)
            rows: list[dict] = []
            for b in bills:
                bill_id = b.get("id")
                if not bill_id:
                    continue

                # Flatten nested fields. BT puts strings inside link objects.
                bill_number_link = b.get("billNumberLink") or {}
                bill_title_link = b.get("billTitleLink") or {}
                due_date_obj = b.get("dueDate") or {}
                pay_to_obj = b.get("payTo") or {}
                po_status_obj = b.get("purchaseOrderPaymentStatus") or {}

                # Pick the first related PO if present.
                related_pos = b.get("relatedPurchaseOrders") or []
                first_po_id = None
                if related_pos and isinstance(related_pos, list):
                    first = related_pos[0] if isinstance(related_pos[0], dict) else None
                    if first:
                        first_po_id = first.get("id") or first.get("purchaseOrderId")

                rows.append(
                    {
                        "btBillId": bill_id,
                        "builderId": builder_id,
                        "btJobId": b.get("jobId"),
                        "btVendorId": None,  # not exposed in grid response; resolved later via payTo
                        "btPurchaseOrderId": first_po_id,
                        "billNumber": _str_or_none(bill_number_link.get("title")),
                        "billTitle": _str_or_none(bill_title_link.get("title")),
                        "paymentAmount": (b.get("paymentAmount") or {}).get("value"),
                        "invoicedDate": _parse_bt_date(b.get("invoicedDate")),
                        "dueDate": _parse_bt_date(due_date_obj.get("date")),
                        "datePaid": _parse_bt_date(b.get("datePaid")),
                        "isPastDue": bool(due_date_obj.get("isPastDue", False)),
                        "payToName": _str_or_none(pay_to_obj.get("payTo")),
                        "paymentStatus": po_status_obj.get("paymentStatus"),
                        "purchaseOrderNumber": _str_or_none(b.get("billPurchaseOrderNumber")),
                        "syncedAt": datetime.utcnow(),
                    }
                )

            rows.sort(key=lambda r: r["btBillId"])

            # FK to bt_purchase_orders — only keep PO ids already mirrored (PO sync may lag).
            po_ids = {r["btPurchaseOrderId"] for r in rows if r.get("btPurchaseOrderId") is not None}
            if po_ids:
                existing = await session.execute(
                    text(
                        'SELECT "btPurchaseOrderId" FROM bt_purchase_orders '
                        'WHERE "btPurchaseOrderId" IN :ids'
                    ).bindparams(bindparam("ids", expanding=True)),
                    {"ids": sorted(po_ids)},
                )
                allowed_po = {row[0] for row in existing.fetchall()}
                for r in rows:
                    pid = r.get("btPurchaseOrderId")
                    if pid is not None and pid not in allowed_po:
                        r["btPurchaseOrderId"] = None

            for params in rows:
                await session.execute(
                    text("""
                        INSERT INTO bt_bills (
                            "btBillId", "builderId", "btJobId", "btVendorId",
                            "btPurchaseOrderId", "billNumber", "billTitle",
                            "paymentAmount", "invoicedDate", "dueDate", "datePaid",
                            "isPastDue", "payToName", "paymentStatus",
                            "purchaseOrderNumber", "syncedAt"
                        )
                        VALUES (
                            :btBillId, :builderId, :btJobId, :btVendorId,
                            :btPurchaseOrderId, :billNumber, :billTitle,
                            :paymentAmount, :invoicedDate, :dueDate, :datePaid,
                            :isPastDue, :payToName, :paymentStatus,
                            :purchaseOrderNumber, :syncedAt
                        )
                        ON CONFLICT ("btBillId") DO UPDATE SET
                            "btJobId" = EXCLUDED."btJobId",
                            "btVendorId" = EXCLUDED."btVendorId",
                            "btPurchaseOrderId" = EXCLUDED."btPurchaseOrderId",
                            "billNumber" = EXCLUDED."billNumber",
                            "billTitle" = EXCLUDED."billTitle",
                            "paymentAmount" = EXCLUDED."paymentAmount",
                            "invoicedDate" = EXCLUDED."invoicedDate",
                            "dueDate" = EXCLUDED."dueDate",
                            "datePaid" = EXCLUDED."datePaid",
                            "isPastDue" = EXCLUDED."isPastDue",
                            "payToName" = EXCLUDED."payToName",
                            "paymentStatus" = EXCLUDED."paymentStatus",
                            "purchaseOrderNumber" = EXCLUDED."purchaseOrderNumber",
                            "syncedAt" = EXCLUDED."syncedAt"
                    """),
                    params,
                )
                all_bill_count += 1

            # If this was the last page, stop
            if page >= total_pages:
                break
            page += 1

    return all_bill_count
