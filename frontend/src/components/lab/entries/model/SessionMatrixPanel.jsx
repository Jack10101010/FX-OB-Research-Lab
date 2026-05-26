import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { sessionRowsForModel } from "../analytics/entryAnalytics";
import { fmtMaybePct, fmtMaybeR, isFiniteNumber, num } from "../analytics/entryFormatters";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

const SESSION_COLS = ["Asia", "London", "London Lull", "New York", "Outside"];
const METRICS = [
    { key: "winRate",    label: "Win Rate",    fmt: fmtMaybePct },
    { key: "expectancy", label: "Expectancy",  fmt: fmtMaybeR },
    { key: "netR",       label: "Net R",       fmt: fmtMaybeR },
    { key: "fillPct",    label: "Fill %",      fmt: fmtMaybePct },
];

export function SessionMatrixPanel({ exactRows, tradesByMode, activeVariant, trades }) {
    const [metric, setMetric] = useLocalStorageState("fxob_entries_workspace_session_metric_v1", "expectancy");

    const matrix = useMemo(() => {
        return exactRows.filter(r => r.exact).map(row => {
            const modeKey    = String(row.mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
            const modeTrades = row.isBaseline
                ? trades
                : tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || null;
            const sessions = modeTrades
                ? sessionRowsForModel(trades, modeTrades)
                : null;
            return { ...row, sessions };
        });
    }, [exactRows, tradesByMode, activeVariant, trades]);

    const allVals = matrix.flatMap(row => row.sessions
        ? SESSION_COLS.map(s => row.sessions.find(sr => sr.label === s)?.[metric])
        : []
    ).filter(isFiniteNumber).map(Number);
    const maxAbs = allVals.length ? Math.max(...allVals.map(Math.abs)) || 1 : 1;
    const hasModelRows = matrix.some(row => !row.isBaseline);
    const hasModelTradeData = matrix.some(row => !row.isBaseline && row.sessions);

    return (
        <NeonPanel title="Session × Model Matrix" className="xl:col-span-3"
            action={
                <div className="flex items-center gap-2">
                    {METRICS.map(m => (
                        <button key={m.key} type="button"
                            onClick={() => setMetric(m.key)}
                            className={cn("px-2.5 py-0.5 text-[9.5px] font-mono uppercase tracking-wider clip-bevel-sm border transition-colors",
                                metric === m.key
                                    ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                    : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white")}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            }
        >
            {hasModelRows && !hasModelTradeData && (
                <div className="mb-3 text-[10.5px] font-mono text-[hsl(var(--warning))] leading-relaxed">
                    Requires per-model entry trade exports (<span className="text-white">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                </div>
            )}
            <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[640px] font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-left text-[9.5px] uppercase tracking-wider text-muted-lab px-2 py-1">Model</th>
                            {SESSION_COLS.map(s => (
                                <th key={s} className="text-center text-[9.5px] uppercase tracking-wider text-muted-lab px-1 py-1">{s}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map(row => (
                            <tr key={row.mode}>
                                <td className="px-2 py-1 text-[11px] font-mono truncate max-w-[180px]">
                                    <span className={row.isBaseline ? "text-[hsl(var(--accent-secondary))]" : "text-white"}>{row.label}</span>
                                </td>
                                {SESSION_COLS.map(s => {
                                    const sr = row.sessions?.find(x => x.label === s);
                                    const val = sr?.[metric];
                                    if (!sr || !isFiniteNumber(val)) {
                                        return <td key={s}><div className="px-2 py-1 text-center text-muted-lab clip-bevel-sm bg-[hsl(var(--panel-2)/0.3)]">—</div></td>;
                                    }
                                    const v     = num(val);
                                    const alpha = (0.12 + 0.45 * (Math.abs(v) / maxAbs)).toFixed(3);
                                    const bg    = v >= 0 ? `hsl(var(--success) / ${alpha})` : `hsl(var(--danger) / ${alpha})`;
                                    const fmt   = METRICS.find(m => m.key === metric)?.fmt || fmtMaybePct;
                                    return (
                                        <td key={s}>
                                            <div className="px-2 py-1 text-center text-white clip-bevel-sm tabular-nums" style={{ background: bg }}>
                                                {fmt(val)}
                                                {sr.count > 0 && <div className="text-[8px] opacity-60 mt-0.5">{sr.count}T</div>}
                                            </div>
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
