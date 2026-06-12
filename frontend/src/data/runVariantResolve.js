/**
 * runVariantResolve — PURE, dependency-free resolution of a run's Result View
 * from the canonical store scenario (RUN-VARIANT-HEADER Phase 1).
 *
 * Kept free of React / store / tradeUniverse imports so it can be unit-validated
 * under plain node (see __validation__/useRunVariant.validate.mjs). The config-
 * intent-aware default is computed by the caller (useRunVariant, via
 * derivePrimaryResultView) and passed in as `defaultView`.
 */

export const BASELINE_VIEW = Object.freeze({
    family: "baseline",
    threshold: null,
    fillMode: null,
    directionalStorageKey: null,
    layers: [],
});

/**
 * Resolve the effective Result View.
 *
 * Adopt the store scenario WHEN it targets this run (`scenario.runId === runId`
 * and a truthy `family` — which includes an explicit "baseline" choice, so a
 * deliberate Baseline selection sticks rather than re-deriving). Otherwise — a
 * fresh/unset run, or a scenario pointing at a *different* run — return the
 * supplied `defaultView`. The run-scoping check preserves Run Detail's original
 * isolation guarantee: a selection for another run never leaks in.
 *
 * @param {object|null} scenario     the store scenario.
 * @param {string|null} runId        the run we are resolving for.
 * @param {object} defaultView       fallback Result View (config-intent-aware).
 * @returns {{family,threshold,fillMode,directionalStorageKey}}
 */
export function resolveResultViewFrom(scenario, runId, defaultView) {
    const targetsThisRun = Boolean(
        scenario && scenario.runId === runId && scenario.family,
    );
    if (targetsThisRun) {
        return {
            family: scenario.family,
            threshold: scenario.threshold ?? null,
            fillMode: scenario.fillMode ?? null,
            directionalStorageKey: scenario.directionalStorageKey ?? null,
            // PROTECTION-LAYER Phase 2 — carry protection layers through so the
            // protected universe survives Run Detail's Result View resolution.
            layers: Array.isArray(scenario.layers) ? scenario.layers : [],
        };
    }
    return defaultView;
}

/**
 * Normalise a derivePrimaryResultView() result (or null) into a full Result View
 * shape, falling back to Baseline only when nothing config-intent-aware applies.
 *
 * @param {object|null} primary  output of derivePrimaryResultView(bundle).
 */
/**
 * Merge a scenario patch with PROTECTION-LAYER Phase 2 layer-safety rules (pure;
 * used by store.setScenario so the behaviour is unit-testable):
 *   • patch carries `protection` (single-layer sugar) → promote to layers[] (or [] if invalid), strip `protection`.
 *   • patch changes the base ENTRY view (family/threshold/fillMode/directional) WITHOUT
 *     explicit `layers` → clear layers (a layer is only valid against its entry universe).
 *   • otherwise → keep existing layers (orthogonal changes like positionVariant/runId).
 * Layers are always sanitized to an array of valid {type} objects.
 */
export function applyScenarioPatchLayerSafety(current = {}, patch = {}) {
    const next = { ...current, ...patch };
    if ("protection" in patch) {
        next.layers = (patch.protection && typeof patch.protection.type === "string") ? [patch.protection] : [];
        delete next.protection;
    } else {
        const touchesEntryView = ["family", "threshold", "fillMode", "directionalStorageKey"].some((k) => k in patch);
        if (touchesEntryView && !("layers" in patch)) next.layers = [];
    }
    next.layers = (Array.isArray(next.layers) ? next.layers : []).filter((l) => l && typeof l.type === "string");
    return next;
}

export function normalizeDefaultView(primary) {
    if (!primary) return { ...BASELINE_VIEW };
    return {
        family: primary.family,
        threshold: primary.threshold ?? null,
        fillMode: primary.fillMode ?? null,
        directionalStorageKey: primary.directionalStorageKey ?? null,
        // A freshly-derived default view never carries protection layers.
        layers: [],
    };
}
