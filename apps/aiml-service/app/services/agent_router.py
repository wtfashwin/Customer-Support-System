"""Agent classifier (CP10)."""

from __future__ import annotations

import json
from typing import Any, Literal

from app.services.openai_client import chat_complete

AGENTS: tuple[str, ...] = ("support", "order", "billing")

CLASSIFIER_PROMPT = (
    "You are an intent classifier for a customer support system. Classify the user's "
    "message into exactly one agent:\n"
    "- support: general help, account problems, password resets, how-to questions\n"
    "- order: shipping, delivery, tracking, order status, returns\n"
    "- billing: payments, refunds, invoices, charges, subscriptions\n\n"
    'Return strict JSON: {"agent": "support|order|billing", "confidence": float in [0,1], '
    '"reasoning": "one short sentence"}.'
)


async def classify_intent(
    message: str, *, history: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    history = history or []
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history[-8:])
    user_block = f"Recent transcript:\n{transcript}\n\nNew message: {message}" if transcript else f"Message: {message}"

    response = await chat_complete(
        messages=[
            {"role": "system", "content": CLASSIFIER_PROMPT},
            {"role": "user", "content": user_block},
        ],
        response_format={"type": "json_object"},
    )
    raw = response.get("content", "{}")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}

    agent: Literal["support", "order", "billing"] = data.get("agent", "support") if data.get("agent") in AGENTS else "support"
    confidence = float(data.get("confidence", 0.5))
    reasoning = str(data.get("reasoning", "")) or "fallback"
    return {"agent": agent, "confidence": confidence, "reasoning": reasoning}
