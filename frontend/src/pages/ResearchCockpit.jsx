import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    Gauge, AlertTriangle, ArrowRight, FolderKanban, ListChecks,
    Clock, ArrowLeftRight, Layers, Boxes, Sparkles,
} from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
import { useDataset, getRunDisplayName } from "@/data/store";
import { useRunVariant } from "@/data/useRunVariant";
import { resolveRunDisplayUniverse } from "@/data/resolveDisplayTrades";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "@/data/tradeClassification";
import { buildFillStateBreakdown, buildSessionBreakdown } from "@/data/fillStateBreakdown";
import { buildResearchSignals } from "@/data/researchSignals";
import { buildLossTriage, buildBeVerdict, buildContextSinkholes } from "@/data/lossTriage";
import { buildDistanceAtArmBreakdown } from "@/data/distanceBreakdown";
import { buildExplorer } from "@/components/lab/failures/shared/excursionAnalytics";
import { buildLoserRunUp } from "@/data/loserRunUp";
import { resolveRunReference, summarizeRunForDelta, buildRunDelta, referenceReasonLabel } from "@/data/projectWorkflow";
import { buildRunInsights, buildActionQueue, groupByTopic } from "@/data/runInsights";

// COCKPIT-1 → V2.0A — Research Cockpit (category command-centre shell).
// A top-level, read-only command centre above the labs. It consumes existing pure
// analytics over the ACTIVE run's trades and renders: warnings → executive summary →
// a cross-category Action Queue → topic sections (Sessions/Timing · Direction ·
// Structure · Loss Clusters, plus an "Other signals" catch-all for Phase-1 cards).
// It computes no new metrics, persists nothing, and links to (never reaches into) the
// labs. Saving findings stays in the existing Save-Finding flow — not here.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const fmtR = (v, d = 1) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(d)}R`;
};
const fmtPct = (v) => (v == null ? "—" : `${Math.round(Number(v) * (Number(v) <= 1 ? 100 : 1))}%`);

const CONFIDENCE_TONE = { High: "success", Medium: "info", Low: "warning", "Very Low": "muted" };
const SEVERITY_TONE = { warning: "warning", high: "danger", medium: "warning", low: "muted", opportunity: "info" };

// Per-topic panel chrome (icon + tone). Keys must match COCKPIT_TOPICS + 'general'.
const TOPIC_CHROME = {
    sessions_timing: { icon: Clock,          tone: "info" },
    direction:       { icon: ArrowLeftRight, tone: "secondary" },
    structure:       { icon: Layers,         tone: "secondary" },
    loss_clusters:   { icon: Boxes,          tone: "danger" },
    general:         { icon: Sparkles,       tone: "muted" },
};

