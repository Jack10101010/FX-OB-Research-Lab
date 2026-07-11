// RecommendedStackStrip.jsx — compact "recommended research stack" strip for SBv2.
//
// Shows the frozen research recommendation and a gentle diff of anything the current
// config does differently. Guidance only — never blocks a run. The "Apply recommended
// PM stack" button sets ONLY the layer fields (PM ON + global Market State gate OFF);
// entry threshold / arm delays remain the user's choice in the Entry card.

import React from "react";
import { RECOMMENDED_STACK, recommendedStackDiff, recommendedLayerPatch } from "@/data/portfolioRecommendation";

export default function RecommendedStackStrip({ cfg, sessionStrategy, onApply }) {
    const diffs = recommendedStackDiff(cfg, sessionStrategy);
    const R = RECOMMENDED_STACK;
    const items = [
        ["Triggered Entry", `${R.triggeredEntryThreshold}%`],
        ["Arm region", "C3–C4"],
        ["Portfolio Manager", "ON"],
        ["Global MS gate", "OFF"],
        ["Session-Scenario", "OFF"],
        ["RR", String(R.rr)],
    ];
    const canApply = diffs.some((d) => d.field === "Portfolio Manager" || d.field === "Global Market State gate");
    return (
        <div className="rounded-md border border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--panel))] p-3" data-testid="recommended-stack">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-[11px] font-ui text-[hsl(var(--accent-primary))]">Recommended research stack</span>
                {items.map(([k, v]) => (
                    <span key={k} className="text-[11px] font-ui text-muted-lab">
                        {k}: <span className="text-[hsl(var(--text-1))]">{v}</span>
                    </span>
                ))}
                {onApply && canApply && (
                    <button type="button" onClick={() => onApply(recommendedLayerPatch())}
                        data-testid="recommended-apply"
                        className="ml-auto text-[10.5px] font-ui rounded border border-[hsl(var(--accent-primary))] text-[hsl(var(--accent-primary))] px-2 py-0.5 hover:bg-[hsl(var(--accent-primary)/0.12)]">
                        Apply recommended PM stack
                    </button>
                )}
            </div>
            {diffs.length > 0 ? (
                <div className="mt-2 text-[10.5px] font-ui" data-testid="recommended-diff">
                    <span className="text-[hsl(var(--warning))]">Current config differs:</span>
                    <ul className="mt-0.5 space-y-0.5">
                        {diffs.map((d) => (
                            <li key={d.field} className="text-[hsl(var(--text-2))]">
                                • {d.field} is <span className="text-[hsl(var(--text-1))]">{d.current}</span>, recommended <span className="text-[hsl(var(--success))]">{d.recommended}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-1 text-muted-lab">Guidance only — you can run any settings you like.</div>
                </div>
            ) : (
                <div className="mt-2 text-[10.5px] font-ui text-[hsl(var(--success))]" data-testid="recommended-match">
                    ✓ Current config matches the recommended stack.
                </div>
            )}
        </div>
    );
}
