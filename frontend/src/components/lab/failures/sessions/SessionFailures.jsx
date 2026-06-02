// ── SessionFailures.jsx ──────────────────────────────────────────────────────
// Phase 1: Session failure rates, directional split per session, top archetype per session.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable } from "@/components/lab/DataTable";
import { Pill } from "@/components/lab/DataTable";
import { computeSessionFailureRates } from "../shared/failuresAnalytics";
import { archetypeLabel } from "../shared/failuresRegistry";
import { directionOf, sessionOf, round1 } from "../shared/failuresUtils";

// ── Pure helper: top archetype per session ────────────────────────────────────

function buildSessionArchSummary(losers) {
    const map = {};
    for (const t of losers) {
        const sess = t.session || sessionOf(t?.entry) || "Unknown";
        const arch = t.archetype || "standard_loss";
        if (!map[sess]) map[sess] = {};
        map[sess][arch] = (map[sess][arch] || 0) + 1;
    }
    return Object.entries(map).map(([sess, counts]) => {
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        return { session: sess, archetype: top[0], count: top[1] };
    });
}

// ── Module ────────────────────────────────────────────────────────────────────

export function SessionFailures({ losers = [], allLosers = [], allTrades = [] }) {
    const sessionRates  = useMemo(() => computeSessionFailureRates(allTrades), [allTrades]);
    const archSummary   = useMemo(() => buildSessionArchSummary(allLosers), [allLosers]);

    // Directional split per session (from allLosers so cohort filter doesn't skew it)
    const sessionDirMap = useMemo(() => {
        const map = {};
        for (const t of allLosers) {
            const sess = t.session || sessionOf(t?.entry) || "Unknown";
            const dir  = directionOf(t);
            if (!map[sess]) map[sess] = { long: 0, short: 0, unknown: 0 };
            if      (dir === "long")  map[sess].long++;
            else if (dir === "short") map[sess].short++;
            else                      map[sess].unknown++;
        }
        return map;
    }, [allLosers]);

    const sessionRows = sessionRates.filter(s => s.total > 0);

    const sessionColumns = [
        { key: "session",     label: "Session",    sortable: false },
        { key: "total",       label: "Trades",     sortable: true },
        { key: "lossCount",   label: "Losses",     sortable: true },
        { key: "winCount",    label: "Wins",       sortable: true },
        {
            key: "lossRate", label: "Loss %", sortable: true,
            render: r => (
                <span className={r.lossRate > 45 ? "text-[hsl(var(--warning))] font-semibold" : ""}>
                    {r.lossRate}%
                </span>
            ),
        },
        {
            key: "avgSeverity", label: "Avg Sev", sortable: true,
            render: r => r.avgSeverity != null ? r.avgSeverity.toFixed(1) : "—",
        },
    ];

    if (!allTrades.length) return null;

    return (
        <div className="p-6 space-y-4">
            {/* Rates table */}
            <NeonPanel title="Session Failure Rates">
                <DataTable
                    columns={sessionColumns}
                    rows={sessionRows}
                    rowKey="session"
                    defaultSortKey="lossRate"
                    defaultSortDir="desc"
                    maxHeight="300px"
                />
            </NeonPanel>

            {/* Directional split per session */}
            <NeonPanel title="Loss Direction per Session" dense>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {sessionRows.map(sess => {
                        const dirs  = sessionDirMap[sess.session] || { long: 0, short: 0 };
                        const total = dirs.long + dirs.short;
                        const longPct  = total > 0 ? round1((dirs.long  / total) * 100) : null;
                        const shortPct = total > 0 ? round1((dirs.short / total) * 100) : null;
                        return (
                            <div key={sess.session} className="bg-[hsl(var(--panel-2))] clip-bevel-sm p-2.5 space-y-1.5">
                                <div className="text-[10px] font-ui text-[hsl(var(--accent-primary))] uppercase tracking-wider font-semibold">
                                    {sess.session}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9.5px] font-num text-[hsl(var(--success))]">L: {dirs.long}</span>
                                    {longPct != null && <span className="text-[8.5px] font-num text-muted-lab">({longPct}%)</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9.5px] font-num text-[hsl(var(--danger))]">S: {dirs.short}</span>
                                    {shortPct != null && <span className="text-[8.5px] font-num text-muted-lab">({shortPct}%)</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </NeonPanel>

            {/* Top archetype per session */}
            {archSummary.length > 0 && (
                <NeonPanel title="Dominant Archetype per Session" dense>
                    <div className="p-3 flex flex-wrap gap-2">
                        {archSummary.map(({ session, archetype, count }) => (
                            <div key={session} className="flex items-center gap-2 px-3 py-1.5 border border-[hsl(var(--border-soft))] clip-bevel-sm">
                                <span className="text-[10px] font-ui text-[hsl(var(--accent-primary))]">{session}:</span>
                                <Pill tone="muted">{archetypeLabel(archetype)}</Pill>
                                <span className="text-[9.5px] font-num text-muted-lab">×{count}</span>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            )}
        </div>
    );
}
