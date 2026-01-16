import { prisma } from "@repo/database";
import { BaseAgent } from "./base.agent.js";

export class OrderAgent extends BaseAgent {
  readonly type = "order" as const;
  readonly name = "Order Agent";
  readonly description =
    "Handles order inquiries, tracking, shipping, modifications, and cancellations";

  constructor() {
    super();
    this.initializeTools();
  }

  getSystemPrompt(): string {
    return `You are a specialized order support agent. Your role is to help customers with all order-related inquiries including order status, tracking, shipping, modifications, and cancellations.

Guidelines:
- Always use getOrderStatus to look up order details before responding
- Provide specific tracking information when available
- For cancellation requests, verify the order is eligible (pending/processing status only)
- Be clear about estimated delivery dates and shipping timelines
- If an order cannot be cancelled, explain why and offer alternatives
- For complex issues involving payments, suggest the billing team

Available tools:
- getOrderStatus: Get detailed order status and tracking info
- getOrderHistory: View customer's order history
- trackShipment: Get real-time shipment tracking details
- cancelOrder: Process order cancellation requests

Remember: Orders can only be cancelled if they haven't shipped yet. Be transparent about order statuses and delivery expectations.`;
  }

  private initializeTools(): void {
    // Get order status tool
    this.registerTool({
      name: "getOrderStatus",
      description: "Get detailed status and information for a specific order",
      parameters: {
        orderNumber: {
          type: "string",
          description: "The order number (e.g., ORD-1234)",
        },
      },
      execute: async (params, userId) => {
        const { orderNumber } = params as { orderNumber: string };

        const order = await prisma.order.findFirst({
          where: {
            orderNumber,
            userId,
          },
        });

        if (!order) {
          return {
            found: false,
            error: `Order ${orderNumber} not found or you don't have access to it`,
          };
        }

        const statusMessages: Record<string, string> = {
          pending: "Order received and awaiting processing",
          processing: "Order is being prepared for shipment",
          shipped: "Order has been shipped and is on its way",
          out_for_delivery: "Order is out for delivery today",
          delivered: "Order has been delivered",
          cancelled: "Order has been cancelled",
          returned: "Order has been returned",
        };

        return {
          found: true,
          orderNumber: order.orderNumber,
          status: order.status,
          statusMessage: statusMessages[order.status] || order.status,
          items: order.items,
          totalAmount: order.totalAmount.toString(),
          trackingId: order.trackingId,
          carrier: order.carrier,
          deliveryDate: order.deliveryDate,
          shippingAddress: order.shippingAddress,
          createdAt: order.createdAt,
          canCancel: ["pending", "processing"].includes(order.status),
        };
      },
    });

    // Get order history tool
    this.registerTool({
      name: "getOrderHistory",
      description: "Get the customer's recent order history",
      parameters: {
        limit: {
          type: "number",
          description: "Number of orders to retrieve (default: 10)",
        },
        status: {
          type: "string",
          description:
            "Filter by status (optional): pending, processing, shipped, delivered, cancelled",
        },
      },
      execute: async (params, userId) => {
        const { limit = 10, status } = params as {
          limit?: number;
          status?: string;
        };

        const orders = await prisma.order.findMany({
          where: {
            userId,
            ...(status && { status: status as any }),
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(limit, 20),
        });

        return {
          totalOrders: orders.length,
          orders: orders.map((o: any) => ({
            orderNumber: o.orderNumber,
            status: o.status,
            totalAmount: o.totalAmount.toString(),
            itemCount: Array.isArray(o.items) ? (o.items as any[]).length : 0,
            createdAt: o.createdAt,
            deliveryDate: o.deliveryDate,
          })),
        };
      },
    });

    // Track shipment tool
    this.registerTool({
      name: "trackShipment",
      description: "Get real-time tracking information for a shipment",
      parameters: {
        orderNumber: {
          type: "string",
          description: "The order number to track",
        },
      },
      execute: async (params, userId) => {
        const { orderNumber } = params as { orderNumber: string };

        const order = await prisma.order.findFirst({
          where: {
            orderNumber,
            userId,
          },
        });

        if (!order) {
          return {
            error: `Order ${orderNumber} not found`,
          };
        }

        if (!order.trackingId) {
          return {
            orderNumber: order.orderNumber,
            status: order.status,
            tracking: null,
            message:
              order.status === "pending" || order.status === "processing"
                ? "Tracking information will be available once the order ships"
                : "No tracking information available for this order",
          };
        }

        // Simulated tracking events based on order status
        const trackingEvents = this.generateTrackingEvents(order);

        return {
          orderNumber: order.orderNumber,
          trackingId: order.trackingId,
          carrier: order.carrier || "Standard Shipping",
          status: order.status,
          estimatedDelivery: order.deliveryDate,
          events: trackingEvents,
        };
      },
    });

    // Cancel order tool
    this.registerTool({
      name: "cancelOrder",
      description: "Process an order cancellation request",
      parameters: {
        orderNumber: {
          type: "string",
          description: "The order number to cancel",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation",
        },
      },
      execute: async (params, userId) => {
        const { orderNumber, reason } = params as {
          orderNumber: string;
          reason: string;
        };

        const order = await prisma.order.findFirst({
          where: {
            orderNumber,
            userId,
          },
        });

        if (!order) {
          return {
            success: false,
            error: `Order ${orderNumber} not found`,
          };
        }

        // Check if order can be cancelled
        if (!["pending", "processing"].includes(order.status)) {
          const statusMessages: Record<string, string> = {
            shipped:
              "This order has already shipped. Please contact support for return instructions.",
            out_for_delivery:
              "This order is out for delivery. Please refuse delivery or request a return after receiving.",
            delivered:
              "This order has been delivered. Please request a return instead.",
            cancelled: "This order has already been cancelled.",
            returned: "This order has already been returned.",
          };

          return {
            success: false,
            canCancel: false,
            currentStatus: order.status,
            message:
              statusMessages[order.status] || "This order cannot be cancelled.",
          };
        }

        // Process cancellation
        const cancelled = await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "cancelled",
          },
        });

        return {
          success: true,
          orderNumber: cancelled.orderNumber,
          previousStatus: order.status,
          newStatus: "cancelled",
          reason,
          refundMessage:
            "A full refund will be processed within 5-7 business days.",
        };
      },
    });
  }

  private generateTrackingEvents(order: any): Array<{
    date: string;
    location: string;
    status: string;
  }> {
    const events = [];
    const orderDate = new Date(order.createdAt);

    events.push({
      date: orderDate.toISOString(),
      location: "Warehouse",
      status: "Order received",
    });

    if (
      ["processing", "shipped", "out_for_delivery", "delivered"].includes(
        order.status
      )
    ) {
      const processingDate = new Date(orderDate);
      processingDate.setHours(processingDate.getHours() + 2);
      events.push({
        date: processingDate.toISOString(),
        location: "Warehouse",
        status: "Order processed",
      });
    }

    if (["shipped", "out_for_delivery", "delivered"].includes(order.status)) {
      const shippedDate = new Date(orderDate);
      shippedDate.setDate(shippedDate.getDate() + 1);
      events.push({
        date: shippedDate.toISOString(),
        location: "Distribution Center",
        status: "Shipped - In transit",
      });
    }

    if (["out_for_delivery", "delivered"].includes(order.status)) {
      const outDate = new Date(orderDate);
      outDate.setDate(outDate.getDate() + 3);
      events.push({
        date: outDate.toISOString(),
        location: "Local Facility",
        status: "Out for delivery",
      });
    }

    if (order.status === "delivered") {
      const deliveredDate = order.deliveryDate
        ? new Date(order.deliveryDate)
        : new Date(orderDate);
      deliveredDate.setDate(deliveredDate.getDate() + 3);
      events.push({
        date: deliveredDate.toISOString(),
        location: order.shippingAddress?.city || "Destination",
        status: "Delivered",
      });
    }

    return events.reverse(); // Most recent first
  }
}
