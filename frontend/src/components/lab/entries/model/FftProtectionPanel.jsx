// FftProtectionPanel.jsx — First Failed Tag protection analytics.
//
// Answers: "Does FFT protection help or hurt?"
//
// Two evidence layers:
//
//   1. Ghost Metrics (always shown when ghost data present)
//      In-run simulation — fast but can diverge when the setup uses the
//      `armed_after_ob_exit` path (ghost enters on a different candle).
//      Shown as secondary / unverified signal.
//
//   2. Paired OFF Metrics (shown when `offTrades` prop is provided)
//      Authoritative: matches each cancelled setup against the same OB in a
//      paired FFT-OFF run. Classified HIGH / LOW confidence per cancel.
//      Only HIGH-confidence pairs feed the aggregate derived metrics.
//
// Props:
//   trades    {array}  — all trades from the active FFT run (required)
//   offTrades {array}  — all trades from the paired FFT-OFF run (optional)
//                        when omitted, Paired OFF section is hidden

import React, { useMemo, useState } from "react";
import { NeonPanel }  from "@/components/lab/NeonPanel";
import { Pill }       from "@/components/lab/DataTable";
import {
    computeFftAnalytics,
    fmtFftR, fmtFftPct, fmtFftPips,
} from "@/data/fftAnalytics";
import {
    computePairedFftAnalytics,
    pairedOffOutcomeLabel,
    pairedOffOutcomeTone,
    isFftCancel,
} from "@/data/fftPairingAnalytics";
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

function SectionLabel({ children }) {
    return (
        <div className="text-[8.5px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-50 mb-1.5">
            {children}
        </div>
    );
}

function Divider() {
    return <div className="my-2.5 border-t border-[hsl(var(--border-soft)/0.20)]" />;
}

