/**
 * SessionDrilldown — tabbed detail panel for a selected session.
 *
 * Tabs: Overview · Direction Lab · Breakdowns · Time Analysis · OB Analysis · Failures · Streaks
 *
 * Props:
 *   session       string   — session key
 *   metrics       object   — from computeSessionMetrics()
 *   sessionTrades object[] — direction-filtered trades for this session
 *   allTrades     object[] — all trades (for cross-session context)
 *   direction     "both"|"long"|"short"
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR } from "@/components/lab/DataTable";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import { FailuresHeatmap } from "@/components/lab/failures/temporal/FailuresHeatmap";
import { StreakAnalysis } from "@/components/lab/failures/streaks/StreakAnalysis";
import { DirectionalAsymmetry } from "@/components/lab/failures/direction/DirectionalAsymmetry";
import { buildBurstDetection } from "@/components/lab/failures/shared/failuresAnalytics";
import {
    buildSessionBreakdowns,
    buildSessionTimeProfile,
    buildSessionEquityCurve,
    buildSessionOBProfile,
    buildCardSnapshot,
    isWin,
    isLoss,
    getR,
    normalizeDirection,
    normalizeStructure,
} from "./analytics/sessionAnalytics";
import { getSessionDef } from "./config/sessionConfig";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { CHART_NUM_FONT } from "@/lib/chartStyles";
import { AlertTriangle } from "lucide-react";

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtR(v) {
    if (v == null) return "—";
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}
function fmtPct(v) { return v == null ? "—" : `${Number(v).toFixed(1)}%`; }
function fmtNum(v, d = 2) {
    if (v == null) return "—";
    const n = Number(v);
    return isFinite(n) ? n.toFixed(d) : "—";
}

// ── Shared MetricGrid ─────────────────────────────────────────────────────────

function MetricGrid({ items }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {items.map(({ label, value, className }) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab leading-none">{label}</span>
                    <span className={cn("text-[15px] font-num tabular-nums font-semibold leading-tight", className || "text-[hsl(var(--text))]")}>{value}</span>
                </div>
            ))}
        </div>
    );
}

// ── Visual split bar (2-4 buckets, proportional width, coloured by netR) ──────

function SplitBars({ rows, title }) {
    const usable = rows.filter((r) => r.count > 0 && r.label !== "Unknown");
    if (usable.length < 2) return null;
    const total = usable.reduce((s, r) => s + r.count, 0);

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">{title}</span>
            <div className="flex h-4 gap-0.5 overflow-hidden clip-bevel-sm">
                {usable.map((r) => (
                    <div
                        key={r.label}
                        title={`${r.label}: ${r.count} trades · ${fmtR(r.netR)}`}
                        style={{ width: `${(r.count / total) * 100}%` }}
                        className={cn(
                            "h-full shrink-0 transition-opacity hover:opacity-100",
                            r.netR >= 0 ? "bg-[hsl(var(--success)/0.7)]" : "bg-[hsl(var(--danger)/0.7)]",
                        )}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {usable.map((r) => (
                    <span key={r.label} className="text-[10px] font-ui">
                        <span className={r.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>
                            {fmtR(r.netR)}
                        </span>
                        <span className="text-muted-lab ml-1">{r.label} ({r.count})</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

// ── Best / Worst snapshot table ───────────────────────────────────────────────

function BestWorstTable({ snapshot }) {
    if (!snapshot) return null;
    const ROWS = [
        { key: "direction",  label: "Direction"  },
        { key: "structure",  label: "Structure"  },
        { key: "entryModel", label: "Entry Model" },
        { key: "triggerDelay", label: "Trigger Delay" },
    ];
    const displayRows = ROWS.filter((row) => snapshot[row.key]?.best || snapshot[row.key]?.worst);
    if (!displayRows.length) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-ui border-collapse">
                <thead>
                    <tr className="border-b border-[hsl(var(--border-soft))]">
                        <th className="text-left py-1.5 text-[9px] uppercase tracking-wider text-muted-lab font-normal w-28">Dimension</th>
                        <th className="text-left py-1.5 text-[9px] uppercase tracking-wider text-muted-lab font-normal">Best</th>
                        <th className="text-right py-1.5 text-[9px] uppercase tracking-wider text-muted-lab font-normal pr-3">Net R</th>
                        <th className="text-left py-1.5 text-[9px] uppercase tracking-wider text-muted-lab font-normal pl-3">Worst</th>
                        <th className="text-right py-1.5 text-[9px] uppercase tracking-wider text-muted-lab font-normal">Net R</th>
                    </tr>
                </thead>
                <tbody>
                    {displayRows.map(({ key, label }) => {
                        const { best, worst } = snapshot[key] || {};
                        return (
                            <tr key={key} className="border-b border-[hsl(var(--border-soft)/0.4)] hover:bg-[hsl(var(--panel-2)/0.4)]">
                                <td className="py-1.5 text-muted-lab text-[9.5px] uppercase tracking-wider">{label}</td>
                                <td className="py-1.5 text-[hsl(var(--text-2))]">{best?.label ?? "—"}</td>
                                <td className={cn("py-1.5 text-right pr-3 font-num tabular-nums", best?.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                    {best ? fmtR(best.netR) : "—"}
                                </td>
                                <td className="py-1.5 text-[hsl(var(--text-2))] pl-3">{worst?.label ?? "—"}</td>
                                <td className={cn("py-1.5 text-right font-num tabular-nums", worst?.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                    {worst ? fmtR(worst.netR) : "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ session, metrics, sessionTrades }) {
    const equityCurveData = useMemo(() => buildSessionEquityCurve(sessionTrades), [sessionTrades]);
    const equityForChart  = useMemo(() => equityCurveData.map((d) => ({ ...d, label: String(d.i) })), [equityCurveData]);
    const { weekdayStats } = useMemo(() => buildSessionTimeProfile(sessionTrades), [sessionTrades]);

    // Breakdown data for visual split bars
    const { bucketsByKey } = useMemo(() => buildSessionBreakdowns(sessionTrades), [sessionTrades]);
    const snapshot = useMemo(() => buildCardSnapshot(sessionTrades), [sessionTrades]);

    const metricItems = [
        { label: "Net R",     value: fmtR(metrics.netR),
          className: metrics.netR > 0 ? "text-[hsl(var(--success))]" : metrics.netR < 0 ? "text-[hsl(var(--danger))]" : "text-muted-lab" },
        { label: "Win Rate",  value: fmtPct(metrics.winRate) },
        { label: "Expectancy", value: fmtNum(metrics.expectancy, 3),
          className: metrics.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
        { label: "Profit Factor", value: fmtNum(metrics.profitFactor),
          className: metrics.profitFactor == null ? "text-muted-lab" : metrics.profitFactor >= 1.5 ? "text-[hsl(var(--success))]" : metrics.profitFactor < 1 ? "text-[hsl(var(--danger))]" : undefined },
        { label: "Max DD",    value: fmtR(metrics.maxDD), className: "text-[hsl(var(--danger))]" },
        { label: "Trades",    value: metrics.tradeCount },
        { label: "Streak",    value: metrics.longestStreak,
          className: metrics.longestStreak >= 5 ? "text-[hsl(var(--danger))]" : undefined },
        { label: "Avg → Stop",   value: metrics.avgTimeToStopout != null ? `${metrics.avgTimeToStopout}m` : "—" },
        { label: "Avg → Target", value: metrics.avgTimeToTarget != null ? `${metrics.avgTimeToTarget}m` : "—" },
    ];

    const weekdayColumns = [
        { key: "label",   label: "Day",    align: "left",  sortable: false },
        { key: "count",   label: "N",      align: "right", sortable: true },
        { key: "wins",    label: "Wins",   align: "right", sortable: true },
        { key: "losses",  label: "Losses", align: "right", sortable: true },
        { key: "winRate", label: "WR %",   align: "right", sortable: true,
          render: (r) => r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—" },
        { key: "netR",    label: "Net R",  align: "right", sortable: true,
          render: (r) => <ColoredR value={r.netR} /> },
    ];

    return (
        <div className="space-y-4">
            {/* P0 metric grid */}
            <NeonPanel>
                <MetricGrid items={metricItems} />
            </NeonPanel>

            {/* Visual split bars */}
            {(bucketsByKey.direction?.length || bucketsByKey.structure?.length) && (
                <NeonPanel title="Quick Splits">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {bucketsByKey.direction?.length > 0 && (
                            <SplitBars rows={bucketsByKey.direction} title="Long vs Short" />
                        )}
                        {bucketsByKey.structure?.length > 0 && (
                            <SplitBars rows={bucketsByKey.structure} title="BOS vs CHoCH" />
                        )}
                        {bucketsByKey.entryModel?.length > 0 && (
                            <SplitBars rows={bucketsByKey.entryModel} title="Entry Model" />
                        )}
                        {bucketsByKey.triggerDelay?.length > 0 && (
                            <SplitBars rows={bucketsByKey.triggerDelay} title="Trigger Delay" />
                        )}
                    </div>
                </NeonPanel>
            )}

            {/* Best / Worst snapshot */}
            {snapshot && (
                <NeonPanel title="Best / Worst Snapshot">
                    <BestWorstTable snapshot={snapshot} />
                </NeonPanel>
            )}

            {/* Equity curve */}
            {equityForChart.length > 1 && (
                <NeonPanel title="Cumulative R">
                    <EquityCurve data={equityForChart} height={200} showAxis />
                </NeonPanel>
            )}

            {/* Day of week */}
            {weekdayStats.length > 0 && (
                <NeonPanel title="Day of Week" collapsible>
                    <DataTable
                        columns={weekdayColumns.map((c) => ({ ...c, render: c.render || ((r) => r[c.key] ?? "—") }))}
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

// ── Direction Lab Tab ─────────────────────────────────────────────────────────

function DirMetrics(trades) {
    const wins   = trades.filter(isWin).length;
    const losses = trades.filter(isLoss).length;
    const decided = wins + losses;
    const netR    = Number(trades.reduce((s, t) => s + getR(t), 0).toFixed(2));
    const grossWin  = trades.filter((t) => getR(t) > 0).reduce((s, t) => s + getR(t), 0);
    const grossLoss = trades.filter((t) => getR(t) < 0).reduce((s, t) => s + Math.abs(getR(t)), 0);
    let peak = 0, cum = 0, maxDD = 0;
    for (const t of trades) {
        cum += getR(t);
        if (cum > peak) peak = cum;
        if (cum - peak < maxDD) maxDD = cum - peak;
    }
    return {
        tradeCount: trades.length, wins, losses, netR,
        winRate:      decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : null,
        profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null,
        maxDD: Number(maxDD.toFixed(2)),
    };
}

function DirStatCard({ label, trades, accentClass }) {
    const m = useMemo(() => DirMetrics(trades), [trades]);
    const curve = useMemo(() => buildSessionEquityCurve(trades).map((d) => ({ ...d, label: String(d.i) })), [trades]);

    if (!trades.length) {
        return (
            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] p-4">
                <div className={cn("text-[11px] font-ui font-semibold uppercase tracking-wider mb-2", accentClass)}>{label}</div>
                <div className="text-[11px] font-ui text-muted-lab">No trades</div>
            </div>
        );
    }

    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] p-4 flex flex-col gap-3">
            <div className={cn("text-[11px] font-ui font-semibold uppercase tracking-wider", accentClass)}>
                {label} — {m.tradeCount} trades
            </div>
            <div className="grid grid-cols-2 gap-2">
                {[
                    { k: "Net R",  v: fmtR(m.netR),    c: m.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
                    { k: "WR",     v: fmtPct(m.winRate) },
                    { k: "PF",     v: fmtNum(m.profitFactor),
                      c: m.profitFactor == null ? "text-muted-lab" : m.profitFactor >= 1.5 ? "text-[hsl(var(--success))]" : m.profitFactor < 1 ? "text-[hsl(var(--danger))]" : undefined },
                    { k: "Max DD", v: fmtR(m.maxDD), c: "text-[hsl(var(--danger))]" },
                    { k: "Wins",   v: m.wins,   c: "text-[hsl(var(--success))]" },
                    { k: "Losses", v: m.losses, c: "text-[hsl(var(--danger))]" },
                ].map(({ k, v, c }) => (
                    <div key={k} className="flex flex-col gap-0">
                        <span className="text-[9px] font-ui uppercase tracking-wider text-muted-lab">{k}</span>
                        <span className={cn("text-[14px] font-num tabular-nums font-semibold", c || "text-[hsl(var(--text))]")}>{v}</span>
                    </div>
                ))}
            </div>
            {curve.length > 1 && (
                <EquityCurve data={curve} height={120} showAxis />
            )}
        </div>
    );
}

