// ── FailureDNA.jsx ───────────────────────────────────────────────────────────
// Phase 1 placeholder — DNA & Archetypes module.
// Will contain: FailureDNACard, FingerprintRadar, ClassificationConfidencePanel, ArchetypeMatrix.

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Dna } from "lucide-react";

export function FailureDNA({ losers = [] }) {
    return (
        <NeonPanel
            title="DNA & Archetypes"
            tone="default"
            className="m-6"
            action={
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab flex items-center gap-1.5">
                    <Dna className="w-3 h-3" />
                    {losers.length} classified
                </span>
            }
        >
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Dna className="w-8 h-8 text-muted-lab opacity-40" />
                <p className="text-[11px] font-mono text-muted-lab uppercase tracking-wider">
                    DNA & Archetypes — Phase 1
                </p>
                <p className="text-[10.5px] text-[hsl(var(--text-2))] max-w-xs leading-relaxed">
                    Failure DNA cards, fingerprint radar, classification confidence panel, archetype matrix.
                </p>
            </div>
        </NeonPanel>
    );
}
