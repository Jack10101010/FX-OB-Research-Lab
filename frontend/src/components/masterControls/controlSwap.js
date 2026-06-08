// ─── Master Controls — instant FFT ON/OFF preview lens (Phase 10B) ────────────
//
// Pure utility (NO React, NO store, NO sidecar). Builds a temporary, bundle-shaped
// object that swaps the triggered-edge scenario trade sets for their already-exported
// FFT-OFF control counterparts (`controlTradesByScenario`). Fed through the same
// Preview Lens pipeline as the cost rescore (Phase 9A) and instant filter (Phase 10A):
// `bundleFor()` overlays it for the active run at read time, so StrategyMap / RunDetail
// / TradeSanity / Equity all reflect FFT-OFF on triggered-edge views WITHOUT any change
// to scenario resolution, the store, the importer or the backend.
//
// FFT (first-failed-tag cancel) only affects triggered-edge entries, so this swaps ONLY
// the triggered-edge collections in `entryResults.tradesByMode` (and recomputes their
// equity). Baseline / penetration trades are FFT-invariant and pass through unchanged —
// viewing a baseline scenario under "FFT OFF" therefore shows no change, by design.
//
// Direction: controls are the FFT-OFF universe, so the only meaningful operation is
// FFT ON → OFF. Any other request (already-OFF run, OFF→ON, no controls, no covered
// scenarios) returns null. Never mutates the source bundle.

import { equityFromTrades } from "./costRescore";

const FFT_CONFIG_KEY = "triggered_edge_cancel_on_first_failed_tag";

function obj(v) {
    return v && typeof v === "object" ? v : {};
}

/** Current FFT state of a bundle (true = ON / cancels on first failed tag). */
function isFftOn(bundle) {
    return Boolean(bundle?.config?.[FFT_CONFIG_KEY]);
}

/**
 * Bare scenario key for a `tradesByMode` key. The importer stores BOTH a bare key
 * (`entry_triggered_edge_25p0_next`) and a variant-prefixed key
 * (`allow_multi_position__entry_triggered_edge_25p0_next`) for the same scenario;
 * the `__` double-underscore separates the (single-underscore) variant from the
 * scenario. Bare keys contain no `__`, so this is a safe split.
 */
function bareScenarioOf(modeKey) {
    const i = String(modeKey).indexOf("__");
    return i >= 0 ? String(modeKey).slice(i + 2) : String(modeKey);
}

/** Scenario part of a control key `${variant}:${scenarioKey}`. */
function controlScenarioOf(controlKey) {
    const i = String(controlKey).indexOf(":");
    return i >= 0 ? String(controlKey).slice(i + 1) : String(controlKey);
}

function isTriggeredEdgeScenario(scenarioKey) {
    return String(scenarioKey).includes("triggered_edge");
}

/**
 * Build a temporary, bundle-shaped object that replaces the triggered-edge scenario
 * trade sets with their FFT-OFF control counterparts. Mirrors the Phase 9A / 10A
 * builders but performs a per-scenario UNIVERSE SWAP (not a rescore or subset). NOT a
 * store run — never added to state.runs, never persisted. Does NOT mutate sourceBundle.
 *
 * @param {object} sourceBundle             active run bundle (raw, lens-immune).
 * @param {{ fftEnabled: boolean }} options  the DESIRED FFT state (false = preview OFF).
 * @returns {object|null}  null when there is nothing to preview:
 *   - desired state equals the run's current state (no-op),
 *   - desired ON (controls are OFF-only; cannot synthesize ON),
 *   - no controls / no covered triggered-edge scenario.
 */
export function buildFftPreviewBundle(sourceBundle, options = {}) {
    if (!sourceBundle || typeof sourceBundle !== "object") return null;

    const currentFftOn = isFftOn(sourceBundle);
    const desiredFftOn = Boolean(options.fftEnabled);

    // Only ON → OFF is meaningful (controls are the FFT-OFF universe).
    if (desiredFftOn === currentFftOn) return null;
    if (desiredFftOn === true) return null;
    if (currentFftOn !== true) return null;

    const controlMap = obj(sourceBundle.controlTradesByScenario);
    const controlScenarioKeys = Object.keys(controlMap);
    if (controlScenarioKeys.length === 0) return null;

    // Index control trades by bare scenario key.
    const controlByScenario = {};
    for (const ck of controlScenarioKeys) {
        const arr = controlMap[ck];
        if (Array.isArray(arr)) controlByScenario[controlScenarioOf(ck)] = arr;
    }

    const srcEntry = obj(sourceBundle.entryResults);
    const srcTbm = obj(srcEntry.tradesByMode);
    const srcEcm = obj(srcEntry.equityCurveByMode);
    const hasEquityByMode = srcEntry.equityCurveByMode != null;

    const newTbm = { ...srcTbm };
    const newEcm = { ...srcEcm };

    const coveredSet = new Set();
    const teScenarios = new Set();

    for (const modeKey of Object.keys(srcTbm)) {
        const arr = srcTbm[modeKey];
        if (!Array.isArray(arr)) continue;
        const scenario = bareScenarioOf(modeKey);
        if (isTriggeredEdgeScenario(scenario)) teScenarios.add(scenario);
        const control = controlByScenario[scenario];
        if (Array.isArray(control)) {
            newTbm[modeKey] = control;                       // swap this key form (bare or prefixed)
            if (hasEquityByMode) newEcm[modeKey] = equityFromTrades(control);
            coveredSet.add(scenario);
        }
    }

    // Nothing actually swapped → nothing to preview.
    if (coveredSet.size === 0) return null;

    const coveredScenarios = [...coveredSet];
    const missingScenarios = [...teScenarios].filter((s) => !coveredSet.has(s));
    const swapScope = missingScenarios.length === 0 ? "full" : "partial";

    return {
        ...sourceBundle,
        id: `${sourceBundle.id}__fft_preview`,
        isTemporary: true,
        derivedFrom: sourceBundle.id,
        meta: {
            ...(sourceBundle.meta || {}),
            temporary: true,
            source: "master_controls_fft_preview",
            mode: "fft_swap",
            fftEnabled: false,
            swapScope,
            coveredScenarios,
            missingScenarios,
        },
        // Only the triggered-edge scenario collections change; everything else
        // (baseline trades, tradesByVariant, equityCurve, summary) is FFT-invariant
        // and passes through unchanged via the spread above.
        entryResults: {
            ...srcEntry,
            tradesByMode: newTbm,
            equityCurveByMode: newEcm,
        },
    };
}
