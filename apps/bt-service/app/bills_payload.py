"""Captured Buildertrend bill create + save-draft + EntityDocs payloads.

Replay the 2 Sep 2026 cookie-session capture only. Do not invent
GetBillMapping / real PO-link, Ready-for-Payment, pay, accounting,
approve, or ocr-upload.

Bills are exclusive GST only — no dummy 4000 GST line, no tax group.
Tenant customFields come from GET defaultinfo at runtime, never hardcoded.
"""

from __future__ import annotations

from typing import Any

from app.models.api import BillLineItem, CreateBillRequest

BILL_DRAFT_STATUS = 9
BILL_ENTITY_DOCUMENT_TYPE = 58
BILL_TEMPFILE_MEDIA_TYPE = 61
BILL_TEMPFILE_FIELD = "fileList"
BILL_PAGE_TYPE_ENUM = 17
BILL_PRICE_TYPE = 2
BILL_PERFORMING_USER_TYPE = 2
BILL_NONE_PO_ID = -1
BILL_CREATE_COST_TYPES: list[int] = []
BILL_SAVE_DRAFT_COST_TYPES = [-1]
BILL_LINE_MARKED_AS = -1

SEND_PAY_FLAGS = (
    "readyForPayment",
    "payInFull",
    "payOnline",
    "sendToAccounting",
    "syncUpdatesToAccounting",
    "sendForApproval",
    "approveBill",
    "billToOwner",
)

DEFAULTINFO_SEED_KEYS = (
    "customFields",
    "lienWaiverFormId",
    "lienWaiverTemplateId",
    "unifiedDeadlineRequest",
    "description",
    "performingUserName",
    "performingUserEmail",
    "miscPaidToName",
    "varianceCount",
    "containerIsValid",
)


class BillPayloadError(ValueError):
    """Raised when a captured bill write would send a locked or uncaptured flag."""


def empty_attached_files() -> dict[str, list[Any]]:
    return {"removeDocs": [], "attachDocs": [], "updateDocs": []}


