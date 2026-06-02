// ── SameNextCandlePanel.jsx ──────────────────────────────────────────────────
// Same-candle vs next-candle fill comparison for triggered-edge models.
//
// The triggered-edge lifecycle can fill either on the same candle as the trigger
// (immediate fill) or on the next candle (delayed fill). This panel surfaces
// the split and, when a sibling model exists in exactRows, compares performance.
//
// Sibling model lookup:
//   Mode keys ending in "_same" have a "_next" sibling and vice-versa.
//   findSiblingMode() swaps the suffix to locate the companion row.
//
// Example: "entry_triggered_edge_same" ↔ "entry_triggered_edge_next"
//
// Data source:
//   row.sameCandleCount   — fills on same candle (from funnel.sameCandle)
//   row.nextCandleCount   — fills on next candle (from funnel.nextCandle)
//   row.avgTriggerToEntry — avg minutes trigger → fill
//   Sibling row stats:    row.netR, row.expectancy, row.winRate, row.trades
//
// Fallback: if no same/next counts are present, renders a "no candle data"
//           placeholder so the panel is still mounted but informative.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num, fmtMaybePct } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

// ── Sibling mode resolution ───────────────────────────────────────────────────

function findSiblingMode(modeKey, exactRows) {
    if (!modeKey) return null;
    let siblingKey = null;
    if (modeKey.endsWith("_same")) {
        siblingKey = modeKey.slice(0, -5) + "_next";
    } else if (modeKey.endsWith("_next")) {
        siblingKey = modeKey.slice(0, -5) + "_same";
    } else {
        return null; // no suffix → no sibling
    }
    return exactRows.find(r => r.mode === siblingKey) || null;
}

// ── CountBox ─────────────────────────────────────────────────────────────────
// Large count display for same / next fills

function CountBox({ label, count, total, isSelected = false }) {
    const pct = total > 0 && isFiniteNumber(count) ? ((num(count) / total) * 100).toFixed(1) : null;

    return (
        <div className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 px-2 border rounded-[1px]",
            isSelected
                ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.07)]"
                : "border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.3)]",
        )}>
            <span className="text-[9.5px] font-ui uppercase tracking-[0.15em] text-muted-lab">
                {label}
            </span>
            <span className={cn(
                "text-[22px] font-num font-semibold tabular-nums",
                isSelected ? "text-white" : "text-[hsl(var(--text-2))]",
            )}>
                {isFiniteNumber(count) ? num(count) : "—"}
            </span>
            {pct && (
                <span className="text-[10px] font-num text-muted-lab">{pct}%</span>
            )}
            {isSelected && (
                <span className="text-[8.5px] font-ui text-[hsl(var(--accent-primary))] uppercase tracking-wider">
                    selected
                </span>
            )}
        </div>
    );
}

// ── StatRow ───────────────────────────────────────────────────────────────────
// Side-by-side stat comparison row

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
    const same  = row?.sameCandleCount;
    const next  = row?.nextCandleCount;
    const total = (isFiniteNumber(same) ? num(same) : 0) + (isFiniteNumber(next) ? num(next) : 0);

    const hasData = isFiniteNumber(same) || isFiniteNumber(next);

    // Sibling row for side-by-side comparison
    const sibling = useMemo(
        () => findSiblingMode(row?.mode, exactRows || []),
        [row, exactRows],
    );

    // Determine which is same and which is next for the comparison
    const modeKey = row?.mode || "";
    const rowIsSame = modeKey.endsWith("_same");
    const rowIsNext = modeKey.endsWith("_next");

    const sameRow = rowIsSame ? row : (rowIsNext ? sibling : null);
    const nextRow = rowIsNext ? row : (rowIsSame ? sibling : null);

    if (!hasData) {
        return (
            <NeonPanel
                title="Same / Next Candle"
                action={<Pill tone="warning">NO CANDLE DATA</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    No same/next candle fill data available.
                    <br />
                    <span className="opacity-70">
                        Requires triggered-edge exports with candle-timing fields.
                    </span>
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            title="Same / Next Candle"
            action={<Pill tone={sibling ? "success" : "secondary"}>{sibling ? "SIBLING FOUND" : "NO SIBLING"}</Pill>}
        >
            {/* Model label */}
            <div className="mb-3 text-[10.5px] font-ui text-[hsl(var(--text-2))] truncate">
                {row.label || row.mode}
            </div>

            {/* ── Count boxes ───────────────────────────────────────────────── */}
            <div className="flex gap-2 mb-4">
                <CountBox
                    label="Same Candle"
                    count={same}
                    total={total}
                    isSelected={rowIsSame}
                />
                <CountBox
                    label="Next Candle"
                    count={next}
                    total={total}
                    isSelected={rowIsNext}
                />
            </div>

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

            {/* ── Side-by-side comparison (if sibling found) ────────────────── */}
            {sibling && (sameRow || nextRow) && (
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

            {/* No sibling note */}
            {!sibling && (rowIsSame || rowIsNext) && (
                <p className="text-[9.5px] font-ui text-muted-lab mt-1">
                    No sibling {rowIsSame ? "_next" : "_same"} model found in current results.
                    Import the paired variant to enable side-by-side comparison.
                </p>
            )}
        </NeonPanel>
    );
}
