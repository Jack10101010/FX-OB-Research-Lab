// ── FalseLosersDeepDive.jsx ──────────────────────────────────────────────────
// Groups losing trades by MFE band and estimates the UPPER-BOUND break-even /
// protection opportunity from current trade-level MFE only. This is an optimistic
// peak-MFE estimate — NOT path-accurate BE truth (no retrace modelling, no winner
// cost). Exact validation requires a BE backtest / replay scenario. Pure-prop UI
// over buildFalseLoserDeepDive; "Explore" deep-links a band into the MFE Bucket
// Explorer above via onExploreBucket.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { TermTip } from "@/components/lab/TermTip";
import { Info, Search } from "lucide-react";
import { buildFalseLoserDeepDive } from "../shared/excursionAnalytics";

// The deep-dive groups on the exclusive BE bands (which split 1–2R into 1–1.5R /
// 1.5–2R); the MFE Bucket Explorer selects on the 6 raw-R buckets. Map each band to
// the closest raw bucket key so "Explore" highlights the right bucket.
const BAND_TO_RAW_BUCKET = {
    never:   "never",
    "0_025": "lt025",
    "025_05": "025_05",
    "05_1":  "05_1",
    "1_15":  "1_2",
    "15_2":  "1_2",
    "2plus": "2plus",
};

function flagTone(flag) {
    if (flag === "instant") return "danger";
    if (flag === "almost") return "success";
    return "muted";
}

function BeImpactCard({ row }) {
    return (
        <div className="px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.5)] min-w-[110px]">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">Armed at {row.label}</div>
            <div className="mt-1 text-[15px] font-num tabular-nums text-[hsl(var(--accent-secondary))]">
                {row.savableLossRUpperBound}R
            </div>
            <div className="text-[9.5px] font-num text-[hsl(var(--text-2))]">
                {row.reached} losers · {row.reachedPct}%
                {row.lowSample ? <span className="text-[hsl(var(--warning))]"> · low n</span> : null}
            </div>
        </div>
    );
}

export function FalseLosersDeepDive({ losers = [], config = {}, onExploreBucket }) {
    const dd = useMemo(() => buildFalseLoserDeepDive(losers, { config }), [losers, config]);

    const action = (
        <div className="flex items-center gap-2">
            <Pill tone="warning">upper bound</Pill>
            <Pill tone="muted">{dd.coverage.withMfe}/{dd.coverage.total} losers · {dd.coverage.pct}% have MFE</Pill>
        </div>
    );

    if (dd.mode === "none") {
        return (
            <NeonPanel title="False Losers Deep Dive" tone="secondary" action={action}>
                <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    No favourable-excursion (MFE) data on these losers — nothing to deep-dive. Re-export the run with{" "}
                    <span className="font-num text-[hsl(var(--text))]">mfeR</span> to enable break-even opportunity analysis.
                </div>
            </NeonPanel>
        );
    }

    const rows = dd.buckets;
    const maxContribution = Math.max(...rows.map((b) => b.contributionPct), 1);

    return (
        <NeonPanel
            title="False Losers Deep Dive"
            tone="secondary"
            action={action}
        >
            <div className="p-3 space-y-4">
                {/* Upper-bound caveat */}
                <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-3 flex items-start gap-2.5">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="text-[hsl(var(--text))] font-semibold">Optimistic upper bound.</span>{" "}
                        These figures use each loser's <TermTip termKey="mfe">peak MFE</TermTip> only — they show a trade
                        <em> reached</em> a level (so a break-even <em>could</em> have armed), not that it would have held.
                        Retrace-to-entry, winner cost, and partial fills are not modelled.{" "}
                        <span className="text-[hsl(var(--text))]">Exact validation requires a BE backtest / replay scenario.</span>
                    </p>
                </div>

                {/* BE-impact: net saved if armed at X (cumulative, upper bound) */}
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                        <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">
                            Net saved if break-even armed at…
                        </span>
                        <span className="text-[9.5px] font-ui text-[hsl(var(--text-3))]">
                            upper bound — validate with exact BE backtest
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {dd.beImpact.map((r) => <BeImpactCard key={r.level} row={r} />)}
                    </div>
                </div>

                {/* Per-band grouped table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-[11.5px] font-ui border-collapse">
                        <thead>
                            <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                                <th className="text-left font-medium py-1.5 pr-2">MFE band</th>
                                <th className="text-right font-medium py-1.5 px-2">Count</th>
                                <th className="text-right font-medium py-1.5 px-2">%</th>
                                <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="mfe">Avg MFE</TermTip></th>
                                <th className="text-right font-medium py-1.5 px-2">Avg loss</th>
                                <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></th>
                                <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="contribution_pct">Contrib</TermTip></th>
                                <th className="text-right font-medium py-1.5 pl-2">Explore</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((b) => {
                                const empty = b.count === 0;
                                return (
                                    <tr
                                        key={b.key}
                                        className="border-b border-[hsl(var(--border-soft)/0.5)] hover:bg-[hsl(var(--panel-2)/0.5)] transition-colors"
                                    >
                                        <td className="text-left py-2 pr-2">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="text-[hsl(var(--text))]">{b.label}</span>
                                                {b.flag && <Pill tone={flagTone(b.flag)}>{b.flag === "instant" ? "instant fail" : "almost worked"}</Pill>}
                                            </span>
                                        </td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums text-white">{b.count}</td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{b.pctOfLosers}%</td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--accent-secondary))]">
                                            {b.avgMfeR != null ? `${b.avgMfeR}R` : "—"}
                                        </td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--danger))]">
                                            {b.avgLossR != null ? `-${b.avgLossR}R` : "—"}
                                        </td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{b.lossR}R</td>
                                        <td className="text-right py-2 px-2 font-num tabular-nums">
                                            <span className="inline-flex items-center gap-1.5 justify-end">
                                                <span className="hidden sm:inline-block w-12 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden align-middle">
                                                    <span className="block h-full bg-[hsl(var(--danger))]" style={{ width: `${Math.min(100, (b.contributionPct / maxContribution) * 100)}%` }} />
                                                </span>
                                                <span className="text-[hsl(var(--text))] w-10 text-right">{b.contributionPct}%</span>
                                            </span>
                                        </td>
                                        <td className="text-right py-2 pl-2">
                                            <button
                                                type="button"
                                                disabled={empty || typeof onExploreBucket !== "function"}
                                                onClick={() => onExploreBucket?.(BAND_TO_RAW_BUCKET[b.key] ?? b.key)}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-ui border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.08)] clip-bevel-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                title="Scope the MFE Bucket Explorer above to this band"
                                            >
                                                <Search className="w-3 h-3" />
                                                Explore
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="px-1 pt-2 text-[10px] font-ui text-[hsl(var(--text-3))]">
                        Bands are exclusive (each loser counts once by peak MFE). “Net saved” above is cumulative (reached ≥ level).
                        Avg loss shown negative. Click Explore to scope the MFE Bucket Explorer to a band.
                    </p>
                </div>
            </div>
        </NeonPanel>
    );
}

export default FalseLosersDeepDive;
