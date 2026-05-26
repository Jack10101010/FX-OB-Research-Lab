// ── failuresDataQuality.js ───────────────────────────────────────────────────
// Field coverage detection for Failures Lab.
// Determines which modules are in "exact" vs "degraded/unavailable" mode.

import { fieldPresent } from "./failuresUtils";

// ── Field dependency map ──────────────────────────────────────────────────────

export const FIELD_DEPS = {
    // Tier 0 — always derivable from existing CSV fields
    outcome:       { tier: 0, label: "Outcome",         modules: ["all"] },
    r:             { tier: 0, label: "R result",         modules: ["all"] },
    direction:     { tier: 0, label: "Direction",        modules: ["direction", "overview"] },
    session:       { tier: 0, label: "Session",          modules: ["sessions", "overview"] },
    structure:     { tier: 0, label: "Structure",        modules: ["archetypes"] },
    ob_width:      { tier: 0, label: "OB Width",         modules: ["archetypes", "drilldown"] },
    entry:         { tier: 0, label: "Entry timestamp",  modules: ["temporal", "streaks"] },
    exit:          { tier: 0, label: "Exit timestamp",   modules: ["archetypes"] },

    // Tier 1 — exporter upgrades needed
    mae:           { tier: 1, label: "MAE (R)",          modules: ["excursion", "archetypes_full", "replay"] },
    mfe:           { tier: 1, label: "MFE (R)",          modules: ["excursion", "archetypes_full", "replay"] },
    minutes_to_exit:         { tier: 1, label: "Trade duration (min)", modules: ["archetypes_full"] },
    post_stop_continuation_r:{ tier: 1, label: "Post-stop continuation (R)", modules: ["false_losers"] },

    // Tier 2+
    htf_context:   { tier: 2, label: "HTF Context",     modules: ["prefailure"] },
    sweep_present: { tier: 2, label: "Sweep present",   modules: ["prefailure"] },
    ob_age_candles:{ tier: 2, label: "OB Age (candles)",modules: ["prefailure", "archetypes_full"] },
    fill_depth_pct:{ tier: 2, label: "Fill depth %",    modules: ["prefailure"] },
    news_minutes_offset: { tier: 4, label: "News offset (min)", modules: ["news"] },
};

// ── Coverage scan ─────────────────────────────────────────────────────────────

export function scanFieldCoverage(trades) {
    if (!Array.isArray(trades) || trades.length === 0) {
        return Object.fromEntries(
            Object.keys(FIELD_DEPS).map(k => [k, { coverage: 0, status: "absent" }])
        );
    }
    const result = {};
    for (const [field, meta] of Object.entries(FIELD_DEPS)) {
        if (meta.tier === 0) {
            result[field] = { coverage: 1, status: "ok", tier: 0 };
        } else {
            const present = fieldPresent(trades, field);
            result[field] = {
                coverage: present ? 1 : 0,
                status:   present ? "ok" : "absent",
                tier:     meta.tier,
            };
        }
    }
    return result;
}

// Returns which Tier 1 fields are missing (for the data quality banner)
export function getMissingTier1Fields(trades) {
    const tier1 = Object.entries(FIELD_DEPS).filter(([, v]) => v.tier === 1);
    return tier1
        .filter(([field]) => !fieldPresent(trades, field))
        .map(([field, meta]) => ({ field, label: meta.label }));
}

// Quick boolean: is this module fully available with current data?
export function isModuleAvailable(moduleName, trades) {
    const neededFields = Object.entries(FIELD_DEPS)
        .filter(([, v]) => v.tier > 0 && v.modules.includes(moduleName))
        .map(([field]) => field);
    if (neededFields.length === 0) return true;
    return neededFields.every(f => fieldPresent(trades, f));
}

// Returns true if only Tier 0 data is available (typical Phase 1 scenario)
export function isTier0Only(trades) {
    return getMissingTier1Fields(trades).length ===
        Object.keys(FIELD_DEPS).filter(k => FIELD_DEPS[k].tier === 1).length;
}
