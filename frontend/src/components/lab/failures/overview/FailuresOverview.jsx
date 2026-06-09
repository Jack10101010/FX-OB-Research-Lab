// ── FailuresOverview.jsx ─────────────────────────────────────────────────────
// Phase 1/3: KPI strip + session/direction/weekday distributions + severity + insights + equity curve.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { FailuresEquityPanel } from "./FailuresEquityPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import {
    TrendingDown, AlertTriangle, Lightbulb, Clock, Send, CheckCircle, ChevronRight,
} from "lucide-react";
import {
    computeFailureKPIs,
    computeSessionFailureRates,
    computeDirectionalStats,
    buildCurrentStreak,
    buildWeekdayFailureStats,
    buildSeverityDistribution,
    buildOverviewInsights,
    computeArchetypeDistribution,
    computeArchetypeDNAStats,
    computePreventionRules,
} from "../shared/failuresAnalytics";
import { archetypeLabel } from "../shared/failuresRegistry";
import { buildHypothesisCard, writeHypothesisToStorage } from "../shared/failuresExporter";

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
    return <h3 className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">{children}</h3>;
}

// ── Failure Command Center ─────────────────────────────────────────────────────
// Verdict-first hero. Pure presentation synthesis of EXISTING analytics:
//   biggest loss driver  ← computeArchetypeDistribution (ranked by loss-R)
//   best prevention rule ← computePreventionRules (top by net-R delta)
//   recommended action   ← inherits the prevention rule's confidence tier
// No new statistics; no analytics/threshold/contract changes.

const CC_TONE_TOKEN = {
    success: "--success", secondary: "--accent-secondary", warning: "--warning",
    danger: "--danger", muted: "--text-2",
};

// Confidence tier → recommended action (Phase F: inherit; never "fix now" on speculative).
function recommendationFor(confidence) {
    switch (confidence) {
        case "STRONG":   return { verb: "Recommended",       detail: "Promote to Hypothesis Lab and validate next research cycle.", tone: "success" };
        case "MODERATE": return { verb: "Investigate",       detail: "Promising — validate out-of-sample before promoting.",        tone: "secondary" };
        case "WEAK":     return { verb: "Research candidate", detail: "Thin sample — gather more evidence before acting.",            tone: "warning" };
        default:         return { verb: "Research only",      detail: "Too few losses caught — treat as noise, not a fix.",          tone: "danger" }; // SPECULATIVE / none
    }
}

const CONF_PILL_TONE = { STRONG: "success", MODERATE: "secondary", WEAK: "warning", SPECULATIVE: "danger" };

function CommandCard({ eyebrow, accent = "--accent-primary", children }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-4 flex flex-col"
            style={{ borderTop: `2px solid hsl(var(${accent})/0.55)` }}>
            <div className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--text-2))] mb-2">{eyebrow}</div>
            {children}
        </div>
    );
}

