/**
 * BannerRunIdentity — the shared run-identity block (run name + symbol·TF + date
 * range + month span) used by BOTH ResearchResultViewBanner and
 * ResearchContextBanner (RESEARCH-RESULT-VIEW-BANNER). Single source so the
 * typography standard is identical everywhere and applies to new banners too.
 *
 * Typography standard (v1):
 *   • run name: prominent, scales up on large monitors
 *   • symbol·TF: secondary grey
 *   • date range + "N months": brighter + larger so it's easy to read at a glance
 *
 * Expects the `{ id, name, symbol, timeframe, dateRange, monthsSpan }` shape from
 * buildBannerRunIdentity. Renders nothing without a run.
 */

import React from "react";

export default function BannerRunIdentity({ run }) {
    if (!run) return null;
    const meta = [run.symbol, run.timeframe].filter(Boolean).join(" · ");
    const dateLine = [run.dateRange, run.monthsSpan].filter(Boolean).join(" · ");
    return (
        <div className="mb-3 pb-2.5 border-b border-[hsl(var(--border-soft)/0.3)]">
            <div className="text-[17px] xl:text-[19px] font-ui font-semibold text-[hsl(var(--text-1))] truncate leading-tight">
                {run.name || run.id || "Run"}
            </div>
            {(meta || dateLine) && (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    {meta && (
                        <span className="text-[12px] xl:text-[12.5px] font-ui text-[hsl(var(--text-2))]">{meta}</span>
                    )}
                    {dateLine && (
                        <span className="text-[12.5px] xl:text-[13.5px] font-ui font-medium text-[hsl(var(--text-1))]">{dateLine}</span>
                    )}
                </div>
            )}
        </div>
    );
}
