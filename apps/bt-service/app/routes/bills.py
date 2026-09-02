"""Bills routes — what the web app calls to create/read bills in BT."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status

from app.auth import require_internal_token
from app.bills_payload import (
    BillPayloadError,
    build_create_payload,
    build_save_draft_payload,
    seed_from_defaultinfo,
)
from app.clients import BTAPIError, BTAuthError, BTClient
from app.models.api import (
    CreateBillRequest,
    CreateBillResponse,
)
from app.session_store import get_active_session

STATUS_PRESETS = {
    "draft": "9",
    "in_review": "0,8",
    "ready_for_payment": "1",
    "paid": "4,5,2",
    "other": "7,3,6,-2",
    "all": "0,1,2,3,4,5,6,7,8,9,-2",
}

router = APIRouter(
    prefix="/bills",
    tags=["bills"],
    dependencies=[Depends(require_internal_token)],
)


def _client_for_active_session() -> BTClient:
    """Build a BTClient using the currently-stored session.

    Raises 503 if no valid session is stored — the admin needs to refresh.
    """
    session = get_active_session()
    if session is None:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No active Buildertrend session. Admin must refresh.",
        )
    return BTClient(cookies=session.cookies)


def _reraise_bt(exc: BTAuthError | BTAPIError) -> NoReturn:
    if isinstance(exc, BTAuthError):
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    raise HTTPException(
        status_code=http_status.HTTP_502_BAD_GATEWAY,
        detail=str(exc),
    ) from exc


def _parse_job_ids_csv(job_ids: str | None) -> list[int] | None:
    if job_ids is None:
        return None
    stripped = job_ids.strip()
    if not stripped:
        return None
    out: list[int] = []
    for part in stripped.split(","):
        piece = part.strip()
        if not piece:
            continue
        try:
            out.append(int(piece))
        except ValueError as exc:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="job_ids must be a comma-separated list of integers",
            ) from exc
    return out or None


@router.post("", response_model=CreateBillResponse)
async def create_bill(req: CreateBillRequest) -> CreateBillResponse:
    """Create a bill in Buildertrend.

    The web app enforces idempotency on `source_extraction_id` before
    calling this endpoint. Audit logging also lives in the web app.
    """
    try:
        client = _client_for_active_session()

        defaults = client.get_bill_defaults(req.job_id)
        payload = build_create_payload(req, defaults)
        result = client.create_bill(req.job_id, payload)

        bill_data = seed_from_defaultinfo(result)
        bill_id = bill_data.get("id") or bill_data.get("billId")
        if not bill_id:
            raise HTTPException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                detail="Bill create did not return an id",
            )
        save_payload = build_save_draft_payload(bill_data, req, int(bill_id))
        saved = client.update_bill(int(bill_id), save_payload)
        saved_data = seed_from_defaultinfo(saved)
        return CreateBillResponse(
            bill_id=int(bill_id),
            external_id=str(saved_data.get("externalId") or bill_data.get("externalId") or bill_id),
            status="created",
        )
    except BillPayloadError as e:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except (BTAuthError, BTAPIError) as e:
        _reraise_bt(e)


@router.get("")
async def list_bills(
    page: int = 1,
    page_size: int = 100,
    status: str = "all",
    job_ids: str | None = None,
    sort_column: str = "27",
    sort_direction: str = "desc",
    search: str = "",
) -> dict:
    if status not in STATUS_PRESETS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"status must be one of: {', '.join(sorted(STATUS_PRESETS))}",
        )
    parsed_job_ids = _parse_job_ids_csv(job_ids)
    client = _client_for_active_session()
    try:
        return client.get_bills_grid(
            page=page,
            page_size=page_size,
            status_filter=STATUS_PRESETS[status],
            job_ids=parsed_job_ids,
            sort_column=sort_column,
            sort_direction=sort_direction,
            search_text=search,
        )
    except (BTAuthError, BTAPIError) as e:
        _reraise_bt(e)


@router.get("/_meta/tab-counts")
async def bill_tab_counts(
    job_ids: str | None = None,
    search: str = "",
) -> dict:
    parsed_job_ids = _parse_job_ids_csv(job_ids)
    client = _client_for_active_session()
    try:
        return client.get_bill_tab_counts(
            job_ids=parsed_job_ids,
            search_text=search,
        )
    except (BTAuthError, BTAPIError) as e:
        _reraise_bt(e)


@router.get("/{bill_id}")
async def get_bill(bill_id: int) -> dict:
    client = _client_for_active_session()
    try:
        return client.get_bill(bill_id)
    except (BTAuthError, BTAPIError) as e:
        _reraise_bt(e)


