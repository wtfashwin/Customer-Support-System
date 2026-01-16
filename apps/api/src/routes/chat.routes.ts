/// <reference types="undici-types" />
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { chatController } from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.middleware.js";
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
    zValidator("json", CreateConversationSchema),
    chatController.createConversation
  )

  // GET /conversations - List conversations
  .get(
    "/conversations",
    zValidator("query", PaginationSchema),
    chatController.getConversations
  )

  // GET /conversations/:id - Get conversation details
  .get(
    "/conversations/:id",
    zValidator("param", ConversationIdSchema),
    chatController.getConversation
  )

  // PATCH /conversations/:id - Update conversation (e.g., title)
  .patch(
    "/conversations/:id",
    zValidator("param", ConversationIdSchema),
    zValidator("json", UpdateConversationSchema),
    chatController.updateConversation
  )

  // POST /conversations/:id/messages - Send message
  .post(
    "/conversations/:id/messages",
    zValidator("param", ConversationIdSchema),
    zValidator("json", SendMessageSchema),
    rateLimitMiddleware,
    chatController.sendMessage
  )

  // GET /conversations/:id/messages - Get messages
  .get(
    "/conversations/:id/messages",
    zValidator("param", ConversationIdSchema),
    zValidator("query", PaginationSchema),
    chatController.getMessages
  )

  // DELETE /conversations/:id - Delete conversation
  .delete(
    "/conversations/:id",
    zValidator("param", ConversationIdSchema),
    chatController.deleteConversation
  );

export { chatRoutes };
