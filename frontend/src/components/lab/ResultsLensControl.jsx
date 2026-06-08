/**
 * ResultsLensControl — the global Results Basis control (Phase RB-2).
 *
 *   Trade Universe  → "which trades?"   (TradeUniverseBadge / ScenarioSelector)
 *   Results Basis   → "how measured?"   (THIS control)
 *
 * Selecting a basis writes to the global store (via useResultsLens → store
 * setters). It is intentionally INERT for analytics: no page recalculates from
 * this yet. The caveat below makes that explicit to the user.
 *
 * Design language matches Segment / TradeUniverseBadge (clip-bevel, mono
 * labels, accent-primary active state).
 *
 * Props
 *   showAccount {boolean}  (default true) render the shared AccountSettingsPanel
 *                          when Current Equity is selected.
 *   compact     {boolean}  (default false) tighter layout for headers/strips.
 *   className   {string}   extra wrapper classes.
 */

import React from "react";
import { Segment, HeroBadge } from "@/components/lab/controls";
import { AccountSettingsPanel } from "@/components/lab/account/AccountSettingsPanel";
import { useResultsLens } from "@/data/useResultsLens";
import { TermTip } from "@/components/lab/TermTip";

const BASIS_OPTIONS = [
    { value: "raw_r", label: "Raw R" },
    { value: "current_equity", label: "Current Equity" },
];

export function ResultsLensControl({ showAccount = true, compact = false, className = "" }) {
    const lens = useResultsLens();

    return (
        <div className={`flex flex-col gap-3 ${className}`.trim()}>
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">
                    <TermTip termKey="results_basis">Results Basis</TermTip>
                </span>
                <Segment
                    testId="results-basis"
                    options={BASIS_OPTIONS}
                    value={lens.basis}
                    onChange={lens.setBasis}
                />
                <HeroBadge tone={lens.isCurrentEquity ? "secondary" : "muted"}>
                    {lens.basisDescription}
                </HeroBadge>
            </div>

            {lens.isCurrentEquity && (
                <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                    <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                        Current Equity is enabled globally, but analytics pages will adopt it gradually.
                        Existing metrics still display in Raw R until each page is migrated.
                    </span>
                </div>
            )}

            {!compact && showAccount && lens.isCurrentEquity && (
                <div className="mt-1 border-t border-[hsl(var(--border-soft))] pt-3">
                    <div className="mb-2 text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">
                        Account Model
                    </div>
                    <AccountSettingsPanel />
                </div>
            )}
        </div>
    );
}

export default ResultsLensControl;
