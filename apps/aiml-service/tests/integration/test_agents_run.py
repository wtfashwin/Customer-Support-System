"""End-to-end SSE test for /v1/agents/run + conversation persistence.

Mocks the OpenAI planner + retriever + chat_stream. Database operations use
FastAPI dependency_overrides + an in-memory CapturingSession so the test
runs without a real Postgres."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.api.v1 import agents as agents_module
from app.db.models import Conversation, Message
from app.db.session import get_db
from app.main import app
from tests.conftest import make_token

JWKS_URL = "https://test.auth0.com/.well-known/jwks.json"


# ---------------- in-memory session double ---------------------------------


class _Store:
    """Minimal in-memory backing store keyed by id; supports get + add."""

    def __init__(self):
        self.conversations: dict[uuid.UUID, Conversation] = {}
        self.messages: list[Message] = []


_STORE = _Store()


class _MemSession:
    """Async-session shape that delegates reads/writes into a shared _STORE.
    Good enough for the route-level test; no real SQL is executed."""

    def __init__(self):
        self.added: list = []

    def add(self, obj: Any):
        self.added.append(obj)
        if isinstance(obj, Conversation):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.created_at is None:
                obj.created_at = datetime.now(timezone.utc)
            if obj.updated_at is None:
                obj.updated_at = datetime.now(timezone.utc)
            _STORE.conversations[obj.id] = obj
        elif isinstance(obj, Message):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.created_at is None:
                obj.created_at = datetime.now(timezone.utc)
            _STORE.messages.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def get(self, model, key):
        if model is Conversation:
            return _STORE.conversations.get(key)
        return None

    async def execute(self, _stmt):
        # Always return all messages — agents.py's _persist_assistant uses
        # update().values() (no-op flush) and conversations.py uses select.
        rows = sorted(_STORE.messages, key=lambda m: m.created_at)

        class _Result:
            def scalars(self_inner):
                class _S:
                    def all(self_innermost):
                        return rows
                return _S()
            def first(self_inner):
                return None
        return _Result()

    async def close(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _override_db():
    async def _dep():
        yield _MemSession()
    return _dep


# ---------------- planner / chat stub --------------------------------------


class _UsageStub:
    prompt_tokens = 12
    completion_tokens = 7


class _ChoiceStub:
    def __init__(self, content="", tool_calls=None):
        self.message = type("M", (), {
            "content": content,
            "tool_calls": tool_calls,
        })()


class _RespStub:
    def __init__(self, content="", tool_calls=None):
        self.choices = [_ChoiceStub(content, tool_calls)]
        self.usage = _UsageStub()


def _planner_responses() -> list[_RespStub]:
    """Two-step plan: ask the LLM to call lookup_order then synthesize."""

    class _ToolCall:
        def __init__(self, id, name, args):
            self.id = id
            self.function = type("F", (), {
                "name": name,
                "arguments": json.dumps(args),
            })()

    return [
        _RespStub(tool_calls=[_ToolCall("call-1", "echo", {"payload": "ok"})]),
        _RespStub(content=""),
    ]


def _patch_all(monkeypatch):
    # Replace AsyncSessionLocal in agents.py so _persist_assistant doesn't
    # try to open a real Postgres connection.
    monkeypatch.setattr("app.api.v1.agents.AsyncSessionLocal", _MemSession)

    # Retriever: empty so we can assert no source events leak in
    async def _retr(*, query, top_k, filter):
        return []
    monkeypatch.setattr("app.services.langchain_rag._retrieve_sources", _retr)

    # Planner returns the scripted tool call then "done"
    seq = list(_planner_responses())

    class _PlannerCompletions:
        async def create(self, **kwargs):
            return seq.pop(0) if seq else _RespStub(content="")

    fake_client = type("C", (), {})()
    fake_client.chat = type("Ch", (), {})()
    fake_client.chat.completions = _PlannerCompletions()
    monkeypatch.setattr("app.services.openai_client.get_client", lambda: fake_client)

    # Chat stream
    async def _stream(messages, **kwargs):
        for tok in ("Your ", "order ", "is ", "shipped."):
            yield tok
    monkeypatch.setattr("app.services.openai_client.chat_stream", _stream)

    # Replace AgentGraph's default registry with one that has only a stub echo
    # tool — avoids needing real Order/Payment data.
    from pydantic import BaseModel
    from app.services.tools import Tool, ToolRegistry
    from app.services.tools.executor import ToolExecutor

    class _EchoArgs(BaseModel):
        payload: str
    class _EchoResult(BaseModel):
        echoed: str
    class _Echo(Tool):
        name = "echo"
        description = "echo"
        Args = _EchoArgs
        Result = _EchoResult
        async def run(self, args):
            return _EchoResult(echoed=args.payload)

    reg = ToolRegistry()
    reg.register(_Echo())

    real_init = agents_module.__dict__.get("AgentGraph")  # already imported lazily

    # Patch AgentGraph constructor used inside _stream_agent_events
    from app.services import agent_graph as ag_module
    orig_cls = ag_module.AgentGraph

    class _Patched(orig_cls):  # type: ignore[misc]
        def __init__(self, *, registry=None, executor=None, max_iterations=5):
            super().__init__(registry=reg, executor=ToolExecutor(reg), max_iterations=max_iterations)

    monkeypatch.setattr(ag_module, "AgentGraph", _Patched)


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []
    cur_event = "message"
    cur_data: list[str] = []
    for line in body.splitlines():
        if not line:
            if cur_data:
                try:
                    out.append((cur_event, json.loads("\n".join(cur_data))))
                except json.JSONDecodeError:
                    out.append((cur_event, {"raw": "\n".join(cur_data)}))
            cur_event = "message"
            cur_data = []
            continue
        if line.startswith("event:"):
            cur_event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            cur_data.append(line.split(":", 1)[1].lstrip())
    if cur_data:
        try:
            out.append((cur_event, json.loads("\n".join(cur_data))))
        except json.JSONDecodeError:
            out.append((cur_event, {"raw": "\n".join(cur_data)}))
    return out


# ---------------- tests ----------------------------------------------------


@respx.mock
def test_run_streams_full_sse_sequence(jwks_payload, monkeypatch):
    _STORE.conversations.clear()
    _STORE.messages.clear()
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    _patch_all(monkeypatch)
    app.dependency_overrides[get_db] = _override_db()
    try:
        with TestClient(app) as client:
            with client.stream(
                "POST",
                "/v1/agents/run",
                json={"message": "Where is order ORD-1?", "topK": 1},
                headers={
                    "Authorization": f"Bearer {make_token(scopes='aiml:tools:invoke aiml:write')}"
                },
            ) as resp:
                assert resp.status_code == 200
                body = b"".join(resp.iter_bytes()).decode()
        events = _parse_sse(body)
        names = [e[0] for e in events]

        assert names.count("tool_call") == 1
        assert names.count("tool_result") == 1
        assert names.count("token") == 4
        assert names.count("done") == 1

        done = next(p for n, p in events if n == "done")
        assert done["answer"] == "Your order is shipped."
        assert done["conversationId"]
        assert done["messageId"]

        # Conversation + 2 messages persisted (user + assistant)
        assert len(_STORE.conversations) == 1
        assert len(_STORE.messages) == 2
        roles = sorted(m.role for m in _STORE.messages)
        assert roles == ["assistant", "user"]
    finally:
        app.dependency_overrides.clear()


@respx.mock
def test_run_requires_tools_invoke_scope(jwks_payload):
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    with TestClient(app) as client:
        resp = client.post(
            "/v1/agents/run",
            json={"message": "hi"},
            headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
        )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "missing_scope"


@respx.mock
def test_run_reuses_existing_conversation(jwks_payload, monkeypatch):
    _STORE.conversations.clear()
    _STORE.messages.clear()
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))
    _patch_all(monkeypatch)
    app.dependency_overrides[get_db] = _override_db()

    # Pre-create a conversation owned by the test user.
    pre_id = uuid.uuid4()
    pre = Conversation(
        id=pre_id,
        user_id="auth0|test-user",
        title="existing",
        convo_metadata={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    _STORE.conversations[pre_id] = pre

    try:
        with TestClient(app) as client:
            with client.stream(
                "POST",
                "/v1/agents/run",
                json={"message": "follow-up", "conversationId": str(pre_id)},
                headers={
                    "Authorization": f"Bearer {make_token(scopes='aiml:tools:invoke aiml:write')}"
                },
            ) as resp:
                body = b"".join(resp.iter_bytes()).decode()
        events = _parse_sse(body)
        done = next(p for n, p in events if n == "done")
        assert done["conversationId"] == str(pre_id)
        # No new conversation was created.
        assert len(_STORE.conversations) == 1
    finally:
        app.dependency_overrides.clear()


@respx.mock
def test_get_conversation_returns_messages(jwks_payload):
    _STORE.conversations.clear()
    _STORE.messages.clear()
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    cid = uuid.uuid4()
    convo = Conversation(
        id=cid,
        user_id="auth0|test-user",
        title="t",
        convo_metadata={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    _STORE.conversations[cid] = convo
    for role, content in (("user", "hi"), ("assistant", "hello back")):
        _STORE.messages.append(
            Message(
                id=uuid.uuid4(),
                conversation_id=cid,
                role=role,
                content=content,
                tool_calls=None,
                tool_results=None,
                tokens_in=0,
                tokens_out=0,
                created_at=datetime.now(timezone.utc),
            )
        )

    app.dependency_overrides[get_db] = _override_db()
    try:
        with TestClient(app) as client:
            resp = client.get(
                f"/v1/conversations/{cid}",
                headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == str(cid)
        assert [m["role"] for m in data["messages"]] == ["user", "assistant"]
    finally:
        app.dependency_overrides.clear()


@respx.mock
def test_get_conversation_owner_mismatch_returns_403(jwks_payload):
    _STORE.conversations.clear()
    _STORE.messages.clear()
    respx.get(JWKS_URL).mock(return_value=Response(200, json=jwks_payload))

    cid = uuid.uuid4()
    _STORE.conversations[cid] = Conversation(
        id=cid,
        user_id="auth0|someone-else",
        title="t",
        convo_metadata={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    app.dependency_overrides[get_db] = _override_db()
    try:
        with TestClient(app) as client:
            resp = client.get(
                f"/v1/conversations/{cid}",
                headers={"Authorization": f"Bearer {make_token(scopes='aiml:read')}"},
            )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "conversation_owner_mismatch"
    finally:
        app.dependency_overrides.clear()
