"""Unit tests for /v1/document/analyze. The Azure Document Intelligence
client is patched at the module level so no SDK + cloud calls happen."""

from __future__ import annotations

import io
from typing import Any
from unittest.mock import MagicMock

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


def _fake_analyze_result() -> Any:
    page = MagicMock()
    page.page_number = 1
    page.width = 612
    page.height = 792
    line = MagicMock()
    line.content = "Hello PDF"
    page.lines = [line]

    cell = MagicMock()
    cell.row_index = 0
    cell.column_index = 0
    cell.content = "A"
    region = MagicMock()
    region.page_number = 1
    table = MagicMock()
    table.cells = [cell]
    table.bounding_regions = [region]

    kv = MagicMock()
    kv.key = MagicMock(content="Invoice")
    kv.value = MagicMock(content="INV-001")
    kv.confidence = 0.97

    result = MagicMock()
    result.content = "Hello PDF"
    result.pages = [page]
    result.tables = [table]
    result.key_value_pairs = [kv]
    return result


@pytest.fixture
def configure_di(monkeypatch):
    monkeypatch.setenv("AZURE_DI_ENDPOINT", "https://di.example.com")
    monkeypatch.setenv("AZURE_DI_KEY", "test-key")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@respx.mock
async def test_analyze_returns_structured_payload(jwks_payload, monkeypatch, configure_di):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    poller = MagicMock()
    poller.result.return_value = _fake_analyze_result()
    fake_client = MagicMock()
    fake_client.begin_analyze_document.return_value = poller

    import app.services.azure_di as di_module

    monkeypatch.setattr(di_module, "_client", lambda: fake_client)

    fake_pdf = b"%PDF-1.4 fake content"
    with TestClient(app) as client:
        resp = client.post(
            "/v1/document/analyze",
            files={"file": ("inv.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["text"] == "Hello PDF"
    assert data["pages"][0]["page"] == 1
    assert data["tables"][0]["rows"] == [["A"]]
    assert data["key_value_pairs"][0]["key"] == "Invoice"


@respx.mock
async def test_analyze_rejects_unsupported_media_type(jwks_payload, configure_di):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/document/analyze",
            files={"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code == 415
    assert resp.json()["error"]["code"] == "unsupported_media_type"


@respx.mock
async def test_analyze_returns_503_when_not_configured(jwks_payload, monkeypatch):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    monkeypatch.setenv("AZURE_DI_ENDPOINT", "")
    monkeypatch.setenv("AZURE_DI_KEY", "")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/v1/document/analyze",
                files={"file": ("inv.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
                headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
            )
        assert resp.status_code == 503
        assert resp.json()["error"]["code"] == "not_configured"
    finally:
        get_settings.cache_clear()


@pytest.mark.requires_secret
@pytest.mark.skipif(True, reason="Live Azure DI test gated on real credentials")
async def test_analyze_live_smoke():  # pragma: no cover
    """Live smoke test stub — set AZURE_DI_* env vars and remove the skipif
    to run against a real Azure Document Intelligence endpoint."""

    raise NotImplementedError
