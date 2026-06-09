// ─── Master Controls — stop-anchored RR Preview Lens (Phase 11C) ─────────────
//
// Pure utility (NO React, NO store, NO sidecar). Builds a temporary, bundle-shaped
// object that re-targets each trade to a new RR multiple using the backend's
// stop-anchored excursion fields (mfeR / rIfNoTarget, exported by Lux-OB-Backtester
// Phase 11A and mapped by importer Phase 11B). Fed through the same Preview Lens
// pipeline as the cost / filter / FFT lenses.
//
// MODEL BOUNDARY — STOP-ANCHORED. The rule answers ONLY: "if the take-profit were
// moved to `newRR`, would price reach it before the FIRST stop touch?" It uses
// `r_if_no_target` (the realized R with the target removed, bounded by the fixed
// stop / end-of-data). It does NOT replay protection / news / time exits that would
// fire during the counterfactual continuation after the old TP. The bundle meta and
// drawer surface this; do not present it as full backend-equivalent simulation.
//
// Per-trade rule (filled trades that carry usable excursion fields):
//   newR = (mfeR >= newRR) ? +newRR : rIfNoTarget
//   outcome = newR > 0 ? "WIN" : newR < 0 ? "LOSS" : "BREAKEVEN"   (classifier-compatible)
//
// Exactness is conservative: a trade lacking the fields is left untouched, and the
// collection is marked partial; a bundle with NO excursion fields anywhere returns
// unavailable (old bundles must be re-exported/re-imported). Never mutates the input.

import { summarizeTradeSanity, classifyTrade, PERFORMANCE_CATEGORIES } from "@/data/tradeClassification";
import { equityFromTrades } from "./costRescore";

export const RR_REQUIRED_FIELDS = Object.freeze(["mfeR", "rIfNoTarget"]);

const EPS = 1e-9;
const RR_MODEL = "stop_anchored";
export const RR_PREVIEW_WARNING =
    "Stop-anchored RR preview. Does not replay protection / news exits after the old TP.";

function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function obj(v) {
    return v && typeof v === "object" ? v : {};
}

/** Primary trade list: primary variant → bundle.trades → largest variant. */
function pickTrades(bundle) {
    if (!bundle || typeof bundle !== "object") return [];
    const tbv = obj(bundle.tradesByVariant);
    const primary = bundle.primaryVariant;
    if (primary && Array.isArray(tbv[primary])) return tbv[primary];
    if (Array.isArray(bundle.trades) && bundle.trades.length) return bundle.trades;
    const arrays = Object.values(tbv).filter(Array.isArray);
    return arrays.slice().sort((a, b) => b.length - a.length)[0] || [];
}

/** A trade carries both stop-anchored excursion fields (→ rescorable). */
function hasRrFields(trade) {
    return num(trade?.mfeR ?? trade?.mfe_r) !== null
        && num(trade?.rIfNoTarget ?? trade?.r_if_no_target) !== null;
}

/** A filled performance trade — so missing fields here is a genuine data gap. */
function isPerformanceTrade(trade) {
    return PERFORMANCE_CATEGORIES.has(classifyTrade(trade));
}

const FAIL = (reason) => ({ ok: false, exact: false, available: false, reason });

/** Re-target one trade to newRR. Preserves originals; never re-derives from old R sign. */
function rescoreOneTrade(trade, newRR) {
    const mfe = num(trade.mfeR ?? trade.mfe_r);
    const rIfNoTarget = num(trade.rIfNoTarget ?? trade.r_if_no_target);
    const newR = mfe >= newRR ? newRR : rIfNoTarget;
    const outcome = newR > EPS ? "WIN" : newR < -EPS ? "LOSS" : "BREAKEVEN";
    return {
        ...trade,
        // R fields all carry the new target R (numericR / equity / summary read these).
        r: newR,
        netR: newR,
        net_r: newR,
        pnl_r: newR,
        grossR: newR,
        gross_r: newR,
        outcome,
        // Provenance for UI / debugging — never read by the stats path.
        rrRescoreModel: RR_MODEL,
        originalOutcome: trade.outcome ?? "",
        originalR: num(trade.r ?? trade.netR ?? trade.net_r),
        originalRr: num(trade.rr_multiple ?? trade.rrConfig ?? trade.rr_config),
        rrPreviewTarget: newRR,
    };
}

