/**
 * useRunVariant — single source of truth for the Result View of a given run.
 *
 * RUN-VARIANT-HEADER Phase 1. Replaces RunDetail's local `resultView` fork with
 * the canonical store `scenario`, so a Result View change made on Run Detail now
 * PERSISTS (localStorage via setScenario) and PROPAGATES to every other consumer
 * of the store scenario — instead of being trapped in component state.
 *
 * Design (behaviour-preserving):
 *   • The effective Result View is the store `scenario` WHEN it targets this run
 *     (`scenario.runId === runId` and a non-null `family`). This includes an
 *     explicit "baseline" choice, so picking Baseline now sticks via the store.
 *   • Otherwise — a fresh run, or a stale scenario pointing at a different run —
 *     we fall back to `derivePrimaryResultView(bundle)` (config-intent aware),
 *     exactly as RunDetail did before. This keeps requirement #5: a triggered-
 *     edge / penetration run opens on its real variant, not a misleading Baseline.
 *   • Run scoping (`scenario.runId === runId`) preserves the original isolation
 *     guarantee: a Strategy Map selection for a *different* run never leaks in.
 *
 * The resolution rules live in the pure, dependency-free `runVariantResolve.js`
 * (so they can be unit-validated); this file only wires them to React + the store.
 * The hook does NOT change tradeUniverse selection semantics, never merges Arm C0
 * with Arm C1, and surfaces the resolver's warnings unchanged (via `universe`).
 *
 * @param {string|null} runId  the run whose Result View we own.
 * @returns {{
 *   resultView: { family, threshold, fillMode, directionalStorageKey },
 *   setResultView: (next) => void,   // writes through setScenario (persist + propagate)
 *   universe: object,                // useTradeUniverse(runId, resultView)
 *   runData: object|null,
 * }}
 */

import { useCallback, useMemo } from "react";
import { useDataset, setScenario } from "./store";
import { derivePrimaryResultView } from "./tradeUniverse";
import { useTradeUniverse } from "./useTradeUniverse";
import { resolveResultViewFrom, normalizeDefaultView } from "./runVariantResolve";
import { useLazyEntryVariant } from "./useLazyRows";

/**
 * The Result View a run opens on when the store scenario does not yet target it.
 * Config-intent aware (directional → single selected model → batch-key scan),
 * falling back to Baseline only when nothing else applies.
 */
export function deriveDefaultResultView(bundle) {
    return normalizeDefaultView(derivePrimaryResultView(bundle));
}

export function useRunVariant(runId) {
    // Subscribe to the store so the hook re-renders on scenario / run changes.
    const { SCENARIO, getRunData } = useDataset();
    const runData = getRunData ? getRunData(runId) : null;

    const resultView = useMemo(
        () => resolveResultViewFrom(SCENARIO, runId, deriveDefaultResultView(runData)),
        [SCENARIO, runId, runData],
    );

    // Result View changes are writes to the canonical scenario. We never touch
    // positionVariant here (orthogonal axis-1), so a lens change can't reset it.
    const setResultView = useCallback((next) => {
        if (!next || typeof next !== "object") return;
        // PROTECTION-LAYER Phase 2 — forward `layers` when the caller supplies
        // them (opening a protected Result View sets base view + layers together).
        // When absent, setScenario's safety net clears layers because the base
        // entry view changed.
        setScenario({
            runId: runId || null,
            family: next.family ?? "baseline",
            threshold: next.threshold ?? null,
            fillMode: next.fillMode ?? null,
            directionalStorageKey: next.directionalStorageKey ?? null,
            ...(Array.isArray(next.layers) ? { layers: next.layers } : {}),
        });
    }, [runId]);

    // Same resolver RunDetail used; resultView is passed as the scenario override.
    const universe = useTradeUniverse(runId, resultView);

    // LARGE-RUN-IMPORT Phase 2 — for a lazy/large run, fetch the selected entry
    // variant's rows on demand when they aren't resident yet. No-op for small/
    // eager runs and once rows are loaded. Surfaced as `lazyStatus` for UIs that
    // want a spinner; existing consumers can ignore it (additive return field).
    const lazyStatus = useLazyEntryVariant(runId, universe, runData);

    return { resultView, setResultView, universe, runData, lazyStatus };
}

export default useRunVariant;
