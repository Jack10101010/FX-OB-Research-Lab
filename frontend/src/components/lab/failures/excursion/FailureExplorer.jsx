// ── FailureExplorer.jsx ──────────────────────────────────────────────────────
// Controlled failure-exploration surface over the shared aggregation engine
// (failuresAggregation.js via excursionAnalytics.buildExplorer). Pick 1–2
// dimensions + a ranking metric + a sample floor; capped at two dimensions (no
// N-way / waterfall mining).
//
// ISOLATION / FUTURE TAB (V4 Phase 2, Phase G): this component is fully prop-driven
// (allTrades / allLosers / bucket) and reaches into NO parent internals. To promote
// it into a dedicated "Failure Explorer" tab later, render it with allTrades +
// allLosers and bucket={null}; the analytics stay in the shared modules untouched.
//
// SCOPE: the user analyses one of three populations —
//   • All trades  — winners + losers (loss-rate & lift are genuine population stats)
//   • All losers  — every losing trade in the cohort
//   • Selected bucket — the losers inside the clicked raw-R bucket ("what caused THIS
//     bucket?"). Buckets are a loser-only concept, so loss rate is 100% by definition
//     in the two loser scopes; lift / contribution / trade-share carry the signal.

import React, { useMemo, useState, useEffect } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { TermTip } from "@/components/lab/TermTip";
import { buildExplorer, buildBucketExplorerRows, pickWorstSetupRow, EXPLORER_METRICS, EXPLORER_FLOORS, isHighlightCell } from "../shared/excursionAnalytics";
import { SectionRoadmap } from "@/components/lab/roadmap/SectionRoadmap";

// Lift = loss-R share ÷ trade share. >1 ⇒ disproportionate (a real driver).
// Shared by the Explorer, the driver / pair tables, and the MFE-by-dimension panels.
export function LiftCell({ lift }) {
    const color = lift >= 1.5 ? "hsl(var(--danger))"
        : lift >= 1.15 ? "hsl(var(--warning))"
        : "hsl(var(--text-2))";
    return <span className="w-12 text-right font-num tabular-nums" style={{ color, fontWeight: lift >= 1.15 ? 600 : 400 }}>{lift}×</span>;
}

// Δ vs baseline loss rate. Green = loses LESS often than baseline (below); red =
// MORE often (above); neutral when within ±2 pts.
function DeltaCell({ delta }) {
    const near = Math.abs(delta) < 2;
    const color = near ? "hsl(var(--text-2))" : delta > 0 ? "hsl(var(--danger))" : "hsl(var(--success))";
    return <span className="font-num tabular-nums" style={{ color, fontWeight: near ? 400 : 600 }}>{delta > 0 ? "+" : ""}{delta}%</span>;
}

function ExplorerSelect({ label, value, onChange, options, includeNone = false }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="[color-scheme:dark] bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] text-[hsl(var(--text))] text-[11.5px] font-ui rounded px-2 py-1.5 clip-bevel-sm focus:outline-none focus:border-[hsl(var(--accent-primary)/0.6)]"
            >
                {includeNone && <option value="">None</option>}
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        </label>
    );
}

function ScopeButton({ active, onClick, children }) {
    return (
        <button type="button" onClick={onClick}
            className={cn(
                "px-2.5 py-1 text-[11px] font-ui clip-bevel-sm border transition-colors",
                active ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]",
            )}>
            {children}
        </button>
    );
}

function Stat({ label, value, tone }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">{label}</span>
            <span className={cn("text-[13px] font-num tabular-nums", tone || "text-[hsl(var(--text))]")}>{value}</span>
        </div>
    );
}

// ── UI persistence (per-browser; no backend, no data rows) ─────────────────────
const EXPLORER_PREFS_KEY = "fxob.failures.distanceToStop.explorer.v1";
const SCOPE_VALUES = ["bucket", "alllosers", "alltrades"];
const SORT_VALUES = ["lossRate", "netR", "fullLossR", "bucketLossR", "bucketLosses", "pf", "lift"];
const EXPLORER_ADV_KEYS = ["lift", "delta", "tradeShare", "lossShare"];

function loadExplorerPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(EXPLORER_PREFS_KEY) || "{}");
        return p && typeof p === "object" ? p : {};
    } catch { return {}; }
}
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export function FailureExplorer({ allTrades = [], allLosers = [], bucket = null }) {
    // Per-browser UI persistence (no backend, no data rows) — restore last-used
    // controls. Invalid persisted dimension keys fall back gracefully because the
    // engine resolves an unavailable dim to the first available one.
    const initialPrefs = useMemo(loadExplorerPrefs, []);
    const [scope, setScope] = useState(() => pick(initialPrefs.scope, SCOPE_VALUES, "bucket")); // bucket | alllosers | alltrades
    const [dimA, setDimA] = useState(() => (typeof initialPrefs.dimA === "string" ? initialPrefs.dimA : "session"));
    const [dimB, setDimB] = useState(() => (typeof initialPrefs.dimB === "string" ? initialPrefs.dimB : ""));
    const [metric, setMetric] = useState(() => pick(initialPrefs.metric, EXPLORER_METRICS.map((m) => m.key), "lift"));
    const [floor, setFloor] = useState(() => (EXPLORER_FLOORS.includes(initialPrefs.floor) ? initialPrefs.floor : 8));
    // Bucket-scorecard controls: optional advanced columns (default all off) + sort.
    const [advCols, setAdvCols] = useState(() => {
        const p = (initialPrefs.advCols && typeof initialPrefs.advCols === "object") ? initialPrefs.advCols : {};
        return EXPLORER_ADV_KEYS.reduce((o, k) => { o[k] = !!p[k]; return o; }, {});
    });
    const [bucketSort, setBucketSort] = useState(() => pick(initialPrefs.bucketSort, SORT_VALUES, "lossRate"));
    const [showOverall, setShowOverall] = useState(() => (typeof initialPrefs.showOverall === "boolean" ? initialPrefs.showOverall : true));

    // Persist UI state (per-browser). Never persists data rows or selections.
    useEffect(() => {
        try {
            localStorage.setItem(EXPLORER_PREFS_KEY, JSON.stringify({ scope, dimA, dimB, metric, floor, advCols, bucketSort, showOverall }));
        } catch { /* storage unavailable — ignore */ }
    }, [scope, dimA, dimB, metric, floor, advCols, bucketSort, showOverall]);

    // Effective scope: "bucket" only applies when a bucket is selected.
    const effScope = (scope === "bucket" && !bucket) ? "alltrades" : scope;
    const inBucketMode = effScope === "bucket" && !!bucket;
    const losersScope = effScope === "alllosers"; // loser-only population (loss rate trivially 100%)

    const population = useMemo(() => {
        if (effScope === "alllosers") return allLosers;
        return allTrades; // alltrades scope (bucket mode uses its own dual-population builder)
    }, [effScope, allLosers, allTrades]);

    // Bucket mode: dual-population scorecard — bucket-band metrics (losers + winners)
    // AND the full valid-universe win/loss record per setup, both keyed off the same
    // dimension value(s). bucketKey lets the engine band winners with the same logic.
    const bexp = useMemo(
        () => (inBucketMode
            ? buildBucketExplorerRows({ bucketLosers: bucket.losers ?? [], bucketKey: bucket.key, allTrades, dimA, dimB: dimB || null, sampleFloor: floor })
            : null),
        [inBucketMode, bucket, allTrades, dimA, dimB, floor],
    );
    // Non-bucket scopes: standard single-population aggregation.
    const exp = useMemo(
        () => (inBucketMode ? null : buildExplorer(population, { dimA, dimB: dimB || null, sampleFloor: floor, metric })),
        [inBucketMode, population, dimA, dimB, floor, metric],
    );
    const result = inBucketMode ? bexp : exp;

    // Bucket scorecard: sort (default worst overall loss rate first) + worst-row id.
    const bucketRows = useMemo(() => {
        if (!inBucketMode || !bexp) return [];
        const pfv = (c) => (c.fullProfitFactor == null ? Infinity : c.fullProfitFactor);
        const cmp = ({
            lossRate: (a, b) => (b.fullLossRate - a.fullLossRate) || (Math.abs(b.fullLossR) - Math.abs(a.fullLossR)),
            netR: (a, b) => (a.fullNetR - b.fullNetR) || (b.fullLossRate - a.fullLossRate),       // worst (most negative) net first
            fullLossR: (a, b) => (Math.abs(b.fullLossR) - Math.abs(a.fullLossR)) || (b.fullLossRate - a.fullLossRate),
            bucketLossR: (a, b) => (Math.abs(b.bucketLossR) - Math.abs(a.bucketLossR)) || (b.fullLossRate - a.fullLossRate),
            bucketLosses: (a, b) => (b.bucketLosses - a.bucketLosses) || (b.fullLossRate - a.fullLossRate),
            pf: (a, b) => (pfv(a) - pfv(b)) || (b.fullLossRate - a.fullLossRate),                 // worst (lowest) PF first
            lift: (a, b) => (b.lift - a.lift) || (b.fullLossRate - a.fullLossRate),
        })[bucketSort] || (() => 0);
        return [...bexp.rows].sort((a, b) => (Number(b.rankable) - Number(a.rankable)) || cmp(a, b));
    }, [inBucketMode, bexp, bucketSort]);
    const worstRow = useMemo(() => (inBucketMode ? pickWorstSetupRow(bexp?.rows || []) : null), [inBucketMode, bexp]);
    const worstId = worstRow ? (worstRow.keyB != null ? `${worstRow.keyA}·${worstRow.keyB}` : worstRow.keyA) : null;

    if (!result.available.length && !bucket) {
        return (
            <NeonPanel title="Failure Explorer" action={<div className="flex items-center gap-2"><SectionRoadmap sectionKey="distance-to-stop" /><Pill tone="muted">controlled · max 2 dimensions</Pill></div>}>
                <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No categorical dimensions are available in this run to explore.</div>
            </NeonPanel>
        );
    }

    const dimBOpts = result.available.filter((d) => d.key !== result.dimA);
    const hasB = !!result.dimB;
    const aLabel = result.available.find((d) => d.key === result.dimA)?.label ?? "Value A";
    const bLabel = result.available.find((d) => d.key === result.dimB)?.label ?? "Value B";

    // "Analyzing" headline for the current scope.
    const analyzing = inBucketMode
        ? { title: `${bucket.label} losers`, trades: bucket.trades, lossR: bucket.lossR, share: bucket.contributionPct }
        : effScope === "alllosers"
            ? { title: "All losers", trades: exp.totals.trades, lossR: exp.totals.lossR, share: 100 }
            : { title: "All trades (winners + losers)", trades: exp.totals.trades, lossR: exp.totals.lossR, share: null };

    return (
        <NeonPanel title="Failure Explorer" action={<div className="flex items-center gap-2"><SectionRoadmap sectionKey="distance-to-stop" /><Pill tone="muted">controlled · max 2 dimensions</Pill></div>}>
            <div className="p-3 space-y-3">
                {/* ── Zone 1: scope + "Analyzing" header ─────────────────────── */}
                <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))] mr-1">Analyzing</span>
                        {bucket && <ScopeButton active={effScope === "bucket"} onClick={() => setScope("bucket")}>Selected bucket: {bucket.label}</ScopeButton>}
                        <ScopeButton active={effScope === "alllosers"} onClick={() => setScope("alllosers")}>All losers</ScopeButton>
                        <ScopeButton active={effScope === "alltrades"} onClick={() => setScope("alltrades")}>All trades</ScopeButton>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                        <Stat label="Cohort" value={analyzing.title} />
                        <Stat label="Trades" value={analyzing.trades} tone="text-white" />
                        <Stat label="Loss-R" value={`${analyzing.lossR}R`} tone="text-[hsl(var(--danger))]" />
                        {analyzing.share != null && <Stat label="% of total loss-R" value={`${analyzing.share}%`} tone="text-[hsl(var(--accent-secondary))]" />}
                    </div>
                </div>

                {/* ── Zone 2: controls ───────────────────────────────────────── */}
                <div className="flex flex-wrap items-end gap-3 border-b border-[hsl(var(--border-soft)/0.6)] pb-3">
                    <ExplorerSelect label="Dimension A" value={result.dimA ?? ""} onChange={setDimA} options={result.available} />
                    <ExplorerSelect label="Dimension B" value={result.dimB ?? ""} onChange={setDimB} options={dimBOpts} includeNone />
                    {!inBucketMode && <ExplorerSelect label="Rank by" value={metric} onChange={setMetric} options={EXPLORER_METRICS} />}
                    <div className="flex flex-col gap-1">
                        <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">Sample floor</span>
                        <div className="flex items-center gap-1">
                            {EXPLORER_FLOORS.map((f) => (
                                <button key={f} type="button" onClick={() => setFloor(f)}
                                    className={cn("px-2 py-1.5 text-[11px] font-num tabular-nums clip-bevel-sm border transition-colors",
                                        f === floor
                                            ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                                            : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]")}>
                                    ≥{f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* explainer */}
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    {inBucketMode
                        ? <>When a bucket is selected, the first group of columns describes trades <span className="text-[hsl(var(--text))]">inside that MFE bucket</span>. The <span className="text-[hsl(var(--text))]">Overall</span> columns show the <span className="text-[hsl(var(--text))]">full valid win/loss record</span> for the same setup across the run. Bucket wins are winners whose peak (<TermTip termKey="mfe">MFE</TermTip>) also landed in this band — shown as “—” when winners carry no MFE data.</>
                        : losersScope
                            ? <>Losing trades only — loss rate is 100% and Δ ≈ 0 by definition here, so read <TermTip termKey="lift">lift</TermTip> and contribution.</>
                            : <>Across all trades (winners + losers), so loss rate, <TermTip termKey="loss_rate_delta">Δ vs baseline</TermTip> and <TermTip termKey="lift">lift</TermTip> are real. <TermTip termKey="lift">Lift</TermTip> = <TermTip termKey="loss_share">loss share</TermTip> ÷ <TermTip termKey="trade_share">trade share</TermTip> (2.0× = twice as damaging as expected; 0.5× = half).</>}
                </p>

                {/* ── Zone 3: results ────────────────────────────────────────── */}
                {!result.rows.length ? (
                    <div className="p-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No cells for this selection.</div>
                ) : inBucketMode ? (
                    /* Bucket scorecard: Bucket group + Overall valid-setup group per row. */
                    (() => {
                        const r1 = (v) => Math.round(v * 10) / 10;
                        const r2 = (v) => Math.round(v * 100) / 100;
                        const fmtLossR = (v) => (v > 0 ? `-${v}R` : "0R");
                        const fmtPF = (pf, pos) => (pf == null ? (pos > 0 ? "∞" : "—") : pf);
                        const lossRateColor = (lr) => (lr >= 65 ? "hsl(var(--danger))" : lr >= 55 ? "hsl(var(--warning))" : "hsl(var(--text))");
                        const netColor = (v) => (v > 0 ? "hsl(var(--success))" : v < 0 ? "hsl(var(--danger))" : "hsl(var(--text-2))");
                        const netNode = (v) => <span style={{ color: netColor(v) }}>{v > 0 ? "+" : ""}{v}R</span>;
                        const pfColor = (pf, pos) => (pf == null ? (pos > 0 ? "hsl(var(--success))" : "hsl(var(--text-2))") : pf > 1 ? "hsl(var(--success))" : pf < 1 ? "hsl(var(--danger))" : "hsl(var(--text-2))");
                        const pfNode = (pf, pos) => <span style={{ color: pfColor(pf, pos) }}>{fmtPF(pf, pos)}</span>;
                        const tdNum = "text-right py-2 px-2 font-num tabular-nums";
                        const setupCell = "text-left py-2 pr-2 sticky left-0 z-[1] bg-[hsl(var(--panel))] group-hover:bg-[hsl(var(--panel-2))]"; // sticky first column for laptop width
                        const toggle = (k) => setAdvCols((s) => ({ ...s, [k]: !s[k] }));

                        // Totals across the rows currently shown (reflects filtering / sample floor).
                        const T = bucketRows.reduce((a, c) => {
                            a.bL += c.bucketLosses;
                            if (c.bucketWinsKnown) a.bW += c.bucketWins; else a.bWpartial = true;
                            a.bLossR += c.bucketLossR;
                            a.fL += c.fullLosses; a.fW += c.fullWins; a.fT += c.fullTotal;
                            a.fLossR += c.fullLossR; a.fPos += c.fullPosR;
                            return a;
                        }, { bL: 0, bW: 0, bLossR: 0, fL: 0, fW: 0, fT: 0, fLossR: 0, fPos: 0, bWpartial: false });
                        const tFullLossRate = T.fT ? r1((T.fL / T.fT) * 100) : 0;
                        const tNetR = r1(T.fPos - T.fLossR);
                        const tPF = T.fLossR > 0 ? r2(T.fPos / T.fLossR) : null;

                        // Optional advanced columns (default OFF) — appended to the Overall group.
                        // +R / −R / Net R / PF are now PERMANENT overall columns (rendered inline below).
                        const ADV = [
                            { key: "lift", name: "Lift", th: <TermTip termKey="lift">Lift</TermTip>,
                                cell: (c) => <td key="lift" className="text-right py-2 px-2"><LiftCell lift={c.lift} /></td>,
                                tot: () => <td key="lift" className={`${tdNum} text-[hsl(var(--text-3))]`}>—</td> },
                            { key: "delta", name: "Δ vs baseline", th: <TermTip termKey="loss_rate_delta">Δ base</TermTip>,
                                cell: (c) => <td key="delta" className="text-right py-2 px-2"><DeltaCell delta={c.lossRateDelta} /></td>,
                                tot: () => <td key="delta" className={`${tdNum} text-[hsl(var(--text-3))]`}>—</td> },
                            { key: "tradeShare", name: "Trade share", th: <TermTip termKey="trade_share">Trade %</TermTip>,
                                cell: (c) => <td key="tradeShare" className={`${tdNum} text-[hsl(var(--text-2))]`}>{c.tradeSharePct}%</td>,
                                tot: () => <td key="tradeShare" className={`${tdNum} text-[hsl(var(--text-3))]`}>—</td> },
                            { key: "lossShare", name: "Loss share", th: <TermTip termKey="loss_share">Loss %</TermTip>,
                                cell: (c) => <td key="lossShare" className={`${tdNum} text-[hsl(var(--text-2))]`}>{c.lossSharePct}%</td>,
                                tot: () => <td key="lossShare" className={`${tdNum} text-[hsl(var(--text-3))]`}>—</td> },
                        ];
                        const advOn = ADV.filter((a) => advCols[a.key]);
                        const overallSpan = 8 + advOn.length; // Losses,Wins,Total,LossRate,+R,−R,NetR,PF + advanced

                        return (
                            <>
                                {/* Show-Overall toggle + optional columns + sort */}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-ui text-[hsl(var(--text-2))]">
                                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[hsl(var(--text))]">
                                        <input type="checkbox" checked={showOverall} onChange={() => setShowOverall((v) => !v)}
                                            className="appearance-none w-3.5 h-3.5 rounded-[3px] cursor-pointer transition-colors border border-[hsl(var(--border-soft))] bg-[hsl(var(--text-2))] checked:bg-[hsl(var(--accent-primary))] checked:border-[hsl(var(--accent-primary))]" />
                                        Show Overall Setup Stats
                                    </label>
                                    <span className="h-3 w-px bg-[hsl(var(--border-soft))]" />
                                    <span className="uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">Columns</span>
                                    {ADV.map((a) => (
                                        <label key={a.key} className={cn("inline-flex items-center gap-1 select-none", showOverall ? "cursor-pointer" : "opacity-40 cursor-not-allowed")}>
                                            <input type="checkbox" disabled={!showOverall} checked={!!advCols[a.key]} onChange={() => toggle(a.key)}
                                                className="appearance-none w-3.5 h-3.5 rounded-[3px] cursor-pointer transition-colors border border-[hsl(var(--border-soft))] bg-[hsl(var(--text-2))] checked:bg-[hsl(var(--accent-primary))] checked:border-[hsl(var(--accent-primary))] disabled:cursor-not-allowed" />
                                            {a.name}
                                        </label>
                                    ))}
                                    <span className="ml-auto inline-flex items-center gap-1.5">
                                        <span className="uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">Sort</span>
                                        <select value={bucketSort} onChange={(e) => setBucketSort(e.target.value)}
                                            className="[color-scheme:dark] bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] text-[hsl(var(--text))] text-[10.5px] font-ui rounded px-1.5 py-1 clip-bevel-sm focus:outline-none">
                                            <option value="lossRate">Overall loss rate</option>
                                            <option value="netR">Overall Net R</option>
                                            <option value="fullLossR">Overall −R</option>
                                            <option value="bucketLossR">Bucket −R</option>
                                            <option value="bucketLosses">Bucket losses</option>
                                            <option value="pf">Profit Factor</option>
                                            <option value="lift">Lift</option>
                                        </select>
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11.5px] font-ui border-collapse">
                                        <thead>
                                            {/* group header */}
                                            <tr className="text-[9px] uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">
                                                <th className="py-1 pr-2 sticky left-0 z-[3] bg-[hsl(var(--panel))]" />
                                                <th className="py-1 px-2 text-center bg-[hsl(var(--panel-2)/0.4)] border-l border-[hsl(var(--border-soft))]" colSpan={4}>Bucket: {bucket.label}</th>
                                                {showOverall && (
                                                    <th className="py-1 px-2 text-center border-l border-[hsl(var(--border-soft))]" colSpan={overallSpan}>
                                                        <TermTip termKey="overall_setup">Overall valid setup</TermTip>
                                                    </th>
                                                )}
                                            </tr>
                                            {/* sub header */}
                                            <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                                                <th className="text-left font-medium py-1.5 pr-2 sticky left-0 z-[3] bg-[hsl(var(--panel))]">Setup</th>
                                                <th className="text-right font-medium py-1.5 px-2 border-l border-[hsl(var(--border-soft))]">Total</th>
                                                <th className="text-right font-medium py-1.5 px-2">Losses</th>
                                                <th className="text-right font-medium py-1.5 px-2">Wins</th>
                                                <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></th>
                                                {showOverall && <>
                                                    <th className="text-right font-medium py-1.5 px-2 border-l border-[hsl(var(--border-soft))]">Total</th>
                                                    <th className="text-right font-medium py-1.5 px-2">Losses</th>
                                                    <th className="text-right font-medium py-1.5 px-2">Wins</th>
                                                    <th className="text-right font-medium py-1.5 px-2">+R</th>
                                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">−R</TermTip></th>
                                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="net_r">Net R</TermTip></th>
                                                    <th className="text-right font-medium py-1.5 px-2">Loss rate</th>
                                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="profit_factor">PF</TermTip></th>
                                                    {advOn.map((a) => <th key={a.key} className="text-right font-medium py-1.5 px-2">{a.th}</th>)}
                                                </>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bucketRows.map((c) => {
                                                const id = c.keyB != null ? `${c.keyA}·${c.keyB}` : c.keyA;
                                                const setup = c.keyB != null ? `${c.keyA} + ${c.keyB}` : c.keyA;
                                                const isWorst = id === worstId;
                                                const bWins = c.bucketWinsKnown ? c.bucketWins : "—";
                                                const bTotal = c.bucketWinsKnown ? c.bucketTotal : "—";
                                                return (
                                                    <tr key={id}
                                                        className={cn(
                                                            "group border-b border-[hsl(var(--border-soft)/0.5)] transition-colors",
                                                            c.lowSample && "opacity-60",
                                                            isWorst ? "bg-[hsl(var(--danger)/0.08)] hover:bg-[hsl(var(--danger)/0.16)]" : "hover:bg-[hsl(var(--panel-2)/0.5)]",
                                                        )}>
                                                        <td className={cn(setupCell, "text-[hsl(var(--text))] truncate max-w-[190px]")}>{setup}</td>
                                                        {/* Bucket group */}
                                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--danger))] border-l border-[hsl(var(--border-soft)/0.5)]">{c.bucketLosses}</td>
                                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--success))]">{bWins}</td>
                                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--text))]">{bTotal}</td>
                                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--danger))]">{fmtLossR(c.bucketLossR)}</td>
                                                        {/* Overall group */}
                                                        {showOverall && <>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--danger))] border-l border-[hsl(var(--border-soft)/0.5)]">{c.fullLosses}</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--success))]">{c.fullWins}</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums text-white">{c.fullTotal}</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums font-semibold" style={{ color: lossRateColor(c.fullLossRate) }}>{c.fullLossRate}%</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--success))]">+{c.fullPosR}R</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--danger))]">{fmtLossR(c.fullNegR)}</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums">{netNode(c.fullNetR)}</td>
                                                            <td className="text-right py-2 px-2 font-num tabular-nums">{pfNode(c.fullProfitFactor, c.fullPosR)}</td>
                                                            {advOn.map((a) => a.cell(c))}
                                                        </>}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-[hsl(var(--border-mid))] text-[11px] font-ui">
                                                <td className="text-left py-2 pr-2 text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] sticky left-0 z-[2] bg-[hsl(var(--panel))]">All shown ({bucketRows.length})</td>
                                                <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--danger))] border-l border-[hsl(var(--border-soft)/0.5)]">{T.bL}</td>
                                                <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--success))]">{T.bW}{T.bWpartial ? "*" : ""}</td>
                                                <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--text))]">{T.bL + T.bW}{T.bWpartial ? "*" : ""}</td>
                                                <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--danger))]">{fmtLossR(r1(T.bLossR))}</td>
                                                {showOverall && <>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--danger))] border-l border-[hsl(var(--border-soft)/0.5)]">{T.fL}</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--success))]">{T.fW}</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-white">{T.fT}</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold" style={{ color: lossRateColor(tFullLossRate) }}>{tFullLossRate}%</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--success))]">+{r1(T.fPos)}R</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold text-[hsl(var(--danger))]">{fmtLossR(r1(T.fLossR))}</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold">{netNode(tNetR)}</td>
                                                    <td className="text-right py-2 px-2 font-num tabular-nums font-semibold">{pfNode(tPF, T.fPos)}</td>
                                                    {advOn.map((a) => a.tot())}
                                                </>}
                                            </tr>
                                        </tfoot>
                                    </table>
                                    <p className="px-1 pt-2 text-[10px] font-ui text-[hsl(var(--text-3))]">
                                        Bucket columns = trades whose peak MFE fell in {bucket.label}. Overall columns = the full valid record for the same setup — Net R &amp; PF show whether it pays for its losses (PF &gt; 1 profitable). Loss-R / −R shown negative; the worst overall setup is tinted red.{T.bWpartial ? " * bucket wins exclude setups whose winners carry no MFE data." : ""}
                                    </p>
                                </div>
                            </>
                        );
                    })()
                ) : (
                    /* All-trades / all-losers scope: single-population cohort context. */
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11.5px] font-ui border-collapse">
                            <thead>
                                <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                                    <th className="text-left font-medium py-1.5 pr-2">{aLabel}</th>
                                    {hasB && <th className="text-left font-medium py-1.5 pr-2">{bLabel}</th>}
                                    <th className="text-right font-medium py-1.5 px-2">L / W</th>
                                    <th className="text-right font-medium py-1.5 px-2">Total</th>
                                    <th className="text-right font-medium py-1.5 px-2">Loss rate</th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_rate_delta">Δ base</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="trade_share">Trade %</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_share">Loss %</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="lift">Lift</TermTip></th>
                                    <th className="text-right font-medium py-1.5 pl-2">Sample</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.rows.map((c) => {
                                    const hot = isHighlightCell(c);
                                    return (
                                        <tr key={hasB ? `${c.keyA}·${c.keyB}` : c.keyA}
                                            className={cn(
                                                "border-b border-[hsl(var(--border-soft)/0.5)] transition-colors",
                                                c.lowSample && "opacity-50",
                                                hot ? "bg-[hsl(var(--danger)/0.08)] hover:bg-[hsl(var(--danger)/0.16)]" : "hover:bg-[hsl(var(--panel-2)/0.5)]",
                                            )}>
                                            <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[160px]">
                                                {hot && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--danger))] mr-1.5 align-middle" />}{c.keyA}
                                            </td>
                                            {hasB && <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[140px]">{c.keyB}</td>}
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]"><span className="text-[hsl(var(--danger))]">{c.losers}L</span> / <span className="text-[hsl(var(--success))]">{c.winners}W</span></td>
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-white">{c.totalTrades}</td>
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text))]">{c.lossRate}%</td>
                                            <td className="text-right py-1.5 px-2"><DeltaCell delta={c.lossRateDelta} /></td>
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.lossR}R</td>
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.tradeSharePct}%</td>
                                            <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text))]">{c.lossSharePct}%</td>
                                            <td className="text-right py-1.5 px-2"><LiftCell lift={c.lift} /></td>
                                            <td className="text-right py-1.5 pl-2">{c.lowSample ? <Pill tone="warning">low n</Pill> : <Pill tone="muted">ok</Pill>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}
