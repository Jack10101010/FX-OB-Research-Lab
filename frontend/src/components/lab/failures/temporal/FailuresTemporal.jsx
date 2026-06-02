// ── FailuresTemporal.jsx ─────────────────────────────────────────────────────
// Phase 2/3: Weekday + hourly tables · heatmap · streak distribution · burst detection.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { FailuresHeatmap } from "./FailuresHeatmap";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { AlertTriangle } from "lucide-react";
import {
    buildCurrentStreak,
    buildWeekdayFailureStats,
    computeWinFailureDeltaByHour,
    computeStreakStats,
    buildBurstDetection,
} from "../shared/failuresAnalytics";

// ── Module ────────────────────────────────────────────────────────────────────

export function FailuresTemporal({ losers = [], allLosers = [], allTrades = [] }) {
    const currentStreak = useMemo(() => buildCurrentStreak(allTrades), [allTrades]);
    const weekdayStats  = useMemo(() => buildWeekdayFailureStats(allTrades), [allTrades]);
    const hourlyStats   = useMemo(() => computeWinFailureDeltaByHour(allTrades), [allTrades]);
    const streakStats   = useMemo(() => computeStreakStats(allTrades), [allTrades]);
    const burstWindows  = useMemo(() => buildBurstDetection(allTrades, 48, 3), [allTrades]);

    const activeHours = hourlyStats.filter(h => h.total > 0);

    const weekdayColumns = [
        {
            key: "label", label: "Day", sortable: false,
        },
        { key: "total",     label: "Trades",    sortable: true },
        { key: "lossCount", label: "Losses",    sortable: true },
        { key: "winCount",  label: "Wins",      sortable: true },
        {
            key: "lossRate", label: "Loss %", sortable: true,
            render: r => (
                <span className={r.lossRate > 50 ? "text-[hsl(var(--warning))] font-semibold" : ""}>
                    {r.lossRate}%
                </span>
            ),
        },
    ];

    const hourColumns = [
        {
            key: "hour", label: "Hour (UTC)", sortable: true,
            render: r => `${String(r.hour).padStart(2, "0")}:00`,
        },
        { key: "total",     label: "Trades",   sortable: true },
        { key: "lossCount", label: "Losses",   sortable: true },
        {
            key: "lossRate", label: "Loss %", sortable: true,
            render: r => (
                <span className={r.lossRate > 50 ? "text-[hsl(var(--warning))]" : ""}>
                    {r.lossRate}%
                </span>
            ),
        },
        {
            key: "delta", label: "W−L Δ", sortable: true,
            render: r => <ColoredR value={r.delta / 100} />,
            sortValue: r => r.delta,
        },
    ];

    const streakDistColumns = [
        { key: "streak", label: "Length",       sortable: true },
        { key: "count",  label: "Occurrences",  sortable: true },
    ];

    if (!allTrades.length) return null;

    return (
        <div className="p-6 space-y-4">
            {/* Active streak banner */}
            {currentStreak > 0 && (
                <div className="border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.05)] clip-bevel p-3 flex items-center gap-3">
                    <span className="text-[9.5px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">⚠ Active Streak</span>
                    <span className="font-display text-[16px] font-semibold text-white">{currentStreak} consecutive losses</span>
                    <span className="text-[10px] font-ui text-muted-lab">at end of dataset</span>
                </div>
            )}

            {/* ── Heatmap ───────────────────────────────────────────────────── */}
            <FailuresHeatmap allTrades={allTrades} />

            {/* Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Losses by Weekday">
                    <DataTable
                        columns={weekdayColumns}
                        rows={weekdayStats}
                        rowKey="weekday"
                        defaultSortKey="lossCount"
                        defaultSortDir="desc"
                        maxHeight="280px"
                    />
                </NeonPanel>

                <NeonPanel title="Losses by Hour (UTC)">
                    <DataTable
                        columns={hourColumns}
                        rows={activeHours}
                        rowKey="hour"
                        defaultSortKey="lossCount"
                        defaultSortDir="desc"
                        maxHeight="280px"
                    />
                </NeonPanel>
            </div>

            {/* Streak distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Streak Summary">
                    <div className="p-4 grid grid-cols-2 gap-4 text-center">
                        <div>
                            <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Longest Streak</div>
                            <div className="font-display text-[32px] font-semibold text-[hsl(var(--warning))]">{streakStats.maxStreak}</div>
                            <div className="text-[10px] font-ui text-muted-lab">consecutive losses</div>
                        </div>
                        <div>
                            <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Unique Streaks</div>
                            <div className="font-display text-[32px] font-semibold text-white">{streakStats.streakZones.length}</div>
                            <div className="text-[10px] font-ui text-muted-lab">distinct loss runs</div>
                        </div>
                        {streakStats.streakZones.length > 0 && (
                            <>
                                <div>
                                    <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Current Streak</div>
                                    <div className="font-display text-[32px] font-semibold text-white">{currentStreak}</div>
                                    <div className="text-[10px] font-ui text-muted-lab">{currentStreak > 0 ? "active" : "none"}</div>
                                </div>
                                <div>
                                    <div className="text-[9.5px] font-ui text-muted-lab uppercase tracking-wider">Avg Length</div>
                                    <div className="font-display text-[32px] font-semibold text-white">
                                        {(streakStats.streakZones.reduce((s, z) => s + z.length, 0) / streakStats.streakZones.length).toFixed(1)}
                                    </div>
                                    <div className="text-[10px] font-ui text-muted-lab">losses per run</div>
                                </div>
                            </>
                        )}
                    </div>
                </NeonPanel>

                <NeonPanel title="Streak Length Distribution">
                    <DataTable
                        columns={streakDistColumns}
                        rows={streakStats.distribution.filter(r => r.count > 0)}
                        rowKey="streak"
                        defaultSortKey="count"
                        defaultSortDir="desc"
                        maxHeight="220px"
                    />
                </NeonPanel>
            </div>

            {/* ── Burst detection ──────────────────────────────────────────── */}
            {burstWindows.length > 0 && (
                <NeonPanel title="Loss Burst Detection" tone="secondary">
                    <div className="p-4 space-y-3">
                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            48-hour windows with ≥ 3 losses clustered together. Each burst suggests a
                            regime, event, or session condition that was repeatedly hostile.
                        </p>
                        <div className="space-y-2">
                            {burstWindows.map((w, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-3 px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))]"
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] font-num text-white">
                                                {w.lossCount} losses
                                            </span>
                                            <span className="text-[9.5px] font-num text-[hsl(var(--danger))]">
                                                {w.totalR.toFixed(1)}R total
                                            </span>
                                            {w.topSession && (
                                                <Pill tone="muted">{w.topSession}</Pill>
                                            )}
                                        </div>
                                        <div className="text-[9.5px] font-ui text-muted-lab">
                                            Starting {w.startTs} UTC
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}
