"""Tests for the BT client (mocked HTTP)."""

from unittest.mock import MagicMock, patch

import pytest

from app.clients.bt_client import BTAuthError, BTClient, BTSendDisabledError


@pytest.fixture
def mock_settings():
    with patch("app.clients.bt_client.get_settings") as m:
        m.return_value = MagicMock(
            bt_base_url="https://buildertrend.net",
            bt_user_agent="test-agent",
            bt_gateway_enable_send=False,
        )
        yield m


def _session(resp: MagicMock) -> MagicMock:
    session_mock = MagicMock()
    session_mock.request.return_value = resp
    session_mock.headers = {}
    session_mock.cookies = MagicMock()
    return session_mock


def test_session_redirect_to_error_raises_auth_error(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        resp = MagicMock()
        resp.status_code = 302
        resp.headers = {"location": "/app/error", "content-type": ""}
        session_cls.return_value = _session(resp)

        client = BTClient(cookies={})
        with pytest.raises(BTAuthError, match="redirected to /app/error"):
            client.get_account_info()


def test_merge_patch_content_type_is_sent(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-type": "application/json"}
        resp.json.return_value = {"success": True, "data": {}}
        session_mock = _session(resp)
        session_cls.return_value = session_mock

        client = BTClient(cookies={})
        client._request(
            "PUT",
            "/apix/v2/LineItems/update-change-order-line-item",
            json_body={"id": 1},
            content_type="application/merge-patch+json",
        )
        kwargs = session_mock.request.call_args.kwargs
        assert kwargs["headers"]["content-type"] == "application/merge-patch+json"


def test_json_content_type_default_is_not_merge_patch(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-type": "application/json"}
        resp.json.return_value = {"success": True}
        session_mock = _session(resp)
        session_cls.return_value = session_mock

        client = BTClient(cookies={})
        client._request(
            "POST",
            "/apix/v2/LineItems/add-change-order-line-items",
            json_body={"lineItems": []},
        )
        kwargs = session_mock.request.call_args.kwargs
        assert "headers" not in kwargs or kwargs.get("headers", {}).get("content-type") in (
            None,
            "application/json",
        )


def test_send_paths_are_blocked(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        session_cls.return_value = _session(MagicMock())
        client = BTClient(cookies={})
        with pytest.raises(BTSendDisabledError):
            client._request("POST", "/apix/v2/ChangeOrders/1/notify-owners", json_body={})


def test_multipart_tempfile_does_not_send_json_body(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-type": "application/json"}
        resp.json.return_value = {"success": True, "data": {"id": 1, "tempId": "t"}}
        session_mock = _session(resp)
        session_mock.headers = {"content-type": "application/json", "portaltype": "1"}
        session_cls.return_value = session_mock

        client = BTClient(cookies={})
        client.upload_bill_temp_file(
            9,
            filename="test-invoice-1.pdf",
            content=b"%PDF-1.4 fixture",
        )
        kwargs = session_mock.request.call_args.kwargs
        assert "files" in kwargs
        field, uploaded = kwargs["files"][0]
        assert field == "fileList"
        assert uploaded[0] == "test-invoice-1.pdf"
        assert "data" not in kwargs
        headers = {str(k).lower(): v for k, v in kwargs["headers"].items()}
        assert headers.get("content-type") != "application/json"
        path = session_mock.request.call_args.args[1]
        assert path.endswith("/api/documents/61/tempFile")
        assert "ocr-upload" not in path


def test_needs_to_relogin_is_auth_error(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-type": "application/json"}
        resp.json.return_value = {"needsToRelogin": True, "success": True}
        session_cls.return_value = _session(resp)
        client = BTClient(cookies={})
        with pytest.raises(BTAuthError, match="needsToRelogin"):
            client.get_account_info()
