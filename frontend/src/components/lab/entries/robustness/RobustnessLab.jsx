import React, { useMemo } from "react";
import { NeonPanel }            from "@/components/lab/NeonPanel";
import { Pill }                 from "@/components/lab/DataTable";
import { cn }                   from "@/lib/utils";
import { RollingMetricsPanel }  from "./RollingMetricsPanel";
import { ConfidencePanel }      from "./ConfidencePanel";
import {
    buildRollingMetrics,
    buildMonthlyStability,
    buildHalfSplitConsistency,
    buildOutlierDependency,
    calcRobustnessScore,
} from "../analytics/robustnessAnalytics";
import { isFiniteNumber, num } from "../analytics/entryFormatters";

const ROLLING_WINDOW = 20;

function resolveModelTrades(mode, tradesByMode, activeVariant) {
    if (!tradesByMode || !mode) return null;
    const modeKey = String(mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return tradesByMode[`${activeVariant}__${modeKey}`] || tradesByMode[modeKey] || null;
}

export function RobustnessLab({
    exactRows,
    rawTrades,
    tradesByMode,
    activeRun,
    activeVariant,
    selectedModelKey,
    setSelectedModelKey,
}) {
    const nonBaselineRows = (exactRows || []).filter(r => r.exact && !r.isBaseline);
    const selected = selectedModelKey || nonBaselineRows[0]?.mode || null;
    const selectedRow = (exactRows || []).find(r => r.mode === selected);

    const modeTrades = useMemo(() => resolveModelTrades(selected, tradesByMode, activeVariant), [selected, tradesByMode, activeVariant]);

    const rollingData = useMemo(() => {
        if (!modeTrades?.length) return null;
        return buildRollingMetrics(modeTrades, ROLLING_WINDOW);
    }, [modeTrades]);

    const halfSplitData = useMemo(() => {
        if (!nonBaselineRows.length || !tradesByMode) return [];
        return nonBaselineRows.map(row => {
            const trades = resolveModelTrades(row.mode, tradesByMode, activeVariant);
            if (!trades?.length) return null;
            const hs = buildHalfSplitConsistency(trades);
            if (!hs) return null;
            return {
                mode:          row.mode,
                label:         row.label,
                firstHalfExp:  hs.first.expectancy,
                secondHalfExp: hs.last.expectancy,
                stable:        hs.stable,
                wrDelta:       hs.wrDelta,
            };
        }).filter(Boolean);
    }, [nonBaselineRows, tradesByMode, activeVariant]);

    const robustnessScores = useMemo(() => {
        if (!nonBaselineRows.length || !tradesByMode) return [];
        return nonBaselineRows.map(row => {
            const trades = resolveModelTrades(row.mode, tradesByMode, activeVariant);
            const outlier = trades?.length ? buildOutlierDependency(trades) : null;
            const score = calcRobustnessScore(row, outlier);
            return { mode: row.mode, label: row.label, score };
        });
    }, [nonBaselineRows, tradesByMode, activeVariant]);

    return (
        <div className="space-y-4">

            {/* Header / model selector */}
            <NeonPanel title="Robustness Lab" className="xl:col-span-3"
                action={
                    <div className="flex gap-1.5">
                        <Pill tone="secondary">{nonBaselineRows.length} MODELS</Pill>
                        {robustnessScores.length > 0 && (() => {
                            const best = Math.max(...robustnessScores.map(r => r.score));
                            return <Pill tone={best >= 70 ? "success" : best >= 45 ? "warning" : "danger"}>BEST {best}/100</Pill>;
                        })()}
                    </div>
                }
            >
                <p className="mb-3 text-[10px] font-mono text-muted-lab">
                    Validate that results hold up across time, aren't driven by outliers, and are consistent between in-sample halves.
                    Select a model below to inspect rolling metrics.
                </p>

                {nonBaselineRows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">Rolling view:</span>
                        {nonBaselineRows.map(row => (
                            <button key={row.mode} type="button"
                                onClick={() => setSelectedModelKey(row.mode)}
                                className={cn(
                                    "px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-wider border rounded-[1px] transition-colors",
                                    selected === row.mode
                                        ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.1)] text-white"
                                        : "border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white"
                                )}
                            >
                                {row.label}
                            </button>
                        ))}
                    </div>
                )}
            </NeonPanel>

            {/* Rolling metrics chart */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <RollingMetricsPanel
                    rollingData={rollingData}
                    modelLabel={selectedRow?.label}
                    window={ROLLING_WINDOW}
                />

                {/* Monthly stability panel inline */}
                {modeTrades?.length > 0 && (() => {
                    const monthly = buildMonthlyStabilityRows(modeTrades);
                    return (
                        <NeonPanel title="Monthly Stability" className="xl:col-span-1"
                            action={<Pill tone="secondary">{monthly.length} MONTHS</Pill>}
                        >
                            <p className="mb-2 text-[9.5px] font-mono text-muted-lab">Month-by-month expectancy. Consistent positive months = stable edge.</p>
                            {monthly.length > 0 ? (
                                <div className="overflow-y-auto max-h-[220px] scrollbar-thin">
                                    <table className="w-full font-mono text-[10px]">
                                        <thead>
                                            <tr>
                                                {["Month", "Trades", "WR", "Expectancy", "Net R"].map(h => (
                                                    <th key={h} className="text-left text-[8.5px] uppercase tracking-wider text-muted-lab px-2 py-1">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {monthly.map(m => (
                                                <tr key={m.month} className="border-t border-[hsl(var(--border-soft)/0.2)]">
                                                    <td className="px-2 py-1 text-[hsl(var(--text-2))]">{m.month}</td>
                                                    <td className="px-2 py-1 tabular-nums text-white">{m.count}</td>
                                                    <td className="px-2 py-1 tabular-nums text-white">{m.winRate.toFixed(0)}%</td>
                                                    <td className={cn("px-2 py-1 tabular-nums", m.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                                        {m.expectancy >= 0 ? "+" : ""}{m.expectancy.toFixed(3)}R
                                                    </td>
                                                    <td className={cn("px-2 py-1 tabular-nums", m.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                                        {m.netR >= 0 ? "+" : ""}{m.netR.toFixed(1)}R
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-4 text-[10px] font-mono text-muted-lab">No monthly data (check trade entry timestamps).</div>
                            )}
                        </NeonPanel>
                    );
                })()}
            </div>

            {/* Confidence / sample adequacy panels */}
            <ConfidencePanel
                exactRows={exactRows || []}
                halfSplitData={halfSplitData}
                robustnessScores={robustnessScores}
            />

        </div>
    );
}

// Helper: thin wrapper so JSX inline calls are clear
function buildMonthlyStabilityRows(trades) {
    return buildMonthlyStability(trades);
}
