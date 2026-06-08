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
import { Repeat2, ShieldCheck, ShieldAlert, Activity, Timer, Hourglass, Boxes, AlertTriangle, Loader2 } from "lucide-react";
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
    const { status, source, error, candleCount, events, perOB, summary, meta, config, setConfig, retryLoad } = useRetestData({
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
    return (
        <div className="px-6 mt-4 space-y-4">
            <BasisBanner candleCount={candleCount} meta={meta} summary={summary} source={source} />
            <ConfigBar config={config} setConfig={setConfig} source={source} />
            <SummaryCards summary={summary} />
            <Breakdowns events={events} />
            <EventTable events={events} />
        </div>
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
        { label: "Retest Rate", value: summary.obsWithFirstTouch ? pct(summary.retestRate, 0) : "—", sub: "touched OBs revisited", tone: "secondary", icon: Repeat2 },
        { label: "Survival Rate", value: closed ? pct(summary.survivalRate, 0) : "—", sub: `${summary.survived} survived (closed)`, tone: "success", icon: ShieldCheck },
        { label: "Failure Rate", value: closed ? pct(summary.failureRate, 0) : "—", sub: `${summary.failed} failed (closed)`, tone: "danger", icon: ShieldAlert },
        { label: "Avg Reaction", value: pips(summary.avgReactionPips, 1), sub: "pips, closed retests", tone: "primary", icon: Activity },
        { label: "Avg Candles to Fail", value: summary.failed ? pips(summary.avgCandlesToFailure, 1) : "—", sub: "across failed retests", tone: "warning", icon: Timer },
        { label: "Open (excluded)", value: String(summary.open), sub: "right-censored", tone: "muted", icon: Hourglass },
    ];
    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
                {cards.map((c) => (
                    <MetricChip key={c.label} label={c.label} value={c.value} sub={c.sub} tone={c.tone} icon={c.icon} size="compact" />
                ))}
            </div>
            <div className="text-[10.5px] text-muted-lab leading-relaxed">
                Survived = held without breach inside the reaction window. Reaction threshold is tracked separately as reaction quality.
            </div>
        </div>
    );
}

// ── Breakdowns ────────────────────────────────────────────────────────────────
const MIN_N = 5; // suppress rate emphasis below this sample size

function groupRows(events, keyFn, labelFn = (k) => k) {
    const map = new Map();
    for (const e of events) {
        const key = keyFn(e);
        if (key == null || key === "") continue;
        if (!map.has(key)) map.set(key, { key, label: labelFn(key), n: 0, survived: 0, failed: 0, open: 0, reactSum: 0, reactN: 0 });
        const row = map.get(key);
        row.n += 1;
        if (e.outcome === "survived") row.survived += 1;
        else if (e.outcome === "failed") row.failed += 1;
        else row.open += 1;
        if (e.outcome !== "open" && isFinite(e.reactionMaxPips)) { row.reactSum += e.reactionMaxPips; row.reactN += 1; }
    }
    return [...map.values()].map((r) => {
        const closed = r.survived + r.failed;
        return { ...r, survivalRate: closed ? r.survived / closed : null, avgReaction: r.reactN ? r.reactSum / r.reactN : null };
    });
}

