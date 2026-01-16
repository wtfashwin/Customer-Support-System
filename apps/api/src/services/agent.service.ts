import { generateText, type CoreMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";
import type { AgentType } from "@repo/database";
import type { RoutingDecision, ChatMessage } from "../types/index.js";
import { createServiceLogger } from "../lib/logger.js";
import { streamService } from "./stream.service.js";
import {
  SupportAgent,
  OrderAgent,
  BillingAgent,
  type BaseAgent,
} from "../agents/index.js";

const logger = createServiceLogger("agent");

// Initialize Groq provider for Vercel AI SDK
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!,
});

export class AgentService {
  private agents: Map<AgentType, BaseAgent>;

  constructor() {
    // Initialize agent instances
    this.agents = new Map<AgentType, BaseAgent>([
      ["support", new SupportAgent()],
      ["order", new OrderAgent()],
      ["billing", new BillingAgent()],
    ]);
  }

  async routeMessage(
    message: string,
    recentContext: ChatMessage[]
  ): Promise<RoutingDecision> {
    const routerPrompt = `You are a customer support routing system. Analyze the customer's message and determine which specialized agent should handle it.

Customer message: "${message}"

${recentContext.length > 0 ? `Recent conversation context:\n${recentContext.slice(-3).map((m) => `${m.role}: ${m.content}`).join("\n")}` : ""}

Available agents:
1. SUPPORT - General help, FAQs, account issues, troubleshooting, password resets, general questions
2. ORDER - Order status, tracking, shipping, order modifications, cancellations, delivery issues
3. BILLING - Payments, invoices, refunds, subscription issues, billing disputes, payment methods

Respond with ONLY valid JSON in this exact format:
{
  "agent": "support" | "order" | "billing",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this agent was chosen",
  "entities": ["any order numbers, invoice numbers, or tracking IDs mentioned"]
}`;

    try {
      // Use Vercel AI SDK's generateText with Groq
      const result = await generateText({
        model: groq("llama-3.3-70b-versatile"),
        messages: [{ role: "user", content: routerPrompt }],
        maxTokens: 512,
        temperature: 0.3,
      });

      const content = result.text;
      if (!content) {
        throw new Error("No text response from router");
      }

      const decision = JSON.parse(content) as RoutingDecision;

      logger.info(
        {
          message: message.slice(0, 100),
          decision: {
            agent: decision.agent,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
          },
        },
        "Message routed"
      );

      // Fallback to support if confidence is low
      if (decision.confidence < 0.6) {
        logger.info(
          { originalAgent: decision.agent, confidence: decision.confidence },
          "Low confidence - defaulting to support agent"
        );
        return {
          ...decision,
          agent: "support",
          reasoning: `Low confidence (${decision.confidence}) - defaulting to support agent. Original reasoning: ${decision.reasoning}`,
        };
      }

      return decision;
    } catch (error) {
      logger.error({ error, message: message.slice(0, 100) }, "Routing failed");

      // Default to support agent on error
      return {
        agent: "support",
        confidence: 0.5,
        reasoning: "Routing failed - defaulting to support agent",
        entities: [],
      };
    }
  }

  async executeAgent(
    agentType: AgentType,
    conversationId: string,
    userId: string,
    messages: ChatMessage[],
    reasoning: string
  ): Promise<ReadableStream> {
    const agent = this.agents.get(agentType);
    if (!agent) {
      logger.error({ agentType }, "Unknown agent type");
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    logger.info(
      {
        agentType,
        conversationId,
        messageCount: messages.length,
      },
      "Executing agent"
    );

    // Convert ChatMessage[] to CoreMessage[]
    const coreMessages: CoreMessage[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Get agent's tools in Vercel AI SDK format
    const tools = agent.getVercelTools(userId);

    return streamService.createStream({
      conversationId,
      systemPrompt: agent.getSystemPrompt(),
      messages: coreMessages,
      tools,
      agentType,
      reasoning,
    });
  }

  getAgent(type: AgentType): BaseAgent | undefined {
    return this.agents.get(type);
  }

  getAllAgents(): Array<{ type: AgentType; agent: BaseAgent }> {
    return Array.from(this.agents.entries()).map(([type, agent]) => ({
      type,
      agent,
    }));
  }
}

// Singleton instance
export const agentService = new AgentService();
