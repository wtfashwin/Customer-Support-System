"""lookup_payment tool — reads the Prisma `Payment` table by invoice number."""

from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.exceptions import NotFound
from app.db.session import AsyncSessionLocal
from app.services.tools import Tool


class LookupPaymentArgs(BaseModel):
    invoiceNumber: str = Field(..., min_length=1, description="Invoice identifier, e.g. INV-2026-001")


class LookupPaymentResult(BaseModel):
    invoiceNumber: str
    amount: float
    status: str
    method: str
    refundStatus: str | None
    refundAmount: float | None


class LookupPaymentTool(Tool[LookupPaymentArgs, LookupPaymentResult]):
    name = "lookup_payment"
    description = (
        "Look up a payment / invoice by its invoice number. Returns amount, status, "
        "payment method, and refund status. Use when the user asks about charges, "
        "refunds, or invoice lookups."
    )
    Args = LookupPaymentArgs
    Result = LookupPaymentResult

    async def run(self, args: LookupPaymentArgs) -> LookupPaymentResult:
        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(
                    text(
                        """
                        SELECT "invoiceNumber", amount, status, method,
                               "refundStatus", "refundAmount"
                        FROM "Payment"
                        WHERE "invoiceNumber" = :n
                        """
                    ),
                    {"n": args.invoiceNumber},
                )
            ).mappings().first()

        if row is None:
            raise NotFound(f"Invoice {args.invoiceNumber!r} not found")

        return LookupPaymentResult(
            invoiceNumber=row["invoiceNumber"],
            amount=float(row["amount"]),
            status=str(row["status"]),
            method=str(row["method"]),
            refundStatus=str(row["refundStatus"]) if row["refundStatus"] else None,
            refundAmount=float(row["refundAmount"]) if row["refundAmount"] is not None else None,
        )
