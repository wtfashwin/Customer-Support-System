import { prisma } from "@repo/database";
import { BaseAgent } from "./base.agent.js";

export class SupportAgent extends BaseAgent {
  readonly type = "support" as const;
  readonly name = "Support Agent";
  readonly description =
    "Handles general inquiries, FAQs, account issues, and troubleshooting";

  constructor() {
    super();
    this.initializeTools();
  }

  getSystemPrompt(): string {
    return `You are a friendly and helpful customer support agent. Your role is to assist customers with general inquiries, account issues, FAQs, and troubleshooting.

Guidelines:
- Be empathetic and professional in all interactions
- Use the searchKnowledgeBase tool to find relevant FAQ answers before responding
- Use getUserInfo to look up account details when needed
- If an issue cannot be resolved, offer to escalate to a human agent
- Always confirm you understand the customer's issue before providing a solution
- If the query is about orders or billing, politely redirect to the appropriate specialist

Available tools:
- searchKnowledgeBase: Search FAQs and knowledge base articles
- getUserInfo: Get user account information
- escalateToHuman: Flag conversation for human review

Remember: Your goal is to resolve issues efficiently while ensuring customer satisfaction.`;
  }

  private initializeTools(): void {
    // Search knowledge base tool
    this.registerTool({
      name: "searchKnowledgeBase",
      description:
        "Search the FAQ and knowledge base for answers to common questions",
      parameters: {
        query: {
          type: "string",
          description: "The search query to find relevant articles",
        },
        category: {
          type: "string",
          description:
            "Optional category filter (Account, Orders, Returns, Billing, Products)",
        },
      },
      execute: async (params) => {
        const { query, category } = params as {
          query: string;
          category?: string;
        };

        const articles = await prisma.knowledgeBase.findMany({
          where: {
            AND: [
              category ? { category } : {},
              {
                OR: [
                  { question: { contains: query, mode: "insensitive" } },
                  { answer: { contains: query, mode: "insensitive" } },
                  { keywords: { hasSome: query.toLowerCase().split(" ") } },
                ],
              },
            ],
          },
          orderBy: { priority: "desc" },
          take: 5,
        });

        return {
          found: articles.length,
          articles: articles.map((a) => ({
            category: a.category,
            question: a.question,
            answer: a.answer,
          })),
        };
      },
    });

    // Get user info tool
    this.registerTool({
      name: "getUserInfo",
      description: "Retrieve user account information",
      parameters: {
        includeOrders: {
          type: "boolean",
          description: "Whether to include recent order summary",
        },
      },
      execute: async (params, userId) => {
        const { includeOrders } = params as { includeOrders?: boolean };

        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: includeOrders
            ? {
                conversations: {
                  take: 1,
                  orderBy: { createdAt: "desc" },
                },
              }
            : undefined,
        });

        if (!user) {
          return { error: "User not found" };
        }

        // Get order count separately if needed
        let orderInfo = null;
        if (includeOrders) {
          const orders = await prisma.order.findMany({
            where: { userId },
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              orderNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          });
          orderInfo = {
            recentOrders: orders,
            totalOrders: await prisma.order.count({ where: { userId } }),
          };
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          memberSince: user.createdAt,
          ...(orderInfo && { orders: orderInfo }),
        };
      },
    });

    // Escalate to human tool
    this.registerTool({
      name: "escalateToHuman",
      description:
        "Flag the conversation for human agent review when the issue cannot be resolved automatically",
      parameters: {
        reason: {
          type: "string",
          description: "The reason for escalation",
        },
        priority: {
          type: "string",
          description: "Priority level: low, medium, high",
        },
      },
      execute: async (params, userId) => {
        const { reason, priority } = params as {
          reason: string;
          priority: string;
        };

        // In a real system, this would create a ticket in a support queue
        // For now, we'll just log and return a confirmation
        return {
          escalated: true,
          ticketId: `ESC-${Date.now()}`,
          message: `Your request has been escalated to a human agent with ${priority} priority. A support representative will review your case shortly.`,
          estimatedWaitTime:
            priority === "high"
              ? "15-30 minutes"
              : priority === "medium"
                ? "1-2 hours"
                : "4-8 hours",
          reason,
        };
      },
    });
  }
}
