// ── ModelKPIStrip.jsx ────────────────────────────────────────────────────────
// KPI chip row shown above the results table for the selected model.
//
// V2 CHANGES (Phase 1):
//   - Family type branching now uses row.metricsProfile (from registry) instead
//     of String(row.mode).startsWith("entry_triggered_edge"). This correctly
//     handles any future lifecycle family added to the registry.
//   - Fill Rate chip is suppressed for baseline (metricsProfile "standard"):
//     baseline fill% is always 100% by definition and is not a useful metric.
//   - Fill Rate sub-label shows row.fillDescription from registry, making the
//     denominator visible inline to the analyst.
//   - Lifecycle-funnel chips (Trigger Rate, Fill/Trig, T→Fill, Same/Next) are
//     now gated on metricsProfile === "triggered_edge" and/or
//     row.requiresLifecycleFunnel, not a mode string.
//
// Phase 2 extension point: when FunnelPanel is added, the lifecycle chips here
// can link to it or be replaced by a summary badge that opens the funnel view.

import React from "react";
import { MetricChip } from "@/components/lab/MetricChip";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";
import { PROFILE_KEYS } from "../analytics/entryRegistry";

function kpiTone(val, neutral = 0, higherBetter = true) {
    if (!isFiniteNumber(val)) return "default";
    const n = num(val);
    if (higherBetter) {
        if (n > neutral + 0.01) return "success";
        if (n < neutral - 0.01) return "danger";
    } else {
        if (n < neutral - 0.01) return "success";
        if (n > neutral + 0.01) return "danger";
    }
    return "default";
}

function fmtExpectancy(v) {
    if (!isFiniteNumber(v)) return "—";
    const n = num(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(3)}R`;
}

function fmtNetR(v) {
    if (!isFiniteNumber(v)) return "—";
    const n = num(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

function fmtPF(v) {
    if (!isFiniteNumber(v)) return "—";
    return num(v).toFixed(2);
}

function fmtMinutes(v) {
    if (!isFiniteNumber(v)) return "—";
    const m = num(v);
    return m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`;
}

function fmtSameNext(same, next) {
    if (same == null && next == null) return "—";
    return `${same ?? "—"}/${next ?? "—"}`;
}

export function ModelKPIStrip({ exactRows, selectedModelKey, setSelectedModelKey }) {
    const baseline = exactRows.find(r => r.isBaseline);
    const selected = selectedModelKey
        ? exactRows.find(r => r.mode === selectedModelKey)
        : exactRows.find(r => !r.isBaseline && r.exact);

    const row    = selected || baseline;
    const isBase = row?.isBaseline;

    if (!row) return null;

    const baselineNetR = isFiniteNumber(baseline?.netR) ? num(baseline.netR) : 0;
    const delta        = isFiniteNumber(row.netR) ? num(row.netR) - baselineNetR : null;

    // Build sparkline from netR values across all models for context
    const sparkVals = exactRows.filter(r => r.exact && isFiniteNumber(r.netR)).map(r => num(r.netR));

    // ── Family type flags ─────────────────────────────────────────────────────
    // V2: use metricsProfile from registry — no string-matching on mode names.
    // Falls back to requiresLifecycleFunnel for any future lifecycle family.
    const profile         = row.metricsProfile;
    const isLifecycle     = profile === PROFILE_KEYS.TRIGGERED_EDGE || row.requiresLifecycleFunnel === true;
    const isBaselineModel = profile === PROFILE_KEYS.STANDARD && isBase;

    // Fill rate label: use fillDescription from registry row (set by PLANNED_ENTRY_MODES spread).
    // This makes the denominator visible to the analyst without needing tooltips.
    const fillLabel = row.fillDescription || "Fill Rate";

    return (
        <div className="kpi-strip mb-4">
            <MetricChip
                label="Net R"
                value={fmtNetR(row.netR)}
                tone={kpiTone(row.netR, 0, true)}
                sparkline={sparkVals.length > 1 ? sparkVals : undefined}
            />
            <MetricChip
                label="Expectancy"
                value={fmtExpectancy(row.expectancy)}
                tone={kpiTone(row.expectancy, 0, true)}
            />
            <MetricChip
                label="Win Rate"
                value={fmtMaybePct(row.winRate)}
                tone={kpiTone(row.winRate, 0.5, true)}
            />
            <MetricChip
                label="Profit Factor"
                value={fmtPF(row.profitFactor)}
                tone={kpiTone(row.profitFactor, 1, true)}
            />
            <MetricChip
                label="Max DD"
                value={fmtMaybeR(row.maxDD)}
                sub="R drawdown"
                tone={kpiTone(row.maxDD, -2, false)}
            />

            {/* Fill Rate chip — suppressed for baseline (always 100%, meaningless).
                For all other families, show with denominator description as sub-label
                so the analyst always knows what fill% represents for this model. */}
            {!isBaselineModel && (
                <MetricChip
                    label="Fill Rate"
                    value={fmtMaybePct(row.fillPct)}
                    sub={isLifecycle ? "end-to-end" : "reach rate"}
                    tone="default"
                />
            )}

            {/* Delta vs Baseline — shown for all non-baseline models. */}
            {!isBase && isFiniteNumber(delta) && (
                <MetricChip
                    label="Δ vs Baseline"
                    value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}R`}
                    tone={delta >= 0 ? "success" : "danger"}
                />
            )}
            {isFiniteNumber(row.avgMAE) && (
                <MetricChip
                    label="Avg MAE"
                    value={fmtMaybeR(row.avgMAE)}
                    tone={kpiTone(row.avgMAE, -0.5, false)}
                />
            )}
            {isFiniteNumber(row.avgMFE) && (
                <MetricChip
                    label="Avg MFE"
                    value={fmtMaybeR(row.avgMFE)}
                    tone={kpiTone(row.avgMFE, 0.5, true)}
                />
            )}
            {isFiniteNumber(row.trades) && (
                <MetricChip
                    label="Trades"
                    value={String(row.trades)}
                    tone="default"
                />
            )}

            {/* ── Lifecycle / funnel chips ──────────────────────────────────────
                Gated on metricsProfile === "triggered_edge" OR requiresLifecycleFunnel.
                NOT a mode string check — any future lifecycle family gets these automatically
                if its registry entry has requiresLifecycleFunnel: true.
                Phase 2 extension: replace these with a "View Funnel →" badge that
                opens the dedicated FunnelPanel tab. */}
            {isLifecycle && (
                <>
                    <MetricChip
                        label="Trigger Rate"
                        value={fmtMaybePct(row.triggerRate)}
                        sub="setups triggered"
                        tone={kpiTone(row.triggerRate, 50, true)}
                    />
                    <MetricChip
                        label="Fill / Trig"
                        value={fmtMaybePct(row.fillAfterTriggerRate)}
                        sub="fills after trigger"
                        tone={kpiTone(row.fillAfterTriggerRate, 50, true)}
                    />
                    {isFiniteNumber(row.avgTriggerToEntry) && (
                        <MetricChip
                            label="Avg T→Fill"
                            value={fmtMinutes(row.avgTriggerToEntry)}
                            sub="trigger to entry"
                            tone="default"
                        />
                    )}
                    {(row.sameCandleCount != null || row.nextCandleCount != null) && (
                        <MetricChip
                            label="Same / Next"
                            value={fmtSameNext(row.sameCandleCount, row.nextCandleCount)}
                            sub="fills by candle"
                            tone="default"
                        />
                    )}
                </>
            )}
        </div>
    );
}
