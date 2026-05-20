import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonSelect, NeonButton } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { computeProfitFactor, computeMaxDrawdown } from "@/lib/metrics";
import { Plus, X, Trophy, Crown } from "lucide-react";
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const PALETTE = [
    { line: "hsl(var(--accent-primary))",   tone: "primary",   short: "A" },
    { line: "hsl(var(--accent-secondary))", tone: "secondary", short: "B" },
    { line: "hsl(var(--accent-glow))",      tone: "primary",   short: "C" },
    { line: "hsl(var(--warning))",          tone: "warning",   short: "D" },
    { line: "hsl(var(--success))",          tone: "success",   short: "E" },
];

export default function ComparisonLab() {
    const { RUNS, EQUITY_CURVE, MONTHLY, TRADES, ACTIVE_RUN, getRunData } = useDataset();
    const [ids, setIds] = useState(() => RUNS.slice(0, 2).map((r) => r.id));

    const setAt = (idx, v) => setIds((prev) => prev.map((x, i) => (i === idx ? v : x)));
    const addRun = () => {
        if (ids.length >= 5) return;
        const used = new Set(ids);
        const next = RUNS.find((r) => !used.has(r.id)) || RUNS[0];
        setIds((p) => [...p, next.id]);
    };
    const removeAt = (idx) => {
        if (ids.length <= 2) return;
        setIds((p) => p.filter((_, i) => i !== idx));
    };

    const runs = ids.map((id) => RUNS.find((r) => r.id === id)).filter(Boolean);
    const baseline = runs[0];

    // Per-run real metrics: prefer imported bundle data; fall back to active-run mock for the active id.
    const realPF_active = computeProfitFactor(TRADES);
    const realDD_active = computeMaxDrawdown(EQUITY_CURVE);
    const runMetrics = (r) => {
        if (!r) return { pf: null, maxDd: null };
        const bundle = getRunData(r.id);
        if (bundle?.trades?.length && bundle?.equityCurve?.length) {
            return { pf: computeProfitFactor(bundle.trades), maxDd: computeMaxDrawdown(bundle.equityCurve) };
        }
        // Fallback: only the active mock run has full data
        if (r.id === ACTIVE_RUN.id) return { pf: realPF_active, maxDd: realDD_active };
        return { pf: null, maxDd: null };
    };

    // Synthesize per-run equity by using imported curve when available, else scaled baseline.
    const equityMerged = EQUITY_CURVE.map((p, idx) => {
        const row = { label: p.label, i: p.i };
        runs.forEach((r, i) => {
            const bundle = getRunData(r.id);
            if (bundle?.equityCurve?.length) {
                const e = bundle.equityCurve[Math.min(idx, bundle.equityCurve.length - 1)];
                row[`r${i}`] = e ? e.netR : null;
            } else {
                row[`r${i}`] = Number((p.netR * (r.netR / (baseline?.netR || 1))).toFixed(2));
            }
        });
        return row;
    });

    // Synthesize monthly per-run
    const monthlyMerged = MONTHLY.map((m) => {
        const row = { m: m.m };
        runs.forEach((r, idx) => { row[`r${idx}`] = Number((m.v * (r.netR / (baseline?.netR || 1))).toFixed(2)); });
        return row;
    });

    // Drawdown placeholder per run (mock)
    const ddMerged = Array.from({ length: 40 }).map((_, i) => {
        const row = { i };
        runs.forEach((r, idx) => {
            row[`r${idx}`] = -1.5 - Math.abs(Math.sin(i / 5 + idx)) * (3 + Math.abs(r.netR) * 0.06);
        });
        return row;
    });

    // KPI matrix rows
    const KPI_DEFS = [
        { key: "netR",          label: "Net R",            fmt: (v) => `${v >= 0 ? "+" : ""}${v}R`,         delta: (v, base) => `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}R`,  posIfGreater: true },
        { key: "winRate",       label: "Win Rate",         fmt: (v) => `${v.toFixed(1)}%`,                  delta: (v, base) => `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}%`, posIfGreater: true },
        { key: "trades",        label: "Trades",           fmt: (v) => String(v),                            delta: (v, base) => `${v - base >= 0 ? "+" : ""}${v - base}`,             posIfGreater: null },
        { key: "_pf",           label: "Profit Factor",    posIfGreater: true,    compute: true },
        { key: "_dd",           label: "Max Drawdown",     posIfGreater: true,    compute: true },
        { key: "reverseCancels",label: "Reverse Cancels",  fmt: (v) => String(v ?? 2),                       delta: (v, base) => `${(v ?? 2) - (base ?? 2) >= 0 ? "+" : ""}${(v ?? 2) - (base ?? 2)}`, posIfGreater: false },
        { key: "validation",    label: "Validation",       fmt: (v) => `${v.toFixed(1)}%`,                  delta: (v, base) => `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(1)}%`, posIfGreater: true },
    ];

    const winnerIdx = runs.reduce((best, r, i, all) => (r.netR > all[best].netR ? i : best), 0);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="COMPARISON LAB"
                title="Multi-Run Comparison"
                subtitle={`Comparing ${runs.length} run${runs.length === 1 ? "" : "s"} — Run A is the baseline.`}
                actions={
                    <>
                        <Link to="/runs"><NeonButton tone="ghost">Browse Runs</NeonButton></Link>
                        <NeonButton icon={Plus} tone="primary" onClick={addRun} disabled={ids.length >= 5} data-testid="cmp-add-run">Add Run ({ids.length}/5)</NeonButton>
                    </>
                }
            />

            {/* Run selectors */}
            <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {ids.map((id, idx) => {
                    const p = PALETTE[idx % PALETTE.length];
                    const isWinner = idx === winnerIdx && runs.length > 1;
                    return (
                        <div key={idx} className={`relative clip-bevel p-[1px] ${isWinner ? "bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-glow))]" : "bg-[hsl(var(--border-mid))]"}`}>
                            <div className="clip-bevel bg-[hsl(var(--panel))] px-3 py-2.5">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="w-2.5 h-2.5" style={{ background: p.line, boxShadow: `0 0 8px ${p.line}` }} />
                                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">Run {p.short}{idx === 0 ? " · Baseline" : ""}</span>
                                    {isWinner && <Crown className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] ml-auto" />}
                                    {ids.length > 2 && (
                                        <button onClick={() => removeAt(idx)} data-testid={`cmp-remove-${idx}`} className="ml-auto text-muted-lab hover:text-[hsl(var(--danger))]">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <NeonSelect testId={`cmp-run-${idx}`} value={id} onChange={(v) => setAt(idx, v)} options={RUNS.map((r) => r.id)} className="w-full" />
                                <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
                                    <span className="text-[hsl(var(--text-2))]">{runs[idx]?.symbol} · {runs[idx]?.detectionTf}</span>
                                    <ColoredR value={runs[idx]?.netR || 0} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick KPI deltas */}
            <div className="px-6 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {runs.slice(1).map((r, idx) => {
                    const p = PALETTE[(idx + 1) % PALETTE.length];
                    const dNet = r.netR - baseline.netR;
                    return (
                        <MetricChip
                            key={idx}
                            label={`Δ Net R · ${p.short} − A`}
                            value={`${dNet >= 0 ? "+" : ""}${dNet.toFixed(1)}R`}
                            sub={`${r.id} vs ${baseline.id}`}
                            tone={dNet >= 0 ? "success" : "danger"}
                        />
                    );
                })}
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve Overlay (Net R)" action={<Legend runs={runs} />}>
                    <div style={{ width: "100%", height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={equityMerged} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <defs>
                                    {runs.map((_, idx) => (
                                        <linearGradient key={idx} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%"  stopColor={PALETTE[idx % PALETTE.length].line} stopOpacity={0.25} />
                                            <stop offset="100%" stopColor={PALETTE[idx % PALETTE.length].line} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} interval={Math.floor(equityMerged.length / 8)} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                {runs.map((_, idx) => (
                                    <Area key={idx} type="monotone" dataKey={`r${idx}`} stroke={PALETTE[idx % PALETTE.length].line} strokeWidth={1.6} fill={`url(#grad-${idx})`} dot={false} isAnimationActive={false} name={`Run ${PALETTE[idx % PALETTE.length].short}`} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel title="KPI Matrix" action={<Pill tone="primary">{runs.length} RUNS</Pill>}>
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full font-mono text-[11.5px]" data-testid="cmp-kpi-table">
                            <thead>
                                <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-lab">
                                    <th className="text-left py-2 pr-2">Metric</th>
                                    {runs.map((_, idx) => (
                                        <th key={idx} className="text-right py-2 px-2">{PALETTE[idx % PALETTE.length].short}</th>
                                    ))}
                                </tr>
                                <tr><td colSpan={runs.length + 1} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                            </thead>
                            <tbody>
                                {KPI_DEFS.map((def) => (
                                    <tr key={def.key} className="border-b border-[hsl(var(--border-soft)/0.4)]">
                                        <td className="text-muted-lab py-1.5 pr-2 uppercase text-[10px] tracking-wider">{def.label}</td>
                                        {runs.map((r, idx) => {
                                            const isBaseline = idx === 0;
                                            // Real-PF / Real-DD computed only when full data available
                                            if (def.compute) {
                                                const m = runMetrics(r);
                                                const bm = runMetrics(baseline);
                                                const v    = def.key === "_pf" ? m.pf  : m.maxDd;
                                                const base = def.key === "_pf" ? bm.pf : bm.maxDd;
                                                if (v == null) {
                                                    return (
                                                        <td key={idx} className="text-right py-1.5 px-2 text-muted-lab" title="Full trade history required to compute this metric">
                                                            <span className="italic text-[10.5px]">Limited Data</span>
                                                        </td>
                                                    );
                                                }
                                                const display = def.key === "_pf" ? v.toFixed(2) : `${v.toFixed(1)}R`;
                                                const tone = isBaseline || base == null
                                                    ? "text-white"
                                                    : (def.posIfGreater
                                                        ? (v > base ? "text-[hsl(var(--success))]" : v < base ? "text-[hsl(var(--danger))]" : "text-white")
                                                        : (v < base ? "text-[hsl(var(--success))]" : v > base ? "text-[hsl(var(--danger))]" : "text-white"));
                                                const dtxt = base != null ? `${v - base >= 0 ? "+" : ""}${(v - base).toFixed(2)}${def.key === "_dd" ? "R" : ""}` : "—";
                                                return (
                                                    <td key={idx} className={`text-right py-1.5 px-2 ${tone}`}>
                                                        {display}
                                                        {!isBaseline && base != null && (
                                                            <div className="text-[9.5px] text-muted-lab leading-none">{dtxt}</div>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            const v = r[def.key];
                                            const baseVal = baseline[def.key];
                                            const tone = isBaseline || def.posIfGreater == null
                                                ? "text-white"
                                                : (def.posIfGreater ? (v > baseVal ? "text-[hsl(var(--success))]" : v < baseVal ? "text-[hsl(var(--danger))]" : "text-white")
                                                                    : (v < baseVal ? "text-[hsl(var(--success))]" : v > baseVal ? "text-[hsl(var(--danger))]" : "text-white"));
                                            return (
                                                <td key={idx} className={`text-right py-1.5 px-2 ${tone}`}>
                                                    {def.fmt(v)}
                                                    {!isBaseline && (
                                                        <div className="text-[9.5px] text-muted-lab leading-none">{def.delta(v, baseVal)}</div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {runs.length > 1 && (
                        <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 border border-[hsl(var(--accent-primary)/0.5)] clip-bevel-sm bg-[hsl(var(--accent-primary)/0.07)]">
                            <Trophy className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]" />
                            <span className="text-[11px] font-mono uppercase tracking-wider text-white">Winner · Run {PALETTE[winnerIdx % PALETTE.length].short}</span>
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Monthly Performance">
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={monthlyMerged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                {runs.map((_, idx) => (
                                    <Bar key={idx} dataKey={`r${idx}`} fill={PALETTE[idx % PALETTE.length].line} radius={[2, 2, 0, 0]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <NeonPanel title="Drawdown Comparison (placeholder)">
                    <div style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <LineChart data={ddMerged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--danger)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                {runs.map((_, idx) => (
                                    <Line key={idx} type="monotone" dataKey={`r${idx}`} stroke={PALETTE[idx % PALETTE.length].line} strokeWidth={1.4} dot={false} isAnimationActive={false} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Legend({ runs }) {
    return (
        <div className="flex items-center gap-3 text-[10.5px] font-mono flex-wrap">
            {runs.map((r, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2" style={{ background: PALETTE[idx % PALETTE.length].line }} />
                    <span className="text-[hsl(var(--text-2))]">{PALETTE[idx % PALETTE.length].short}: {r.id}</span>
                </span>
            ))}
        </div>
    );
}
