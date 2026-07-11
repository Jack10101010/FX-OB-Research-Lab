// portfolioRecommendation.js — the frozen research recommended stack + a gentle
// "current config differs" diff. PURE (no React). Guidance only — never blocks a run.
//
// Recommended: Triggered Entry 25%, arm region C3–C4, Portfolio Manager ON,
// Global Market State gate OFF, Session-Scenario disable layer OFF, RR2.

export const RECOMMENDED_STACK = {
    triggeredEntryThreshold: 25,
    armRegion: [3, 4],           // C3–C4 (candle delays 3 and 4)
    portfolioManager: true,
    globalMarketStateGate: false,
    sessionScenarioLayer: false,
    rr: 2,
};

// Read the currently-selected TE thresholds from a builder cfg (array or legacy single).
function currentThresholds(cfg) {
    const arr = Array.isArray(cfg?.singleTriggeredEdgeThresholds) && cfg.singleTriggeredEdgeThresholds.length
        ? cfg.singleTriggeredEdgeThresholds
        : (cfg?.singleTriggeredEdgeThreshold != null ? [cfg.singleTriggeredEdgeThreshold] : []);
    return arr.map(Number).filter((n) => Number.isFinite(n));
}

function currentDelays(cfg) {
    return Array.isArray(cfg?.triggeredEdgeDelays) ? cfg.triggeredEdgeDelays.map(Number).filter(Number.isFinite) : [];
}

/**
 * Return a list of { field, current, recommended } for every setting that differs from
 * the recommended stack. Empty array ⇒ config matches the recommendation. Non-blocking.
 * `sessionStrategy` is optional; when provided, the Session-Scenario layer is diffed too.
 */
export function recommendedStackDiff(cfg, sessionStrategy = null) {
    const diffs = [];
    const R = RECOMMENDED_STACK;

    // Portfolio Manager
    const pmOn = Boolean(cfg?.portfolioEnabled);
    if (pmOn !== R.portfolioManager) {
        diffs.push({ field: "Portfolio Manager", current: pmOn ? "ON" : "OFF", recommended: "ON" });
    }
    // Global Market State gate
    const msOn = Boolean(cfg?.regimeEnabled);
    if (msOn !== R.globalMarketStateGate) {
        diffs.push({ field: "Global Market State gate", current: msOn ? "ON" : "OFF", recommended: "OFF" });
    }
    // TE threshold (only meaningful when triggered_edge is selected)
    const usingTE = cfg?.selectedEntryModel === "triggered_edge" || (Array.isArray(cfg?.entry_models) && cfg.entry_models.includes("triggered_edge"));
    if (usingTE) {
        const thr = currentThresholds(cfg);
        if (!(thr.length === 1 && thr[0] === R.triggeredEntryThreshold)) {
            diffs.push({ field: "Triggered Entry threshold", current: thr.length ? thr.join(", ") + "%" : "—", recommended: "25%" });
        }
        // Arm region C3–C4
        const delays = currentDelays(cfg);
        const hasArm = R.armRegion.every((d) => delays.includes(d));
        if (!hasArm) {
            diffs.push({ field: "Arm region", current: delays.length ? "C" + delays.join(", C") : "—", recommended: "C3–C4" });
        }
    }
    // Session-Scenario disable layer (best-effort; only when a scenario object is provided)
    if (sessionStrategy && sessionStrategy.enabled === true) {
        diffs.push({ field: "Session-Scenario layer", current: "ON", recommended: "OFF" });
    }
    return diffs;
}

// Apply just the LAYER-STACK part of the recommendation (PM ON + global MS gate OFF).
// Deliberately does NOT touch entry threshold / arm delays (those are the user's entry
// choices, edited in the Entry card). Returns a partial cfg patch.
export function recommendedLayerPatch() {
    return { portfolioEnabled: true, regimeEnabled: false };
}
