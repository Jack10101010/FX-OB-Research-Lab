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
import { useDataset, getTradeUniverse, getTradeUniverseSignature } from "./store";

export function useTradeUniverse(runId = null, scenarioOverride = null) {
    // Subscribe to the store so the component re-renders on every notify
    // (scenario change, run switch, variant change, lazy load, etc.). We don't
    // use the returned object's identity as a memo key any more — see below.
    useDataset();

    // LAZY-RUN-PERFORMANCE Phase 1 — memo on a stable content signature rather
    // than the buildDerived() object (which is a NEW reference on every notify).
    // The signature changes only when an input getTradeUniverse actually reads
    // changes (run, scenario/variant selection, or this run's trade collections
    // — including lazy merges). Unrelated store updates leave it identical, so
    // the resolver no longer re-runs (and downstream memos don't bust) for
    // notifies that don't affect this run's universe. `scenarioOverride` content
    // is encoded in the signature, so an inline-object override with unchanged
    // content no longer forces a recompute either.
    const signature = getTradeUniverseSignature(runId, scenarioOverride);

    return useMemo(
        () => getTradeUniverse(runId, scenarioOverride),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature`
        // fully encodes runId + scenarioOverride content + the run's trade data;
        // depending on the raw scenarioOverride object would reintroduce
        // identity-churn recomputes this fix removes.
        [signature],
    );
}

export default useTradeUniverse;