def seed_from_defaultinfo(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    data = raw.get("data", raw)
    if not isinstance(data, dict):
        return {}
    if isinstance(data.get("bill"), dict):
        return data["bill"]
    if isinstance(data.get("defaults"), dict):
        return data["defaults"]
    return data


def copy_defaultinfo_seed(seed: dict[str, Any]) -> dict[str, Any]:
    return {key: seed[key] for key in DEFAULTINFO_SEED_KEYS if key in seed}


def assert_send_pay_locked(payload: dict[str, Any], *, source: str = "payload") -> None:
    raised = [flag for flag in SEND_PAY_FLAGS if payload.get(flag) is True]
    if raised:
        raise BillPayloadError(
            f"Bill send/pay/approve flags stay locked ({source}): {', '.join(raised)}"
        )


def assert_no_real_purchase_order(purchase_order_id: int | None) -> None:
    if purchase_order_id is None or purchase_order_id == BILL_NONE_PO_ID:
        return
    raise BillPayloadError(
        "Linking a real purchase order is not captured (GetBillMapping never fired). "
        "purchaseOrderId must be -1 (none)."
    )


def _lock_write_flags(body: dict[str, Any]) -> dict[str, Any]:
    for flag in SEND_PAY_FLAGS:
        body[flag] = False
    body["purchaseOrderId"] = BILL_NONE_PO_ID
    body["isCreateNewFromPO"] = False
    body["saveDraftToJob"] = False
    body["status"] = BILL_DRAFT_STATUS
    body["attachedFiles"] = empty_attached_files()
    body["isSendToAccountingDirty"] = False
    body["priceType"] = BILL_PRICE_TYPE
    body["performingUserType"] = BILL_PERFORMING_USER_TYPE
    return body


def _create_line(item: BillLineItem | None = None) -> dict[str, Any]:
    cost_code = item.cost_code_id if item is not None else None
    return {
        "id": 0,
        "costCodeId": cost_code,
        "costCode": cost_code,
        "unitCost": 0,
        "quantity": item.quantity if item is not None else 1,
        "unitType": item.unit_type if item is not None else "ea",
        "builderCost": 0,
        "title": item.title if item is not None else "",
        "description": item.description if item is not None else "",
        "internalNotes": "",
        "catalogItemId": None,
        "pageType": "",
        "pageTypeEnum": BILL_PAGE_TYPE_ENUM,
        "shouldUseAutoUpdates": False,
        "varianceCode": 0,
        "parentId": None,
        "costTypes": list(BILL_CREATE_COST_TYPES),
        "markedAs": BILL_LINE_MARKED_AS,
    }


def _save_draft_line(created: dict[str, Any], item: BillLineItem | None) -> dict[str, Any]:
    exclusive = float(item.unit_cost) if item is not None else float(created.get("unitCost") or 0)
    title = item.title if item is not None else created.get("title", "")
    description = item.description if item is not None else created.get("description", "")
    cost_code = item.cost_code_id if item is not None else created.get("costCodeId")
    quantity = item.quantity if item is not None else created.get("quantity", 1)
    unit_type = item.unit_type if item is not None else created.get("unitType", "ea")
    out = dict(created)
    out.update(
        {
            "id": created.get("id") or 0,
            "costCodeId": cost_code,
            "costCode": cost_code,
            "unitCost": exclusive,
            "builderCost": exclusive,
            "quantity": quantity,
            "unitType": unit_type,
            "title": title,
            "description": description,
            "pageTypeEnum": created.get("pageTypeEnum", BILL_PAGE_TYPE_ENUM),
            "costTypes": list(BILL_SAVE_DRAFT_COST_TYPES),
            "markedAs": created.get("markedAs", BILL_LINE_MARKED_AS),
        }
    )
    return out


def build_create_payload(
    req: CreateBillRequest,
    seed_raw: Any = None,
) -> dict[str, Any]:
    """POST /api/v1/bills body. Amounts stay 0; exclusive dollars go on the PUT."""
    assert_no_real_purchase_order(req.purchase_order_id)
    seed = seed_from_defaultinfo(seed_raw)
    lines = [_create_line(item) for item in req.line_items] or [_create_line()]
    due = req.due_date.strftime("%Y-%m-%dT%H:%M:%S") if req.due_date else None
    invoice = req.invoice_date.strftime("%Y-%m-%dT%H:%M:%S") if req.invoice_date else None
    body: dict[str, Any] = {
        **copy_defaultinfo_seed(seed),
        "billNumber": req.bill_number,
        "billTitle": req.bill_title,
        "invoiceDate": invoice,
        "performingUserId": req.vendor_id,
        "performingUserType": BILL_PERFORMING_USER_TYPE,
        "performingUserName": seed.get("performingUserName") or "",
        "performingUserEmail": seed.get("performingUserEmail") or "",
        "miscPaidToName": seed.get("miscPaidToName") or "",
        "assignedToInfo": {
            **(seed.get("assignedToInfo") if isinstance(seed.get("assignedToInfo"), dict) else {}),
            "id": req.vendor_id,
            "userType": BILL_PERFORMING_USER_TYPE,
        },
        "unifiedDeadlineRequest": {
            "isDeadlineLinked": False,
            "deadlineOffset": 0,
            "deadlineIsAfterLinkedItem": True,
            "scheduleItemSelectedValue": -1,
            "dueDate": due,
            "paymentTerms": None,
        },
        "attachedFiles": empty_attached_files(),
        "lineItems": lines,
        "description": req.description,
        "purchaseOrderId": BILL_NONE_PO_ID,
        "jobId": req.job_id,
        "selectedJobId": req.job_id,
        "billId": 0,
        "status": BILL_DRAFT_STATUS,
        "documentType": 0,
        "containerIsValid": True,
        "isCreateNewFromPO": False,
        "saveAsDraft": False,
        "saveDraftToJob": False,
        "priceType": BILL_PRICE_TYPE,
        "billLineItems": [],
        "selectedApprovers": [],
        "resetApprovalGlobalUserIds": [],
        "approvalIdsToDelete": [],
        "approvers": [],
        "approvalCommentNotificationUsers": [],
        "approvalCommentMentionableUsers": [],
        "varianceCount": seed.get("varianceCount") or 0,
    }
    return _lock_write_flags(body)


def build_save_draft_payload(
    created: dict[str, Any],
    req: CreateBillRequest,
    bill_id: int,
) -> dict[str, Any]:
    """PUT /api/v1/bills/{billId} Save-draft body."""
    created_lines = created.get("lineItems") if isinstance(created.get("lineItems"), list) else []
    lines: list[dict[str, Any]] = []
    for index, item in enumerate(req.line_items):
        existing = (
            created_lines[index]
            if index < len(created_lines) and isinstance(created_lines[index], dict)
            else {}
        )
        lines.append(_save_draft_line(existing, item))
    if not lines and created_lines:
        lines = [_save_draft_line(row, None) for row in created_lines if isinstance(row, dict)]
    invoice = (
        req.invoice_date.strftime("%Y-%m-%dT%H:%M:%S")
        if req.invoice_date
        else created.get("invoiceDate")
    )
    body = {
        **created,
        "billNumber": req.bill_number,
        "billTitle": req.bill_title,
        "invoiceDate": invoice,
        "performingUserId": req.vendor_id,
        "performingUserType": BILL_PERFORMING_USER_TYPE,
        "assignedToInfo": {
            **(
                created["assignedToInfo"] if isinstance(created.get("assignedToInfo"), dict) else {}
            ),
            "id": req.vendor_id,
            "userType": BILL_PERFORMING_USER_TYPE,
        },
        "lineItems": lines,
        "description": req.description,
        "jobId": req.job_id,
        "selectedJobId": req.job_id,
        "billId": bill_id,
        "saveAsDraft": True,
        "saveDraftToJob": False,
        "status": BILL_DRAFT_STATUS,
        "attachedFiles": empty_attached_files(),
        "purchaseOrderId": BILL_NONE_PO_ID,
        "isCreateNewFromPO": False,
        "priceType": BILL_PRICE_TYPE,
    }
    return _lock_write_flags(body)


def build_entity_docs_payload(
    *,
    builder_id: int,
    job_id: int,
    bill_id: int,
    temp_doc: dict[str, Any],
) -> dict[str, Any]:
    return {
        "builderId": builder_id,
        "jobId": job_id,
        "id": [bill_id],
        "documentType": BILL_ENTITY_DOCUMENT_TYPE,
        "notifyBuilder": False,
        "notifyOwner": False,
        "notifySubs": False,
        "attachedFiles": {
            "removeDocs": [],
            "attachDocs": [temp_doc],
            "updateDocs": [],
        },
    }
