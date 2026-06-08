// FftClassificationPanel.jsx — FFT Classification V2a.
//
// Answers at a glance: "Where does First Failed Tag Cancel help, and where does
// it hurt?" — using the AUTHORITATIVE paired FFT-OFF control when available,
// falling back to (clearly-labelled) unverified ghost estimates otherwise.
//
// Authoritative path:
//   computePairedFftAnalytics(trades, offTrades) → pairs[]. Each pair carries
//   confidence (HIGH/LOW), pairedOffOutcome, pairedOffR, moveAwayPips and the
//   raw cancelTrade. We bucket those pairs by structure / direction / OB-origin
//   session and aggregate the same way FftProtectionPanel does (cost = −R on
//   removed wins, benefit = −R on avoided losses). No analytics formula change.
//
// Net FFT impact (R): Σ −pairedOffR over HIGH-confidence WIN/loss-like pairs.
//   positive = FFT helped (it cancelled net-losing setups)
//   negative = FFT hurt   (it cancelled net-winning setups)
//
// Props:
//   trades    {array} — all trades from the active FFT run (required)
//   offTrades {array} — paired FFT-OFF control trades (auto-control or manual)

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { computePairedFftAnalytics } from "@/data/fftPairingAnalytics";
import { computeFftAnalytics, fmtFftR, fmtFftPips } from "@/data/fftAnalytics";
import { cn } from "@/lib/utils";

// Confidence / sample-size thresholds for a trustworthy verdict.
const MIN_CANCELS = 5;     // below this many cancels → inconclusive (low-n)
const MIN_TRUST   = 3;     // below this many HIGH-confidence pairs → inconclusive
const MIN_COVERAGE = 0.5;  // below 50% trustworthy coverage → inconclusive

// Paired OFF outcomes that count as a "loss avoided" (mirrors the analytics).
const LOSS_LIKE = new Set(["LOSS", "NEWS_FLATTEN", "PROTECTION_EXIT"]);

const SESSION_ORDER = ["London", "London Lull", "New York", "Asia", "Outside"];

// ── bucketers (operate on a pair / its raw cancelTrade) ──────────────────────

function structOf(p) {
    const s = String(p?.cancelTrade?.structure ?? p?.cancelTrade?.structure_type ?? "").toUpperCase();
    if (s.includes("CHOCH")) return "CHoCH";
    if (s.includes("BOS")) return "BOS";
    return null;
}

function dirOf(p) {
    const raw = String(p?.direction ?? p?.cancelTrade?.direction ?? "").trim().toLowerCase();
    if (raw.startsWith("long") || raw === "buy" || raw.startsWith("bull")) return "Long";
    if (raw.startsWith("short") || raw === "sell" || raw.startsWith("bear")) return "Short";
    return null;
}

// Cancelled-before-entry rows usually have no fill session, so bucket FFT cancels
// by the OB's ORIGIN session instead of trade.session.
function originSessionOf(p) {
    const raw = String(
        p?.cancelTrade?.ob_origin_session ?? p?.cancelTrade?.obOriginSession ?? "",
    ).toLowerCase().replace(/[_-]+/g, " ").trim();
    if (!raw || raw === "—" || raw === "unknown" || raw === "any") return "Unknown";
    if (raw.includes("lull")) return "London Lull";
    if (raw.includes("new york") || raw === "ny") return "New York";
    if (raw.includes("london")) return "London";
    if (raw.includes("asia") || raw.includes("tokyo")) return "Asia";
    if (raw.includes("outside")) return "Outside";
    return "Unknown";
}

// ── aggregation + verdict ────────────────────────────────────────────────────

