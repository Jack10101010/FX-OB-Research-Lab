// ── FailuresOverview.jsx ─────────────────────────────────────────────────────
// Phase 1/3: KPI strip + session/direction/weekday distributions + severity + insights + equity curve.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { FailuresEquityPanel } from "./FailuresEquityPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { Pill } from "@/components/lab/DataTable";
import {
    TrendingDown, AlertTriangle, Lightbulb, Clock,
} from "lucide-react";
import {
    computeFailureKPIs,
    computeSessionFailureRates,
    computeDirectionalStats,
    buildCurrentStreak,
    buildWeekdayFailureStats,
    buildSeverityDistribution,
    buildOverviewInsights,
} from "../shared/failuresAnalytics";
import { archetypeLabel } from "../shared/failuresRegistry";

// ── Sub-components ────────────────────────────────────────────────────────────

function DistBar({ value, max, tone = "primary" }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    const color = {
        primary:   "hsl(var(--accent-primary))",
        success:   "hsl(var(--success))",
        danger:    "hsl(var(--danger))",
        warning:   "hsl(var(--warning))",
        secondary: "hsl(var(--accent-secondary))",
        muted:     "hsl(var(--text-2))",
    }[tone] || "hsl(var(--accent-primary))";
    return (
        <div className="h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden flex-1">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
    );
}

