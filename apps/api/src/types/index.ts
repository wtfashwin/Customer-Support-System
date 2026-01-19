import type { Context } from "hono";
import type { User } from "@repo/database";
import type { AgentType } from "@repo/shared-types";

// Hono context with user
export interface AuthVariables {
  user: User;
}

export type AuthContext = Context<{ Variables: AuthVariables }>;

// Agent routing
export interface RoutingDecision {
  agent: AgentType;
  confidence: number;
  reasoning: string;
  entities: string[];
}

// Chat messages for Claude API
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Context building result
export interface ConversationContext {
  messages: ChatMessage[];
  entities: ExtractedEntities;
  tokenCount: number;
  compacted: boolean;
}

// Extracted entities from conversation
export interface ExtractedEntities {
  orderNumbers: string[];
  invoiceNumbers: string[];
  trackingIds: string[];
  amounts: string[];
}

// Tool definition for agents
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
  execute: (params: any, userId: string) => Promise<unknown>;
}

// Tool call result
export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
}

// Agent capabilities for API response
export interface AgentCapabilities {
  type: AgentType;
  name: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
  }>;
}

// Pagination params
export interface PaginationParams {
  page: number;
  limit: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Stream events
export type StreamEventType = "text" | "tool_call" | "tool_result" | "done" | "error";

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}
