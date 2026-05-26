// ── PreventionEngine.jsx ─────────────────────────────────────────────────────
// Phase 1 placeholder — Prevention module.
// Will contain: FilterRecommendations, WouldThisHaveHelped, PreventionHypothesisExport.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { ShieldCheck } from "lucide-react";

export function PreventionEngine({ losers = [], allTrades = [] }) {
    return (
        <NeonPanel
            title="Prevention Engine"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" />
                    {losers.length} losses evaluated
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <ShieldCheck className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Prevention — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    22 prevention rules, filter catch rates, false positive cost, → HypothesisLab export bridge.
                </p>
            </div>
        </NeonPanel>
    );
}
