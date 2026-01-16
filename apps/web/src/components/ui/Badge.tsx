import { HTMLAttributes } from "react";
import { cn, getAgentColor } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "success" | "warning" | "error" | "agent";
    agentType?: string;
}

export function Badge({
    className,
    variant = "default",
    agentType,
    children,
    ...props
}: BadgeProps) {
    let badgeStyles = "bg-background-tertiary text-foreground-secondary";

    if (variant === "agent" && agentType) {
        const colors = getAgentColor(agentType);
        badgeStyles = cn(colors.bg, colors.text, colors.border, "border");
    } else if (variant === "success") {
        badgeStyles = "bg-success/10 text-success border border-success/20";
    } else if (variant === "warning") {
        badgeStyles = "bg-warning/10 text-warning border border-warning/20";
    } else if (variant === "error") {
        badgeStyles = "bg-error/10 text-error border border-error/20";
    }

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                badgeStyles,
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}
