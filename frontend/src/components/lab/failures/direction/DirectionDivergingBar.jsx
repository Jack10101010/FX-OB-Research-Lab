// ── DirectionDivergingBar.jsx ─────────────────────────────────────────────────
// Phase 3: Diverging bar chart comparing Long vs Short across key metrics.
// Long bars extend right (green), Short bars extend left (red).
// Metrics: Loss Rate, Avg Loss R, Expectancy, CVaR.

import React, { useMemo } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from "recharts";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { computeDirectionalStats } from "../shared/failuresAnalytics";

// ── Tooltip ───────────────────────────────────────────────────────────────────

const TT_STYLE = {
    background: "hsl(var(--panel-2))",
    border: "1px solid hsl(var(--border-soft))",
    borderRadius: 2,
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 10,
    padding: "6px 10px",
};

function DivTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={TT_STYLE}>
            <div className="text-white font-semibold mb-1">{label}</div>
            {payload.map(p => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                    <span className="text-muted-lab capitalize">{p.dataKey}:</span>
                    <span className="text-white">{Math.abs(Number(p.value)).toFixed(p.dataKey === "shortVal" ? 1 : 1)}{p.unit ?? ""}</span>
                </div>
            ))}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DirectionDivergingBar({ allTrades = [] }) {
    const dirStats = useMemo(() => computeDirectionalStats(allTrades), [allTrades]);
    const { long: l, short: s } = dirStats;

    if (!l && !s) return null;

    // Build rows: positive = long (green), negative = short (red)
    // We mirror short values to negative for diverging effect
    const rows = [
        {
            metric: "Loss Rate",
            unit: "%",
            longVal:  l?.lossRate  ?? 0,
            shortVal: s?.lossRate  != null ? -s.lossRate : 0,
            longRaw:  `${l?.lossRate ?? "—"}%`,
            shortRaw: `${s?.lossRate ?? "—"}%`,
        },
        {
            metric: "Avg Loss",
            unit: "R",
            longVal:  l?.avgLossR  != null ? -l.avgLossR : 0,  // negative = bad
            shortVal: s?.avgLossR  != null ? s.avgLossR  : 0,   // mirrored positive
            longRaw:  `${l?.avgLossR ?? "—"}R`,
            shortRaw: `${s?.avgLossR ?? "—"}R`,
            flip: true, // both negatives for loss magnitude
        },
        {
            metric: "Expectancy",
            unit: "R",
            longVal:  l?.expectancy ?? 0,
            shortVal: s?.expectancy != null ? -s.expectancy : 0,
            longRaw:  `${l?.expectancy ?? "—"}R`,
            shortRaw: `${s?.expectancy ?? "—"}R`,
        },
        {
            metric: "CVaR",
            unit: "R",
            longVal:  l?.cvar != null ? -l.cvar : 0,   // negative magnitude
            shortVal: s?.cvar != null ?  s.cvar : 0,   // mirrored
            longRaw:  l?.cvar != null ? `${l.cvar}R` : "—",
            shortRaw: s?.cvar != null ? `${s.cvar}R` : "—",
            flip: true,
        },
    ];

    // Domain: max absolute value across all bars
    const maxAbs = Math.max(
        ...rows.flatMap(r => [Math.abs(r.longVal), Math.abs(r.shortVal)]),
        1,
    );
    const domain = [-maxAbs * 1.15, maxAbs * 1.15];

    return (
        <NeonPanel title="Long vs Short — Metric Comparison">
            <div className="p-4 space-y-3">
                <p className="text-[10px] font-mono text-[hsl(var(--text-2))] leading-relaxed">
                    Long bars extend right (green), Short bars extend left (red).
                    Longer bar = worse outcome for that direction on that metric.
                </p>

                {/* Diverging chart */}
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                        data={rows}
                        layout="vertical"
                        margin={{ top: 4, right: 48, left: 72, bottom: 4 }}
                        barCategoryGap="30%"
                    >
                        <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" horizontal={false} />
                        <XAxis
                            type="number"
                            domain={domain}
                            tickFormatter={v => `${Math.abs(v).toFixed(0)}`}
                            tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            type="category"
                            dataKey="metric"
                            tick={{ fill: "hsl(var(--text-2))", fontFamily: "JetBrains Mono", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={68}
                        />
                        <Tooltip content={<DivTooltip />} />
                        <ReferenceLine x={0} stroke="hsl(var(--border-mid))" strokeWidth={1} />

                        {/* Long bars — positive side, green */}
                        <Bar dataKey="longVal" fill="hsl(var(--success) / 0.6)" isAnimationActive={false} maxBarSize={18}>
                            <LabelList
                                dataKey="longRaw"
                                position="right"
                                style={{ fill: "hsl(var(--text-2))", fontFamily: "JetBrains Mono", fontSize: 9 }}
                            />
                        </Bar>

                        {/* Short bars — negative side, red */}
                        <Bar dataKey="shortVal" fill="hsl(var(--danger) / 0.6)" isAnimationActive={false} maxBarSize={18}>
                            <LabelList
                                dataKey="shortRaw"
                                position="left"
                                style={{ fill: "hsl(var(--text-2))", fontFamily: "JetBrains Mono", fontSize: 9 }}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3" style={{ background: "hsl(var(--success) / 0.6)" }} />
                        <span className="text-[9.5px] font-mono text-muted-lab">Long ({l?.count ?? 0} trades)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3" style={{ background: "hsl(var(--danger) / 0.6)" }} />
                        <span className="text-[9.5px] font-mono text-muted-lab">Short ({s?.count ?? 0} trades)</span>
                    </div>
                    <span className="text-[9px] font-mono text-muted-lab ml-auto">
                        Note: Avg Loss and CVaR display magnitude (higher = bigger loss)
                    </span>
                </div>
            </div>
        </NeonPanel>
    );
}
