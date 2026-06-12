/**
 * RetestLabTab — Order Block Lab "Retest Lab" tab (Phase 1, frontend-derived).
 *
 * Thin presentation layer over useRetestData. Renders, in gate order:
 *   no run → no candles → loading → failed → ready (basis banner, config bar,
 *   summary cards, breakdown panels, event table).
 *
 * No chart overlays and no best/worst-condition cards in Phase 1 (deferred).
 * All retest computation lives in data/obRetest.js.
 */
import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { Field, Segment, HeroBadge, NeonButton } from "@/components/lab/controls";
import { TermTip, TooltipProvider } from "@/components/lab/TermTip";
import { Repeat2, ShieldCheck, ShieldAlert, Activity, Timer, Hourglass, Boxes, AlertTriangle, Loader2, TrendingUp, TrendingDown, Trophy, Lightbulb } from "lucide-react";
import { RETEST_DIMENSION_GROUPS } from "@/data/obRetestResearch";
import { SectionRoadmap } from "@/components/lab/roadmap/SectionRoadmap";
import { useRetestData, RETEST_STATUS } from "./useRetestData";

// ── formatting helpers ──────────────────────────────────────────────────────────
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const pips = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(d)}`);
// Median R (2dp) vs a discrete R threshold (e.g. 2.5R) — kept distinct so the
// suggested target/BE read as the threshold levels they are.
const fmtR2 = (v) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(2)}R`);
const fmtThresholdR = (v) => (v == null || !isFinite(v) ? "—" : `${Number(v)}R`);
const fmtTime = (epochSec) => {
    if (epochSec == null || !isFinite(epochSec)) return "—";
    const dt = new Date(epochSec * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
};

// Color bands — use ONLY existing design tokens, no hardcoded hex.
// Window-hold bands (legacy C1.5 thresholds): 90%+ strong · 75-90% good · 60-75%
// neutral · <60% weak. Hold rates run structurally high (see survival audit), so
// these are deliberately strict.
function holdBandClass(rate) {
    if (rate == null || !isFinite(rate)) return "text-muted-lab";
    if (rate >= 0.90) return "text-[hsl(var(--success))] text-glow-success font-semibold";
    if (rate >= 0.75) return "text-[hsl(var(--success))]";
    if (rate >= 0.60) return "text-[hsl(var(--warning))]";
    return "text-[hsl(var(--danger))]";
}

// Reaction-success bands — recalibrated lower: requiring a real favorable move
// makes rates run well below window-hold. 70%+ strong · 50-70% good · 35-50%
// neutral · <35% weak.
function reactionBandClass(rate) {
    if (rate == null || !isFinite(rate)) return "text-muted-lab";
    if (rate >= 0.70) return "text-[hsl(var(--success))] text-glow-success font-semibold";
    if (rate >= 0.50) return "text-[hsl(var(--success))]";
    if (rate >= 0.35) return "text-[hsl(var(--warning))]";
    return "text-[hsl(var(--danger))]";
}

// Event-table outcome display: "survived" is shown as a HOLD (window-scoped),
// split into strong (reaction met) vs weak (no reaction) — see survival audit.
const OUTCOME_TONE = { survived: "success", failed: "danger", open: "muted" };
function outcomePill(e) {
    if (e.outcome === "survived") {
        return e.reactionMet
            ? <Pill tone="success">held</Pill>
            : <Pill tone="warning">held · weak</Pill>;
    }
    return <Pill tone={OUTCOME_TONE[e.outcome] || "muted"}>{e.outcome}</Pill>;
}
const RETEST_TYPE_LABEL = {
    wick_only: "Wick-only",
    clean: "Clean",
    deep: "Deep",
    close_inside: "Close-inside",
    full_penetration_no_invalidation: "Full pen · alive",
};

// Empty/loading/error shell — keeps the gate states visually consistent.
function GateShell({ title, badge, children }) {
    return (
        <div className="px-6 mt-4">
            <NeonPanel title={title} action={badge}>
                <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
                    {children}
                </div>
            </NeonPanel>
        </div>
    );
}

export function RetestLabTab({ orderBlocks = [], trades = [], activeRun = null, activeRunId = null, enabled = false }) {
    const { status, source, error, candleCount, events, perOB, summary, meta, edgeBreakdowns, bestWorstConditions, sessionMatrix, findings, monetizationSummary, tradeability, minN, config, setConfig, retryLoad } = useRetestData({
        orderBlocks, trades, activeRun, activeRunId, enabled,
    });

    // ── Gates ─────────────────────────────────────────────────────────────────
    if (status === RETEST_STATUS.NO_RUN) {
        return (
            <GateShell title="Retest Lab">
                <div className="text-[13px] font-ui text-[hsl(var(--text-2))]">Import a run to analyse OB retests.</div>
                <div className="text-[11px] text-muted-lab max-w-sm leading-relaxed">
                    Retest Lab reconstructs later returns to each order block from candle data,
                    and reports how often retested OBs survive or fail.
                </div>
            </GateShell>
        );
    }

    if (status === RETEST_STATUS.NO_CANDLES) {
        return (
            <GateShell title="Retest Lab" badge={<Pill tone="muted">No candles</Pill>}>
                <div className="text-[13px] font-ui text-[hsl(var(--text-2))]">No candle data is available for this run.</div>
                <div className="text-[11px] text-muted-lab max-w-md leading-relaxed">
                    Retest analysis replays execution-timeframe candles against each OB. We tried to
                    load candles for this run (in-memory and via the sidecar) and found none — re-run or
                    re-import it with <span className="text-[hsl(var(--text))]">candles.csv</span> included,
                    or import the backend <span className="text-[hsl(var(--text))]">ob_retests.csv</span> for verified results.
                </div>
            </GateShell>
        );
    }

    if (status === RETEST_STATUS.LOADING) {
        return (
            <GateShell title="Retest Lab">
                <Loader2 className="w-5 h-5 text-[hsl(var(--accent-primary))] animate-spin" />
                <div className="text-[12px] text-muted-lab">Loading candles &amp; computing retests…</div>
            </GateShell>
        );
    }

    if (status === RETEST_STATUS.FAILED) {
        return (
            <GateShell title="Retest Lab" badge={<Pill tone="danger">Load failed</Pill>}>
                <AlertTriangle className="w-5 h-5 text-[hsl(var(--danger))]" />
                <div className="text-[12px] text-[hsl(var(--text-2))] max-w-md leading-relaxed">{error || "Could not load candle data."}</div>
                <NeonButton tone="ghost" onClick={retryLoad}>Retry</NeonButton>
            </GateShell>
        );
    }

    // ── READY ───────────────────────────────────────────────────────────────────
    // IA (C1.6): Intelligence hero → Session Matrix → categorized Edge Discovery
    // tabs → (collapsed) raw event table. One TooltipProvider wraps the surface.
    return (
        <TooltipProvider>
            <div className="px-6 mt-4 space-y-4">
                <BasisBanner candleCount={candleCount} meta={meta} summary={summary} source={source} />
                <ConfigBar config={config} setConfig={setConfig} source={source} />
                <RetestIntelligence bestWorst={bestWorstConditions} findings={findings} minN={minN} />
                <SummaryCards summary={summary} />
                <ObLevelCards summary={summary} />
                <MonetizationSection mon={monetizationSummary} />
                <SessionMatrix matrix={sessionMatrix} minN={minN} />
                <EdgeDiscoveryTabs edgeBreakdowns={edgeBreakdowns} tradeability={tradeability} minN={minN} />
                <EventTable events={events} />
            </div>
        </TooltipProvider>
    );
}

// ── Basis banner ──────────────────────────────────────────────────────────────
function BasisBanner({ candleCount, meta, summary, source }) {
    const isBackend = source === "backend";
    const isV1 = isBackend && meta?.engineVersion !== 2;
    return (
        <div className="flex flex-wrap items-center gap-2">
            {isBackend
                ? <HeroBadge tone="success"><TermTip termKey="retest_backend_computed">Backend Computed</TermTip></HeroBadge>
                : <HeroBadge tone="secondary">Frontend Derived</HeroBadge>}
            {isV1
                ? <HeroBadge tone="warning"><TermTip termKey="retest_engine_version">engine v1 · pre-invalidation fix</TermTip></HeroBadge>
                : <HeroBadge tone="muted"><TermTip termKey="retest_engine_version">engine v2</TermTip></HeroBadge>}
            {isBackend
                ? <HeroBadge tone="muted">from imported run</HeroBadge>
                : <HeroBadge tone="muted">{candleCount.toLocaleString()} candles</HeroBadge>}
            {!isBackend && meta?.computeMs != null && <HeroBadge tone="muted">{meta.computeMs} ms</HeroBadge>}
            {summary && <HeroBadge tone="muted">{summary.totalRetests} retest events</HeroBadge>}
            <span className="text-[10.5px] text-muted-lab ml-1">
                Rates are window-based (see Window Hold %); open (right-censored) retests are excluded.
            </span>
            <span className="ml-auto">
                <SectionRoadmap sectionKey="retest-lab" />
            </span>
        </div>
    );
}

// ── Config bar ────────────────────────────────────────────────────────────────
function ConfigBar({ config, setConfig, source }) {
    // Backend mode: criteria were fixed by the exporter at run time. The artifact
    // does not carry those params, so we show an informational read-only notice
    // rather than interactive controls that would falsely imply recomputation.
    if (source === "backend") {
        return (
            <NeonPanel title="Retest Criteria" dense>
                <div className="text-[11px] text-muted-lab leading-relaxed">
                    Criteria were applied by the backend exporter at run time (read-only).
                    Re-import a run exported with different settings to change them.
                </div>
            </NeonPanel>
        );
    }
    return (
        <NeonPanel title="Retest Criteria" dense>
            <div className="flex flex-wrap items-end gap-5">
                <Field label="Reaction window (candles)">
                    <Segment
                        options={[{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "20", label: "20" }]}
                        value={String(config.reactionWindowCandles)}
                        onChange={(v) => setConfig({ reactionWindowCandles: Number(v) })}
                    />
                </Field>
                <Field label="Min reaction (pips)">
                    <Segment
                        options={[{ value: "0", label: "0" }, { value: "4", label: "4" }, { value: "8", label: "8" }, { value: "12", label: "12" }]}
                        value={String(config.reactionMinPips)}
                        onChange={(v) => setConfig({ reactionMinPips: Number(v) })}
                    />
                </Field>
                <Field label="Failure threshold">
                    <Segment
                        options={[{ value: "close_beyond_ob", label: "Close beyond" }, { value: "wick_beyond_ob", label: "Wick beyond" }]}
                        value={config.failureThreshold}
                        onChange={(v) => setConfig({ failureThreshold: v })}
                    />
                </Field>
            </div>
        </NeonPanel>
    );
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
    if (!summary) return null;
    // Rates are only meaningful when their denominator is non-zero: retest rate
    // needs touched OBs; survival/failure rates need at least one *closed* retest
    // (open/right-censored retests are excluded). Show "—" rather than a misleading 0%.
    const closed = summary.survived + summary.failed;
    const cards = [
        { label: "OBs Retested", value: String(summary.obsRetested), sub: `of ${summary.obsWithFirstTouch} touched`, tone: "primary", icon: Boxes },
        { label: "Retest Rate", value: summary.obsWithFirstTouch ? pct(summary.retestRate, 0) : "—", sub: "touched OBs revisited", tone: "secondary", icon: Repeat2, tip: "retest_rate" },
        // Headline: held AND produced the configured minimum favorable move.
        { label: "Reaction Success %", value: closed ? pct(summary.reactionSuccessRate, 0) : "—", sub: `${summary.reactionSuccessCount} held + reacted (closed)`, tone: "success", icon: ShieldCheck, tip: "retest_reaction_success" },
        // The old "Survival Rate", renamed to what it actually measures.
        { label: "Window Hold %", value: closed ? pct(summary.windowHoldRate, 0) : "—", sub: `${summary.survived} held window (closed)`, tone: "secondary", icon: Activity, tip: "retest_window_hold" },
        { label: "Weak Hold %", value: closed ? pct(summary.weakHoldRate, 0) : "—", sub: `${summary.weakHoldCount} held, no reaction`, tone: "warning", icon: Hourglass, tip: "retest_weak_hold" },
        { label: "Failure Rate", value: closed ? pct(summary.failureRate, 0) : "—", sub: `${summary.failed} failed (closed)`, tone: "danger", icon: ShieldAlert, tip: "retest_failure_rate" },
        { label: "Avg Max Favorable", value: pips(summary.avgReactionPips, 1), sub: "pips, closed retests", tone: "primary", icon: TrendingUp, tip: "retest_reaction" },
        { label: "Median Candles to Fail", value: summary.failed ? pips(summary.medianCandlesToFailure, 1) : "—", sub: "across failed retests", tone: "warning", icon: Timer, tip: "retest_candles_to_failure" },
        { label: "Open (excluded)", value: String(summary.open), sub: "right-censored", tone: "muted", icon: Hourglass, tip: "retest_open" },
    ];
    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {cards.map((c) => (
                    <MetricChip key={c.label} label={c.label} value={c.value} sub={c.sub} tone={c.tone} icon={c.icon} size="compact" tip={c.tip} />
                ))}
            </div>
            <div className="text-[10.5px] text-muted-lab leading-relaxed">
                Window Hold = no close-breach inside the reaction window (a hold, not eventual survival).
                Reaction Success additionally requires the configured minimum favorable move; Weak Hold held
                without one. Reaction Success % + Weak Hold % + Failure Rate = 100% of closed retests.
                Engine v2 also tracks breaches between windows — see OB Outcomes below.
            </div>
        </div>
    );
}

