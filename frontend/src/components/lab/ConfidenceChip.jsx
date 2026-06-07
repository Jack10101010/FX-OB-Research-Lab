/**
 * ConfidenceChip.jsx
 *
 * Small pill that renders a confidence level (Very Low / Low / Medium / High) with a
 * tone and a glossary tooltip explaining what the level means. Used by the Research
 * Signals layer (Classification Tab V2 Phase 2).
 *
 * - Tone is driven by level (no hardcoded colors beyond the Pill tone tokens).
 * - Tooltip copy comes from researchGlossary (`confidence_<level>` keys) — single
 *   source of truth; renders without a tooltip if the key is somehow missing.
 *
 * Requires a `TooltipProvider` ancestor (the Classification panel wraps one). The
 * trigger is a focusable span wrapping the Pill, so it works on hover AND keyboard
 * focus and avoids ref issues with function-component children.
 *
 * Not wired into any view yet — additive UI foundation.
 */

import * as React from "react";
import { Pill } from "@/components/lab/DataTable";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getGlossary } from "@/data/researchGlossary";
import { cn } from "@/lib/utils";

// level → { Pill tone, glossary key }
const LEVEL_META = {
    "High":     { tone: "success",   key: "confidence_high" },
    "Medium":   { tone: "secondary", key: "confidence_medium" },
    "Low":      { tone: "warning",   key: "confidence_low" },
    "Very Low": { tone: "muted",     key: "confidence_very_low" },
};

/**
 * @param {{ level?: string, className?: string, side?: "top"|"right"|"bottom"|"left" }} props
 */
export function ConfidenceChip({ level, className, side = "top" }) {
    const meta = LEVEL_META[level] || LEVEL_META["Very Low"];
    const label = LEVEL_META[level] ? level : "Very Low";
    const g = getGlossary(meta.key);

    const pill = (
        <span tabIndex={0} className={cn("inline-flex cursor-help outline-none", className)}>
            <Pill tone={meta.tone}>{label}</Pill>
        </span>
    );

    if (!g) return pill;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{pill}</TooltipTrigger>
            <TooltipContent side={side} className="max-w-xs whitespace-normal leading-snug">
                <div className="font-semibold text-[11px] mb-0.5">{g.friendlyName}</div>
                <div className="text-[10.5px] opacity-90 mb-1">{g.definition}</div>
                <div className="text-[10px] italic opacity-75">Why it matters: {g.whyItMatters}</div>
            </TooltipContent>
        </Tooltip>
    );
}
