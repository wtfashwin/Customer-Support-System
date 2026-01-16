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

const chatRoutes = new Hono()
  .use("*", authMiddleware)

  // POST /conversations - Create new conversation
  .post(
    "/conversations",
    validateBody(CreateConversationSchema),
    chatController.createConversation
  )

  // GET /conversations - List conversations
  .get(
    "/conversations",
    validateQuery(PaginationSchema),
    chatController.getConversations
  )

  // GET /conversations/:id - Get conversation details
  .get(
    "/conversations/:id",
    validateParams(ConversationIdSchema),
    chatController.getConversation
  )

  // PATCH /conversations/:id - Update conversation (e.g., title)
  .patch(
    "/conversations/:id",
    validateParams(ConversationIdSchema),
    validateBody(UpdateConversationSchema),
    chatController.updateConversation
  )

  // POST /conversations/:id/messages - Send message
  .post(
    "/conversations/:id/messages",
    validateParams(ConversationIdSchema),
    validateBody(SendMessageSchema),
    rateLimitMiddleware,
    chatController.sendMessage
  )

  // GET /conversations/:id/messages - Get messages
  .get(
    "/conversations/:id/messages",
    validateParams(ConversationIdSchema),
    validateQuery(PaginationSchema),
    chatController.getMessages
  )

  // DELETE /conversations/:id - Delete conversation
  .delete(
    "/conversations/:id",
    validateParams(ConversationIdSchema),
    chatController.deleteConversation
  );

export { chatRoutes };
