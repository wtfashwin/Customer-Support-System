"""Unit tests for /v1/feedback and /v1/audit/logs.

Uses FastAPI dependency_overrides + an in-memory async session that
doesn't actually hit Postgres. The session captures sqlalchemy ORM
ops to verify the route logic."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.db.models import AiAuditLog, Feedback
from app.db.session import get_db
from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


class _CapturingSession:
    """Minimal AsyncSession-like object that records adds + returns
    a stubbed query result for the audit list endpoint."""

    def __init__(self, audit_rows: list[AiAuditLog] | None = None):
        self.added: list = []
        self.committed = False
        self.refreshed: list = []
        self._audit_rows = audit_rows or []

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Feedback) and obj.id is None:
            obj.id = uuid.uuid4()
        if isinstance(obj, Feedback) and obj.created_at is None:
            obj.created_at = datetime.now(UTC)

    async def commit(self):
        self.committed = True

    async def refresh(self, obj):
        self.refreshed.append(obj)
        if isinstance(obj, Feedback):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.created_at is None:
                obj.created_at = datetime.now(UTC)

    async def execute(self, _stmt):
        rows = list(self._audit_rows)

        class _Result:
            def scalars(self_inner):
                class _Scalars:
                    def all(self_innermost):
                        return rows

                return _Scalars()

        return _Result()

    async def close(self):
        pass


def _override_db(session):
    async def _dep():
        yield session

    return _dep


@respx.mock
async def test_submit_feedback_persists_row(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    session = _CapturingSession()
    app.dependency_overrides[get_db] = _override_db(session)
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/v1/feedback",
                json={"messageId": "msg-1", "rating": 5, "comment": "nice"},
                headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"]
        assert "createdAt" in body
        assert session.committed is True
        assert len(session.added) == 1
        added = session.added[0]
        assert isinstance(added, Feedback)
        assert added.message_id == "msg-1"
        assert added.rating == 5
        assert added.comment == "nice"
    finally:
        app.dependency_overrides.clear()


@respx.mock
async def test_feedback_validation_rejects_out_of_range(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/feedback",
            json={"messageId": "m", "rating": 99, "comment": ""},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:write')}"},
        )
    assert resp.status_code in (400, 422)


@respx.mock
async def test_audit_logs_requires_admin_scope(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.get(
            "/v1/audit/logs",
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read aiml:write')}"},
        )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "missing_scope"


@respx.mock
async def test_audit_logs_returns_paginated_items(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    rows = [
        AiAuditLog(
            id=uuid.uuid4(),
            user_id=f"u{i}",
            route="/v1/embed",
            model="text-embedding-3-small",
            prompt_hash="sha256:" + ("a" * 16),
            tokens_in=10,
            tokens_out=0,
            cost_usd=None,
            latency_ms=42,
            status="ok",
            error=None,
            created_at=datetime.now(UTC),
        )
        for i in range(3)
    ]
    session = _CapturingSession(audit_rows=rows)
    app.dependency_overrides[get_db] = _override_db(session)
    try:
        with TestClient(app) as client:
            resp = client.get(
                "/v1/audit/logs?limit=10",
                headers={
                    "Authorization": f"Bearer {make_token(scopes='aiml:read aiml:write aiml:admin')}"
                },
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert len(data["items"]) == 3
        assert data["nextCursor"] is None
        first = data["items"][0]
        assert first["route"] == "/v1/embed"
        assert first["model"] == "text-embedding-3-small"
    finally:
        app.dependency_overrides.clear()
