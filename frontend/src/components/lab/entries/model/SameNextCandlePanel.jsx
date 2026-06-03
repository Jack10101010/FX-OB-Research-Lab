// ── SameNextCandlePanel.jsx ──────────────────────────────────────────────────
// Fill timing breakdown for triggered-edge models.
//
// Shows how fills are distributed across candle delays:
//   Delay 0 = Same candle, 1 = Next candle, 2/3/4+ = Delayed fills.
//
// Data source (in priority order):
//   row.triggeredEdgeFunnel.fillsByDelay  — per-delay counts (new exports)
//   row.sameCandleCount / nextCandleCount — fallback for older exports
//
// Sibling comparison (same/next only):
//   Mode keys ending in "_same" or "_next" show a side-by-side perf comparison.
//   d2/d3 rows suppress sibling comparison to avoid brittle lookups.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num, fmtMaybePct } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const DELAY_ORDER = ["0", "1", "2", "3", "4+"];

const DELAY_LABELS = {
    "0":  "Same candle",
    "1":  "Next candle",
    "2":  "Delay +2",
    "3":  "Delay +3",
    "4+": "Delay 4+",
};

function delayLabel(key) {
    if (DELAY_LABELS[key]) return DELAY_LABELS[key];
    const n = Number(key);
    return !isNaN(n) ? `Delay +${n}` : String(key);
}

// ── Sibling mode resolution (same/next only) ──────────────────────────────────

function findSiblingMode(modeKey, exactRows) {
    if (!modeKey) return null;
    let siblingKey = null;
    if (modeKey.endsWith("_same")) {
        siblingKey = modeKey.slice(0, -5) + "_next";
    } else if (modeKey.endsWith("_next")) {
        siblingKey = modeKey.slice(0, -5) + "_same";
    } else {
        return null; // d2/d3 or other — no sibling comparison
    }
    return exactRows.find(r => r.mode === siblingKey) || null;
}

// ── DelayCountBox ─────────────────────────────────────────────────────────────
// Count box for a single delay bucket.

function DelayCountBox({ label, count, total, isSelected = false }) {
    const pct = total > 0 && isFiniteNumber(count) ? ((num(count) / total) * 100).toFixed(1) : null;
    return (
        <div className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 px-2 border rounded-[1px] min-w-0",
            isSelected
                ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.07)]"
                : "border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.3)]",
        )}>
            <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab text-center leading-tight">
                {label}
            </span>
            <span className={cn(
                "text-[20px] font-num font-semibold tabular-nums",
                isSelected ? "text-white" : "text-[hsl(var(--text-2))]",
            )}>
                {isFiniteNumber(count) ? num(count) : "—"}
            </span>
            {pct && (
                <span className="text-[9.5px] font-num text-muted-lab">{pct}%</span>
            )}
            {isSelected && (
                <span className="text-[8px] font-ui text-[hsl(var(--accent-primary))] uppercase tracking-wider">
                    selected
                </span>
            )}
        </div>
    );
}

// ── StatRow ───────────────────────────────────────────────────────────────────
// Side-by-side stat comparison row (same/next sibling comparison).

