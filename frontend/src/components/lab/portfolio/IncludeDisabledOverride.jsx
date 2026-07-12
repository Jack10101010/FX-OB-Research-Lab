// IncludeDisabledOverride.jsx — Advanced Research option (SB-V2 UX polish, Part 4).
//
// The legacy "include disabled cohorts" research override, relocated OUT of the normal
// workflow into Advanced Research / Legacy. Same cfg field, same serialization
// (portfolioIncludeDisabledCohorts → portfolio_include_disabled_cohorts) — nothing
// about the run changes, only where the control lives. Prefer the "All Cohorts
// (Research)" eligibility preset for new research; this stays for old configs and
// PM-attributed research runs.

import React from "react";

export default function IncludeDisabledOverride({ cfg, onField }) {
    const on = Boolean(cfg?.portfolioEnabled);
    const includeDisabled = Boolean(cfg?.portfolioIncludeDisabledCohorts);
    return (
        <div className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3" data-testid="pm-include-disabled">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-[12px] font-ui text-[hsl(var(--text-1))]">
                        Include disabled cohorts <span className="text-[hsl(var(--warning))] text-[10px]">(research override)</span>
                    </div>
                    <div className="text-[11px] text-muted-lab font-ui max-w-xl mt-0.5">
                        PM stays active with its normal per-cohort logic, but NEVER TRADE cohorts run as
                        Always Allow (Label) for this run only — fully PM-attributed populations. The deployed
                        policy file and checksum are not modified. For new research prefer the
                        {" "}<span className="text-[hsl(var(--text-2))]">All Cohorts (Research)</span> eligibility preset with PM Label.
                    </div>
                </div>
                <button type="button" role="switch" aria-checked={includeDisabled}
                    data-testid="pm-include-disabled-toggle"
                    onClick={() => onField("portfolioIncludeDisabledCohorts", !includeDisabled)}
                    disabled={!on}
                    className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border-soft))] px-2.5 py-1 text-[11px] font-ui disabled:opacity-40"
                    style={{ color: includeDisabled ? "hsl(var(--warning))" : "hsl(var(--text-2))" }}>
                    <span className="inline-block w-8 h-4 rounded-full relative"
                        style={{ background: includeDisabled ? "hsl(var(--warning)/0.35)" : "hsl(var(--border-mid))" }}>
                        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                            style={{ left: includeDisabled ? "18px" : "2px" }} />
                    </span>
                    {includeDisabled ? "All cohorts ON" : "Deployed (OFF)"}
                </button>
            </div>
            {!on && <div className="mt-1.5 text-[10px] font-ui text-muted-lab">Portfolio Manager is off — this override has no effect until PM is enabled.</div>}
            {on && includeDisabled && (
                <div className="mt-2 text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="pm-include-disabled-note">
                    This run is <span className="font-semibold">PM · All cohorts</span> — every cohort participates; tagged in run metadata.
                </div>
            )}
        </div>
    );
}
