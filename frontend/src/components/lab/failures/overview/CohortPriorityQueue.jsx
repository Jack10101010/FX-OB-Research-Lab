// ── CohortPriorityQueue.jsx ──────────────────────────────────────────────────
// Failures Lab V6 — the verdict-first "what should I investigate next?" surface.
// Compact ranked list of research suggestions (NOT a table, NOT an explorer). The
// UI headlines action + reason + confidence; raw scores are intentionally hidden.
// Sits under the Failure Command Center on Overview.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { Compass, Filter, Shield, Eye, Info } from "lucide-react";
import { buildFailureCohortRanking } from "../shared/failureCohortRanking";

const ACTION_STYLE = {
    Investigate:        { tone: "danger",    Icon: Compass },
    "Test filter":      { tone: "warning",   Icon: Filter },
    "Test protection":  { tone: "secondary", Icon: Shield },
    Watch:              { tone: "muted",     Icon: Eye },
};

const CONFIDENCE_TONE = { STRONG: "success", MODERATE: "secondary", WEAK: "warning", SPECULATIVE: "danger" };

// Per-lens metric hints (compact, muted). Only render hints that exist.
function metricHints(lens, m) {
    const hints = [];
    if (lens === "worst") {
        hints.push(`${m.lossR}R loss`, `${m.contributionPct}% of losses`);
        if (m.expectancy < 0) hints.push(`exp ${m.expectancy}R`);
    } else if (lens === "filter") {
        hints.push(`Net R ${m.filterNetRImpact >= 0 ? "+" : ""}${m.filterNetRImpact}`, `${m.losersRemoved}L / ${m.winnersRemoved}W`);
    } else if (lens === "protection") {
        hints.push(`~${m.recoverablePool}R recoverable`, `${m.reach1R}% reached +1R`);
    } else {
        hints.push(`${m.reach1R}% reached +1R`, `avg MFE +${m.avgMfe}R`);
        if (m.confirmedPct != null) hints.push(`${m.confirmedPct}% confirmed`);
    }
    return hints.filter(Boolean);
}

export function CohortPriorityQueue({ allTrades = [], config = {} }) {
    const ranking = useMemo(
        () => buildFailureCohortRanking(allTrades, { config }),
        [allTrades, config],
    );
    const queue = ranking.queue;

    return (
        <NeonPanel
            title="Research Priority Queue"
            tone="secondary"
            action={<span className="text-[11px] font-ui text-[hsl(var(--text-2))]">What should I investigate next?</span>}
        >
            <div className="p-4 space-y-3">
                {/* Caveat */}
                <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-[hsl(var(--text-2))] shrink-0 mt-0.5" />
                    <p className="text-[10px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        Research suggestions from current data — not live rules. Recoverability is an upper-bound estimate
                        until validated with exact BE / backtest scenarios.
                    </p>
                </div>

                {queue.length === 0 ? (
                    <p className="text-[10.5px] font-ui text-muted-lab">
                        Not enough rankable cohorts yet — once a cohort carries ≥ {ranking.meta.sampleFloor} losses, prioritized
                        suggestions appear here.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {queue.map((item) => {
                            const a = ACTION_STYLE[item.action] ?? ACTION_STYLE.Watch;
                            const Icon = a.Icon;
                            return (
                                <div
                                    key={item.rank}
                                    className="flex items-start gap-3 px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2)/0.5)]"
                                >
                                    <div className="text-[15px] font-num tabular-nums text-[hsl(var(--text-3))] w-5 text-right shrink-0 mt-0.5">
                                        {item.rank}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        {/* Action + cohort + lens */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Pill tone={a.tone}>
                                                <span className="inline-flex items-center gap-1">
                                                    <Icon className="w-3 h-3" />
                                                    {item.action}
                                                </span>
                                            </Pill>
                                            <span className="text-[12px] font-ui font-medium text-white truncate">{item.cohortLabel}</span>
                                            <span className="text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-3))]">{item.tag}</span>
                                        </div>
                                        {/* Reason */}
                                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{item.reason}</p>
                                        {/* Metric hints */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {metricHints(item.lens, item.metrics).map((h, i) => (
                                                <span key={i} className="text-[9.5px] font-num text-[hsl(var(--text-3))] px-1.5 py-0.5 border border-[hsl(var(--border-soft))] clip-bevel-sm">
                                                    {h}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <Pill tone={CONFIDENCE_TONE[item.confidence] ?? "muted"}>{item.confidence}</Pill>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}

export default CohortPriorityQueue;
