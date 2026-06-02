// ── FailuresHeatmap.jsx ──────────────────────────────────────────────────────
// Phase 3: Weekday × Hour failure rate heatmap.
// CSS grid cells coloured by loss-rate intensity (cold=low, hot=high).
// Only hours with ≥1 trade are rendered; empty hours are greyed out.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { computeHourlyFailureMatrix } from "../shared/failuresAnalytics";
import { cn } from "@/lib/utils";

// ── Trading hours that are meaningful (UTC) ───────────────────────────────────
// Show 00–23 but compress empty columns. Default: show all hours with any trade.
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ── Colour ramp (loss-rate 0-100%) ───────────────────────────────────────────
// Below 20%: subtle cool green; 20-40: neutral; 40-60: amber; >60: danger red.
function cellBg(lossRate, hasData) {
    if (!hasData) return "hsl(var(--panel-2) / 0.4)";
    if (lossRate === 0)  return "hsl(var(--accent-primary) / 0.12)";
    if (lossRate < 20)   return "hsl(var(--accent-primary) / 0.2)";
    if (lossRate < 35)   return "hsl(var(--warning) / 0.15)";
    if (lossRate < 50)   return "hsl(var(--warning) / 0.35)";
    if (lossRate < 65)   return "hsl(var(--danger) / 0.4)";
    return                      "hsl(var(--danger) / 0.7)";
}

function cellTextColor(lossRate, hasData) {
    if (!hasData || lossRate === 0) return "hsl(var(--text-2) / 0.4)";
    if (lossRate < 35)  return "hsl(var(--text-2))";
    if (lossRate < 50)  return "hsl(var(--warning))";
    return                     "hsl(var(--danger))";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FailuresHeatmap({ allTrades = [] }) {
    const [tooltip, setTooltip]   = useState(null);
    const [hoverCell, setHover]   = useState(null);

    const matrix = useMemo(() => computeHourlyFailureMatrix(allTrades), [allTrades]);

    // Only show hours that have at least 1 trade anywhere in the matrix
    const activeHours = useMemo(() => {
        const hours = new Set();
        for (const [key, cell] of Object.entries(matrix)) {
            if (cell.totalCount > 0) hours.add(cell.hour);
        }
        return Array.from(hours).sort((a, b) => a - b);
    }, [matrix]);

    if (!allTrades.length || activeHours.length === 0) return null;

    const CELL_W = `${Math.max(28, Math.min(44, Math.floor(480 / activeHours.length)))}px`;

    return (
        <NeonPanel title="Weekday × Hour Failure Rate" tone="secondary">
            <div className="p-4 overflow-x-auto">
                {/* Header row — hours */}
                <div className="flex items-center">
                    {/* Day label placeholder */}
                    <div style={{ width: 36, flexShrink: 0 }} />
                    <div className="flex gap-px">
                        {activeHours.map(h => (
                            <div
                                key={h}
                                style={{ width: CELL_W, flexShrink: 0 }}
                                className="text-center text-[8.5px] font-ui text-muted-lab pb-1.5"
                            >
                                {String(h).padStart(2, "0")}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Grid rows — weekdays */}
                <div className="space-y-px">
                    {DAY_LABELS.map((dayLabel, dayIdx) => (
                        <div key={dayIdx} className="flex items-center gap-px">
                            {/* Day label */}
                            <div
                                style={{ width: 36, flexShrink: 0 }}
                                className="text-[9px] font-ui text-muted-lab pr-1.5 text-right"
                            >
                                {dayLabel}
                            </div>

                            {/* Hour cells */}
                            {activeHours.map(h => {
                                const key  = `${dayIdx}_${h}`;
                                const cell = matrix[key];
                                const hasData = cell?.totalCount > 0;
                                const lossRate = cell?.lossRate ?? 0;
                                const isHovered = hoverCell === key;

                                return (
                                    <div
                                        key={h}
                                        style={{
                                            width: CELL_W,
                                            flexShrink: 0,
                                            height: 26,
                                            background: cellBg(lossRate, hasData),
                                            outline: isHovered ? "1px solid hsl(var(--accent-primary) / 0.7)" : "none",
                                        }}
                                        className={cn(
                                            "relative flex items-center justify-center transition-all cursor-default clip-bevel-sm",
                                            hasData ? "hover:brightness-110" : "opacity-30",
                                        )}
                                        onMouseEnter={() => {
                                            setHover(key);
                                            if (hasData) setTooltip({ key, cell, dayLabel, h });
                                        }}
                                        onMouseLeave={() => { setHover(null); setTooltip(null); }}
                                    >
                                        {hasData && (
                                            <span
                                                style={{ color: cellTextColor(lossRate, hasData) }}
                                                className="text-[8.5px] font-num tabular-nums leading-none select-none"
                                            >
                                                {lossRate}%
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {/* Colour scale legend */}
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[hsl(var(--border-soft))]">
                    <span className="text-[9px] font-ui text-muted-lab">Loss rate:</span>
                    {[
                        { label: "0%",   bg: cellBg(0, true)  },
                        { label: "<20%", bg: cellBg(15, true)  },
                        { label: "<35%", bg: cellBg(30, true)  },
                        { label: "<50%", bg: cellBg(45, true)  },
                        { label: "<65%", bg: cellBg(58, true)  },
                        { label: "≥65%", bg: cellBg(80, true)  },
                    ].map(({ label, bg }) => (
                        <div key={label} className="flex items-center gap-1">
                            <div className="w-3 h-3 clip-bevel-sm" style={{ background: bg }} />
                            <span className="text-[8.5px] font-ui text-muted-lab">{label}</span>
                        </div>
                    ))}
                    <span className="text-[9px] font-ui text-muted-lab ml-auto">UTC hours</span>
                </div>

                {/* Hover tooltip */}
                {tooltip && (
                    <div className="mt-2 px-3 py-2 border border-[hsl(var(--accent-primary)/0.3)] clip-bevel-sm bg-[hsl(var(--panel-2))] text-[10.5px] font-ui">
                        <span className="text-white font-semibold">{tooltip.dayLabel} {String(tooltip.h).padStart(2,"0")}:00 UTC</span>
                        <span className="text-muted-lab ml-3">{tooltip.cell.lossCount} losses / {tooltip.cell.totalCount} trades</span>
                        <span className="ml-3" style={{ color: cellTextColor(tooltip.cell.lossRate, true) }}>
                            {tooltip.cell.lossRate}% loss rate
                        </span>
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}