// ── OB-level outcomes (engine v2 — continuous invalidation) ──────────────────────
// Eventual-failure stats per OB (not per event). Renders ONLY when terminal data
// exists (frontend-derived v2 or a v2 backend summary artifact) — v1 artifacts get
// nothing here rather than fake zeros.
function ObLevelCards({ summary }) {
    const ol = summary?.obLevel;
    if (!ol) return null;
    const cards = [
        { label: "Eventual Failure %", value: pct(ol.eventualFailureRate, 0), sub: `${ol.obsInvalidated} OBs invalidated (any mode)`, tone: "danger", icon: ShieldAlert, tip: "retest_eventual_failure" },
        { label: "Delayed Failures", value: String(ol.delayedFailureCount), sub: `${pct(ol.delayedFailureShare, 0)} of invalidations between windows`, tone: "warning", icon: Timer, tip: "retest_delayed_failure" },
        { label: "Median Time to Invalidation", value: ol.medianTimeToInvalidationMinutes == null ? "—" : `${ol.medianTimeToInvalidationMinutes}m`, sub: "first touch → breach", tone: "secondary", icon: Hourglass, tip: "retest_time_to_invalidation" },
        { label: "Alive at Data End", value: String(ol.obsAliveAtDataEnd + (ol.obsCapped || 0)), sub: `censored${ol.obsCapped ? ` (incl. ${ol.obsCapped} capped)` : ""} — counted as not-failed`, tone: "muted", icon: Boxes, tip: "retest_censored_obs" },
    ];
    return (
        <NeonPanel title={<TermTip termKey="retest_eventual_failure">OB Outcomes — Eventual Failure (v2)</TermTip>} dense>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {cards.map((c) => (
                    <MetricChip key={c.label} label={c.label} value={c.value} sub={c.sub} tone={c.tone} icon={c.icon} size="compact" tip={c.tip} />
                ))}
            </div>
            <div className="mt-1.5 text-[10px] text-muted-lab leading-relaxed">
                Per-OB (not per-retest): breaches are tracked on every candle after first touch, including
                between reaction windows. Censored OBs (data ended while alive) count as not-failed — a
                conservative lower bound on eventual failure.
            </div>
        </NeonPanel>
    );
}

