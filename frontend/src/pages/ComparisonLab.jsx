import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonSelect, Field, NeonButton } from "@/components/lab/controls";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { RUNS, EQUITY_CURVE, MONTHLY, COMPARISON_DELTAS } from "@/data/mock";
import { Plus, GitCompareArrows, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";

export default function ComparisonLab() {
    const [aId, setAId] = useState(RUNS[0].id);
    const [bId, setBId] = useState(RUNS[5].id);
    const a = RUNS.find((r) => r.id === aId);
    const b = RUNS.find((r) => r.id === bId);

    // Merge equity curves into one dataset
    const eqMerged = EQUITY_CURVE.map((p, i) => ({ ...p, netRB: Number((p.netR * 0.81 + (i % 12 === 0 ? -2 : 0.4)).toFixed(2)) }));
    const monthlyMerged = MONTHLY.map((m) => ({ m: m.m, A: m.v, B: Number((m.v * 0.82 - (m.v < 0 ? 0.4 : 0.2)).toFixed(2)) }));
    const ddMerged = Array.from({ length: 40 }).map((_, i) => ({ i, A: -2 - Math.abs(Math.sin(i / 5)) * 4 + (i % 9) * 0.2, B: -3 - Math.abs(Math.sin(i / 4 + 1)) * 5 }));

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="COMPARISON LAB"
                title="Run A vs Run B"
                subtitle="Side-by-side analysis of two backtest runs."
                actions={<NeonButton icon={Plus} tone="primary">Add Run</NeonButton>}
            />

            <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                <Field label="Run A"><NeonSelect testId="cmp-a" value={aId} onChange={setAId} options={RUNS.map((r) => r.id)} /></Field>
                <Field label="Run B"><NeonSelect testId="cmp-b" value={bId} onChange={setBId} options={RUNS.map((r) => r.id)} /></Field>
                <div className="flex items-end">
                    <div className="inline-flex items-center gap-2 px-3 py-2 border border-[hsl(var(--accent-primary)/0.5)] clip-bevel-sm bg-[hsl(var(--accent-primary)/0.06)]">
                        <Trophy className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-white">Winner · {a.netR >= b.netR ? "Run A" : "Run B"}</span>
                    </div>
                </div>
            </div>

            <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricChip label="Net R A"        value={`${a.netR >= 0 ? "+" : ""}${a.netR}R`} sub={a.id} tone="primary"   />
                <MetricChip label="Net R B"        value={`${b.netR >= 0 ? "+" : ""}${b.netR}R`} sub={b.id} tone="secondary" />
                <MetricChip label="Δ Net R"        value={`${(a.netR - b.netR >= 0 ? "+" : "")}${(a.netR - b.netR).toFixed(1)}R`} sub="A − B" tone={a.netR - b.netR >= 0 ? "success" : "danger"} />
                <MetricChip label="Δ Win Rate"     value={`${(a.winRate - b.winRate >= 0 ? "+" : "")}${(a.winRate - b.winRate).toFixed(1)}%`} sub="A − B" tone={a.winRate - b.winRate >= 0 ? "success" : "danger"} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve Comparison (Net R)" action={<Legend2 a={a.id} b={b.id} />}>
                    <EquityCurve data={eqMerged} secondary height={280} />
                </NeonPanel>
                <NeonPanel title="Metric Deltas">
                    <DataTable
                        columns={[
                            { key: "metric", label: "Metric" },
                            { key: "a",      label: "Run A", align: "right" },
                            { key: "b",      label: "Run B", align: "right" },
                            { key: "diff",   label: "Δ",     align: "right", render: (r) => <span className={r.pos === true ? "text-[hsl(var(--success))]" : r.pos === false ? "text-[hsl(var(--danger))]" : "text-muted-lab"}>{r.diff}</span> },
                        ]}
                        rows={COMPARISON_DELTAS}
                        rowKey="metric"
                    />
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Monthly Performance">
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={monthlyMerged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="A" fill="hsl(var(--accent-primary))" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="B" fill="hsl(var(--accent-secondary))" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel title="Drawdown Comparison">
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <LineChart data={ddMerged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--danger)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Line type="monotone" dataKey="A" stroke="hsl(var(--accent-primary))" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="B" stroke="hsl(var(--accent-secondary))" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Legend2({ a, b }) {
    return (
        <div className="flex items-center gap-3 text-[10.5px] font-mono">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 bg-[hsl(var(--accent-primary))]" /><span className="text-[hsl(var(--text-2))]">{a}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 bg-[hsl(var(--accent-secondary))]" /><span className="text-[hsl(var(--text-2))]">{b}</span></span>
        </div>
    );
}
