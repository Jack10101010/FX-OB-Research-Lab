import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

const DIMENSIONS = [
    { key: "netR",        label: "Net R",    higherBetter: true,  fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(1)}R` },
    { key: "expectancy",  label: "Exp",      higherBetter: true,  fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(3)}` },
    { key: "winRate",     label: "WR",       higherBetter: true,  fmt: fmtMaybePct },
    { key: "profitFactor",label: "PF",       higherBetter: true,  fmt: v => num(v).toFixed(1) },
    { key: "maxDD",       label: "Max DD",   higherBetter: true,  fmt: fmtMaybeR },  // higher (less negative) = better
    { key: "fillPct",     label: "Fill %",   higherBetter: true,  fmt: fmtMaybePct },
    { key: "deltaVsBaseline", label: "Δ Base", higherBetter: true, fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(1)}R` },
    { key: "avgMAE",      label: "MAE",      higherBetter: false, fmt: fmtMaybeR },  // lower MAE = better
    { key: "avgMFE",      label: "MFE",      higherBetter: true,  fmt: fmtMaybeR },
];

function scoreCell(val, allVals, higherBetter) {
    if (!isFiniteNumber(val)) return null;
    const finite = allVals.filter(isFiniteNumber).map(Number);
    if (!finite.length) return null;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    if (max === min) return 0.5;
    const norm = (num(val) - min) / (max - min);
    return higherBetter ? norm : 1 - norm;
}

export function DominanceMatrix({ exactRows }) {
    const rows = exactRows.filter(r => r.exact);
    if (rows.length < 2) return null;

    return (
        <NeonPanel title="Dominance Matrix" className="xl:col-span-2"
            action={<Pill tone="secondary">Heatmap Scoring</Pill>}
        >
            <p className="mb-3 text-[10px] font-mono text-muted-lab">Green = best on dimension. Each cell scored relative to peer models.</p>
            <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full font-mono text-[10.5px] border-separate border-spacing-0.5">
                    <thead>
                        <tr>
                            <th className="text-left text-[9.5px] uppercase tracking-wider text-muted-lab px-2 py-1.5 whitespace-nowrap">Model</th>
                            {DIMENSIONS.map(d => (
                                <th key={d.key} className="text-center text-[9px] uppercase tracking-wider text-muted-lab px-1.5 py-1.5 whitespace-nowrap">{d.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.mode}>
                                <td className={cn("px-2 py-1 whitespace-nowrap", row.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white")}>
                                    {row.label}
                                </td>
                                {DIMENSIONS.map(dim => {
                                    const val     = row[dim.key];
                                    const allVals = rows.map(r => r[dim.key]);
                                    const score   = scoreCell(val, allVals, dim.higherBetter);
                                    if (score === null) {
                                        return <td key={dim.key} className="text-center text-muted-lab px-1.5 py-1">—</td>;
                                    }
                                    const alpha = (0.08 + 0.5 * score).toFixed(3);
                                    const bg    = score >= 0.5 ? `hsl(var(--success) / ${alpha})` : `hsl(var(--danger) / ${(0.08 + 0.5 * (1 - score)).toFixed(3)})`;
                                    return (
                                        <td key={dim.key} className="text-center px-1.5 py-1 tabular-nums" style={{ background: bg }}>
                                            {dim.fmt(val)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