// (The pre-C1 basic Breakdowns block was removed in C1.6 — every dimension it
// showed now lives, with min-N gating + survival bands, in the categorized
// Edge Discovery tabs below. No research dimension was lost in the move.)

// ── Event table (C1.6 collapsed default; C1.7 incremental View More) ─────────────
function EventTable({ events }) {
    const DEFAULT_ROWS = 10;
    const STEP = 10;
    const total = events.length;
    const [visible, setVisible] = React.useState(DEFAULT_ROWS);
    const shown = events.slice(0, visible);
    const columns = [
        { key: "obId", label: "OB", align: "left", render: (r) => String(r.obId ?? "—") },
        { key: "direction", label: "Dir", align: "left", tip: "retest_direction", render: (r) => <Pill tone={r.direction === "bull" ? "success" : "danger"}>{r.direction === "bull" ? "Bull" : "Bear"}</Pill> },
        { key: "structure", label: "Struct", align: "left", tip: "retest_structure" },
        { key: "firstTouchTime", label: "First touch", align: "left", render: (r) => fmtTime(r.firstTouchTime) },
        { key: "firstTouchOutcome", label: "FT outcome", align: "left", tip: "retest_first_touch_outcome", render: (r) => String(r.firstTouchOutcome || "—") },
        { key: "retestIndex", label: "#", align: "right", tip: "retest_number" },
        { key: "retestTime", label: "Retest time", align: "left", render: (r) => fmtTime(r.retestTime) },
        { key: "retestType", label: "Type", align: "left", render: (r) => RETEST_TYPE_LABEL[r.retestType] || r.retestType },
        { key: "maxPenetrationPct", label: "Max pen", align: "right", tip: "retest_max_penetration", render: (r) => `${pips(r.maxPenetrationPct, 0)}%` },
        { key: "reactionMaxPips", label: "Max Fav", align: "right", tip: "retest_reaction",
          render: (r) => (
              <span>
                  {pips(r.reactionMaxPips, 1)}p
                  {!r.reactionMet && <span className="text-muted-lab text-[9.5px]"> weak</span>}
              </span>
          ) },
        { key: "outcome", label: "Outcome", align: "left", render: (r) => outcomePill(r) },
        { key: "candlesToFailure", label: "→ Fail", align: "right", render: (r) => (r.candlesToFailure == null ? "—" : r.candlesToFailure) },
        { key: "session", label: "Session", align: "left", tip: "retest_retest_session" },
        { key: "minutesSinceFirstTouch", label: "Min since FT", align: "right", render: (r) => (r.minutesSinceFirstTouch == null ? "—" : r.minutesSinceFirstTouch) },
    ];
    return (
        <NeonPanel title={`Retest Events (${total})`} dense>
            {total === 0 ? (
                <div className="py-6 text-center text-[12px] text-muted-lab">
                    No retests detected for the current criteria. OBs may not have been revisited, or were invalidated on first touch.
                </div>
            ) : (
                <>
                    <DataTable
                        columns={columns}
                        rows={shown.map((e, i) => ({ ...e, _k: `${e.obId}-${e.retestIndex}-${i}` }))}
                        rowKey="_k"
                        defaultSortKey="retestTime"
                        defaultSortDir="asc"
                        maxHeight={shown.length > 25 ? "560px" : undefined}
                        compact
                    />
                    {total > DEFAULT_ROWS && (
                        <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                            <span className="text-[10.5px] text-muted-lab mr-1">Showing {shown.length} of {total}</span>
                            {visible < total && (
                                <NeonButton tone="ghost" onClick={() => setVisible((v) => Math.min(total, v + STEP))}>
                                    View {Math.min(STEP, total - visible)} more
                                </NeonButton>
                            )}
                            {visible < total && (
                                <NeonButton tone="ghost" onClick={() => setVisible(total)}>
                                    Expand all ({total})
                                </NeonButton>
                            )}
                            {visible > DEFAULT_ROWS && (
                                <NeonButton tone="ghost" onClick={() => setVisible(DEFAULT_ROWS)}>
                                    Collapse
                                </NeonButton>
                            )}
                        </div>
                    )}
                </>
            )}
        </NeonPanel>
    );
}

