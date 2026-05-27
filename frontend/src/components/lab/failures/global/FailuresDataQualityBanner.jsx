// ── FailuresDataQualityBanner.jsx ────────────────────────────────────────────
// Phase 2: Shows field coverage warnings with module-level degradation info.
// Dismissible per session. Only renders when Tier 1 fields are missing.

import React from "react";
import { AlertTriangle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMissingTier1Fields, isTier0Only, FIELD_DEPS } from "../shared/failuresDataQuality";

// Which modules each Tier 1 field enables or upgrades
const FIELD_MODULE_IMPACT = {
    mae:                     { unlocks: ["Excursion analysis", "False loser confirmation"],       severity: "high" },
    mfe:                     { unlocks: ["Excursion analysis", "False loser confirmation"],       severity: "high" },
    minutes_to_exit:         { unlocks: ["Archetype TF calibration"],                            severity: "medium" },
    post_stop_continuation_r:{ unlocks: ["Confirmed false loser detection", "Stop raid analysis"], severity: "high" },
};

function FieldBadge({ label, impact }) {
    const borderCls = impact?.severity === "high"
        ? "border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.06)] text-[hsl(var(--danger))]"
        : "border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]";
    return (
        <span className={cn("inline-flex items-center px-1.5 py-px text-[9.5px] font-mono border clip-bevel-sm", borderCls)}>
            {label}
        </span>
    );
}

export function FailuresDataQualityBanner({ trades, className }) {
    const [dismissed, setDismissed] = React.useState(false);

    const missingTier1 = React.useMemo(
        () => getMissingTier1Fields(trades),
        [trades],
    );

    const tier0Only = React.useMemo(
        () => isTier0Only(trades),
        [trades],
    );

    if (!missingTier1.length || dismissed) return null;

    // Collect all capability strings that are locked
    const lockedCapabilities = missingTier1.flatMap(({ field }) =>
        FIELD_MODULE_IMPACT[field]?.unlocks ?? []
    );
    const uniqueLocked = [...new Set(lockedCapabilities)];

    return (
        <div className={cn("border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]", className)}>
            <div className="px-6 py-2.5 flex items-start gap-3">
                {tier0Only
                    ? <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    : <Info className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                }

                <div className="flex-1 min-w-0">
                    {tier0Only ? (
                        <p className="text-[10.5px] font-mono text-[hsl(var(--warning))] font-semibold uppercase tracking-wider">
                            Tier 0 data only — advanced modules unavailable
                        </p>
                    ) : (
                        <p className="text-[10.5px] font-mono text-[hsl(var(--warning))] font-semibold uppercase tracking-wider">
                            Some advanced fields missing
                        </p>
                    )}

                    {/* Missing fields */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {missingTier1.map(({ field, label }) => (
                            <FieldBadge key={field} label={label} impact={FIELD_MODULE_IMPACT[field]} />
                        ))}
                    </div>

                    {/* What's locked */}
                    {uniqueLocked.length > 0 && (
                        <p className="text-[9.5px] font-mono text-muted-lab mt-1.5">
                            Locked: {uniqueLocked.join(" · ")}
                            {" · "}
                            <span className="text-[hsl(var(--text-2))]">
                                Add these fields to your CSV export → re-import → modules activate automatically.
                            </span>
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="shrink-0 text-muted-lab hover:text-white transition-colors p-0.5"
                    aria-label="Dismiss data quality warning"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