function aggregatePaired(pairs) {
    let cancels = 0, trustworthy = 0, winnersRemoved = 0, losersAvoided = 0, netImpact = 0;
    let moveSum = 0, moveN = 0;
    for (const p of pairs) {
        cancels++;
        const mv = p?.moveAwayPips;
        if (mv != null && Number.isFinite(Number(mv)) && Number(mv) > 0) { moveSum += Number(mv); moveN++; }
        if (p.confidence !== "HIGH") continue;
        trustworthy++;
        const oc = p.pairedOffOutcome;
        if (oc === "WIN") {
            winnersRemoved++;
            if (p.pairedOffR != null) netImpact += -p.pairedOffR;   // removed win → cost
        } else if (LOSS_LIKE.has(oc)) {
            losersAvoided++;
            if (p.pairedOffR != null) netImpact += -p.pairedOffR;   // avoided loss → benefit
        }
    }
    return {
        cancels,
        trustworthy,
        coverage: cancels > 0 ? trustworthy / cancels : 0,
        winnersRemoved,
        losersAvoided,
        netImpact,
        avgMoveAway: moveN > 0 ? moveSum / moveN : null,
    };
}

// Verdict is gated on confidence: a large impact on a thin / low-coverage bucket
// is reported as INCONCLUSIVE, never as a confident HELPS/HURTS.
function verdictFor(agg) {
    if (agg.cancels < MIN_CANCELS || agg.trustworthy < MIN_TRUST) {
        return { label: "INCONCLUSIVE", tone: "muted", note: `low sample (n=${agg.cancels}, trust=${agg.trustworthy})` };
    }
    if (agg.coverage < MIN_COVERAGE) {
        return { label: "INCONCLUSIVE", tone: "muted", note: `low coverage (${Math.round(agg.coverage * 100)}%)` };
    }
    if (agg.netImpact > 0.005) return { label: "HELPS", tone: "success", note: "net positive impact" };
    if (agg.netImpact < -0.005) return { label: "HURTS", tone: "danger", note: "net negative impact" };
    return { label: "INCONCLUSIVE", tone: "muted", note: "net ~ neutral" };
}

// ── shared atoms ─────────────────────────────────────────────────────────────

const TONE_TEXT = {
    success: "text-[hsl(var(--success))]",
    danger:  "text-[hsl(var(--danger))]",
    muted:   "text-[hsl(var(--text-2))]",
};
const TONE_CHIP = {
    success: "bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.4)]",
    danger:  "bg-[hsl(var(--danger)/0.16)] text-[hsl(var(--danger))] border-[hsl(var(--danger)/0.4)]",
    muted:   "bg-[hsl(var(--panel)/0.6)] text-[hsl(var(--text-2))] border-[hsl(var(--border-soft)/0.6)]",
};

function VerdictChip({ verdict }) {
    return (
        <span
            title={verdict.note || undefined}
            className={cn(
                "inline-block px-1.5 py-px rounded-sm border text-[8.5px] font-ui font-semibold uppercase tracking-[0.06em] cursor-default",
                TONE_CHIP[verdict.tone] || TONE_CHIP.muted,
            )}
        >
            {verdict.label}
        </span>
    );
}

// ── paired (authoritative) view ──────────────────────────────────────────────

const PAIRED_COLS = "minmax(78px,1.15fr) 44px 70px 52px 52px 66px 52px 84px";

const PAIRED_HEADERS = [
    { label: "", title: null },
    { label: "Cancels", title: "First Failed Tag cancels in this bucket." },
    { label: "Trust/Cov", title: "HIGH-confidence pairs / cancels, with coverage %." },
    { label: "Win rem", title: "Winners removed: cancels the paired control showed would have WON (the cost of FFT)." },
    { label: "Loss avd", title: "Losses avoided: cancels the paired control showed would have LOST (the benefit of FFT)." },
    { label: "Net R", title: "Σ −(control R) over trustworthy pairs. Positive = FFT helped, negative = FFT hurt." },
    { label: "Move", title: "Average pips past the OB edge at cancel." },
    { label: "Verdict", title: "Confidence-gated: large impact on a thin/low-coverage bucket is INCONCLUSIVE." },
];