// ── Retest Edge Discovery (C1.6 — categorized + survival bands + tooltips) ───────
function EdgeBreakdownTable({ entry, minN }) {
    const rows = entry?.rows || [];
    if (!rows.length) return null;
    const columns = [
        { key: "key", label: entry.label, align: "left", tip: entry.tip,
          render: (r) => (r.belowMinN ? <span className="text-muted-lab">{r.key} *</span> : r.key) },
        { key: "n", label: "n", align: "right", tip: "retest_sample" },
        { key: "survived", label: "Held", align: "right" },
        { key: "failed", label: "Fail", align: "right" },
        { key: "open", label: "Open", align: "right" },
        // Primary % — held AND reaction met (closed-only).
        { key: "reactionSuccessRate", label: "React Succ", align: "right", tip: "retest_reaction_success",
          sortValue: (r) => (r.reactionSuccessRate == null ? -1 : r.reactionSuccessRate),
          render: (r) => (r.reactionSuccessRate == null ? "—" : (
              <span className={r.belowMinN ? "text-muted-lab" : reactionBandClass(r.reactionSuccessRate)}>
                  {pct(r.reactionSuccessRate, 0)}{r.belowMinN ? " *" : ""}
              </span>
          )) },
        // Secondary % — the old "Survival", renamed.
        { key: "windowHoldRate", label: "Window Hold", align: "right", tip: "retest_window_hold",
          sortValue: (r) => (r.windowHoldRate == null ? -1 : r.windowHoldRate),
          render: (r) => (r.windowHoldRate == null ? "—" : (
              <span className={r.belowMinN ? "text-muted-lab" : holdBandClass(r.windowHoldRate)}>
                  {pct(r.windowHoldRate, 0)}{r.belowMinN ? " *" : ""}
              </span>
          )) },
        { key: "avgReactionPips", label: "Avg Max Fav", align: "right", tip: "retest_reaction", render: (r) => pips(r.avgReactionPips, 1) },
        { key: "medianCandlesToFailure", label: "Med → Fail", align: "right", tip: "retest_candles_to_failure",
          render: (r) => (r.medianCandlesToFailure == null ? "—" : pips(r.medianCandlesToFailure, 1)) },
    ];
    const hasThin = rows.some((r) => r.belowMinN);
    return (
        <NeonPanel title={entry.label} dense collapsible defaultCollapsed={false}>
            <DataTable columns={columns} rows={rows} rowKey="key" defaultSortKey="n" compact />
            {hasThin && (
                <div className="mt-1.5 text-[10px] text-muted-lab">* = below min sample (n &lt; {minN}); shown but not ranked/emphasized.</div>
            )}
        </NeonPanel>
    );
}

