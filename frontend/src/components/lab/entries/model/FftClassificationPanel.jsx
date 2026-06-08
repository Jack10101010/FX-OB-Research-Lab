// FftClassificationPanel.jsx — Stage 1 FFT breakdown.
//
// Answers: "When does First Failed Tag Cancel help or hurt?"
//
// Pure presentational. Buckets the SAME trades array already passed to
// ModelAnalysis / FftProtectionPanel and calls the existing
// computeFftAnalytics() on each slice — no new analytics math, no backend.
//
// IMPORTANT: bucketing runs over the RAW trades (not buildDirStructMatrix,
// which keeps only performance trades and would drop the FFT cancels). Each
// bucket's sample size IS its FFT cancel count.
//
// Wording:
//   Ghost Net R = hypothetical R of the cancelled setups had FFT not cancelled
//                 them (simulated, unverified).
//   FFT Impact  = −Ghost Net R. Positive = FFT helped, negative = FFT hurt.
//
// Props:
//   trades {array} — all trades from the active FFT run (required)

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { computeFftAnalytics, fmtFftR, fmtFftPips } from "@/data/fftAnalytics";
import { cn } from "@/lib/utils";

const SMALL_N = 5; // below this many cancels, dim + flag the bucket as low-sample

// ── bucketers (inline; match importer-normalised fields) ─────────────────────

function structBucket(t) {
    const s = String(t?.structure ?? t?.structure_type ?? "").toUpperCase();
    if (s.includes("CHOCH")) return "CHoCH";
    if (s.includes("BOS")) return "BOS";
    return null;
}

function dirBucket(t) {
    const raw = String(t?.direction ?? t?.side ?? t?.bias ?? "").trim().toLowerCase();
    if (raw === "long" || raw === "buy" || raw.startsWith("bull")) return "Long";
    if (raw === "short" || raw === "sell" || raw.startsWith("bear")) return "Short";
    return null;
}

function sessionBucket(t) {
    const s = String(t?.session ?? t?.fillSession ?? "").toLowerCase().replace(/[_-]+/g, " ");
    if (s.includes("lull")) return "London Lull";
    if (s.includes("new york") || s === "ny") return "New York";
    if (s.includes("london")) return "London";
    if (s.includes("asia") || s.includes("tokyo")) return "Asia";
    if (s.includes("outside")) return "Outside";
    return null;
}

const SESSION_ORDER = ["London", "London Lull", "New York", "Asia", "Outside"];

// ── layout ───────────────────────────────────────────────────────────────────

const COLS = "minmax(76px,1.2fr) 52px 62px 46px 70px 70px 64px";

const HEADERS = [
    { label: "", title: null },
    { label: "Cancels", title: "Number of First Failed Tag cancels in this bucket (also the sample size)." },
    { label: "Ghost W/L", title: "Ghost-simulated wins / losses of the cancelled setups, had FFT not cancelled them (unverified)." },
    { label: "Cov", title: "Ghost coverage: how many of the cancels had ghost tracking, out of total cancels in the bucket." },
    { label: "Ghost Net R", title: "Hypothetical net R of the cancelled setups if FFT had not cancelled them (simulated, unverified)." },
    { label: "FFT Impact", title: "−Ghost Net R. Positive = FFT helped (it cancelled net-losing setups); negative = FFT hurt." },
    { label: "Move-away", title: "Average pips price had moved past the OB edge at the moment of cancel." },
];

function HeaderRow() {
    return (
        <div
            className="grid items-baseline gap-x-2 px-1 pb-1 border-b border-[hsl(var(--border-soft)/0.25)]"
            style={{ gridTemplateColumns: COLS }}
        >
            {HEADERS.map((h, i) => (
                <span
                    key={h.label || `c${i}`}
                    title={h.title || undefined}
                    className={cn(
                        "text-[9px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2))] opacity-90",
                        i === 0 ? "text-left" : "text-right",
                        h.title && "cursor-help",
                    )}
                >
                    {h.label}
                </span>
            ))}
        </div>
    );
}

function SectionHead({ children }) {
    return (
        <div className="text-[9.5px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text))] opacity-90 px-1 pt-2 pb-0.5">
            {children}
        </div>
    );
}

