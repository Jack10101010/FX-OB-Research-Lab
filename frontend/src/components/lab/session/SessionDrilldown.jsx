/**
 * SessionDrilldown — tabbed detail panel for a selected session.
 *
 * Tabs: Overview · Breakdowns · Time Analysis · Streaks
 *
 * Props:
 *   session       string   — session key
 *   metrics       object   — from computeSessionMetrics()
 *   sessionTrades object[] — direction-filtered trades for this session
 *   allTrades     object[] — all trades (for potential cross-session context)
 *   direction     "both"|"long"|"short"
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR } from "@/components/lab/DataTable";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import {
    buildSessionBreakdowns,
    buildSessionTimeProfile,
    buildSessionEquityCurve,
    isWin,
    isLoss,
    getR,
} from "./analytics/sessionAnalytics";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

// ── Shared metric row ─────────────────────────────────────────────────────────

function MetricGrid({ items }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {items.map(({ label, value, className }) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab leading-none">
                        {label}
                    </span>
                    <span className={cn("text-[15px] font-num tabular-nums font-semibold leading-tight", className || "text-[hsl(var(--text))]")}>
                        {value}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtR(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function fmtPct(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n.toFixed(1)}%`;
}

function fmtNum(v, decimals = 2) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return n.toFixed(decimals);
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ session, metrics, sessionTrades }) {
    const equityCurveData = useMemo(
        () => buildSessionEquityCurve(sessionTrades),
        [sessionTrades],
    );

    const equityForChart = useMemo(
        () => equityCurveData.map((d) => ({ ...d, label: String(d.i) })),
        [equityCurveData],
    );

    const { weekdayStats } = useMemo(
        () => buildSessionTimeProfile(sessionTrades),
        [sessionTrades],
    );

    const metricItems = [
        { label: "Net R",    value: fmtR(metrics.netR),
          className: metrics.netR > 0 ? "text-[hsl(var(--success))]" : metrics.netR < 0 ? "text-[hsl(var(--danger))]" : "text-muted-lab" },
        { label: "Win Rate", value: fmtPct(metrics.winRate) },
        { label: "Expectancy", value: fmtNum(metrics.expectancy, 3),
          className: metrics.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
        { label: "Profit Factor", value: fmtNum(metrics.profitFactor),
          className: metrics.profitFactor == null ? "text-muted-lab" : metrics.profitFactor >= 1.5 ? "text-[hsl(var(--success))]" : metrics.profitFactor < 1 ? "text-[hsl(var(--danger))]" : undefined },
        { label: "Max DD",   value: fmtR(metrics.maxDD), className: "text-[hsl(var(--danger))]" },
        { label: "Trades",   value: metrics.tradeCount },
        { label: "Streak",   value: metrics.longestStreak,
          className: metrics.longestStreak >= 5 ? "text-[hsl(var(--danger))]" : undefined },
        { label: "Avg → Stop", value: metrics.avgTimeToStopout != null ? `${metrics.avgTimeToStopout}m` : "—" },
        { label: "Avg → Target", value: metrics.avgTimeToTarget != null ? `${metrics.avgTimeToTarget}m` : "—" },
    ];

    const weekdayColumns = [
        { key: "label",   label: "Day",     align: "left",  sortable: false },
        { key: "count",   label: "N",       align: "right", sortable: true },
        { key: "wins",    label: "Wins",    align: "right", sortable: true },
        { key: "losses",  label: "Losses",  align: "right", sortable: true },
        { key: "winRate", label: "WR %",    align: "right", sortable: true,
          render: (r) => r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—" },
        { key: "netR",    label: "Net R",   align: "right", sortable: true,
          render: (r) => <ColoredR value={r.netR} /> },
    ];

    return (
        <div className="space-y-4">
            {/* Metric grid */}
            <NeonPanel>
                <MetricGrid items={metricItems} />
            </NeonPanel>

            {/* Equity curve */}
            {equityForChart.length > 1 && (
                <NeonPanel title="Cumulative R">
                    <EquityCurve data={equityForChart} height={200} showAxis />
                </NeonPanel>
            )}

            {/* Day of week */}
            {weekdayStats.length > 0 && (
                <NeonPanel title="Day of Week">
                    <DataTable
                        columns={weekdayColumns.map((c) => ({
                            ...c,
                            render: c.render || ((r) => r[c.key] ?? "—"),
                        }))}
                        rows={weekdayStats}
                        maxHeight={240}
                        defaultSortKey="netR"
                        defaultSortDir="desc"
                    />
                </NeonPanel>
            )}
        </div>
    );
}

// ── Breakdowns Tab ────────────────────────────────────────────────────────────