/** Roll up a (rescored) trade array via the canonical classifier — matches the surfaces. */
function summarizeArray(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const s = summarizeTradeSanity(list);
    return {
        netR: s.netRPerformance ?? 0,
        avgR: s.expectancy ?? null,
        maxDd: s.maxDrawdownR != null ? Math.abs(s.maxDrawdownR) : null,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        winRate: s.winRate ?? null,
        equityCurve: equityFromTrades(list),
    };
}

/**
 * Re-target a single trade array to newRR — the reusable core.
 *
 * @returns {{ ok, exact, eligible, missing, trades, netR, avgR, maxDd, wins, losses, winRate, equityCurve }}
 *   ok      = at least one trade was rescored.
 *   exact   = every filled performance trade had usable fields.
 *   eligible/missing = counts driving covered/partial classification.
 */
export function rescoreRrTradeArray(trades, newRR) {
    const list = Array.isArray(trades) ? trades : [];
    if (!list.length) {
        return { ok: true, exact: true, eligible: 0, missing: 0, trades: [], ...summarizeArray([]) };
    }
    let eligible = 0;
    let missing = 0;
    const out = list.map((t) => {
        if (hasRrFields(t)) {
            eligible += 1;
            return rescoreOneTrade(t, newRR);
        }
        // No excursion fields → leave untouched. Only count it as a gap if it was a
        // filled performance trade (unfilled / cancelled rows legitimately have none).
        if (isPerformanceTrade(t)) missing += 1;
        return t;
    });
    return {
        ok: eligible > 0,
        exact: eligible > 0 && missing === 0,
        eligible,
        missing,
        trades: out,
        ...summarizeArray(out),
    };
}

/**
 * Structural precheck: does this bundle carry the stop-anchored excursion fields at all?
 * Old bundles (pre-Phase-11A export / pre-11B import) return false → RR preview unavailable.
 */
export function canRescoreRr(bundle) {
    return pickTrades(bundle).some(hasRrFields);
}

/**
 * Re-target the primary trade set to a new RR multiple.
 *
 * @param {object} bundle
 * @param {{ rr:number }} options
 * @returns {{ ok, exact, available, reason?, trades?, netR?, ... }}
 */
export function rescoreRrForBundle(bundle, { rr } = {}) {
    const newRR = num(rr);
    if (newRR === null || !(newRR > 0)) return FAIL("Invalid RR target.");
    const trades = pickTrades(bundle);
    if (!trades.length) return FAIL("No trades available to re-target.");
    if (!canRescoreRr(bundle)) {
        return FAIL("This run has no stop-anchored excursion fields (mfeR / rIfNoTarget).");
    }
    const result = rescoreRrTradeArray(trades, newRR);
    if (!result.ok) {
        return FAIL("This run has no stop-anchored excursion fields (mfeR / rIfNoTarget).");
    }
    return { available: true, ...result };
}

// ── all-trade-set bundle builder (mirrors Phase 9A buildRescoredBundle) ────────

/**
 * Re-target every array in a trade map, recomputing the paired equity map. Source is
 * never mutated. `reuse` supplies a precomputed result for a key (primary variant).
 * Collections with zero eligible trades that DID contain filled-performance trades are
 * recorded as skipped (genuine data gap); empty / all-non-performance maps are ignored.
 */
function rescoreRrMap(sourceTrades, sourceEquity, newRR, prefix, covered, skipped, counters, reuse = null) {
    const srcTrades = obj(sourceTrades);
    const tradesMap = { ...srcTrades };
    const equityMap = { ...obj(sourceEquity) };
    const hasEquity = sourceEquity !== null && sourceEquity !== undefined;
    for (const [key, arr] of Object.entries(srcTrades)) {
        if (!Array.isArray(arr)) continue;
        const res = reuse && reuse[key] ? reuse[key] : rescoreRrTradeArray(arr, newRR);
        if (res.eligible > 0) {
            tradesMap[key] = res.trades;
            if (hasEquity) equityMap[key] = res.equityCurve;
            covered.push(`${prefix}:${key}`);
            if (res.missing > 0) counters.partial = true;
        } else if (res.missing > 0) {
            skipped.push(`${prefix}:${key}`); // had filled trades but no fields
        }
    }
    return { tradesMap, equityMap };
}