function StatRow({ label, stats, strong = false }) {
    const n = stats.fftCancels;
    const empty = n === 0;
    const lowN = n > 0 && n < SMALL_N;
    const hasGhost = stats.hasGhostData;
    const impact = hasGhost ? -stats.ghostNetR : null;
    const impactTone =
        impact == null ? "text-[hsl(var(--text-2))]"
        : impact > 0.005 ? "text-[hsl(var(--success))]"
        : impact < -0.005 ? "text-[hsl(var(--danger))]"
        : "text-[hsl(var(--text-2))]";

    const cell = "text-[11px] font-num tabular-nums text-right";
    const dash = <span className="text-[hsl(var(--text-3))]">—</span>;

    return (
        <div
            className={cn(
                "grid items-baseline gap-x-2 px-1 py-1 border-b border-[hsl(var(--border-soft)/0.14)] last:border-b-0",
                empty && "opacity-40",
                lowN && "opacity-75",
            )}
            style={{ gridTemplateColumns: COLS }}
            title={lowN ? `Low sample (n=${n} < ${SMALL_N}) — interpret with caution.` : undefined}
        >
            <span className={cn("text-[10.5px] font-ui text-left", strong ? "text-[hsl(var(--text-1))] font-semibold" : "text-[hsl(var(--text))]")}>
                {label}
                {lowN && <span className="ml-1 text-[8px] text-[hsl(var(--warning))]">low n</span>}
            </span>
            <span className={cn(cell, "font-semibold text-[hsl(var(--text-1))]")}>{n}</span>
            <span className={cell}>{hasGhost ? `${stats.ghostWins} / ${stats.ghostLosses}` : dash}</span>
            <span className={cn(cell, "text-[hsl(var(--text))]")}>
                {empty ? dash : `${stats.ghostTracked}/${n}`}
            </span>
            <span className={cn(cell, "text-[hsl(var(--text))]")}>{hasGhost ? fmtFftR(stats.ghostNetR) : dash}</span>
            <span className={cn(cell, "font-semibold", impactTone)}>{hasGhost ? fmtFftR(impact) : dash}</span>
            <span className={cn(cell, "text-[hsl(var(--text))]")}>
                {stats.hasMoveAwayData ? `${fmtFftPips(stats.avgMoveAwayAtCancel)}p` : dash}
            </span>
        </div>
    );
}

// ── panel ────────────────────────────────────────────────────────────────────

export function FftClassificationPanel({ trades = [] }) {
    const model = useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const overall = computeFftAnalytics(list);

        const byStructure = ["BOS", "CHoCH"].map((k) => ({
            label: k,
            stats: computeFftAnalytics(list.filter((t) => structBucket(t) === k)),
        }));
        const byDirection = ["Long", "Short"].map((k) => ({
            label: k,
            stats: computeFftAnalytics(list.filter((t) => dirBucket(t) === k)),
        }));
        const bySession = SESSION_ORDER.map((k) => ({
            label: k,
            stats: computeFftAnalytics(list.filter((t) => sessionBucket(t) === k)),
        }));

        return { overall, byStructure, byDirection, bySession };
    }, [trades]);

    const { overall } = model;

    if (overall.fftCancels === 0) {
        return (
            <NeonPanel title={<span className="text-[hsl(var(--text))]">FFT Classification</span>}>
                <p className="text-[10px] font-ui text-[hsl(var(--text-2))] italic">
                    No FFT cancels in this scenario.
                </p>
            </NeonPanel>
        );
    }

    const ghostMissing = !overall.hasGhostData;

    return (
        <NeonPanel title={<span className="text-[hsl(var(--text))]">FFT Classification</span>}>
            <p className="text-[10px] font-ui text-[hsl(var(--text))] leading-snug mb-2">
                When does First Failed Tag Cancel help or hurt? Ghost Net R is the hypothetical R of the
                cancelled setups had FFT not cancelled them (simulated, unverified). FFT Impact = −Ghost Net R:{" "}
                <span className="text-[hsl(var(--success))]">positive = FFT helped</span>,{" "}
                <span className="text-[hsl(var(--danger))]">negative = FFT hurt</span>.
            </p>

            {ghostMissing && (
                <div className="mb-2 px-2 py-1.5 border border-dashed border-[hsl(var(--warning)/0.30)] bg-[hsl(var(--warning)/0.05)] text-[8.5px] font-ui text-[hsl(var(--warning)/0.75)] italic leading-snug">
                    Ghost outcomes unavailable in this run — showing cancel counts and move-away only.
                    Ghost W/L, Ghost Net R and FFT Impact require ghost tracking.
                </div>
            )}

            <div className="overflow-x-auto">
                <div className="min-w-[440px]">
                    <HeaderRow />

                    <SectionHead>Overall</SectionHead>
                    <StatRow label="All FFT cancels" stats={overall} strong />

                    <SectionHead>By structure</SectionHead>
                    {model.byStructure.map((r) => <StatRow key={r.label} label={r.label} stats={r.stats} />)}

                    <SectionHead>By direction</SectionHead>
                    {model.byDirection.map((r) => <StatRow key={r.label} label={r.label} stats={r.stats} />)}

                    <SectionHead>By session</SectionHead>
                    {model.bySession.map((r) => <StatRow key={r.label} label={r.label} stats={r.stats} />)}
                </div>
            </div>
        </NeonPanel>
    );
}

export default FftClassificationPanel;
