// ── StreakAnalysis.jsx ───────────────────────────────────────────────────────
// Phase 2/3: Streak KPIs, Wald-Wolfowitz runs test, sequence dependency, leaderboard,
// streak context, and trade sequence dot strip.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable } from "@/components/lab/DataTable";
import { StreakDotStrip } from "./StreakDotStrip";
import { Pill } from "@/components/lab/DataTable";
import { TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import {
    computeStreakStats,
    buildRunsTest,
    computeSequenceDependency,
    buildCurrentStreak,
    buildStreakLeaderboard,
    buildStreakContext,
} from "../shared/failuresAnalytics";
import { safeLabel, safeTone } from "../shared/failuresFormatters";

// ── Runs test panel ───────────────────────────────────────────────────────────

function RunsTestPanel({ result }) {
    if (!result.valid) {
        return (
            <div className="p-4 text-[10.5px] font-ui text-muted-lab">{result.reason}</div>
        );
    }

    const tonemap = { clustered: "danger", dispersed: "secondary", random: "muted" };
    const tone = tonemap[result.interpretation] || "muted";

    return (
        <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                    <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider">Runs</div>
                    <div className="font-display text-[20px] font-semibold text-white">{result.runs}</div>
                    <div className="text-[9.5px] font-ui text-muted-lab">exp: {result.expectedRuns}</div>
                </div>
                <div>
                    <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider">Z-Stat</div>
                    <div className="font-display text-[20px] font-semibold text-white">{result.zStat}</div>
                </div>
                <div>
                    <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider">p-value</div>
                    <div className={`font-display text-[20px] font-semibold ${result.pValue < 0.05 ? "text-[hsl(var(--warning))]" : "text-white"}`}>
                        {result.pValue}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Pill tone={tone}>{result.interpretation.toUpperCase()}</Pill>
                <Pill tone={safeTone(result.sampleConfidence, safeLabel(result.sampleConfidence) === "ROBUST" ? "success" : safeLabel(result.sampleConfidence) === "INSUFFICIENT" ? "danger" : "warning")}>
                    {safeLabel(result.sampleConfidence)} (n={result.n})
                </Pill>
                {result.pValue < 0.05 && <Pill tone="warning">p &lt; 0.05</Pill>}
            </div>

            <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{result.verdict}</p>
        </div>
    );
}

// ── Sequence dependency panel ─────────────────────────────────────────────────

function SequencePanel({ dep }) {
    if (!dep) {
        return <div className="p-4 text-[10.5px] font-ui text-muted-lab">Requires ≥ 4 trades.</div>;
    }

    const { pLossAfterWin, pLossAfterLoss, ratio, interpretation } = dep;
    const isCluster = ratio != null && ratio > 1.5;

    return (
        <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                    <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider">P(Loss | Win)</div>
                    <div className="font-display text-[22px] font-semibold text-white tabular-nums">
                        {pLossAfterWin != null ? `${pLossAfterWin}%` : "—"}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider">P(Loss | Loss)</div>
                    <div className={`font-display text-[22px] font-semibold tabular-nums ${isCluster ? "text-[hsl(var(--warning))]" : "text-white"}`}>
                        {pLossAfterLoss != null ? `${pLossAfterLoss}%` : "—"}
                    </div>
                </div>
            </div>

            {ratio != null && (
                <div className="flex items-center gap-2">
                    <Pill tone={isCluster ? "warning" : ratio < 0.7 ? "success" : "muted"}>
                        ×{ratio} multiplier
                    </Pill>
                    <span className="text-[9.5px] font-ui text-muted-lab">after-loss vs after-win loss probability</span>
                </div>
            )}

            {interpretation && (
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{interpretation}</p>
            )}
        </div>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function StreakAnalysis({ losers = [], allLosers = [], allTrades = [] }) {
    const streakStats   = useMemo(() => computeStreakStats(allTrades),        [allTrades]);
    const currentStreak = useMemo(() => buildCurrentStreak(allTrades),        [allTrades]);
    const runsTest      = useMemo(() => buildRunsTest(allTrades),              [allTrades]);
    const seqDep        = useMemo(() => computeSequenceDependency(allTrades),  [allTrades]);
    const leaderboard   = useMemo(() => buildStreakLeaderboard(allTrades, 5),  [allTrades]);
    const streakContext = useMemo(() => buildStreakContext(allTrades),          [allTrades]);
    const [expandedStreak, setExpandedStreak] = useState(null);

    const avgStreakLen = streakStats.streakZones.length
        ? (streakStats.streakZones.reduce((s, z) => s + z.length, 0) / streakStats.streakZones.length).toFixed(1)
        : "—";

    const leaderboardColumns = [
        { key: "rank",       label: "#",       sortable: false },
        { key: "length",     label: "Length",  sortable: true },
        {
            key: "totalR", label: "Total R", sortable: true,
            render: r => <span className="font-num text-[hsl(var(--danger))]">{r.totalR}R</span>,
            sortValue: r => r.totalR,
        },
        {
            key: "startEntry", label: "Started", sortable: false,
            render: r => r.startEntry ? String(r.startEntry).slice(0, 10) : "—",
        },
        {
            key: "endEntry", label: "Ended", sortable: false,
            render: r => r.endEntry ? String(r.endEntry).slice(0, 10) : "—",
        },
    ];

    const distColumns = [
        { key: "streak", label: "Length",      sortable: true },
        { key: "count",  label: "Occurrences", sortable: true },
    ];

    if (!allTrades.length) return null;

    return (
        <div className="p-6 space-y-4">
            {/* ── Trade sequence dot strip ─────────────────────────────────── */}
            <StreakDotStrip allTrades={allTrades} />

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricChip
                    label="Longest Streak"
                    value={streakStats.maxStreak}
                    tone="danger"
                    icon={TrendingDown}
                    sub="consecutive losses"
                />
                <MetricChip
                    label="Current Streak"
                    value={currentStreak}
                    tone={currentStreak >= 3 ? "warning" : "muted"}
                    sub={currentStreak > 0 ? "active at end of data" : "no active streak"}
                />
                <MetricChip
                    label="Total Streaks"
                    value={streakStats.streakZones.length}
                    tone="secondary"
                    sub="distinct loss runs"
                />
                <MetricChip
                    label="Avg Length"
                    value={avgStreakLen}
                    tone="muted"
                    sub="losses per run"
                />
            </div>

            {/* Statistical tests */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Wald-Wolfowitz Runs Test" tone="secondary">
                    <RunsTestPanel result={runsTest} />
                </NeonPanel>

                <NeonPanel title="Sequential Dependency">
                    <SequencePanel dep={seqDep} />
                </NeonPanel>
            </div>

            {/* Leaderboard + distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Worst Streak Leaderboard">
                    {leaderboard.length ? (
                        <DataTable
                            columns={leaderboardColumns}
                            rows={leaderboard}
                            rowKey="rank"
                            maxHeight="240px"
                        />
                    ) : (
                        <div className="p-4 text-[10.5px] font-ui text-muted-lab">No losing streaks found.</div>
                    )}
                </NeonPanel>

                <NeonPanel title="Streak Distribution">
                    <DataTable
                        columns={distColumns}
                        rows={streakStats.distribution.filter(r => r.count > 0)}
                        rowKey="streak"
                        defaultSortKey="count"
                        defaultSortDir="desc"
                        maxHeight="240px"
                    />
                </NeonPanel>
            </div>

            {/* ── Streak context: session/direction breakdown ─────────────── */}
            {streakContext.length > 0 && (
                <NeonPanel title="Streak Context — Session & Direction Breakdown">
                    <div className="p-4 space-y-2">
                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            What conditions dominated inside each losing streak?
                            Dominated = one session or direction accounted for ≥ 70% of the streak.
                        </p>
                        <div className="space-y-1.5 mt-2">
                            {streakContext.map(zone => (
                                <div key={zone.rank} className="border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))]">
                                    {/* Header row */}
                                    <button
                                        type="button"
                                        onClick={() => setExpandedStreak(prev => prev === zone.rank ? null : zone.rank)}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[hsl(var(--panel))] transition-colors"
                                    >
                                        <span className="text-[10px] font-num text-muted-lab w-4 shrink-0">#{zone.rank}</span>
                                        <span className="text-[11px] font-num text-white font-medium">{zone.length} losses</span>
                                        <span className="text-[10px] font-num text-[hsl(var(--danger))]">{zone.totalR.toFixed(1)}R</span>

                                        {/* Dominant conditions */}
                                        <div className="flex-1 flex flex-wrap gap-1 items-center">
                                            {zone.sessionDominated && zone.topSession && (
                                                <Pill tone="warning">{zone.topSession} {zone.topSessionPct}%</Pill>
                                            )}
                                            {zone.directionDominated && zone.topDirection && (
                                                <Pill tone={zone.topDirection === "long" ? "success" : "danger"}>
                                                    {zone.topDirection.toUpperCase()} {zone.topDirectionPct}%
                                                </Pill>
                                            )}
                                            {!zone.sessionDominated && !zone.directionDominated && (
                                                <span className="text-[9.5px] font-ui text-muted-lab">Mixed conditions</span>
                                            )}
                                        </div>

                                        {zone.avgHourUTC != null && (
                                            <span className="text-[9.5px] font-ui text-muted-lab shrink-0">
                                                avg {String(Math.round(zone.avgHourUTC)).padStart(2, "0")}:00 UTC
                                            </span>
                                        )}
                                        {expandedStreak === zone.rank
                                            ? <ChevronDown className="w-3.5 h-3.5 text-muted-lab shrink-0" />
                                            : <ChevronRight className="w-3.5 h-3.5 text-muted-lab shrink-0" />
                                        }
                                    </button>

                                    {/* Expanded detail */}
                                    {expandedStreak === zone.rank && (
                                        <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--border-soft))] grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider mb-1.5">Sessions</div>
                                                <div className="space-y-0.5">
                                                    {Object.entries(zone.sessions)
                                                        .sort((a, b) => b[1] - a[1])
                                                        .map(([sess, cnt]) => (
                                                            <div key={sess} className="flex items-center gap-2 text-[10px] font-ui">
                                                                <span className="text-[hsl(var(--text-2))] w-20 truncate">{sess}</span>
                                                                <span className="text-white">{cnt}</span>
                                                                <span className="text-muted-lab">({((cnt / zone.length) * 100).toFixed(0)}%)</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] font-ui text-muted-lab uppercase tracking-wider mb-1.5">Directions</div>
                                                <div className="space-y-0.5">
                                                    {Object.entries(zone.directions)
                                                        .sort((a, b) => b[1] - a[1])
                                                        .map(([dir, cnt]) => (
                                                            <div key={dir} className="flex items-center gap-2 text-[10px] font-ui">
                                                                <span className={`w-16 ${dir === "long" ? "text-[hsl(var(--success))]" : dir === "short" ? "text-[hsl(var(--danger))]" : "text-muted-lab"}`}>
                                                                    {dir.toUpperCase()}
                                                                </span>
                                                                <span className="text-white">{cnt}</span>
                                                                <span className="text-muted-lab">({((cnt / zone.length) * 100).toFixed(0)}%)</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}
