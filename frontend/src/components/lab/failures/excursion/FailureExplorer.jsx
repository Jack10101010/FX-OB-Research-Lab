// ── FailureExplorer.jsx ──────────────────────────────────────────────────────
// Controlled failure-exploration surface over the shared aggregation engine
// (failuresAggregation.js via excursionAnalytics.buildExplorer). Pick 1–2
// dimensions + a ranking metric + a sample floor; capped at two dimensions (no
// N-way / waterfall mining).
//
// ISOLATION / FUTURE TAB (V4 Phase 2, Phase G): this component is fully prop-driven
// (allTrades / allLosers / bucket) and reaches into NO parent internals. To promote
// it into a dedicated "Failure Explorer" tab later, render it with allTrades +
// allLosers and bucket={null}; the analytics stay in the shared modules untouched.
//
// SCOPE: the user analyses one of three populations —
//   • All trades  — winners + losers (loss-rate & lift are genuine population stats)
//   • All losers  — every losing trade in the cohort
//   • Selected bucket — the losers inside the clicked raw-R bucket ("what caused THIS
//     bucket?"). Buckets are a loser-only concept, so loss rate is 100% by definition
//     in the two loser scopes; lift / contribution / trade-share carry the signal.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { TermTip } from "@/components/lab/TermTip";
import { buildExplorer, EXPLORER_METRICS, EXPLORER_FLOORS } from "../shared/excursionAnalytics";

// Lift = loss-R share ÷ trade share. >1 ⇒ disproportionate (a real driver).
// Shared by the Explorer, the driver / pair tables, and the MFE-by-dimension panels.
export function LiftCell({ lift }) {
    const color = lift >= 1.5 ? "hsl(var(--danger))"
        : lift >= 1.15 ? "hsl(var(--warning))"
        : "hsl(var(--text-2))";
    return <span className="w-12 text-right font-num tabular-nums" style={{ color, fontWeight: lift >= 1.15 ? 600 : 400 }}>{lift}×</span>;
}

function ExplorerSelect({ label, value, onChange, options, includeNone = false }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] text-[hsl(var(--text))] text-[11.5px] font-ui rounded px-2 py-1.5 clip-bevel-sm focus:outline-none focus:border-[hsl(var(--accent-primary)/0.6)]"
            >
                {includeNone && <option value="">None</option>}
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
        </label>
    );
}

function ScopeButton({ active, onClick, children }) {
    return (
        <button type="button" onClick={onClick}
            className={cn(
                "px-2.5 py-1 text-[11px] font-ui clip-bevel-sm border transition-colors",
                active ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]",
            )}>
            {children}
        </button>
    );
}

function Stat({ label, value, tone }) {
    return (
        <div className="flex flex-col">
            <span className="text-[9px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">{label}</span>
            <span className={cn("text-[13px] font-num tabular-nums", tone || "text-[hsl(var(--text))]")}>{value}</span>
        </div>
    );
}