function PairedHeaderRow() {
    return (
        <div
            className="grid items-baseline gap-x-2 px-1 pb-1 border-b border-[hsl(var(--border-soft)/0.25)]"
            style={{ gridTemplateColumns: PAIRED_COLS }}
        >
            {PAIRED_HEADERS.map((h, i) => (
                <span
                    key={h.label || `c${i}`}
                    title={h.title || undefined}
                    className={cn(
                        "text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))]",
                        i === 0 ? "text-left" : "text-right",
                        i === 7 && "text-right",
                        h.title && "cursor-help",
                    )}
                >
                    {h.label}
                </span>
            ))}
        </div>
    );
}

function PairedRow({ label, agg, strong = false }) {
    const empty = agg.cancels === 0;
    const verdict = verdictFor(agg);
    // Net R colour is tied to the verdict, so low-confidence rows never read as a
    // confident green/red.
    const netTone = verdict.label === "HELPS" ? TONE_TEXT.success
        : verdict.label === "HURTS" ? TONE_TEXT.danger
        : TONE_TEXT.muted;
    const cell = "text-[11px] font-num tabular-nums text-right";
    const dash = <span className="text-[hsl(var(--text-3))]">—</span>;

    return (
        <div
            className={cn(
                "grid items-baseline gap-x-2 px-1 py-1 border-b border-[hsl(var(--border-soft)/0.14)] last:border-b-0",
                empty && "opacity-40",
            )}
            style={{ gridTemplateColumns: PAIRED_COLS }}
        >
            <span className={cn("text-[10.5px] font-ui text-left", strong ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text))]")}>
                {label}
            </span>
            <span className={cn(cell, "font-semibold text-[hsl(var(--text-1))]")}>{agg.cancels}</span>
            <span className={cn(cell, "text-[hsl(var(--text-2))]")}>
                {empty ? dash : <>{agg.trustworthy}/{agg.cancels} <span className="text-[hsl(var(--text-3))]">{Math.round(agg.coverage * 100)}%</span></>}
            </span>
            <span className={cn(cell, agg.winnersRemoved > 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]")}>
                {empty ? dash : agg.winnersRemoved}
            </span>
            <span className={cn(cell, agg.losersAvoided > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-2))]")}>
                {empty ? dash : agg.losersAvoided}
            </span>
            <span className={cn(cell, "font-semibold", netTone)}>{empty ? dash : fmtFftR(agg.netImpact)}</span>
            <span className={cn(cell, "text-[hsl(var(--text-2))]")}>
                {agg.avgMoveAway != null ? `${fmtFftPips(agg.avgMoveAway)}p` : dash}
            </span>
            <span className="text-right">{empty ? dash : <VerdictChip verdict={verdict} />}</span>
        </div>
    );
}

function SectionHead({ children }) {
    return (
        <div className="text-[9.5px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text))] px-1 pt-2 pb-0.5">
            {children}
        </div>
    );
}