export default function ResearchCockpit() {
    const { ACTIVE_RUN, RUNS, ACTIVE_PROJECT, ACTIVE_TRADE_VARIANT, getRunData } = useDataset();

    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);
    // Read-only current trade-view context (Result View banner — same as Protection/News).
    const { universe } = useRunVariant(runId);
    // Variant-aware: read the ACTIVE trade variant (e.g. "TrigE +2"), consistent with
    // RunDetail / Strategy Map — not the bundle's base trades array.
    // Bridge: resolve via the shared run-display universe (falls back to
    // entryResults.tradesByMode for lazy entry-variant runs). Hydration is already
    // triggered above by useRunVariant → useLazyEntryVariant. See RUN-DATA-PATH-AUDIT-1.md.
    const resolved = useMemo(() => resolveRunDisplayUniverse(runData, ACTIVE_TRADE_VARIANT), [runData, ACTIVE_TRADE_VARIANT]);
    const trades = resolved.trades;

    // ── reuse existing pure analytics over the active run's trades ──────────────
    const fillStateBreakdown = useMemo(() => buildFillStateBreakdown(trades), [trades]);
    const sessionBreakdown = useMemo(() => buildSessionBreakdown(trades), [trades]);
    // Entry-model signal candidates are deferred (the classification breakdown is
    // computed inside RunDetail). Passing [] still yields fill-state + session signals.
    const researchSignals = useMemo(
        () => buildResearchSignals(fillStateBreakdown, sessionBreakdown, []),
        [fillStateBreakdown, sessionBreakdown],
    );
    const contextSinkholes = useMemo(() => buildContextSinkholes(trades), [trades]);
    const lossTriage = useMemo(() => buildLossTriage(trades), [trades]);
    const distanceBreakdown = useMemo(() => buildDistanceAtArmBreakdown(trades), [trades]);
    const loserRunUp = useMemo(() => buildLoserRunUp(trades), [trades]);
    // Loss clusters — buildExplorer over a curated dim set carries a TRUE winners-
    // inclusive lift (buildFailureDrivers over losers-only returns lift=1). We keep it
    // to single dimensions in V2.0A; the 2-D cluster map is deferred to V2.1.
    const lossClusters = useMemo(() => {
        const DIMS = [
            { key: "direction", label: "Direction" },
            { key: "structure", label: "Structure" },
            { key: "session",   label: "Session" },
        ];
        const cells = [];
        for (const d of DIMS) {
            const ex = buildExplorer(trades, { dimA: d.key, metric: "lift" });
            if (ex.dimA !== d.key) continue; // requested dim unavailable → skip fallback
            for (const r of ex.rows) {
                if (r.rankable === false) continue;
                cells.push({
                    dimKey: d.key, dimLabel: d.label, value: r.keyA,
                    losers: r.losers, lossR: r.lossR, contributionPct: r.contributionPct,
                    lift: r.lift, rankable: r.rankable,
                });
            }
        }
        return cells;
    }, [trades]);
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
        const lossN = perf.filter((t) => isLossTrade(t)).length;
        const decided = wins + lossN;
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

    // ── select / rank / template cards (pure), then derive the command-centre views ──
    const cards = useMemo(
        () => buildRunInsights({
            meta, researchSignals, contextSinkholes, beVerdict,
            lossClusters, lossTriage, distanceBreakdown,
            sessionBreakdown, loserRunUp,
        }),
        [meta, researchSignals, contextSinkholes, beVerdict, lossClusters,
         lossTriage, distanceBreakdown, sessionBreakdown, loserRunUp],
    );
    const warnings = useMemo(() => cards.filter((c) => c.category === "warning"), [cards]);
    const actionQueue = useMemo(() => buildActionQueue(cards), [cards]);
    const sections = useMemo(() => groupByTopic(cards), [cards]);

    const hasRun = !!runId && trades.length > 0;

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Research Cockpit"
                title="Research Cockpit"
                description="Top-level research command centre — what's working, what's hurting, and what to investigate next. Read-only; every card is provisional and links back to its lab."
                actions={
                    <Link to="/insights">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] border clip-bevel-sm text-white border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.10)] hover:bg-[hsl(var(--accent-secondary)/0.22)] transition-colors">
                            <FolderKanban className="w-3.5 h-3.5" /> Saved Findings
                        </span>
                    </Link>
                }
            />

            {runId && (
                <div className="px-6 mt-2 mb-3">
                    <ResearchResultViewBanner universe={universe} run={buildBannerRunIdentity(ACTIVE_RUN)} />
                </div>
            )}

            <div className="px-6 space-y-4">
                {/* Warnings & Caveats — first */}
                {warnings.length > 0 && (
                    <NeonPanel
                        tone="warning"
                        title={<span className="inline-flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Warnings & Caveats</span>}
                        action={<Pill tone="warning">{warnings.length}</Pill>}
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="cockpit-warnings">
                            {warnings.map((card) => <InsightCardView key={card.id} card={card} />)}
                        </div>
                    </NeonPanel>
                )}

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
                            <div className="text-[12px] text-[hsl(var(--text-1))] flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{meta.runLabel}</span>
                                <span className="text-muted-lab">· {meta.totalTrades} trades · {meta.decidedTrades} decided</span>
                                <Pill tone="info">Variant: {resolved.selectedVariantLabel || "Baseline"}</Pill>
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

                {/* Action Queue — strongest items across categories */}
                {hasRun && actionQueue.length > 0 && (
                    <NeonPanel
                        tone="primary"
                        title={<span className="inline-flex items-center gap-2"><ListChecks className="w-3.5 h-3.5" /> Action Queue</span>}
                        action={<Pill tone="muted">top {actionQueue.length}</Pill>}
                    >
                        <div className="flex flex-col divide-y divide-[hsl(var(--border-soft))]" data-testid="cockpit-action-queue">
                            {actionQueue.map((card, i) => <ActionQueueRow key={card.id} rank={i + 1} card={card} />)}
                        </div>
                    </NeonPanel>
                )}

                {/* Category sections */}
                {hasRun && sections.map((section) => {
                    const chrome = TOPIC_CHROME[section.key] || TOPIC_CHROME.general;
                    const Icon = chrome.icon;
                    return (
                        <NeonPanel
                            key={section.key}
                            tone={chrome.tone}
                            title={<span className="inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" /> {section.label}</span>}
                            action={<Pill tone={section.needsData ? "muted" : chrome.tone}>{section.cards.length}</Pill>}
                        >
                            <div className="text-[10.5px] text-muted-lab mb-2">{section.description}</div>
                            {section.needsData ? (
                                <div className="py-5 text-center border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.18)] clip-bevel-sm" data-testid={`cockpit-section-${section.key}-empty`}>
                                    <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No qualifying cohorts</div>
                                    <div className="mt-1 text-[11px] text-[hsl(var(--text-2))]">
                                        Not enough decided trades in this category yet — needs a larger sample.
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid={`cockpit-section-${section.key}`}>
                                    {section.cards.map((card) => <InsightCardView key={card.id} card={card} />)}
                                </div>
                            )}
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

function CardChip({ card }) {
    if (card.confidence) return <Pill tone={CONFIDENCE_TONE[card.confidence] || "muted"}>{card.confidence}</Pill>;
    if (card.severity) return <Pill tone={SEVERITY_TONE[card.severity] || "muted"}>{card.severity}</Pill>;
    return null;
}

function ActionQueueRow({ rank, card }) {
    return (
        <div className="flex items-center gap-3 py-2" data-testid={`cockpit-queue-${card.id}`}>
            <span className="shrink-0 w-5 text-center text-[11px] font-num tabular-nums text-muted-lab">{rank}</span>
            <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[hsl(var(--text-1))] truncate">{card.headline}</div>
                <div className="text-[10px] font-num tabular-nums text-muted-lab truncate">{card.evidence}</div>
            </div>
            <div className="shrink-0"><CardChip card={card} /></div>
            <Link
                to={card.source?.route || "/"}
                state={card.source?.params || undefined}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:underline"
            >
                Open <ArrowRight className="w-3 h-3" />
            </Link>
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
                <div className="flex shrink-0 items-center gap-1"><CardChip card={card} /></div>
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
