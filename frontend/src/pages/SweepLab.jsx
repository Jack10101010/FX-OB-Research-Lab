import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Segment, NeonSelect, Field } from "@/components/lab/controls";
import { MetricChip } from "@/components/lab/MetricChip";
import {
    SWEEP_RR, SWEEP_STOP_BUFFER, SWEEP_ENTRY_BUFFER, SWEEP_VERIFY, SWEEP_TF, SWEEP_PAIR, SWEEP_SESSION, SWEEP_HEATMAP,
} from "@/data/mock";
import { Trophy, AlertTriangle, Skull } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const TABS = [
    { id: "rr",     label: "RR Sweep" },
    { id: "sb",     label: "Stop Buffer" },
    { id: "eb",     label: "Entry Buffer" },
    { id: "vt",     label: "Verify Ticks" },
    { id: "tf",     label: "Timeframe" },
    { id: "pair",   label: "Pair" },
    { id: "session", label: "Session" },
];

export default function SweepLab() {
    const [tab, setTab] = useState("rr");

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="SWEEP LAB"
                title="Parameter Sweep Analysis"
                subtitle="Explore the response surface of each strategy parameter. Identify stable, robust, and high-Net-R configurations."
            />

            <div className="px-6 mb-4">
                <Segment testId="sweep-tabs" options={TABS.map((t) => ({ value: t.id, label: t.label }))} value={tab} onChange={setTab} />
            </div>

            <div className="px-6 grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                <div className="xl:col-span-2">
                    {tab === "rr"      && <RRSweepView />}
                    {tab === "sb"      && <SimpleSweep title="Stop Buffer Sweep"  rows={SWEEP_STOP_BUFFER} xKey="sb"     xLabel="Stop Buffer (pips)" />}
                    {tab === "eb"      && <SimpleSweep title="Entry Buffer Sweep" rows={SWEEP_ENTRY_BUFFER} xKey="eb"   xLabel="Entry Buffer (pips)" />}
                    {tab === "vt"      && <SimpleSweep title="Verify Ticks Sweep" rows={SWEEP_VERIFY}        xKey="vt"   xLabel="Verify Ticks" />}
                    {tab === "tf"      && <SimpleSweep title="Timeframe Sweep"    rows={SWEEP_TF}            xKey="tf"   xLabel="Timeframe" categorical />}
                    {tab === "pair"    && <SimpleSweep title="Pair Sweep"         rows={SWEEP_PAIR}          xKey="pair" xLabel="Symbol" categorical />}
                    {tab === "session" && <SimpleSweep title="Session Sweep"      rows={SWEEP_SESSION}       xKey="session" xLabel="Session" categorical />}
                </div>
                <div className="space-y-4">
                    <BestConfigCard />
                    <WorstConfigCard />
                </div>
            </div>

            <div className="px-6">
                <NeonPanel title="Heatmap · RR × Stop Buffer (Net R)">
                    <Heatmap />
                </NeonPanel>
            </div>
        </div>
    );
}

