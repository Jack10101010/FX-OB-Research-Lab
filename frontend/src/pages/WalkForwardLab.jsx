import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Segment, NeonButton } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { CalendarRange, Hash, Target, TrendingUp, AlertTriangle, Activity, ShieldCheck } from "lucide-react";
import {
    ComposedChart, Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─────────────────────────── helpers ───────────────────────────
const isNum = (v) => Number.isFinite(Number(v));
const num = (v, d = 0) => (isNum(v) ? Number(v) : d);
const fmt = (v, digits = 1) => (isNum(v) ? Number(v).toFixed(digits) : "—");
const signed = (v, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}R`;

// Best-effort start-date parse for ordering folds chronologically.
// Returns a timestamp (ms) or null when the range string can't be parsed.
function parseStartDate(range) {
    if (!range || typeof range !== "string") return null;
    const first = range.split(/→|->|—|–|\bto\b/i)[0].trim();
    const iso = first.match(/\d{4}-\d{2}-\d{2}/);
    const t = Date.parse(iso ? iso[0] : first);
    return Number.isFinite(t) ? t : null;
}

const CHART_TICK = { fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 };
const TOOLTIP_STYLE = { background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 };

const DRIFT_OPTS = [
    { value: "rr", label: "RR",          key: "rr" },
    { value: "sb", label: "Stop Buffer", key: "stopBuffer" },
    { value: "vt", label: "Verify Ticks", key: "verifyTicks" },
];

export default function WalkForwardLab() {
    const { RUNS } = useDataset();
    const [driftParam, setDriftParam] = useState("rr");

    // Imported runs only — mock runs are excluded as folds. Ordered by date range when available.
    const folds = useMemo(() => {
        const imported = (RUNS || []).filter((r) => r._source === "imported");
        return imported
            .map((r, idx) => ({ r, idx, t: parseStartDate(r.dateRange) }))
            .sort((a, b) => {
                if (a.t != null && b.t != null) return a.t - b.t;
                if (a.t != null) return -1;
                if (b.t != null) return 1;
                return a.idx - b.idx;
            })
            .map((x) => x.r);
    }, [RUNS]);

    const browseAction = <Link to="/runs"><NeonButton tone="primary">Browse Runs</NeonButton></Link>;

    // ─────────────── Limited-data state ───────────────
    if (folds.length < 2) {
        return (
            <div className="pb-12">
                <LabRunHero
                    pageLabel="Walk-Forward Lab"
                    title="Walk-Forward Robustness"
                    description="Evaluate whether strategy parameters hold up across time using imported runs as sequential out-of-sample folds."
                    actions={browseAction}
                />
                <div className="px-6">
                    <NeonPanel title="Limited Data">
                        <div className="flex flex-col items-center text-center gap-3 py-10">
                            <CalendarRange className="w-8 h-8 text-[hsl(var(--accent-secondary))]" />
                            <div className="font-display text-[18px] text-white">Not enough folds yet</div>
                            <p className="text-[13px] text-muted-lab max-w-md">
                                Import multiple dated runs/folds to evaluate walk-forward robustness.
                            </p>
                            <div className="text-[11px] font-ui text-muted-lab">
                                {folds.length} imported run{folds.length === 1 ? "" : "s"} found · need at least 2
                            </div>
                            <Link to="/runs"><NeonButton tone="primary">Browse &amp; Import Runs</NeonButton></Link>
                        </div>
                    </NeonPanel>
                </div>
            </div>
        );
    }

    // ─────────────── Stats (all numbers guarded) ───────────────
    const netRs = folds.map((f) => num(f.netR));
    const count = folds.length;
    const profitable = netRs.filter((v) => v > 0).length;
    const pct = (profitable / count) * 100;
    const mean = netRs.reduce((a, b) => a + b, 0) / count;
    const worst = Math.min(...netRs);
    const best = Math.max(...netRs);
    const worstFold = folds[netRs.indexOf(worst)];
    const bestFold = folds[netRs.indexOf(best)];
    const variance = netRs.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
    const stdev = Math.sqrt(variance);
    const worstNotDeep = worst >= -Math.abs(mean); // worst loss not larger than the mean gain

    // ─────────────── Robustness verdict ───────────────
    let vFull, vShort, vSub, vTone, vGrad, vColor, vText;
    if (pct >= 70 && mean > 0 && worstNotDeep) {
        vFull = "Robust"; vShort = "Robust"; vSub = "Generalizes well"; vTone = "success";
        vGrad = "from-[hsl(var(--accent-primary))] via-[hsl(var(--accent-glow))] to-[hsl(var(--accent-secondary))]";
        vColor = "text-[hsl(var(--accent-primary))] text-glow-primary";
        vText = "At least 70% of OOS folds are profitable with a positive mean Net R and no deep worst-fold loss. Parameters look stable out-of-sample.";
    } else if (mean > 0) {
        vFull = "Marginal"; vShort = "Marginal"; vSub = "Inconsistent OOS"; vTone = "warning";
        vGrad = "from-[hsl(var(--warning)/0.7)] via-[hsl(var(--border-mid))] to-[hsl(var(--border-mid))]";
        vColor = "text-[hsl(var(--warning))]";
        vText = "Mean OOS Net R is positive, but folds are inconsistent — under 70% profitable, a deep worst fold, or high Net R dispersion. Promising but not yet trustworthy.";
    } else {
        vFull = "Fragile / Overfit Risk"; vShort = "Fragile"; vSub = "Overfit risk"; vTone = "danger";
        vGrad = "from-[hsl(var(--danger)/0.7)] via-[hsl(var(--border-mid))] to-[hsl(var(--border-mid))]";
        vColor = "text-[hsl(var(--danger))]";
        vText = "Mean OOS Net R across folds is not positive. High overfit risk — the parameters do not appear to generalize across time.";
    }

    // ─────────────── Chart data ───────────────
    let cum = 0;
    const resultData = folds.map((f, i) => {
        const nr = num(f.netR);
        cum += nr;
        return { fold: `F${i + 1}`, netR: Number(nr.toFixed(2)), cum: Number(cum.toFixed(2)) };
    });

    const driftOpt = DRIFT_OPTS.find((o) => o.value === driftParam) || DRIFT_OPTS[0];
    const driftData = folds.map((f, i) => ({
        fold: `F${i + 1}`,
        value: isNum(f[driftOpt.key]) ? Number(f[driftOpt.key]) : null,
    }));

    const spark = resultData.map((d) => d.cum);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Walk-Forward Lab"
                title="Walk-Forward Robustness"
                description={`${count} imported runs treated as sequential OOS folds — ordered by date range where available.`}
                actions={browseAction}
            />

            {/* Scope disclaimer — Walk-Forward operates at the run/fold level:
                each fold is a whole imported run using its primary variant. It
                is NOT governed by the active Strategy Map universe selection. */}
            <div className="px-6 mb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-1.5 text-[11px]">
                    <span className="font-ui uppercase tracking-wider text-muted-lab">Scope</span>
                    <Pill tone="muted">Run-level folds</Pill>
                    <span className="text-[hsl(var(--text-2))]">Folds use each run's primary variant — not governed by the active Trade Universe.</span>
                </div>
            </div>

            {/* KPI row */}
            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Fold Count"      value={String(count)}                sub="OOS folds"                       tone="muted"                          icon={Hash} />
                <MetricChip label="Profitable OOS"  value={`${pct.toFixed(0)}%`}         sub={`${profitable}/${count} folds > 0`} tone={pct >= 70 ? "success" : "warning"} icon={Target} />
                <MetricChip label="Mean OOS Net R"  value={signed(mean)}                 sub="per fold"                        tone={mean >= 0 ? "primary" : "danger"} icon={TrendingUp} sparkline={spark} />
                <MetricChip label="Worst Fold"      value={signed(worst)}                sub={worstFold?.id || "—"}            tone="danger"                         icon={AlertTriangle} />
                <MetricChip label="OOS Consistency" value={`±${stdev.toFixed(1)}R`}      sub="Net R σ"                         tone="secondary"                      icon={Activity} />
                <MetricChip label="Robustness"      value={vShort}                       sub={vSub}                            tone={vTone}                          icon={ShieldCheck} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* OOS result chart */}
                <NeonPanel className="xl:col-span-2" title="OOS Net R per Fold" action={<Pill tone="primary">+ CUMULATIVE</Pill>}>
                    <div data-testid="wf-result-chart" style={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                            <ComposedChart data={resultData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="fold" tick={CHART_TICK} />
                                <YAxis tick={CHART_TICK} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Bar dataKey="netR" radius={[2, 2, 0, 0]} name="Fold Net R">
                                    {resultData.map((d, i) => (
                                        <Cell key={i} fill={d.netR >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.7)"} />
                                    ))}
                                </Bar>
                                <Line type="monotone" dataKey="cum" stroke="hsl(var(--accent-secondary))" strokeWidth={2} dot={{ fill: "hsl(var(--accent-secondary))", r: 3 }} isAnimationActive={false} name="Cumulative" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                {/* Robustness verdict card */}
                <div data-testid="wf-verdict" className={`relative clip-bevel p-[1px] bg-gradient-to-br ${vGrad}`}>
                    <div className="clip-bevel bg-[hsl(var(--panel))] p-4 relative overflow-hidden h-full">
                        <div className="absolute -top-8 -right-8 w-32 h-32 bg-[hsl(var(--accent-primary)/0.12)] rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[hsl(var(--accent-secondary))]" />
                            <span className="text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab">Robustness Verdict</span>
                        </div>
                        <div className={`mt-2 font-display text-[30px] leading-none font-semibold ${vColor}`}>{vFull}</div>
                        <p className="text-[11.5px] text-[hsl(var(--text-2))] mt-3 leading-relaxed">{vText}</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-ui text-[11.5px] mt-3">
                            <VStat k="Folds"      v={String(count)} />
                            <VStat k="Profitable" v={`${pct.toFixed(0)}%`} />
                            <VStat k="Mean Net R" v={signed(mean)} />
                            <VStat k="Net R σ"    v={`${stdev.toFixed(1)}R`} />
                            <VStat k="Worst Fold" v={signed(worst)} />
                            <VStat k="Best Fold"  v={signed(best)} />
                        </div>
                    </div>
                </div>

                {/* Parameter drift chart */}
                <NeonPanel
                    className="xl:col-span-3"
                    title="Parameter Drift Across Folds"
                    action={<Segment testId="wf-drift-tabs" options={DRIFT_OPTS.map((o) => ({ value: o.value, label: o.label }))} value={driftParam} onChange={setDriftParam} />}
                >
                    <div data-testid="wf-drift-chart" style={{ width: "100%", height: 220 }}>
                        <ResponsiveContainer>
                            <LineChart data={driftData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="fold" tick={CHART_TICK} />
                                <YAxis tick={CHART_TICK} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Line type="monotone" dataKey="value" stroke="hsl(var(--accent-primary))" strokeWidth={2} dot={{ fill: "hsl(var(--accent-primary))", r: 3 }} connectNulls isAnimationActive={false} name={driftOpt.label} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>
            </div>

            {/* Fold table */}
            <div className="px-6 mt-4">
                <NeonPanel dense title="Walk-Forward Folds">
                    <DataTable
                        testId="wf-fold-table"
                        columns={[
                            { key: "_fold",       label: "Fold",      render: (r) => <span className="font-code text-muted-lab">F{folds.indexOf(r) + 1}</span> },
                            { key: "id",          label: "Run ID",    render: (r) => (
                                <Link to={`/runs/${encodeURIComponent(r.id)}`} className="text-[hsl(var(--accent-primary))] hover:text-white">{r.id}</Link>
                            ) },
                            { key: "dateRange",   label: "Date Range", render: (r) => r.dateRange || "—" },
                            { key: "rr",          label: "RR",         align: "right", render: (r) => fmt(r.rr, 1) },
                            { key: "stopBuffer",  label: "Stop Buf",   align: "right", render: (r) => fmt(r.stopBuffer, 1) },
                            { key: "entryBuffer", label: "Entry Buf",  align: "right", render: (r) => fmt(r.entryBuffer, 1) },
                            { key: "verifyTicks", label: "Verify",     align: "right", render: (r) => (isNum(r.verifyTicks) ? String(Number(r.verifyTicks)) : "—") },
                            { key: "trades",      label: "Trades",     align: "right", render: (r) => (isNum(r.trades) ? String(Number(r.trades)) : "—") },
                            { key: "winRate",     label: "Win Rate",   align: "right", render: (r) => (isNum(r.winRate) ? `${Number(r.winRate).toFixed(1)}%` : "—") },
                            { key: "netR",        label: "Net R",      align: "right", render: (r) => <ColoredR value={num(r.netR)} /> },
                        ]}
                        rows={folds}
                        rowKey="id"
                        selectedKey={bestFold?.id}
                    />
                </NeonPanel>
            </div>
        </div>
    );
}

function VStat({ k, v }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-muted-lab text-[10px] uppercase tracking-wider">{k}</span>
            <span className="text-white">{v}</span>
        </div>
    );
}