// Tradeability view of one dimension (Phase 2 Step 4). Conditioned monetization by
// cohort — reads tradeability.dimensions[dimKey] (buildTradeabilityRows output). For
// dimensions excluded from the precompute (generic event-grain) or otherwise without
// attributable MFE, renders a compact explanation instead of faking numbers.
function TradeabilityTable({ entry, dimResult, minN }) {
    if (!dimResult || !dimResult.monetizationAvailable) {
        return (
            <NeonPanel title={entry.label} dense collapsible defaultCollapsed={false}>
                <div className="text-[11px] text-muted-lab leading-relaxed">
                    {dimResult?.reason || "This dimension is event-grain. OB-level MFE cannot be attributed safely."}
                </div>
            </NeonPanel>
        );
    }
    const rows = dimResult.rows || [];
    if (!rows.length) return null;
    const capCell = (v) => (v == null ? <span className="text-muted-lab">n/a</span> : pct(v, 0));
    const columns = [
        { key: "key", label: entry.label, align: "left", tip: entry.tip,
          render: (r) => (r.belowMinN ? <span className="text-muted-lab">{r.key} *</span> : r.key) },
        { key: "n", label: "n", align: "right", tip: "retest_sample" },
        { key: "reactionSuccessRate", label: "React Succ", align: "right", tip: "retest_reaction_success",
          sortValue: (r) => (r.reactionSuccessRate == null ? -1 : r.reactionSuccessRate),
          render: (r) => (r.reactionSuccessRate == null ? "—" : (
              <span className={r.belowMinN ? "text-muted-lab" : reactionBandClass(r.reactionSuccessRate)}>
                  {pct(r.reactionSuccessRate, 0)}{r.belowMinN ? " *" : ""}
              </span>
          )) },
        { key: "medianMfeR", label: "Med MFE", align: "right", tip: "retest_mfe_before_death",
          sortValue: (r) => (r.medianMfeR == null ? -1 : r.medianMfeR),
          render: (r) => fmtR2(r.medianMfeR) },
        { key: "capture1R", label: "1R", align: "right", tip: "retest_rr_capture", render: (r) => capCell(r.capture1R) },
        { key: "capture2R", label: "2R", align: "right", tip: "retest_rr_capture", render: (r) => capCell(r.capture2R) },
        { key: "capture3R", label: "3R", align: "right", tip: "retest_rr_capture", render: (r) => capCell(r.capture3R) },
        { key: "capture5R", label: "5R", align: "right", tip: "retest_rr_capture", render: (r) => capCell(r.capture5R) },
        { key: "suggestedTargetR", label: "Target", align: "right", tip: "retest_suggested_target",
          sortValue: (r) => (r.suggestedTargetR == null ? -1 : r.suggestedTargetR),
          render: (r) => (r.suggestedTargetR == null ? "—" : (
              <span className={r.belowMinN ? "text-muted-lab" : undefined}>
                  {r.targetFromFallback ? "≈" : ""}{fmtThresholdR(r.suggestedTargetR)}
              </span>
          )) },
        { key: "suggestedBETriggerR", label: "BE Trig", align: "right", tip: "retest_be_trigger",
          sortValue: (r) => (r.suggestedBETriggerR == null ? -1 : r.suggestedBETriggerR),
          render: (r) => fmtThresholdR(r.suggestedBETriggerR) },
    ];
    const isRetestAnchor = dimResult.mfeAnchor === "retest";
    const hasThin = rows.some((r) => r.belowMinN);
    const hasFallback = rows.some((r) => r.targetFromFallback);
    return (
        <NeonPanel title={entry.label} dense collapsible defaultCollapsed={false}>
            <DataTable columns={columns} rows={rows} rowKey="key" defaultSortKey="n" compact />
            <div className="mt-1.5 space-y-0.5">
                {isRetestAnchor && <div className="text-[10px] text-muted-lab">Per-retest MFE anchors (R1/R2/R3); 3R/5R capture isn’t measured at retest anchors (n/a).</div>}
                {hasFallback && <div className="text-[10px] text-muted-lab">≈ = target fell back to the cohort median (no R level cleared the capture floor).</div>}
                {hasThin && <div className="text-[10px] text-muted-lab">* = below min sample (n &lt; {minN}); shown but not ranked.</div>}
            </div>
        </NeonPanel>
    );
}

