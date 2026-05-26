// ── StreakAnalysis.jsx ───────────────────────────────────────────────────────
// Phase 1 placeholder — Streaks module.
// Will contain: ConsecutiveLossPanel, RunsTestPanel, SequenceDependency, StreakEquityOverlay.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { TrendingDown } from "lucide-react";

export function StreakAnalysis({ losers = [], allTrades = [] }) {
    return (
        <NeonPanel
            title="Streak & Sequence Analysis"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3" />
                    {losers.length} losses
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <TrendingDown className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Streaks — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Consecutive loss panels, Wald-Wolfowitz runs test, sequence dependency, streak equity overlay.
                </p>
            </div>
        </NeonPanel>
    );
}