function SectionTitle({ children }) {
    return <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-lab">{children}</h3>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FailuresOverview({ losers = [], allLosers = [], allTrades = [], config = {} }) {
    const kpis         = useMemo(() => computeFailureKPIs(allTrades, allLosers), [allTrades, allLosers]);
    const currentStreak= useMemo(() => buildCurrentStreak(allTrades), [allTrades]);
    const sessionStats = useMemo(() => computeSessionFailureRates(allTrades), [allTrades]);
    const dirStats     = useMemo(() => computeDirectionalStats(allTrades), [allTrades]);
    const weekdayStats = useMemo(() => buildWeekdayFailureStats(allTrades), [allTrades]);
    const sevDist      = useMemo(() => buildSeverityDistribution(allLosers), [allLosers]);
    const insights     = useMemo(
        () => buildOverviewInsights(allLosers, allTrades, sessionStats, dirStats, weekdayStats),
        [allLosers, allTrades, sessionStats, dirStats, weekdayStats],
    );

    if (!allTrades.length) return null;

    const sessionRows   = sessionStats.filter(s => s.total > 0).sort((a, b) => b.lossCount - a.lossCount);
    const maxSessLoss   = Math.max(...sessionRows.map(r => r.lossCount), 1);
    const maxDayLoss    = Math.max(...weekdayStats.map(r => r.lossCount), 1);

    const { long: l, short: s } = dirStats;

    return (
        <div className="p-6 space-y-5">
            {/* ── KPI strip ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip
                    label="Total Losses"
                    value={kpis.totalLosses}
                    tone="danger"
                    icon={TrendingDown}
                    sub={kpis.lossRate != null ? `${kpis.lossRate}% of trades` : undefined}
                />
                <MetricChip
                    label="Avg Loss"
                    value={kpis.avgLossR != null ? `${kpis.avgLossR}R` : "—"}
                    tone="danger"
                    sub="per loser"
                />
                <MetricChip
                    label="Worst Loss"
                    value={kpis.worstLossR != null ? `${kpis.worstLossR}R` : "—"}
                    tone="danger"
                    sub="single trade"
                />
                <MetricChip
                    label="Longest Streak"
                    value={kpis.longestStreak}
                    tone="warning"
                    icon={AlertTriangle}
                    sub={currentStreak > 0 ? `Current: ${currentStreak}` : "no active streak"}
                />
                <MetricChip
                    label="Top Archetype"
                    value={kpis.topArchetype ? archetypeLabel(kpis.topArchetype) : "—"}
                    tone="secondary"
                    sub={kpis.topArchetypePct != null ? `${kpis.topArchetypePct}% of losses` : undefined}
                    valueClassName="text-[17px]"
                />
                <MetricChip
                    label="Sev Score"
                    value={kpis.severityWeightedLossRate != null ? kpis.severityWeightedLossRate.toFixed(1) : "—"}
                    tone="warning"
                    icon={Clock}
                    sub="severity-wtd avg"
                />
            </div>

            {/* ── Distribution row ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Session */}
                <NeonPanel title="Losses by Session" dense>
                    <div className="p-3 space-y-2">
                        {sessionRows.map(row => (
                            <div key={row.session} className="flex items-center gap-2.5">
                                <span className="text-[10.5px] font-mono text-[hsl(var(--text-2))] w-20 shrink-0">{row.session}</span>
                                <DistBar value={row.lossCount} max={maxSessLoss} tone="danger" />
                                <span className="text-[10.5px] font-mono text-white tabular-nums w-6 text-right">{row.lossCount}</span>
                                <span className="text-[9.5px] font-mono text-muted-lab w-11 text-right">{row.lossRate}%</span>
                            </div>
                        ))}
                    </div>
                </NeonPanel>

                {/* Direction comparison */}
                <NeonPanel title="Long vs Short" dense>
                    <div className="grid grid-cols-2 gap-px bg-[hsl(var(--border-soft))]">
                        {[
                            { label: "Long",  stat: l, cls: "text-[hsl(var(--success))]" },
                            { label: "Short", stat: s, cls: "text-[hsl(var(--danger))]"  },
                        ].map(({ label, stat, cls }) => (
                            <div key={label} className="bg-[hsl(var(--panel))] p-3 space-y-1.5">
                                <div className={`text-[10px] font-mono uppercase tracking-wider ${cls}`}>{label}</div>
                                {stat ? (
                                    <>
                                        <div className="font-display text-[22px] font-semibold text-white">{stat.lossCount}</div>
                                        <div className="text-[10px] font-mono text-[hsl(var(--text-2))]">{stat.lossRate}% loss rate</div>
                                        <div className="text-[10px] font-mono text-[hsl(var(--text-2))]">
                                            Avg: {stat.avgLossR != null ? `${stat.avgLossR}R` : "—"}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-[10px] font-mono text-muted-lab">No {label.toLowerCase()} trades</div>
                                )}
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            </div>

            {/* ── Weekday + Severity ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weekday */}
                <NeonPanel title="Losses by Weekday" dense>
                    <div className="p-3 space-y-2">
                        {weekdayStats.sort((a, b) => b.lossCount - a.lossCount).map(row => (
                            <div key={row.weekday} className="flex items-center gap-2.5">
                                <span className="text-[10.5px] font-mono text-[hsl(var(--text-2))] w-8 shrink-0">{row.label}</span>
                                <DistBar value={row.lossCount} max={maxDayLoss} tone={row.lossRate > 50 ? "warning" : "primary"} />
                                <span className="text-[10.5px] font-mono text-white tabular-nums w-6 text-right">{row.lossCount}</span>
                                <span className="text-[9.5px] font-mono text-muted-lab w-11 text-right">{row.lossRate}%</span>
                            </div>
                        ))}
                    </div>
                </NeonPanel>

                {/* Severity buckets */}
                <NeonPanel title="Severity Distribution" dense>
                    <div className="grid grid-cols-2 gap-px bg-[hsl(var(--border-soft))]">
                        {[
                            { key: "low",      label: "LOW",      color: "text-[hsl(var(--text-2))]",             value: sevDist.low      },
                            { key: "moderate", label: "MODERATE", color: "text-[hsl(var(--accent-secondary))]",   value: sevDist.moderate },
                            { key: "high",     label: "HIGH",     color: "text-[hsl(var(--warning))]",            value: sevDist.high     },
                            { key: "critical", label: "CRITICAL", color: "text-[hsl(var(--danger))]",             value: sevDist.critical },
                        ].map(({ key, label, color, value }) => (
                            <div key={key} className="bg-[hsl(var(--panel))] p-3">
                                <div className={`text-[9.5px] font-mono uppercase tracking-wider ${color}`}>{label}</div>
                                <div className="font-display text-[22px] font-semibold text-white mt-1">{value}</div>
                                <div className="text-[9.5px] font-mono text-muted-lab">
                                    {sevDist.total > 0 ? `${((value / sevDist.total) * 100).toFixed(0)}%` : "—"}
                                </div>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            </div>

            {/* ── Equity curve ──────────────────────────────────────────────── */}
            <FailuresEquityPanel allTrades={allTrades} />

            {/* ── Insights ──────────────────────────────────────────────────── */}
            {insights.length > 0 && (
                <NeonPanel title="Quick Insights" tone="secondary" dense>
                    <div className="p-3 space-y-2.5">
                        {insights.map((insight, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                                <Lightbulb className="w-3 h-3 text-[hsl(var(--accent-secondary))] shrink-0 mt-0.5" />
                                <span className="text-[11px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{insight}</span>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}