function PairedView({ paired }) {
    const pairs = Array.isArray(paired.pairs) ? paired.pairs : [];

    const overall = useMemo(() => aggregatePaired(pairs), [pairs]);
    const byStructure = useMemo(
        () => ["BOS", "CHoCH"].map((k) => ({ label: k, agg: aggregatePaired(pairs.filter((p) => structOf(p) === k)) })),
        [pairs],
    );
    const byDirection = useMemo(
        () => ["Long", "Short"].map((k) => ({ label: k, agg: aggregatePaired(pairs.filter((p) => dirOf(p) === k)) })),
        [pairs],
    );
    const bySession = useMemo(() => {
        const rows = SESSION_ORDER.map((k) => ({ label: k, agg: aggregatePaired(pairs.filter((p) => originSessionOf(p) === k)) }));
        const unknown = aggregatePaired(pairs.filter((p) => originSessionOf(p) === "Unknown"));
        if (unknown.cancels > 0) rows.push({ label: "Unknown", agg: unknown });
        return rows;
    }, [pairs]);

    const overallVerdict = verdictFor(overall);
    const bannerTone = overallVerdict.tone;
    const bannerVerb = overallVerdict.label === "HELPS" ? "FFT helps overall"
        : overallVerdict.label === "HURTS" ? "FFT hurts overall"
        : "FFT impact inconclusive";

    return (
        <NeonPanel title={<span className="text-[hsl(var(--text))]">FFT Classification</span>}>
            {/* Overall verdict banner */}
            <div
                className={cn(
                    "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-2.5 py-2 mb-2 rounded-sm border",
                    TONE_CHIP[bannerTone] || TONE_CHIP.muted,
                )}
            >
                <span className="text-[12px] font-ui font-semibold uppercase tracking-[0.04em]">{bannerVerb}</span>
                <span className="text-[12px] font-num font-semibold tabular-nums">
                    {fmtFftR(overall.netImpact)}
                </span>
                <span className="text-[9.5px] font-ui opacity-90">
                    {overall.trustworthy}/{overall.cancels} trustworthy ({Math.round(overall.coverage * 100)}%) ·
                    {" "}{overall.losersAvoided} losses avoided · {overall.winnersRemoved} winners removed
                </span>
            </div>

            <p className="text-[9.5px] font-ui text-[hsl(var(--text-2))] leading-snug mb-2">
                Authoritative — paired FFT-OFF control. Net R = Σ −(control R) over trustworthy (high-confidence) pairs:{" "}
                <span className="text-[hsl(var(--success))]">positive = FFT helped</span>,{" "}
                <span className="text-[hsl(var(--danger))]">negative = FFT hurt</span>. Verdicts are confidence-gated.
            </p>

            <div className="overflow-x-auto">
                <div className="min-w-[500px]">
                    <PairedHeaderRow />

                    <SectionHead>Overall</SectionHead>
                    <PairedRow label="All FFT cancels" agg={overall} strong />

                    <SectionHead>By structure</SectionHead>
                    {byStructure.map((r) => <PairedRow key={r.label} label={r.label} agg={r.agg} />)}

                    <SectionHead>By direction</SectionHead>
                    {byDirection.map((r) => <PairedRow key={r.label} label={r.label} agg={r.agg} />)}

                    <SectionHead>By session</SectionHead>
                    {bySession.map((r) => <PairedRow key={r.label} label={r.label} agg={r.agg} />)}
                </div>
            </div>

            <p className="mt-2 text-[8.5px] font-ui text-[hsl(var(--text-3))] italic leading-snug">
                Session uses OB origin session for cancelled setups (cancelled-before-entry rows have no fill session).
                Low-n / low-coverage buckets are reported INCONCLUSIVE even when the impact is large.
            </p>
        </NeonPanel>
    );
}

// ── ghost (fallback) view — unverified; only when no paired control exists ────

function ghostStructBucket(t) {
    const s = String(t?.structure ?? t?.structure_type ?? "").toUpperCase();
    if (s.includes("CHOCH")) return "CHoCH";
    if (s.includes("BOS")) return "BOS";
    return null;
}
function ghostDirBucket(t) {
    const raw = String(t?.direction ?? t?.side ?? t?.bias ?? "").trim().toLowerCase();
    if (raw === "long" || raw === "buy" || raw.startsWith("bull")) return "Long";
    if (raw === "short" || raw === "sell" || raw.startsWith("bear")) return "Short";
    return null;
}

const GHOST_COLS = "minmax(78px,1.2fr) 52px 64px 70px 70px 64px";