function FailureCommandCenter({ allTrades = [], allLosers = [] }) {
    const [promoted, setPromoted] = useState(false);

    const archDist = useMemo(() => computeArchetypeDistribution(allLosers), [allLosers]);
    const rules    = useMemo(() => computePreventionRules(allTrades, allLosers), [allTrades, allLosers]);

    // Biggest loss driver = archetype with the largest share of total loss R.
    const totalLossR = archDist.reduce((s, a) => s + Math.abs(a.totalR), 0);
    const topDriver  = [...archDist].sort((a, b) => Math.abs(b.totalR) - Math.abs(a.totalR))[0] || null;
    const driverDNA  = useMemo(
        () => (topDriver ? computeArchetypeDNAStats(allLosers, topDriver.archetype) : null),
        [allLosers, topDriver],
    );
    const driverLossPct = topDriver && totalLossR > 0 ? Math.round((Math.abs(topDriver.totalR) / totalLossR) * 100) : null;

    // Best prevention candidate = top rule by net-R delta that actually catches losses.
    const candidates = useMemo(() => rules.filter(r => r.losersCaught > 0).slice(0, 3), [rules]);
    const best = candidates[0] || null;
    const rec = recommendationFor(best?.confidence);
    const recTok = CC_TONE_TOKEN[rec.tone] || "--text-2";

    // Promote gating mirrors PreventionEngine: ≥5 losses caught and not SPECULATIVE.
    const canPromote = !!best && best.losersCaught >= 5 && best.confidence !== "SPECULATIVE";
    const promote = () => {
        if (!best || !canPromote) return;
        const card = buildHypothesisCard({
            title: `Prevention Screen: ${best.label}`,
            description: `Rule catches ${best.losersCaughtPct}% of losses (${best.losersCaught} trades, saved +${best.savedR}R). `
                + `Removes ${best.winnersRemovedPct}% of winners (−${best.sacrificedR}R). Net R delta: ${best.netRDelta >= 0 ? "+" : ""}${best.netRDelta}R.`,
            rationale: `Surfaced by the Failures Command Center. Confidence: ${best.confidence}. Validate out-of-sample before applying.`,
        });
        card.tags = [...(card.tags || []), "failures-lab", "command-center", "prevention"];
        if (writeHypothesisToStorage(card)) setPromoted(true);
    };

    if (!allLosers.length) {
        return (
            <NeonPanel title="Failure Command Center" tone="secondary">
                <div className="p-6 text-center text-[12px] font-ui text-[hsl(var(--text-2))]">No losing trades in this run — nothing to fix.</div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel title="Failure Command Center" tone="secondary"
            action={<span className="text-[11px] font-ui text-[hsl(var(--text-2))]">What should I fix next?</span>}>
            <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                    {/* 1 · Biggest loss driver */}
                    <CommandCard eyebrow="Biggest loss driver" accent="--danger">
                        {topDriver ? (
                            <>
                                <div className="font-display font-semibold text-[20px] leading-tight text-[hsl(var(--danger))]">
                                    {archetypeLabel(topDriver.archetype)}
                                </div>
                                <div className="mt-2 text-[13px] font-num text-[hsl(var(--text))]">
                                    {driverLossPct != null ? `${driverLossPct}%` : "—"} <span className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">of total loss R</span>
                                </div>
                                <div className="mt-1 text-[12px] font-ui text-[hsl(var(--text-2))]">
                                    {topDriver.count} losses · avg severity {driverDNA?.avgSeverity != null ? driverDNA.avgSeverity.toFixed(1) : "—"}
                                </div>
                            </>
                        ) : <div className="text-[12px] font-ui text-[hsl(var(--text-2))]">No classified losses.</div>}
                    </CommandCard>

                    {/* 2 · Best prevention candidate */}
                    <CommandCard eyebrow="Best prevention candidate" accent="--accent-secondary">
                        {best ? (
                            <>
                                <div className="font-display font-semibold text-[18px] leading-tight text-[hsl(var(--text))]">{best.label}</div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className={cn("font-num tabular-nums text-[20px] font-semibold", best.netRDelta >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                        {best.netRDelta >= 0 ? "+" : ""}{best.netRDelta}R
                                    </span>
                                    <span className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">net improvement</span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    <Pill tone={CONF_PILL_TONE[best.confidence] || "muted"}>{best.confidence}</Pill>
                                    <span className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">{best.winnersRemovedPct}% winners removed</span>
                                </div>
                            </>
                        ) : <div className="text-[12px] font-ui text-[hsl(var(--text-2))]">No prevention candidates yet.</div>}
                    </CommandCard>

                    {/* 3 · Recommended action (inherits confidence) */}
                    <CommandCard eyebrow="Recommended action" accent={recTok}>
                        {best ? (
                            <>
                                <div className="font-display font-semibold text-[20px] leading-tight" style={{ color: `hsl(var(${recTok}))` }}>{rec.verb}</div>
                                <div className="mt-2 text-[12.5px] font-ui text-[hsl(var(--text-2))] leading-snug">{rec.detail}</div>
                                <button type="button" onClick={promote} disabled={!canPromote || promoted}
                                    title={canPromote ? undefined : "Need ≥5 losses caught and non-speculative confidence to promote"}
                                    className={cn(
                                        "mt-3 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-[10px] font-ui font-semibold uppercase tracking-wider border clip-bevel-sm transition-colors",
                                        promoted
                                            ? "border-[hsl(var(--success)/0.45)] text-[hsl(var(--success))] cursor-default"
                                            : canPromote
                                            ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.08)]"
                                            : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] opacity-50 cursor-not-allowed",
                                    )}>
                                    {promoted ? <><CheckCircle className="w-3 h-3" /> Promoted to Hypothesis Lab</> : <><Send className="w-3 h-3" /> Promote to Hypothesis Lab</>}
                                </button>
                            </>
                        ) : <div className="text-[12px] font-ui text-[hsl(var(--text-2))]">Load more data to generate a recommendation.</div>}
                    </CommandCard>
                </div>

                {/* Top prevention candidates surfaced (Phase D) — details remain in the Prevention tab */}
                {candidates.length > 1 && (
                    <div className="mt-3">
                        <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--text-2))] mb-1.5">
                            Top prevention candidates <span className="font-normal normal-case">· full analysis in the Prevention tab</span>
                        </div>
                        <div className="space-y-1">
                            {candidates.map((r) => (
                                <div key={r.key} className="flex items-center gap-3 px-2.5 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm">
                                    <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--text-3))] shrink-0" />
                                    <span className="flex-1 min-w-0 text-[12px] font-ui text-[hsl(var(--text))] truncate">{r.label}</span>
                                    <Pill tone={CONF_PILL_TONE[r.confidence] || "muted"}>{r.confidence}</Pill>
                                    <span className="text-[11.5px] font-ui text-[hsl(var(--text-2))] w-20 text-right">{r.losersCaughtPct}% caught</span>
                                    <span className={cn("font-num tabular-nums text-[13px] font-semibold w-16 text-right", r.netRDelta >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                        {r.netRDelta >= 0 ? "+" : ""}{r.netRDelta}R
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </NeonPanel>
    );
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
            {/* ── Failure Command Center — verdict-first answer ─────────────── */}
            <FailureCommandCenter allTrades={allTrades} allLosers={allLosers} />

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
                                <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))] w-20 shrink-0">{row.session}</span>
                                <DistBar value={row.lossCount} max={maxSessLoss} tone="danger" />
                                <span className="text-[10.5px] font-num text-white tabular-nums w-6 text-right">{row.lossCount}</span>
                                <span className="text-[9.5px] font-num text-muted-lab w-11 text-right">{row.lossRate}%</span>
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
                                <div className={`text-[10px] font-ui uppercase tracking-wider ${cls}`}>{label}</div>
                                {stat ? (
                                    <>
                                        <div className="font-display text-[22px] font-semibold text-white">{stat.lossCount}</div>
                                        <div className="text-[10px] font-num text-[hsl(var(--text-2))]">{stat.lossRate}% loss rate</div>
                                        <div className="text-[10px] font-num text-[hsl(var(--text-2))]">
                                            Avg: {stat.avgLossR != null ? `${stat.avgLossR}R` : "—"}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-[10px] font-ui text-muted-lab">No {label.toLowerCase()} trades</div>
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
                                <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))] w-8 shrink-0">{row.label}</span>
                                <DistBar value={row.lossCount} max={maxDayLoss} tone={row.lossRate > 50 ? "warning" : "primary"} />
                                <span className="text-[10.5px] font-num text-white tabular-nums w-6 text-right">{row.lossCount}</span>
                                <span className="text-[9.5px] font-num text-muted-lab w-11 text-right">{row.lossRate}%</span>
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
                                <div className={`text-[9.5px] font-ui uppercase tracking-wider ${color}`}>{label}</div>
                                <div className="font-display text-[22px] font-semibold text-white mt-1">{value}</div>
                                <div className="text-[9.5px] font-num text-muted-lab">
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
                                <span className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{insight}</span>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}
