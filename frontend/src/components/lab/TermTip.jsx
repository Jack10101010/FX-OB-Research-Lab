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
 * GlossaryCard — readable "research dashboard card" tooltip body.
 *
 * Optimised for fast comprehension over decoration: a strong title anchor, a
 * high-contrast definition, then labelled sections (Why it matters · optional
 * How to interpret). No icons, no glow — clarity first. Tier emerges from the
 * data: simple terms (Tier 2) carry only Definition + Why it matters; decision-
 * grade terms (Tier 3) add a How-to-interpret list via `entry.interpretation`.
 *
 * Colour: --text for the primary definition (brightest), --text-2 for supporting
 * copy (still high-contrast, never the dim --muted), teal accent only on the
 * small section labels. Shared by TermTip + ConfidenceChip.
 */
function SectionLabel({ children }) {
    return (
        <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.05em] text-[hsl(var(--accent-secondary))] mb-1">
            {children}
        </div>
    );
}

export function GlossaryCard({ entry }) {
    if (!entry) return null;
    const { friendlyName, definition, whyItMatters, interpretation } = entry;
    const hasInterp = Array.isArray(interpretation) && interpretation.length > 0;

    return (
        <div className="w-[250px]">
            {/* Title — primary anchor */}
            <div className="font-display font-semibold text-[14.5px] leading-tight text-[hsl(var(--text))]">
                {friendlyName}
            </div>
            <div className="mt-2 mb-2.5 border-t border-[hsl(var(--border-soft))]" />

            {/* Definition — highest contrast */}
            {definition && (
                <p className="text-[12.5px] leading-[1.5] text-[hsl(var(--text))]">{definition}</p>
            )}

            {/* Why it matters */}
            {whyItMatters && (
                <div className="mt-3">
                    <SectionLabel>Why it matters</SectionLabel>
                    <p className="text-[12px] leading-[1.45] text-[hsl(var(--text-2))]">{whyItMatters}</p>
                </div>
            )}

            {/* How to interpret (Tier 3 — decision-grade only) */}
            {hasInterp && (
                <div className="mt-3">
                    <SectionLabel>How to interpret</SectionLabel>
                    <div className="space-y-1">
                        {interpretation.map((line, i) => (
                            <div key={i} className="flex gap-2 text-[12px] leading-[1.4] text-[hsl(var(--text-2))]">
                                <span className="text-[hsl(var(--accent-secondary))] font-semibold leading-[1.4]">·</span>
                                <span>{line}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

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
            <TooltipContent side={side} className="whitespace-normal">
                <GlossaryCard entry={g} />
            </TooltipContent>
        </Tooltip>
    );
}