function RRSweepView() {
    return (
        <div className="space-y-4">
            <NeonPanel title="RR Sweep Leaderboard">
                <DataTable
                    testId="rr-sweep-table"
                    columns={[
                        { key: "rr",        label: "RR",       render: (r) => r.rr.toFixed(1) },
                        { key: "trades",    label: "Trades",   align: "right" },
                        { key: "winRate",   label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                        { key: "netR",      label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                        { key: "expectancy",label: "E[R]",     align: "right", render: (r) => `${r.expectancy.toFixed(3)}R` },
                        { key: "pf",        label: "PF",       align: "right", render: (r) => r.pf.toFixed(2) },
                    ]}
                    rows={SWEEP_RR}
                    rowKey="rr"
                    selectedKey={3.3}
                />
            </NeonPanel>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <NeonPanel title="Net R vs RR">
                    <div style={{ width: "100%", height: 180 }}>
                        <ResponsiveContainer>
                            <LineChart data={SWEEP_RR} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="rr" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Line type="monotone" dataKey="netR" stroke="hsl(var(--accent-primary))" strokeWidth={2} dot={{ fill: "hsl(var(--accent-primary))", r: 3 }} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
                <NeonPanel title="Win Rate vs RR">
                    <div style={{ width: "100%", height: 180 }}>
                        <ResponsiveContainer>
                            <LineChart data={SWEEP_RR} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="rr" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-secondary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Line type="monotone" dataKey="winRate" stroke="hsl(var(--accent-secondary))" strokeWidth={2} dot={{ fill: "hsl(var(--accent-secondary))", r: 3 }} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
                <NeonPanel title="Trades vs RR">
                    <div style={{ width: "100%", height: 180 }}>
                        <ResponsiveContainer>
                            <BarChart data={SWEEP_RR} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="rr" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-glow)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="trades" fill="hsl(var(--accent-glow)/0.7)" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function SimpleSweep({ title, rows, xKey, xLabel, categorical }) {
    const best = rows.reduce((a, b) => (b.netR > a.netR ? b : a));
    return (
        <div className="space-y-4">
            <NeonPanel title={title}>
                <DataTable
                    columns={[
                        { key: xKey, label: xLabel, render: (r) => String(r[xKey]) },
                        { key: "trades", label: "Trades", align: "right" },
                        { key: "winRate", label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                        { key: "netR", label: "Net R", align: "right", render: (r) => <ColoredR value={r.netR} /> },
                    ]}
                    rows={rows}
                    rowKey={xKey}
                    selectedKey={best[xKey]}
                />
            </NeonPanel>
            <NeonPanel title={`Net R vs ${xLabel}`}>
                <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                        {categorical ? (
                            <BarChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey={xKey} tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="netR" radius={[2, 2, 0, 0]}>
                                    {rows.map((r, i) => <Cell key={i} fill={r.netR >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.7)"} />)}
                                </Bar>
                            </BarChart>
                        ) : (
                            <LineChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey={xKey} tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Line type="monotone" dataKey="netR" stroke="hsl(var(--accent-primary))" strokeWidth={2} dot={{ fill: "hsl(var(--accent-primary))", r: 3 }} isAnimationActive={false} />
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </NeonPanel>
        </div>
    );
}

function BestConfigCard() {
    return (
        <div className="relative clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary))] via-[hsl(var(--accent-glow))] to-[hsl(var(--accent-secondary))]">
            <div className="clip-bevel bg-[hsl(var(--panel))] p-4 relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-[hsl(var(--accent-primary)/0.18)] rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-[hsl(var(--accent-primary))]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">Best Config · RR Sweep</span>
                </div>
                <div className="mt-2 font-display text-[40px] leading-none font-semibold text-glow-primary text-[hsl(var(--accent-primary))]">4.0<span className="text-[16px] text-muted-lab ml-1">RR</span></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11.5px] mt-3">
                    <Stat k="Net R"      v="+55.0R" pos />
                    <Stat k="Win Rate"   v="28.1%" />
                    <Stat k="Trades"     v="135" />
                    <Stat k="Expectancy" v="0.407R" />
                </div>
            </div>
        </div>
    );
}
function WorstConfigCard() {
    return (
        <div className="relative clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--danger)/0.6)] via-[hsl(var(--border-mid))] to-[hsl(var(--border-mid))]">
            <div className="clip-bevel bg-[hsl(var(--panel))] p-4">
                <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 text-[hsl(var(--danger))]" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">Worst Config · RR Sweep</span>
                </div>
                <div className="mt-2 font-display text-[34px] leading-none font-semibold text-[hsl(var(--danger))]">2.0<span className="text-[14px] text-muted-lab ml-1">RR</span></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11.5px] mt-3">
                    <Stat k="Net R"      v="+26.0R" />
                    <Stat k="Win Rate"   v="39.6%" />
                    <Stat k="Trades"     v="139" />
                    <Stat k="Expectancy" v="0.187R" />
                </div>
            </div>
        </div>
    );
}
function Stat({ k, v, pos }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-muted-lab text-[10px] uppercase tracking-wider">{k}</span>
            <span className={pos ? "text-[hsl(var(--success))]" : "text-white"}>{v}</span>
        </div>
    );
}

function Heatmap() {
    const { rrs, sbs, cells } = SWEEP_HEATMAP;
    const max = Math.max(...cells.map((c) => c.netR));
    const min = Math.min(...cells.map((c) => c.netR));
    return (
        <div className="overflow-x-auto scrollbar-thin">
            <table className="font-mono text-[11px] border-separate border-spacing-1">
                <thead>
                    <tr>
                        <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">RR / SB</th>
                        {sbs.map((sb) => <th key={sb} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{sb.toFixed(1)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rrs.map((rr) => (
                        <tr key={rr}>
                            <td className="text-muted-lab px-2 py-1">{rr.toFixed(1)}</td>
                            {sbs.map((sb) => {
                                const c = cells.find((x) => x.rr === rr && x.sb === sb);
                                const norm = (c.netR - min) / (max - min);
                                const hue = Math.round(120 * norm); // green → red gradient
                                return (
                                    <td key={sb}>
                                        <div className="clip-bevel-sm px-2 py-1 text-center text-white tabular-nums"
                                             style={{ background: `hsla(${hue}, 70%, 35%, 0.55)`, boxShadow: norm > 0.85 ? "0 0 12px -2px hsl(var(--accent-primary))" : undefined }}>
                                            {c.netR.toFixed(1)}R
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