function BreakdownTable({ title, rows }) {
    if (!rows.length) return null;
    const columns = [
        { key: "label", label: title, align: "left" },
        { key: "n", label: "Retests", align: "right" },
        { key: "survived", label: "Surv", align: "right" },
        { key: "failed", label: "Fail", align: "right" },
        { key: "open", label: "Open", align: "right" },
        {
            key: "survivalRate", label: "Survival", align: "right",
            sortValue: (r) => (r.survivalRate == null ? -1 : r.survivalRate),
            render: (r) => (
                <span className={r.n < MIN_N ? "text-muted-lab" : (r.survivalRate >= 0.5 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                    {r.survivalRate == null ? "—" : pct(r.survivalRate, 0)}{r.n < MIN_N ? " *" : ""}
                </span>
            ),
        },
        { key: "avgReaction", label: "Avg React", align: "right", render: (r) => pips(r.avgReaction, 1) },
    ];
    return (
        <NeonPanel title={`By ${title}`} dense collapsible defaultCollapsed={false}>
            <DataTable columns={columns} rows={rows} rowKey="key" defaultSortKey="n" compact />
            <div className="mt-1.5 text-[10px] text-muted-lab">* sample below {MIN_N} retests — rate not emphasised.</div>
        </NeonPanel>
    );
}

function Breakdowns({ events }) {
    if (!events.length) return null;
    const bySession = groupRows(events, (e) => e.session);
    const byStructure = groupRows(events, (e) => e.structure);
    const byDirection = groupRows(events, (e) => e.direction, (k) => (k === "bull" ? "Bullish" : "Bearish"));
    const byFirstTouch = groupRows(events, (e) => e.firstTouchOutcome || "untraded");
    const byRetestIdx = groupRows(events, (e) => (e.retestIndex >= 3 ? "3+" : String(e.retestIndex)), (k) => `Retest ${k}`);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <BreakdownTable title="Session" rows={bySession} />
            <BreakdownTable title="Structure" rows={byStructure} />
            <BreakdownTable title="Direction" rows={byDirection} />
            <BreakdownTable title="First-touch outcome" rows={byFirstTouch} />
            <BreakdownTable title="Retest #" rows={byRetestIdx} />
        </div>
    );
}

// ── Event table ───────────────────────────────────────────────────────────────
function EventTable({ events }) {
    const columns = [
        { key: "obId", label: "OB", align: "left", render: (r) => String(r.obId ?? "—") },
        { key: "direction", label: "Dir", align: "left", render: (r) => <Pill tone={r.direction === "bull" ? "success" : "danger"}>{r.direction === "bull" ? "Bull" : "Bear"}</Pill> },
        { key: "structure", label: "Struct", align: "left" },
        { key: "firstTouchTime", label: "First touch", align: "left", render: (r) => fmtTime(r.firstTouchTime) },
        { key: "firstTouchOutcome", label: "FT outcome", align: "left", render: (r) => String(r.firstTouchOutcome || "—") },
        { key: "retestIndex", label: "#", align: "right" },
        { key: "retestTime", label: "Retest time", align: "left", render: (r) => fmtTime(r.retestTime) },
        { key: "retestType", label: "Type", align: "left", render: (r) => RETEST_TYPE_LABEL[r.retestType] || r.retestType },
        { key: "maxPenetrationPct", label: "Max pen", align: "right", render: (r) => `${pips(r.maxPenetrationPct, 0)}%` },
        { key: "reactionMaxPips", label: "Reaction", align: "right", render: (r) => `${pips(r.reactionMaxPips, 1)}p${r.reactionMet ? "" : " ·"}` },
        { key: "outcome", label: "Outcome", align: "left", render: (r) => <Pill tone={OUTCOME_TONE[r.outcome] || "muted"}>{r.outcome}</Pill> },
        { key: "candlesToFailure", label: "→ Fail", align: "right", render: (r) => (r.candlesToFailure == null ? "—" : r.candlesToFailure) },
        { key: "session", label: "Session", align: "left" },
        { key: "minutesSinceFirstTouch", label: "Min since FT", align: "right", render: (r) => (r.minutesSinceFirstTouch == null ? "—" : r.minutesSinceFirstTouch) },
    ];
    return (
        <NeonPanel title={`Retest Events (${events.length})`} dense>
            {events.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-muted-lab">
                    No retests detected for the current criteria. OBs may not have been revisited, or were invalidated on first touch.
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    rows={events.map((e, i) => ({ ...e, _k: `${e.obId}-${e.retestIndex}-${i}` }))}
                    rowKey="_k"
                    defaultSortKey="retestTime"
                    defaultSortDir="asc"
                    maxHeight="540px"
                    compact
                />
            )}
        </NeonPanel>
    );
}

export default RetestLabTab;
