// ── FailureDrilldown.jsx ─────────────────────────────────────────────────────
// Phase 1 placeholder — Drilldown module.
// Will contain: FailureTradeTable, FailureTradeDetail, ManualTagPanel.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Search } from "lucide-react";

export function FailureDrilldown({ losers = [] }) {
    return (
        <NeonPanel
            title="Failure Drilldown"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    {losers.length} trades
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Search className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Drilldown — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Full failure trade table, per-trade detail panel, manual archetype override and note tagging.
                </p>
            </div>
        </NeonPanel>
    );
}
