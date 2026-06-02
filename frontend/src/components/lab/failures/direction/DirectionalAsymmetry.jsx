// ── DirectionalAsymmetry.jsx ─────────────────────────────────────────────────
// Phase 1/3: Long vs short failure metrics, CVaR tail risk, asymmetry warning + diverging bar.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { AlertTriangle } from "lucide-react";
import { computeDirectionalStats } from "../shared/failuresAnalytics";
import { DirectionDivergingBar } from "./DirectionDivergingBar";
import { archetypeLabel } from "../shared/failuresRegistry";
import { safeLabel, safeTone } from "../shared/failuresFormatters";

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, sub, danger = false, warning = false }) {
    const cls = danger ? "text-[hsl(var(--danger))]" : warning ? "text-[hsl(var(--warning))]" : "text-white";
    return (
        <div>
            <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">{label}</div>
            <div className={`font-display text-[18px] font-semibold tabular-nums mt-0.5 ${cls}`}>{value}</div>
            {sub && <div className="text-[9.5px] font-ui text-muted-lab mt-0.5">{sub}</div>}
        </div>
    );
}

function DirCard({ label, stat, accentClass }) {
    if (!stat) {
        return (
            <NeonPanel title={label}>
                <div className="p-4 text-[10.5px] font-ui text-muted-lab">No {label.toLowerCase()} trades in dataset</div>
            </NeonPanel>
        );
    }

    const confTone = safeTone(stat.sampleConfidence, safeLabel(stat.sampleConfidence) === "ROBUST" ? "success"
        : safeLabel(stat.sampleConfidence) === "INSUFFICIENT" ? "danger"
        : "warning");

    return (
        <NeonPanel title={label} action={
            <span className={`text-[10px] font-num ${accentClass}`}>{stat.lossRate}% loss rate</span>
        }>
            <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Stat label="Losses" value={stat.lossCount} sub={`of ${stat.count} trades`} danger />
                    <Stat label="Avg Loss R" value={stat.avgLossR != null ? `${stat.avgLossR}R` : "—"} danger />
                    <Stat label="CVaR (10%)" value={stat.cvar != null ? `${stat.cvar}R` : "—"} sub="avg worst-10%" danger />
                    <Stat label="Expectancy" value={`${stat.expectancy}R`} sub="per trade"
                        danger={stat.expectancy < 0} warning={stat.expectancy >= 0 && stat.expectancy < 0.2} />
                </div>

                <div className="space-y-1.5">
                    <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Top Archetype</div>
                    <Pill tone="muted">{archetypeLabel(stat.topArchetype)}</Pill>
                </div>

                <div className="space-y-1.5">
                    <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Worst 5 Losses</div>
                    <div className="flex flex-wrap gap-1">
                        {stat.worst5.length ? stat.worst5.map((r, i) => (
                            <span key={i} className="text-[10px] font-num text-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.08)] border border-[hsl(var(--danger)/0.3)] px-1.5 py-0.5 clip-bevel-sm">
                                {r.toFixed(1)}R
                            </span>
                        )) : <span className="text-muted-lab text-[10px] font-ui">—</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Pill tone={confTone}>{safeLabel(stat.sampleConfidence)}</Pill>
                    <span className="text-[9.5px] font-ui text-muted-lab">n={stat.count}</span>
                </div>
            </div>
        </NeonPanel>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function DirectionalAsymmetry({ losers = [], allLosers = [], allTrades = [], config = {} }) {
    const dirStats = useMemo(() => computeDirectionalStats(allTrades), [allTrades]);
    const { long: l, short: s } = dirStats;

    const asymmetry = l?.lossRate != null && s?.lossRate != null
        ? Math.abs(l.lossRate - s.lossRate)
        : null;
    const worseDir = asymmetry != null ? (l.lossRate > s.lossRate ? "Long" : "Short") : null;

    if (!allTrades.length) return null;

    return (
        <div className="p-6 space-y-4">
            {/* Asymmetry warning */}
            {asymmetry != null && asymmetry > 8 && (
                <div className="border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.05)] clip-bevel p-3 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    <div>
                        <span className="text-[hsl(var(--warning))] font-ui text-[11px] font-semibold">
                            {worseDir} trades are {asymmetry.toFixed(0)}pp worse
                        </span>
                        <span className="text-[hsl(var(--text-2))] font-ui text-[10.5px]">
                            {" "}than the opposite direction — material directional asymmetry detected.
                        </span>
                    </div>
                </div>
            )}

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DirCard label="Long" stat={l} accentClass="text-[hsl(var(--success))]" />
                <DirCard label="Short" stat={s} accentClass="text-[hsl(var(--danger))]" />
            </div>

            {/* Comparison strip */}
            {l && s && (
                <NeonPanel title="Side-by-Side Comparison" dense>
                    <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center divide-x divide-[hsl(var(--border-soft))]">
                        {[
                            { metric: "Loss Rate",  longV: `${l.lossRate}%`,  shortV: `${s.lossRate}%` },
                            { metric: "Avg Loss R", longV: `${l.avgLossR}R`,  shortV: `${s.avgLossR}R` },
                            { metric: "CVaR",       longV: l.cvar != null ? `${l.cvar}R` : "—", shortV: s.cvar != null ? `${s.cvar}R` : "—" },
                            { metric: "Expectancy", longV: `${l.expectancy}R`, shortV: `${s.expectancy}R` },
                        ].map(({ metric, longV, shortV }) => (
                            <div key={metric} className="px-2">
                                <div className="text-[9px] font-ui uppercase tracking-wider text-muted-lab mb-1">{metric}</div>
                                <div className="text-[10.5px] font-num text-[hsl(var(--success))]">{longV}</div>
                                <div className="text-[9px] font-ui text-muted-lab my-0.5">vs</div>
                                <div className="text-[10.5px] font-num text-[hsl(var(--danger))]">{shortV}</div>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            )}

            {/* ── Diverging bar chart ────────────────────────────────────────── */}
            <DirectionDivergingBar allTrades={allTrades} />
        </div>
    );
}
