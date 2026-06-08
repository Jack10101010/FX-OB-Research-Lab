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
import { TermTip }    from "@/components/lab/TermTip";
import {
    computeFftAnalytics,
    fmtFftR, fmtFftPct, fmtFftPips,
} from "@/data/fftAnalytics";
import {
    computePairedFftAnalytics,
    pairedOffOutcomeLabel,
    pairedOffOutcomeTone,
    isFftCancel,
    summarizeFftPairBuckets,
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
            <span className="text-[10.5px] font-ui text-[hsl(var(--text))] shrink-0">
                {label}
            </span>
            <div className="text-right">
                <span className={cn("text-[11.5px] font-num font-semibold tabular-nums", toneClass)}>
                    {value}
                </span>
                {sub && (
                    <span className="ml-1.5 text-[9px] font-ui text-[hsl(var(--text-2))] opacity-90">
                        {sub}
                    </span>
                )}
            </div>
        </div>
    );
}

function SectionLabel({ children }) {
    return (
        <div className="text-[9.5px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text))] opacity-90 mb-1.5">
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
            <SectionLabel><TermTip termKey="ghost">Ghost outcome distribution</TermTip></SectionLabel>
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
                        <span className="text-[9px] font-ui text-[hsl(var(--text-2))]">{s.label} {s.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── shared presentational helpers ─────────────────────────────────────────────

const FFT_TONE_TEXT = {
    success: "text-[hsl(var(--success))]",
    danger:  "text-[hsl(var(--danger))]",
    warning: "text-[hsl(var(--warning))]",
    accent:  "text-[hsl(var(--accent-primary))]",
    muted:   "text-[hsl(var(--text-2))]",
};

// Outcomes that count toward the loss side of net R impact (mirrors the analytics).
const FFT_LOSS_OUTCOMES = new Set(["LOSS", "NEWS_FLATTEN", "PROTECTION_EXIT"]);

function fftTone(netR) {
    return netR > 0.005 ? "success" : netR < -0.005 ? "danger" : "muted";
}

// Verdict hero — the single bottom-line number, stated in plain English.
function VerdictHero({ netR, verified }) {
    const tone = fftTone(netR);
    const word = netR > 0.005 ? "FFT helped" : netR < -0.005 ? "FFT hurt" : "FFT was neutral";
    const bg = tone === "success" ? "bg-[hsl(var(--success)/0.08)]"
        : tone === "danger" ? "bg-[hsl(var(--danger)/0.08)]"
        : "bg-[hsl(var(--panel-2))]";
    const rLabel = `${netR >= 0 ? "+" : ""}${netR.toFixed(2)}R`;
    return (
        <div className={cn("rounded-[3px] px-3 py-2.5 mb-3 flex items-center justify-between gap-3", bg)}>
            <div>
                <div className={cn("text-[12px] font-ui font-semibold", FFT_TONE_TEXT[tone])}>{word}</div>
                <div className="text-[9px] font-ui text-[hsl(var(--text-2))] opacity-90 mt-0.5">
                    {verified ? "net R impact · paired FFT-OFF control" : "ghost estimate · unverified"}
                </div>
            </div>
            <div className={cn("text-[20px] font-num font-semibold tabular-nums leading-none", FFT_TONE_TEXT[tone])}>
                {rLabel}
            </div>
        </div>
    );
}

// Cost / benefit tile.
function StatTile({ label, value, sub, tone = "muted" }) {
    return (
        <div className="rounded-[3px] bg-[hsl(var(--panel-2))] px-2.5 py-2">
            <div className="text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))]">{label}</div>
            <div className={cn("text-[17px] font-num font-semibold tabular-nums leading-tight mt-0.5", FFT_TONE_TEXT[tone])}>{value}</div>
            {sub && <div className="text-[9px] font-ui text-[hsl(var(--text-2))] opacity-90 mt-0.5 leading-snug">{sub}</div>}
        </div>
    );
}

// Trust bar — counted (high-confidence) vs excluded (low) across all cancels.
function TrustBar({ high, low }) {
    const total = high + low;
    if (total === 0) return null;
    const cells = Array.from({ length: total }, (_, i) => i < high);
    return (
        <div className="mt-3 mb-1">
            <div className="flex items-baseline justify-between mb-1.5 gap-2">
                <span className="text-[10.5px] font-ui text-[hsl(var(--text))]">
                    Based on <span className="font-semibold text-[hsl(var(--success))]">{high} trustworthy</span> of {total} cancels
                </span>
                <span className="text-[9px] font-ui text-[hsl(var(--text-2))] opacity-90 shrink-0">{low} unclear · not counted</span>
            </div>
            <div className="flex gap-[3px] h-[8px]">
                {cells.map((on, i) => (
                    <div key={i} className="flex-1 rounded-[1px]"
                        style={{ background: on ? "hsl(var(--success))" : "hsl(var(--border-soft))", opacity: on ? 0.85 : 0.6 }} />
                ))}
            </div>
        </div>
    );
}

// ── Paired OFF table ──────────────────────────────────────────────────────────
// One row per FFT cancel: control outcome + whether it counts toward impact.

function ConfidenceBadge({ level }) {
    return (
        <span className={cn(
            "text-[8px] font-ui uppercase tracking-[0.06em] px-1 py-px rounded-[2px]",
            level === "HIGH"
                ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                : "bg-[hsl(var(--panel-2))] text-[hsl(var(--text-2))] opacity-80"
        )}>
            {level === "HIGH" ? "counted" : "excluded"}
        </span>
    );
}

function OutcomeChip({ pair }) {
    const tone = pairedOffOutcomeTone(pair.pairedOffOutcome);
    const label = pair.hasPairedRow ? pairedOffOutcomeLabel(pair.pairedOffOutcome) : "No match";
    const cls = tone === "success" ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
        : tone === "danger" ? "bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]"
        : "bg-[hsl(var(--panel-2))] text-[hsl(var(--text-2))]";
    return <span className={cn("inline-block text-[9px] font-ui px-1.5 py-px rounded-[2px]", cls)}>{label}</span>;
}

function CompactPairRow({ pair }) {
    const counted = pair.confidence === "HIGH";
    const tone = pairedOffOutcomeTone(pair.pairedOffOutcome);
    const rVal = pair.pairedOffR != null
        ? `${pair.pairedOffR >= 0 ? "+" : ""}${pair.pairedOffR.toFixed(2)}R`
        : "—";
    return (
        <div
            className="grid grid-cols-[2.8rem_1fr_3.4rem_4.4rem] items-center gap-2 py-1.5 border-b border-[hsl(var(--border-soft)/0.14)] last:border-b-0"
            style={{ opacity: counted ? 1 : 0.5 }}
        >
            <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))] tabular-nums">OB {pair.obId}</span>
            <span><OutcomeChip pair={pair} /></span>
            <span className={cn("text-[10px] font-num tabular-nums text-right", FFT_TONE_TEXT[tone] ?? FFT_TONE_TEXT.muted)}>{rVal}</span>
            <span className="text-right"><ConfidenceBadge level={pair.confidence} /></span>
        </div>
    );
}

