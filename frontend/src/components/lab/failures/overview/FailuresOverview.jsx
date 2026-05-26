// ── FailuresOverview.jsx ─────────────────────────────────────────────────────
// Phase 1 placeholder — Overview module.
// Will contain: FailureKPIStrip, ArchetypeDistributionSummary, FailureEquityImpact.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { LayoutDashboard } from "lucide-react";

export function FailuresOverview({ losers = [], allTrades = [] }) {
    return (
        <NeonPanel
            title="Overview"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <LayoutDashboard className="w-3 h-3" />
                    {losers.length} losses analysed
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <LayoutDashboard className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Overview — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    KPI strip, archetype distribution, equity curve with failure overlays.
                </p>
            </div>
        </NeonPanel>
    );
}
