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
import { useRetestData, RETEST_STATUS } from "./useRetestData";

// ── formatting helpers ──────────────────────────────────────────────────────────
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
const pips = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(d)}`);
const fmtTime = (epochSec) => {
    if (epochSec == null || !isFinite(epochSec)) return "—";
    const dt = new Date(epochSec * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
};

// Survival color bands (C1.5) — uses ONLY existing design tokens, no hardcoded hex.
// 90%+ strong success · 75-90% success · 60-75% neutral · <60% weak.
function survivalBandClass(rate) {
    if (rate == null || !isFinite(rate)) return "text-muted-lab";
    if (rate >= 0.90) return "text-[hsl(var(--success))] text-glow-success font-semibold";
    if (rate >= 0.75) return "text-[hsl(var(--success))]";
    if (rate >= 0.60) return "text-[hsl(var(--warning))]";
    return "text-[hsl(var(--danger))]";
}

const OUTCOME_TONE = { survived: "success", failed: "danger", open: "muted" };
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
    const { status, source, error, candleCount, events, perOB, summary, meta, edgeBreakdowns, bestWorstConditions, sessionMatrix, findings, minN, config, setConfig, retryLoad } = useRetestData({
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
                <div className="text-[13px] font-ui text-[hsl(var(--text-2))]">This run was imported without candle data.</div>
                <div className="text-[11px] text-muted-lab max-w-md leading-relaxed">
                    Retest analysis replays execution-timeframe candles against each OB.
                    Re-import this run with <span className="text-[hsl(var(--text))]">candles.csv</span> included,
                    or load candles via the sidecar, then reopen this tab.
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
                <SessionMatrix matrix={sessionMatrix} minN={minN} />
                <EdgeDiscoveryTabs edgeBreakdowns={edgeBreakdowns} minN={minN} />
                <EventTable events={events} />
            </div>
        </TooltipProvider>
    );
}

// ── Basis banner ──────────────────────────────────────────────────────────────
function BasisBanner({ candleCount, meta, summary, source }) {
    const isBackend = source === "backend";
    return (
        <div className="flex flex-wrap items-center gap-2">
            {isBackend
                ? <HeroBadge tone="success">Backend Verified</HeroBadge>
                : <HeroBadge tone="secondary">Frontend Derived</HeroBadge>}
            {isBackend
                ? <HeroBadge tone="muted">from imported run</HeroBadge>
                : <HeroBadge tone="muted">{candleCount.toLocaleString()} candles</HeroBadge>}
            {!isBackend && meta?.computeMs != null && <HeroBadge tone="muted">{meta.computeMs} ms</HeroBadge>}
            {summary && <HeroBadge tone="muted">{summary.totalRetests} retest events</HeroBadge>}
            <span className="text-[10.5px] text-muted-lab ml-1">
                Open (right-censored) retests are excluded from survival/failure rates.
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
        { label: "Survival Rate", value: closed ? pct(summary.survivalRate, 0) : "—", sub: `${summary.survived} survived (closed)`, tone: "success", icon: ShieldCheck, tip: "retest_survival" },
        { label: "Failure Rate", value: closed ? pct(summary.failureRate, 0) : "—", sub: `${summary.failed} failed (closed)`, tone: "danger", icon: ShieldAlert, tip: "retest_failure_rate" },
        { label: "Avg Reaction", value: pips(summary.avgReactionPips, 1), sub: "pips, closed retests", tone: "primary", icon: Activity, tip: "retest_reaction" },
        { label: "Avg Candles to Fail", value: summary.failed ? pips(summary.avgCandlesToFailure, 1) : "—", sub: "across failed retests", tone: "warning", icon: Timer, tip: "retest_candles_to_failure" },
        { label: "Open (excluded)", value: String(summary.open), sub: "right-censored", tone: "muted", icon: Hourglass, tip: "retest_open" },
    ];
    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
                {cards.map((c) => (
                    <MetricChip key={c.label} label={c.label} value={c.value} sub={c.sub} tone={c.tone} icon={c.icon} size="compact" tip={c.tip} />
                ))}
            </div>
            <div className="text-[10.5px] text-muted-lab leading-relaxed">
                Survived = held without breach inside the reaction window. Reaction threshold is tracked separately as reaction quality.
            </div>
        </div>
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
        { key: "reactionMaxPips", label: "Reaction", align: "right", tip: "retest_reaction",
          render: (r) => (
              <span>
                  {pips(r.reactionMaxPips, 1)}p
                  {!r.reactionMet && <span className="text-muted-lab text-[9.5px]"> weak</span>}
              </span>
          ) },
        { key: "outcome", label: "Outcome", align: "left", render: (r) => <Pill tone={OUTCOME_TONE[r.outcome] || "muted"}>{r.outcome}</Pill> },
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
        { key: "survived", label: "Surv", align: "right" },
        { key: "failed", label: "Fail", align: "right" },
        { key: "open", label: "Open", align: "right" },
        { key: "survivalRate", label: "Survival", align: "right", tip: "retest_survival",
          sortValue: (r) => (r.survivalRate == null ? -1 : r.survivalRate),
          render: (r) => (r.survivalRate == null ? "—" : (
              <span className={r.belowMinN ? "text-muted-lab" : survivalBandClass(r.survivalRate)}>
                  {pct(r.survivalRate, 0)}{r.belowMinN ? " *" : ""}
              </span>
          )) },
        { key: "avgReactionPips", label: "Avg React", align: "right", tip: "retest_reaction", render: (r) => pips(r.avgReactionPips, 1) },
        { key: "avgCandlesToFailure", label: "→ Fail", align: "right", render: (r) => (r.avgCandlesToFailure == null ? "—" : pips(r.avgCandlesToFailure, 1)) },
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

function EdgeDiscoveryTabs({ edgeBreakdowns, minN }) {
    const dims = edgeBreakdowns || {};
    const entries = Object.values(dims).filter((d) => d?.rows?.length);
    const groups = RETEST_DIMENSION_GROUPS.filter((g) => entries.some((e) => e.group === g.key));
    const [active, setActive] = React.useState(groups[0]?.key);
    React.useEffect(() => {
        if (groups.length && !groups.some((g) => g.key === active)) setActive(groups[0].key);
    }, [groups, active]);
    if (!entries.length) return null;
    const activeEntries = entries.filter((e) => e.group === active);
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="panel-title-label uppercase text-title-lab">Retest Edge Discovery</div>
                <div className="text-[10px] text-muted-lab">Survival closed-only; rows below n ≥ {minN} shown but not ranked (*).</div>
            </div>
            <Segment options={groups.map((g) => ({ value: g.key, label: g.label }))} value={active} onChange={setActive} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {activeEntries.map((entry) => <EdgeBreakdownTable key={entry.label} entry={entry} minN={minN} />)}
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
                            <span className={survivalBandClass(c.survivalRate)}>{pct(c.survivalRate, 0)}</span>
                            <span className="text-muted-lab"> · n={c.n} · {pips(c.avgReactionPips, 1)}p</span>
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
                        <span className={survivalBandClass(item.survivalRate)}>{pct(item.survivalRate, 0)} survival</span>
                        <span className="text-muted-lab"> · n={item.n} · {pips(item.avgReactionPips, 1)}p react</span>
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
                        <StrongestCard label={<TermTip termKey="retest_strongest_segment">Strongest survived segment</TermTip>} icon={Trophy} item={bestWorst.best?.[0]} />
                        <StrongestCard label={<TermTip termKey="retest_strongest_segment">Strongest failed segment</TermTip>} icon={ShieldAlert} item={bestWorst.worst?.[0]} />
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
                        Conditions &amp; findings respect a minimum sample of n ≥ {minN}; survival is closed-only (open excluded). Deterministic — derived only from the statistics above.
                    </div>
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
                Survival % by origin session (rows) vs retest session (columns).
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
                                    const muted = cell.belowMinN || cell.survivalRate == null;
                                    return (
                                        <td key={c} className="px-2 py-1.5 text-center tabular-nums">
                                            <div className={muted ? "text-muted-lab" : survivalBandClass(cell.survivalRate)}>
                                                {cell.survivalRate == null ? "—" : pct(cell.survivalRate, 0)}{cell.belowMinN ? " *" : ""}
                                            </div>
                                            <div className="text-[9.5px] text-muted-lab">n={cell.n}</div>
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