function StatRow({ label, valA, valB, higherBetter = true }) {
    const aNum = isFiniteNumber(valA) ? num(valA) : null;
    const bNum = isFiniteNumber(valB) ? num(valB) : null;
    const aWins = aNum != null && bNum != null
        ? (higherBetter ? aNum > bNum : aNum < bNum)
        : false;
    const bWins = aNum != null && bNum != null
        ? (higherBetter ? bNum > aNum : bNum < aNum)
        : false;

    return (
        <div className="grid grid-cols-[1fr_120px_1fr] items-center py-1 border-b border-[hsl(var(--border-soft)/0.2)] last:border-0">
            <span className={cn(
                "text-[10.5px] font-num tabular-nums text-right pr-3",
                aWins ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-2))]",
            )}>
                {valA ?? "—"}
            </span>
            <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab text-center">
                {label}
            </span>
            <span className={cn(
                "text-[10.5px] font-num tabular-nums text-left pl-3",
                bWins ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-2))]",
            )}>
                {valB ?? "—"}
            </span>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNetR(v) {
    if (!isFiniteNumber(v)) return "—";
    const n = num(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

function fmtMinutes(v) {
    if (!isFiniteNumber(v)) return "—";
    const m = num(v);
    return m < 60 ? `${Math.round(m)}m` : `${(m / 60).toFixed(1)}h`;
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export function SameNextCandlePanel({ row, exactRows }) {
    const modeKey    = row?.mode || "";
    const rowIsSame  = modeKey.endsWith("_same");
    const rowIsNext  = modeKey.endsWith("_next");
    const isSameNext = rowIsSame || rowIsNext;

    // ── Delay boxes from fillsByDelay (new exports) ──────────────────────────
    const delayEntries = useMemo(() => {
        const fbd = row?.triggeredEdgeFunnel?.fillsByDelay;
        if (!fbd || Object.keys(fbd).length === 0) return null;
        // Sort by DELAY_ORDER, then any extras
        const known = DELAY_ORDER.filter(k => fbd[k] > 0);
        const extra = Object.keys(fbd).filter(k => !DELAY_ORDER.includes(k) && fbd[k] > 0);
        return [...known, ...extra].map(k => ({ key: k, label: delayLabel(k), count: fbd[k] }));
    }, [row]);

    // ── Fallback: same/next counts from older exports ────────────────────────
    const same  = row?.sameCandleCount;
    const next  = row?.nextCandleCount;

    // Total fills for percentage calculation
    const total = useMemo(() => {
        if (delayEntries) return delayEntries.reduce((s, e) => s + (e.count || 0), 0);
        return (isFiniteNumber(same) ? num(same) : 0) + (isFiniteNumber(next) ? num(next) : 0);
    }, [delayEntries, same, next]);

    const hasData = delayEntries
        ? delayEntries.length > 0
        : (isFiniteNumber(same) || isFiniteNumber(next));

    // ── Sibling (same/next only) ──────────────────────────────────────────────
    const sibling = useMemo(
        () => isSameNext ? findSiblingMode(modeKey, exactRows || []) : null,
        [modeKey, isSameNext, exactRows],
    );

    const sameRow = rowIsSame ? row : (rowIsNext ? sibling : null);
    const nextRow = rowIsNext ? row : (rowIsSame ? sibling : null);

    if (!hasData) {
        return (
            <NeonPanel
                title="Fill Timing"
                action={<Pill tone="warning">NO CANDLE DATA</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    No fill timing data available.
                    <br />
                    <span className="opacity-70">
                        Requires triggered-edge exports with candle-timing fields.
                    </span>
                </div>
            </NeonPanel>
        );
    }

    const actionPill = isSameNext && sibling
        ? <Pill tone="success">SIBLING FOUND</Pill>
        : isSameNext
        ? <Pill tone="secondary">NO SIBLING</Pill>
        : <Pill tone="secondary">DELAY SPLIT</Pill>;

    return (
        <NeonPanel title="Fill Timing" action={actionPill}>

            {/* Model label */}
            <div className="mb-3 text-[10.5px] font-ui text-[hsl(var(--text-2))] truncate">
                {row.label || row.mode}
            </div>

            {/* ── Delay count boxes ─────────────────────────────────────────── */}
            {delayEntries ? (
                // New exports: dynamic per-delay boxes
                <div className="flex gap-1.5 mb-4 flex-wrap">
                    {delayEntries.map(({ key, label, count }) => (
                        <DelayCountBox
                            key={key}
                            label={label}
                            count={count}
                            total={total}
                        />
                    ))}
                </div>
            ) : (
                // Fallback: old same/next pair
                <div className="flex gap-2 mb-4">
                    <DelayCountBox
                        label="Same candle"
                        count={same}
                        total={total}
                        isSelected={rowIsSame}
                    />
                    <DelayCountBox
                        label="Next candle"
                        count={next}
                        total={total}
                        isSelected={rowIsNext}
                    />
                </div>
            )}

            {/* Avg trigger→fill */}
            {isFiniteNumber(row.avgTriggerToEntry) && (
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-[9.5px] font-ui uppercase tracking-[0.15em] text-muted-lab">
                        Avg T→Fill
                    </span>
                    <span className="text-[11px] font-num font-semibold text-white">
                        {fmtMinutes(row.avgTriggerToEntry)}
                    </span>
                </div>
            )}

            {/* ── Side-by-side comparison (same/next only) ─────────────────── */}
            {isSameNext && sibling && (sameRow || nextRow) && (
                <>
                    <div className="border-t border-[hsl(var(--border-soft)/0.3)] mb-3" />
                    <div className="grid grid-cols-[1fr_120px_1fr] mb-1">
                        <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--accent-primary))] text-right pr-3">
                            {sameRow?.label || "Same"}
                        </span>
                        <span />
                        <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab text-left pl-3">
                            {nextRow?.label || "Next"}
                        </span>
                    </div>
                    <StatRow
                        label="Net R"
                        valA={fmtNetR(sameRow?.netR)}
                        valB={fmtNetR(nextRow?.netR)}
                    />
                    <StatRow
                        label="Expectancy"
                        valA={isFiniteNumber(sameRow?.expectancy) ? `${num(sameRow.expectancy) >= 0 ? "+" : ""}${num(sameRow.expectancy).toFixed(3)}R` : "—"}
                        valB={isFiniteNumber(nextRow?.expectancy) ? `${num(nextRow.expectancy) >= 0 ? "+" : ""}${num(nextRow.expectancy).toFixed(3)}R` : "—"}
                    />
                    <StatRow
                        label="Win Rate"
                        valA={fmtMaybePct(sameRow?.winRate)}
                        valB={fmtMaybePct(nextRow?.winRate)}
                    />
                    <StatRow
                        label="Fills"
                        valA={isFiniteNumber(sameRow?.trades) ? String(num(sameRow.trades)) : "—"}
                        valB={isFiniteNumber(nextRow?.trades) ? String(num(nextRow.trades)) : "—"}
                    />
                    {(isFiniteNumber(sameRow?.avgTriggerToEntry) || isFiniteNumber(nextRow?.avgTriggerToEntry)) && (
                        <StatRow
                            label="Avg T→Fill"
                            valA={fmtMinutes(sameRow?.avgTriggerToEntry)}
                            valB={fmtMinutes(nextRow?.avgTriggerToEntry)}
                            higherBetter={false}
                        />
                    )}
                </>
            )}

            {/* No sibling note (same/next only) */}
            {isSameNext && !sibling && (
                <p className="text-[9.5px] font-ui text-muted-lab mt-1">
                    No sibling {rowIsSame ? "_next" : "_same"} model found in current results.
                    Import the paired variant to enable side-by-side comparison.
                </p>
            )}
        </NeonPanel>
    );
}