function rescoreRrNested(sourceNested, tradesKey, equityKey, newRR, prefix, covered, skipped, counters) {
    if (!sourceNested || typeof sourceNested !== "object") return null;
    const { tradesMap, equityMap } = rescoreRrMap(
        sourceNested[tradesKey], sourceNested[equityKey], newRR, prefix, covered, skipped, counters,
    );
    return { ...sourceNested, [tradesKey]: tradesMap, [equityKey]: equityMap };
}

/**
 * Build a temporary, RR-re-targeted bundle. NOT a store run — never added to
 * state.runs, never persisted. Does NOT mutate `sourceBundle`.
 *
 * @param {object} sourceBundle
 * @param {object} rrResult   output of rescoreRrForBundle (must be ok && available).
 * @param {{ rr?, dirtyFields?, rerunTier? }} [options]
 * @returns {object|null}
 */
export function buildRrPreviewBundle(sourceBundle, rrResult, options = {}) {
    if (!sourceBundle || typeof sourceBundle !== "object") return null;
    if (!rrResult || !rrResult.ok || !Array.isArray(rrResult.trades)) return null;

    const { rr = null, dirtyFields = null, rerunTier = null } = options;
    const newRR = num(rr) ?? rrResult.trades[0]?.rrPreviewTarget ?? null;
    const primaryVariant = sourceBundle.primaryVariant;

    const covered = [];
    const skipped = [];
    const counters = { partial: false };

    // tradesByVariant + equityCurveByVariant (reuse rrResult for the primary variant)
    const sourceTbv = obj(sourceBundle.tradesByVariant);
    const reuse = primaryVariant ? { [primaryVariant]: rrResult } : null;
    const { tradesMap: tradesByVariant, equityMap: equityCurveByVariant } = rescoreRrMap(
        sourceTbv, sourceBundle.equityCurveByVariant, newRR,
        "tradesByVariant", covered, skipped, counters, reuse,
    );
    if (primaryVariant && !Array.isArray(sourceTbv[primaryVariant])) {
        tradesByVariant[primaryVariant] = rrResult.trades;
        equityCurveByVariant[primaryVariant] = rrResult.equityCurve;
        covered.push(`tradesByVariant:${primaryVariant}`);
    }

    const entryResults = rescoreRrNested(
        sourceBundle.entryResults, "tradesByMode", "equityCurveByMode", newRR,
        "entryResults.tradesByMode", covered, skipped, counters,
    );
    const protectionResults = rescoreRrNested(
        sourceBundle.protectionResults, "tradesByMode", "equityCurveByMode", newRR,
        "protectionResults.tradesByMode", covered, skipped, counters,
    );
    const directionalResults = rescoreRrNested(
        sourceBundle.directionalResults, "tradesByScenario", "equityCurveByScenario", newRR,
        "directionalResults.tradesByScenario", covered, skipped, counters,
    );

    const hasControl = sourceBundle.controlTradesByScenario && typeof sourceBundle.controlTradesByScenario === "object";
    const { tradesMap: controlTradesByScenario } = rescoreRrMap(
        sourceBundle.controlTradesByScenario, null, newRR,
        "controlTradesByScenario", covered, skipped, counters,
    );

    const rescoreScope = covered.length === 0
        ? "unavailable"
        : (skipped.length > 0 || counters.partial) ? "partial" : "all_trade_sets";

    const out = {
        ...sourceBundle,
        id: `${sourceBundle.id}__rr_preview`,
        isTemporary: true,
        derivedFrom: sourceBundle.id,
        meta: {
            ...(sourceBundle.meta || {}),
            temporary: true,
            source: "master_controls_rr_preview",
            mode: "rr_rescore",
            rr: newRR,
            model: RR_MODEL,
            rescoreScope,
            coveredCollections: covered,
            skippedCollections: skipped,
            warning: RR_PREVIEW_WARNING,
            dirtyFields,
            rerunTier,
        },
        trades: rrResult.trades,
        tradesByVariant,
        equityCurve: rrResult.equityCurve,
        equityCurveByVariant,
        summary: {
            ...(sourceBundle.summary || {}),
            netR: rrResult.netR,
            wins: rrResult.wins,
            losses: rrResult.losses,
            winRate: rrResult.winRate,
            trades: rrResult.trades.length,
            maxDd: rrResult.maxDd,
            avgR: rrResult.avgR,
        },
    };

    if (entryResults) out.entryResults = entryResults;
    if (protectionResults) out.protectionResults = protectionResults;
    if (directionalResults) out.directionalResults = directionalResults;
    if (hasControl) out.controlTradesByScenario = controlTradesByScenario;

    return out;
}
