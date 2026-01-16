export interface StreamEvent {
    type: "text" | "tool_call" | "tool_result" | "status" | "reasoning" | "done" | "error";
    data: any;
}

export interface StatusEventData {
    status: "thinking" | "routing" | "tool_calling" | "generating";
    agent?: string;
    tool?: string;
}

export interface ToolCallEventData {
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResultEventData {
    name: string;
    result: unknown;
}

/**
 * Parses Server-Sent Events (SSE) stream from the API
 * Yields StreamEvent objects as they arrive
 */
export async function* parseSSEStream(
    stream: ReadableStream
): AsyncGenerator<StreamEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    try {
                        const event: StreamEvent = JSON.parse(data);
                        yield event;
                    } catch {
                        // Skip invalid JSON
                        console.warn("Failed to parse SSE event:", data);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Simplified streaming text handler
 * Returns async iterator that yields text chunks
 */
export async function* streamText(stream: ReadableStream) {
    for await (const event of parseSSEStream(stream)) {
        if (event.type === "text") {
            yield event.data.text;
        }
    }
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(
    status: string,
    agent?: string,
    tool?: string
): string {
    const agentName = agent
        ? agent.charAt(0).toUpperCase() + agent.slice(1) + " Agent"
        : "AI";

    switch (status) {
        case "thinking":
            return `${agentName} is thinking...`;
        case "routing":
            return "Analyzing your request...";
        case "tool_calling":
            return tool
                ? `Executing: ${formatToolName(tool)}...`
                : "Executing action...";
        case "generating":
            return `${agentName} is responding...`;
        default:
            return "Processing...";
    }
}

/**
 * Format tool name for display
 */
export function formatToolName(toolName: string): string {
    // Convert camelCase to sentence case
    return toolName
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}
