import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    Gauge, AlertTriangle, TrendingDown, TrendingUp, Compass,
    ArrowRight, FolderKanban,
} from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { useDataset, getRunDisplayName } from "@/data/store";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "@/data/tradeClassification";
import { buildFillStateBreakdown, buildSessionBreakdown } from "@/data/fillStateBreakdown";
import { buildResearchSignals } from "@/data/researchSignals";
import { buildLossTriage, buildBeVerdict, buildContextSinkholes } from "@/data/lossTriage";
import { buildDistanceAtArmBreakdown } from "@/data/distanceBreakdown";
import { buildFailureDrivers } from "@/components/lab/failures/shared/excursionAnalytics";
import { resolveRunReference, summarizeRunForDelta, buildRunDelta, referenceReasonLabel } from "@/data/projectWorkflow";
import { buildRunInsights } from "@/data/runInsights";

// COCKPIT-1, Phase 1 — Research Cockpit.
// A top-level, read-only summary that sits ABOVE the labs. It consumes existing pure
// analytics over the ACTIVE run's trades and renders ranked insight cards. It computes
// no new metrics, persists nothing, and links to (but never reaches into) the labs.
// Saving findings stays in the existing Save-Finding flow — not here.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmtR = (v, d = 1) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(d)}R`;
};
const fmtPct = (v) => (v == null ? "—" : `${Math.round(Number(v) * (Number(v) <= 1 ? 100 : 1))}%`);

// Section chrome per category.
const SECTIONS = [
    { key: "warning", label: "Warnings & Caveats", icon: AlertTriangle, tone: "warning", accent: "warning" },
    { key: "hurting", label: "What's Hurting", icon: TrendingDown, tone: "danger", accent: "danger" },
    { key: "working", label: "What's Working", icon: TrendingUp, tone: "success", accent: "success" },
    { key: "opportunity", label: "Research Opportunities", icon: Compass, tone: "info", accent: "info" },
];

const CONFIDENCE_TONE = { High: "success", Medium: "info", Low: "warning", "Very Low": "muted" };
const SEVERITY_TONE = { warning: "warning", high: "danger", medium: "warning", low: "muted", opportunity: "info" };

