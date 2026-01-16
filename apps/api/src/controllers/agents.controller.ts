/// <reference types="undici-types" />
import type { Context } from "hono";
import type { AgentType } from "@repo/database";
import { agentService } from "../services/agent.service.js";
import { successResponse } from "../utils/response.js";
import { NotFoundError } from "../lib/errors.js";

export const agentsController = {
  // Get list of all available agents
  async getAgents(c: any) {
    const agents = agentService.getAllAgents();

    const agentList = agents.map(({ type, agent }) => ({
      type,
      name: agent.name,
      description: agent.description,
      toolCount: agent.getTools().length,
    }));

    return successResponse(c, {
      agents: agentList,
      total: agentList.length,
    });
  },

  // Get capabilities of a specific agent
  async getAgentCapabilities(c: any) {
    const params = c.req.valid("param");
    const agent = agentService.getAgent(params.type as AgentType);

    if (!agent) {
      throw new NotFoundError("Agent", params.type);
    }

    const capabilities = agent.getCapabilities();

    return successResponse(c, capabilities);
  },
};
