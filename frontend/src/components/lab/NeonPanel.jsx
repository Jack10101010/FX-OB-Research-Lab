import React from "react";
import { cn } from "@/lib/utils";

// NeonPanel: premium dark glass panel with corner accents + subtle inner border.
export function NeonPanel({ children, className, title, action, dense = false, tone = "default", testId }) {
    const borderTone = {
        default:   "border-[hsl(var(--border-soft))]",
        primary:   "border-[hsl(var(--accent-primary)/0.35)]",
        secondary: "border-[hsl(var(--accent-secondary)/0.35)]",
    }[tone];

    return (
        <div
            data-testid={testId}
            className={cn(
                "relative bg-[hsl(var(--panel)/0.86)] backdrop-blur-xl border",
                borderTone,
                "shadow-[0_0_0_1px_hsl(var(--border-soft)/0.4)_inset]",
                className,
            )}
        >
            {/* Corner accents */}
            <span className="absolute -top-px -left-px w-3 h-3 border-t border-l border-[hsl(var(--accent-primary))] pointer-events-none" />
            <span className="absolute -top-px -right-px w-3 h-3 border-t border-r border-[hsl(var(--accent-secondary))] pointer-events-none" />
            <span className="absolute -bottom-px -left-px w-3 h-3 border-b border-l border-[hsl(var(--accent-secondary))] pointer-events-none" />
            <span className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-[hsl(var(--accent-primary))] pointer-events-none" />

            {(title || action) && (
                <div className={cn("flex items-center justify-between px-4", dense ? "py-2" : "py-3", "border-b border-[hsl(var(--border-soft)/0.6)]")}>
                    {title && (
                        <h3 className="panel-title-label uppercase text-title-lab">
                            {title}
                        </h3>
                    )}
                    {action}
                </div>
            )}
            <div className={cn("relative", dense ? "p-3" : "p-4")}>{children}</div>
        </div>
    );
}

export function SectionTitle({ children, className }) {
    return (
        <h4 className={cn("panel-title-label uppercase text-title-lab", className)}>
            {children}
        </h4>
    );
}
