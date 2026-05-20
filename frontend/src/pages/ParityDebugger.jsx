import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { Segment } from "@/components/lab/controls";
import { CandleChart } from "@/components/lab/CandleChart";
import { useDataset } from "@/data/store";
import { Activity, Target, Hash, Check, X, ShieldCheck, Minus, Plus } from "lucide-react";

export default function ParityDebugger() {
    const { PARITY, PARITY_MISMATCHES, CANDLES } = useDataset();
    const [tab, setTab] = useState("mismatches");
    const [sel, setSel] = useState(PARITY_MISMATCHES[0]?.id);

    const tabs = {
        mismatches: PARITY_MISMATCHES.filter((m) => !["Unmatched TV", "Extra Python"].includes(m.type)),
        unmatched: PARITY_MISMATCHES.filter((m) => m.type === "Unmatched TV"),
        extra: PARITY_MISMATCHES.filter((m) => m.type === "Extra Python"),
    };
    const rows = tabs[tab] || [];
    const current = PARITY_MISMATCHES.find((m) => m.id === sel) || rows[0];
    const slice = CANDLES.slice(60, 140).map((c, i) => ({ ...c, i }));

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="PARITY DEBUGGER"
                title="Pine ↔ Python Validation"
                subtitle="Validate the Python engine against TradingView exports. This page protects against silent logic drift."
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <MetricChip testId="par-tv-trades"    label="TV Trades"        value={String(PARITY.tvTrades)} tone="primary"   icon={Hash} />
                <MetricChip testId="par-py-trades"    label="Python Trades"    value={String(PARITY.pyTrades)} tone="secondary" icon={Hash} />
                <MetricChip testId="par-matched"      label="Matched"          value={String(PARITY.matched)}  sub={`${((PARITY.matched/PARITY.tvTrades)*100).toFixed(1)}%`} tone="success" icon={Check} />
                <MetricChip testId="par-outcome"      label="Outcome Match"    value={String(PARITY.outcomeMatch)} sub={`${((PARITY.outcomeMatch/PARITY.tvTrades)*100).toFixed(1)}%`} tone="success" icon={Target} />
                <MetricChip testId="par-unmatched"    label="Unmatched TV"     value={String(PARITY.unmatchedTv)} tone="danger" icon={Minus} />
                <MetricChip testId="par-extra"        label="Extra Python"     value={String(PARITY.extraPy)}     tone="warning" icon={Plus} />
                <MetricChip testId="par-out-mismatch" label="Outcome Mismatch" value={String(PARITY.outcomeMismatch)} tone="danger" icon={X} />
                <MetricChip testId="par-score"        label="Validation"       value={`${PARITY.score.toFixed(1)}%`} tone="success" icon={ShieldCheck} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Mismatch Diagnostics" action={
                    <Segment
                        testId="par-tabs"
                        options={[
                            { value: "mismatches", label: `Mismatches (${tabs.mismatches.length})` },
                            { value: "unmatched",  label: `Unmatched TV (${tabs.unmatched.length})` },
                            { value: "extra",      label: `Extra Python (${tabs.extra.length})` },
                        ]}
                        value={tab}
                        onChange={setTab}
                    />
                }>
                    <DataTable
                        testId="parity-table"
                        maxHeight={420}
                        rowKey="id"
                        selectedKey={sel}
                        onRowClick={(r) => setSel(r.id)}
                        columns={[
                            { key: "type",       label: "Type",       render: (r) => <Pill tone={r.type === "Outcome Mismatch" ? "danger" : r.type === "Unmatched TV" ? "warning" : "secondary"}>{r.type}</Pill> },
                            { key: "tvTrade",    label: "TV Trade" },
                            { key: "pyTrade",    label: "PY Trade" },
                            { key: "direction",  label: "Dir",        render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction}</Pill> },
                            { key: "entryTimeDiff", label: "T Diff",   align: "right" },
                            { key: "entryPriceDiff",label: "Px Diff",  align: "right", render: (r) => <span className={parseFloat(r.entryPriceDiff) !== 0 ? "text-[hsl(var(--danger))]" : ""}>{r.entryPriceDiff}</span> },
                            { key: "tvOutcome",  label: "TV",         render: (r) => r.tvOutcome === "—" ? "—" : <Pill tone={r.tvOutcome === "Win" ? "success" : "danger"}>{r.tvOutcome}</Pill> },
                            { key: "pyOutcome",  label: "Python",     render: (r) => r.pyOutcome === "—" ? "—" : <Pill tone={r.pyOutcome === "Win" ? "success" : "danger"}>{r.pyOutcome}</Pill> },
                        ]}
                        rows={rows}
                    />
                </NeonPanel>

                <NeonPanel title="Mismatch Preview">
                    <CandleChart
                        candles={slice}
                        obBoxes={[{ i0: 12, i1: 34, top: 1.108, bot: 1.101, side: "bear", id: "OB-Δ" }]}
                        trades={[{ i: 36, price: 1.105, direction: "Short", win: false, id: "diff" }]}
                        tpSlLines={[{ i: 36, tp: 1.0975, sl: 1.1100 }]}
                        height={220}
                        selectedTradeId="diff"
                    />
                    {current && (
                        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11.5px]">
                            <Side label="TradingView" data={[
                                ["Trade", current.tvTrade],
                                ["Outcome", current.tvOutcome],
                                ["Direction", current.direction],
                            ]} tone="secondary" />
                            <Side label="Python" data={[
                                ["Trade", current.pyTrade],
                                ["Outcome", current.pyOutcome],
                                ["Direction", current.direction],
                            ]} tone="primary" />
                            <div className="col-span-2 mt-1 grid grid-cols-2 gap-2">
                                <Stat k="Entry Time Diff" v={current.entryTimeDiff} />
                                <Stat k="Entry Price Diff" v={current.entryPriceDiff} />
                                <Stat k="Exit Price Diff" v={current.exitPriceDiff} />
                            </div>
                        </div>
                    )}
                </NeonPanel>
            </div>
        </div>
    );
}

function Side({ label, data, tone }) {
    const color = tone === "secondary" ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--accent-primary))]";
    const border = tone === "secondary" ? "border-[hsl(var(--accent-secondary)/0.4)]" : "border-[hsl(var(--accent-primary)/0.4)]";
    return (
        <div className={`border ${border} clip-bevel-sm p-2.5 bg-[hsl(var(--panel-2)/0.4)]`}>
            <div className={`text-[10px] font-mono uppercase tracking-wider ${color}`}>{label}</div>
            <div className="mt-1 space-y-0.5">
                {data.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                        <span className="text-muted-lab text-[10px] uppercase tracking-wider">{k}</span>
                        <span className="text-white">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
function Stat({ k, v }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-2 py-1.5">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{k}</div>
            <div className="text-white text-[12px]">{v}</div>
        </div>
    );
}
