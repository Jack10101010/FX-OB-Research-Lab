import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";
// Phase 3: crossFamilySafe marks whether a dimension's heatmap ranking is valid
// across models from different entry families.
//
// UNIVERSAL (safe across all families):
//   netR, expectancy, winRate, profitFactor, maxDD, deltaVsBaseline, avgMAE, avgMFE
//   These all operate on the same trade universe regardless of how trades were selected.
//
// NOT cross-family safe:
//   fillPct — denominator meaning differs: Baseline (all setups), Penetration (setups
//   reaching depth), Triggered Edge (end-to-end funnel efficiency). Comparing these
//   numbers directly implies a shared denominator that does not exist.
//
// When hasMultipleFamilies is true, non-safe cells are muted and receive no heatmap
// background. Scoring is still run within-family for reference but not rendered.

const DIMENSIONS = [
    { key: "netR",        label: "Net R",    higherBetter: true,  crossFamilySafe: true,  fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(1)}R` },
    { key: "expectancy",  label: "Exp",      higherBetter: true,  crossFamilySafe: true,  fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(3)}` },
    { key: "winRate",     label: "WR",       higherBetter: true,  crossFamilySafe: true,  fmt: fmtMaybePct },
    { key: "profitFactor",label: "PF",       higherBetter: true,  crossFamilySafe: true,  fmt: v => num(v).toFixed(1) },
    { key: "maxDD",       label: "Max DD",   higherBetter: true,  crossFamilySafe: true,  fmt: fmtMaybeR },  // higher (less negative) = better
    { key: "fillPct",     label: "Fill %",   higherBetter: true,  crossFamilySafe: false, fmt: fmtMaybePct }, // ← denominator differs per family
    { key: "deltaVsBaseline", label: "Δ Base", higherBetter: true, crossFamilySafe: true, fmt: v => `${v >= 0 ? "+" : ""}${num(v).toFixed(1)}R` },
    { key: "avgMAE",      label: "MAE",      higherBetter: false, crossFamilySafe: true,  fmt: fmtMaybeR },  // lower MAE = better
    { key: "avgMFE",      label: "MFE",      higherBetter: true,  crossFamilySafe: true,  fmt: fmtMaybeR },
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

    // Phase 3: detect whether multiple metricsProfiles are present.
    // When true, non-crossFamilySafe dimensions are muted — their denominators
    // are not equivalent across families so heatmap coloring would mislead.
    const loadedProfiles = [...new Set(rows.map(r => r.metricsProfile).filter(Boolean))];
    const hasMultipleFamilies = loadedProfiles.length > 1;

    return (
        <NeonPanel title="Dominance Matrix" className="xl:col-span-2"
            action={<Pill tone="secondary">Heatmap Scoring</Pill>}
        >
            <p className="mb-1 text-[10px] font-ui text-muted-lab">
                Green = best on dimension. Each cell scored relative to peer models.
            </p>
            {/* Phase 3: cross-family note — shown when multiple profiles are loaded */}
            {hasMultipleFamilies && (
                <p className="mb-3 text-[9.5px] font-ui text-muted-lab opacity-70">
                    Only universal metrics are heatmap-ranked across families.
                    Fill&nbsp;% is muted — denominators differ per family.
                </p>
            )}
            {!hasMultipleFamilies && <div className="mb-3" />}
            <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-[10.5px] border-separate border-spacing-0.5">
                    <thead>
                        <tr>
                            <th className="text-left text-[9.5px] font-ui uppercase tracking-wider text-muted-lab px-2 py-1.5 whitespace-nowrap">Model</th>
                            {DIMENSIONS.map(d => {
                                // Phase 3: dim header is muted when it is not cross-family safe
                                // and multiple families are loaded.
                                const isMuted = hasMultipleFamilies && !d.crossFamilySafe;
                                return (
                                    <th key={d.key}
                                        className={cn(
                                            "text-center text-[9px] font-ui uppercase tracking-wider px-1.5 py-1.5 whitespace-nowrap",
                                            isMuted ? "text-muted-lab opacity-35" : "text-muted-lab",
                                        )}
                                        title={isMuted ? `${d.label}: not cross-family comparable (fill denominator differs per family)` : undefined}
                                    >
                                        {d.label}
                                        {isMuted && <span className="ml-0.5 opacity-60">~</span>}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.mode}>
                                <td className={cn("px-2 py-1 font-ui whitespace-nowrap", row.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white")}>
                                    {row.label}
                                </td>
                                {DIMENSIONS.map(dim => {
                                    const val = row[dim.key];

                                    // Phase 3: when multiple families loaded and dim is not safe,
                                    // show the raw value in muted style with no heatmap background.
                                    // The value is still visible but clearly marked as non-comparable.
                                    if (hasMultipleFamilies && !dim.crossFamilySafe) {
                                        return (
                                            <td key={dim.key}
                                                className="text-center px-1.5 py-1 font-num tabular-nums text-muted-lab opacity-30"
                                                title={`${dim.label} not cross-family comparable`}
                                            >
                                                {isFiniteNumber(val) ? dim.fmt(val) : "—"}
                                            </td>
                                        );
                                    }

                                    const allVals = rows.map(r => r[dim.key]);
                                    const score   = scoreCell(val, allVals, dim.higherBetter);
                                    if (score === null) {
                                        return <td key={dim.key} className="text-center text-muted-lab font-ui px-1.5 py-1">—</td>;
                                    }
                                    const alpha = (0.08 + 0.5 * score).toFixed(3);
                                    const bg    = score >= 0.5
                                        ? `hsl(var(--success) / ${alpha})`
                                        : `hsl(var(--danger) / ${(0.08 + 0.5 * (1 - score)).toFixed(3)})`;
                                    return (
                                        <td key={dim.key} className="text-center px-1.5 py-1 font-num tabular-nums" style={{ background: bg }}>
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
