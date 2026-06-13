// ── LossTriagePanel.jsx ───────────────────────────────────────────────────────
// Failures Lab V5 decision layer. Joins the two orthogonal loss signals the
// interpretation audit found — pre-stop run-up (mfe_r) and post-stop recovery
// (post_stop_mfe_r) — into a 2x2, pairs it with a BE replay verdict, and surfaces
// negative-EV session×direction pockets. Its job is to PREVENT the naive
// "loser ran up → add break-even" conclusion: the BE verdict card shows that, on
// this run, global BE is net-negative.
//
// Pure presentation over data/lossTriage.js. All copy says "reached"/"peak", never
// "would have profited" — post-stop recovery is an upper bound, not realized profit.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { AlertTriangle, Info, ShieldAlert, Ban, ArrowUpRight, Search, X, Eye } from "lucide-react";
import { buildLossTriage, buildBeVerdict, buildContextSinkholes } from "@/data/lossTriage";
// Reuse the existing grouping/lift engine (no new engine) + the existing lift coloring,
// canonical sample-floor set, and the shared ExplorerSelect control (same visual language
// as Failure Explorer). Pill matches the explorer's "controlled · max 2 dimensions" chip.
import { buildBucketExplorerRows, EXPLORER_FLOORS } from "../shared/excursionAnalytics";
import { LiftCell, ExplorerSelect } from "../excursion/FailureExplorer";
import { Pill } from "@/components/lab/DataTable";

// Rank-by options for the cohort table (loss-share focused — not generic explorer metrics).
const COHORT_RANK_OPTIONS = [
    { key: "pctLosses", label: "% of losses" },
    { key: "count",     label: "Count" },
    { key: "lift",      label: "Lift" },
    { key: "pctCohort", label: "% of cohort" },
    { key: "lossR",     label: "Loss-R" },
];

// Per-cell tone (presentation only).
const CELL_TONE = {
    clean_loss:  "text-2",            // accept — no action
    false_loser: "accent-secondary",  // investigate stop width
    give_back:   "warning",           // do NOT global-BE
    round_trip:  "warning",           // strongest stop-too-tight signal
};

// Cohort drilldown is fixed to Session × Direction (the Tier-1 default from the
// design audit) with a sample floor of 15 — deterministic and clearest for "where
// does this loss type concentrate". Dim-switching is a deliberate future enhancement.
const COHORT_DIM_A = "session";
const COHORT_DIM_B = "direction";
// Default floor uses a value from the explorer's canonical set ([4,8,12,20]) so the
// default is reflected in the floor buttons.
const COHORT_SAMPLE_FLOOR = 12;

function TriageCell({ c, selected, onSelect }) {
    const tone = CELL_TONE[c.key] || "text-2";
    const clickable = c.count > 0;
    return (
        <button
            type="button"
            disabled={!clickable}
            aria-pressed={selected}
            onClick={() => clickable && onSelect(c.key)}
            className={`text-left p-3 border clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] flex flex-col transition-colors ${
                selected ? "border-[hsl(var(--accent-primary)/0.7)] ring-1 ring-[hsl(var(--accent-primary)/0.4)]" : "border-[hsl(var(--border-soft))]"
            } ${clickable ? "hover:bg-[hsl(var(--panel-2)/0.7)] cursor-pointer" : "cursor-default opacity-90"}`}
            style={{ borderTop: `2px solid hsl(var(--${tone})/0.5)` }}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-ui font-semibold text-[hsl(var(--text))] flex items-center gap-1">
                    {c.label}
                    {clickable && <Search size={10} className="opacity-50" />}
                </span>
                <span className="flex items-baseline gap-1">
                    <span className={`text-[16px] font-num text-[hsl(var(--${tone}))] ${c.lowSample ? "opacity-60" : ""}`}>{c.count}</span>
                    <span className="text-[10px] font-num text-muted-lab">{c.pctOfLosses}%</span>
                </span>
            </div>
            <p className="mt-1 text-[10px] font-ui text-[hsl(var(--text-2))] leading-snug">{c.meaning}</p>
            <p className="mt-1.5 text-[10px] font-ui text-muted-lab leading-snug italic">{c.action}</p>
            {c.lowSample && c.count > 0 && (
                <p className="mt-1 text-[9.5px] font-ui text-muted-lab">Low sample (&lt; 15).</p>
            )}
        </button>
    );
}

