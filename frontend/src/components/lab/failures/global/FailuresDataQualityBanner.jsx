// ── FailuresDataQualityBanner.jsx ────────────────────────────────────────────
// Shows field coverage warnings based on failuresDataQuality.js scan.
// Dismissible per session. Only renders when Tier 1 fields are missing.

import React from "react";
import { AlertTriangle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMissingTier1Fields, isTier0Only } from "../shared/failuresDataQuality";

const TIER1_UPGRADE_DOCS = [
    { field: "mae",                    label: "MAE (R)",                     fix: "Add mae column to your CSV export" },
    { field: "mfe",                    label: "MFE (R)",                     fix: "Add mfe column to your CSV export" },
    { field: "minutes_to_exit",        label: "Trade duration (min)",         fix: "Add entry+exit timestamps or minutes_to_exit column" },
    { field: "post_stop_continuation_r", label: "Post-stop continuation (R)", fix: "Add post_stop_continuation_r column for False Loser detection" },
];

function FieldBadge({ label }) {
    return (
        <span className="inline-flex items-center px-1.5 py-px text-[9.5px] font-mono border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))] clip-bevel-sm">
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

    // Nothing to show if all Tier 1 fields present or already dismissed
    if (!missingTier1.length || dismissed) return null;

    return (
        <div
            className={cn(
                "border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.05)]",
                className,
            )}
        >
            <div className="px-6 py-2.5 flex items-start gap-3">
                {tier0Only
                    ? <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    : <Info className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                }

                <div className="flex-1 min-w-0">
                    {tier0Only ? (
                        <>
                            <p className="text-[10.5px] font-mono text-[hsl(var(--warning))] font-semibold uppercase tracking-wider">
                                Tier 0 data only — some modules run in degraded mode
                            </p>
                            <p className="text-[10px] font-mono text-[hsl(var(--text-2))] mt-0.5">
                                Archetype classification, excursion analysis, and false-loser detection require additional CSV fields.
                                Upgrade your export to unlock full forensic power.
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-[10.5px] font-mono text-[hsl(var(--warning))] font-semibold uppercase tracking-wider">
                                Some advanced fields missing
                            </p>
                            <p className="text-[10px] font-mono text-[hsl(var(--text-2))] mt-0.5">
                                Missing:
                            </p>
                        </>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {missingTier1.map(({ field, label }) => (
                            <FieldBadge key={field} label={label} />
                        ))}
                    </div>

                    {tier0Only && (
                        <p className="text-[9.5px] font-mono text-muted-lab mt-1.5">
                            Add these fields to your backtester CSV export → re-import → full forensic mode activates automatically.
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
