import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Field, NeonSelect, Segment, NeonInput } from "@/components/lab/controls";
import { useDataset, setHideMocks } from "@/data/store";

export default function Runs() {
    const { RUNS, hideMocks, hasImportedRuns, importedCount } = useDataset();
    const [symbol, setSymbol] = useState("All");
    const [tf, setTf] = useState("All");
    const [mode, setMode] = useState("All");
    const [sort, setSort] = useState("netR");
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        const arr = RUNS.filter((r) => {
            if (symbol !== "All" && r.symbol !== symbol) return false;
            if (tf !== "All" && r.detectionTf !== tf) return false;
            if (mode !== "All" && r.executionMode !== mode) return false;
            if (q && !r.id.toLowerCase().includes(q.toLowerCase())) return false;
            return true;
        });
        // Imported runs always appear before mock runs; sort within each partition.
        const cmp = (a, b) => (b[sort] ?? 0) - (a[sort] ?? 0);
        const imp  = arr.filter((r) => r._source === "imported").sort(cmp);
        const mock = arr.filter((r) => r._source !== "imported").sort(cmp);
        return [...imp, ...mock];
    }, [symbol, tf, mode, sort, q, RUNS]);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="RUNS INVENTORY"
                title="All Backtest Runs"
                subtitle={`${filtered.length} run${filtered.length === 1 ? "" : "s"} matching filters`}
            />

            <div className="px-6 grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
                <Field label="Symbol"><NeonSelect testId="runs-symbol" value={symbol} onChange={setSymbol} options={["All", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"]} /></Field>
                <Field label="Timeframe"><NeonSelect value={tf} onChange={setTf} options={["All", "M5", "M15", "M30", "H1"]} /></Field>
                <Field label="Execution Mode"><NeonSelect value={mode} onChange={setMode} options={["All", "single_position", "one_per_direction", "allow_multi_position"]} /></Field>
                <Field label="Search Run ID"><NeonInput data-testid="runs-search" placeholder="EURUSD_M15…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            </div>

            <div className="px-6 mb-3 flex items-center justify-between gap-3 flex-wrap">
                <Segment
                    testId="runs-sort"
                    options={[
                        { value: "netR",       label: "Net R" },
                        { value: "winRate",    label: "Win Rate" },
                        { value: "trades",     label: "Trades" },
                        { value: "validation", label: "Validation" },
                    ]}
                    value={sort}
                    onChange={setSort}
                />
                <div className="flex items-center gap-2">
                    {hasImportedRuns && (
                        <button
                            onClick={() => setHideMocks(!hideMocks)}
                            data-testid="runs-toggle-mocks"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border clip-bevel-sm transition-colors ${
                                hideMocks
                                    ? "border-[hsl(var(--accent-primary))] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]"
                                    : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                            }`}
                        >
                            {hideMocks ? "Show Mock Runs" : "Hide Mock Runs"}
                        </button>
                    )}
                    <Pill tone="muted">{filtered.length} rows</Pill>
                    {importedCount > 0 && <Pill tone="primary">{importedCount} imported</Pill>}
                </div>
            </div>

            <div className="px-6">
                <NeonPanel dense>
                    <DataTable
                        testId="runs-table"
                        columns={[
                            { key: "id",          label: "Run ID",     render: (r) => (
                                <span className="inline-flex items-center gap-1.5">
                                    <Link to={`/runs/${encodeURIComponent(r.id)}`} className="text-[hsl(var(--accent-primary))] hover:text-white">{r.id}</Link>
                                    {r._source === "mock" && <Pill tone="muted">MOCK</Pill>}
                                    {r._source === "imported" && <Pill tone="primary">REAL</Pill>}
                                </span>
                            ) },
                            { key: "symbol",      label: "Symbol" },
                            { key: "detectionTf", label: "Det TF" },
                            { key: "executionTf", label: "Exec TF" },
                            { key: "dateRange",   label: "Date Range" },
                            { key: "rr",          label: "RR",         align: "right", render: (r) => r.rr.toFixed(1) },
                            { key: "stopBuffer",  label: "SB",         align: "right", render: (r) => r.stopBuffer.toFixed(1) },
                            { key: "verifyTicks", label: "VT",         align: "right" },
                            { key: "trades",      label: "Trades",     align: "right" },
                            { key: "winRate",     label: "WR",         align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                            { key: "netR",        label: "Net R",      align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "validation",  label: "Val",        align: "right", render: (r) => <span className="text-[hsl(var(--success))]">{r.validation.toFixed(1)}%</span> },
                        ]}
                        rows={filtered}
                    />
                </NeonPanel>
            </div>
        </div>
    );
}
