// FftProtectionPanel.jsx — First Failed Tag protection analytics.
//
// Shown in the Trigger Behavior tier when fftCancels > 0 in the current model.
//
// Answers the key question: "Does FFT protection help or hurt?"
//
// Layout:
//   Header row: FFT Cancels badge + "if none were cancelled" ghost net R
//   Body:       Ghost outcome stat row (Wins / Losses / Unfilled / Net R)
//               Move-away distance row (avg pips at cancel, max pips at cancel)
//
// Ghost tracking is optional — ghost fields are present only when the run was
// executed with ghost tracking enabled. When absent, the panel shows cancel
// counts + move-away data only.

import React, { useMemo } from "react";
import { NeonPanel }            from "@/components/lab/NeonPanel";
import { Pill }                 from "@/components/lab/DataTable";
import { computeFftAnalytics, fmtFftR, fmtFftPct, fmtFftPips } from "@/data/fftAnalytics";
import { cn } from "@/lib/utils";

// ── tiny atoms ───────────────────────────────────────────────────────────────

function StatRow({ label, value, sub, tone = "default" }) {
    const toneClass = {
        success: "text-[hsl(var(--success))]",
        danger:  "text-[hsl(var(--danger))]",
        warning: "text-[hsl(var(--warning))]",
        muted:   "text-[hsl(var(--text-2))]",
        accent:  "text-[hsl(var(--accent-primary))]",
        default: "text-[hsl(var(--text))]",
    }[tone] ?? "text-[hsl(var(--text))]";

    return (
        <div className="flex items-baseline justify-between gap-2 py-1 border-b border-[hsl(var(--border-soft)/0.18)] last:border-b-0">
            <span className="text-[10px] font-ui text-[hsl(var(--text-2))] shrink-0">
                {label}
            </span>
            <div className="text-right">
                <span className={cn("text-[11px] font-num font-semibold tabular-nums", toneClass)}>
                    {value}
                </span>
                {sub && (
                    <span className="ml-1.5 text-[9px] font-ui text-muted-lab opacity-60">
                        {sub}
                    </span>
                )}
            </div>
        </div>
    );
}

