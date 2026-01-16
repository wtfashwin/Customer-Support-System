import { Hono } from "hono";
import { chatController } from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
import {
  validateBody,
  validateQuery,
  validateParams,
} from "../middleware/validation.middleware.js";
import {
  CreateConversationSchema,
  PaginationSchema,
  ConversationIdSchema,
  SendMessageSchema,
  UpdateConversationSchema,
} from "../utils/validation.js";

const chatRoutes = new Hono();

// All chat routes require authentication
chatRoutes.use("*", authMiddleware);

// POST /conversations - Create new conversation
chatRoutes.post(
  "/conversations",
  validateBody(CreateConversationSchema),
  chatController.createConversation
);

// GET /conversations - List user conversations
chatRoutes.get(
  "/conversations",
  validateQuery(PaginationSchema),
  chatController.getConversations
);

// GET /conversations/:id - Get conversation details
chatRoutes.get(
  "/conversations/:id",
  validateParams(ConversationIdSchema),
  chatController.getConversation
);

// GET /conversations/:id/messages - Get messages
chatRoutes.get(
  "/conversations/:id/messages",
  validateParams(ConversationIdSchema),
  validateQuery(PaginationSchema),
  chatController.getMessages
);

// POST /conversations/:id/messages - Send message (streaming)
// Add rate limiting to message sending
chatRoutes.post(
  "/conversations/:id/messages",
  rateLimitMiddleware,
  validateParams(ConversationIdSchema),
  validateBody(SendMessageSchema),
  chatController.sendMessage
);

// PATCH /conversations/:id - Update conversation
chatRoutes.patch(
  "/conversations/:id",
  validateParams(ConversationIdSchema),
  validateBody(UpdateConversationSchema),
  chatController.updateConversation
);

// DELETE /conversations/:id - Delete conversation
chatRoutes.delete(
  "/conversations/:id",
  validateParams(ConversationIdSchema),
  chatController.deleteConversation
);

export { chatRoutes };
