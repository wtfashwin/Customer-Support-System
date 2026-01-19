import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { type AgentType } from "@repo/shared-types";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
    variant?: "user" | "agent";
    agentType?: AgentType | string;
    src?: string;
    alt?: string;
}

export function Avatar({
    className,
    variant = "user",
    agentType,
    src,
    alt,
    ...props
}: AvatarProps) {
    const initials = variant === "user" ? "U" : agentType?.[0]?.toUpperCase() || "A";

    let bgColor = "bg-primary";
    if (variant === "agent") {
        const agentColors: Record<string, string> = {
            support: "bg-agent-support",
            order: "bg-agent-order",
            billing: "bg-agent-billing",
        };
        bgColor = (agentType && agentColors[agentType as string]) || "bg-primary-muted";
    }

    return (
        <div
            className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white",
                bgColor,
                className
            )}
            {...props}
        >
            {src ? (
                <img src={src} alt={alt || "Avatar"} className="h-full w-full rounded-full object-cover" />
            ) : (
                <span>{initials}</span>
            )}
        </div>
    );
}
