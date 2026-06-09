// ─── Master Controls — generic bundle trade-collection walker (Phase 12B-1) ──
//
// Pure utility (NO React, NO store, NO sidecar). Factors out the trade-collection
// traversal that every Preview Lens builder (cost / filter / FFT / RR) currently
// re-implements by hand. Given a source bundle and a single per-array transform,
// it walks ALL trade collections, applies the transform once per array, recomputes
// every paired equity curve from the transformed rows, and rebuilds the top-level
// primary trades / equity / summary. The SOURCE IS NEVER MUTATED (every map and
// nested object is copied; only changed fields are overridden).
//
// Collections walked (the canonical six):
//   • trades                                   (top-level primary)
//   • tradesByVariant[*]
//   • entryResults.tradesByMode[*]
//   • protectionResults.tradesByMode[*]
//   • directionalResults.tradesByScenario[*]
//   • controlTradesByScenario[*]               (no paired equity map)
//
// Equity recomputed (once, from the FINAL transformed rows, via equityFromTrades):
//   • equityCurve                              (top-level primary)
//   • equityCurveByVariant[*]
//   • entryResults.equityCurveByMode[*]
//   • protectionResults.equityCurveByMode[*]
//   • directionalResults.equityCurveByScenario[*]
//
// The walker is intentionally meta-free: it does NOT stamp id / meta / isTemporary.
// Callers (e.g. previewComposer) own provenance. This keeps the walker a pure
// structural transform that can back any lens.

import { summarizeTradeSanity } from "@/data/tradeClassification";
import { equityFromTrades } from "./costRescore";

function obj(v) {
    return v && typeof v === "object" ? v : {};
}

/** Primary trade list of a bundle: primary variant → bundle.trades → largest variant. */
export function pickPrimaryTrades(bundle) {
    if (!bundle || typeof bundle !== "object") return [];
    const tbv = obj(bundle.tradesByVariant);
    const primary = bundle.primaryVariant;
    if (primary && Array.isArray(tbv[primary])) return tbv[primary];
    if (Array.isArray(bundle.trades) && bundle.trades.length) return bundle.trades;
    const arrays = Object.values(tbv).filter(Array.isArray);
    return arrays.slice().sort((a, b) => b.length - a.length)[0] || [];
}

/**
 * Roll up the summary fields a recomputed primary trade set needs, via the canonical
 * classifier so it matches every consuming surface (KPI strips, ledgers, equity).
 * Mirrors rrRescore.summarizeArray (plus an explicit `trades` count).
 */
export function summarizeBundlePrimary(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const s = summarizeTradeSanity(list);
    return {
        netR: s.netRPerformance ?? 0,
        avgR: s.expectancy ?? null,
        maxDd: s.maxDrawdownR != null ? Math.abs(s.maxDrawdownR) : null,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        winRate: s.winRate ?? null,
        trades: list.length,
    };
}

/**
 * Transform every array in a trade map, recomputing the paired equity map from the
 * transformed rows. Source is never mutated. `sourceEquity === null/undefined` means
 * the collection has no equity map (e.g. controlTradesByScenario), so none is built.
 */
function mapTradeMap(sourceTrades, sourceEquity, fn, collection) {
    const srcTrades = obj(sourceTrades);
    const tradesMap = { ...srcTrades };
    const equityMap = { ...obj(sourceEquity) };
    const hasEquity = sourceEquity !== null && sourceEquity !== undefined;
    for (const [key, arr] of Object.entries(srcTrades)) {
        if (!Array.isArray(arr)) continue;
        const next = fn(arr, { collection, key });
        tradesMap[key] = next;
        if (hasEquity) equityMap[key] = equityFromTrades(next);
    }
    return { tradesMap, equityMap };
}

/**
 * Transform a nested results object (entryResults / protectionResults /
 * directionalResults) that holds a `tradesKey` map and a parallel `equityKey` map.
 * Preserves every other field (summary, sourceFiles, …). Returns null when the source
 * lacks the nested object, so the caller can avoid fabricating it.
 */