const VERDICT_META = {
    HURTS:   { tone: "danger",  label: "Global BE: HURTS" },
    HELPS:   { tone: "success", label: "Global BE: HELPS" },
    NEUTRAL: { tone: "text-2",  label: "Global BE: NEUTRAL" },
};

function BeVerdictCard({ verdict }) {
    if (!verdict?.available) {
        return (
            <div className="p-3 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]">
                <div className="flex items-center gap-1.5 text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-muted-lab">
                    <ShieldAlert size={12} /> BE Replay Verdict
                </div>
                <p className="mt-1.5 text-[10.5px] font-ui text-muted-lab leading-snug">
                    Unavailable — {verdict?.reason || "no BE replay variants on this run."}
                </p>
            </div>
        );
    }
    const m = VERDICT_META[verdict.verdict] || VERDICT_META.NEUTRAL;
    return (
        <div className="p-3 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]"
            style={{ borderTop: `2px solid hsl(var(--${m.tone})/0.6)` }}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-muted-lab">
                    <ShieldAlert size={12} /> BE Replay Verdict
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-ui font-semibold clip-bevel-sm border border-[hsl(var(--${m.tone})/0.5)] text-[hsl(var(--${m.tone}))]`}>
                    {m.label}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-num">
                <span className="text-muted-lab">Baseline <span className="text-[hsl(var(--text))]">{verdict.baselineNetR}R</span></span>
                <span className="text-muted-lab">Best BE <span className="text-[hsl(var(--text))]">{verdict.best.label} {verdict.best.netR}R</span></span>
                <span className="text-muted-lab">Δ <span className={`text-[hsl(var(--${verdict.best.deltaNetR >= 0 ? "success" : "danger"}))]`}>
                    {verdict.best.deltaNetR >= 0 ? "+" : ""}{verdict.best.deltaNetR}R</span></span>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] font-ui text-[hsl(var(--warning))] leading-snug">
                <Ban size={12} className="mt-0.5 shrink-0" />
                Loser run-up does not justify global BE. Test selective BE / partials instead.
            </p>
            <p className="mt-1 text-[9.5px] font-ui text-muted-lab">{verdict.note}</p>
        </div>
    );
}

function SinkholeCard({ sinkholes }) {
    if (!sinkholes?.available) return null;
    if (!sinkholes.sinkholes.length) {
        return (
            <div className="p-3 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]">
                <div className="flex items-center gap-1.5 text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-muted-lab">
                    <AlertTriangle size={12} /> Context Sinkholes
                </div>
                <p className="mt-1.5 text-[10.5px] font-ui text-muted-lab">No negative-EV session×direction pockets at n ≥ 15.</p>
            </div>
        );
    }
    return (
        <div className="p-3 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)]"
            style={{ borderTop: "2px solid hsl(var(--danger)/0.5)" }}>
            <div className="flex items-center gap-1.5 text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-muted-lab">
                <AlertTriangle size={12} /> Context Sinkholes
            </div>
            <p className="mt-1 text-[10px] font-ui text-muted-lab leading-snug">
                Negative-EV session × direction pockets (n ≥ 15). Consider a context/entry filter — not exit management.
            </p>
            <div className="mt-2 space-y-1">
                {sinkholes.sinkholes.map((s) => (
                    <div key={`${s.session}-${s.direction}`} className="flex items-center gap-2 text-[10.5px] font-ui">
                        <span className="w-40 shrink-0 text-[hsl(var(--text-2))] truncate">{s.session} · {s.direction}</span>
                        <span className="font-num text-[hsl(var(--danger))] w-16 text-right">{s.netR}R</span>
                        <span className="font-num text-muted-lab w-12 text-right">{s.winRate}%</span>
                        <span className="font-ui text-muted-lab">n={s.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Loss-type-share table. For each setup (current Dimension A × Dimension B): how many of
// that setup's total losses are the selected loss type, plus run-wide lift. Rows come from
// the reused engine; we only derive the two count-shares and render. Net R / Wins / PF are
// hidden — in legacy (cohort) mode the engine cannot attribute per-setup winner R, so
// they'd be blank/misleading here.
function CohortTable({ rows, cohortLabel, cohortTotal, sampleFloor, rankBy = "pctLosses" }) {
    const r1 = (n) => Math.round(n * 10) / 10;
    const metric = (row) => ({
        pctLosses: row.pctOfLosses,
        count: row.bucketLosses,
        lift: row.lift,
        pctCohort: row.pctOfCohort,
        lossR: row.bucketLossR,
    }[rankBy] ?? row.pctOfLosses);
    const enriched = (Array.isArray(rows) ? rows : [])
        .filter((row) => row.bucketLosses > 0)
        .map((row) => ({
            ...row,
            setup: row.keyB != null ? `${row.keyA} · ${row.keyB}` : row.keyA,
            pctOfLosses: row.fullLosses > 0 ? r1((row.bucketLosses / row.fullLosses) * 100) : 0,
            pctOfCohort: cohortTotal > 0 ? r1((row.bucketLosses / cohortTotal) * 100) : 0,
        }))
        // Sort by the chosen metric (default % of setup losses), then count — low-sample sunk.
        .sort((a, b) =>
            (Number(b.rankable) - Number(a.rankable))
            || (metric(b) - metric(a))
            || (b.bucketLosses - a.bucketLosses));

    if (!enriched.length) {
        return <div className="px-1 py-3 text-[11px] font-ui text-muted-lab">No setups carry a {cohortLabel} at this grouping.</div>;
    }
    const th = "text-right py-1.5 px-2 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]";
    const td = "text-right py-1.5 px-2 font-num tabular-nums text-[11px]";
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="border-b border-[hsl(var(--border-soft))]">
                        <th className="text-left py-1.5 px-2 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">Setup</th>
                        <th className={th}>{cohortLabel}</th>
                        <th className={th}>Total losses</th>
                        <th className={th}>% of losses</th>
                        <th className={th}>% of cohort</th>
                        <th className={th}>Lift</th>
                        <th className={th}>Loss-R</th>
                    </tr>
                </thead>
                <tbody>
                    {enriched.map((row) => {
                        const pctTone = row.pctOfLosses >= 50 ? "text-[hsl(var(--danger))]" : row.pctOfLosses >= 30 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text))]";
                        return (
                            <tr key={row.setup} className={`border-b border-[hsl(var(--border-soft)/0.5)] ${row.lowSample ? "opacity-55" : ""}`}>
                                <td className="text-left py-1.5 px-2 text-[11px] font-ui text-[hsl(var(--text))]">
                                    {row.setup}
                                    {row.lowSample && <span className="ml-1.5 text-[9px] font-ui text-muted-lab">low-n</span>}
                                </td>
                                <td className={`${td} text-[hsl(var(--text))] font-semibold`}>{row.bucketLosses}</td>
                                <td className={`${td} text-muted-lab`}>{row.fullLosses}</td>
                                <td className={`${td} ${pctTone} font-semibold`}>{row.pctOfLosses}%</td>
                                <td className={`${td} text-muted-lab`}>{row.pctOfCohort}%</td>
                                <td className="py-1.5 px-2 text-right"><LiftCell lift={row.lift} /></td>
                                <td className={`${td} text-[hsl(var(--danger))]`}>−{row.bucketLossR}R</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="mt-2 px-1 text-[9.5px] font-ui text-muted-lab leading-snug">
                <strong>% of losses</strong> = {cohortLabel} ÷ that setup’s total losses. <strong>% of cohort</strong> = setup’s share of all {cohortLabel}.
                <strong> Lift</strong> = run-wide loss-share ÷ trade-share (overrepresentation, not proof). Rows below the sample floor (n &lt; {sampleFloor}) are dimmed. This run only.
            </p>
        </div>
    );
}

// Inline cohort drilldown. Reuses the bucket-explorer engine for grouping/lift; renders
// a loss-type-share table (see CohortTable). No new engine; FailureExplorer untouched.
function CohortDrawer({ cells, selectedKey, onSelect, onClose, allTrades }) {
    // Explorer-style controls (default Session × Direction, but switchable). State lives
    // here so it persists while switching cohorts in the open drawer. Hooks must precede
    // the early return below.
    const [dimA, setDimA] = useState(COHORT_DIM_A);
    const [dimB, setDimB] = useState(COHORT_DIM_B);
    const [floor, setFloor] = useState(COHORT_SAMPLE_FLOOR);
    const [rankBy, setRankBy] = useState("pctLosses");

    const cell = cells.find((c) => c.key === selectedKey);

    // Reuse the grouping/lift engine in LEGACY mode (bucketKey:null): it groups the
    // cohort's OWN losers (cell.trades) by the chosen dimension(s) AND carries each setup's
    // overall loss total — exactly the "of all losses for this setup, how many are this
    // loss type?" comparison. Returns { available, dimA, dimB, rows } so we can drive the
    // Dimension A/B selectors from the engine's own resolved dimensions.
    const result = buildBucketExplorerRows({
        bucketLosers: cell?.trades ?? [],
        bucketKey: null,
        allTrades,
        dimA,
        dimB: dimB || null,
        sampleFloor: floor,
    });

    if (!cell) return null;
    const tone = CELL_TONE[cell.key] || "text-2";
    const available = result.available || [];
    const dimBOptions = available.filter((d) => d.key !== result.dimA);
    return (
        <div className="border clip-bevel-sm bg-[hsl(var(--panel-2)/0.25)] border-[hsl(var(--accent-primary)/0.6)] ring-1 ring-[hsl(var(--accent-primary)/0.25)]"
            style={{ borderTop: `2px solid hsl(var(--${tone})/0.6)` }}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-3 border-b border-[hsl(var(--border-soft))]">
                <div>
                    <div className="text-[12px] font-ui font-semibold text-[hsl(var(--text))]">{cell.label} — why?</div>
                    <div className="text-[10.5px] font-num text-muted-lab mt-0.5">{cell.count} losses · {cell.pctOfLosses}% of losses</div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close cohort drilldown"
                    className="shrink-0 p-1 text-muted-lab hover:text-[hsl(var(--text))]">
                    <X size={14} />
                </button>
            </div>
            {/* Cohort segmented selector — switch cohorts without leaving the drawer */}
            <div className="flex flex-wrap gap-1.5 p-3 pb-0">
                {cells.map((c) => {
                    const active = c.key === selectedKey;
                    const disabled = c.count === 0;
                    return (
                        <button key={c.key} type="button" disabled={disabled} aria-pressed={active}
                            onClick={() => onSelect(c.key)}
                            className={`px-2.5 py-1 text-[10.5px] font-ui clip-bevel-sm border transition-colors ${
                                active
                                    ? "bg-[hsl(var(--accent-primary)/0.16)] border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]"
                                    : disabled
                                        ? "border-[hsl(var(--border-soft))] text-muted-lab opacity-50 cursor-default"
                                        : "bg-[hsl(var(--panel-2)/0.4)] border-[hsl(var(--border-soft))] text-muted-lab hover:text-[hsl(var(--text-base))]"
                            }`}>
                            {c.label} <span className="font-num">{c.count}</span>
                        </button>
                    );
                })}
            </div>
            {/* Scope banner — make it impossible to misread that this is ONE loss type only. */}
            <div className="mx-3 mt-3 p-2.5 clip-bevel-sm border-l-2 border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.1)]">
                <div className="flex items-center gap-1.5 text-[11px] font-ui font-semibold text-[hsl(var(--accent-primary))]">
                    <Eye size={12} className="shrink-0" />
                    Viewing {cell.label} only.
                </div>
                <p className="mt-1 text-[10px] font-ui text-[hsl(var(--text-2))] leading-snug">
                    This table compares this loss type against total losses for each setup.
                </p>
                <p className="mt-0.5 text-[10px] font-ui text-muted-lab leading-snug">
                    <span className="text-[hsl(var(--text-2))]">% of Losses</span> = this loss type ÷ that setup’s total losses.{" "}
                    Read <span className="text-[hsl(var(--text-2))]">Lift</span> for run-wide overrepresentation. Peak-not-path applies to recovered cohorts.
                </p>
            </div>
            {/* Explorer-style controls — same controls + visual language as Failure Explorer:
                Dimension A / Dimension B / Rank by / sample floor (default Session × Direction). */}
            <div className="flex flex-wrap items-end gap-3 px-3 pt-3">
                <ExplorerSelect label="Dimension A" value={result.dimA ?? ""} onChange={setDimA} options={available} />
                <ExplorerSelect label="Dimension B" value={result.dimB ?? ""} onChange={setDimB} options={dimBOptions} includeNone />
                <ExplorerSelect label="Rank by" value={rankBy} onChange={setRankBy} options={COHORT_RANK_OPTIONS} />
                <div className="flex flex-col gap-1">
                    <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">Sample floor</span>
                    <div className="flex items-center gap-1">
                        {EXPLORER_FLOORS.map((f) => (
                            <button key={f} type="button" onClick={() => setFloor(f)}
                                className={`px-2 py-1.5 text-[11px] font-num tabular-nums clip-bevel-sm border transition-colors ${
                                    f === floor
                                        ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                                        : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]"
                                }`}>
                                ≥{f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="ml-auto self-end pb-1.5"><Pill tone="muted">controlled · max 2 dimensions</Pill></div>
            </div>
            {/* Loss-type-share table — reuses buildBucketExplorerRows (legacy grouping + lift). */}
            <div className="p-3">
                <CohortTable rows={result.rows} cohortLabel={cell.label} cohortTotal={cell.count} sampleFloor={floor} rankBy={rankBy} />
            </div>
        </div>
    );
}

export function LossTriagePanel({ allTrades = [], beTradesByMode = null, executionMode = null }) {
    const [selectedKey, setSelectedKey] = useState(null);
    const selectCohort = (key) => setSelectedKey(key);
    const triage = useMemo(() => buildLossTriage(allTrades), [allTrades]);
    const baselineNetR = useMemo(
        () => (Array.isArray(allTrades) ? allTrades.reduce((s, t) => s + (Number(t?.netR ?? t?.net_r) || 0), 0) : 0),
        [allTrades],
    );
    const beVerdict = useMemo(
        () => buildBeVerdict(beTradesByMode, { executionMode, baselineNetR }),
        [beTradesByMode, executionMode, baselineNetR],
    );
    const sinkholes = useMemo(() => buildContextSinkholes(allTrades), [allTrades]);

    if (!triage.available) {
        return (
            <NeonPanel title="Loss Triage" tone="secondary">
                <div className="p-4 flex items-start gap-2 text-[11px] font-ui text-muted-lab">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    <span>Loss Triage is unavailable — {triage.reason} Re-export with{" "}
                        <span className="font-num">post_stop_mfe_r</span> and{" "}
                        <span className="font-num">mfe_r</span> to enable it.</span>
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel title="Loss Triage" tone="secondary">
            <div className="p-4 space-y-4">
                <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-snug max-w-[78ch]">
                    Two independent axes over {triage.totals.losses} losses:{" "}
                    <strong>pre-stop run-up</strong> (was it in profit before the stop?) ×{" "}
                    <strong>post-stop recovery</strong> (did price recover after the stop — a peak, not a path).
                    They do not predict each other, so a run-up does not imply break-even would help.
                </p>

                {/* A — 2x2 matrix (cells are clickable → cohort drilldown) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {triage.cells.map((c) => (
                        <TriageCell key={c.key} c={c} selected={c.key === selectedKey} onSelect={selectCohort} />
                    ))}
                </div>

                {/* A.1 — cohort drilldown (reused FailureExplorer, bucket scope) */}
                {selectedKey && (
                    <CohortDrawer
                        cells={triage.cells}
                        selectedKey={selectedKey}
                        onSelect={selectCohort}
                        onClose={() => setSelectedKey(null)}
                        allTrades={allTrades}
                    />
                )}

                {/* B — BE replay verdict */}
                <BeVerdictCard verdict={beVerdict} />

                {/* C — context sinkholes */}
                <SinkholeCard sinkholes={sinkholes} />

                {/* Caveats */}
                <ul className="pt-1 space-y-0.5">
                    {triage.caveats.map((c) => (
                        <li key={c} className="flex items-start gap-1.5 text-[9.5px] font-ui text-muted-lab leading-snug">
                            <ArrowUpRight size={10} className="mt-0.5 shrink-0 opacity-60" />{c}
                        </li>
                    ))}
                </ul>
            </div>
        </NeonPanel>
    );
}

export default LossTriagePanel;
