import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { rOf } from "../analytics/entryAnalytics";
import { sessionOf } from "../analytics/entryFormatters";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

function tradeKey(t) {
    const primary =
        t?.base_trade_id
        ?? t?.baseTradeId
        ?? t?.trade_id
        ?? t?.id
        ?? (t?.obId || t?.ob_id
            ? `${t.obId || t.ob_id}:${t.direction || t.bias || ""}`
            : "");
    return String(primary || t?.entry || "");
}

function buildDiff(baselineTrades, modelTrades) {
    const list      = Array.isArray(baselineTrades) ? baselineTrades : [];
    const modelKeys = new Set((modelTrades || []).map(tradeKey));
    return list.map(t => ({
        id:        t.id ?? t.entry ?? "—",
        entry:     t.entry ?? "—",
        session:   sessionOf(t.entry),
        direction: t.direction || t.bias || "—",
        r:         rOf(t),
        filled:    modelKeys.has(tradeKey(t)),
        outcome:   rOf(t) > 0 ? "Win" : rOf(t) < 0 ? "Loss" : "BE",
    }));
}

export function TradeDiffExplorer({ exactRows, rawTrades, tradesByMode, activeVariant, selectedModelKey, setSelectedModelKey }) {
    const nonBaselineRows = exactRows.filter(r => r.exact && !r.isBaseline);
    const [filter, setFilter] = useLocalStorageState("fxob_entries_workspace_trade_diff_filter_v1", "all");  // all | filled | skipped

    const selected   = selectedModelKey || nonBaselineRows[0]?.mode || null;
    const modeTrades = useMemo(() => {
        if (!selected) return null;
        const modeKey = String(selected).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return tradesByMode?.[`${activeVariant}__${modeKey}`] || tradesByMode?.[modeKey] || null;
    }, [selected, tradesByMode, activeVariant]);

    const diff = useMemo(() => {
        if (!modeTrades) return null;
        return buildDiff(rawTrades, modeTrades);
    }, [rawTrades, modeTrades]);

    const filteredDiff = useMemo(() => {
        if (!diff) return null;
        if (filter === "filled")  return diff.filter(r => r.filled);
        if (filter === "skipped") return diff.filter(r => !r.filled);
        return diff;
    }, [diff, filter]);

    const columns = [
        { key: "entry",     label: "Entry Time",  render: r => <span className="text-[hsl(var(--text-2))]">{String(r.entry).slice(0, 16).replace("T", " ")}</span> },
        { key: "session",   label: "Session",     render: r => <span className="text-[hsl(var(--text-2))]">{r.session}</span> },
        { key: "direction", label: "Dir",         render: r => <span className="text-[hsl(var(--text-2))]">{r.direction}</span> },
        { key: "filled",    label: "Status",      render: r => r.filled
            ? <Pill tone="success">FILLED</Pill>
            : <Pill tone="danger">SKIPPED</Pill>
        },
        { key: "outcome",   label: "Outcome",     render: r => <span className={r.outcome === "Win" ? "text-[hsl(var(--success))]" : r.outcome === "Loss" ? "text-[hsl(var(--danger))]" : "text-muted-lab"}>{r.outcome}</span> },
        { key: "r",         label: "R",           align: "right", render: r => <ColoredR value={r.r} /> },
        { key: "impact",    label: "Fill Impact", align: "right", render: r => {
            if (r.filled) return <span className="text-[hsl(var(--success))] text-[10px] font-ui">+taken</span>;
            return r.outcome === "Win"
                ? <span className="text-[hsl(var(--danger))] text-[10px] font-ui">missed win</span>
                : <span className="text-[hsl(var(--success))] text-[10px] font-ui">avoided loss</span>;
        }},
    ];

    if (!nonBaselineRows.length) {
        return (
            <NeonPanel title="Trade Diff Explorer" className="xl:col-span-3" action={<Pill tone="warning">NO MODELS YET</Pill>}>
                <div className="py-6 text-center text-[11px] font-ui text-muted-lab">Import entry model results to explore trade-by-trade differences.</div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel title="Trade Diff Explorer" className="xl:col-span-3"
            action={<Pill tone={diff ? "success" : "warning"}>{diff ? `${diff.length} TRADES` : "NEEDS ENTRY CSVS"}</Pill>}
        >
            {/* Model selector */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Model:</span>
                {nonBaselineRows.map(row => (
                    <button key={row.mode} type="button"
                        onClick={() => setSelectedModelKey(row.mode)}
                        className={cn(
                            "px-2.5 py-1 text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors",
                            selected === row.mode
                                ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"
                        )}
                    >
                        {row.label}
                    </button>
                ))}
            </div>

            {!diff && (
                <div className="py-4 text-[10.5px] font-ui text-[hsl(var(--warning))]">
                    Requires per-model entry trade exports (<span className="text-white">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                </div>
            )}

            {diff && (
                <>
                    {/* Filter toggles + summary */}
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                        {[["all","All"], ["filled","Filled"], ["skipped","Skipped"]].map(([k, l]) => (
                            <button key={k} type="button" onClick={() => setFilter(k)}
                                className={cn("text-[10px] font-ui uppercase tracking-wider transition-colors",
                                    filter === k ? "text-white" : "text-muted-lab hover:text-white")}
                            >
                                {l} ({k === "all" ? diff.length : k === "filled" ? diff.filter(r=>r.filled).length : diff.filter(r=>!r.filled).length})
                            </button>
                        ))}
                        <span className="ml-auto text-[10px] font-ui text-muted-lab">
                            Fill rate: {diff.length ? ((diff.filter(r=>r.filled).length/diff.length)*100).toFixed(1) : "—"}% ·
                            Missed wins: {diff.filter(r => !r.filled && r.outcome === "Win").length} ·
                            Avoided losses: {diff.filter(r => !r.filled && r.outcome === "Loss").length}
                        </span>
                    </div>
                    <DataTable testId="entry-diff" columns={columns} rows={filteredDiff} maxHeight={320} />
                </>
            )}
        </NeonPanel>
    );
}