function GhostOutcomeBar({ wins, losses, unfilled, breakevens }) {
    const total = wins + losses + unfilled + breakevens;
    if (!total) return null;

    const segments = [
        { label: "W",   count: wins,       color: "hsl(var(--success))",          opacity: 0.75 },
        { label: "L",   count: losses,     color: "hsl(var(--danger))",            opacity: 0.75 },
        { label: "BE",  count: breakevens, color: "hsl(var(--text-2))",            opacity: 0.55 },
        { label: "U",   count: unfilled,   color: "hsl(var(--border-soft))",       opacity: 0.70 },
    ].filter(s => s.count > 0);

    return (
        <div className="mt-2 mb-1">
            <div className="text-[8.5px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-50 mb-1.5">
                Ghost outcome distribution
            </div>
            {/* Stacked bar */}
            <div className="flex h-[10px] w-full overflow-hidden gap-[1px]">
                {segments.map(s => (
                    <div
                        key={s.label}
                        title={`${s.label}: ${s.count} (${((s.count / total) * 100).toFixed(1)}%)`}
                        style={{
                            flex: s.count,
                            background: s.color,
                            opacity: s.opacity,
                        }}
                    />
                ))}
            </div>
            {/* Legend */}
            <div className="flex gap-3 mt-1.5">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center gap-1">
                        <div
                            className="w-2 h-2 rounded-[1px]"
                            style={{ background: s.color, opacity: s.opacity }}
                        />
                        <span className="text-[8.5px] font-ui text-muted-lab">
                            {s.label} {s.count}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── FftProtectionPanel ────────────────────────────────────────────────────────

export function FftProtectionPanel({ trades = [] }) {
    const stats = useMemo(() => computeFftAnalytics(trades), [trades]);

    const {
        fftCancels,
        ghostTracked,
        ghostWins,
        ghostLosses,
        ghostUnfilled,
        ghostBreakevens,
        ghostNetR,
        ghostWinRate,
        avgMoveAwayAtCancel,
        maxMoveAwayAtCancel,
        hasMoveAwayData,
        hasGhostData,
    } = stats;

    if (fftCancels === 0) return null;

    const netRTone =
        ghostNetR > 0.005 ? "success" :
        ghostNetR < -0.005 ? "danger" :
        "muted";

    const wrTone =
        ghostWinRate == null ? "muted" :
        ghostWinRate >= 50   ? "success" :
        ghostWinRate >= 35   ? "warning" :
        "danger";

    return (
        <NeonPanel
            title="FFT Protection"
            action={
                <div className="flex items-center gap-1.5">
                    <Pill tone={fftCancels > 0 ? "warning" : "muted"}>
                        {fftCancels} cancelled
                    </Pill>
                    {hasGhostData && (
                        <Pill tone={netRTone === "success" ? "success" : netRTone === "danger" ? "danger" : "muted"}>
                            {fmtFftR(ghostNetR)} ghost
                        </Pill>
                    )}
                </div>
            }
        >
            <div className="text-[9.5px] font-ui text-muted-lab opacity-70 mb-3">
                First Failed Visit · cancel analytics
            </div>

            {/* Cancel count */}
            <StatRow
                label="FFT cancels"
                value={String(fftCancels)}
                sub="setups cancelled pre-trigger"
                tone="warning"
            />

            {/* Ghost tracking section — only when ghost data is present */}
            {hasGhostData ? (
                <>
                    <StatRow
                        label="Ghost tracked"
                        value={`${ghostTracked} / ${fftCancels}`}
                        sub={`${((ghostTracked / fftCancels) * 100).toFixed(0)}% had ghost sim`}
                        tone="muted"
                    />

                    {/* Stacked bar */}
                    <GhostOutcomeBar
                        wins={ghostWins}
                        losses={ghostLosses}
                        unfilled={ghostUnfilled}
                        breakevens={ghostBreakevens}
                    />

                    <div className="mt-2.5 space-y-0">
                        <StatRow
                            label="Ghost wins"
                            value={String(ghostWins)}
                            tone="success"
                        />
                        <StatRow
                            label="Ghost losses"
                            value={String(ghostLosses)}
                            tone="danger"
                        />
                        {ghostUnfilled > 0 && (
                            <StatRow
                                label="Ghost unfilled"
                                value={String(ghostUnfilled)}
                                sub="never triggered / session filtered"
                                tone="muted"
                            />
                        )}
                        <StatRow
                            label="Ghost win rate"
                            value={fmtFftPct(ghostWinRate)}
                            tone={wrTone}
                        />
                        <StatRow
                            label="Ghost net R"
                            value={fmtFftR(ghostNetR)}
                            sub="if none were cancelled"
                            tone={netRTone}
                        />
                    </div>
                </>
            ) : (
                <div className="mt-2 text-[9px] font-ui text-muted-lab opacity-55 italic">
                    No ghost simulation data — re-run with ghost tracking enabled to see
                    hypothetical outcomes.
                </div>
            )}

            {/* Move-away distance — shown when threshold was used */}
            {hasMoveAwayData && (
                <>
                    <div className="mt-3 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                        <div className="text-[8.5px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-50 mb-1.5">
                            Move-away distance at cancel
                        </div>
                        <StatRow
                            label="Avg pips past OB edge"
                            value={fmtFftPips(avgMoveAwayAtCancel)}
                            sub="pips"
                            tone="accent"
                        />
                        <StatRow
                            label="Max pips past OB edge"
                            value={fmtFftPips(maxMoveAwayAtCancel)}
                            sub="pips"
                            tone="muted"
                        />
                    </div>
                </>
            )}
        </NeonPanel>
    );
}