function EdgeDiscoveryTabs({ edgeBreakdowns, tradeability, minN }) {
    const dims = edgeBreakdowns || {};
    const entryPairs = Object.entries(dims).filter(([, d]) => d?.rows?.length);
    const groups = RETEST_DIMENSION_GROUPS.filter((g) => entryPairs.some(([, e]) => e.group === g.key));
    const [active, setActive] = React.useState(groups[0]?.key);
    const [mode, setMode] = React.useState("react"); // "react" | "trade"
    React.useEffect(() => {
        if (groups.length && !groups.some((g) => g.key === active)) setActive(groups[0].key);
    }, [groups, active]);
    const tradeAvailable = !!tradeability?.available;
    // If the run isn't v2.1 (or becomes unavailable), keep the toggle on "react".
    React.useEffect(() => {
        if (!tradeAvailable && mode === "trade") setMode("react");
    }, [tradeAvailable, mode]);
    if (!entryPairs.length) return null;
    const activePairs = entryPairs.filter(([, e]) => e.group === active);
    const tradeMode = mode === "trade" && tradeAvailable;
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="panel-title-label uppercase text-title-lab">Retest Edge Discovery</div>
                {tradeAvailable ? (
                    <Segment
                        options={[{ value: "react", label: "Does it react?" }, { value: "trade", label: "How to trade it?" }]}
                        value={mode}
                        onChange={setMode}
                    />
                ) : (
                    <span className="text-[10px] text-muted-lab">
                        “How to trade it?” needs v2.1 monetization data{tradeability?.reason ? ` — ${tradeability.reason}` : ""}.
                    </span>
                )}
            </div>
            <div className="text-[10px] text-muted-lab">
                {tradeMode ? (
                    <span>
                        <TermTip termKey="retest_idealized_r">Idealized opportunity</TermTip> conditioned by cohort: capture, suggested
                        target &amp; BE trigger. 1R = OB width — not realized PnL. The run-wide curve stays in Monetization Before Death above.
                    </span>
                ) : (
                    <span>Reaction success &amp; window hold are closed-only; rows below n ≥ {minN} shown but not ranked (*).</span>
                )}
            </div>
            <Segment options={groups.map((g) => ({ value: g.key, label: g.label }))} value={active} onChange={setActive} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {activePairs.map(([key, entry]) => (
                    tradeMode
                        ? <TradeabilityTable key={key} entry={entry} dimResult={tradeability.dimensions?.[key]} minN={minN} />
                        : <EdgeBreakdownTable key={entry.label} entry={entry} minN={minN} />
                ))}
            </div>
        </div>
    );
}

