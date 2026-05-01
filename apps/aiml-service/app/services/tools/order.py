"""lookup_order tool — reads the Prisma `Order` table by order number.

Uses raw SQL via SQLAlchemy reflection so we don't need to mirror the entire
Prisma schema as SQLAlchemy models. Returns a Pydantic-typed shape."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.exceptions import NotFound
from app.db.session import AsyncSessionLocal
from app.services.tools import Tool


class LookupOrderArgs(BaseModel):
    orderNumber: str = Field(..., min_length=1, description="Order identifier, e.g. ORD-1042")


class LookupOrderResult(BaseModel):
    orderNumber: str
    status: str
    items: list[dict[str, Any]]
    trackingId: str | None
    carrier: str | None
    deliveryDate: datetime | None
    totalAmount: float


class LookupOrderTool(Tool[LookupOrderArgs, LookupOrderResult]):
    name = "lookup_order"
    description = (
        "Look up an order by its order number. Returns status, items, tracking, and "
        "estimated delivery date. Use when the user mentions an order number or asks "
        "about shipping/delivery for a specific order."
    )
    Args = LookupOrderArgs
    Result = LookupOrderResult

    async def run(self, args: LookupOrderArgs) -> LookupOrderResult:
        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(
                    text(
                        """
                        SELECT "orderNumber", status, items, "trackingId", carrier,
                               "deliveryDate", "totalAmount"
                        FROM "Order"
                        WHERE "orderNumber" = :n
                        """
                    ),
                    {"n": args.orderNumber},
                )
            ).mappings().first()

        if row is None:
            raise NotFound(f"Order {args.orderNumber!r} not found")

        return LookupOrderResult(
            orderNumber=row["orderNumber"],
            status=str(row["status"]),
            items=list(row["items"] or []),
            trackingId=row["trackingId"],
            carrier=row["carrier"],
            deliveryDate=row["deliveryDate"],
            totalAmount=float(row["totalAmount"]),
        )
