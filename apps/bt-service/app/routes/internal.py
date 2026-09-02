"""Low-level TLS transport for the TypeScript gateway.

The gateway owns verbs, dry_run, GST, and send locks. This route only
impersonates Chrome and forwards an already-authorized /api or /apix call.
"""

from typing import Any, Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from pydantic import BaseModel, Field

from app.auth import require_internal_token
from app.clients import BTAPIError, BTAuthError, BTClient, BTSendDisabled
from app.session_store import get_active_session

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(require_internal_token)],
)


class BtProxyRequest(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str
    params: dict[str, Any] | None = None
    json_body: Any = None
    content_type: str | None = Field(default="application/json")
    raw: bool = False


def _client() -> BTClient:
    session = get_active_session()
    if session is None:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail={"error": "auth_required", "message": "No active Buildertrend session."},
        )
    return BTClient(cookies=session.cookies)


def _reraise(exc: BTAuthError | BTAPIError | BTSendDisabled) -> NoReturn:
    if isinstance(exc, BTSendDisabled):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail={"error": "send_disabled", "message": str(exc)},
        ) from exc
    if isinstance(exc, BTAuthError):
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail={"error": "auth_required", "message": str(exc)},
        ) from exc
    raise HTTPException(
        status_code=http_status.HTTP_502_BAD_GATEWAY,
        detail={"error": "bt_error", "message": str(exc)},
    ) from exc


@router.post("/bt-request")
async def bt_request(req: BtProxyRequest) -> dict:
    try:
        client = _client()
        body = client._request(  # noqa: SLF001 — transport is intentionally low-level
            req.method,
            req.path,
            json_body=req.json_body,
            params=req.params,
            content_type=req.content_type,
            raw=req.raw,
        )
        if req.raw:
            return {"ok": True, **body}
        return {
            "ok": True,
            "status": 200,
            "contentType": req.content_type or "application/json",
            "json": body,
        }
    except (BTAuthError, BTAPIError, BTSendDisabled) as exc:
        _reraise(exc)