function DirectionLabTab({ sessionTrades }) {
    const longs  = useMemo(() => sessionTrades.filter((t) => normalizeDirection(t) === "Long"),  [sessionTrades]);
    const shorts = useMemo(() => sessionTrades.filter((t) => normalizeDirection(t) === "Short"), [sessionTrades]);

    // Comparison bar data
    const compData = useMemo(() => {
        const lM = DirMetrics(longs);
        const sM = DirMetrics(shorts);
        return [
            { metric: "Net R",    Long: lM.netR,        Short: sM.netR        },
            { metric: "Win %",    Long: lM.winRate,     Short: sM.winRate     },
            { metric: "PF",       Long: lM.profitFactor, Short: sM.profitFactor },
        ].filter((d) => d.Long != null || d.Short != null);
    }, [longs, shorts]);

    if (!sessionTrades.length) {
        return <div className="text-[12px] font-ui text-muted-lab py-4">No trades.</div>;
    }

    return (
        <div className="space-y-4">
            {/* Side-by-side stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DirStatCard label="Longs" trades={longs} accentClass="text-[hsl(var(--success))]" />
                <DirStatCard label="Shorts" trades={shorts} accentClass="text-[hsl(var(--danger))]" />
            </div>

            {/* Side-by-side metric comparison bar */}
            {compData.length > 0 && longs.length > 0 && shorts.length > 0 && (
                <NeonPanel title="Long vs Short Comparison">
                    <div style={{ height: 160 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={compData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="metric" tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--border-soft))", fontSize: 11, fontFamily: CHART_NUM_FONT }}
                                    formatter={(v) => [v != null ? Number(v).toFixed(2) : "—"]}
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 3" />
                                <Bar dataKey="Long" fill="hsl(var(--success))" fillOpacity={0.75} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                                <Bar dataKey="Short" fill="hsl(var(--danger))" fillOpacity={0.75} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}

// ── Breakdowns Tab ────────────────────────────────────────────────────────────

function BreakdownsTab({ sessionTrades }) {
    const { defs, bucketsByKey } = useMemo(() => buildSessionBreakdowns(sessionTrades), [sessionTrades]);

    const PHASE1_ORDER = [
        "direction", "structure", "entryModel", "triggerDelay",
        "rTarget", "stopBuffer", "protection", "cancellation",
        "obOriginSession", "obDetectionSession",
    ];

    const defsToShow = PHASE1_ORDER
        .map((key) => defs.find((d) => d.key === key))
        .filter((d) => d && bucketsByKey[d.key]?.length > 0);

    if (defsToShow.length === 0) {
        return <div className="text-[12px] font-ui text-muted-lab px-1 py-4">No breakdown data available.</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {defsToShow.map((def) => {
                const rows = bucketsByKey[def.key] || [];
                return (
                    <div key={def.key} className="flex flex-col gap-1">
                        <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">{def.title}</div>
                        <CanonicalBucketTable
                            rawRows={rows}
                            trades={sessionTrades}
                            def={{ labelFn: def.getLabel, order: def.order }}
                            bare bareHeatmap compact
                        />
                    </div>
                );
            })}
        </div>
    );
}

// ── Time Analysis Tab ─────────────────────────────────────────────────────────

function getSessionHours(sessionKey) {
    const def = getSessionDef(sessionKey);
    if (!def || !def.startUtc || !def.endUtc) return null;
    const [sh] = def.startUtc.split(":").map(Number);
    const [eh] = def.endUtc.split(":").map(Number);
    if (sh < eh) return Array.from({ length: eh - sh }, (_, i) => sh + i);
    // Wraps midnight (Outside: 20–00)
    const result = [];
    for (let h = sh; h < 24; h++) result.push(h);
    for (let h = 0; h < eh;  h++) result.push(h);
    return result;
}

function TimeAnalysisTab({ session, sessionTrades }) {
    const { hourlyStats, weekdayStats } = useMemo(
        () => buildSessionTimeProfile(sessionTrades), [sessionTrades],
    );

    // Filter to session hours only (hide the 20 empty bars for narrow sessions)
    const sessionHours = useMemo(() => getSessionHours(session), [session]);
    const filteredHourly = useMemo(() => {
        if (!sessionHours) return hourlyStats.filter((h) => h.count > 0);
        const hourSet = new Set(sessionHours);
        const inWindow = hourlyStats.filter((h) => {
            const n = parseInt(h.label, 10);
            return hourSet.has(n);
        });
        // Fall back to all non-zero if the window has nothing
        return inWindow.some((h) => h.count > 0) ? inWindow : hourlyStats.filter((h) => h.count > 0);
    }, [hourlyStats, sessionHours]);

    const weekdayColumns = [
        { key: "label",      label: "Day",    align: "left",  sortable: false },
        { key: "count",      label: "N",      align: "right", sortable: true },
        { key: "wins",       label: "Wins",   align: "right", sortable: true },
        { key: "losses",     label: "Losses", align: "right", sortable: true },
        { key: "winRate",    label: "WR %",   align: "right", sortable: true,
          render: (r) => r.winRate != null ? `${r.winRate.toFixed(1)}%` : "—" },
        { key: "netR",       label: "Net R",  align: "right", sortable: true,
          render: (r) => <ColoredR value={r.netR} /> },
        { key: "expectancy", label: "Exp",    align: "right", sortable: true,
          render: (r) => r.expectancy != null
              ? <span className={r.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{r.expectancy.toFixed(3)}</span>
              : "—" },
    ];

    return (
        <div className="space-y-4">
            {/* Hourly Net R — session window only */}
            <NeonPanel title={
                <span>
                    Hourly Net R
                    <span className="text-[9px] font-ui tracking-widest text-muted-lab normal-case ml-1">
                        {sessionHours ? `${session} hours only · UTC` : "UTC"}
                    </span>
                </span>
            }>
                {filteredHourly.length === 0 ? (
                    <div className="text-[12px] font-ui text-muted-lab py-4">No entry timestamps available.</div>
                ) : (
                    <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={filteredHourly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 9 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", borderRadius: 2, fontFamily: CHART_NUM_FONT, fontSize: 11 }}
                                    formatter={(v, _n, props) => [`${Number(v).toFixed(2)}R (${props.payload?.count ?? 0} trades)`, "Net R"]}
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 3" />
                                <Bar dataKey="netR" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                                    {filteredHourly.map((entry, i) => (
                                        <Cell key={i}
                                            fill={entry.netR >= 0 ? "hsl(var(--success))" : "hsl(var(--danger))"}
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
                        columns={weekdayColumns.map((c) => ({ ...c, render: c.render || ((r) => r[c.key] ?? "—") }))}
                        rows={weekdayStats}
                        maxHeight={260}
                        defaultSortKey="netR"
                        defaultSortDir="desc"
                    />
                </NeonPanel>
            )}

            {/* Hour × Day heatmap */}
            <NeonPanel
                title={<span>Hour × Day Loss Rate <span className="text-[9px] font-ui tracking-widest text-muted-lab normal-case ml-1">UTC</span></span>}
                collapsible
            >
                <FailuresHeatmap allTrades={sessionTrades} />
            </NeonPanel>
        </div>
    );
}

// ── OB Analysis Tab ───────────────────────────────────────────────────────────

function OBAnalysisTab({ sessionTrades }) {
    const profile = useMemo(() => buildSessionOBProfile(sessionTrades), [sessionTrades]);

    if (!profile.obFieldAvailable) {
        return (
            <div className="flex flex-col gap-3 py-4">
                <div className="flex items-start gap-3 border border-[hsl(var(--border-mid))] clip-bevel-sm px-4 py-3 bg-[hsl(var(--panel-2)/0.4)]">
                    <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-[11.5px] font-ui text-[hsl(var(--warning))] font-semibold">OB session fields not available for this run.</p>
                        <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            Re-import this run to populate <span className="font-semibold text-white">obOriginSession</span> / <span className="font-semibold text-white">obDetectionSession</span>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.originRows.filter((r) => r.label !== "Unknown" || r.count > 0).length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">OB Origin Session</div>
                    <div className="text-[10px] font-ui text-muted-lab mb-1">Which session spawned the OBs trading here</div>
                    <CanonicalBucketTable rawRows={profile.originRows} trades={sessionTrades}
                        def={{ labelFn: (t) => t.obOriginSession || "Unknown" }} bare bareHeatmap compact />
                </div>
            )}
            {profile.detectionRows.filter((r) => r.label !== "Unknown" || r.count > 0).length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">OB Detection Session</div>
                    <div className="text-[10px] font-ui text-muted-lab mb-1">Which session confirmed the OBs</div>
                    <CanonicalBucketTable rawRows={profile.detectionRows} trades={sessionTrades}
                        def={{ labelFn: (t) => t.obDetectionSession || "Unknown" }} bare bareHeatmap compact />
                </div>
            )}
            {profile.hasWidth && profile.widthRows.some((r) => r.count > 0) && (
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">OB Width</div>
                    <div className="text-[10px] font-ui text-muted-lab mb-1">Wide OBs as structural drag</div>
                    <CanonicalBucketTable rawRows={profile.widthRows} trades={sessionTrades}
                        def={{ labelFn: (t) => { const w = Number(t.obWidthPips ?? t.ob_width_pips); if (!isFinite(w) || w <= 0) return "Unknown"; if (w < 5) return "<5 pips"; if (w < 10) return "5–10 pips"; if (w < 15) return "10–15 pips"; return "15+ pips"; } }}
                        bare bareHeatmap compact />
                </div>
            )}
            {profile.hasNews && (
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))]">News-Origin OBs</div>
                    <div className="text-[10px] font-ui text-muted-lab mb-1">OBs created during news vs clean OBs</div>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: "News OBs",  data: profile.news,  accent: "hsl(var(--warning))" },
                            { label: "Clean OBs", data: profile.clean, accent: "hsl(var(--accent-primary))" },
                        ].map(({ label, data, accent }) => (
                            <div key={label} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-3 py-2.5 flex flex-col gap-2">
                                <span className="text-[9.5px] font-ui uppercase tracking-wider" style={{ color: accent }}>{label}</span>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                    {[
                                        { k: "N",    v: data.count },
                                        { k: "Net R", v: fmtR(data.netR), cls: data.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]" },
                                        { k: "WR",   v: data.winRate != null ? `${data.winRate}%` : "—" },
                                        { k: "W/L",  v: `${data.wins}/${data.losses}` },
                                    ].map(({ k, v, cls }) => (
                                        <div key={k} className="flex flex-col gap-0">
                                            <span className="text-[8.5px] font-ui uppercase tracking-wider text-muted-lab">{k}</span>
                                            <span className={cn("text-[12px] font-num tabular-nums font-semibold", cls || "text-[hsl(var(--text))]")}>{v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Failures Tab ──────────────────────────────────────────────────────────────

function FailuresTab({ sessionTrades }) {
    const losers = useMemo(() => sessionTrades.filter(isLoss), [sessionTrades]);
    if (!sessionTrades.length) return <div className="text-[12px] font-ui text-muted-lab py-4">No trades in this session.</div>;
    return (
        <div className="space-y-4">
            <DirectionalAsymmetry allTrades={sessionTrades} losers={losers} allLosers={losers} />
            <StreakAnalysis allTrades={sessionTrades} losers={losers} allLosers={losers} />
        </div>
    );
}

// ── Streaks Tab ───────────────────────────────────────────────────────────────

function StreaksTab({ sessionTrades }) {
    const streakData = useMemo(() => {
        if (!sessionTrades.length) return { longestStreak: 0, dotStrip: [], streaks: [] };

        const dotStrip = sessionTrades.map((t) => ({
            isWin:        isWin(t),
            isLoss:       isLoss(t),
            r:            getR(t),
            direction:    t.direction || "—",
            structure:    t.structure || "—",
            entryModel:   t.entryModel || t.entry_model_key || t.entry_model || "—",
            delay:        t.fill_delay_candles != null ? `Delay+${t.fill_delay_candles}` : "Same",
            entry:        t.entry || t.fill_time || null,
            cancelReason: t.cancellation_reason || t.cancel_reason || null,
        }));

        const streaks = [];
        let cur = null;
        for (let i = 0; i < sessionTrades.length; i++) {
            const t = sessionTrades[i];
            if (getR(t) < 0) {
                if (!cur) cur = { start: i, count: 0, trades: [] };
                cur.count++;
                cur.trades.push(t);
            } else {
                if (cur) { streaks.push({ ...cur, end: i - 1 }); cur = null; }
            }
        }
        if (cur) streaks.push({ ...cur, end: sessionTrades.length - 1 });

        const sorted = [...streaks].sort((a, b) => b.count - a.count);
        return { longestStreak: sorted[0]?.count || 0, dotStrip, streaks: sorted.slice(0, 5) };
    }, [sessionTrades]);

    const bursts = useMemo(() => buildBurstDetection(sessionTrades), [sessionTrades]);

    if (!sessionTrades.length) return <div className="text-[12px] font-ui text-muted-lab py-4">No trades in this session.</div>;

    return (
        <div className="space-y-4">
            <NeonPanel>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Longest Losing Streak</span>
                        <span className={cn("text-[22px] font-num tabular-nums font-semibold", streakData.longestStreak >= 5 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]")}>
                            {streakData.longestStreak}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Total Trades</span>
                        <span className="text-[22px] font-num tabular-nums font-semibold">{sessionTrades.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Total Losses</span>
                        <span className="text-[22px] font-num tabular-nums font-semibold text-[hsl(var(--danger))]">{sessionTrades.filter(isLoss).length}</span>
                    </div>
                </div>
            </NeonPanel>

            {/* W/L dot strip — enriched title attr for hover details */}
            <NeonPanel title="W/L Strip">
                <div className="flex flex-wrap gap-0.5 max-h-[80px] overflow-y-auto scrollbar-thin">
                    {streakData.dotStrip.map((d, i) => {
                        const tooltip = [
                            `${d.isWin ? "Win" : d.isLoss ? "Loss" : "B/E"}: ${d.r >= 0 ? "+" : ""}${d.r.toFixed(2)}R`,
                            `Dir: ${d.direction}`,
                            `Struct: ${d.structure}`,
                            `Model: ${d.entryModel}`,
                            `Delay: ${d.delay}`,
                            d.entry ? `Entry: ${d.entry}` : null,
                            d.cancelReason ? `Cancel: ${d.cancelReason}` : null,
                        ].filter(Boolean).join(" · ");
                        return (
                            <span
                                key={i}
                                title={tooltip}
                                className={cn(
                                    "w-3 h-3 rounded-[1px] shrink-0 cursor-default",
                                    d.isWin ? "bg-[hsl(var(--success))] opacity-80"
                                        : d.isLoss ? "bg-[hsl(var(--danger))] opacity-80"
                                            : "bg-[hsl(var(--border-mid))]",
                                )}
                            />
                        );
                    })}
                </div>
            </NeonPanel>

            {streakData.streaks.length > 0 && (
                <NeonPanel title="Worst Losing Streaks">
                    <div className="space-y-2">
                        {streakData.streaks.map((streak, i) => {
                            const netR = streak.trades.reduce((s, t) => s + getR(t), 0);
                            return (
                                <div key={i} className="flex items-center gap-3 px-3 py-2 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]">
                                    <span className="text-[11px] font-ui text-[hsl(var(--danger))]">#{i + 1}</span>
                                    <span className="text-[11px] font-num tabular-nums text-white">{streak.count} losses</span>
                                    <span className="text-[11px] font-num tabular-nums text-[hsl(var(--danger))]">{fmtR(netR)}</span>
                                    <span className="ml-auto text-[10px] font-ui text-muted-lab">trades {streak.start + 1}–{streak.end + 1}</span>
                                </div>
                            );
                        })}
                    </div>
                </NeonPanel>
            )}

            {bursts.length > 0 && (
                <NeonPanel title="Loss Bursts">
                    <div className="space-y-2">
                        {bursts.map((b, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 border border-[hsl(var(--border-soft)/0.6)] clip-bevel-sm bg-[hsl(var(--panel-2)/0.3)] text-[11px] font-ui">
                                <span className="text-[hsl(var(--warning))] font-semibold">{b.lossCount} losses</span>
                                <span className="font-num text-[hsl(var(--danger))]">{fmtR(b.totalR)}</span>
                                <span className="text-muted-lab">{b.startTs}</span>
                                {b.topSession && <span className="ml-auto text-[hsl(var(--text-2))]">peak: {b.topSession}</span>}
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-[10px] font-ui text-muted-lab leading-relaxed">Dense loss clusters within 48-hour windows.</p>
                </NeonPanel>
            )}
        </div>
    );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
    { value: "overview",      label: "Overview"      },
    { value: "direction-lab", label: "Direction Lab" },
    { value: "breakdowns",    label: "Breakdowns"    },
    { value: "time",          label: "Time Analysis" },
    { value: "ob",            label: "OB Analysis"   },
    { value: "failures",      label: "Failures"      },
    { value: "streaks",       label: "Streaks"       },
];

// ── SessionDrilldown ──────────────────────────────────────────────────────────

export function SessionDrilldown({ session, metrics, sessionTrades, allTrades, direction }) {
    return (
        <div
            data-testid={`session-drilldown-${session.toLowerCase().replace(/\s+/g, "-")}`}
            className="border border-[hsl(var(--accent-primary)/0.35)] clip-bevel bg-[hsl(var(--panel-2)/0.6)] backdrop-blur-sm"
        >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border-soft))]">
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--accent-primary))]">Session Detail</span>
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
                    <TabsList className="bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] h-auto p-0.5 gap-0 mb-5 rounded-none clip-bevel-sm flex-wrap">
                        {TABS.map(({ value, label }) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                className={cn(
                                    "text-[10.5px] font-ui uppercase tracking-[0.08em] px-3 py-1.5 rounded-none transition-colors",
                                    "data-[state=active]:bg-[hsl(var(--accent-primary)/0.15)] data-[state=active]:text-[hsl(var(--accent-primary))] data-[state=active]:shadow-none",
                                    "text-muted-lab hover:text-white",
                                )}
                            >
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value="overview">
                        <OverviewTab session={session} metrics={metrics} sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="direction-lab">
                        <DirectionLabTab sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="breakdowns">
                        <BreakdownsTab sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="time">
                        <TimeAnalysisTab session={session} sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="ob">
                        <OBAnalysisTab sessionTrades={sessionTrades} />
                    </TabsContent>
                    <TabsContent value="failures">
                        <FailuresTab sessionTrades={sessionTrades} />
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
