"""Bills routes — what the web app calls to create/read bills in BT."""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status

from app.auth import require_internal_token
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

        # Build the BT-specific payload from our clean request model
        payload = _build_bt_bill_payload(req)
        result = client.create_bill(req.job_id, payload)

        bill_data = result["data"]
        return CreateBillResponse(
            bill_id=bill_data["id"],
            external_id=bill_data["externalId"],
            status="created",
        )
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


# ----------------------------------------------------------------------
# Payload construction — the messy BT-specific shape lives here, hidden
# from the rest of the codebase.
# ----------------------------------------------------------------------


def _build_bt_bill_payload(req: CreateBillRequest) -> dict:
    """Translate our clean CreateBillRequest into the BT API's payload.

    BT expects ~50 fields, most of which are UI configuration noise.
    We send the minimum that produces a valid bill.

    The web app is expected to pass a `vendor_id` that is valid for the
    job (from `/lookups/vendors-for-job/{job_id}`). This sidecar does
    not re-fetch the vendor list on every create.
    """
    return {
        "billNumber": req.bill_number,
        "billTitle": req.bill_title,
        "invoiceDate": req.invoice_date.strftime("%Y-%m-%dT%H:%M:%S"),
        "performingUserId": req.vendor_id,
        "performingUserType": 2,  # subs/vendors
        "performingUserName": "",  # BT looks this up from the ID
        "performingUserEmail": "",
        "miscPaidToName": "",
        "unifiedDeadlineRequest": {
            "isDeadlineLinked": False,
            "deadlineOffset": 0,
            "deadlineIsAfterLinkedItem": True,
            "scheduleItemSelectedValue": -1,
            "dueDate": req.due_date.strftime("%Y-%m-%dT%H:%M:%S"),
            "paymentTerms": None,
        },
        "attachedFiles": {"removeDocs": [], "attachDocs": [], "updateDocs": []},
        "lineItems": [
            {
                "id": 0,
                "costCodeId": li.cost_code_id,
                "costCode": li.cost_code_id,
                "unitCost": li.unit_cost,
                "quantity": li.quantity,
                "unitType": li.unit_type,
                "builderCost": li.unit_cost,
                "title": li.title,
                "description": li.description,
                "internalNotes": "",
                "catalogItemId": None,
                "pageType": "",
                "pageTypeEnum": 17,
                "shouldUseAutoUpdates": False,
                "varianceCode": 0,
                "parentId": None,
                "costTypes": li.cost_types,
                "markedAs": -1,
            }
            for li in req.line_items
        ],
        "description": req.description,
        "purchaseOrderId": req.purchase_order_id,
        "jobId": req.job_id,
        "billId": 0,
        "status": 0,
        "documentType": 0,
        "containerIsValid": True,
        "billToOwner": False,
        "sendToAccounting": False,
        "readyForPayment": False,
        "isCreateNewFromPO": req.purchase_order_id is not None,
        "syncUpdatesToAccounting": False,
        "sendForApproval": False,
        "approveBill": False,
        "saveDraftToJob": False,
        "payInFull": False,
        "payOnline": False,
        "isSendToAccountingDirty": False,
        "billLineItems": [],
        "customFields": [],
        "selectedApprovers": [],
        "resetApprovalGlobalUserIds": [],
        "approvalIdsToDelete": [],
        "approvers": [],
        "approvalCommentNotificationUsers": [],
        "approvalCommentMentionableUsers": [],
        "selectedJobId": req.job_id,
        "varianceCount": 0,
    }
