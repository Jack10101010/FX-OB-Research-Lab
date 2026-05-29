/**
 * useTradeUniverse — canonical React hook for consuming the shared trade
 * universe across the app.
 *
 * Phase 2C: every lab/page that wants a scenario-aware, named trade list with
 * stats + warnings + baseline reference should call this hook instead of:
 *
 *   • reading raw `TRADES` from useDataset (baseline-only, ignores scenario)
 *   • hand-rolling `useMemo(() => getTradeUniverse(), [dataset])`
 *   • inlining a bespoke fallback chain (TRADES → tradesByVariant → … )
 *
 * Why a hook?
 *   - getTradeUniverse() is a pure store read; it doesn't subscribe.
 *   - useDataset() does subscribe and forces re-render on store notifies.
 *
 * Combining them here gives consumers React reactivity (state.scenario,
 * state.activeRunId, state.selectedTradeVariant changes trigger re-render)
 * AND memoization (the resolver doesn't re-run unless the dataset reference
 * actually changed). One hook, one source of truth.
 *
 * The returned object is the TradeUniverse documented in
 * `data/tradeUniverse.js`:
 *
 *   {
 *     universeType: "baseline" | "scenario",
 *     label, sourceKey, sourceFile,
 *     variant,
 *     scenario: { family, threshold, fillMode },
 *     trades: Trade[],
 *     stats: summarizeTradeSanity(trades),
 *     warnings: Array<{ code, message }>,
 *     canCompareToBaseline,
 *     baselineTrades, baselineStats,
 *   }
 *
 * @param {string|null} [runId]              defaults to the active run
 * @param {object|null} [scenarioOverride]   overrides `state.scenario` for this call
 * @returns {object} TradeUniverse
 */

import { useMemo } from "react";
import { useDataset, getTradeUniverse } from "./store";

export function useTradeUniverse(runId = null, scenarioOverride = null) {
    // Subscribe to the store so the hook re-runs on every notify (scenario
    // change, run switch, variant change, etc.). We don't actually use the
    // dataset shape here — `getTradeUniverse` reads `state` directly — but
    // we depend on `dataset` so the memo invalidates after each store update.
    const dataset = useDataset();

    return useMemo(
        () => getTradeUniverse(runId, scenarioOverride),
        // dataset is a fresh reference each notify (buildDerived returns a new
        // object), so this memo correctly invalidates per store change.
        // runId/scenarioOverride let parent components pin to a specific run
        // or do "what-if" comparisons against a hypothetical scenario.
        [dataset, runId, scenarioOverride],
    );
}

export default useTradeUniverse;
