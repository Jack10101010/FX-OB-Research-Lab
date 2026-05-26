// ── ViewManager.jsx ──────────────────────────────────────────────────────────
// Phase 1 placeholder — Views & Export module.
// Will contain: ExportSystem, SavedForensicViews.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Download } from "lucide-react";

export function ViewManager({ losers = [] }) {
    return (
        <NeonPanel
            title="Views & Export"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <Download className="w-3 h-3" />
                    {losers.length} trades exportable
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Download className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    Views & Export — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    CSV export with field presets, saved forensic views, cross-run comparison workspace.
                </p>
            </div>
        </NeonPanel>
    );
}
