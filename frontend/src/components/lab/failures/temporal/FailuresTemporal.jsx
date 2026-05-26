// ── FailuresTemporal.jsx ─────────────────────────────────────────────────────
// Phase 1 placeholder — Temporal module.
// Will contain: TemporalHeatmap, WinFailureDelta, SeasonalPatterns.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Clock } from "lucide-react";

export function FailuresTemporal({ losers = [] }) {
    return (
        <NeonPanel
            title="Temporal Patterns"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {losers.length} losses
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Clock className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Temporal — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Hour/day heatmap, win vs failure delta by hour, monthly and quarterly patterns.
                </p>
            </div>
        </NeonPanel>
    );
}
