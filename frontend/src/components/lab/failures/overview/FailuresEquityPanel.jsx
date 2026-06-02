// ── FailuresEquityPanel.jsx ──────────────────────────────────────────────────
// Phase 3: Equity curve with per-trade archetype dot overlay.
// Each trade is a dot; losers are coloured by failure archetype.
// Winners are rendered as small neutral dots to show trade density.

import React, { useMemo } from "react";
import {
    ComposedChart,
    Area,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { archetypeColour, archetypeLabel } from "../shared/failuresRegistry";
import { buildFailuresEquityCurveData } from "../shared/failuresAnalytics";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

// ── Archetype colour map ──────────────────────────────────────────────────────

const WIN_DOT_COLOR  = "hsl(var(--accent-primary) / 0.35)";
const BASE_LOSS_COLOR = "hsl(var(--danger) / 0.7)";

function dotColor(point) {
    if (!point.isLoss) return WIN_DOT_COLOR;
    const c = archetypeColour(point.archetype);
    return c || BASE_LOSS_COLOR;
}

// ── Custom dot renderer ───────────────────────────────────────────────────────

function ArchetypeDot(props) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const isLoss = payload?.isLoss;
    const r = isLoss ? 4 : 2.5;
    return (
        <circle
            key={`dot-${payload?.i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={dotColor(payload)}
            stroke={isLoss ? "hsl(var(--bg) / 0.6)" : "none"}
            strokeWidth={isLoss ? 0.8 : 0}
            opacity={isLoss ? 0.92 : 0.45}
        />
    );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

const TT_STYLE = {
    background: "hsl(var(--panel-2))",
    border: "1px solid hsl(var(--accent-primary) / 0.3)",
    borderRadius: 2,
    fontFamily: CHART_NUM_FONT,
    fontSize: 11,
    padding: "8px 10px",
};

function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const pt = payload[0]?.payload;
    if (!pt) return null;

    return (
        <div style={TT_STYLE}>
            <div className="text-[10px] text-muted-lab">Trade #{pt.i + 1}</div>
            <div className={`text-[13px] font-semibold ${pt.tradeR >= 0 ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--danger))]"}`}>
                {pt.tradeR >= 0 ? "+" : ""}{pt.tradeR}R
            </div>
            <div className="text-[10.5px] text-white mt-0.5">
                Net: {pt.netR >= 0 ? "+" : ""}{pt.netR}R
            </div>
            {pt.isLoss && (
                <>
                    <div className="text-[9.5px] text-muted-lab mt-1">
                        Archetype: <span style={{ color: archetypeColour(pt.archetype) }}>{archetypeLabel(pt.archetype)}</span>
                    </div>
                    {pt.severity != null && (
                        <div className="text-[9.5px] text-muted-lab">
                            Severity: {pt.severity.toFixed(1)}
                        </div>
                    )}
                </>
            )}
            {pt.session && (
                <div className="text-[9.5px] text-muted-lab">{pt.session} · {pt.direction}</div>
            )}
        </div>
    );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function ArchetypeLegend({ archetypesPresent }) {
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: WIN_DOT_COLOR, opacity: 0.8 }} />
                <span className="text-[9.5px] font-ui text-muted-lab">Win</span>
            </div>
            {archetypesPresent.map(id => (
                <div key={id} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: archetypeColour(id) }} />
                    <span className="text-[9.5px] font-ui text-muted-lab">{archetypeLabel(id)}</span>
                </div>
            ))}
        </div>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function FailuresEquityPanel({ allTrades = [] }) {
    const curveData = useMemo(
        () => buildFailuresEquityCurveData(allTrades),
        [allTrades],
    );

    // Unique archetypes present in the data (losers only)
    const archetypesPresent = useMemo(() => {
        const seen = new Set();
        for (const pt of curveData) {
            if (pt.isLoss) seen.add(pt.archetype);
        }
        return [...seen];
    }, [curveData]);

    // Y domain
    const yDomain = useMemo(() => {
        if (!curveData.length) return ["auto", "auto"];
        const vals = curveData.map(p => p.netR).filter(Number.isFinite);
        if (!vals.length) return ["auto", "auto"];
        const maxV = Math.max(...vals);
        const minV = Math.min(...vals);
        const range = Math.abs(maxV - minV) || 1;
        const pad = Math.max(range * 0.1, 0.5);
        return [Math.min(minV, 0) - pad, maxV + pad * 0.5];
    }, [curveData]);

    // X ticks at month boundaries
    const xTicks = useMemo(() => {
        const ticks = [];
        let lastLabel = null;
        for (const pt of curveData) {
            if (pt.label && pt.label !== lastLabel) {
                ticks.push(pt.i);
                lastLabel = pt.label;
            }
        }
        // Thin to ≤ 10
        if (ticks.length > 10) {
            const step = Math.ceil(ticks.length / 10);
            return ticks.filter((_, k) => k % step === 0);
        }
        return ticks;
    }, [curveData]);

    const labelMap = useMemo(() => {
        const m = {};
        for (const pt of curveData) {
            if (pt.label) m[pt.i] = pt.label;
        }
        return m;
    }, [curveData]);

    if (!curveData.length) return null;

    return (
        <NeonPanel title="Equity Curve — Archetype Overlay">
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={curveData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id="eq-failures-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(var(--accent-primary))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(var(--accent-primary))" stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />

                    <XAxis
                        dataKey="i"
                        type="number"
                        domain={[0, curveData.length - 1]}
                        ticks={xTicks}
                        tickFormatter={v => labelMap[v] ?? ""}
                        tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9.5 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        domain={yDomain}
                        tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9.5 }}
                        tickFormatter={v => `${v}R`}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                    />

                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 3" />

                    {/* Equity area */}
                    <Area
                        type="monotone"
                        dataKey="netR"
                        stroke="hsl(var(--accent-primary))"
                        strokeWidth={1.6}
                        fill="url(#eq-failures-grad)"
                        dot={<ArchetypeDot />}
                        activeDot={false}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>

            {/* Archetype colour legend */}
            <ArchetypeLegend archetypesPresent={archetypesPresent} />
        </NeonPanel>
    );
}
