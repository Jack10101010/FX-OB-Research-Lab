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

// Arm-timing label for a Triggered Edge fill mode. Candle convention (matches the
// result-view header + Strategy Map): same=C0, next=C1, d2..d6=C2..C6. We label by
// CANDLE (C#) not delay, and same/next ARE C0/C1 — never shown as separate "Same"/
// "Next" chips.
function armLabelFromFillMode(fm) {
    const f = String(fm || "").toLowerCase();
    if (f === "same") return "C0";
    if (f === "next") return "C1";
    const dm = f.match(/^d(\d+)$/);
    return dm ? `C${dm[1]}` : null;
}

const armSortValue = (label) => {
    const m = /^C(\d+)$/.exec(label || "");
    return m ? Number(m[1]) : 999;
};

// Parse a BE entry-variant key → { groupKey, groupLabel, arm }.
//   triggered_edge_25p0_d3  → { groupLabel: "TE 25%", arm: "C3" }
//   penetration_50          → { groupLabel: "Pen 50%", arm: null }
//   baseline                → { groupLabel: "Baseline", arm: null }
function parseBeVariantKey(key) {
    if (!key || key === "baseline" || key === "entry_baseline") {
        return { groupKey: "baseline", groupLabel: "Baseline", arm: null };
    }
    const te = String(key).match(/triggered_edge_(\d+)p(\d*)_?(same|next|d\d+)?/i);
    if (te) {
        const thr = parseInt(te[1], 10);
        return { groupKey: `te_${thr}`, groupLabel: `TE ${thr}%`, arm: armLabelFromFillMode(te[3]) };
    }
    const pen = String(key).match(/penetration_(\d+)/i);
    if (pen) return { groupKey: `pen_${pen[1]}`, groupLabel: `Pen ${pen[1]}%`, arm: null };
    return { groupKey: String(key), groupLabel: String(key), arm: null };
}

// Short, human label for a BE entry-variant key (used in tooltips / flat lists).
// Candle convention: same=C0, next=C1, d#=C#.
function beVariantShortLabel(key) {
    const { groupLabel, arm } = parseBeVariantKey(key);
    return arm ? `${groupLabel} ${arm}` : groupLabel;
}

// Group a list of BE entry-variant keys by TE %/family → one entry per threshold
// carrying its exported arms (deduped, sorted C0→C6). Produces the grouped chips:
//   [{ groupKey, groupLabel, arms:["C0","C1",…], label:"TE 25% · C0, C1, C2" }]
function groupBeVariants(keys) {
    const groups = new Map();
    for (const key of keys || []) {
        const { groupKey, groupLabel, arm } = parseBeVariantKey(key);
        if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, groupLabel, arms: new Set() });
        if (arm) groups.get(groupKey).arms.add(arm);
    }
    return [...groups.values()].map((g) => {
        const arms = [...g.arms].sort((a, b) => armSortValue(a) - armSortValue(b));
        return {
            groupKey: g.groupKey,
            groupLabel: g.groupLabel,
            arms,
            label: arms.length ? `${g.groupLabel} · ${arms.join(", ")}` : g.groupLabel,
        };
    });
}

/**
 * Summarise which entry variants have EXACT break-even data on a run.
 * Reads beTradesByMode + beResults (nested [mode][entryVariantKey][scenarioKey]).
 * Returns { ran, variants[], variantLabels[], scenarioCount } — `ran=false` when
 * no BE was generated. Pure; tolerant of missing maps (lazy/old bundles).
 */
export function summarizeBeCoverage(run) {
    const maps = [run?.beTradesByMode, run?.beResults].filter((m) => m && typeof m === "object");
    const variants = new Set();
    const scenarioKeys = new Set();
    for (const m of maps) {
        for (const byEntry of Object.values(m)) {
            if (!byEntry || typeof byEntry !== "object") continue;
            for (const [evk, byScenario] of Object.entries(byEntry)) {
                if (!byScenario || typeof byScenario !== "object") continue;
                const keys = Object.keys(byScenario);
                if (keys.length) {
                    variants.add(evk || "baseline");
                    keys.forEach((k) => scenarioKeys.add(k));
                }
            }
        }
    }
    // Lazy/cube runs: BE rows aren't loaded yet, but beScenarioIndex lists the
    // generated BE files (entryVariantKey + scenarioKey) — count those too so the
    // runs table / banner still report BE as present without forcing a load.
    if (Array.isArray(run?.beScenarioIndex)) {
        for (const s of run.beScenarioIndex) {
            if (!s) continue;
            variants.add(s.entryVariantKey || "baseline");
            if (s.scenarioKey) scenarioKeys.add(s.scenarioKey);
        }
    }
    // Parse scenario keys (be_<trigger>_<arm>R) → distinct triggers + arm levels for
    // the detailed banner row.
    const triggers = new Set();
    const armSet = new Set();
    for (const k of scenarioKeys) {
        const m = String(k).match(/^be_(wick|close)_(\d+)p(\d+)r?$/i);
        if (!m) continue;
        triggers.add(m[1].toLowerCase());
        const arm = Number(`${parseInt(m[2], 10)}.${m[3]}`);
        if (Number.isFinite(arm)) armSet.add(arm);
    }
    const variantList = [...variants];
    const nonBaseline = variantList.filter((k) => k && k !== "baseline" && k !== "entry_baseline");
    return {
        ran: variantList.length > 0,
        variants: variantList,
        variantLabels: variantList.map(beVariantShortLabel),
        // Grouped chips — one entry per TE %/family carrying its exported arms
        // (C0–C6). Preferred for chip rendering; flat *Labels kept for tooltips.
        variantGroups: groupBeVariants(variantList),
        groupedVariantLabels: groupBeVariants(variantList).map((g) => g.label),
        // Non-baseline entry models with BE (preferred for display). Baseline is only
        // surfaced when it is the ONLY entry model that had BE.
        nonBaselineVariants: nonBaseline,
        nonBaselineVariantLabels: nonBaseline.map(beVariantShortLabel),
        nonBaselineVariantGroups: groupBeVariants(nonBaseline),
        nonBaselineGroupedLabels: groupBeVariants(nonBaseline).map((g) => g.label),
        hasNonBaseline: nonBaseline.length > 0,
        scenarioCount: scenarioKeys.size,
        triggers: [...triggers],
        triggerLabels: [...triggers].map((t) => (t === "wick" ? "Wick" : t === "close" ? "Close" : t)),
        arms: [...armSet].sort((a, b) => a - b),
    };
}

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
        // BE coverage for this run (which entry variants have EXACT break-even).
        beCoverage: summarizeBeCoverage(r),
    };
}

export default buildBannerRunIdentity;
