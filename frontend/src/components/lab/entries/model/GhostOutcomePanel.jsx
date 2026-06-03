// Ghost Outcome Distribution Panel — Phase 0 observational data only.
// Renders only when ghost_candidate trades are present in the dataset.
// No cancellation logic lives here — this is pure read-out of ghost_outcome fields
// that the backtester emitted for observational purposes.

import React, { useMemo } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const OUTCOME_COLOR = {
    WIN:              "hsl(var(--success))",
    LOSS:             "hsl(var(--danger))",
    BE:               "hsl(var(--text-2))",
    BREAKEVEN:        "hsl(var(--text-2))",
    PROTECTION_EXIT:  "hsl(var(--warning))",
    UNFILLED:         "hsl(var(--border-soft))",
    NEVER_TRIGGERED:  "hsl(var(--border-soft))",
    INVALIDATED:      "hsl(var(--text-2)/0.4)",
};

function fmtR(v) {
    if (v == null) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

function fmtLabel(outcome) {
    return {
        WIN: "Win",
        LOSS: "Loss",
        BE: "BE",
        BREAKEVEN: "BE",
        PROTECTION_EXIT: "Prot.",
        UNFILLED: "Unfilled",
        NEVER_TRIGGERED: "No Trigger",
        INVALIDATED: "Invalid",
    }[outcome] || outcome || "Unknown";
}

export function GhostOutcomePanel({ trades = [] }) {
    const ghostData = useMemo(() => {
        const candidates = (trades || []).filter(t => t?.ghost_candidate === true);
        if (!candidates.length) return null;

        // Outcome distribution
        const outcomeMap = {};
        let netR = 0;
        let filledCount = 0;
        const fillDelays = [];
        const sessionCounts = {};

        candidates.forEach(t => {
            const outcome = String(t.ghost_outcome || "UNKNOWN").toUpperCase();
            outcomeMap[outcome] = (outcomeMap[outcome] || 0) + 1;
            if (t.ghost_r != null) {
                netR += t.ghost_r;
                filledCount++;
            }
            if (t.ghost_fill_delay_candles != null) {
                fillDelays.push(t.ghost_fill_delay_candles);
            }
            if (t.ghost_fill_session) {
                const s = t.ghost_fill_session;
                sessionCounts[s] = (sessionCounts[s] || 0) + 1;
            }
        });

        const outcomeRows = Object.entries(outcomeMap)
            .map(([outcome, count]) => ({ outcome, count, label: fmtLabel(outcome), color: OUTCOME_COLOR[outcome] || "hsl(var(--text-2))" }))
            .sort((a, b) => b.count - a.count);

        const avgFillDelay = fillDelays.length
            ? fillDelays.reduce((s, v) => s + v, 0) / fillDelays.length
            : null;

        const topSession = Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        return {
            total: candidates.length,
            outcomeRows,
            netR,
            filledCount,
            avgFillDelay,
            topSession,
        };
    }, [trades]);

    if (!ghostData) return null;

    const { total, outcomeRows, netR, filledCount, avgFillDelay, topSession } = ghostData;

    return (
        <div className="xl:col-span-1 bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft)/0.35)] p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-[9px] font-ui uppercase tracking-[0.2em] text-muted-lab opacity-60 mb-0.5">
                        Ghost Outcomes
                    </div>
                    <div className="text-[10px] text-[hsl(var(--text-2))]">
                        {total} ghost candidate{total !== 1 ? "s" : ""} · observational
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[11px] font-mono font-semibold" style={{ color: netR >= 0 ? "hsl(var(--success))" : "hsl(var(--danger))" }}>
                        {fmtR(netR)}
                    </div>
                    <div className="text-[8.5px] text-muted-lab opacity-50">ghost net R</div>
                </div>
            </div>

            {/* Outcome distribution bar chart */}
            <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={outcomeRows} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 8, fill: "hsl(var(--text-2))", fontFamily: "var(--font-ui)" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 8, fill: "hsl(var(--text-2))", fontFamily: "var(--font-ui)" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                background: "hsl(var(--panel-2))",
                                border: "1px solid hsl(var(--border-soft)/0.4)",
                                borderRadius: 0,
                                fontSize: 10,
                                fontFamily: "var(--font-ui)",
                                color: "hsl(var(--text))",
                            }}
                            formatter={(value, name, { payload }) => [`${value} trade${value !== 1 ? "s" : ""}`, payload.outcome]}
                        />
                        <Bar dataKey="count" radius={0}>
                            {outcomeRows.map((entry, i) => (
                                <Cell key={i} fill={entry.color} fillOpacity={0.75} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Summary chips */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[hsl(var(--border-soft)/0.2)]">
                <div className="text-center">
                    <div className="text-[10px] font-mono text-[hsl(var(--text))]">{filledCount}</div>
                    <div className="text-[8px] text-muted-lab opacity-50">filled</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] font-mono text-[hsl(var(--text))]">
                        {avgFillDelay != null ? `${avgFillDelay.toFixed(1)}` : "—"}
                    </div>
                    <div className="text-[8px] text-muted-lab opacity-50">avg fill delay (candles)</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] font-mono text-[hsl(var(--text))]">
                        {topSession || "—"}
                    </div>
                    <div className="text-[8px] text-muted-lab opacity-50">top fill session</div>
                </div>
            </div>
        </div>
    );
}