// ── Retest Intelligence hero (C1.5) ─────────────────────────────────────────────
function ConditionList({ title, icon: Icon, items }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-lab mb-1.5">
                {Icon && <Icon className="w-3 h-3" />}{title}
            </div>
            <div className="space-y-1">
                {(items || []).length === 0 ? (
                    <div className="text-[11px] text-muted-lab">—</div>
                ) : items.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                        <span className="text-[hsl(var(--text-2))] truncate">{c.condition}</span>
                        <span className="shrink-0 tabular-nums">
                            <span className={reactionBandClass(c.reactionSuccessRate)}>{pct(c.reactionSuccessRate, 0)}</span>
                            <span className="text-muted-lab"> · hold {pct(c.windowHoldRate, 0)} · n={c.n} · {pips(c.avgReactionPips, 1)}p</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StrongestCard({ label, icon: Icon, item }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-lab">
                {Icon && <Icon className="w-3 h-3" />}{label}
            </div>
            {item ? (
                <>
                    <div className="text-[13px] text-[hsl(var(--text))] mt-1 leading-snug">{item.condition}</div>
                    <div className="mt-1 text-[12px]">
                        <span className={reactionBandClass(item.reactionSuccessRate)}>{pct(item.reactionSuccessRate, 0)} reaction success</span>
                        <span className="text-muted-lab"> · hold {pct(item.windowHoldRate, 0)} · n={item.n} · {pips(item.avgReactionPips, 1)}p</span>
                    </div>
                </>
            ) : (
                <div className="text-[12px] text-muted-lab mt-1">Not enough samples</div>
            )}
        </div>
    );
}

function RetestIntelligence({ bestWorst, findings, minN }) {
    const eligible = bestWorst?.eligible || 0;
    return (
        <NeonPanel title={<TermTip termKey="retest_intelligence">Retest Intelligence</TermTip>} tone="primary">
            {eligible === 0 ? (
                <div className="py-4 text-center text-[12px] text-muted-lab">
                    Not enough samples yet (need n ≥ {minN} per condition) to surface intelligence — see breakdowns below.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <StrongestCard label={<TermTip termKey="retest_strongest_segment">Strongest reaction segment</TermTip>} icon={Trophy} item={bestWorst.best?.[0]} />
                        <StrongestCard label={<TermTip termKey="retest_strongest_segment">Weakest reaction segment</TermTip>} icon={ShieldAlert} item={bestWorst.worst?.[0]} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ConditionList title={<TermTip termKey="retest_best_worst">Top positive conditions</TermTip>} icon={TrendingUp} items={bestWorst.best} />
                        <ConditionList title={<TermTip termKey="retest_best_worst">Top negative conditions</TermTip>} icon={TrendingDown} items={bestWorst.worst} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-lab mb-1.5">
                            <Lightbulb className="w-3 h-3" /><TermTip termKey="retest_key_findings">Key findings</TermTip>
                        </div>
                        {(findings || []).length === 0 ? (
                            <div className="text-[11px] text-muted-lab">No strong findings at n ≥ {minN} yet.</div>
                        ) : (
                            <ul className="space-y-1">
                                {findings.map((f, i) => (
                                    <li key={i} className="text-[12px] text-[hsl(var(--text-2))] leading-snug">
                                        • {f.text} <span className="text-muted-lab">(n={f.samples})</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="text-[10px] text-muted-lab">
                        Conditions &amp; findings ranked by reaction success (held + min favorable move), closed-only (open excluded),
                        minimum sample n ≥ {minN}. Window hold shown as the secondary stat. Deterministic — derived only from the statistics above.
                    </div>
                </div>
            )}
        </NeonPanel>
    );
}

// ── Monetization Before Death (Phase D — v2.1 fields via obRetestMonetization) ──
// Tiny presentational table (deterministic row order; plain <table> like the
// Session Matrix so no sort state is involved).
const MINI_ALIGN = { left: "text-left", right: "text-right", center: "text-center" };
function MiniTable({ columns, rows, rowKey }) {
    return (
        <table className="w-full border-collapse text-[11.5px] font-display">
            <thead>
                <tr>
                    {columns.map((c) => (
                        <th key={c.label} className={`px-2 py-1 text-[10px] uppercase tracking-[0.05em] text-title-lab whitespace-nowrap ${MINI_ALIGN[c.align] || MINI_ALIGN.left}`}>
                            {c.tip ? <TermTip termKey={c.tip}>{c.label}</TermTip> : c.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r[rowKey]} className="border-t border-[hsl(var(--border-soft)/0.4)]">
                        {columns.map((c) => (
                            <td key={c.label} className={`px-2 py-1 tabular-nums ${MINI_ALIGN[c.align] || MINI_ALIGN.left} text-[hsl(var(--text-2))]`}>
                                {c.render ? c.render(r) : r[c.key]}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function MonetizationSection({ mon }) {
    if (!mon) return null;
    if (!mon.available) {
        // v1/v2 artifacts: explain instead of rendering zeros.
        return (
            <NeonPanel title={<TermTip termKey="retest_monetization">Monetization Before Death</TermTip>} dense collapsible defaultCollapsed>
                <div className="text-[11px] text-muted-lab leading-relaxed">
                    {mon.reason || "Monetization data is unavailable for this run."}
                </div>
            </NeonPanel>
        );
    }
    const { rrCapture, ttiBuckets, decayByRetest } = mon;
    const pt = (r) => rrCapture.points.find((p) => p.r === r);
    const fmtR = (v) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(2)}R`);
    const cards = [
        { label: "Median MFE Before Death", value: fmtR(mon.medianMfeBeforeDeathR), sub: `${mon.eligibleN} touched OBs`, tone: "primary", icon: TrendingUp, tip: "retest_mfe_before_death" },
        { label: "1R Capture", value: pct(pt(1)?.share, 0), sub: `${pt(1)?.captured ?? "—"} of ${rrCapture.eligibleN}`, tone: "success", icon: Trophy, tip: "retest_rr_capture" },
        { label: "2R Capture", value: pct(pt(2)?.share, 0), sub: `${pt(2)?.captured ?? "—"} of ${rrCapture.eligibleN}`, tone: "secondary", icon: Activity, tip: "retest_rr_capture" },
        { label: "5R Capture", value: pct(pt(5)?.share, 0), sub: `${pt(5)?.captured ?? "—"} of ${rrCapture.eligibleN}`, tone: "warning", icon: Lightbulb, tip: "retest_rr_capture" },
    ];
    return (
        <NeonPanel title={<TermTip termKey="retest_monetization">Monetization Before Death</TermTip>} dense collapsible defaultCollapsed={false}>
            <div className="text-[10.5px] text-muted-lab leading-relaxed mb-2.5">
                <TermTip termKey="retest_idealized_r">Idealized opportunity only</TermTip>: 1R = OB width, entry at
                proximal edge, stop at distal edge. Not realized PnL.
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
                {cards.map((c) => (
                    <MetricChip key={c.label} label={c.label} value={c.value} sub={c.sub} tone={c.tone} icon={c.icon} size="compact" tip={c.tip} />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-lab mb-1.5">
                        <TermTip termKey="retest_rr_capture">RR Capture</TermTip>
                    </div>
                    <MiniTable
                        rowKey="r"
                        rows={rrCapture.points}
                        columns={[
                            { label: "Target", render: (r) => `≥ ${r.r}R` },
                            { label: "n", align: "right", render: (r) => r.captured },
                            { label: "Capture", align: "right", render: (r) => pct(r.share, 0) },
                        ]}
                    />
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-lab mb-1.5">
                        <TermTip termKey="retest_tti_distribution">Time To Invalidation</TermTip>
                    </div>
                    <MiniTable
                        rowKey="key"
                        rows={ttiBuckets.buckets}
                        columns={[
                            { label: "Bucket", render: (r) => r.label },
                            { label: "n", align: "right", render: (r) => r.n },
                            { label: "Share", align: "right", render: (r) => pct(r.share, 0) },
                        ]}
                    />
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-muted-lab mb-1.5">
                        <TermTip termKey="retest_decay_by_retest">Decay By Retest</TermTip>
                    </div>
                    <MiniTable
                        rowKey="key"
                        rows={decayByRetest.rows}
                        columns={[
                            { label: "Retest", render: (r) => r.key },
                            { label: "n", align: "right", render: (r) => r.n },
                            { label: "Med MFE", align: "right", render: (r) => fmtR(r.medianR) },
                            { label: "≥1R", align: "right", render: (r) => pct(r.capture1R, 0) },
                            { label: "≥2R", align: "right", render: (r) => pct(r.capture2R, 0) },
                        ]}
                    />
                </div>
            </div>
            {mon.excludedNoWidth > 0 && (
                <div className="mt-2 text-[10px] text-muted-lab">
                    {mon.excludedNoWidth} OB{mon.excludedNoWidth === 1 ? "" : "s"} excluded from R calculations because OB width was unavailable.
                </div>
            )}
        </NeonPanel>
    );
}

// ── Session Matrix (C1.5) — Origin × Retest survival grid ───────────────────────
function SessionMatrix({ matrix, minN }) {
    if (!matrix || !matrix.rows?.length || !matrix.cols?.length) return null;
    const { rows, cols, cells } = matrix;
    return (
        <NeonPanel title={<TermTip termKey="retest_session_matrix">Session Matrix — Origin × Retest</TermTip>} dense>
            <div className="text-[10.5px] text-muted-lab mb-2">
                Reaction success % (window hold % below) by origin session (rows) vs retest session (columns).
                <span className="ml-1">* = below min sample (n &lt; {minN}); muted, not emphasized.</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
                <table className="border-collapse text-[11.5px] font-display">
                    <thead>
                        <tr>
                            <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.05em] text-title-lab whitespace-nowrap">Origin ↓ / Retest →</th>
                            {cols.map((c) => (
                                <th key={c} className="px-2 py-1.5 text-center text-[10px] uppercase tracking-[0.05em] text-title-lab whitespace-nowrap">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((o) => (
                            <tr key={o} className="border-t border-[hsl(var(--border-soft)/0.4)]">
                                <td className="px-2 py-1.5 text-left text-[hsl(var(--text-2))] whitespace-nowrap">{o}</td>
                                {cols.map((c) => {
                                    const cell = cells[o]?.[c];
                                    if (!cell || cell.n === 0) return <td key={c} className="px-2 py-1.5 text-center text-muted-lab">·</td>;
                                    const muted = cell.belowMinN || cell.reactionSuccessRate == null;
                                    return (
                                        <td key={c} className="px-2 py-1.5 text-center tabular-nums">
                                            <div className={muted ? "text-muted-lab" : reactionBandClass(cell.reactionSuccessRate)}>
                                                {cell.reactionSuccessRate == null ? "—" : pct(cell.reactionSuccessRate, 0)}{cell.belowMinN ? " *" : ""}
                                            </div>
                                            <div className="text-[9.5px] text-muted-lab">
                                                hold {cell.windowHoldRate == null ? "—" : pct(cell.windowHoldRate, 0)} · n={cell.n}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

export default RetestLabTab;
