"""Unit tests for the agent orchestrator. Mocks the OpenAI client + the
retriever so the loop is exercised without any network calls."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from pydantic import BaseModel

from app.services.agent_graph import AgentGraph
from app.services.tools import Tool, ToolRegistry
from app.services.tools.executor import ToolExecutor


# --------------------------- helpers ---------------------------------------


class _StubChoice:
    def __init__(self, content: str = "", tool_calls: list[dict] | None = None):
        self.message = _StubMessage(content, tool_calls)


class _StubMessage:
    def __init__(self, content: str, tool_calls: list[dict] | None):
        self.content = content
        if tool_calls:
            self.tool_calls = [_StubToolCall(**tc) for tc in tool_calls]
        else:
            self.tool_calls = None


class _StubToolCall:
    def __init__(self, *, id: str, name: str, args: dict[str, Any]):
        self.id = id
        self.function = _StubFn(name, args)


class _StubFn:
    def __init__(self, name: str, args: dict[str, Any]):
        self.name = name
        self.arguments = json.dumps(args)


class _StubUsage:
    def __init__(self, prompt_tokens: int = 10, completion_tokens: int = 5):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class _StubCompletionResp:
    def __init__(self, content: str = "", tool_calls: list[dict] | None = None):
        self.choices = [_StubChoice(content, tool_calls)]
        self.usage = _StubUsage()


class _PlannerSequence:
    """Returns scripted planner responses, one per .create() call."""

    def __init__(self, responses: list[_StubCompletionResp]):
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._responses:
            return _StubCompletionResp(content="")
        return self._responses.pop(0)


class _StubChatCompletions:
    def __init__(self, planner: _PlannerSequence):
        self.completions = planner


def _patch_openai(monkeypatch, planner: _PlannerSequence) -> None:
    fake_client = type("C", (), {})()
    fake_client.chat = _StubChatCompletions(planner)
    # Patch the source — agent_graph imports get_client lazily inside _plan().
    monkeypatch.setattr("app.services.openai_client.get_client", lambda: fake_client)


def _patch_retriever(monkeypatch, sources: list[dict[str, Any]]) -> None:
    async def _fake_retrieve(*, query, top_k, filter):
        return list(sources)

    monkeypatch.setattr("app.services.langchain_rag._retrieve_sources", _fake_retrieve)


def _patch_chat_stream(monkeypatch, deltas: list[str] | Exception) -> None:
    if isinstance(deltas, Exception):
        async def _stream(messages, **kwargs):
            if False:
                yield ""
            raise deltas
    else:
        async def _stream(messages, **kwargs):
            for d in deltas:
                yield d

    monkeypatch.setattr("app.services.openai_client.chat_stream", _stream)


# --------------------------- demo tools ------------------------------------


class EchoArgs(BaseModel):
    payload: str


class EchoResult(BaseModel):
    echoed: str


class EchoTool(Tool[EchoArgs, EchoResult]):
    name = "echo"
    description = "Echo a payload back. Test-only."
    Args = EchoArgs
    Result = EchoResult

    async def run(self, args: EchoArgs) -> EchoResult:
        return EchoResult(echoed=args.payload)


class FailArgs(BaseModel):
    why: str


class FailResult(BaseModel):
    pass


class FailTool(Tool[FailArgs, FailResult]):
    name = "always_fails"
    description = "Always raises. Test-only."
    Args = FailArgs
    Result = FailResult

    async def run(self, args: FailArgs) -> FailResult:
        raise RuntimeError(f"failing because: {args.why}")


def _build_graph(*tools: Tool, max_iterations: int = 5) -> AgentGraph:
    reg = ToolRegistry()
    for t in tools:
        reg.register(t)
    return AgentGraph(registry=reg, executor=ToolExecutor(reg), max_iterations=max_iterations)


async def _drain(it: AsyncIterator[dict[str, str]]) -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []
    async for ev in it:
        out.append((ev["event"], json.loads(ev["data"])))
    return out


# --------------------------- tests -----------------------------------------


async def test_happy_path_calls_tool_then_answers(monkeypatch):
    _patch_retriever(monkeypatch, [
        {"id": "kb-1", "score": 0.9, "snippet": "Refund policy", "metadata": {}}
    ])
    planner = _PlannerSequence([
        # iter 1: model wants the echo tool
        _StubCompletionResp(tool_calls=[
            {"id": "call-1", "name": "echo", "args": {"payload": "hello"}}
        ]),
        # iter 2: model has enough; no more tool_calls
        _StubCompletionResp(content="ready"),
    ])
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["The ", "answer ", "is ", "hello."])

    graph = _build_graph(EchoTool())
    events = await _drain(
        graph.run(user_message="say hello", user_id="u1", conversation_id=str(uuid.uuid4()))
    )
    names = [n for n, _ in events]

    assert names.count("source") == 1
    # source comes before any tool_call
    assert names.index("source") < names.index("tool_call")
    assert names.count("tool_call") == 1
    assert names.count("tool_result") == 1
    assert names.count("token") == 4
    assert names.count("done") == 1

    done = next(p for n, p in events if n == "done")
    assert done["answer"] == "The answer is hello."
    assert done["iterations"] == 2
    assert done["toolCalls"][0]["name"] == "echo"
    assert done["toolCalls"][0]["ok"] is True


async def test_no_tool_path_just_synthesizes(monkeypatch):
    _patch_retriever(monkeypatch, [])
    planner = _PlannerSequence([
        _StubCompletionResp(content=""),  # no tool_calls
    ])
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["Hi!"])

    graph = _build_graph(EchoTool())
    events = await _drain(graph.run(user_message="hi", user_id="u1"))
    names = [n for n, _ in events]
    assert names == ["token", "done"]
    assert next(p for n, p in events if n == "done")["iterations"] == 1


async def test_max_iterations_short_circuits(monkeypatch):
    _patch_retriever(monkeypatch, [])
    # Planner always wants more echo calls.
    always_call = _StubCompletionResp(tool_calls=[
        {"id": "c", "name": "echo", "args": {"payload": "x"}}
    ])
    planner = _PlannerSequence([always_call] * 10)
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["fallback answer"])

    graph = _build_graph(EchoTool(), max_iterations=3)
    events = await _drain(graph.run(user_message="loop", user_id="u1"))
    done = next(p for n, p in events if n == "done")
    assert done["iterations"] == 3
    # Three rounds of (tool_call, tool_result), then synthesis.
    names = [n for n, _ in events]
    assert names.count("tool_call") == 3
    assert names.count("tool_result") == 3
    assert "fallback answer" in done["answer"]


async def test_tool_failure_surfaces_in_result_event(monkeypatch):
    _patch_retriever(monkeypatch, [])
    planner = _PlannerSequence([
        _StubCompletionResp(tool_calls=[
            {"id": "c1", "name": "always_fails", "args": {"why": "boom"}}
        ]),
        _StubCompletionResp(content=""),  # done after seeing failure
    ])
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["sorry I couldn't help"])

    graph = _build_graph(FailTool())
    events = await _drain(graph.run(user_message="fail please", user_id="u1"))
    tool_results = [p for n, p in events if n == "tool_result"]
    assert len(tool_results) == 1
    assert tool_results[0]["ok"] is False
    assert "boom" in tool_results[0]["error"]
    # The graph should NOT crash — done event still emitted.
    assert any(n == "done" for n, _ in events)


async def test_parallel_tool_calls_execute_concurrently(monkeypatch):
    _patch_retriever(monkeypatch, [])

    # Model proposes two tool calls in one turn.
    planner = _PlannerSequence([
        _StubCompletionResp(tool_calls=[
            {"id": "c-a", "name": "echo", "args": {"payload": "a"}},
            {"id": "c-b", "name": "echo", "args": {"payload": "b"}},
        ]),
        _StubCompletionResp(content=""),
    ])
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["done"])

    # Slow echo to detect serial vs. parallel: each call sleeps 0.1s.
    class SlowEcho(EchoTool):
        async def run(self, args):
            await asyncio.sleep(0.1)
            return await super().run(args)

    graph = _build_graph(SlowEcho())
    import time as _t
    started = _t.perf_counter()
    events = await _drain(graph.run(user_message="parallel", user_id="u1"))
    elapsed = _t.perf_counter() - started

    # Two 0.1s tool calls should run together; total tool time ≈ 0.1s, not 0.2s.
    tool_calls = [p for n, p in events if n == "tool_call"]
    tool_results = [p for n, p in events if n == "tool_result"]
    assert len(tool_calls) == 2
    assert len(tool_results) == 2
    assert elapsed < 0.35  # loose upper bound; serial would be ≥ 0.2s plus overhead


async def test_source_events_emitted_before_any_tool_call(monkeypatch):
    _patch_retriever(monkeypatch, [
        {"id": "kb-1", "score": 0.9, "snippet": "policy", "metadata": {}},
        {"id": "kb-2", "score": 0.8, "snippet": "shipping", "metadata": {}},
    ])
    planner = _PlannerSequence([
        _StubCompletionResp(tool_calls=[
            {"id": "c", "name": "echo", "args": {"payload": "x"}}
        ]),
        _StubCompletionResp(content=""),
    ])
    _patch_openai(monkeypatch, planner)
    _patch_chat_stream(monkeypatch, ["k"])

    graph = _build_graph(EchoTool())
    events = await _drain(graph.run(user_message="x", user_id="u1"))
    first_tool_idx = next(i for i, (n, _) in enumerate(events) if n == "tool_call")
    source_indices = [i for i, (n, _) in enumerate(events) if n == "source"]
    assert source_indices == [0, 1]
    assert max(source_indices) < first_tool_idx
