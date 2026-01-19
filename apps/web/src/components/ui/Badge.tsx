import { HTMLAttributes } from "react";
import { cn, getAgentColor } from "@/lib/utils";
import { type AgentType } from "@repo/shared-types";

export interface BadgeProps {
    children: React.ReactNode;
    variant?: "default" | "success" | "warning" | "error" | "agent";
    agentType?: AgentType | string;
    className?: string;
}

export function Badge({ children, variant = "default", agentType, className }: BadgeProps) {
    const variantStyles = {
        default: "bg-foreground-muted/10 text-foreground-secondary border-foreground-muted/20",
        success: "bg-success/10 text-success border-success/20",
        warning: "bg-warning/10 text-warning border-warning/20",
        error: "bg-error/10 text-error border-error/20",
        agent: "border-transparent",
    };

    if (variant === "agent" && agentType) {
        const colors = getAgentColor(agentType);
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    colors.bg,
                    colors.text,
                    colors.border,
                    className
                )}
            >
                {children}
            </span>
        );
    }

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                variantStyles[variant],
                className
            )}
        >
            {children}
        </span>
    );
}
