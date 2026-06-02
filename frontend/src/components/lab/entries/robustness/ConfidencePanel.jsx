import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import { isFiniteNumber, num, fmtMaybePct } from "../analytics/entryFormatters";
import { sampleConfidence, LOW_SAMPLE_N, MODERATE_SAMPLE_N, ROBUST_SAMPLE_N } from "../analytics/entryRegistry";
import { robustnessLabel }   from "../analytics/robustnessAnalytics";

// ─── Sample Adequacy Bar ──────────────────────────────────────────────────────

function SampleAdequacyBar({ n }) {
    const conf  = sampleConfidence(n); // { label, tone }
    const pct   = Math.min(100, (n / ROBUST_SAMPLE_N) * 100);
    const tone  = conf.tone;
    const color = tone === "success"   ? "hsl(var(--success))"
                : tone === "secondary" ? "hsl(var(--accent-secondary))"
                : tone === "warning"   ? "hsl(var(--warning))"
                : "hsl(var(--danger))";

    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[10px] font-num tabular-nums w-8 text-right" style={{ color }}>
                {n}
            </span>
            <span className="text-[9px] font-ui uppercase tracking-wider w-16" style={{ color }}>
                {conf.label.toLowerCase()}
            </span>
        </div>
    );
}

// ─── Half-Split Consistency ───────────────────────────────────────────────────

