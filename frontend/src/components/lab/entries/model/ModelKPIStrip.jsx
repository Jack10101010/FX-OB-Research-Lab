import React from "react";
import { MetricChip } from "@/components/lab/MetricChip";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";

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

export function ModelKPIStrip({ exactRows, selectedModelKey, setSelectedModelKey }) {
    const baseline = exactRows.find(r => r.isBaseline);
    const selected = selectedModelKey
        ? exactRows.find(r => r.mode === selectedModelKey)
        : exactRows.find(r => !r.isBaseline && r.exact);

    const row     = selected || baseline;
    const isBase  = row?.isBaseline;

    if (!row) return null;

    const baselineNetR = isFiniteNumber(baseline?.netR) ? num(baseline.netR) : 0;
    const delta        = isFiniteNumber(row.netR) ? num(row.netR) - baselineNetR : null;

    // Build sparkline from netR values across all models for context
    const sparkVals = exactRows.filter(r => r.exact && isFiniteNumber(r.netR)).map(r => num(r.netR));

    return (
        <div className="flex flex-wrap gap-2 mb-4">
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
            <MetricChip
                label="Fill Rate"
                value={fmtMaybePct(row.fillPct)}
                tone="default"
            />
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
        </div>
    );
}
