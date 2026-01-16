/// <reference types="undici-types" />
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { agentsController } from "../controllers/agents.controller.js";
import { AgentTypeSchema } from "../utils/validation.js";

const agentRoutes = new Hono()
  // GET /agents - List all agents
  .get("/", agentsController.getAgents)

  // GET /agents/:type/capabilities - Get agent capabilities
  .get(
    "/:type/capabilities",
    zValidator("param", AgentTypeSchema),
    agentsController.getAgentCapabilities
  );

export { agentRoutes };
