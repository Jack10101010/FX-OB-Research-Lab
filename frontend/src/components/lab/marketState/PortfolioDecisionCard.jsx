// ── PortfolioDecisionCard.jsx ──────────────────────────────────────────────
// PRESENTATION ONLY. Renders the Portfolio Manager decision for a single trade,
// derived by data/portfolioDecision.js from the portfolio_* columns the backend
// stamps when a deployed policy is active. No math, no execution, no mutation.
//
// Hidden entirely when the trade carries no portfolio decision (returns null), so
// runs without a deployed policy look exactly as before.

import React from "react";
import { portfolioDecisionForTrade } from "@/data/portfolioDecision";

const TONE_VAR = {
    danger: "--danger",
    warning: "--warning",
    success: "--success",
    muted: "--border-mid",
};

function Row({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-lab">{label}</span>
            <span className="text-right text-white font-num text-[11px]">{value}</span>
        </div>
    );
}

export function PortfolioDecisionCard({ trade, title = "Portfolio Manager" }) {
    const d = portfolioDecisionForTrade(trade);
    if (!d) return null;                       // no policy data → render nothing

    const toneVar = TONE_VAR[d.tone] || TONE_VAR.muted;

    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-title-lab">{title}</span>
                <span
                    className="text-[10.5px] font-num px-1.5 py-0.5 clip-bevel-sm border"
                    style={{ color: `hsl(var(${toneVar}))`, borderColor: `hsl(var(${toneVar}))` }}
                >
                    {d.policy}
                </span>
            </div>

            {/* Headline — obvious for blocked/disabled trades */}
            <div
                className="mb-2 text-[11.5px] font-ui"
                style={{ color: `hsl(var(${toneVar}))` }}
            >
                {d.headline}
            </div>

            <div className="space-y-1">
                <Row label="Reason" value={d.reasonLabel} />
                <Row label="Policy" value={d.policyLabel} />
                <Row label="Status" value={d.status} />
                {d.confidence ? <Row label="Confidence" value={d.confidence} /> : null}
                {d.cohortKey ? <Row label="Cohort" value={d.cohortKey} /> : null}
                {d.version ? <Row label="Policy version" value={d.version} /> : null}
            </div>
        </div>
    );
}

export default PortfolioDecisionCard;
