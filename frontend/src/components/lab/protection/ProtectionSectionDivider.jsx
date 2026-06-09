import React from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky section divider used to visually separate major sections inside
 * the Protection Lab page. Renders a labelled hairline with an icon slot
 * and an optional sub-label / badge area.
 *
 * Props
 * ─────
 * icon        — React node (Lucide icon, etc.)
 * label       — Primary section title (string)
 * subLabel    — Secondary / descriptive text (string, optional)
 * badge       — Small pill node rendered after the label (optional)
 * className   — Extra classes on the outer wrapper
 * sticky      — If true (default) the divider sticks to the top of its scroll container
 */
export function ProtectionSectionDivider({
    icon = null,
    label = "",
    subLabel = "",
    badge = null,
    className = "",
    sticky = true,
}) {
    return (
        <div
            className={cn(
                "relative z-20 mx-6 my-2",
                sticky && "sticky top-0",
                className,
            )}
        >
            {/* Background bleed so content behind shows blurred under the label */}
            <div className="absolute inset-0 -mx-6 bg-[hsl(var(--bg)/0.88)] backdrop-blur-sm pointer-events-none" />
            {/* Subtle cyan/teal-tinted band + bottom hairline to separate page zones */}
            <div className="absolute inset-0 -mx-6 bg-gradient-to-r from-[hsl(var(--accent-secondary)/0.08)] via-[hsl(var(--accent-secondary)/0.02)] to-transparent border-b border-[hsl(var(--accent-secondary)/0.15)] pointer-events-none" />

            <div className="relative flex items-center gap-3 py-3">
                {/* Left accent line */}
                <div className="shrink-0 w-1 h-5 rounded-sm bg-gradient-to-b from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary)/0.6)]" />

                {/* Icon */}
                {icon && (
                    <span className="shrink-0 text-[hsl(var(--accent-primary))]">
                        {icon}
                    </span>
                )}

                {/* Label group */}
                <div className="flex flex-wrap items-baseline gap-2.5 min-w-0">
                    <span className="text-[12px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text))] font-semibold">
                        {label}
                    </span>
                    {subLabel && (
                        <span className="text-[11px] font-ui text-[hsl(var(--text-2))] tracking-[0.02em]">
                            {subLabel}
                        </span>
                    )}
                    {badge && badge}
                </div>

                {/* Full-width hairline after label group */}
                <div className="flex-1 h-px bg-gradient-to-r from-[hsl(var(--accent-secondary)/0.25)] to-transparent" />
            </div>
        </div>
    );
}
