import { prisma } from "@repo/database";
import { BaseAgent } from "./base.agent.js";

export class BillingAgent extends BaseAgent {
  readonly type = "billing" as const;
  readonly name = "Billing Agent";
  readonly description =
    "Handles payments, invoices, refunds, subscriptions, and billing inquiries";

  constructor() {
    super();
    this.initializeTools();
  }

  getSystemPrompt(): string {
    return `You are a specialized billing support agent. Your role is to help customers with all payment and billing-related inquiries including invoices, refunds, payment methods, and billing disputes.

Guidelines:
- Always use getPaymentHistory to look up payment records before responding
- For refund requests, verify payment status and eligibility
- Be clear about refund timelines (typically 5-10 business days)
- Explain any billing charges clearly and transparently
- For disputes, gather details and escalate if needed
- Never share full payment card details - only last 4 digits

Available tools:
- getPaymentHistory: View customer's payment history
- getInvoice: Get detailed invoice information
- requestRefund: Process refund requests
- updatePaymentMethod: Help with payment method updates

Remember: Handle financial information with care. Refunds require verification of original payment. Be empathetic about billing concerns - they can be stressful for customers.`;
  }

  private initializeTools(): void {
    // Get payment history tool
    this.registerTool({
      name: "getPaymentHistory",
      description: "Get the customer's payment and transaction history",
      parameters: {
        limit: {
          type: "number",
          description: "Number of payments to retrieve (default: 10)",
        },
        status: {
          type: "string",
          description:
            "Filter by status: pending, completed, failed, refunded",
        },
      },
      execute: async (params, userId) => {
        const { limit = 10, status } = params as {
          limit?: number;
          status?: string;
        };

        const payments = await prisma.payment.findMany({
          where: {
            userId,
            ...(status && { status: status as any }),
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(limit, 20),
        });

        const summary = {
          totalPayments: payments.length,
          completed: payments.filter((p) => p.status === "completed").length,
          pending: payments.filter((p) => p.status === "pending").length,
          refunded: payments.filter(
            (p) => p.status === "refunded" || p.status === "partially_refunded"
          ).length,
        };

        return {
          summary,
          payments: payments.map((p) => ({
            invoiceNumber: p.invoiceNumber,
            amount: p.amount.toString(),
            status: p.status,
            method: p.method,
            refundStatus: p.refundStatus,
            refundAmount: p.refundAmount?.toString(),
            createdAt: p.createdAt,
          })),
        };
      },
    });

    // Get invoice tool
    this.registerTool({
      name: "getInvoice",
      description: "Get detailed information for a specific invoice",
      parameters: {
        invoiceNumber: {
          type: "string",
          description: "The invoice number (e.g., INV-1234)",
        },
      },
      execute: async (params, userId) => {
        const { invoiceNumber } = params as { invoiceNumber: string };

        const payment = await prisma.payment.findFirst({
          where: {
            invoiceNumber,
            userId,
          },
        });

        if (!payment) {
          return {
            found: false,
            error: `Invoice ${invoiceNumber} not found or you don't have access to it`,
          };
        }

        // Get associated order if exists
        let orderInfo = null;
        if (payment.orderId) {
          const order = await prisma.order.findUnique({
            where: { id: payment.orderId },
          });
          if (order) {
            orderInfo = {
              orderNumber: order.orderNumber,
              items: order.items,
              status: order.status,
            };
          }
        }

        const statusMessages: Record<string, string> = {
          pending: "Payment is pending",
          completed: "Payment completed successfully",
          failed: "Payment failed - please try again or use a different method",
          refunded: "Full refund has been processed",
          partially_refunded: "Partial refund has been processed",
        };

        return {
          found: true,
          invoiceNumber: payment.invoiceNumber,
          amount: payment.amount.toString(),
          status: payment.status,
          statusMessage: statusMessages[payment.status] || payment.status,
          method: payment.method,
          billingAddress: payment.billingAddress,
          createdAt: payment.createdAt,
          order: orderInfo,
          refund: payment.refundStatus
            ? {
                status: payment.refundStatus,
                amount: payment.refundAmount?.toString(),
                reason: payment.refundReason,
              }
            : null,
          canRefund: payment.status === "completed" && !payment.refundStatus,
        };
      },
    });

    // Request refund tool
    this.registerTool({
      name: "requestRefund",
      description: "Process a refund request for a payment",
      parameters: {
        invoiceNumber: {
          type: "string",
          description: "The invoice number for the refund",
        },
        reason: {
          type: "string",
          description: "Reason for the refund request",
        },
        amount: {
          type: "number",
          description:
            "Amount to refund (optional - defaults to full amount)",
        },
      },
      execute: async (params, userId) => {
        const { invoiceNumber, reason, amount } = params as {
          invoiceNumber: string;
          reason: string;
          amount?: number;
        };

        const payment = await prisma.payment.findFirst({
          where: {
            invoiceNumber,
            userId,
          },
        });

        if (!payment) {
          return {
            success: false,
            error: `Invoice ${invoiceNumber} not found`,
          };
        }

        // Check if payment can be refunded
        if (payment.status !== "completed") {
          return {
            success: false,
            error: `Cannot refund a payment with status: ${payment.status}`,
            currentStatus: payment.status,
          };
        }

        if (payment.refundStatus === "completed") {
          return {
            success: false,
            error: "This payment has already been fully refunded",
          };
        }

        const refundAmount = amount || Number(payment.amount);
        const paymentAmount = Number(payment.amount);

        if (refundAmount > paymentAmount) {
          return {
            success: false,
            error: `Refund amount ($${refundAmount}) exceeds payment amount ($${paymentAmount})`,
          };
        }

        // Process refund
        const isPartial = refundAmount < paymentAmount;
        const updated = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: isPartial ? "partially_refunded" : "refunded",
            refundStatus: "processing",
            refundAmount,
            refundReason: reason,
          },
        });

        return {
          success: true,
          invoiceNumber: updated.invoiceNumber,
          refundAmount: refundAmount.toString(),
          originalAmount: paymentAmount.toString(),
          isPartialRefund: isPartial,
          refundStatus: "processing",
          estimatedCompletion: "5-10 business days",
          refundMethod: `Original payment method (${payment.method})`,
          message: `Your refund of $${refundAmount} has been initiated. It will be credited to your ${payment.method.replace("_", " ")} within 5-10 business days.`,
        };
      },
    });

    // Update payment method tool
    this.registerTool({
      name: "updatePaymentMethod",
      description:
        "Provide information about updating payment methods (cannot actually update - directs to secure portal)",
      parameters: {
        currentMethod: {
          type: "string",
          description: "The current payment method",
        },
        newMethod: {
          type: "string",
          description: "The desired new payment method",
        },
      },
      execute: async (params, userId) => {
        const { currentMethod, newMethod } = params as {
          currentMethod: string;
          newMethod: string;
        };

        // For security, we don't actually update payment methods via chat
        // Instead, we provide instructions for the secure portal
        return {
          canUpdateViaChat: false,
          message:
            "For your security, payment method changes must be made through our secure account portal.",
          instructions: [
            "1. Log in to your account at account.example.com",
            "2. Navigate to 'Payment Methods' in your account settings",
            "3. Click 'Add New Payment Method' or 'Update' on an existing method",
            "4. Enter your new payment details securely",
            "5. Save your changes",
          ],
          supportedMethods: [
            "Credit Card",
            "Debit Card",
            "PayPal",
            "Bank Transfer",
            "Apple Pay",
            "Google Pay",
          ],
          note: "If you're having trouble accessing your account or updating payment methods, I can help troubleshoot or escalate to our technical team.",
        };
      },
    });
  }
}