function GhostOutcomeBar({ wins, losses, unfilled, breakevens }) {
    const total = wins + losses + unfilled + breakevens;
    if (!total) return null;

    const segments = [
        { label: "W",  count: wins,       color: "hsl(var(--success))",    opacity: 0.75 },
        { label: "L",  count: losses,     color: "hsl(var(--danger))",     opacity: 0.75 },
        { label: "BE", count: breakevens, color: "hsl(var(--text-2))",     opacity: 0.55 },
        { label: "U",  count: unfilled,   color: "hsl(var(--border-soft))",opacity: 0.70 },
    ].filter(s => s.count > 0);

    return (
        <div className="mt-2 mb-1">
            <SectionLabel>Ghost outcome distribution</SectionLabel>
            <div className="flex h-[10px] w-full overflow-hidden gap-[1px]">
                {segments.map(s => (
                    <div
                        key={s.label}
                        title={`${s.label}: ${s.count} (${((s.count / total) * 100).toFixed(1)}%)`}
                        style={{ flex: s.count, background: s.color, opacity: s.opacity }}
                    />
                ))}
            </div>
            <div className="flex gap-3 mt-1.5">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-[1px]" style={{ background: s.color, opacity: s.opacity }} />
                        <span className="text-[8.5px] font-ui text-muted-lab">{s.label} {s.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Paired OFF table ──────────────────────────────────────────────────────────
// One row per FFT cancel, showing matched OFF outcome + confidence badge.

function ConfidenceBadge({ level }) {
    return (
        <span className={cn(
            "text-[7.5px] font-ui uppercase tracking-[0.1em] px-1 py-px rounded-[2px]",
            level === "HIGH"
                ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                : "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]"
        )}>
            {level}
        </span>
    );
}

function PairRow({ pair }) {
    const outcomeTone = pairedOffOutcomeTone(pair.pairedOffOutcome);
    const outcomeLabel = pairedOffOutcomeLabel(pair.pairedOffOutcome);

    const toneClass = {
        success: "text-[hsl(var(--success))]",
        danger:  "text-[hsl(var(--danger))]",
        warning: "text-[hsl(var(--warning))]",
        muted:   "text-[hsl(var(--text-2))]",
    }[outcomeTone] ?? "text-[hsl(var(--text-2))]";

    const rVal = pair.pairedOffR != null
        ? `${pair.pairedOffR >= 0 ? "+" : ""}${pair.pairedOffR.toFixed(2)}R`
        : "—";

    const maVal = pair.moveAwayPips != null
        ? `${pair.moveAwayPips.toFixed(1)}p`
        : "—";

    // Ghost agreement indicator
    const ghostAgreement =
        pair.ghostOutcome == null ? null :
        pair.ghostMatchesOff     ? "✓" : "✗";

    return (
        <div className="flex items-center gap-2 py-1 border-b border-[hsl(var(--border-soft)/0.14)] last:border-b-0 text-[9px] font-ui">
            {/* OB identity */}
            <span className="text-muted-lab opacity-60 w-10 shrink-0 tabular-nums">
                OB {pair.obId}
            </span>
            <span className="text-muted-lab opacity-50 w-6 shrink-0 capitalize text-[8px]">
                {pair.direction === "BULLISH" ? "↑" : pair.direction === "BEARISH" ? "↓" : "?"}
            </span>

            {/* Paired OFF outcome */}
            {pair.hasPairedRow ? (
                <span className={cn("font-semibold w-16 shrink-0 tabular-nums", toneClass)}>
                    {outcomeLabel}
                </span>
            ) : (
                <span className="w-16 shrink-0 text-muted-lab opacity-40 italic">no match</span>
            )}

            {/* OFF R */}
            <span className={cn("w-14 shrink-0 tabular-nums text-right", toneClass)}>
                {rVal}
            </span>

            {/* Move-away */}
            <span className="text-muted-lab opacity-50 w-10 shrink-0 text-right tabular-nums">
                {maVal}
            </span>

            {/* Ghost agreement */}
            {ghostAgreement != null && (
                <span className={cn(
                    "w-4 shrink-0 text-center",
                    ghostAgreement === "✓" ? "text-[hsl(var(--success))] opacity-70" : "text-[hsl(var(--danger))] opacity-70"
                )}>
                    {ghostAgreement}
                </span>
            )}

            {/* Confidence badge */}
            <div className="ml-auto shrink-0">
                <ConfidenceBadge level={pair.confidence} />
            </div>
        </div>
    );
}

function PairedOffTable({ pairs }) {
    if (!pairs?.length) return null;

    return (
        <div className="mt-1">
            {/* Column headers */}
            <div className="flex items-center gap-2 pb-1 mb-0.5 border-b border-[hsl(var(--border-soft)/0.22)] text-[8px] font-ui text-muted-lab opacity-40 uppercase tracking-[0.08em]">
                <span className="w-10 shrink-0">OB</span>
                <span className="w-6 shrink-0" />
                <span className="w-16 shrink-0">OFF out</span>
                <span className="w-14 shrink-0 text-right">OFF R</span>
                <span className="w-10 shrink-0 text-right">MA</span>
                <span className="w-4 shrink-0 text-center" title="Ghost agrees with OFF?">G</span>
                <span className="ml-auto shrink-0">conf</span>
            </div>
            {pairs.map((p, i) => <PairRow key={p.obId + i} pair={p} />)}
        </div>
    );
}

// ── Paired OFF aggregate summary ──────────────────────────────────────────────

function PairedSummarySection({ pairedStats }) {
    const {
        highConfCount, lowConfCount,
        confirmedLossesAvoided, confirmedWinsRemoved,
        confirmedNetRImpact, ghostAccuracyRate,
        hasPairedData,
    } = pairedStats;

    if (!hasPairedData || pairedStats.fftCancels === 0) return null;

    const netRTone =
        confirmedNetRImpact > 0.005  ? "success" :
        confirmedNetRImpact < -0.005 ? "danger"  : "muted";

    const netRLabel = confirmedNetRImpact >= 0
        ? `+${confirmedNetRImpact.toFixed(2)}R`
        : `${confirmedNetRImpact.toFixed(2)}R`;

    return (
        <>
            <Divider />
            <div className="flex items-center justify-between mb-2">
                <SectionLabel>Paired OFF · authoritative</SectionLabel>
                <div className="flex gap-1">
                    {highConfCount > 0 && (
                        <span className="text-[7.5px] font-ui px-1 py-px rounded-[2px] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]">
                            {highConfCount} HIGH
                        </span>
                    )}
                    {lowConfCount > 0 && (
                        <span className="text-[7.5px] font-ui px-1 py-px rounded-[2px] bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]">
                            {lowConfCount} LOW
                        </span>
                    )}
                </div>
            </div>

            <PairedOffTable pairs={pairedStats.pairs} />

            {/* Aggregate derived metrics — HIGH confidence only */}
            {highConfCount > 0 && (
                <div className="mt-2.5 space-y-0">
                    <StatRow
                        label="Losses avoided"
                        value={String(confirmedLossesAvoided)}
                        sub="HIGH conf · OFF was LOSS"
                        tone={confirmedLossesAvoided > 0 ? "success" : "muted"}
                    />
                    <StatRow
                        label="Wins removed"
                        value={String(confirmedWinsRemoved)}
                        sub="HIGH conf · OFF was WIN"
                        tone={confirmedWinsRemoved > 0 ? "danger" : "muted"}
                    />
                    <StatRow
                        label="Net R impact"
                        value={netRLabel}
                        sub="paired OFF R delta · HIGH conf"
                        tone={netRTone}
                    />
                    {ghostAccuracyRate != null && (
                        <StatRow
                            label="Ghost accuracy"
                            value={`${ghostAccuracyRate.toFixed(0)}%`}
                            sub="vs paired OFF outcome"
                            tone={ghostAccuracyRate >= 75 ? "success" : ghostAccuracyRate >= 50 ? "warning" : "danger"}
                        />
                    )}
                </div>
            )}

            {lowConfCount > 0 && highConfCount === 0 && (
                <div className="mt-2 text-[9px] font-ui text-muted-lab opacity-55 italic">
                    All pairs are LOW confidence — OFF rows were invalid, unfilled, or
                    ghost timing diverged. Ghost metrics are the only signal available.
                </div>
            )}
        </>
    );
}

// ── FftProtectionPanel ────────────────────────────────────────────────────────

export function FftProtectionPanel({ trades = [], offTrades = [] }) {
    const [showGhost, setShowGhost] = useState(true);

    const ghostStats  = useMemo(() => computeFftAnalytics(trades),                    [trades]);
    const pairedStats = useMemo(() => computePairedFftAnalytics(trades, offTrades),   [trades, offTrades]);

    const hasPairedData = pairedStats.hasPairedData;

    const {
        fftCancels,
        ghostTracked, ghostWins, ghostLosses,
        ghostUnfilled, ghostBreakevens, ghostNetR, ghostWinRate,
        avgMoveAwayAtCancel, maxMoveAwayAtCancel,
        hasMoveAwayData, hasGhostData,
    } = ghostStats;

    if (fftCancels === 0) return null;

    // Header pill — prefer paired net R when available and high-conf, else ghost
    const headerNetR   = hasPairedData && pairedStats.hasHighConfPairs
        ? pairedStats.confirmedNetRImpact
        : ghostNetR;
    const headerTone   =
        headerNetR > 0.005  ? "success" :
        headerNetR < -0.005 ? "danger"  : "muted";
    const headerLabel  = hasPairedData && pairedStats.hasHighConfPairs
        ? `${headerNetR >= 0 ? "+" : ""}${headerNetR.toFixed(2)}R paired`
        : (hasGhostData ? `${fmtFftR(ghostNetR)} ghost (unverified)` : null);

    const ghostNetRTone =
        ghostNetR > 0.005  ? "success" :
        ghostNetR < -0.005 ? "danger"  : "muted";

    const wrTone =
        ghostWinRate == null ? "muted"   :
        ghostWinRate >= 50   ? "success" :
        ghostWinRate >= 35   ? "warning" : "danger";

    return (
        <NeonPanel
            title="FFT Protection"
            action={
                <div className="flex items-center gap-1.5">
                    <Pill tone="warning">{fftCancels} cancelled</Pill>
                    {headerLabel && (
                        <Pill tone={headerTone === "success" ? "success" : headerTone === "danger" ? "danger" : "muted"}>
                            {headerLabel}
                        </Pill>
                    )}
                </div>
            }
        >
            <div className="text-[9.5px] font-ui text-muted-lab opacity-70 mb-3">
                First Failed Visit · cancel analytics
            </div>

            {/* Unverified notice — shown when no paired OFF run is loaded */}
            {!hasPairedData && hasGhostData && (
                <div className="mb-3 px-2 py-1.5 border border-dashed border-[hsl(var(--warning)/0.30)] bg-[hsl(var(--warning)/0.05)] text-[8.5px] font-ui text-[hsl(var(--warning)/0.70)] italic leading-snug">
                    Ghost results are simulated and may diverge from the paired FFT-OFF run.
                    Load/compare a paired FFT-OFF run for authoritative impact.
                </div>
            )}

            {/* Cancel count */}
            <StatRow
                label="FFT cancels"
                value={String(fftCancels)}
                sub="setups cancelled pre-trigger"
                tone="warning"
            />

            {/* ── Paired OFF section (primary when available) ─────────── */}
            <PairedSummarySection pairedStats={pairedStats} />

            {/* ── Ghost section (secondary / collapsible when paired available) */}
            {hasGhostData && (
                <>
                    <Divider />
                    <button
                        type="button"
                        onClick={() => setShowGhost(o => !o)}
                        className="w-full flex items-center justify-between group mb-1 outline-none"
                    >
                        <SectionLabel>
                            Ghost sim{hasPairedData ? " · secondary" : ""}
                        </SectionLabel>
                        <span className="text-[9px] text-muted-lab opacity-40 group-hover:opacity-70 transition-opacity">
                            {showGhost ? "▾" : "▸"}
                        </span>
                    </button>

                    {showGhost && (
                        <>
                            <StatRow
                                label="Ghost tracked"
                                value={`${ghostTracked} / ${fftCancels}`}
                                sub={`${((ghostTracked / fftCancels) * 100).toFixed(0)}% had ghost sim`}
                                tone="muted"
                            />

                            <GhostOutcomeBar
                                wins={ghostWins}
                                losses={ghostLosses}
                                unfilled={ghostUnfilled}
                                breakevens={ghostBreakevens}
                            />

                            <div className="mt-2.5 space-y-0">
                                <StatRow label="Ghost wins"    value={String(ghostWins)}       tone="success" />
                                <StatRow label="Ghost losses"  value={String(ghostLosses)}     tone="danger" />
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
                                    tone={ghostNetRTone}
                                />
                                <div className="pt-1 text-[8.5px] font-ui text-[hsl(var(--warning)/0.65)] opacity-80 italic">
                                    {hasPairedData
                                        ? "Ghost may diverge from paired OFF — verify with table above."
                                        : "Ghost outcomes are simulated estimates and may not reflect actual behaviour."}
                                </div>
                            </div>
                        </>
                    )}

                    {!hasGhostData && !hasPairedData && (
                        <div className="mt-2 text-[9px] font-ui text-muted-lab opacity-55 italic">
                            No ghost simulation data. Re-run with ghost tracking or load a paired
                            FFT-OFF run to see hypothetical outcomes.
                        </div>
                    )}
                </>
            )}

            {/* Move-away distance */}
            {hasMoveAwayData && (
                <>
                    <Divider />
                    <SectionLabel>Move-away distance at cancel</SectionLabel>
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
                </>
            )}
        </NeonPanel>
    );
}
