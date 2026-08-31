"""Tests for the BT client (mocked HTTP)."""

from unittest.mock import MagicMock, patch

import pytest

from app.clients.bt_client import BTAuthError, BTClient


@pytest.fixture
def mock_settings():
    with patch("app.clients.bt_client.get_settings") as m:
        m.return_value = MagicMock(
            bt_base_url="https://buildertrend.net",
            bt_user_agent="test-agent",
        )
        yield m


def test_session_redirect_to_error_raises_auth_error(mock_settings):
    with patch("app.clients.bt_client.cffi_requests.Session") as session_cls:
        session_mock = MagicMock()
        session_cls.return_value = session_mock
        resp = MagicMock()
        resp.status_code = 302
        resp.headers = {"location": "/app/error", "content-type": ""}
        session_mock.request.return_value = resp

        client = BTClient(cookies={})
        with pytest.raises(BTAuthError, match="redirected to /app/error"):
            client.get_account_info()
