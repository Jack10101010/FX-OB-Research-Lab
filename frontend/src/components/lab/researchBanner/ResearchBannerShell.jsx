/**
 * ResearchBannerShell — the wide bordered premium banner container, extracted
 * VERBATIM from ResearchRunHeader (RESEARCH-RESULT-VIEW-BANNER Phase 1).
 *
 * Pure presentational, no behavior. Renders the two-column grid (left controls /
 * summary + right Current Result View panel) inside a bevelled bordered surface
 * whose border/background tone reflects the selected view's state. Shared by the
 * interactive ResearchRunHeader (RunDetail) and — later — the read-only
 * ResearchResultViewBanner, so the premium styling lives in exactly one place.
 *
 * tone:
 *   "active"  → a scenario is selected and has trades        (accent-primary)
 *   "warning" → a scenario is selected but is unavailable     (warning)
 *   "neutral" → baseline reference / no scenario              (border-soft)
 */

import React from "react";

const TONE_CLASS = {
    active:  "border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.05)]",
    warning: "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.05)]",
    neutral: "border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.2)]",
};

export function ResearchBannerShell({ tone = "neutral", left = null, right = null, children = null }) {
    return (
        <div className={[
            "clip-bevel-sm border mb-2 preview-surface",
            TONE_CLASS[tone] || TONE_CLASS.neutral,
        ].join(" ")}>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] divide-y xl:divide-y-0 xl:divide-x divide-[hsl(var(--border-soft)/0.3)]">
                {children ?? <>{left}{right}</>}
            </div>
        </div>
    );
}

export default ResearchBannerShell;
