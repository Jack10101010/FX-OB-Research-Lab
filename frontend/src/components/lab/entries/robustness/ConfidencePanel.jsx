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
            <span className="text-[11px] font-num tabular-nums w-10 text-right" style={{ color }}>
                {n}
            </span>
            <span className="text-[10px] font-ui uppercase tracking-wider w-16" style={{ color }}>
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
            <td className="py-1.5 px-2 text-[11px] font-ui text-[hsl(var(--text))]">{label}</td>
            <td className="py-1.5 px-2 text-center text-[11px] font-num tabular-nums text-white">
                {isFiniteNumber(first) ? dim.fmt(num(first)) : "—"}
            </td>
            <td className="py-1.5 px-2 text-center text-[11px] font-num tabular-nums text-white">
                {isFiniteNumber(second) ? dim.fmt(num(second)) : "—"}
            </td>
            <td className={cn("py-1.5 px-2 text-center text-[11px] font-num tabular-nums", consistent ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>
                {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : "—"}
            </td>
            <td className="py-1.5 px-2 text-center">
                {delta != null && (
                    <span className={cn("text-[9.5px] font-ui font-semibold uppercase", consistent ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]")}>
                        {consistent ? "holds up" : "breaks down"}
                    </span>
                )}
            </td>
        </tr>
    );
}

// ─── Outlier Dependency ───────────────────────────────────────────────────────
// Faithful to buildOutlierDependency (robustnessAnalytics): top-5 share of Net R +
// the LOW/MODERATE/HIGH risk standing. Bar idiom matches SampleAdequacyBar so the
// panel stays visually consistent. (The previous OutlierRow expected a with/without-
// outlier expectancy comparison that the analytics never produced — it was dead UI.)

function OutlierBar({ top5Pct, risk }) {
    const pct   = Math.max(0, Math.min(100, num(top5Pct) || 0));
    const color = risk === "HIGH"     ? "hsl(var(--danger))"
                : risk === "MODERATE" ? "hsl(var(--warning))"
                : "hsl(var(--success))";
    const standing = risk === "HIGH" ? "outlier-led" : risk === "MODERATE" ? "some reliance" : "reliable";
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[11px] font-num tabular-nums w-10 text-right" style={{ color }}>
                {pct.toFixed(0)}%
            </span>
            <span className="text-[10px] font-ui uppercase tracking-wider w-16" style={{ color }}>
                {standing}
            </span>
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ConfidencePanel({ exactRows, halfSplitData, outlierData, robustnessScores }) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Sample adequacy → Enough data? */}
            <NeonPanel title="Enough data?" className="xl:col-span-1"
                action={<Pill tone="secondary">BY TRADE COUNT</Pill>}
            >
                <p className="mb-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                    How many trades back each model. Too few &lt;{LOW_SAMPLE_N} · thin &lt;{MODERATE_SAMPLE_N} · ok &lt;{ROBUST_SAMPLE_N} · strong ≥{ROBUST_SAMPLE_N}
                </p>
                <div className="space-y-2">
                    {exactRows.filter(r => r.exact).map(row => (
                        <div key={row.mode} className="space-y-1">
                            <span className="text-[11px] font-ui text-[hsl(var(--text))]">{row.label}</span>
                            <SampleAdequacyBar n={row.trades || 0} />
                        </div>
                    ))}
                </div>
            </NeonPanel>

            {/* Robustness scores */}
            <NeonPanel title="Robustness Scores" className="xl:col-span-1"
                action={<Pill tone="secondary">COMPOSITE 0–100</Pill>}
            >
                <p className="mb-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                    Composite 0–100 score based on sample size, edge vs baseline, drawdown control, trade-off quality, and fill rate.
                </p>
                {robustnessScores?.length > 0 ? (
                    <div className="space-y-2">
                        {robustnessScores.map(({ mode, label, score }) => {
                            const rInfo  = robustnessLabel(score);
                            const color  = score >= 70 ? "hsl(var(--success))" : score >= 45 ? "hsl(var(--warning))" : "hsl(var(--danger))";
                            return (
                                <div key={mode} className="flex items-center gap-3">
                                    <span className="text-[11px] font-ui text-[hsl(var(--text))] w-28 truncate">{label}</span>
                                    <div className="flex-1 h-2 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
                                    </div>
                                    <span className="text-[11px] font-num tabular-nums w-8 text-right" style={{ color }}>{score}</span>
                                    <span className="text-[10px] font-ui uppercase tracking-wider w-16" style={{ color }}>{rInfo.label}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                        Load this model's trade file to see this trust analysis.
                    </div>
                )}
            </NeonPanel>

            {/* Half-split → Holds over time? */}
            <NeonPanel title="Holds over time?" className="xl:col-span-1"
                action={<Pill tone="secondary">FIRST vs SECOND HALF</Pill>}
            >
                <p className="mb-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                    Split each model's trades 50/50 by time. An edge that holds in both halves is less likely to be overfit.
                </p>
                {halfSplitData?.length > 0 ? (
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-[11px] border-separate border-spacing-0">
                            <thead>
                                <tr>
                                    {["Model", "First half", "Second half", "Change", ""].map((h, i) => (
                                        <th key={i} className="text-left text-[10px] font-ui font-semibold uppercase tracking-[0.05em] text-[hsl(var(--text-2))] px-2 py-1.5">{h}</th>
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
                    <div className="py-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                        Load this model's trade file to see this trust analysis.
                    </div>
                )}
            </NeonPanel>

            {/* Outlier dependency → Luck or real? (was computed but never rendered; now surfaced) */}
            <NeonPanel title="Luck or real?" className="xl:col-span-1"
                action={<Pill tone="secondary">TOP 5 SHARE OF NET R</Pill>}
            >
                <p className="mb-3 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                    Share of total Net R coming from each model's 5 best trades. Lower is more reliable; a high share means results lean on a few outliers.
                </p>
                {outlierData?.length > 0 ? (
                    <div className="space-y-2">
                        {outlierData.map(row => (
                            <div key={row.mode} className="space-y-1">
                                <span className="text-[11px] font-ui text-[hsl(var(--text))]">{row.label}</span>
                                <OutlierBar top5Pct={row.top5Pct} risk={row.risk} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                        Load this model's trade file to see this trust analysis.
                    </div>
                )}
            </NeonPanel>

        </div>
    );
}
