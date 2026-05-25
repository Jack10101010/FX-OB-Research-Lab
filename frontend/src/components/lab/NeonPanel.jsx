import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

// NeonPanel: premium dark glass panel with corner accents + subtle inner border.
// v2: adds collapsible prop with animated chevron toggle.
export function NeonPanel({
    children,
    className,
    title,
    action,
    dense = false,
    tone = "default",
    testId,
    // v2 additions
    collapsible = false,     // show collapse toggle in header
    defaultCollapsed = false, // start collapsed
}) {
    const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

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
                <div
                    className={cn(
                        "flex items-center justify-between px-4",
                        dense ? "py-2" : "py-3",
                        "border-b border-[hsl(var(--border-soft)/0.6)]",
                        collapsible && "cursor-pointer select-none hover:bg-[hsl(var(--panel-2)/0.35)] transition-colors",
                    )}
                    onClick={collapsible ? () => setCollapsed(c => !c) : undefined}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {collapsible && (
                            collapsed
                                ? <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] shrink-0" />
                                : <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] shrink-0" />
                        )}
                        {title && (
                            <h3 className="panel-title-label uppercase text-title-lab">
                                {title}
                            </h3>
                        )}
                    </div>
                    {action && (
                        <div
                            className={cn("transition-opacity shrink-0", collapsed && "opacity-40")}
                            onClick={e => e.stopPropagation()}
                        >
                            {action}
                        </div>
                    )}
                </div>
            )}
            {!collapsed && (
                <div className={cn("relative", dense ? "p-3" : "p-4")}>{children}</div>
            )}
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
