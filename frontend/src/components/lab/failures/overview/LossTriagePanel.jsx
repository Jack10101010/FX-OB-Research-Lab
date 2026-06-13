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
import { AlertTriangle, Info, ShieldAlert, Ban, ArrowUpRight, Search, X } from "lucide-react";
import { buildLossTriage, buildBeVerdict, buildContextSinkholes } from "@/data/lossTriage";
import { FailureExplorer } from "../excursion/FailureExplorer";

// Per-cell tone (presentation only).
const CELL_TONE = {
    clean_loss:  "text-2",            // accept — no action
    false_loser: "accent-secondary",  // investigate stop width
    give_back:   "warning",           // do NOT global-BE
    round_trip:  "warning",           // strongest stop-too-tight signal
};

// Dedicated FailureExplorer prefs for the cohort drilldown (its own persisted UI
// state, isolated from the MFE Bucket / Global explorers). Seeded once with the
// Phase-1 defaults: bucket scope, Session × Direction, ranked by Lift, floor 15.
const COHORT_PREFS_KEY = "fxob_loss_cohort_explorer_v1";
function seedCohortPrefsIfAbsent() {
    try {
        if (!localStorage.getItem(COHORT_PREFS_KEY)) {
            localStorage.setItem(COHORT_PREFS_KEY, JSON.stringify({
                scope: "bucket", dimA: "session", dimB: "direction", metric: "lift", floor: 15,
            }));
        }
    } catch { /* storage unavailable — FailureExplorer falls back to its own defaults */ }
}

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

// Inherited caveats — shown inside the drilldown so the "why" view never reads as proof.
const COHORT_CAVEATS = [
    "This run only.",
    "Lift is overrepresentation, not proof.",
    "High lift at a small sample is not a finding.",
    "Peak-not-path applies to recovered cohorts (False Loser / Round-Trip).",
];

// Inline cohort drilldown. Reuses FailureExplorer in BUCKET scope — the selected
// triage cell's member losers ARE the bucket. No new explorer/lift/PF/netR logic.
function CohortDrawer({ cells, selectedKey, onSelect, onClose, allTrades }) {
    const cell = cells.find((c) => c.key === selectedKey);
    if (!cell) return null;
    const tone = CELL_TONE[cell.key] || "text-2";
    const caveatIntro = (
        <span className="text-[10px] font-ui text-muted-lab leading-snug">
            Overrepresented characteristics of <strong>{cell.label}</strong> vs the whole run.{" "}
            {COHORT_CAVEATS.join(" ")}
        </span>
    );
    return (
        <div className="border clip-bevel-sm bg-[hsl(var(--panel-2)/0.25)] border-[hsl(var(--accent-primary)/0.4)]"
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
            {/* Reused FailureExplorer (bucket scope). prefs seeded to Session × Direction / Lift / floor 15. */}
            <div className="p-1">
                <FailureExplorer
                    key={selectedKey}
                    allTrades={allTrades}
                    allLosers={cell.trades}
                    bucket={{ key: cell.key, losers: cell.trades }}
                    title={`${cell.label} — cohort breakdown`}
                    prefsKey={COHORT_PREFS_KEY}
                    roadmapKey={null}
                    intro={caveatIntro}
                />
            </div>
        </div>
    );
}

export function LossTriagePanel({ allTrades = [], beTradesByMode = null, executionMode = null }) {
    const [selectedKey, setSelectedKey] = useState(null);
    const selectCohort = (key) => { seedCohortPrefsIfAbsent(); setSelectedKey(key); };
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
