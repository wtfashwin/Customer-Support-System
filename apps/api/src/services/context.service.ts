import Groq from "groq-sdk";
import { prisma, type Message } from "@repo/database";
import type {
  ChatMessage,
  ConversationContext,
  ExtractedEntities,
} from "../types/index.js";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("context");

const MAX_TOKENS = 8000;
const KEEP_RECENT_MESSAGES = 10;

export class ContextService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY!,
    });
  }

  async buildContext(conversationId: string): Promise<ConversationContext> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    const tokenCount = this.estimateTokens(messages);

    logger.debug(
      { conversationId, messageCount: messages.length, tokenCount },
      "Building context"
    );

    // If within token limits, return all messages
    if (tokenCount <= MAX_TOKENS) {
      return {
        messages: this.formatMessages(messages),
        entities: this.extractEntities(messages),
        tokenCount,
        compacted: false,
      };
    }

    // Compact context if too large
    return this.compactContext(messages);
  }

  private async compactContext(
    messages: Message[]
  ): Promise<ConversationContext> {
    const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);
    const oldMessages = messages.slice(0, -KEEP_RECENT_MESSAGES);

    logger.info(
      {
        totalMessages: messages.length,
        compactingMessages: oldMessages.length,
        keepingRecent: recentMessages.length,
      },
      "Compacting conversation context"
    );

    // Summarize old messages
    const summary = await this.summarizeMessages(oldMessages);

    const formattedMessages: ChatMessage[] = [
      {
        role: "system",
        content: `Previous conversation summary: ${summary}`,
      },
      ...this.formatMessages(recentMessages),
    ];

    const newTokenCount =
      this.estimateTokens(recentMessages) + Math.ceil(summary.length / 4);

    return {
      messages: formattedMessages,
      entities: this.extractEntities(messages), // Extract from ALL messages
      tokenCount: newTokenCount,
      compacted: true,
    };
  }

  private async summarizeMessages(messages: Message[]): Promise<string> {
    if (messages.length === 0) return "";

    const conversation = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    try {
      const response = await this.groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Summarize this customer support conversation concisely. Preserve key details like order numbers (ORD-*), invoice numbers (INV-*), tracking IDs (TRK-*), any amounts mentioned, and the main issues discussed.

Conversation:
${conversation}

Provide a brief summary (2-3 sentences) focusing on the essential context needed to continue helping this customer.`,
          },
        ],
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      logger.error({ error }, "Failed to summarize messages");
      // Fallback: return truncated raw content
      return messages
        .slice(-3)
        .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
        .join(" | ");
    }
  }

  private formatMessages(messages: Message[]): ChatMessage[] {
    return messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));
  }

  extractEntities(messages: Message[]): ExtractedEntities {
    const entities: ExtractedEntities = {
      orderNumbers: [],
      invoiceNumbers: [],
      trackingIds: [],
      amounts: [],
    };

    const content = messages.map((m) => m.content).join(" ");

    // Extract order numbers (ORD-*)
    const orderMatches = content.match(/ORD-\w+/g);
    if (orderMatches) {
      entities.orderNumbers = [...new Set(orderMatches)];
    }

    // Extract invoice numbers (INV-*)
    const invoiceMatches = content.match(/INV-\w+/g);
    if (invoiceMatches) {
      entities.invoiceNumbers = [...new Set(invoiceMatches)];
    }

    // Extract tracking IDs (TRK-* or common carrier formats)
    const trackingMatches = content.match(/TRK-\w+|1Z[A-Z0-9]{16}|\d{12,22}/g);
    if (trackingMatches) {
      entities.trackingIds = [...new Set(trackingMatches)];
    }

    // Extract monetary amounts
    const amountMatches = content.match(/\$[\d,]+\.?\d*/g);
    if (amountMatches) {
      entities.amounts = [...new Set(amountMatches)];
    }

    logger.debug({ entities }, "Extracted entities from conversation");

    return entities;
  }

  estimateTokens(messages: Message[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}

// Singleton instance
export const contextService = new ContextService();
