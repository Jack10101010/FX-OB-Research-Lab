import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { WEEKDAYS, HOURS, pad2 } from "../analytics/entryFormatters";

function HeatmapGrid({ grid, danger }) {
    return (
        <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px] text-[10px] border-separate border-spacing-1">
                <thead>
                    <tr>
                        <th className="font-ui text-muted-lab text-left px-2 py-1 text-[9.5px] uppercase tracking-wider">Day / Hr UTC</th>
                        {HOURS.map(h => <th key={h} className="font-num text-muted-lab px-1 py-1 text-[8.5px] tabular-nums">{pad2(h)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {WEEKDAYS.map((day, di) => (
                        <tr key={day}>
                            <td className="font-ui text-muted-lab px-2 py-1">{day}</td>
                            {HOURS.map(hour => {
                                const cell = grid.cells[`${di}-${hour}`];
                                if (!cell) {
                                    return <td key={hour}><div className="clip-bevel-sm px-1 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div></td>;
                                }
                                const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / grid.maxAbs)).toFixed(3);
                                const bg    = cell.netR >= 0
                                    ? `hsl(var(--accent-primary) / ${alpha})`
                                    : `hsl(var(--bear,var(--danger)) / ${alpha})`;
                                return (
                                    <td key={hour}>
                                        <div
                                            className="clip-bevel-sm px-1 py-1 text-center text-white tabular-nums leading-tight cursor-default"
                                            style={{ background: bg }}
                                            title={`${day} ${pad2(hour)}:00 UTC — ${cell.count} trades · ${cell.netR >= 0 ? "+" : ""}${cell.netR.toFixed(1)}R`}
                                        >
                                            <div className="font-num">{cell.count}</div>
                                            <div className="font-num text-[7.5px] opacity-70">{cell.netR >= 0 ? "+" : ""}{cell.netR.toFixed(1)}</div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function TimingHeatmapPanel({ grid }) {
    return (
        <NeonPanel className="xl:col-span-3" title="Entry Timing Heatmap"
            action={<Pill tone="secondary">{grid.total} TRADES</Pill>}
        >
            <p className="mb-2 text-[10px] font-ui text-muted-lab">All trades. Green = positive net R in that slot, Red = negative. Count + net R per cell. Hover for detail.</p>
            <HeatmapGrid grid={grid} danger={false} />
        </NeonPanel>
    );
}

export function ToxicityHeatmapPanel({ grid }) {
    return (
        <NeonPanel className="xl:col-span-3" title="Entry Toxicity Map (Losing Trades Only)"
            action={<Pill tone="danger">{grid.total} LOSING TRADES</Pill>}
        >
            <p className="mb-2 text-[10px] font-ui text-muted-lab">Losing trades only. High-density red cells indicate toxic time windows. Fixed from original: was incorrectly showing all trades.</p>
            <HeatmapGrid grid={grid} danger={true} />
        </NeonPanel>
    );
}
