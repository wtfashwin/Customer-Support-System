"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useChatStore, type AIStatus, type ToolCall } from "@/stores/chatStore";
import { getStatusMessage, formatToolName } from "@/lib/streaming";

const statusIcons: Record<AIStatus, string> = {
    idle: "",
    thinking: "🧠",
    routing: "🔀",
    tool_calling: "⚙️",
    generating: "✍️",
};

const agentColors: Record<string, string> = {
    support: "bg-green-500/20 text-green-400 border-green-500/30",
    order: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    billing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export function ThinkingIndicator() {
    const { aiStatus, currentAgent, currentTool, pendingToolCalls, isStreaming } =
        useChatStore();

    if (!isStreaming || aiStatus === "idle") {
        return null;
    }

    const statusMessage = getStatusMessage(aiStatus, currentAgent ?? undefined, currentTool ?? undefined);
    const agentColor = currentAgent
        ? agentColors[currentAgent] || "bg-gray-500/20 text-gray-400 border-gray-500/30"
        : "bg-gray-500/20 text-gray-400 border-gray-500/30";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-auto max-w-3xl px-4 py-3"
            >
                <div className="rounded-lg border border-background-tertiary bg-background-secondary p-4">
                    {/* Status Header */}
                    <div className="flex items-center gap-3">
                        {/* Animated Icon */}
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="text-2xl"
                        >
                            {statusIcons[aiStatus]}
                        </motion.div>

                        {/* Status Text */}
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <motion.span
                                    key={statusMessage}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-sm font-medium text-foreground"
                                >
                                    {statusMessage}
                                </motion.span>

                                {/* Animated dots */}
                                <span className="flex gap-1">
                                    {[0, 1, 2].map((i) => (
                                        <motion.span
                                            key={i}
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{
                                                duration: 1,
                                                repeat: Infinity,
                                                delay: i * 0.2,
                                            }}
                                            className="h-1.5 w-1.5 rounded-full bg-foreground-secondary"
                                        />
                                    ))}
                                </span>
                            </div>

                            {/* Agent Badge */}
                            {currentAgent && (
                                <motion.span
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${agentColor}`}
                                >
                                    {currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)} Agent
                                </motion.span>
                            )}
                        </div>
                    </div>

                    {/* Tool Calls */}
                    {pendingToolCalls.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-3 space-y-2 border-t border-background-tertiary pt-3"
                        >
                            <p className="text-xs font-medium text-foreground-secondary">
                                Actions performed:
                            </p>
                            {pendingToolCalls.map((toolCall, index) => (
                                <ToolCallCard key={index} toolCall={toolCall} />
                            ))}
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
    const hasResult = toolCall.result !== undefined;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-md border border-background-tertiary bg-background p-3"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm">
                        {hasResult ? "✅" : "⏳"}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                        {formatToolName(toolCall.name)}
                    </span>
                </div>
                {hasResult && (
                    <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
                        Complete
                    </span>
                )}
            </div>

            {/* Tool Input Summary */}
            {Object.keys(toolCall.input).length > 0 && (
                <div className="mt-2 text-xs text-foreground-secondary">
                    <span className="font-medium">Input: </span>
                    {Object.entries(toolCall.input)
                        .slice(0, 2)
                        .map(([key, value]) => (
                            <span key={key} className="mr-2">
                                {key}: {String(value).slice(0, 30)}
                                {String(value).length > 30 ? "..." : ""}
                            </span>
                        ))}
                </div>
            )}

            {/* Tool Result Preview */}
            {hasResult && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-2 rounded bg-background-tertiary p-2 text-xs text-foreground-secondary"
                >
                    <span className="font-medium">Result: </span>
                    {typeof toolCall.result === "object"
                        ? JSON.stringify(toolCall.result).slice(0, 100) + "..."
                        : String(toolCall.result).slice(0, 100)}
                </motion.div>
            )}
        </motion.div>
    );
}