function mapNested(sourceNested, tradesKey, equityKey, fn, collection) {
    if (!sourceNested || typeof sourceNested !== "object") return null;
    const { tradesMap, equityMap } = mapTradeMap(sourceNested[tradesKey], sourceNested[equityKey], fn, collection);
    return { ...sourceNested, [tradesKey]: tradesMap, [equityKey]: equityMap };
}

/**
 * Walk every trade collection in `sourceBundle`, applying `transformArray` once per
 * array, recomputing all paired equity curves + the top-level primary trades / equity
 * / summary. Pure: never mutates the source.
 *
 * @param {object} sourceBundle   ingestRunBundle-shaped bundle.
 * @param {(arr: Array, ctx: { collection: string, key: string|null }) => Array} transformArray
 *        Per-array transform. Receives a (possibly empty) array + a context tag and
 *        returns the transformed array. Must be pure (it may return the same array
 *        unchanged for a no-op). The walker always passes an array (never null/undefined).
 * @param {object} [options]   reserved for future use (e.g. summary overrides).
 * @returns {{ bundle: object, primaryTrades: Array }}  the transformed bundle (a fresh
 *          object) plus the final primary trade set the summary/equity were built from.
 *          When `sourceBundle` is not an object, returns it untouched with [] primaries.
 */
export function mapBundleTradeCollections(sourceBundle, transformArray, options = {}) {
    if (!sourceBundle || typeof sourceBundle !== "object") {
        return { bundle: sourceBundle, primaryTrades: [] };
    }
    const fn = typeof transformArray === "function"
        ? transformArray
        : (arr) => (Array.isArray(arr) ? arr : []);
    const apply = (arr, collection, key) => fn(Array.isArray(arr) ? arr : [], { collection, key });

    const primaryVariant = sourceBundle.primaryVariant;
    const srcTbv = obj(sourceBundle.tradesByVariant);

    // ── tradesByVariant + equityCurveByVariant ──
    const { tradesMap: tradesByVariant, equityMap: equityCurveByVariant } = mapTradeMap(
        sourceBundle.tradesByVariant, sourceBundle.equityCurveByVariant, fn, "tradesByVariant",
    );

    // ── top-level primary trades (reuse the transformed primary variant when present) ──
    let primaryTrades;
    if (primaryVariant && Array.isArray(srcTbv[primaryVariant])) {
        primaryTrades = tradesByVariant[primaryVariant];
    } else {
        primaryTrades = apply(pickPrimaryTrades(sourceBundle), "trades", null);
        // Guarantee the primary key exists even if the source map omitted it.
        if (primaryVariant) {
            tradesByVariant[primaryVariant] = primaryTrades;
            equityCurveByVariant[primaryVariant] = equityFromTrades(primaryTrades);
        }
    }
    const equityCurve = equityFromTrades(primaryTrades);

    // ── nested results objects ──
    const entryResults = mapNested(
        sourceBundle.entryResults, "tradesByMode", "equityCurveByMode", fn, "entryResults.tradesByMode",
    );
    const protectionResults = mapNested(
        sourceBundle.protectionResults, "tradesByMode", "equityCurveByMode", fn, "protectionResults.tradesByMode",
    );
    const directionalResults = mapNested(
        sourceBundle.directionalResults, "tradesByScenario", "equityCurveByScenario", fn, "directionalResults.tradesByScenario",
    );

    // ── controlTradesByScenario (top-level map, no paired equity map) ──
    const hasControl = sourceBundle.controlTradesByScenario
        && typeof sourceBundle.controlTradesByScenario === "object";
    const { tradesMap: controlTradesByScenario } = mapTradeMap(
        sourceBundle.controlTradesByScenario, null, fn, "controlTradesByScenario",
    );

    const out = {
        ...sourceBundle,
        trades: primaryTrades,
        tradesByVariant,
        equityCurve,
        equityCurveByVariant,
        summary: {
            ...(sourceBundle.summary || {}),
            ...summarizeBundlePrimary(primaryTrades),
        },
    };

    // Only override nested result objects the source actually had (don't fabricate them).
    if (entryResults) out.entryResults = entryResults;
    if (protectionResults) out.protectionResults = protectionResults;
    if (directionalResults) out.directionalResults = directionalResults;
    if (hasControl) out.controlTradesByScenario = controlTradesByScenario;

    return { bundle: out, primaryTrades };
}
