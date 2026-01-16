import { tool, type CoreTool } from "ai";
import { z } from "zod";
import type { AgentTool, AgentCapabilities } from "../types/index.js";
import type { AgentType } from "@repo/database";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("agent-base");

export abstract class BaseAgent {
  abstract readonly type: AgentType;
  abstract readonly name: string;
  abstract readonly description: string;

  protected tools: Map<string, AgentTool> = new Map();

  abstract getSystemPrompt(): string;

  registerTool(agentTool: AgentTool): void {
    this.tools.set(agentTool.name, agentTool);
  }

  getTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Convert tool parameters to Zod schema
   */
  private paramsToZodSchema(
    params: Record<string, { type: string; description: string }>
  ): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const schemaFields: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(params)) {
      let zodType: z.ZodTypeAny;

      switch (value.type) {
        case "string":
          zodType = z.string().describe(value.description);
          break;
        case "number":
          zodType = z.number().describe(value.description);
          break;
        case "boolean":
          zodType = z.boolean().describe(value.description);
          break;
        case "array":
          zodType = z.array(z.unknown()).describe(value.description);
          break;
        default:
          zodType = z.string().describe(value.description);
      }

      // Make optional if description contains "optional"
      if (value.description.toLowerCase().includes("optional")) {
        zodType = zodType.optional();
      }

      schemaFields[key] = zodType;
    }

    return z.object(schemaFields);
  }

  /**
   * Get tools in Vercel AI SDK format
   * This is the primary format used for AI interactions
   */
  getVercelTools(userId: string): Record<string, CoreTool> {
    const vercelTools: Record<string, CoreTool> = {};

    for (const agentTool of this.tools.values()) {
      const schema = this.paramsToZodSchema(agentTool.parameters);

      vercelTools[agentTool.name] = tool({
        description: agentTool.description,
        parameters: schema,
        execute: async (params) => {
          logger.info(
            {
              toolName: agentTool.name,
              agentType: this.type,
              userId,
              input: JSON.stringify(params).slice(0, 200),
            },
            "Executing tool via Vercel AI SDK"
          );

          try {
            const result = await agentTool.execute(params, userId);
            logger.debug({ toolName: agentTool.name, success: true }, "Tool executed successfully");
            return result;
          } catch (error) {
            logger.error({ error, toolName: agentTool.name }, "Tool execution failed");
            throw error;
          }
        },
      });
    }

    return vercelTools;
  }

  /**
   * Legacy: Get tools in Groq/OpenAI function calling format
   * Kept for backwards compatibility
   */
  getGroqTools() {
    return this.getTools().map((agentTool) => ({
      type: "function" as const,
      function: {
        name: agentTool.name,
        description: agentTool.description,
        parameters: {
          type: "object" as const,
          properties: agentTool.parameters,
          required: Object.keys(agentTool.parameters).filter(
            (key) =>
              !agentTool.parameters[key].description
                .toLowerCase()
                .includes("optional")
          ),
        },
      },
    }));
  }

  /**
   * Get tools in Anthropic format
   * Used for direct Anthropic API integration if needed
   */
  getAnthropicTools() {
    return this.getTools().map((agentTool) => ({
      name: agentTool.name,
      description: agentTool.description,
      input_schema: {
        type: "object",
        properties: agentTool.parameters,
        required: Object.keys(agentTool.parameters).filter(
          (key) =>
            !agentTool.parameters[key].description
              .toLowerCase()
              .includes("optional")
        ),
      },
    }));
  }

  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    const agentTool = this.tools.get(toolName);
    if (!agentTool) {
      logger.error({ toolName, agentType: this.type }, "Unknown tool");
      throw new Error(`Unknown tool: ${toolName}`);
    }

    logger.info(
      {
        toolName,
        agentType: this.type,
        userId,
        input: JSON.stringify(input).slice(0, 200),
      },
      "Executing tool"
    );

    try {
      const result = await agentTool.execute(input, userId);
      logger.debug({ toolName, success: true }, "Tool executed successfully");
      return result;
    } catch (error) {
      logger.error({ error, toolName, input }, "Tool execution failed");
      throw error;
    }
  }

  getCapabilities(): AgentCapabilities {
    return {
      type: this.type,
      name: this.name,
      description: this.description,
      tools: this.getTools().map((t) => ({
        name: t.name,
        description: t.description,
      })),
    };
  }

  protected formatToolResult(data: unknown, summary: string): string {
    return `${summary}\n\nDetails:\n${JSON.stringify(data, null, 2)}`;
  }
}
