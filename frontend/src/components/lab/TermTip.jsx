/**
 * TermTip.jsx
 *
 * Glossary-backed tooltip wrapper. Wraps a label (or renders a small "ⓘ" dot)
 * and shows the canonical friendly name + definition + "why it matters" from
 * researchGlossary.js on hover/focus.
 *
 * Single source of truth: all copy comes from getGlossary(termKey). Components
 * never hardcode definitions.
 *
 * Usage:
 *   <TooltipProvider>            // wrap the surrounding panel ONCE
 *     <TermTip termKey="vacant_at_arm">OB Vacant At Arm</TermTip>
 *     <TermTip termKey="stat_wr" />   // standalone ⓘ dot
 *   </TooltipProvider>
 *
 * Resilience: if termKey has no glossary entry, children render plain (no
 * tooltip, no crash); a bare ⓘ with no entry renders nothing.
 *
 * TooltipProvider is re-exported so callers import both from one place.
 */

import * as React from "react";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import { getGlossary } from "@/data/researchGlossary";
import { cn } from "@/lib/utils";

export { TooltipProvider };

/**
 * @param {{ termKey: string, children?: React.ReactNode, className?: string, side?: "top"|"right"|"bottom"|"left" }} props
 */
export function TermTip({ termKey, children, className, side = "top" }) {
    const g = getGlossary(termKey);

    // No glossary entry → degrade gracefully.
    if (!g) return children != null ? <>{children}</> : null;

    const trigger = children != null ? (
        <span
            tabIndex={0}
            className={cn(
                "underline decoration-dotted decoration-[hsl(var(--text-3)/0.7)] underline-offset-2 cursor-help outline-none focus-visible:decoration-[hsl(var(--accent-primary))]",
                className,
            )}
        >
            {children}
        </span>
    ) : (
        <span
            tabIndex={0}
            aria-label={g.friendlyName}
            className={cn(
                "inline-grid place-items-center w-3 h-3 rounded-full border border-[hsl(var(--text-3)/0.5)] text-[7px] font-bold leading-none text-[hsl(var(--text-3))] cursor-help align-middle outline-none focus-visible:border-[hsl(var(--accent-primary))]",
                className,
            )}
        >
            i
        </span>
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side={side} className="max-w-xs whitespace-normal leading-snug">
                <div className="font-semibold text-[11px] mb-0.5">{g.friendlyName}</div>
                <div className="text-[10.5px] opacity-90 mb-1">{g.definition}</div>
                <div className="text-[10px] italic opacity-75">Why it matters: {g.whyItMatters}</div>
            </TooltipContent>
        </Tooltip>
    );
}
