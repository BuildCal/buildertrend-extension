"""Lookup endpoints — vendors, jobs, cost codes etc.

Used by the web app to populate dropdowns and validate references
before creating bills.
"""

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_internal_token
from app.clients import BTAuthError, BTClient
from app.session_store import get_active_session

router = APIRouter(
    prefix="/lookups",
    tags=["lookups"],
    dependencies=[Depends(require_internal_token)],
)


def _client():
    session = get_active_session()
    if session is None:
        raise HTTPException(503, "No active BT session.")
    return BTClient(cookies=session.cookies)


def _reraise_auth(exc: BTAuthError) -> NoReturn:
    raise HTTPException(503, str(exc)) from exc


@router.get("/jobs")
async def list_jobs() -> dict:
    try:
        return _client().get_jobs()
    except BTAuthError as e:
        _reraise_auth(e)


@router.get("/vendors-for-job/{job_id}")
async def vendors_for_job(job_id: int) -> list[dict]:
    """Returns the list of subs/vendors assignable to bills on this job."""
    try:
        defaults = _client().get_bill_defaults(job_id)
    except BTAuthError as e:
        _reraise_auth(e)

    options = defaults["data"].get("assignedTo", {}).get("options", [])
    vendors = []
    for group in options:
        if group.get("name") == "Subs/Vendors":
            for opt in group.get("options", []):
                extra = opt.get("extraData", {}) or {}
                vendors.append(
                    {
                        "id": opt["id"],
                        "name": opt["name"],
                        "email": extra.get("emailAddresses"),
                        "is_active": extra.get("isActive", True),
                        "user_type": extra.get("userType", 2),
                    }
                )
    return vendors


@router.get("/cost-codes-for-job/{job_id}")
async def cost_codes_for_job(job_id: int) -> dict:
    try:
        return _client().get_cost_codes(job_id)
    except BTAuthError as e:
        _reraise_auth(e)
