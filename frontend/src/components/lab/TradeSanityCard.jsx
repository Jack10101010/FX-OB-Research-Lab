// ── TradeSanityCard.jsx ───────────────────────────────────────────────────────
// Compact trade-count + direction×structure×outcome matrix panel.
// Sits between TradeUniverseBadge and the main content area on lab pages.
//
// Usage:
//   <TradeSanityCard trades={displayTrades} resultView={resultView} />
//   <TradeSanityCard trades={trades} compact />   // KPI strip only, no matrix
//
// Safety:
//   • Empty / null trades → renders nothing.
//   • Matrix rows with 0 total → omitted.
//   • All numbers → tabular-nums, finite-checked before display.

import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "./NeonPanel";
import {
    summarizeTradeSanity,
    buildDirStructMatrix,
} from "@/data/tradeClassification";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtR(n, digits = 2) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = Number(n);
    return v >= 0 ? `+${v.toFixed(digits)}R` : `${v.toFixed(digits)}R`;
}

function fmtPct(numerator, denominator) {
    if (!denominator) return "—";
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function fmtPF(pf) {
    if (pf == null || !Number.isFinite(pf)) return "—";
    if (!isFinite(pf)) return "∞";
    return pf.toFixed(2);
}

// ── Stat chip ────────────────────────────────────────────────────────────────
function Stat({ label, value, tone }) {
    const valueColor =
        tone === "pos" ? "text-[hsl(var(--success))]" :
        tone === "neg" ? "text-[hsl(var(--danger))]"  :
        "text-[hsl(var(--text-1))]";
    return (
        <span className="inline-flex items-center gap-1 shrink-0">
            {label && (
                <span className="text-[9px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">
                    {label}
                </span>
            )}
            <span className={cn("text-[10.5px] font-ui tabular-nums", valueColor)}>
                {value}
            </span>
        </span>
    );
}

function Dot() {
    return <span className="text-[hsl(var(--border-mid))] shrink-0">·</span>;
}

function VDivider() {
    return <span className="w-px h-3 bg-[hsl(var(--border-soft)/0.6)] shrink-0" />;
}

// ── Matrix cell ───────────────────────────────────────────────────────────────
function MatrixCell({ value, tone }) {
    const bg =
        tone === "win"  ? "bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]" :
        tone === "loss" ? "bg-[hsl(var(--danger)/0.10)]  text-[hsl(var(--danger))]"  :
        "text-[hsl(var(--text-3))]";
    return (
        <td className={cn("px-2 py-0.5 text-center tabular-nums text-[10px] font-ui", bg)}>
            {value > 0 ? value : "—"}
        </td>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TradeSanityCard
// ─────────────────────────────────────────────────────────────────────────────
export function TradeSanityCard({ trades, resultView, compact = false, className }) {
    const sanity = React.useMemo(
        () => summarizeTradeSanity(trades),
        [trades],
    );
    const matrix = React.useMemo(
        () => (compact ? null : buildDirStructMatrix(trades)),
        [trades, compact],
    );

    if (!Array.isArray(trades) || trades.length === 0) return null;

    const perf = sanity.performanceTrades ?? 0;
    const wins = (sanity.wins ?? 0) + (sanity.byCategory?.NEWS_FLATTEN_WIN ?? 0);

    const netTone = (sanity.netRPerformance ?? 0) >= 0 ? "pos" : "neg";

    return (
        <NeonPanel title="Trade Sanity" dense className={className}>
            {/* ── KPI strip ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Stat label="perf" value={perf} />
                <VDivider />
                <Stat label="L"  value={sanity.longCount  ?? 0} />
                <Dot />
                <Stat label="S"  value={sanity.shortCount ?? 0} />
                <VDivider />
                <Stat label="net" value={fmtR(sanity.netRPerformance)} tone={netTone} />
                <Stat label="WR"  value={fmtPct(wins, perf)} />
                <Stat label="PF"  value={fmtPF(sanity.profitFactor)} />
                <Stat label="exp" value={fmtR(sanity.expectancy, 3)} />
            </div>

            {/* ── Direction × Structure × Outcome matrix ─────────────────── */}
            {!compact && matrix && matrix.rows.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                    <table className="text-[10px] font-ui border-collapse">
                        <thead>
                            <tr>
                                <th className="pb-1 pr-3 text-left text-[9px] text-[hsl(var(--text-3))] font-semibold uppercase tracking-[0.06em]" />
                                {["WIN", "LOSS", "FLAT"].map((col) => (
                                    <th
                                        key={col}
                                        className="pb-1 px-2 text-center text-[9px] text-[hsl(var(--text-3))] font-semibold uppercase tracking-[0.06em]"
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(var(--border-soft)/0.3)]">
                            {matrix.rows.map((row) => (
                                <tr key={`${row.dir}:${row.struct}`}>
                                    <td className="pr-3 py-0.5 text-[hsl(var(--text-2))] whitespace-nowrap">
                                        {row.dir === "long" ? "L" : "S"}·{row.struct}
                                    </td>
                                    <MatrixCell value={row.win}  tone="win"  />
                                    <MatrixCell value={row.loss} tone="loss" />
                                    <MatrixCell value={row.flat} tone="flat" />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </NeonPanel>
    );
}