export default function ResearchCockpit() {
    const { ACTIVE_RUN, RUNS, ACTIVE_PROJECT, getRunData } = useDataset();

    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);
    const trades = useMemo(() => (Array.isArray(runData?.trades) ? runData.trades : []), [runData]);

    // ── reuse existing pure analytics over the active run's trades ──────────────
    const fillStateBreakdown = useMemo(() => buildFillStateBreakdown(trades), [trades]);
    const sessionBreakdown = useMemo(() => buildSessionBreakdown(trades), [trades]);
    // Entry-model signal candidates are deferred to a later phase (the classification
    // breakdown is computed inside RunDetail). Passing [] still yields fill-state +
    // session signals — additive when entry-model rows are wired in later.
    const researchSignals = useMemo(
        () => buildResearchSignals(fillStateBreakdown, sessionBreakdown, []),
        [fillStateBreakdown, sessionBreakdown],
    );
    const contextSinkholes = useMemo(() => buildContextSinkholes(trades), [trades]);
    const lossTriage = useMemo(() => buildLossTriage(trades), [trades]);
    const distanceBreakdown = useMemo(() => buildDistanceAtArmBreakdown(trades), [trades]);
    const failureDrivers = useMemo(
        () => buildFailureDrivers(trades.filter((t) => isLossTrade(t))),
        [trades],
    );
    const beVerdict = useMemo(() => {
        const baselineNetR = trades.reduce((s, t) => s + (Number(t?.netR ?? t?.net_r) || 0), 0);
        return buildBeVerdict(runData?.beTradesByMode ?? null, {
            executionMode: runData?.config?.execution_mode ?? null,
            baselineNetR,
        });
    }, [runData, trades]);

    // ── run meta (headline numbers — restated, not new metrics) ────────────────
    const meta = useMemo(() => {
        const perf = trades.filter((t) => isPerformanceTrade(t));
        const wins = perf.filter((t) => isWinTrade(t)).length;
        const losses = perf.filter((t) => isLossTrade(t)).length;
        const decided = wins + losses;
        const rSum = perf.reduce((s, t) => s + (Number(t?.r ?? t?.netR ?? t?.net_r) || 0), 0);
        const dir = String(runData?.config?.trade_direction ?? "").toLowerCase();
        return {
            runId,
            runLabel: getRunDisplayName(runData || ACTIVE_RUN),
            totalTrades: trades.length,
            performanceTrades: perf.length,
            decidedTrades: decided,
            netR: perf.length ? rSum : null,
            expectancy: perf.length ? rSum / perf.length : null,
            winRate: decided ? wins / decided : null,
            directionRestricted: dir === "long" || dir === "short",
        };
    }, [trades, runData, runId, ACTIVE_RUN]);

    // ── reference delta for the Executive Summary (reuses projectWorkflow) ──────
    const refDelta = useMemo(() => {
        if (!runId) return null;
        const reference = resolveRunReference({ currentRun: ACTIVE_RUN, project: ACTIVE_PROJECT, runs: RUNS });
        if (!reference.run) return { reason: reference.reason, rows: [] };
        const current = summarizeRunForDelta(ACTIVE_RUN, trades);
        const refData = getRunData ? getRunData(reference.run.id) : null;
        const ref = summarizeRunForDelta(reference.run, refData?.trades);
        return { reason: reference.reason, rows: buildRunDelta(current, ref) };
    }, [runId, ACTIVE_RUN, ACTIVE_PROJECT, RUNS, trades, getRunData]);

    // ── select / rank / template cards (pure) ──────────────────────────────────
    const cards = useMemo(
        () => buildRunInsights({
            meta, researchSignals, contextSinkholes, beVerdict,
            failureDrivers, lossTriage, distanceBreakdown,
        }),
        [meta, researchSignals, contextSinkholes, beVerdict, failureDrivers, lossTriage, distanceBreakdown],
    );

    const hasRun = !!runId && trades.length > 0;
    const cardsByCategory = useMemo(() => {
        const map = { warning: [], hurting: [], working: [], opportunity: [] };
        for (const c of cards) (map[c.category] || map.opportunity).push(c);
        return map;
    }, [cards]);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Research Cockpit"
                title="Research Cockpit"
                description="Top-level run research summary — what's working, what's hurting, and what to investigate next. Read-only; every card is provisional and links back to its lab."
                actions={
                    <Link to="/insights">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] border clip-bevel-sm text-white border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.10)] hover:bg-[hsl(var(--accent-secondary)/0.22)] transition-colors">
                            <FolderKanban className="w-3.5 h-3.5" /> Saved Findings
                        </span>
                    </Link>
                }
            />

            <div className="px-6 space-y-4">
                {/* Executive Summary */}
                <NeonPanel
                    title="Executive Summary"
                    tone="primary"
                    action={<Pill tone="muted">{cards.length} insight{cards.length === 1 ? "" : "s"}</Pill>}
                >
                    {!hasRun ? (
                        <div className="py-8 text-center border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                            <Gauge className="w-5 h-5 mx-auto text-muted-lab" />
                            <div className="mt-2 font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Active Run</div>
                            <div className="mt-1 text-[12px] text-[hsl(var(--text-2))]">
                                Import or select a run to populate the cockpit.
                            </div>
                            <Link to="/runs" className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-[hsl(var(--accent-primary))] hover:underline">
                                Open Runs <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-[12px] text-[hsl(var(--text-1))]">
                                <span className="font-semibold">{meta.runLabel}</span>
                                <span className="text-muted-lab"> · {meta.totalTrades} trades · {meta.decidedTrades} decided</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <Metric label="Net R" value={fmtR(meta.netR)} good={num(meta.netR) >= 0} />
                                <Metric label="Expectancy" value={fmtR(meta.expectancy, 2)} good={num(meta.expectancy) >= 0} />
                                <Metric label="Win Rate" value={fmtPct(meta.winRate)} />
                                <Metric label="Decided" value={`${meta.decidedTrades}`} />
                            </div>
                            {refDelta && refDelta.rows.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-[9px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                        vs {referenceReasonLabel(refDelta.reason)}
                                    </span>
                                    {refDelta.rows.filter((r) => r.delta != null).map((r) => (
                                        <Pill key={r.key} tone={r.direction === "up" ? "success" : r.direction === "down" ? "danger" : "muted"}>
                                            {r.label} {r.delta >= 0 ? "+" : ""}{Number(r.delta).toFixed(r.digits)}{r.unit}
                                        </Pill>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10.5px] text-muted-lab leading-relaxed">
                                Insights are derived from this single run's analytics. Nothing here is a confirmed rule —
                                use the source links to investigate, and the existing Save-Finding flow to record anything worth keeping.
                            </p>
                        </div>
                    )}
                </NeonPanel>

                {/* Insight sections */}
                {SECTIONS.map((section) => {
                    const list = cardsByCategory[section.key] || [];
                    if (!list.length) return null;
                    const Icon = section.icon;
                    return (
                        <NeonPanel
                            key={section.key}
                            tone={section.tone}
                            title={
                                <span className="inline-flex items-center gap-2">
                                    <Icon className="w-3.5 h-3.5" /> {section.label}
                                </span>
                            }
                            action={<Pill tone={section.tone}>{list.length}</Pill>}
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid={`cockpit-section-${section.key}`}>
                                {list.map((card) => <InsightCardView key={card.id} card={card} />)}
                            </div>
                        </NeonPanel>
                    );
                })}
            </div>
        </div>
    );
}

function Metric({ label, value, good }) {
    return (
        <div className="px-3 py-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
            <div className="text-[9px] font-ui uppercase tracking-[0.14em] text-muted-lab">{label}</div>
            <div className={`mt-0.5 text-[15px] font-num tabular-nums ${good === undefined ? "text-[hsl(var(--text-1))]" : good ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}`}>
                {value}
            </div>
        </div>
    );
}

function InsightCardView({ card }) {
    return (
        <div
            className="flex flex-col gap-2 p-3 border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.30)] clip-bevel-sm"
            data-testid={`cockpit-card-${card.id}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-[hsl(var(--text-1))] leading-snug">{card.headline}</div>
                <div className="flex shrink-0 items-center gap-1">
                    {card.confidence && <Pill tone={CONFIDENCE_TONE[card.confidence] || "muted"}>{card.confidence}</Pill>}
                    {!card.confidence && card.severity && (
                        <Pill tone={SEVERITY_TONE[card.severity] || "muted"}>{card.severity}</Pill>
                    )}
                </div>
            </div>

            <div className="text-[11px] font-num tabular-nums text-[hsl(var(--text-2))]">{card.evidence}</div>

            {card.caveat && (
                <div className="text-[10px] text-muted-lab italic leading-relaxed">⚠ {card.caveat}</div>
            )}

            {card.suggestedQuestion && (
                <div className="text-[10.5px] text-[hsl(var(--text-2))] leading-relaxed">
                    <span className="text-muted-lab">Next: </span>{card.suggestedQuestion}
                </div>
            )}

            <div className="pt-1">
                <Link
                    to={card.source?.route || "/"}
                    state={card.source?.params || undefined}
                    className="inline-flex items-center gap-1.5 text-[10.5px] font-ui uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:underline"
                >
                    {card.source?.label || "Open source"} <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
        </div>
    );
}
