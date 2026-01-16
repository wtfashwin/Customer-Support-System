import { Hono } from "hono";
import { agentsController } from "../controllers/agents.controller.js";
import { validateParams } from "../middleware/validation.middleware.js";
import { AgentTypeSchema } from "../utils/validation.js";

const agentRoutes = new Hono();

// GET /agents - List all agents
agentRoutes.get("/", agentsController.getAgents);

// GET /agents/:type/capabilities - Get agent capabilities
agentRoutes.get(
  "/:type/capabilities",
  validateParams(AgentTypeSchema),
  agentsController.getAgentCapabilities
);

export { agentRoutes };
