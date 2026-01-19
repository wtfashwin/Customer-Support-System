import { z } from "zod";

/**
 * Agent Type Schema - Shared across API and Web
 */
export const AgentTypeSchema = z.enum(["support", "order", "billing"]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * Type guard to check if a string is a valid AgentType
 */
export function isValidAgentType(value: unknown): value is AgentType {
    return AgentTypeSchema.safeParse(value).success;
}

/**
 * Safely parse a string into AgentType, returning undefined if invalid
 */
export function parseAgentType(value: unknown): AgentType | undefined {
    const result = AgentTypeSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

/**
 * Safely parse a string into AgentType, returning a default if invalid
 */
export function parseAgentTypeWithDefault(
    value: unknown,
    defaultValue: AgentType = "support"
): AgentType {
    const result = AgentTypeSchema.safeParse(value);
    return result.success ? result.data : defaultValue;
}