function GhostRow({ label, stats, strong = false }) {
    const n = stats.fftCancels;
    const empty = n === 0;
    const hasGhost = stats.hasGhostData;
    const impact = hasGhost ? -stats.ghostNetR : null;
    const impactTone = impact == null ? "text-[hsl(var(--text-2))]"
        : impact > 0.005 ? "text-[hsl(var(--success))]"
        : impact < -0.005 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]";
    const cell = "text-[11px] font-num tabular-nums text-right";
    const dash = <span className="text-[hsl(var(--text-3))]">—</span>;
    return (
        <div
            className={cn("grid items-baseline gap-x-2 px-1 py-1 border-b border-[hsl(var(--border-soft)/0.14)] last:border-b-0", empty && "opacity-40")}
            style={{ gridTemplateColumns: GHOST_COLS }}
        >
            <span className={cn("text-[10.5px] font-ui text-left", strong ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text))]")}>{label}</span>
            <span className={cn(cell, "font-semibold text-[hsl(var(--text-1))]")}>{n}</span>
            <span className={cell}>{hasGhost ? `${stats.ghostWins} / ${stats.ghostLosses}` : dash}</span>
            <span className={cn(cell, "text-[hsl(var(--text-2))]")}>{hasGhost ? fmtFftR(stats.ghostNetR) : dash}</span>
            <span className={cn(cell, "font-semibold", impactTone)}>{hasGhost ? fmtFftR(impact) : dash}</span>
            <span className={cn(cell, "text-[hsl(var(--text-2))]")}>{stats.hasMoveAwayData ? `${fmtFftPips(stats.avgMoveAwayAtCancel)}p` : dash}</span>
        </div>
    );
}

function GhostView({ trades }) {
    const model = useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        return {
            overall: computeFftAnalytics(list),
            byStructure: ["BOS", "CHoCH"].map((k) => ({ label: k, stats: computeFftAnalytics(list.filter((t) => ghostStructBucket(t) === k)) })),
            byDirection: ["Long", "Short"].map((k) => ({ label: k, stats: computeFftAnalytics(list.filter((t) => ghostDirBucket(t) === k)) })),
        };
    }, [trades]);

    return (
        <NeonPanel title={<span className="text-[hsl(var(--text))]">FFT Classification</span>}>
            <div className="mb-2 px-2 py-1.5 border border-dashed border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] text-[9px] font-ui text-[hsl(var(--warning))] italic leading-snug">
                Ghost estimate only — paired control unavailable. Load a paired FFT-OFF run (or a run with built-in
                control) for authoritative help/hurt verdicts. FFT Impact = −Ghost Net R (simulated, unverified).
            </div>
            <div className="overflow-x-auto">
                <div className="min-w-[440px]">
                    <div className="grid items-baseline gap-x-2 px-1 pb-1 border-b border-[hsl(var(--border-soft)/0.25)]" style={{ gridTemplateColumns: GHOST_COLS }}>
                        {["", "Cancels", "Ghost W/L", "Ghost Net R", "FFT Impact", "Move"].map((h, i) => (
                            <span key={h || `c${i}`} className={cn("text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))]", i === 0 ? "text-left" : "text-right")}>{h}</span>
                        ))}
                    </div>
                    <SectionHead>Overall</SectionHead>
                    <GhostRow label="All FFT cancels" stats={model.overall} strong />
                    <SectionHead>By structure</SectionHead>
                    {model.byStructure.map((r) => <GhostRow key={r.label} label={r.label} stats={r.stats} />)}
                    <SectionHead>By direction</SectionHead>
                    {model.byDirection.map((r) => <GhostRow key={r.label} label={r.label} stats={r.stats} />)}
                </div>
            </div>
        </NeonPanel>
    );
}

// ── panel ────────────────────────────────────────────────────────────────────

export function FftClassificationPanel({ trades = [], offTrades = [] }) {
    const list = Array.isArray(trades) ? trades : [];
    const off = Array.isArray(offTrades) ? offTrades : [];
    const paired = useMemo(() => computePairedFftAnalytics(list, off), [list, off]);

    if (paired.fftCancels === 0) {
        return (
            <NeonPanel title={<span className="text-[hsl(var(--text))]">FFT Classification</span>}>
                <p className="text-[10px] font-ui text-[hsl(var(--text-2))] italic">No FFT cancels in this scenario.</p>
            </NeonPanel>
        );
    }

    // Authoritative-first: when a paired FFT-OFF control is present, render the
    // authoritative verdicts. Otherwise fall back to ghost estimates.
    if (paired.hasPairedData) return <PairedView paired={paired} />;
    return <GhostView trades={list} />;
}

export default FftClassificationPanel;