function BreakdownsTab({ sessionTrades, direction }) {
    const { defs, bucketsByKey } = useMemo(
        () => buildSessionBreakdowns(sessionTrades),
        [sessionTrades],
    );

    // Phase 1 priority order for display
    const PHASE1_ORDER = [
        "direction",
        "structure",
        "entryModel",
        "triggerDelay",
        "rTarget",
        "stopBuffer",
        "protection",
        "cancellation",
        "obOriginSession",
        "obDetectionSession",
    ];

    const defsToShow = PHASE1_ORDER
        .map((key) => defs.find((d) => d.key === key))
        .filter((d) => d && bucketsByKey[d.key]?.length > 0);

    if (defsToShow.length === 0) {
        return (
            <div className="text-[12px] font-ui text-muted-lab px-1 py-4">
                No breakdown data available for this session.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {defsToShow.map((def) => {
                const rows = bucketsByKey[def.key] || [];
                return (
                    <div key={def.key} className="flex flex-col gap-1">
                        <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">
                            {def.title}
                        </div>
                        <CanonicalBucketTable
                            rawRows={rows}
                            trades={sessionTrades}
                            def={{ labelFn: def.getLabel, order: def.order }}
                            bare
                            bareHeatmap
                            compact
                        />
                    </div>
                );
            })}
        </div>
    );
}

// ── Time Analysis Tab ─────────────────────────────────────────────────────────

function TimeAnalysisTab({ sessionTrades }) {
    const { hourlyStats, weekdayStats } = useMemo(
        () => buildSessionTimeProfile(sessionTrades),
        [sessionTrades],
    );

    const activeHours = hourlyStats.filter((h) => h.count > 0);

    const weekdayColumns = [
        { key: "label",    label: "Day",      align: "left",  sortable: false },
        { key: "count",    label: "N",        align: "right", sortable: true },
        { key: "wins",     label: "Wins",     align: "right", sortable: true },
        { key: "losses",   label: "Losses",   align: "right", sortable: true },
        { key: "winRate",  label: "WR %",     align: "right", sortable: true,
          render: (r) => r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—" },
        { key: "netR",     label: "Net R",    align: "right", sortable: true,
          render: (r) => <ColoredR value={r.netR} /> },
        { key: "expectancy", label: "Exp",   align: "right", sortable: true,
          render: (r) => r.expectancy != null
              ? <span className={r.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{r.expectancy.toFixed(3)}</span>
              : "—" },
    ];

    return (
        <div className="space-y-4">
            {/* Hourly Net R bar chart */}
            <NeonPanel title={<span>Hourly Net R <span className="text-[9px] font-ui tracking-widest text-muted-lab normal-case ml-1">UTC</span></span>}>
                {activeHours.length === 0 ? (
                    <div className="text-[12px] font-ui text-muted-lab py-4">No entry timestamps available.</div>
                ) : (
                    <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={hourlyStats}
                                margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                            >
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }}
                                    interval={3}
                                />
                                <YAxis
                                    tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }}
                                    tickFormatter={(v) => `${v}R`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "hsl(var(--panel-2))",
                                        border: "1px solid hsl(var(--accent-primary) / 0.4)",
                                        borderRadius: 2,
                                        fontFamily: CHART_NUM_FONT,
                                        fontSize: 11,
                                    }}
                                    formatter={(v, name, props) => [
                                        `${Number(v).toFixed(2)}R (${props.payload?.count ?? 0} trades)`,
                                        "Net R",
                                    ]}
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 3" />
                                <Bar dataKey="netR" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                                    {hourlyStats.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={entry.netR >= 0
                                                ? "hsl(var(--success))"
                                                : "hsl(var(--danger))"
                                            }
                                            fillOpacity={entry.count > 0 ? 0.85 : 0.2}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </NeonPanel>

            {/* Day of week table */}
            {weekdayStats.length > 0 && (
                <NeonPanel title="Day of Week">
                    <DataTable
                        columns={weekdayColumns.map((c) => ({
                            ...c,
                            render: c.render || ((r) => r[c.key] ?? "—"),
                        }))}
                        rows={weekdayStats}
                        maxHeight={260}
                        defaultSortKey="netR"
                        defaultSortDir="desc"
                    />
                </NeonPanel>
            )}
        </div>
    );
}

// ── Streaks Tab ───────────────────────────────────────────────────────────────

function StreaksTab({ sessionTrades }) {
    // Build streak leaderboard (top worst streaks) locally — lightweight MVP.
    const streakData = useMemo(() => {
        if (!sessionTrades.length) return { longestStreak: 0, dotStrip: [], streaks: [] };

        // Build W/L dot strip
        const dotStrip = sessionTrades.map((t) => ({
            isWin: isWin(t),
            isLoss: isLoss(t),
            r: getR(t),
            direction: t.direction || "—",
        }));

        // Find streaks
        const streaks = [];
        let cur = null;
        for (let i = 0; i < sessionTrades.length; i++) {
            const t = sessionTrades[i];
            if (getR(t) < 0) {
                if (!cur) cur = { start: i, count: 0, trades: [] };
                cur.count += 1;
                cur.trades.push(t);
            } else {
                if (cur) { streaks.push({ ...cur, end: i - 1 }); cur = null; }
            }
        }
        if (cur) streaks.push({ ...cur, end: sessionTrades.length - 1 });

        const sorted = [...streaks].sort((a, b) => b.count - a.count);
        const longestStreak = sorted[0]?.count || 0;

        return { longestStreak, dotStrip, streaks: sorted.slice(0, 5) };
    }, [sessionTrades]);

    if (!sessionTrades.length) {
        return <div className="text-[12px] font-ui text-muted-lab py-4">No trades in this session.</div>;
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <NeonPanel>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Longest Losing Streak</span>
                        <span className={cn(
                            "text-[22px] font-num tabular-nums font-semibold",
                            streakData.longestStreak >= 5 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]",
                        )}>
                            {streakData.longestStreak}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Total Trades</span>
                        <span className="text-[22px] font-num tabular-nums font-semibold">
                            {sessionTrades.length}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Total Losses</span>
                        <span className="text-[22px] font-num tabular-nums font-semibold text-[hsl(var(--danger))]">
                            {sessionTrades.filter(isLoss).length}
                        </span>
                    </div>
                </div>
            </NeonPanel>

            {/* W/L Dot strip */}
            <NeonPanel title="W/L Strip">
                <div className="flex flex-wrap gap-0.5 max-h-[80px] overflow-y-auto scrollbar-thin">
                    {streakData.dotStrip.map((d, i) => (
                        <span
                            key={i}
                            title={`${d.isWin ? "Win" : d.isLoss ? "Loss" : "B/E"} ${d.r >= 0 ? "+" : ""}${d.r.toFixed(2)}R · ${d.direction}`}
                            className={cn(
                                "w-3 h-3 rounded-[1px] shrink-0",
                                d.isWin ? "bg-[hsl(var(--success))] opacity-80"
                                    : d.isLoss ? "bg-[hsl(var(--danger))] opacity-80"
                                        : "bg-[hsl(var(--border-mid))]",
                            )}
                        />
                    ))}
                </div>
            </NeonPanel>

            {/* Top streaks */}
            {streakData.streaks.length > 0 && (
                <NeonPanel title="Worst Losing Streaks">
                    <div className="space-y-2">
                        {streakData.streaks.map((streak, i) => {
                            const netR = streak.trades.reduce((s, t) => s + getR(t), 0);
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 px-3 py-2 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]"
                                >
                                    <span className="text-[11px] font-ui text-[hsl(var(--danger))]">#{i + 1}</span>
                                    <span className="text-[11px] font-num tabular-nums text-white">{streak.count} losses</span>
                                    <span className="text-[11px] font-num tabular-nums text-[hsl(var(--danger))]">
                                        {fmtR(netR)}
                                    </span>
                                    <span className="ml-auto text-[10px] font-ui text-muted-lab">
                                        trades {streak.start + 1}–{streak.end + 1}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}

// ── SessionDrilldown ──────────────────────────────────────────────────────────

export function SessionDrilldown({ session, metrics, sessionTrades, allTrades, direction }) {
    return (
        <div
            data-testid={`session-drilldown-${session.toLowerCase().replace(/\s+/g, "-")}`}
            className="border border-[hsl(var(--accent-primary)/0.35)] clip-bevel bg-[hsl(var(--panel-2)/0.6)] backdrop-blur-sm"
        >
            {/* Drilldown header */}
            <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border-soft))]">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--accent-primary))]">
                        Session Detail
                    </span>
                    <span className="text-[13px] font-display font-semibold text-white">{session}</span>
                    {direction !== "both" && (
                        <span className="px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] clip-bevel-sm">
                            {direction === "long" ? "Longs Only" : "Shorts Only"}
                        </span>
                    )}
                    <span className="ml-auto text-[10px] font-ui text-muted-lab">
                        {sessionTrades.length} trade{sessionTrades.length !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            {sessionTrades.length === 0 ? (
                <div className="px-5 py-6 text-[12px] font-ui text-muted-lab">
                    No trades in this session for the current direction filter.
                </div>
            ) : (
                <Tabs defaultValue="overview" className="p-5">
                    <TabsList className="bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] h-auto p-0.5 gap-0 mb-5 rounded-none clip-bevel-sm">
                        {["overview", "breakdowns", "time", "streaks"].map((tab) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className={cn(
                                    "text-[10.5px] font-ui uppercase tracking-[0.08em] px-3 py-1.5 rounded-none transition-colors",
                                    "data-[state=active]:bg-[hsl(var(--accent-primary)/0.15)] data-[state=active]:text-[hsl(var(--accent-primary))] data-[state=active]:shadow-none",
                                    "text-muted-lab hover:text-white",
                                )}
                            >
                                {tab === "overview" ? "Overview"
                                    : tab === "breakdowns" ? "Breakdowns"
                                        : tab === "time" ? "Time Analysis"
                                            : "Streaks"}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="overview">
                        <OverviewTab session={session} metrics={metrics} sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="breakdowns">
                        <BreakdownsTab sessionTrades={sessionTrades} direction={direction} />
                    </TabsContent>
                    <TabsContent value="time">
                        <TimeAnalysisTab sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="streaks">
                        <StreaksTab sessionTrades={sessionTrades} />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

export default SessionDrilldown;
