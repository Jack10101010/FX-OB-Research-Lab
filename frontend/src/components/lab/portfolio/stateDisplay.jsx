// stateDisplay.jsx — shared presentation for market-state columns and effective PM
// chips (SB-V2 UX polish). PURE PRESENTATION: no policy logic, no writes.
//
//  • StateHeader: "↑ Expand" (green arrow) / "↓ Expand" (red arrow) instead of the old
//    cryptic "B/Exp / Be/Com" abbreviations. Full state name stays in the tooltip.
//  • effectivePolicyDisplay: what a PM action EFFECTIVELY is for this run — e.g. a
//    DISABLE cohort under the include-disabled research override is effectively Label,
//    so the chip must not stay red "NEVER TRADE" (visually contradictory).

import React from "react";
import { POLICY_LABELS, POLICY_TONE, POLICY_TOOLTIPS } from "@/data/portfolioLabels";

// canonical state → { arrow, tone, word }
export const STATE_DISPLAY = {
    "Bull/Expand":   { arrow: "↑", tone: "success", word: "Expand" },
    "Bull/Compress": { arrow: "↑", tone: "success", word: "Compress" },
    "Bull/Chop":     { arrow: "↑", tone: "success", word: "Chop" },
    "Bear/Expand":   { arrow: "↓", tone: "danger",  word: "Expand" },
    "Bear/Compress": { arrow: "↓", tone: "danger",  word: "Compress" },
    "Bear/Chop":     { arrow: "↓", tone: "danger",  word: "Chop" },
};

export function StateHeader({ state }) {
    const d = STATE_DISPLAY[state];
    if (!d) return <span>{state}</span>;
    return (
        <span title={state} className="whitespace-nowrap">
            <span style={{ color: `hsl(var(--${d.tone}))` }}>{d.arrow}</span> {d.word}
        </span>
    );
}

/**
 * Effective PM display for a cohort action under the CURRENT run flags.
 * Chip colour always reflects the effective state (never a contradictory red
 * "NEVER TRADE" on a cohort that will actually trade this run).
 */
export function effectivePolicyDisplay(action, { includeDisabled = false } = {}) {
    if (!action) return null;
    if (action === "DISABLE" && includeDisabled) {
        return {
            label: "Never Trade → Label",
            tone: "warning",
            title: "Deployed policy says NEVER TRADE, but the include-disabled research override treats this cohort as Always Allow (Label) for THIS RUN ONLY. The deployed policy file is not modified.",
            overridden: true,
        };
    }
    return {
        label: POLICY_LABELS[action] || action,
        tone: POLICY_TONE[action] || "text-2",
        title: POLICY_TOOLTIPS[action] || action,
        overridden: false,
    };
}

export function PolicyChip({ action, includeDisabled = false, className = "" }) {
    const d = effectivePolicyDisplay(action, { includeDisabled });
    if (!d) return <span className="text-[hsl(var(--text-3))]">—</span>;
    return (
        <span title={d.title}
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui whitespace-nowrap ${className}`}
            style={{ borderColor: `hsl(var(--${d.tone}))`, color: `hsl(var(--${d.tone}))` }}>
            {d.label}
        </span>
    );
}


/**
 * The three-layer answer for one cohort — SAME language in Eligibility and Targets so
 * the tabs can never contradict each other:
 *   pm        — the deployed PM decision (what the policy says)
 *   scenario  — what the scenario overrides say (allow / disable / rescues)
 *   effective — what actually happens THIS RUN given pmMode + include-disabled
 * Pure presentation: mirrors the engine order (PM gate first, then scenario
 * eligibility) without re-implementing it — no writes, no policy edits.
 */
export function resolveCohortEligibility({
    pmAction = null, pmMode = "off", includeDisabled = false,
    scenarioBase = null, rescuedCount = 0, blockedCount = 0,
} = {}) {
    const pmDisplay = effectivePolicyDisplay(pmAction, { includeDisabled: includeDisabled && pmMode === "enforce" });
    const pmEnforcedDisable = pmMode === "enforce" && pmAction === "DISABLE" && !includeDisabled;
    const scenarioLabel = scenarioBase == null ? null
        : scenarioBase === "allow"
            ? (blockedCount ? `ALLOW · ${blockedCount} STATE BLOCK${blockedCount === 1 ? "" : "S"}` : "ALLOW")
            : (rescuedCount ? `DISABLED · ${rescuedCount} RESCUED` : "DISABLED");
    let effective, warning = null;
    if (pmEnforcedDisable) {
        effective = { label: "PM BLOCKS", tone: "danger" };
        if (scenarioBase === "allow" || rescuedCount > 0) {
            warning = "PM ENFORCE still blocks this cohort — the scenario allow/rescue cannot execute. Use PM Off/Label or the include-disabled research override.";
        }
    } else if (scenarioBase === "disable" && rescuedCount > 0) {
        effective = { label: `RESCUED (${rescuedCount} state${rescuedCount === 1 ? "" : "s"})`, tone: "success" };
    } else if (scenarioBase === "disable") {
        effective = { label: "DISABLED", tone: "danger" };
    } else if (pmAction === "DISABLE" && !pmEnforcedDisable && pmMode !== "off") {
        // PM says never-trade but this run doesn't enforce it (label / override).
        effective = { label: includeDisabled && pmMode === "enforce" ? "ENABLED (OVERRIDE)" : "ENABLED (PM NOT ENFORCED)", tone: "warning" };
    } else {
        effective = { label: "ENABLED", tone: "success" };
    }
    return {
        pm: pmAction ? { label: pmDisplay.label, tone: pmDisplay.tone, title: pmDisplay.title, dimmed: !pmEnforcedDisable && pmAction === "DISABLE" } : null,
        scenario: scenarioLabel,
        effective,
        warning,
    };
}

/** Compact two-line PM + effective cell used by the policy tables. */
export function ResolvedEligibilityCell({ resolved }) {
    if (!resolved) return <span className="text-[hsl(var(--text-3))]">—</span>;
    return (
        <div className="flex flex-col gap-0.5">
            {resolved.pm && (
                <span title={`Deployed PM decision — ${resolved.pm.title}`}
                    className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[9.5px] font-ui whitespace-nowrap ${resolved.pm.dimmed ? "opacity-55" : ""}`}
                    style={{ borderColor: `hsl(var(--${resolved.pm.tone}))`, color: `hsl(var(--${resolved.pm.tone}))` }}>
                    PM: {resolved.pm.label}
                </span>
            )}
            <span title={resolved.warning || (resolved.scenario ? `Scenario: ${resolved.scenario}` : "Effective for this run")}
                className="inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[9.5px] font-ui whitespace-nowrap"
                style={{ borderColor: `hsl(var(--${resolved.effective.tone}))`, color: `hsl(var(--${resolved.effective.tone}))` }}>
                {resolved.effective.label}
            </span>
            {resolved.warning && (
                <span className="text-[8.5px] font-ui text-[hsl(var(--warning))]" title={resolved.warning}>⚠ PM still blocks</span>
            )}
        </div>
    );
}
