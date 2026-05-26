// ── SessionFailures.jsx ──────────────────────────────────────────────────────
// Phase 1 placeholder — Sessions module.
// Will contain: SessionFailureRates, OriginFillSessionMatrix, SessionArchetypeBreakdown.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Globe } from "lucide-react";

export function SessionFailures({ losers = [] }) {
    return (
        <NeonPanel
            title="Session Failures"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <Globe className="w-3 h-3" />
                    {losers.length} losses
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Globe className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Sessions — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Session failure rates, origin vs fill session matrix, session archetype breakdown.
                </p>
            </div>
        </NeonPanel>
    );
}
