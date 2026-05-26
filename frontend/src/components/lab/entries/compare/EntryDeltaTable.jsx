import React, { useEffect, useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import { isFiniteNumber, num, fmtMaybePct, fmtMaybeR } from "../analytics/entryFormatters";
import { buildEntryResultRows }   from "../analytics/entryAnalytics";
import { getRunDisplayName }      from "@/data/store";
import { SLOT_COLORS, SLOT_LABELS } from "./RunSelectorBar";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

const DIMS = [
    { key: "netR",         label: "Net R",   fmt: v => { const n = num(v); return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`; }, higherBetter: true },
    { key: "expectancy",   label: "Exp",     fmt: v => { const n = num(v); return `${n >= 0 ? "+" : ""}${n.toFixed(3)}`; }, higherBetter: true },
    { key: "winRate",      label: "WR",      fmt: fmtMaybePct,  higherBetter: true },
    { key: "profitFactor", label: "PF",      fmt: v => num(v).toFixed(2), higherBetter: true },
    { key: "fillPct",      label: "Fill %",  fmt: fmtMaybePct,  higherBetter: true },
    { key: "trades",       label: "Trades",  fmt: v => String(Math.round(num(v))), higherBetter: true },
    { key: "maxDD",        label: "Max DD",  fmt: fmtMaybeR,    higherBetter: false },
];

function deltaStyle(delta, higherBetter) {
    if (!isFiniteNumber(delta) || Math.abs(num(delta)) < 0.001) return "text-muted-lab";
    const pos = higherBetter ? num(delta) > 0 : num(delta) < 0;
    return pos ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
}

function fmtDelta(delta, dim) {
    if (!isFiniteNumber(delta)) return "—";
    const n = num(delta);
    const sign = n >= 0 ? "+" : "";
    if (dim.key === "winRate" || dim.key === "fillPct") return `${sign}${n.toFixed(1)}pp`;
    if (dim.key === "trades")  return `${sign}${Math.round(n)}`;
    return `${sign}${n.toFixed(2)}`;
}

export function EntryDeltaTable({ selectedRuns }) {
    const [baseIdx, setBaseIdx] = useLocalStorageState("fxob_entries_workspace_compare_base_idx_v1", 0);
    const [sortDim, setSortDim] = useLocalStorageState("fxob_entries_workspace_compare_sort_v1", "netR");

    useEffect(() => {
        if (selectedRuns.length && baseIdx >= selectedRuns.length) setBaseIdx(0);
    }, [baseIdx, selectedRuns.length, setBaseIdx]);

    const runRows = useMemo(() => {
        return selectedRuns.map(run => {
            // Pass run + empty trades (cross-run compare uses summary data only)
            const rows = buildEntryResultRows(run, [], null);
            return { run, rowMap: Object.fromEntries(rows.map(r => [r.mode, r])) };
        });
    }, [selectedRuns]);

    // Collect all modes that appear in any selected run
    const allModes = useMemo(() => {
        const modes = new Set();
        runRows.forEach(({ rowMap }) => Object.keys(rowMap).forEach(m => modes.add(m)));
        return [...modes];
    }, [runRows]);

    const baseRun = runRows[baseIdx];

    if (selectedRuns.length < 2) {
        return (
            <NeonPanel title="Cross-Run Delta Table" className="xl:col-span-3"
                action={<Pill tone="warning">SELECT ≥2 RUNS</Pill>}
            >
                <div className="py-6 text-center text-[11px] font-mono text-muted-lab">
                    Select at least two runs above to compare entry model metrics.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel title="Cross-Run Delta Table" className="xl:col-span-3"
            action={<Pill tone="secondary">{allModes.length} MODELS</Pill>}
        >
            {/* Base run selector */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">Deltas vs:</span>
                {selectedRuns.map((run, i) => (
                    <button key={run.id} type="button"
                        onClick={() => setBaseIdx(i)}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border rounded-[1px] transition-colors",
                            baseIdx === i
                                ? "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.5)] text-white"
                                : "border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white"
                        )}
                    >
                        <span className="w-2 h-2 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                        {SLOT_LABELS[i]}: {getRunDisplayName(run)}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full font-mono text-[10px] border-separate border-spacing-0.5 min-w-[640px]">
                    <thead>
                        <tr>
                            <th className="text-left text-[9.5px] uppercase tracking-wider text-muted-lab px-2 py-1.5 whitespace-nowrap">Model</th>
                            {selectedRuns.map((run, i) => (
                                <th key={run.id} colSpan={i === baseIdx ? DIMS.length : DIMS.length + 1}
                                    className="text-center text-[9px] uppercase tracking-wider px-1 py-1.5 whitespace-nowrap"
                                    style={{ color: SLOT_COLORS[i] }}
                                >
                                    {SLOT_LABELS[i]} — {getRunDisplayName(run)}
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th />
                            {selectedRuns.map((run, i) => (
                                <React.Fragment key={run.id}>
                                    {DIMS.map(d => (
                                        <th key={d.key}
                                            className="text-center text-[8.5px] uppercase tracking-wider text-muted-lab px-1.5 py-1 whitespace-nowrap cursor-pointer hover:text-white"
                                            onClick={() => setSortDim(d.key)}
                                        >
                                            {d.label}{sortDim === d.key ? " ▾" : ""}
                                        </th>
                                    ))}
                                    {i !== baseIdx && (
                                        <th className="text-center text-[8.5px] uppercase tracking-wider text-muted-lab px-1.5 py-1 whitespace-nowrap">
                                            Δ {DIMS.find(d => d.key === sortDim)?.label}
                                        </th>
                                    )}
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {allModes.map(mode => {
                            const baseRow = baseRun?.rowMap[mode];
                            return (
                                <tr key={mode} className="hover:bg-[hsl(var(--panel-2)/0.3)]">
                                    <td className="px-2 py-1 whitespace-nowrap text-[hsl(var(--text-2))]">{mode}</td>
                                    {runRows.map(({ run, rowMap }, i) => {
                                        const row = rowMap[mode];
                                        const isBase = i === baseIdx;
                                        return (
                                            <React.Fragment key={run.id}>
                                                {DIMS.map(dim => (
                                                    <td key={dim.key} className="text-center px-1.5 py-1 tabular-nums text-[hsl(var(--text-2))]">
                                                        {row && isFiniteNumber(row[dim.key]) ? dim.fmt(row[dim.key]) : "—"}
                                                    </td>
                                                ))}
                                                {!isBase && (() => {
                                                    const dim   = DIMS.find(d => d.key === sortDim);
                                                    const bVal  = baseRow && isFiniteNumber(baseRow[sortDim]) ? num(baseRow[sortDim]) : null;
                                                    const cVal  = row    && isFiniteNumber(row[sortDim])     ? num(row[sortDim])     : null;
                                                    const delta = bVal != null && cVal != null ? cVal - bVal : null;
                                                    return (
                                                        <td className={cn("text-center px-1.5 py-1 tabular-nums font-semibold", deltaStyle(delta, dim?.higherBetter))}>
                                                            {delta != null ? fmtDelta(delta, dim) : "—"}
                                                        </td>
                                                    );
                                                })()}
                                            </React.Fragment>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
