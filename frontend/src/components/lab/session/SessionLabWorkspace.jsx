/**
 * SessionLabWorkspace — top-level layout for Session Lab.
 *
 * Owns:
 *   - Direction toggle (Both / Long Only / Short Only) persisted to localStorage
 *   - Selected session state
 *   - Session card grid (3-col desktop)
 *   - Inline drilldown below the selected card
 *   - Session comparison table at the bottom
 *
 * Props:
 *   trades   object[]  — canonical trade list from useTradeUniverse()
 *   bundle   object    — active run bundle (for metadata display)
 */

import React, { useMemo, useState, useCallback } from "react";
import { Clock, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import { Segment } from "@/components/lab/controls";
import { SessionCard } from "./SessionCard";
import { SessionDrilldown } from "./SessionDrilldown";
import {
    buildSessionProfiles,
    buildSessionComparisonRows,
    resolveSession,
} from "./analytics/sessionAnalytics";
import { SESSION_KEYS } from "./config/sessionConfig";

// ── Constants ─────────────────────────────────────────────────────────────────

const DIRECTION_LS_KEY = "fxob_session_lab_direction_v1";

const DIRECTION_OPTIONS = [
    { label: "Both",       value: "both"  },
    { label: "Long Only",  value: "long"  },
    { label: "Short Only", value: "short" },
];

// ── Direction Banner ──────────────────────────────────────────────────────────

function DirectionBanner({ direction }) {
    if (direction === "both") return null;
    const label = direction === "long" ? "Long Only — Shorts hidden from all metrics"
                                       : "Short Only — Longs hidden from all metrics";
    return (
        <div className="flex items-center gap-2 px-4 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm text-[11px] font-ui text-[hsl(var(--warning))]">
            <span className="uppercase tracking-wider">Viewing:</span>
            <span>{label}</span>
        </div>
    );
}

// ── Session Settings Placeholder ─────────────────────────────────────────────

function SessionSettingsButton() {
    return (
        <button
            type="button"
            disabled
            title="Coming soon: custom session times and timezone/DST handling"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-muted-lab clip-bevel-sm cursor-not-allowed opacity-60"
            data-testid="session-settings-placeholder"
        >
            <Settings2 className="w-3 h-3" />
            Session Settings
        </button>
    );
}

// ── SessionLabWorkspace ───────────────────────────────────────────────────────

export function SessionLabWorkspace({ trades, bundle }) {
    // Direction toggle — persisted in localStorage
    const [direction, setDirection] = useState(() => {
        try {
            const stored = localStorage.getItem(DIRECTION_LS_KEY);
            if (stored === "long" || stored === "short" || stored === "both") return stored;
        } catch { /* noop */ }
        return "both";
    });

    const [selectedSession, setSelectedSession] = useState(null);

    const handleDirectionChange = useCallback((val) => {
        setDirection(val);
        try { localStorage.setItem(DIRECTION_LS_KEY, val); } catch { /* noop */ }
    }, []);

    const handleSelectSession = useCallback((session) => {
        setSelectedSession((prev) => (prev === session ? null : session));
    }, []);

    // Compute session profiles (one per session key)
    const profiles = useMemo(
        () => buildSessionProfiles(trades || [], direction),
        [trades, direction],
    );

    // Comparison table rows
    const comparisonRows = useMemo(
        () => buildSessionComparisonRows(profiles),
        [profiles],
    );

    // Direction-filtered all trades (for comparison table)
    const dirTrades = useMemo(() => {
        if (!trades?.length) return [];
        if (direction === "both") return trades;
        return trades.filter((t) => {
            const d = String(t.direction || "").toLowerCase();
            if (direction === "long") return d === "long" || d === "buy" || d === "bull";
            return d === "short" || d === "sell" || d === "bear";
        });
    }, [trades, direction]);

    // Active session profile for drilldown
    const activeProfile = selectedSession
        ? profiles.find((p) => p.session === selectedSession) || null
        : null;

    const hasAnyTrades = profiles.some((p) => p.metrics.tradeCount > 0);

    return (
        <div className="space-y-6">
            {/* Top controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-[0.12em] text-muted-lab">Direction</span>
                    <Segment
                        options={DIRECTION_OPTIONS}
                        value={direction}
                        onChange={handleDirectionChange}
                        testId="session-direction-toggle"
                    />
                </div>
                <div className="ml-auto">
                    <SessionSettingsButton />
                </div>
            </div>

            {/* Direction banner */}
            <DirectionBanner direction={direction} />

            {/* Session card grid */}
            {!hasAnyTrades ? (
                <div className="text-[12px] font-ui text-muted-lab border border-dashed border-[hsl(var(--border-soft))] clip-bevel-sm px-6 py-8 text-center">
                    No trades found in the active run for this direction filter.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {profiles
                            .filter((p) => p.metrics.tradeCount > 0)
                            .map((profile) => (
                                <SessionCard
                                    key={profile.session}
                                    session={profile.session}
                                    metrics={profile.metrics}
                                    sessionTrades={profile.sessionTrades}
                                    onSelect={handleSelectSession}
                                    isSelected={selectedSession === profile.session}
                                />
                            ))}
                    </div>

                    {/* Inline drilldown — shown below the grid when a card is selected */}
                    {activeProfile && (
                        <SessionDrilldown
                            session={activeProfile.session}
                            metrics={activeProfile.metrics}
                            sessionTrades={activeProfile.sessionTrades}
                            allTrades={trades || []}
                            direction={direction}
                        />
                    )}
                </>
            )}

            {/* Session Comparison Table */}
            {comparisonRows.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-ui uppercase tracking-[0.12em] text-muted-lab">
                            Session Comparison
                        </span>
                        {direction !== "both" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))] clip-bevel-sm">
                                {direction === "long" ? "Longs" : "Shorts"}
                            </span>
                        )}
                    </div>
                    <CanonicalBucketTable
                        title="All Sessions"
                        rawRows={comparisonRows}
                        trades={dirTrades}
                        def={{
                            labelFn: (t) => resolveSession(t),
                            order: SESSION_KEYS,
                        }}
                        basisFooter
                        controlsPopover
                        defaultSortKey="netR"
                    />
                </div>
            )}
        </div>
    );
}

export default SessionLabWorkspace;
