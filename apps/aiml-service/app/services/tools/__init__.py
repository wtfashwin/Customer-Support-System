"""Tool registry for the agentic /v1/agents/run flow.

Each tool exposes a Pydantic input schema, a Pydantic output schema, and an
async `run()` method. The registry auto-generates OpenAI tool/function specs
from the input schema so the LLM planner can invoke them directly."""

from __future__ import annotations

import abc
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError

from app.core.exceptions import ValidationFailed


class Tool[ArgsT: BaseModel, ResultT: BaseModel](abc.ABC):
    """Subclass and set the three class attributes; implement `run()`.

    Uses PEP 695 generic syntax (Python 3.12+)."""

    name: ClassVar[str]
    description: ClassVar[str]
    Args: ClassVar[type[BaseModel]]
    Result: ClassVar[type[BaseModel]]

    @abc.abstractmethod
    async def run(self, args: ArgsT) -> ResultT:
        ...

    def parse_args(self, raw: dict[str, Any]) -> ArgsT:
        try:
            return self.Args(**raw)  # type: ignore[return-value]
        except ValidationError as exc:
            raise ValidationFailed(
                f"Invalid args for tool {self.name!r}: {exc.errors()[0]['msg']}",
                code="tool_args_invalid",
            ) from exc

    def openai_spec(self) -> dict[str, Any]:
        """Returns the OpenAI tool/function spec (chat.completions tools format)."""

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.Args.model_json_schema(),
            },
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool {tool.name!r} already registered")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name!r}")
        return self._tools[name]

    def list(self) -> list[str]:
        return sorted(self._tools)

    def as_openai_specs(self) -> list[dict[str, Any]]:
        return [self._tools[n].openai_spec() for n in sorted(self._tools)]


# Module-level registry. Tools register themselves via `register_default_tools()`
# rather than at import time so tests can swap implementations cleanly.
default_registry = ToolRegistry()


def register_default_tools(registry: ToolRegistry | None = None) -> ToolRegistry:
    from app.services.tools.escalate import EscalateToHumanTool
    from app.services.tools.kb import SearchKnowledgeBaseTool
    from app.services.tools.order import LookupOrderTool
    from app.services.tools.payment import LookupPaymentTool
    from app.services.tools.ticket import CreateSupportTicketTool

    reg = registry or default_registry
    for tool_cls in (
        LookupOrderTool,
        LookupPaymentTool,
        SearchKnowledgeBaseTool,
        CreateSupportTicketTool,
        EscalateToHumanTool,
    ):
        # Re-registering the same name in tests would raise; tolerate that.
        if tool_cls.name in reg._tools:
            continue
        reg.register(tool_cls())
    return reg
