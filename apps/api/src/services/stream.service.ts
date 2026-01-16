import { streamText, type CoreMessage, type CoreTool } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { prisma, type AgentType } from "@repo/database";
import type { ToolCallResult } from "../types/index.js";
import { createServiceLogger } from "../lib/logger.js";
import { AIServiceError } from "../lib/errors.js";
import { formatStreamEvent } from "../utils/response.js";

const logger = createServiceLogger("stream");

// Initialize Groq provider for Vercel AI SDK
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY!,
});

export interface StreamInput {
  conversationId: string;
  systemPrompt: string;
  messages: CoreMessage[];
  tools: Record<string, CoreTool>;
  agentType: AgentType;
  reasoning?: string;
}

export class StreamService {
  async createStream(input: StreamInput): Promise<ReadableStream> {
    const {
      conversationId,
      systemPrompt,
      messages,
      tools,
      agentType,
      reasoning,
    } = input;

    const encoder = new TextEncoder();
    let fullResponse = "";
    let tokensUsed = 0;
    const toolCalls: ToolCallResult[] = [];

    return new ReadableStream({
      start: async (controller) => {
        try {
          // Send initial status event
          controller.enqueue(
            encoder.encode(
              formatStreamEvent("status", {
                status: "thinking",
                agent: agentType,
              })
            )
          );

          // If reasoning/thought process is available from router, send it
          if (reasoning) {
            controller.enqueue(
              encoder.encode(
                formatStreamEvent("reasoning", {
                  text: reasoning,
                })
              )
            );
          }

          // Build messages array with system prompt
          const aiMessages: CoreMessage[] = [
            { role: "system", content: systemPrompt },
            ...messages,
          ];

          // Use Vercel AI SDK's streamText with Groq
          const result = await streamText({
            model: groq("llama-3.3-70b-versatile"),
            messages: aiMessages,
            tools: Object.keys(tools).length > 0 ? tools : undefined,
            maxTokens: 2048,
            temperature: 0.7,
            maxSteps: 5, // Allow multi-step tool usage
          });

          // Process the text stream
          for await (const textPart of result.textStream) {
            if (textPart) {
              fullResponse += textPart;
              controller.enqueue(
                encoder.encode(formatStreamEvent("text", { text: textPart }))
              );
            }
          }

          // Wait for the full result to get usage and tool results
          const [usage, steps, finalFullText] = await Promise.all([
            result.usage,
            result.steps,
            result.text,
          ]);

          // Process token usage
          tokensUsed = usage.totalTokens || 0;

          // Process tool calls from steps
          if (steps) {
            for (const step of steps as any[]) {
              if (step.toolCalls) {
                for (const tc of step.toolCalls as any[]) {
                  // Send tool call event
                  controller.enqueue(
                    encoder.encode(
                      formatStreamEvent("status", {
                        status: "tool_calling",
                        tool: tc.toolName
                      })
                    )
                  );
                  controller.enqueue(
                    encoder.encode(
                      formatStreamEvent("tool_call", {
                        name: tc.toolName,
                        input: tc.args,
                      })
                    )
                  );
                }
              }

              if (step.toolResults) {
                for (const tr of step.toolResults as any[]) {
                  toolCalls.push({
                    toolName: tr.toolName,
                    input: tr.args,
                    output: tr.result as any,
                  });

                  controller.enqueue(
                    encoder.encode(
                      formatStreamEvent("tool_result", {
                        name: tr.toolName,
                        result: tr.result,
                      })
                    )
                  );
                }
              }
            }
          }

          // If fullResponse is empty, get it from the final result
          if (!fullResponse && finalFullText) {
            fullResponse = finalFullText;
            // Send the text if we didn't stream it
            controller.enqueue(
              encoder.encode(formatStreamEvent("text", { text: fullResponse }))
            );
          }

          // Save assistant message to database
          const savedMessage = await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: fullResponse,
              agentType,
              toolCalls: toolCalls.length > 0 ? (toolCalls as any) : undefined,
              reasoning,
              tokensUsed,
            },
          });

          logger.info(
            {
              conversationId,
              messageId: savedMessage.id,
              agentType,
              tokensUsed,
              toolCallCount: toolCalls.length,
            },
            "Stream completed and message saved"
          );

          // Send completion event
          controller.enqueue(
            encoder.encode(
              formatStreamEvent("done", {
                messageId: savedMessage.id,
                tokensUsed,
              })
            )
          );

          controller.close();
        } catch (error) {
          logger.error({ error, conversationId }, "Stream error");

          controller.enqueue(
            encoder.encode(
              formatStreamEvent("error", {
                message: "An error occurred while generating response",
              })
            )
          );
          controller.close();

          throw new AIServiceError("Failed to generate AI response");
        }
      },
    });
  }
}

// Singleton instance
export const streamService = new StreamService();