// Per-row Net R contribution — DISPLAY ONLY (mirrors the analytics aggregation:
// HIGH-confidence WIN/loss-like rows contribute -pairedOffR, else 0). Used for the
// "Impact R" sort only; no analytics value is derived from it.
function fftPairContribution(p) {
    if (p.confidence !== "HIGH" || p.pairedOffR == null) return 0;
    if (p.pairedOffOutcome === "WIN" || FFT_LOSS_OUTCOMES.has(p.pairedOffOutcome)) return -p.pairedOffR;
    return 0;
}

const FFT_TABLE_TOP_N = 10;
const FFT_TABLE_FILTERS = [
    { key: "all",      label: "All" },
    { key: "counted",  label: "Counted" },
    { key: "excluded", label: "Excluded" },
    { key: "winners",  label: "Winners" },
    { key: "losses",   label: "Losses" },
];
const FFT_TABLE_SORTS = [
    { key: "impact",     label: "Impact R" },
    { key: "ob",         label: "OB" },
    { key: "confidence", label: "Conf" },
    { key: "outcome",    label: "Outcome" },
];

function PairedOffTable({ pairs }) {
    const [open, setOpen] = useState(false);          // collapsed by default
    const [expanded, setExpanded] = useState(false);  // top-N vs all
    const [filterKey, setFilterKey] = useState("all");
    const [sortKey, setSortKey] = useState("impact");
    const [sortDir, setSortDir] = useState("desc");
    if (!pairs?.length) return null;

    const matchesFilter = (p) => {
        const counted = p.confidence === "HIGH";
        if (filterKey === "counted") return counted;
        if (filterKey === "excluded") return !counted;
        if (filterKey === "winners") return counted && p.pairedOffOutcome === "WIN";
        if (filterKey === "losses") return counted && FFT_LOSS_OUTCOMES.has(p.pairedOffOutcome);
        return true;
    };
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = pairs.filter(matchesFilter).sort((a, b) => {
        if (sortKey === "outcome") {
            return dir * String(a.pairedOffOutcome || "").localeCompare(String(b.pairedOffOutcome || ""));
        }
        let av, bv;
        if (sortKey === "ob") { av = Number(a.obId) || 0; bv = Number(b.obId) || 0; }
        else if (sortKey === "confidence") { av = a.confidence === "HIGH" ? 1 : 0; bv = b.confidence === "HIGH" ? 1 : 0; }
        else { av = fftPairContribution(a); bv = fftPairContribution(b); }
        return dir * (av - bv);
    });
    const total = sorted.length;
    const shown = expanded ? sorted : sorted.slice(0, FFT_TABLE_TOP_N);

    const chipCls = (active) => cn(
        "text-[8.5px] font-ui uppercase tracking-[0.06em] px-1.5 py-px rounded-[2px] border transition-colors",
        active
            ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
            : "border-[hsl(var(--border-soft)/0.6)] bg-[hsl(var(--panel-2))] text-[hsl(var(--text-2))]",
    );

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between py-1 text-[9px] font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]"
            >
                <span>Per-cancel detail · {pairs.length} cancels</span>
                <span className="opacity-70">{open ? "▾ hide" : "▸ show"}</span>
            </button>

            {open && (
                <>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                        {FFT_TABLE_FILTERS.map((f) => (
                            <button key={f.key} type="button" onClick={() => setFilterKey(f.key)} className={chipCls(filterKey === f.key)}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="text-[8.5px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))] opacity-70 mr-0.5">Sort</span>
                        {FFT_TABLE_SORTS.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => {
                                    if (sortKey === s.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                    else { setSortKey(s.key); setSortDir("desc"); }
                                }}
                                className={chipCls(sortKey === s.key)}
                            >
                                {s.label}{sortKey === s.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-[2.8rem_1fr_3.4rem_4.4rem] items-center gap-2 pb-1 mt-2 mb-0.5 border-b border-[hsl(var(--border-soft)/0.22)] text-[8.5px] font-ui text-[hsl(var(--text-2))] opacity-90 uppercase tracking-[0.08em]">
                        <span>OB</span>
                        <span>Control outcome</span>
                        <span className="text-right">Control R</span>
                        <span className="text-right">Impact?</span>
                    </div>

                    {shown.length === 0 ? (
                        <div className="py-2 text-[10px] font-ui text-[hsl(var(--text-2))] italic">No cancels match this filter.</div>
                    ) : (
                        shown.map((p, i) => <CompactPairRow key={p.obId + "-" + i} pair={p} />)
                    )}

                    {total > FFT_TABLE_TOP_N && (
                        <button
                            type="button"
                            onClick={() => setExpanded((e) => !e)}
                            className="mt-1.5 text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--accent-primary))] hover:underline"
                        >
                            {expanded ? "Show less" : `Show all (${total})`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

// ── Paired OFF aggregate summary ──────────────────────────────────────────────

function PairedSummarySection({ pairedStats }) {
    const {
        highConfCount, lowConfCount,
        confirmedLossesAvoided, confirmedWinsRemoved,
        ghostAccuracyRate,
        hasPairedData,
    } = pairedStats;

    if (!hasPairedData || pairedStats.fftCancels === 0) return null;

    // Display-only R split (reads existing pair outputs; no pairing recomputed).
    let benefitR = 0, costR = 0;
    for (const p of pairedStats.pairs) {
        if (p.confidence !== "HIGH" || p.pairedOffR == null) continue;
        if (p.pairedOffOutcome === "WIN") costR += -p.pairedOffR;
        else if (FFT_LOSS_OUTCOMES.has(p.pairedOffOutcome)) benefitR += -p.pairedOffR;
    }

    return (
        <>
            <Divider />
            <SectionLabel>Paired control · authoritative</SectionLabel>

            {/* Cost vs benefit — the two numbers that net to the verdict */}
            {highConfCount > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <StatTile
                        label="Losses avoided"
                        value={String(confirmedLossesAvoided)}
                        sub={`+${benefitR.toFixed(2)}R saved · benefit`}
                        tone={confirmedLossesAvoided > 0 ? "success" : "muted"}
                    />
                    <StatTile
                        label="Winners removed"
                        value={String(confirmedWinsRemoved)}
                        sub={`${costR.toFixed(2)}R given up · cost`}
                        tone={confirmedWinsRemoved > 0 ? "danger" : "muted"}
                    />
                </div>
            )}

            <TrustBar high={highConfCount} low={lowConfCount} />

            {/* Not-counted breakdown — the "unclear" rows split by reason, so they
                read as informative buckets rather than one lump of noise. */}
            {(() => {
                const b = summarizeFftPairBuckets(pairedStats.pairs);
                if (b.lowTotal === 0) return null;
                const cell = "rounded-[3px] bg-[hsl(var(--panel-2))] px-2 py-1.5 cursor-help";
                return (
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                        <div className={cell} title="Self-invalidated: the FFT-OFF control also failed to produce a clean filled trade (invalidated / unfilled / news-touch-cancel), so there is no direct counterfactual R to count. FFT's cancel was effectively neutral here.">
                            <div className="text-[8.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Self-invalidated</div>
                            <div className="text-[15px] font-num font-semibold tabular-nums leading-tight mt-0.5 text-[hsl(var(--text))]">{b.selfInvalidated}</div>
                            <div className="text-[8.5px] font-ui text-[hsl(var(--text-2))] opacity-90 leading-snug">no counterfactual fill</div>
                        </div>
                        <div className={cell} title="Timing-divergent: the FFT-OFF control filled, but too far away in time to count as high-confidence. A real outcome shown as secondary evidence — not yet in primary Net R.">
                            <div className="text-[8.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Timing-divergent</div>
                            <div className="text-[15px] font-num font-semibold tabular-nums leading-tight mt-0.5 text-[hsl(var(--warning))]">{b.timingDivergent}</div>
                            <div className="text-[8.5px] font-ui text-[hsl(var(--text-2))] opacity-90 leading-snug">filled · secondary evidence</div>
                        </div>
                        <div className={cell} title="Other unresolved: no matching FFT-OFF control candidate was found for these cancels.">
                            <div className="text-[8.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">Other</div>
                            <div className="text-[15px] font-num font-semibold tabular-nums leading-tight mt-0.5 text-[hsl(var(--text-2))]">{b.otherLow}</div>
                            <div className="text-[8.5px] font-ui text-[hsl(var(--text-2))] opacity-90 leading-snug">no control candidate</div>
                        </div>
                    </div>
                );
            })()}

            <PairedOffTable pairs={pairedStats.pairs} />

            <div className="mt-2 flex gap-1.5 items-start text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-95 leading-snug">
                <span className="text-[hsl(var(--accent-primary))] shrink-0">ⓘ</span>
                <span>Only counted (high-confidence) rows move net R impact. "Not counted" rows are split above: self-invalidated (no counterfactual), timing-divergent (filled but uncertain timing — secondary evidence), and other (no control candidate).</span>
            </div>

            {ghostAccuracyRate != null && highConfCount > 0 && (
                <div className="mt-2">
                    <StatRow
                        label="Ghost accuracy"
                        value={`${ghostAccuracyRate.toFixed(0)}%`}
                        sub="ghost agreed with paired control"
                        tone={ghostAccuracyRate >= 75 ? "success" : ghostAccuracyRate >= 50 ? "warning" : "danger"}
                    />
                </div>
            )}

            {lowConfCount > 0 && highConfCount === 0 && (
                <div className="mt-2 text-[9.5px] font-ui text-[hsl(var(--text-2))] opacity-90 italic">
                    All cancels are low-confidence — control rows were invalid, unfilled, or
                    timing-diverged. Only the ghost estimate below is available.
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
        ghostWins, ghostLosses,
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
            title={<span className="text-[hsl(var(--text))]"><TermTip termKey="fft">FFT Protection</TermTip></span>}
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
            <div className="text-[10px] font-ui text-[hsl(var(--text-2))] mb-3">
                First failed tag · {fftCancels} setups cancelled before trigger
            </div>

            {/* Verdict hero — paired when trustworthy, else ghost estimate */}
            {(hasPairedData && pairedStats.hasHighConfPairs)
                ? <VerdictHero netR={pairedStats.confirmedNetRImpact} verified />
                : hasGhostData
                    ? <VerdictHero netR={ghostNetR} verified={false} />
                    : null}

            {/* Unverified notice — shown when no paired OFF run is loaded */}
            {!hasPairedData && hasGhostData && (
                <div className="mb-3 px-2 py-1.5 border border-dashed border-[hsl(var(--warning)/0.30)] bg-[hsl(var(--warning)/0.05)] text-[8.5px] font-ui text-[hsl(var(--warning)/0.70)] italic leading-snug">
                    No paired FFT-OFF control loaded — the number above is a ghost estimate.
                    Import a run with its built-in control for authoritative impact.
                </div>
            )}

            {/* ── Paired control section (primary when available) ─────── */}
            <PairedSummarySection pairedStats={pairedStats} />

            {/* ── Ghost section (secondary / collapsible) ─────────────── */}
            {hasGhostData && (
                <>
                    <Divider />
                    <button
                        type="button"
                        onClick={() => setShowGhost(o => !o)}
                        className="w-full flex items-center justify-between group mb-1 outline-none"
                    >
                        <SectionLabel>
                            <TermTip termKey="ghost">Ghost sim</TermTip>{hasPairedData ? " · secondary · unverified" : " · unverified"}
                        </SectionLabel>
                        <span className="text-[9px] text-muted-lab opacity-40 group-hover:opacity-70 transition-opacity">
                            {showGhost ? "▾" : "▸"}
                        </span>
                    </button>

                    {showGhost && (
                        <>
                            <GhostOutcomeBar
                                wins={ghostWins}
                                losses={ghostLosses}
                                unfilled={ghostUnfilled}
                                breakevens={ghostBreakevens}
                            />

                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <StatTile label="Ghost net R" value={fmtFftR(ghostNetR)} sub="if none cancelled" tone={ghostNetRTone} />
                                <StatTile label="Wins / losses" value={`${ghostWins} / ${ghostLosses}`} tone="muted" />
                                <StatTile label="Win rate" value={fmtFftPct(ghostWinRate)} tone={wrTone} />
                            </div>
                            <div className="mt-1.5 text-[8.5px] font-ui text-[hsl(var(--warning)/0.65)] opacity-80 italic">
                                {hasPairedData
                                    ? "Ghost may diverge from the paired control — trust the table above."
                                    : "Ghost outcomes are simulated estimates and may not reflect actual behaviour."}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Move-away distance — condensed footer */}
            {hasMoveAwayData && (
                <>
                    <Divider />
                    <div className="flex items-baseline justify-between gap-2">
                        <SectionLabel>Move-away at cancel</SectionLabel>
                        <span className="text-[11.5px] font-num tabular-nums text-[hsl(var(--text))]">
                            {fmtFftPips(avgMoveAwayAtCancel)}<span className="text-[9px] text-[hsl(var(--text-2))] opacity-80 ml-1">avg</span>
                            <span className="mx-1.5 text-[hsl(var(--text-2))] opacity-40">·</span>
                            {fmtFftPips(maxMoveAwayAtCancel)}<span className="text-[9px] text-[hsl(var(--text-2))] opacity-80 ml-1">max pips</span>
                        </span>
                    </div>
                </>
            )}
        </NeonPanel>
    );
}
