"""Buildertrend API client.

Uses curl-cffi with Chrome TLS fingerprint impersonation because
Buildertrend's edge layer rejects connections that don't look like Chrome.

This client is intentionally low-level — it just wraps the HTTP calls.
Higher-level workflow logic (bill creation, vendor matching, etc.) lives
in route handlers that compose multiple client methods.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any, Literal

from curl_cffi import requests as cffi_requests

from app.config import get_settings

logger = logging.getLogger(__name__)

_BLOCKED_FRAGMENTS = (
    "notify-owners",
    "notifyowners",
    "sendinvoice",
    "send-invoice",
    "markreadyforpayment",
    "mark-ready-for-payment",
    "paybill",
    "pay-bill",
    "voidinvoice",
    "void-invoice",
    "converttojob",
    "convert-to-job",
)


class BTSendDisabledError(Exception):
    """Raised when a send/pay/notify path is blocked."""


def _bill_list_filters(*, status_csv: str, search_text: str) -> dict[str, Any]:
    return {
        "0": status_csv,
        "1": search_text,
        "6": "",
        "7": "",
        "8": False,
        "11": "",
        "13": '{"SelectedValue":2147483647,"StartDate":null,"EndDate":null}',
        "14": '{"SelectedValue":2147483647,"StartDate":null,"EndDate":null}',
        "15": '{"SelectedValue":2147483647,"StartDate":null,"EndDate":null}',
        "18": '{"SelectedValue":2147483647,"StartDate":null,"EndDate":null}',
        "19": "",
        "20": "",
        "21": "",
        "22": "",
        "23": 0,
        "25": "",
        "26": "",
        "28": "",
        "29": "",
        "30": "",
    }


class BTAuthError(Exception):
    """Raised when BT indicates the session is invalid or expired."""


class BTAPIError(Exception):
    """Raised when BT returns success=false or an unexpected response."""


def _browser_headers() -> dict[str, str]:
    """Headers that match a real Chrome request to BT.

    The exact set was reverse-engineered from a HAR capture of a successful
    browser request. Don't tweak unless you know what you're doing —
    BT may be checking specific combinations.
    """
    settings = get_settings()
    return {
        "user-agent": settings.bt_user_agent,
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "content-type": "application/json",
        "portaltype": "1",
        "referer": f"{settings.bt_base_url}/app/Landing",
        "sec-ch-ua": ('"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"'),
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "priority": "u=1, i",
    }


class BTClient:
    """A Buildertrend API client backed by a captured browser session.

    Construct with the cookies dict captured from a logged-in browser
    (see app/auth.py for the session capture flow).
    """

    def __init__(self, cookies: dict[str, dict[str, str]]):
        """
        Args:
            cookies: Mapping of cookie_name -> {value, domain, path} as captured
                     from a logged-in Chrome session.
        """
        settings = get_settings()
        self._base_url = settings.bt_base_url
        self._session: cffi_requests.Session = cffi_requests.Session(impersonate="chrome")
        self._session.headers.update(_browser_headers())
        self._load_cookies(cookies)

    def _load_cookies(self, cookies: dict[str, dict[str, str]]) -> None:
        for name, meta in cookies.items():
            self._session.cookies.set(
                name,
                meta["value"],
                domain=meta.get("domain", ".buildertrend.net"),
                path=meta.get("path", "/"),
            )

    def _request(
        self,
        method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        path: str,
        *,
        json_body: Any = None,
        params: dict | None = None,
        content_type: str | None = None,
        raw: bool = False,
    ) -> dict:
        if not path.startswith("/api") or ".." in path:
            raise BTAPIError(f"Refusing non-BT path: {path}")
        settings = get_settings()
        if not settings.bt_gateway_enable_send:
            lower = path.lower()
            if any(frag in lower for frag in _BLOCKED_FRAGMENTS):
                raise BTSendDisabledError(f"Send/pay/notify path blocked: {path}")

        # Never log Cookie, Authorization, or login HTML.
        logger.info("BT %s %s", method, path.split("?")[0])

        url = f"{self._base_url}{path}"
        headers: dict[str, str] = {}
        if content_type:
            headers["content-type"] = content_type
        kwargs: dict = {"allow_redirects": False, "params": params}
        if headers:
            kwargs["headers"] = headers
        if json_body is not None:
            kwargs["data"] = json.dumps(json_body)

        resp = self._session.request(method, url, **kwargs)

        # 302 → /app/error means BT rejected us (usually session issue)
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location", "")
            if "/app/error" in location:
                raise BTAuthError(
                    f"BT redirected to /app/error on {method} {path}. Session is likely invalid."
                )
            raise BTAPIError(f"Unexpected redirect on {method} {path}: {location}")

        ct = resp.headers.get("content-type", "")
        if raw:
            return {
                "status": resp.status_code,
                "contentType": ct,
                "bodyBase64": base64.b64encode(resp.content).decode(),
            }

        if "application/json" not in ct:
            snippet = resp.text[:200].lower()
            looks_like_login = "<html" in snippet and (
                "login" in snippet or "sign in" in snippet or "auth0" in snippet
            )
            if looks_like_login:
                raise BTAuthError("BT returned login HTML. Session is likely expired.")
            raise BTAuthError(
                f"Expected JSON, got {ct!r} on {method} {path}. Session may be expired."
            )

        if resp.status_code >= 400:
            try:
                err_body = resp.json()
            except Exception:
                err_body = "[non-json body redacted]"
            raise BTAPIError(f"HTTP {resp.status_code} on {method} {path}: {err_body}")

        body = resp.json()

        # The standard /api/* envelope has these. /apix/v2/* often doesn't.
        if isinstance(body, dict):
            if body.get("needsToRelogin"):
                raise BTAuthError("BT says needsToRelogin=true.")
            if body.get("success") is False:
                raise BTAPIError(f"BT success=false: {body.get('message')!r}")

        return body

    def request(
        self,
        method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        path: str,
        *,
        json_body: Any = None,
        params: dict | None = None,
        content_type: str | None = None,
        raw: bool = False,
    ) -> dict:
        """Public transport used by the TypeScript gateway sidecar."""
        return self._request(
            method,
            path,
            json_body=json_body,
            params=params,
            content_type=content_type,
            raw=raw,
        )

    # ------------------------------------------------------------------
    # Read endpoints
    # ------------------------------------------------------------------

    def get_account_info(self) -> dict:
        """Sanity check for the session. Cheap call to verify auth works."""
        return self._request("GET", "/api/AccountInfo/GlobalInfo")

    def get_bill_defaults(self, job_id: int) -> dict:
        """Returns the data needed to populate a new-bill form for a job.

        Includes assignedTo.options (vendor list), default values, validators.
        Use this to look up vendors before creating bills.
        """
        return self._request(
            "GET",
            "/api/v1/bills/defaultinfo",
            params={"jobId": job_id, "isBillRemainingAction": "false"},
        )

    def get_cost_codes(self, job_id: int) -> dict:
        """Cost codes available for the given job. Note: returns raw v2 shape."""
        return self._request(
            "GET",
            "/apix/v2/JobCostingBudget/budget-cost-codes",
            params={"jobId": job_id},
        )

    def get_jobs(self) -> dict:
        """List all jobs visible to the authenticated user."""
        return self._request("GET", "/api/jobpicker/GetExistingJobList")

    def get_bill(self, bill_id: int) -> dict:
        return self._request("GET", f"/api/v1/bills/{bill_id}")

    def get_bills_grid(
        self,
        *,
        page: int = 1,
        page_size: int = 100,
        status_filter: str = "0,1,2,3,4,5,6,7,8,9,-2",
        job_ids: list[int] | None = None,
        sort_column: str = "27",
        sort_direction: str = "desc",
        search_text: str = "",
    ) -> dict:
        """Fetch one page of bills from the grid API.

        Status filter values for ``status_filter``:

        "9" → Draft
        "0,8" → In Review
        "1" → Ready for Payment
        "4,5,2" → Paid
        "7,3,6,-2" → Other
        "0,1,2,3,4,5,6,7,8,9,-2" → All
        """
        filters = _bill_list_filters(status_csv=status_filter, search_text=search_text)
        body: dict[str, Any] = {
            "gridRequest": {
                "hideMultiJobsColumns": True,
                "selectedColumns": [
                    "6",
                    "27",
                    "1",
                    "8",
                    "7",
                    "3",
                    "12",
                    "4",
                    "39",
                    "31",
                    "30",
                    "32",
                    "34",
                    "33",
                    "35",
                    "11",
                    "9",
                    "5",
                    "28",
                ],
                "sortColumn": sort_column,
                "sortDirection": sort_direction,
                "hasFooter": False,
                "emptyStateEntity": 58,
            },
            "pagingData": {
                "pageNumber": str(page),
                "pageSize": page_size,
                "resetScroll": False,
                "firstRow": (page - 1) * page_size + 1,
                "lastRow": page * page_size,
                "totalRowsAllPages": page_size,
                "currentPage": page,
            },
            "filters": json.dumps(filters),
            "jobIds": job_ids or [],
        }
        return self._request("POST", "/api/v1/bills/grid", json_body=body)

    def get_bill_tab_counts(
        self,
        *,
        job_ids: list[int] | None = None,
        search_text: str = "",
    ) -> dict:
        filters = _bill_list_filters(status_csv="", search_text=search_text)
        body = {"filters": filters, "jobIds": job_ids or []}
        return self._request("POST", "/apix/v2/Bills/tab-counts", json_body=body)

    def get_purchase_orders_for_vendor(
        self, vendor_id: int, job_id: int, vendor_type: int = 2
    ) -> dict:
        """List open POs for a given vendor on a given job."""
        return self._request(
            "GET",
            f"/apix/v2/Bills/get-available-purchase-orders/{vendor_id}/{vendor_type}/{job_id}",
        )

    # ------------------------------------------------------------------
    # Write endpoints
    # ------------------------------------------------------------------

    def create_bill(self, job_id: int, payload: dict) -> dict:
        """Create a new bill on the given job. Returns the new bill data."""
        return self._request(
            "POST",
            "/api/v1/bills",
            json_body=payload,
            params={"jobId": job_id},
        )

    # Not yet captured: update_bill(), delete_bill(), attach_pdf_to_bill().
