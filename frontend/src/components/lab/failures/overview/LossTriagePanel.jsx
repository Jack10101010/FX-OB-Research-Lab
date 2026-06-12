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

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { AlertTriangle, Info, ShieldAlert, Ban, ArrowUpRight } from "lucide-react";
import { buildLossTriage, buildBeVerdict, buildContextSinkholes } from "@/data/lossTriage";

// Per-cell tone (presentation only).
const CELL_TONE = {
    clean_loss:  "text-2",            // accept — no action
    false_loser: "accent-secondary",  // investigate stop width
    give_back:   "warning",           // do NOT global-BE
    round_trip:  "warning",           // strongest stop-too-tight signal
};

function TriageCell({ c }) {
    const tone = CELL_TONE[c.key] || "text-2";
    return (
        <div className="p-3 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] flex flex-col"
            style={{ borderTop: `2px solid hsl(var(--${tone})/0.5)` }}>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-ui font-semibold text-[hsl(var(--text))]">{c.label}</span>
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
        </div>
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

export function LossTriagePanel({ allTrades = [], beTradesByMode = null, executionMode = null }) {
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

                {/* A — 2x2 matrix */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {triage.cells.map((c) => <TriageCell key={c.key} c={c} />)}
                </div>

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
