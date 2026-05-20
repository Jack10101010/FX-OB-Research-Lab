import React from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonButton } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { Map as MapIcon, Crosshair, GitCompareArrows, TrendingUp, Hash, Activity, Target, AlertTriangle, ShieldCheck } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie } from "recharts";

export default function RunDetail() {
    const { ACTIVE_RUN, EQUITY_CURVE, TRADES, MONTHLY, R_DIST, RUNS } = useDataset();
    const params = useParams();
    const runId = params.runId === "active" ? ACTIVE_RUN.id : decodeURIComponent(params.runId || ACTIVE_RUN.id);
    const run = RUNS.find((r) => r.id === runId) || ACTIVE_RUN;
    const spark = EQUITY_CURVE.filter((_, i) => i % 12 === 0).map((p) => p.netR);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="RUN DETAIL"
                title={run.id}
                subtitle={`${run.symbol} · ${run.detectionTf} · RR ${run.rr.toFixed(1)} · ${run.dateRange || "2025-05-18 → 2026-05-18"}`}
                actions={
                    <>
                        <Link to="/strategy-map"><NeonButton icon={MapIcon} tone="primary">Open Strategy Map</NeonButton></Link>
                        <Link to="/trade-inspector"><NeonButton icon={Crosshair} tone="secondary">Open Trade Inspector</NeonButton></Link>
                        <Link to="/comparison"><NeonButton icon={GitCompareArrows} tone="ghost">Compare Run</NeonButton></Link>
                    </>
                }
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Net R"          value={`${run.netR >= 0 ? "+" : ""}${run.netR}R`} sub={`${run.trades} trades`}     tone="primary"   icon={TrendingUp} sparkline={spark} />
                <MetricChip label="Win Rate"       value={`${run.winRate.toFixed(1)}%`}             sub={`${run.wins || ACTIVE_RUN.wins} / ${run.losses || ACTIVE_RUN.losses}`} tone="secondary" icon={Target} />
                <MetricChip label="Trades"         value={String(run.trades)}                       sub="Validated"                      tone="muted"     icon={Hash} />
                <MetricChip label="Expectancy"     value="0.287R"                                   sub="per trade"                      tone="primary"   icon={Activity} />
                <MetricChip label="Profit Factor"  value="1.49"                                     sub="Placeholder"                    tone="secondary" icon={ShieldCheck} />
                <MetricChip label="Max Drawdown"   value="-8.2R"                                    sub="Placeholder"                    tone="danger"    icon={AlertTriangle} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve" action={<Pill tone="primary">NET R</Pill>}>
                    <EquityCurve data={EQUITY_CURVE} height={300} />
                </NeonPanel>

                <NeonPanel title="Configuration">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11.5px]">
                        {[
                            ["Symbol",        run.symbol],
                            ["Detection TF",  run.detectionTf],
                            ["Execution TF",  run.executionTf || "1m"],
                            ["Date Range",    "May '25 → May '26"],
                            ["RR",            run.rr.toFixed(1)],
                            ["Stop Buffer",   `${run.stopBuffer ?? 1.0} pip`],
                            ["Entry Buffer",  "0.0 pip"],
                            ["Verify Ticks",  String(run.verifyTicks ?? 0)],
                            ["Execution",     run.executionMode || "single_position"],
                            ["OB Filter",     "ATR"],
                            ["Structure",     "Both"],
                            ["Direction",     "Both"],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div className="text-muted-lab uppercase tracking-wider text-[10px]">{k}</div>
                                <div className="text-right text-white">{v}</div>
                            </React.Fragment>
                        ))}
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Trade Ledger" action={<Pill tone="secondary">{TRADES.length} TRADES</Pill>}>
                    <DataTable
                        testId="run-detail-trades"
                        maxHeight={360}
                        columns={[
                            { key: "id",        label: "ID" },
                            { key: "direction", label: "Dir", render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction}</Pill> },
                            { key: "structure", label: "Struct" },
                            { key: "session",   label: "Session" },
                            { key: "entry",     label: "Entry Time" },
                            { key: "entryPrice",label: "Entry",   align: "right" },
                            { key: "stop",      label: "Stop",    align: "right" },
                            { key: "tp",        label: "TP",      align: "right" },
                            { key: "r",         label: "R",       align: "right", render: (r) => <ColoredR value={r.r} /> },
                            { key: "outcome",   label: "Result",  render: (r) => <Pill tone={r.outcome === "Win" ? "success" : "danger"}>{r.outcome}</Pill> },
                        ]}
                        rows={TRADES}
                    />
                </NeonPanel>

                <NeonPanel title="Order Block Stats">
                    <div className="grid grid-cols-2 gap-3 text-[12px] font-mono">
                        <Stat label="Bullish OBs"  value="68" tone="primary" />
                        <Stat label="Bearish OBs"  value="62" tone="secondary" />
                        <Stat label="BOS"          value="74" tone="primary" />
                        <Stat label="CHoCH"        value="56" tone="secondary" />
                        <Stat label="Reverse Cancels" value={String(run.reverseCancels ?? 2)} tone="warning" />
                        <Stat label="Avg OB Width" value="14.2 pips" tone="muted" />
                    </div>
                </NeonPanel>

                <NeonPanel title="Outcome Distribution">
                    <div className="flex items-center gap-4">
                        <div style={{ width: 120, height: 120 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={[{ name: "Wins", value: 41 }, { name: "Losses", value: 96 }]} dataKey="value" innerRadius={38} outerRadius={58} stroke="hsl(var(--panel))" strokeWidth={2} isAnimationActive={false}>
                                        <Cell fill="hsl(var(--accent-primary))" />
                                        <Cell fill="hsl(var(--bear) / 0.55)" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ width: "60%", height: 120 }}>
                            <ResponsiveContainer>
                                <BarChart data={R_DIST}>
                                    <XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis hide />
                                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                        {R_DIST.map((d, i) => <Cell key={i} fill={d.bucket.startsWith("-") ? "hsl(var(--bear)/0.65)" : "hsl(var(--accent-primary))"} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    <div style={{ width: "100%", height: 200 }}>
                        <ResponsiveContainer>
                            <BarChart data={MONTHLY} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                    {MONTHLY.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Stat({ label, value, tone }) {
    const color = { primary: "text-[hsl(var(--accent-primary))]", secondary: "text-[hsl(var(--accent-secondary))]", warning: "text-[hsl(var(--warning))]", muted: "text-white" }[tone];
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2.5 bg-[hsl(var(--panel-2)/0.5)]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{label}</div>
            <div className={`text-[18px] font-display font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
        </div>
    );
}
