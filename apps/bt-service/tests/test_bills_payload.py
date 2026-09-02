"""Captured bill payload flags — no live Buildertrend calls."""

from datetime import datetime

import pytest

from app.bills_payload import (
    BILL_CREATE_COST_TYPES,
    BILL_DRAFT_STATUS,
    BILL_ENTITY_DOCUMENT_TYPE,
    BILL_NONE_PO_ID,
    BILL_SAVE_DRAFT_COST_TYPES,
    BillPayloadError,
    build_create_payload,
    build_entity_docs_payload,
    build_save_draft_payload,
)
from app.models.api import BillLineItem, CreateBillRequest


def _req(**overrides: object) -> CreateBillRequest:
    base = {
        "job_id": 9,
        "vendor_id": 3,
        "bill_number": "TEST-1",
        "bill_title": "Gateway capture",
        "invoice_date": datetime(2026, 9, 2),
        "due_date": datetime(2026, 9, 16),
        "description": "",
        "line_items": [
            BillLineItem(
                cost_code_id=88,
                title="Gateway capture line",
                unit_cost=1.0,
            )
        ],
        "purchase_order_id": None,
        "source_extraction_id": "src-1",
    }
    base.update(overrides)
    return CreateBillRequest.model_validate(base)


def test_create_payload_matches_captured_flags() -> None:
    seed = {
        "data": {
            "customFields": [{"id": 1, "name": "Test field", "options": [{"id": 1, "label": "A"}]}],
            "lienWaiverFormId": 42,
        }
    }
    body = build_create_payload(_req(), seed)
    assert body["status"] == BILL_DRAFT_STATUS == 9
    assert body["saveAsDraft"] is False
    assert body["saveDraftToJob"] is False
    assert body["purchaseOrderId"] == BILL_NONE_PO_ID == -1
    assert body["isCreateNewFromPO"] is False
    assert body["billId"] == 0
    assert body["attachedFiles"] == {"removeDocs": [], "attachDocs": [], "updateDocs": []}
    assert body["customFields"] == seed["data"]["customFields"]
    assert body["lienWaiverFormId"] == 42
    line = body["lineItems"][0]
    assert line["id"] == 0
    assert line["pageTypeEnum"] == 17
    assert line["costTypes"] == BILL_CREATE_COST_TYPES == []
    assert line["unitCost"] == 0
    assert line["builderCost"] == 0
    assert line["markedAs"] == -1
    for flag in (
        "readyForPayment",
        "payInFull",
        "payOnline",
        "sendToAccounting",
        "syncUpdatesToAccounting",
        "sendForApproval",
        "approveBill",
        "billToOwner",
    ):
        assert body[flag] is False


def test_save_draft_payload_sets_exclusive_amounts() -> None:
    created = {
        "id": 1001,
        "lineItems": [{"id": 501, "title": "", "unitCost": 0, "builderCost": 0, "costTypes": []}],
        "customFields": [{"id": 1}],
    }
    body = build_save_draft_payload(created, _req(), 1001)
    assert body["saveAsDraft"] is True
    assert body["status"] == 9
    assert body["saveDraftToJob"] is False
    assert body["billId"] == 1001
    assert body["purchaseOrderId"] == -1
    assert body["isCreateNewFromPO"] is False
    assert body["attachedFiles"]["attachDocs"] == []
    line = body["lineItems"][0]
    assert line["id"] == 501
    assert line["unitCost"] == 1.0
    assert line["builderCost"] == 1.0
    assert line["costTypes"] == list(BILL_SAVE_DRAFT_COST_TYPES)
    assert line["title"] == "Gateway capture line"
    assert body["customFields"] == [{"id": 1}]


def test_entity_docs_is_one_attach_document_type_58() -> None:
    temp = {"id": 7001, "title": "test-invoice-1.pdf", "tempId": "temp-1"}
    body = build_entity_docs_payload(builder_id=99999, job_id=9, bill_id=1001, temp_doc=temp)
    assert body["documentType"] == BILL_ENTITY_DOCUMENT_TYPE == 58
    assert body["id"] == [1001]
    assert body["attachedFiles"]["attachDocs"] == [temp]
    assert len(body["attachedFiles"]["attachDocs"]) == 1
    assert body["notifyBuilder"] is False


def test_real_po_id_is_rejected() -> None:
    with pytest.raises(BillPayloadError, match="GetBillMapping"):
        build_create_payload(_req(purchase_order_id=44))
