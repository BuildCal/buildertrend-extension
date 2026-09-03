"""API models — what the web app sends to / receives from this service.

Keep these stable. Internal BT response shapes are messy; we normalise
them into clean models here.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

# ----------------------------------------------------------------------
# Session management
# ----------------------------------------------------------------------


class CookieEntry(BaseModel):
    value: str
    domain: str
    path: str = "/"


class SessionUploadRequest(BaseModel):
    """The web app posts this to /sessions when an admin refreshes BT cookies."""

    cookies: dict[str, CookieEntry]
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    captured_by_user_id: str


class SessionStatus(BaseModel):
    is_authenticated: bool
    expires_estimated_at: datetime | None = None
    last_verified_at: datetime | None = None
    captured_by: str | None = None


# ----------------------------------------------------------------------
# Buildertrend domain models (clean versions of BT responses)
# ----------------------------------------------------------------------


class Vendor(BaseModel):
    id: int
    name: str
    email: str | None = None
    user_type: int  # 1=internal, 2=sub/vendor, 3=misc
    is_active: bool = True


class Job(BaseModel):
    id: int
    name: str
    builder_id: int
    status: int


class CostCode(BaseModel):
    id: int
    title: str
    parent_id: int | None = None


class BillLineItem(BaseModel):
    cost_code_id: int
    title: str
    description: str = ""
    quantity: float = 1
    unit_cost: float
    unit_type: str = "ea"
    cost_types: list[int] = Field(default_factory=list)


class CreateBillRequest(BaseModel):
    job_id: int
    vendor_id: int
    bill_number: str
    bill_title: str
    invoice_date: datetime
    due_date: datetime
    description: str = ""
    line_items: list[BillLineItem]
    purchase_order_id: int | None = None

    # Source tracking — what triggered this bill creation
    source_extraction_id: str = Field(
        ...,
        description="Stable identifier from the source system, used for "
        "idempotency. Same id will not create a duplicate.",
    )


class CreateBillResponse(BaseModel):
    bill_id: int
    external_id: str
    status: Literal["created", "duplicate"]
