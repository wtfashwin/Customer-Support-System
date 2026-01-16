import { z } from "zod";

// Send message schema
export const SendMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long (max 10000 characters)"),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// Create conversation schema
export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  initialMessage: z
    .string()
    .min(1, "Initial message cannot be empty")
    .max(10000, "Message too long")
    .optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

// Pagination schema
export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().min(1).max(100).default(20)),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

// Conversation ID param schema
export const ConversationIdSchema = z.object({
  id: z.string().min(1, "Conversation ID is required"),
});

export type ConversationIdInput = z.infer<typeof ConversationIdSchema>;

// Agent type param schema
export const AgentTypeSchema = z.object({
  type: z.enum(["support", "order", "billing"], {
    errorMap: () => ({ message: "Invalid agent type. Must be: support, order, or billing" }),
  }),
});

export type AgentTypeInput = z.infer<typeof AgentTypeSchema>;

// Update conversation schema
export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(["active", "resolved", "archived"]).optional(),
});

export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
