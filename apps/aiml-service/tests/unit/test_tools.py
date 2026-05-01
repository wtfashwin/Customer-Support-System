"""Unit tests for the tool registry, executor, and the 5 default tools.

The DB-backed tools (lookup_order, lookup_payment, create_support_ticket)
patch their session helpers so the test exercises the tool logic without
needing a live Postgres."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.services.tools import ToolRegistry, register_default_tools
from app.services.tools.escalate import EscalateArgs, EscalateToHumanTool, get_handoff_queue
from app.services.tools.executor import ToolExecutor
from app.services.tools.kb import SearchKBArgs, SearchKnowledgeBaseTool
from app.services.tools.order import LookupOrderArgs, LookupOrderTool
from app.services.tools.payment import LookupPaymentArgs, LookupPaymentTool
from app.services.tools.ticket import CreateSupportTicketTool, CreateTicketArgs


class _FakeRow:
    """SQLAlchemy .mappings().first() returns a dict-like; mimic it."""

    def __init__(self, **data: Any):
        self._data = data

    def __getitem__(self, k: str) -> Any:
        return self._data[k]


class _FakeFirst:
    def __init__(self, row: _FakeRow | None):
        self._row = row

    def first(self):
        return self._row


class _FakeMappings:
    def __init__(self, row: _FakeRow | None):
        self._row = row

    def mappings(self):
        return _FakeFirst(self._row)


class _FakeSessionCM:
    """Async context manager + minimal AsyncSession surface for tools."""

    def __init__(self, row: _FakeRow | None = None):
        self._row = row
        self.added: list[Any] = []
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, _stmt, _params=None):
        return _FakeMappings(self._row)

    def add(self, obj: Any):
        self.added.append(obj)

    async def commit(self):
        self.committed = True


# ---------------------- registry -------------------------------------------


def test_registry_registers_and_lists():
    reg = ToolRegistry()
    register_default_tools(reg)
    assert reg.list() == sorted(
        ["lookup_order", "lookup_payment", "search_knowledge_base",
         "create_support_ticket", "escalate_to_human"]
    )
    spec = reg.get("lookup_order").openai_spec()
    assert spec["type"] == "function"
    assert spec["function"]["name"] == "lookup_order"
    assert "orderNumber" in spec["function"]["parameters"]["properties"]


def test_registry_double_register_fails():
    reg = ToolRegistry()
    reg.register(LookupOrderTool())
    with pytest.raises(ValueError, match="already registered"):
        reg.register(LookupOrderTool())


# ---------------------- executor -------------------------------------------


async def test_executor_runs_tool_and_returns_result(monkeypatch):
    fake_row = _FakeRow(
        orderNumber="ORD-1042",
        status="shipped",
        items=[{"sku": "A", "qty": 2}],
        trackingId="T-1",
        carrier="UPS",
        deliveryDate=datetime(2026, 5, 10, tzinfo=timezone.utc),
        totalAmount=Decimal("42.50"),
    )
    monkeypatch.setattr(
        "app.services.tools.order.AsyncSessionLocal", lambda: _FakeSessionCM(fake_row)
    )

    reg = ToolRegistry()
    register_default_tools(reg)
    executor = ToolExecutor(reg)
    inv = await executor.invoke(
        "lookup_order", {"orderNumber": "ORD-1042"},
        user_id="u1", conversation_id=None,
    )
    assert inv.ok is True
    assert inv.result["orderNumber"] == "ORD-1042"
    assert inv.result["totalAmount"] == 42.5
    assert inv.latency_ms >= 0


async def test_executor_unknown_tool_returns_error_invocation():
    executor = ToolExecutor(register_default_tools(ToolRegistry()))
    inv = await executor.invoke("nope", {}, user_id="u1", conversation_id=None)
    assert inv.ok is False
    assert "unknown tool" in (inv.error or "")


async def test_executor_invalid_args_returns_error_invocation():
    executor = ToolExecutor(register_default_tools(ToolRegistry()))
    inv = await executor.invoke("lookup_order", {}, user_id="u1", conversation_id=None)
    assert inv.ok is False
    assert inv.error
    # Must be the validation error, not a 500.
    assert "orderNumber" in inv.error or "field required" in inv.error.lower() or "missing" in inv.error.lower()


async def test_executor_runtime_failure_caught(monkeypatch):
    """A tool that raises mid-run becomes ok=False with the exception summary."""

    monkeypatch.setattr(
        "app.services.tools.order.AsyncSessionLocal",
        lambda: _FakeSessionCM(None),
    )
    executor = ToolExecutor(register_default_tools(ToolRegistry()))
    inv = await executor.invoke(
        "lookup_order", {"orderNumber": "missing"},
        user_id="u1", conversation_id=None,
    )
    assert inv.ok is False
    assert "not found" in (inv.error or "").lower()


# ---------------------- individual tools -----------------------------------


async def test_lookup_payment_returns_typed_result(monkeypatch):
    fake_row = _FakeRow(
        invoiceNumber="INV-1",
        amount=Decimal("99.99"),
        status="completed",
        method="credit_card",
        refundStatus=None,
        refundAmount=None,
    )
    monkeypatch.setattr(
        "app.services.tools.payment.AsyncSessionLocal",
        lambda: _FakeSessionCM(fake_row),
    )
    tool = LookupPaymentTool()
    result = await tool.run(LookupPaymentArgs(invoiceNumber="INV-1"))
    assert result.amount == 99.99
    assert result.refundStatus is None


async def test_search_kb_falls_back_to_pgvector(monkeypatch):
    async def fake_retrieve(*, query, top_k, filter):
        return [
            {"id": "doc-1", "score": 0.9, "snippet": "Refund policy text", "metadata": {"src": "kb"}}
        ]

    monkeypatch.setattr("app.services.tools.kb.settings.azure_search_endpoint", "")
    monkeypatch.setattr("app.services.tools.kb.settings.azure_search_key", "")
    monkeypatch.setattr("app.services.langchain_rag._retrieve_sources", fake_retrieve)

    tool = SearchKnowledgeBaseTool()
    result = await tool.run(SearchKBArgs(query="refund?", topK=2))
    assert len(result.hits) == 1
    assert result.hits[0].id == "doc-1"


async def test_create_ticket_persists_via_session(monkeypatch):
    captured = _FakeSessionCM()
    monkeypatch.setattr(
        "app.services.tools.ticket.AsyncSessionLocal", lambda: captured,
    )
    tool = CreateSupportTicketTool()
    result = await tool.run(
        CreateTicketArgs(summary="User cannot reset password", priority="high"),
        context={"user_id": "u1", "conversation_id": str(uuid.uuid4())},
    )
    assert captured.committed is True
    assert len(captured.added) == 1
    added = captured.added[0]
    assert added.user_id == "u1"
    assert added.priority == "high"
    assert result.status == "open"
    assert uuid.UUID(result.ticketId)


async def test_escalate_pushes_to_handoff_queue():
    convo = "conv-test-" + uuid.uuid4().hex[:8]
    tool = EscalateToHumanTool()
    result = await tool.run(
        EscalateArgs(reason="user explicitly asked for a human"),
        context={"user_id": "u1", "conversation_id": convo},
    )
    assert result.queued is True
    queue = get_handoff_queue(convo)
    assert queue.qsize() == 1
    frame = queue.get_nowait()
    assert frame["type"] == "handoff"
    assert frame["conversation_id"] == convo


def test_openai_specs_are_serializable():
    reg = register_default_tools(ToolRegistry())
    specs = reg.as_openai_specs()
    assert len(specs) == 5
    import json

    assert json.dumps(specs)  # round-trip without errors
