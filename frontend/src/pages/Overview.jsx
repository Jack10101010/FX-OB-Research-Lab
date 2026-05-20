import React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { MetricChip } from "@/components/lab/MetricChip";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonButton } from "@/components/lab/controls";
import {
    Activity, Target, Hash, TrendingUp, AlertOctagon, ShieldCheck,
    Trophy, ChevronRight, BarChart3,
} from "lucide-react";
import { useDataset } from "@/data/store";
import { computeProfitFactor, computeMaxDrawdown } from "@/lib/metrics";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend,
} from "recharts";

export default function Overview() {
    const { ACTIVE_RUN, EQUITY_CURVE, RUNS, SWEEP_RR, MONTHLY, R_DIST, TRADES } = useDataset();
    const recent = RUNS.slice(0, 6);
    const spark = EQUITY_CURVE.filter((_, i) => i % 10 === 0).map((p) => p.netR);
    // Real metrics from full active-run data
    const pf = computeProfitFactor(TRADES);
    const maxDd = computeMaxDrawdown(EQUITY_CURVE);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="OVERVIEW DASHBOARD"
                title="FX-OB Research Lab"
                subtitle="Backtest, validate, and refine Forex order-block strategies. Research only — no live execution."
                actions={
                    <>
                        <NeonButton icon={BarChart3} tone="ghost">Latest Run Summary</NeonButton>
                        <NeonButton icon={Activity} tone="primary">New Backtest</NeonButton>
                    </>
                }
            />

            {/* KPI ROW */}
            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip testId="kpi-net-r"      label="Net R (Latest)"   value="+39.3R" sub="EURUSD M15 · RR 3.3" tone="primary"   icon={TrendingUp} sparkline={spark} />
                <MetricChip testId="kpi-win-rate"   label="Win Rate"         value="29.9%"  sub="41 / 137 trades"     tone="secondary" icon={Target} sparkline={spark.map((v) => v * 0.4)} />
                <MetricChip testId="kpi-trades"     label="Trades"           value="137"    sub="Validated set"        tone="muted"     icon={Hash} />
                <MetricChip testId="kpi-best-rr"    label="Best RR"          value="4.0"    sub="+55.0R · PF 1.62"     tone="primary"   icon={Trophy} />
                <MetricChip testId="kpi-reverse"    label="Reverse Cancel"   value="2"      sub="1.5% of trades"       tone="warning"   icon={AlertOctagon} />
                <MetricChip testId="kpi-validation" label="Validation"       value="98.2%"  sub="Pine ↔ Python parity" tone="success"   icon={ShieldCheck} />
            </div>

            {/* MAIN GRID */}
            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve · Latest Run" action={<Pill tone="primary">NET R</Pill>}>
                    <EquityCurve data={EQUITY_CURVE} height={300} />
                </NeonPanel>

                <NeonPanel title="Top Sweep (RR)" action={<Link to="/sweep" className="text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--accent-secondary))] hover:underline">Go to Sweep Lab →</Link>}>
                    <DataTable
                        testId="top-sweep-table"
                        columns={[
                            { key: "rr",        label: "RR",       render: (r) => <span className={r.rr === ACTIVE_RUN.rr ? "text-[hsl(var(--accent-primary))]" : ""}>{r.rr.toFixed(1)}</span> },
                            { key: "trades",    label: "Trades",   align: "right" },
                            { key: "winRate",   label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                            { key: "netR",      label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "expectancy",label: "E[R]",     align: "right", render: (r) => `${r.expectancy.toFixed(3)}R` },
                        ]}
                        rows={SWEEP_RR}
                        rowKey="rr"
                        selectedKey={ACTIVE_RUN.rr}
                    />
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Recent Runs" action={<Link to="/runs" className="text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--accent-secondary))] hover:underline">View all runs →</Link>}>
                    <DataTable
                        testId="recent-runs-table"
                        columns={[
                            { key: "id",        label: "Run ID" },
                            { key: "symbol",    label: "Symbol" },
                            { key: "detectionTf", label: "TF" },
                            { key: "rr",        label: "RR",       align: "right", render: (r) => r.rr.toFixed(1) },
                            { key: "trades",    label: "Trades",   align: "right" },
                            { key: "winRate",   label: "Win Rate", align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                            { key: "netR",      label: "Net R",    align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "date",      label: "Date",     align: "right" },
                        ]}
                        rows={recent}
                    />
                </NeonPanel>

                <NeonPanel title="Active Config" action={<Pill tone="primary">VALIDATED</Pill>}>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11.5px]">
                        {[
                            ["Symbol",        ACTIVE_RUN.symbol],
                            ["Detection TF",  ACTIVE_RUN.detectionTf],
                            ["Execution TF",  ACTIVE_RUN.executionTf],
                            ["Date Range",    "May '25 → May '26"],
                            ["RR",            ACTIVE_RUN.rr.toFixed(1)],
                            ["Stop Buffer",   `${ACTIVE_RUN.stopBuffer} pip`],
                            ["Entry Buffer",  `${ACTIVE_RUN.entryBuffer} pip`],
                            ["Verify Ticks",  ACTIVE_RUN.verifyTicks],
                            ["Execution",     "single_position"],
                            ["Direction",     "Both"],
                            ["Profit Factor", pf != null ? pf.toFixed(2) : "N/A"],
                            ["Max Drawdown",  maxDd != null ? `${maxDd.toFixed(1)}R` : "N/A"],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div className="text-muted-lab uppercase tracking-wider text-[10px]">{k}</div>
                                <div className="text-right text-white">{v}</div>
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="divider-glow my-3" />
                    <Link to="/runs/active" className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:text-white">
                        Open run detail <ChevronRight className="w-3 h-3" />
                    </Link>
                </NeonPanel>

                <NeonPanel title="Performance Distribution">
                    <div className="flex items-center gap-4">
                        <div style={{ width: 132, height: 132 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={[{ name: "Wins", value: 41 }, { name: "Losses", value: 96 }]} dataKey="value" innerRadius={42} outerRadius={62} stroke="hsl(var(--panel))" strokeWidth={2} isAnimationActive={false}>
                                        <Cell fill="hsl(var(--accent-primary))" />
                                        <Cell fill="hsl(var(--bear) / 0.55)" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-[12px] font-mono">
                            <div className="flex items-center gap-2"><span className="w-2 h-2 bg-[hsl(var(--accent-primary))]" /> Wins (29.9%)</div>
                            <div className="flex items-center gap-2 mt-1.5"><span className="w-2 h-2 bg-[hsl(var(--bear)/0.65)]" /> Losses (70.1%)</div>
                            <div className="mt-3 text-muted-lab">Total Trades</div>
                            <div className="text-white text-[20px] tabular-nums">137</div>
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel title="R Multiple Distribution">
                    <div style={{ width: "100%", height: 160 }}>
                        <ResponsiveContainer>
                            <BarChart data={R_DIST} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis hide />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                    {R_DIST.map((d, i) => (
                                        <Cell key={i} fill={d.bucket.startsWith("-") ? "hsl(var(--bear)/0.65)" : "hsl(var(--accent-primary))"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    <div style={{ width: "100%", height: 180 }}>
                        <ResponsiveContainer>
                            <BarChart data={MONTHLY} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} formatter={(v) => [`${Number(v).toFixed(1)}R`, "Net R"]} />
                                <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                    {MONTHLY.map((d, i) => (
                                        <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}
