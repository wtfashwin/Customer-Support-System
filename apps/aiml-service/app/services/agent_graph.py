"""LangGraph orchestrator for /v1/agents/run.

Graph topology:

    [retrieve] -> [plan] -> {pending tools?}
                                 yes -> [execute_tools] -> [plan] (loop, capped)
                                 no  -> [synthesize] -> END

`plan` is the LLM step that proposes the next tool calls (or decides we have
enough evidence to answer). `execute_tools` runs them concurrently via
ToolExecutor. `synthesize` streams the final answer.

`run()` is an async generator yielding SSE-shaped {"event":..., "data":...}
dicts that the FastAPI route hands straight to sse_starlette.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.core.logging import get_logger
from app.core.middleware import record_ai_call
from app.services.tools import ToolRegistry, default_registry, register_default_tools
from app.services.tools.executor import ToolExecutor, ToolInvocation

log = get_logger(__name__)


SYSTEM_PROMPT = (
    "You are a customer-support agent. You have access to tools that can look "
    "up orders, payments, and the knowledge base, create support tickets, and "
    "escalate to a human. Use the tools when the user's question depends on "
    "specific data (an order number, an invoice, a policy question). Once you "
    "have enough information, stop calling tools and answer the user. Cite "
    "knowledge-base hits as [source-id]. Do not invent data — if a tool "
    "returns nothing, say so."
)


@dataclass
class AgentState:
    user_id: str
    conversation_id: str | None
    user_message: str
    history: list[dict[str, Any]] = field(default_factory=list)
    retrieved: list[dict[str, Any]] = field(default_factory=list)
    pending_tool_calls: list[dict[str, Any]] = field(default_factory=list)
    executed_tool_calls: list[ToolInvocation] = field(default_factory=list)
    final_answer: str = ""
    iterations: int = 0
    tokens_in: int = 0
    tokens_out: int = 0


class AgentGraph:
    """Hand-rolled state machine. We don't use langgraph.StateGraph here because
    the streaming-SSE shape we need is much cleaner as a plain async loop —
    langgraph is still a project dep so callers can swap in a more elaborate
    graph (memory, checkpoints) later without breaking this interface."""

    def __init__(
        self,
        *,
        registry: ToolRegistry | None = None,
        executor: ToolExecutor | None = None,
        max_iterations: int = 5,
    ) -> None:
        if registry is None:
            registry = default_registry
            register_default_tools(registry)
        self.registry = registry
        self.executor = executor or ToolExecutor(registry)
        self.max_iterations = max_iterations

    # ---- public API -------------------------------------------------------

    async def run(
        self,
        *,
        user_message: str,
        user_id: str,
        conversation_id: str | None = None,
        history: list[dict[str, Any]] | None = None,
        max_iterations: int | None = None,
        top_k: int = 4,
    ) -> AsyncIterator[dict[str, str]]:
        cap = min(max_iterations or self.max_iterations, 10)
        state = AgentState(
            user_id=user_id,
            conversation_id=conversation_id,
            user_message=user_message,
            history=list(history or []),
        )
        started = time.perf_counter()

        # 1) Retrieve KB context up-front.
        try:
            await self._retrieve(state, top_k=top_k)
        except Exception as exc:
            log.warning("retrieve_failed", error=str(exc))
        for src in state.retrieved:
            yield {"event": "source", "data": json.dumps(src)}

        # 2) Plan/execute loop.
        while state.iterations < cap:
            state.iterations += 1
            try:
                await self._plan(state)
            except Exception as exc:
                yield {
                    "event": "error",
                    "data": json.dumps({"code": "upstream_error", "message": str(exc)}),
                }
                return

            if not state.pending_tool_calls:
                break

            # Emit tool_call events, run them concurrently, emit tool_result.
            for call in state.pending_tool_calls:
                yield {"event": "tool_call", "data": json.dumps(call)}

            invocations = await self._execute_pending(state)
            for inv in invocations:
                yield {
                    "event": "tool_result",
                    "data": json.dumps(self._invocation_to_event(inv)),
                }
            state.executed_tool_calls.extend(invocations)
            state.pending_tool_calls = []

        # 3) Synthesize final answer (streaming).
        try:
            async for delta in self._synthesize(state):
                yield {"event": "token", "data": json.dumps({"delta": delta})}
                state.final_answer += delta
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"code": "upstream_error", "message": str(exc)}),
            }
            return

        latency_ms = int((time.perf_counter() - started) * 1000)
        record_ai_call(
            route="agent:run",
            model=settings.openai_chat_model,
            prompt_hash="",
            tokens_in=state.tokens_in,
            tokens_out=state.tokens_out,
            latency_ms=latency_ms,
            status="ok",
        )
        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "answer": state.final_answer,
                    "conversationId": state.conversation_id,
                    "toolCalls": [self._invocation_to_event(i) for i in state.executed_tool_calls],
                    "iterations": state.iterations,
                    "tokens": {"prompt": state.tokens_in, "completion": state.tokens_out},
                    "latencyMs": latency_ms,
                }
            ),
        }

    # ---- nodes ------------------------------------------------------------

    async def _retrieve(self, state: AgentState, *, top_k: int) -> None:
        from app.services.langchain_rag import _retrieve_sources

        sources = await _retrieve_sources(query=state.user_message, top_k=top_k, filter=None)
        state.retrieved = sources

    async def _plan(self, state: AgentState) -> None:
        """Ask the LLM what tools (if any) to call next. Sets
        state.pending_tool_calls if the model wants to invoke tools, otherwise
        leaves it empty so the loop exits."""

        from app.services.openai_client import get_client

        client = get_client()
        messages = self._build_planner_messages(state)
        response = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
            tools=self.registry.as_openai_specs(),
            tool_choice="auto",
            temperature=0.0,
        )
        choice = response.choices[0].message
        usage = response.usage
        state.tokens_in += getattr(usage, "prompt_tokens", 0) or 0
        state.tokens_out += getattr(usage, "completion_tokens", 0) or 0

        tool_calls = getattr(choice, "tool_calls", None) or []
        state.pending_tool_calls = [
            {
                "callId": tc.id or str(uuid.uuid4()),
                "name": tc.function.name,
                "args": _safe_json_loads(tc.function.arguments),
            }
            for tc in tool_calls
        ]

    async def _execute_pending(self, state: AgentState) -> list[ToolInvocation]:
        async def _run_one(call: dict[str, Any]) -> ToolInvocation:
            return await self.executor.invoke(
                call["name"],
                call["args"],
                user_id=state.user_id,
                conversation_id=state.conversation_id,
                call_id=call["callId"],
            )

        return await asyncio.gather(*(_run_one(c) for c in state.pending_tool_calls))

    async def _synthesize(self, state: AgentState) -> AsyncIterator[str]:
        from app.services.openai_client import chat_stream

        evidence = self._format_evidence(state)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            *state.history,
            {"role": "user", "content": state.user_message},
            {
                "role": "system",
                "content": (
                    "You have completed any tool calls. Use the evidence below "
                    "to answer the user. Do not call any more tools.\n\n"
                    f"{evidence}"
                ),
            },
        ]
        async for delta in chat_stream(messages):
            yield delta

    # ---- helpers ----------------------------------------------------------

    def _build_planner_messages(self, state: AgentState) -> list[dict[str, Any]]:
        msgs: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        msgs.extend(state.history)
        msgs.append({"role": "user", "content": state.user_message})
        if state.retrieved:
            kb_block = "\n".join(
                f"[{s['id']}] {s.get('snippet', '')}" for s in state.retrieved
            )
            msgs.append({"role": "system", "content": f"Knowledge-base hits:\n{kb_block}"})
        if state.executed_tool_calls:
            tool_block = "\n".join(
                f"- {inv.name}({json.dumps(inv.args)}) -> "
                f"{'OK ' + json.dumps(inv.result) if inv.ok else 'ERROR ' + str(inv.error)}"
                for inv in state.executed_tool_calls
            )
            msgs.append(
                {"role": "system", "content": f"Tool results so far:\n{tool_block}"}
            )
        return msgs

    def _format_evidence(self, state: AgentState) -> str:
        parts: list[str] = []
        if state.retrieved:
            parts.append(
                "Knowledge base:\n"
                + "\n".join(f"[{s['id']}] {s.get('snippet', '')}" for s in state.retrieved)
            )
        for inv in state.executed_tool_calls:
            if inv.ok:
                parts.append(f"Tool {inv.name}: {json.dumps(inv.result)}")
            else:
                parts.append(f"Tool {inv.name} failed: {inv.error}")
        if not parts:
            parts.append("(no evidence gathered)")
        return "\n\n".join(parts)

    @staticmethod
    def _invocation_to_event(inv: ToolInvocation) -> dict[str, Any]:
        return {
            "callId": inv.call_id,
            "name": inv.name,
            "args": inv.args,
            "ok": inv.ok,
            "result": inv.result,
            "error": inv.error,
            "latencyMs": inv.latency_ms,
        }


def _safe_json_loads(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
