import {
  prisma,
  type Conversation,
  type Message,
  type User,
} from "@repo/database";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";
import { contextService } from "./context.service.js";
import { agentService } from "./agent.service.js";
import type { PaginationParams, PaginatedResponse } from "../types/index.js";

const logger = createServiceLogger("chat");

export class ChatService {
  async createConversation(
    userId: string,
    title?: string
  ): Promise<Conversation> {
    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title: title || "New Conversation",
      },
    });

    logger.info(
      { conversationId: conversation.id, userId },
      "Conversation created"
    );

    return conversation;
  }

  async getConversation(
    conversationId: string,
    userId: string
  ): Promise<Conversation> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50, // Limit initial messages
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation");
    }

    return conversation;
  }

  async getUserConversations(
    userId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Conversation>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1, // Include last message preview
          },
        },
      }),
      prisma.conversation.count({ where: { userId } }),
    ]);

    return {
      data: conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Message>> {
    // Verify conversation access
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation");
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    content: string
  ): Promise<ReadableStream> {
    // Verify conversation access
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation");
    }

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content,
      },
    });

    logger.info(
      { conversationId, messageId: userMessage.id },
      "User message saved"
    );

    // Build context from conversation history
    const context = await contextService.buildContext(conversationId);

    // Route message to appropriate agent
    const routingDecision = await agentService.routeMessage(
      content,
      context.messages
    );

    // Save routing decision to conversation metadata
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          lastAgent: routingDecision.agent,
          entities: routingDecision.entities,
        },
        updatedAt: new Date(),
      },
    });

    // Execute agent and return stream
    return agentService.executeAgent(
      routingDecision.agent,
      conversationId,
      userId,
      context.messages,
      routingDecision.reasoning
    );
  }

  async updateConversation(
    conversationId: string,
    userId: string,
    data: { title?: string; status?: "active" | "resolved" | "archived" }
  ): Promise<Conversation> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation");
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.status && { status: data.status }),
        updatedAt: new Date(),
      },
    });

    logger.info({ conversationId, updates: data }, "Conversation updated");

    return updated;
  }

  async deleteConversation(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation", conversationId);
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenError("You do not have access to this conversation");
    }

    await prisma.conversation.delete({
      where: { id: conversationId },
    });

    logger.info({ conversationId, userId }, "Conversation deleted");
  }
}

// Singleton instance
export const chatService = new ChatService();
