// ── DirectionalAsymmetry.jsx ─────────────────────────────────────────────────
// Phase 1 placeholder — Direction module.
// Will contain: DirectionMetricsCompare, DirectionArchetypeBreakdown, TailRiskByDirection.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { ArrowUpDown } from "lucide-react";

export function DirectionalAsymmetry({ losers = [] }) {
    return (
        <NeonPanel
            title="Directional Asymmetry"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <ArrowUpDown className="w-3 h-3" />
                    {losers.length} losses
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <ArrowUpDown className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Direction — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Long vs short loss rate comparison, CVaR tail risk, directional archetype breakdown.
                </p>
            </div>
        </NeonPanel>
    );
}