function HalfSplitRow({ label, first, second, dim }) {
    const delta = isFiniteNumber(first) && isFiniteNumber(second) ? num(second) - num(first) : null;
    const consistent = delta != null && Math.abs(delta) < 0.15 * Math.abs(num(first) || 1);
    return (
        <tr className="border-t border-[hsl(var(--border-soft)/0.2)]">
            <td className="py-1 px-2 text-[10px] font-ui text-[hsl(var(--text-2))]">{label}</td>
            <td className="py-1 px-2 text-center text-[10px] font-num tabular-nums text-white">
                {isFiniteNumber(first) ? dim.fmt(num(first)) : "—"}
            </td>
            <td className="py-1 px-2 text-center text-[10px] font-num tabular-nums text-white">
                {isFiniteNumber(second) ? dim.fmt(num(second)) : "—"}
            </td>
            <td className={cn("py-1 px-2 text-center text-[10px] font-num tabular-nums", consistent ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>
                {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : "—"}
            </td>
            <td className="py-1 px-2 text-center">
                {delta != null && (
                    <span className={cn("text-[8.5px] font-ui uppercase", consistent ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>
                        {consistent ? "consistent" : "divergent"}
                    </span>
                )}
            </td>
        </tr>
    );
}

// ─── Outlier Dependency ───────────────────────────────────────────────────────

function OutlierRow({ label, withOutliers, withoutOutliers, n, removed }) {
    const dependency = isFiniteNumber(withOutliers) && isFiniteNumber(withoutOutliers)
        ? Math.abs(num(withoutOutliers) - num(withOutliers)) / (Math.abs(num(withOutliers)) + 0.001) * 100
        : null;
    const fragile = dependency != null && dependency > 30;
    return (
        <tr className="border-t border-[hsl(var(--border-soft)/0.2)]">
            <td className="py-1 px-2 text-[10px] font-ui text-[hsl(var(--text-2))]">{label}</td>
            <td className="py-1 px-2 text-center text-[10px] font-num tabular-nums text-white">
                {isFiniteNumber(withOutliers) ? num(withOutliers).toFixed(3) : "—"}
            </td>
            <td className="py-1 px-2 text-center text-[10px] font-num tabular-nums text-white">
                {isFiniteNumber(withoutOutliers) ? num(withoutOutliers).toFixed(3) : "—"}
            </td>
            <td className="py-1 px-2 text-center text-[9px] font-ui text-muted-lab">
                {removed != null ? `${removed} removed` : "—"}
            </td>
            <td className="py-1 px-2 text-center">
                {dependency != null && (
                    <span className={cn("text-[8.5px] font-ui uppercase", fragile ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]")}>
                        {fragile ? `fragile (${dependency.toFixed(0)}%)` : `robust (${dependency.toFixed(0)}%)`}
                    </span>
                )}
            </td>
        </tr>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ConfidencePanel({ exactRows, halfSplitData, outlierData, robustnessScores }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Sample adequacy */}
            <NeonPanel title="Sample Adequacy" className="xl:col-span-1"
                action={<Pill tone="secondary">N THRESHOLDS</Pill>}
            >
                <p className="mb-3 text-[10px] font-ui text-muted-lab">
                    Thresholds: insufficient &lt;{LOW_SAMPLE_N} · low &lt;{MODERATE_SAMPLE_N} · moderate &lt;{ROBUST_SAMPLE_N} · robust ≥{ROBUST_SAMPLE_N}
                </p>
                <div className="space-y-2">
                    {exactRows.filter(r => r.exact).map(row => (
                        <div key={row.mode} className="space-y-1">
                            <span className="text-[9.5px] font-ui text-[hsl(var(--text-2))]">{row.label}</span>
                            <SampleAdequacyBar n={row.trades || 0} />
                        </div>
                    ))}
                </div>
            </NeonPanel>

            {/* Robustness scores */}
            <NeonPanel title="Robustness Scores" className="xl:col-span-1"
                action={<Pill tone="secondary">COMPOSITE 0–100</Pill>}
            >
                <p className="mb-3 text-[10px] font-ui text-muted-lab">
                    Composite score: sample confidence, half-split consistency, outlier independence, trade-off ratio.
                </p>
                {robustnessScores?.length > 0 ? (
                    <div className="space-y-2">
                        {robustnessScores.map(({ mode, label, score }) => {
                            const rInfo  = robustnessLabel(score);
                            const color  = score >= 70 ? "hsl(var(--success))" : score >= 45 ? "hsl(var(--warning))" : "hsl(var(--danger))";
                            return (
                                <div key={mode} className="flex items-center gap-3">
                                    <span className="text-[10px] font-ui text-[hsl(var(--text-2))] w-28 truncate">{label}</span>
                                    <div className="flex-1 h-2 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
                                    </div>
                                    <span className="text-[10px] font-num tabular-nums w-8 text-right" style={{ color }}>{score}</span>
                                    <span className="text-[9px] font-ui uppercase tracking-wider w-16" style={{ color }}>{rInfo.label}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-4 text-[10.5px] font-ui text-muted-lab">
                        Requires per-model entry trade exports (trades_*__entry_*.csv). Summary entry results are loaded, but trade-level model lists are missing.
                    </div>
                )}
            </NeonPanel>

            {/* Half-split */}
            <NeonPanel title="Half-Split Consistency" className="xl:col-span-1"
                action={<Pill tone="secondary">FIRST vs SECOND HALF</Pill>}
            >
                <p className="mb-3 text-[10px] font-ui text-muted-lab">
                    Split trades 50/50 chronologically. Consistent results in both halves reduce overfit risk.
                </p>
                {halfSplitData?.length > 0 ? (
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-[10px] border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    {["Model", "H1 Exp", "H2 Exp", "Δ", ""].map((h, i) => (
                                        <th key={i} className="text-left text-[8.5px] uppercase tracking-wider text-muted-lab px-2 py-1.5">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {halfSplitData.map(d => (
                                    <HalfSplitRow key={d.mode}
                                        label={d.label}
                                        first={d.firstHalfExp}
                                        second={d.secondHalfExp}
                                        dim={{ fmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(3)}R` }}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-4 text-[10.5px] font-ui text-muted-lab">
                        Requires per-model entry trade exports (trades_*__entry_*.csv). Summary entry results are loaded, but trade-level model lists are missing.
                    </div>
                )}
            </NeonPanel>

        </div>
    );
}
