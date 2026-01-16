import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> { }

export function Card({ className, children, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "rounded-2xl border border-background-tertiary bg-background-secondary p-6",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export function CardHeader({ className, children, ...props }: CardProps) {
    return (
        <div className={cn("mb-4", className)} {...props}>
            {children}
        </div>
    );
}

export function CardTitle({ className, children, ...props }: CardProps) {
    return (
        <h3
            className={cn("text-lg font-semibold text-foreground", className)}
            {...props}
        >
            {children}
        </h3>
    );
}

export function CardContent({ className, children, ...props }: CardProps) {
    return (
        <div className={cn("text-foreground-secondary", className)} {...props}>
            {children}
        </div>
    );
}
