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
                <MetricChip testId="kpi-net-r"      label="Net R (Latest)"   value={`${ACTIVE_RUN.netR >= 0 ? "+" : ""}${ACTIVE_RUN.netR}R`} sub={`${ACTIVE_RUN.symbol} ${ACTIVE_RUN.detectionTf} · RR ${Number(ACTIVE_RUN.rr).toFixed(1)}`} tone="primary"   icon={TrendingUp} sparkline={spark} />
                <MetricChip testId="kpi-win-rate"   label="Win Rate"         value={`${Number(ACTIVE_RUN.winRate).toFixed(1)}%`}  sub={`${ACTIVE_RUN.wins} / ${ACTIVE_RUN.trades} trades`}     tone="secondary" icon={Target} sparkline={spark.map((v) => v * 0.4)} />
                <MetricChip testId="kpi-trades"     label="Trades"           value={String(ACTIVE_RUN.trades)}    sub="Validated set"        tone="muted"     icon={Hash} />
                <MetricChip testId="kpi-best-rr"    label="Best RR"          value="4.0"    sub="+55.0R · PF 1.62"     tone="primary"   icon={Trophy} />
                <MetricChip testId="kpi-reverse"    label="Reverse Cancel"   value={String(ACTIVE_RUN.reverseCancels ?? 0)}      sub={`${Number(((ACTIVE_RUN.reverseCancels ?? 0) / Math.max(1, ACTIVE_RUN.trades) * 100)).toFixed(1)}% of trades`}       tone="warning"   icon={AlertOctagon} />
                <MetricChip testId="kpi-validation" label="Validation"       value={`${Number(ACTIVE_RUN.validation).toFixed(1)}%`}  sub="Pine ↔ Python parity" tone="success"   icon={ShieldCheck} />
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
                            ["Date Range",    ACTIVE_RUN.dateRange || "May '25 → May '26"],
                            ["RR",            Number(ACTIVE_RUN.rr).toFixed(1)],
                            ["Stop Buffer",   `${ACTIVE_RUN.stopBuffer} pip`],
                            ["Entry Buffer",  `${ACTIVE_RUN.entryBuffer ?? 0} pip`],
                            ["Verify Ticks",  ACTIVE_RUN.verifyTicks],
                            ["Execution",     ACTIVE_RUN.executionMode || "single_position"],
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
                    <IntegritySummary integrity={ACTIVE_RUN.integrity} />
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
                                    <Pie data={[{ name: "Wins", value: ACTIVE_RUN.wins }, { name: "Losses", value: ACTIVE_RUN.losses }]} dataKey="value" innerRadius={42} outerRadius={62} stroke="hsl(var(--panel))" strokeWidth={2} isAnimationActive={false}>
                                        <Cell fill="hsl(var(--accent-primary))" />
                                        <Cell fill="hsl(var(--bear) / 0.55)" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-[12px] font-mono">
                            <div className="flex items-center gap-2"><span className="w-2 h-2 bg-[hsl(var(--accent-primary))]" /> Wins ({Number(ACTIVE_RUN.winRate).toFixed(1)}%)</div>
                            <div className="flex items-center gap-2 mt-1.5"><span className="w-2 h-2 bg-[hsl(var(--bear)/0.65)]" /> Losses ({(100 - Number(ACTIVE_RUN.winRate)).toFixed(1)}%)</div>
                            <div className="mt-3 text-muted-lab">Total Trades</div>
                            <div className="text-white text-[20px] tabular-nums">{ACTIVE_RUN.trades}</div>
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

function IntegritySummary({ integrity }) {
    const status = integrity?.status || "UNAVAILABLE";
    const flagged = integrity?.checks
        ? Object.entries(integrity.checks).filter(([, check]) => check.status !== "PASS")
        : [];
    const tone = status === "PASS" ? "success" : status === "FAIL" ? "danger" : "warning";
    const Icon = status === "PASS" ? ShieldCheck : AlertOctagon;

    return (
        <div className="mt-3 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2" data-testid="run-integrity-summary">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 ${status === "PASS" ? "text-[hsl(var(--success))]" : status === "FAIL" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}`} />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-lab">Run Integrity</span>
                </div>
                <Pill tone={tone}>{status}</Pill>
            </div>
            <div className="mt-1.5 text-[10.5px] font-mono text-muted-lab">
                {flagged.length ? flagged.map(([key, check]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                        <span className="uppercase tracking-wider">{integrityLabel(key)}</span>
                        <span className={check.status === "FAIL" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]"}>
                            {integrityDetail(key, check)}
                        </span>
                    </div>
                )) : (
                    <span>{integrity ? "All imported-run checks passed" : "No imported-run integrity data"}</span>
                )}
            </div>
        </div>
    );
}

function integrityLabel(key) {
    return {
        tradeCount: "Trades",
        netR: "Net R",
        obCount: "OB Count",
        requiredFiles: "Files",
        candles: "Candles",
        parity: "Parity",
    }[key] || key;
}

function integrityDetail(key, check) {
    if (key === "tradeCount") return `summary ${check.summary ?? "N/A"} · parsed ${check.parsed}`;
    if (key === "netR") return `summary ${check.summary ?? "N/A"} · computed ${check.computed}`;
    if (key === "obCount") return `summary ${check.summary ?? "N/A"} · parsed ${check.parsed}`;
    if (key === "requiredFiles") return check.missing?.length ? `missing ${check.missing.join(", ")}` : check.status;
    if (key === "candles") return check.droppedForStorage ? "dropped from storage" : "not imported";
    if (key === "parity") return check.available ? String(check.value) : "unavailable";
    return check.status;
}
