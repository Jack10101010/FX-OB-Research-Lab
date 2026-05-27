import React, { useState } from "react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { Field, NeonInput, NeonToggle, NeonButton, Segment } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { Activity, TrendingDown, AlertTriangle, ShieldCheck, Dices, Play } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, Line, LineChart, ComposedChart } from "recharts";

export default function MonteCarlo() {
    const { MC_DRAWDOWN_DIST, MC_EQUITY_BANDS } = useDataset();
    const [sims, setSims] = useState(1000);
    const [randTrade, setRandTrade] = useState(true);
    const [randSpread, setRandSpread] = useState(true);
    const [randSlip, setRandSlip] = useState(false);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Monte Carlo"
                title="Robustness Simulation"
                description="Stress-test the validated run by randomising trade order, spread, and slippage. Placeholder mock until engine integration."
                actions={<NeonButton icon={Play} tone="primary">Run Simulation</NeonButton>}
            />

            <div className="px-6 mb-4">
                <div className="flex items-center gap-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                        Visualization preview · simulator not yet wired
                    </span>
                    <span className="text-[11px] font-mono text-[hsl(var(--text-2))] hidden md:inline">
                        — controls render UI state only; values shown are mock outputs.
                    </span>
                </div>
            </div>

            <div className="px-6 grid grid-cols-2 md:grid-cols-5 gap-3">
                <MetricChip label="Median Net R"      value="+31.4R"  sub="50th percentile" tone="primary"   icon={Activity} />
                <MetricChip label="5th Percentile"    value="+8.2R"   sub="Pessimistic"     tone="warning"   icon={TrendingDown} />
                <MetricChip label="Worst Drawdown"    value="-18.4R"  sub="Sim worst"       tone="danger"    icon={AlertTriangle} />
                <MetricChip label="Ruin Risk"         value="0.8%"    sub="P(ruin)"         tone="secondary" icon={Dices} />
                <MetricChip label="Robustness Score"  value="86 / 100" sub="Stability"      tone="success"   icon={ShieldCheck} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel title="Simulation Controls">
                    <Field label="Simulation Count">
                        <NeonInput type="number" min="100" max="10000" step="100" value={sims} onChange={(e) => setSims(Number(e.target.value))} />
                    </Field>
                    <div className="space-y-2 mt-3">
                        <Row label="Randomize Trade Order"      checked={randTrade}  onChange={setRandTrade} />
                        <Row label="Randomize Spread"           checked={randSpread} onChange={setRandSpread} />
                        <Row label="Randomize Slippage"         checked={randSlip}   onChange={setRandSlip} />
                    </div>
                    <div className="divider-glow my-3" />
                    <div className="text-[10.5px] font-mono uppercase tracking-wider text-muted-lab">Placeholder</div>
                    <div className="text-[11.5px] text-[hsl(var(--text-2))] mt-1 leading-relaxed">
                        Once the Python engine is wired, this panel will dispatch parameterised re-runs and stream percentile bands back to the chart panels.
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Drawdown Distribution">
                    <div style={{ width: "100%", height: 240 }}>
                        <ResponsiveContainer>
                            <BarChart data={MC_DRAWDOWN_DIST} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="dd" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                    {MC_DRAWDOWN_DIST.map((d, i) => <Cell key={i} fill={d.dd < -15 ? "hsl(var(--danger))" : d.dd < -8 ? "hsl(var(--warning))" : "hsl(var(--accent-primary))"} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Equity Confidence Bands">
                    <div style={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                            <ComposedChart data={MC_EQUITY_BANDS} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="mc-band" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--accent-primary))" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="hsl(var(--accent-primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Area type="monotone" dataKey="high" stroke="none" fill="url(#mc-band)" isAnimationActive={false} />
                                <Area type="monotone" dataKey="low"  stroke="none" fill="hsl(var(--panel))" isAnimationActive={false} />
                                <Line type="monotone" dataKey="mid"  stroke="hsl(var(--accent-primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="worst" stroke="hsl(var(--danger))" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="high"  stroke="hsl(var(--accent-secondary))" strokeWidth={1} dot={false} isAnimationActive={false} />
                                <Line type="monotone" dataKey="low"   stroke="hsl(var(--accent-secondary))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex items-center gap-4 font-mono text-[10.5px]">
                        <Legend dot="hsl(var(--accent-primary))"  label="Median outcome" />
                        <Legend dot="hsl(var(--accent-secondary))" label="5th / 95th percentile" />
                        <Legend dot="hsl(var(--danger))"           label="Worst-case path" />
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Row({ label, checked, onChange }) {
    return (
        <div className="flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2">
            <span className="text-[11.5px] font-mono uppercase tracking-wider text-[hsl(var(--text-2))]">{label}</span>
            <NeonToggle checked={checked} onChange={onChange} />
        </div>
    );
}
function Legend({ dot, label }) {
    return <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: dot }} /><span className="text-muted-lab">{label}</span></span>;
}
