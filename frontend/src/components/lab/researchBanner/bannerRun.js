/**
 * bannerRun — shared run-identity builder for the research banners
 * (RESEARCH-RESULT-VIEW-BANNER).
 *
 * Produces the `{ id, name, symbol, timeframe, dateRange }` shape the banners'
 * run-identity cell expects, from a run bundle or summary. Centralised so every
 * deployed page surfaces identity CONSISTENTLY (name + symbol·TF + date range)
 * instead of each page hand-rolling the field lookups (which drifted / produced
 * "incomplete" banners). Pure data shaping — no React, no tradeUniverse semantics.
 *
 * Date range reuses the SAME canonical derivation the LabRunHero uses
 * (`readHeroDateRange` + `formatHeroDateRange`), so the banner's range matches the
 * hero's and follows one robust fallback chain (run.dateRange → summary.date_*  →
 * config.start_date/end_date → dateFrom/dateTo, …). Never invents dates; omits
 * cleanly when no source field is present.
 */

import { getRunDisplayName } from "@/data/store";
import { readHeroDateRange, formatHeroDateRange, formatHeroMonthSpan } from "@/components/lab/labHeroUtils";

export function buildBannerRunIdentity(runOrBundle) {
    if (!runOrBundle) return null;
    const r = runOrBundle;
    const summary = r.summary || r;
    // Canonical, hero-consistent date range + month span (e.g. "7 months"); both
    // null when no source field exists → omitted cleanly. Never invents dates.
    const rangeValue = readHeroDateRange(r, summary);
    const dateRange = formatHeroDateRange(rangeValue) || null;
    const monthsSpan = formatHeroMonthSpan(rangeValue) || null;
    return {
        id: r.id ?? summary.id ?? null,
        name: getRunDisplayName(r),
        symbol: summary.symbol ?? r.symbol ?? r.config?.symbol ?? null,
        timeframe:
            summary.detectionTf
            ?? summary.detection_tf
            ?? r.config?.detection_timeframe
            ?? summary.executionTf
            ?? summary.execution_tf
            ?? null,
        dateRange,
        monthsSpan,
    };
}

export default buildBannerRunIdentity;