export function FailureExplorer({ allTrades = [], allLosers = [], bucket = null }) {
    const [scope, setScope] = useState("bucket"); // bucket | alllosers | alltrades
    const [dimA, setDimA] = useState("session");
    const [dimB, setDimB] = useState("");
    const [metric, setMetric] = useState("lift");
    const [floor, setFloor] = useState(8);

    // Effective scope: "bucket" only applies when a bucket is selected.
    const effScope = (scope === "bucket" && !bucket) ? "alltrades" : scope;
    const losersScope = effScope !== "alltrades"; // loser-only population (loss rate trivially 100%)

    const population = useMemo(() => {
        if (effScope === "bucket") return bucket?.losers ?? [];
        if (effScope === "alllosers") return allLosers;
        return allTrades;
    }, [effScope, bucket, allLosers, allTrades]);

    const exp = useMemo(
        () => buildExplorer(population, { dimA, dimB: dimB || null, sampleFloor: floor, metric }),
        [population, dimA, dimB, floor, metric],
    );

    if (!exp.available.length && !bucket) {
        return (
            <NeonPanel title="Failure Explorer" action={<Pill tone="muted">controlled · max 2 dimensions</Pill>}>
                <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No categorical dimensions are available in this run to explore.</div>
            </NeonPanel>
        );
    }

    const dimBOpts = exp.available.filter((d) => d.key !== exp.dimA);
    const hasB = !!exp.dimB;
    const aLabel = exp.available.find((d) => d.key === exp.dimA)?.label ?? "Value A";
    const bLabel = exp.available.find((d) => d.key === exp.dimB)?.label ?? "Value B";

    // "Analyzing" headline for the current scope.
    const analyzing = effScope === "bucket"
        ? { title: `${bucket.label} losers`, trades: bucket.trades, lossR: bucket.lossR, share: bucket.contributionPct }
        : effScope === "alllosers"
            ? { title: "All losers", trades: exp.totals.trades, lossR: exp.totals.lossR, share: 100 }
            : { title: "All trades (winners + losers)", trades: exp.totals.trades, lossR: exp.totals.lossR, share: null };

    return (
        <NeonPanel title="Failure Explorer" action={<Pill tone="muted">controlled · max 2 dimensions</Pill>}>
            <div className="p-3 space-y-3">
                {/* ── Zone 1: scope + "Analyzing" header ─────────────────────── */}
                <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))] mr-1">Analyzing</span>
                        {bucket && <ScopeButton active={effScope === "bucket"} onClick={() => setScope("bucket")}>Selected bucket: {bucket.label}</ScopeButton>}
                        <ScopeButton active={effScope === "alllosers"} onClick={() => setScope("alllosers")}>All losers</ScopeButton>
                        <ScopeButton active={effScope === "alltrades"} onClick={() => setScope("alltrades")}>All trades</ScopeButton>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                        <Stat label="Cohort" value={analyzing.title} />
                        <Stat label="Trades" value={analyzing.trades} tone="text-white" />
                        <Stat label="Loss-R" value={`${analyzing.lossR}R`} tone="text-[hsl(var(--danger))]" />
                        {analyzing.share != null && <Stat label="% of total loss-R" value={`${analyzing.share}%`} tone="text-[hsl(var(--accent-secondary))]" />}
                    </div>
                </div>

                {/* ── Zone 2: controls ───────────────────────────────────────── */}
                <div className="flex flex-wrap items-end gap-3 border-b border-[hsl(var(--border-soft)/0.6)] pb-3">
                    <ExplorerSelect label="Dimension A" value={exp.dimA ?? ""} onChange={setDimA} options={exp.available} />
                    <ExplorerSelect label="Dimension B" value={exp.dimB ?? ""} onChange={setDimB} options={dimBOpts} includeNone />
                    <ExplorerSelect label="Rank by" value={metric} onChange={setMetric} options={EXPLORER_METRICS} />
                    <div className="flex flex-col gap-1">
                        <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">Sample floor</span>
                        <div className="flex items-center gap-1">
                            {EXPLORER_FLOORS.map((f) => (
                                <button key={f} type="button" onClick={() => setFloor(f)}
                                    className={cn("px-2 py-1.5 text-[11px] font-num tabular-nums clip-bevel-sm border transition-colors",
                                        f === floor
                                            ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                                            : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]")}>
                                    ≥{f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* explainer */}
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    {losersScope
                        ? <>Losing trades only — loss rate is 100% by definition here, so read <TermTip termKey="lift">lift</TermTip> and contribution.</>
                        : <>Across all trades (winners + losers), so trade share and loss rate are real.</>}
                    {" "}<TermTip termKey="lift">Lift</TermTip> = loss-R share ÷ trade share. Example: 20% of trades but 40% of loss-R → 2.0×.
                    {" "}Low-sample rows (under the floor) are greyed and are not strong findings.
                </p>

                {/* ── Zone 3: results ────────────────────────────────────────── */}
                {exp.rows.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11.5px] font-ui border-collapse">
                            <thead>
                                <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                                    <th className="text-left font-medium py-1.5 pr-2">{aLabel}</th>
                                    {hasB && <th className="text-left font-medium py-1.5 pr-2">{bLabel}</th>}
                                    <th className="text-right font-medium py-1.5 px-2">Trades</th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="contribution_pct">Contrib</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2">Trade %</th>
                                    <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="lift">Lift</TermTip></th>
                                    <th className="text-right font-medium py-1.5 px-2">Loss rate</th>
                                    <th className="text-right font-medium py-1.5 px-2">Avg loss</th>
                                    <th className="text-right font-medium py-1.5 pl-2">Sample</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exp.rows.map((c) => (
                                    <tr key={hasB ? `${c.keyA}·${c.keyB}` : c.keyA}
                                        className={cn("border-b border-[hsl(var(--border-soft)/0.5)]", c.lowSample && "opacity-50")}>
                                        <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[160px]">{c.keyA}</td>
                                        {hasB && <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[140px]">{c.keyB}</td>}
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-white">{c.count}</td>
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.lossR}R</td>
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text))]">{c.contributionPct}%</td>
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.tradeSharePct}%</td>
                                        <td className="text-right py-1.5 px-2"><LiftCell lift={c.lift} /></td>
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.lossRate}%</td>
                                        <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{c.avgLossR}R</td>
                                        <td className="text-right py-1.5 pl-2">{c.lowSample ? <Pill tone="warning">low n</Pill> : <Pill tone="muted">ok</Pill>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No cells for this selection.</div>
                )}
            </div>
        </NeonPanel>
    );
}
