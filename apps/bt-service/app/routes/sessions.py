"""Session management — admin uploads BT cookies via this endpoint."""

from fastapi import APIRouter, Depends

from app.auth import require_internal_token
from app.clients import BTAuthError, BTClient
from app.models.api import SessionStatus, SessionUploadRequest
from app.session_store import (
    get_active_session,
    get_session_status,
    store_session,
)

router = APIRouter(
    prefix="/sessions",
    tags=["sessions"],
    dependencies=[Depends(require_internal_token)],
)


@router.post("/refresh")
async def refresh_session(req: SessionUploadRequest) -> SessionStatus:
    """Admin posts cookies captured from a logged-in browser.

    We verify the session works by hitting AccountInfo/GlobalInfo before
    storing, so the user gets immediate feedback.
    """
    cookies_dict = {
        name: {"value": c.value, "domain": c.domain, "path": c.path}
        for name, c in req.cookies.items()
    }

    # Verify the session is actually valid before persisting it
    test_client = BTClient(cookies=cookies_dict)
    try:
        test_client.get_account_info()
    except BTAuthError as e:
        return SessionStatus(
            is_authenticated=False,
            captured_by=req.captured_by_user_id,
        )

    store_session(
        cookies=cookies_dict,
        captured_at=req.captured_at,
        captured_by_user_id=req.captured_by_user_id,
    )

    return get_session_status()


@router.get("/status")
async def session_status() -> SessionStatus:
    """Check whether we have a valid BT session right now."""
    return get_session_status()
