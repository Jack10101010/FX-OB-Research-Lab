// ─── Master Controls — pure composed Preview Lens engine (Phase 12B-1) ───────
//
// Pure utility (NO React, NO store, NO sidecar, NO UI wiring). Combines the four
// existing preview transforms — FFT swap, instant filter, RR re-target, cost
// rescore — into ONE temporary, bundle-shaped object in a single canonical order:
//
//     A. Swap    (FFT ON→OFF universe swap; variant swap is a future placeholder)
//     B. Filter  (session / structure-direction / direction subset)
//     C. RR       (stop-anchored re-target)
//     D. Cost    (spread / slippage / commission rescore)
//
// WHY THIS ORDER (from the Phase 12A audit):
//   • Swap first — it changes the trade UNIVERSE (which rows exist), so every later
//     stage must operate on the swapped rows.
//   • Filter next — a pure subset; cheap to apply before the rescores so they touch
//     fewer rows, and it never depends on R values.
//   • RR before Cost — RR moves the take-profit target (a gross, price-based R), while
//     the per-trade cost components (spread/slippage/commission in R) are RR-INVARIANT
//     (stop & entry geometry are unchanged), so applying cost AFTER RR is exact:
//     net = RR_gross − rescaled_costs.
//
// COMPOSITION MECHANICS. Swap is a structural pre-step (it replaces whole collections
// with their FFT-OFF controls), handled by the existing buildFftPreviewBundle. Filter,
// RR and Cost are per-array transforms, composed into a SINGLE closure and applied via
// ONE pass of mapBundleTradeCollections — so every equity curve is recomputed exactly
// once, from the final rows, and the summary is rebuilt from the final primary trades.
//
// ROBUSTNESS. Each stage degrades independently: an unavailable / no-op stage is
// SKIPPED, never fatal. RR with no excursion fields does not kill filter / FFT / cost;
// cost with no separable data is skipped per-array; a no-op filter is skipped. The
// source bundle is NEVER mutated.
//
// This is pure infrastructure — it is NOT wired into the store, context or drawer by
// this phase, and it does not change any existing behavior. The four standalone
// builders remain intact and untouched.

import { mapBundleTradeCollections, summarizeBundlePrimary, pickPrimaryTrades } from "./bundleWalk";
import { buildTradePredicate, tradeMatches } from "./tradeFilter";
import { canRescoreRr, rescoreRrTradeArray, RR_PREVIEW_WARNING } from "./rrRescore";
import { canRescoreCosts, rescoreTradeArray, readOldCosts, readPipSize } from "./costRescore";
import { buildFftPreviewBundle } from "./controlSwap";

const RR_MODEL = "stop_anchored";

// ── input readers ─────────────────────────────────────────────────────────────

/** Desired FFT state from the `fft` input (boolean | { fftEnabled } | { enabled }), else null = not requested. */
function readFftDesired(fft) {
    if (fft == null) return null;
    if (typeof fft === "boolean") return fft;
    if (typeof fft === "object") {
        if (typeof fft.fftEnabled === "boolean") return fft.fftEnabled;
        if (typeof fft.enabled === "boolean") return fft.enabled;
    }
    return null;
}

/** New RR target from the `rr` input (number | { rr } | { value }), else null = not requested. */
function readRr(rr) {
    if (rr == null) return null;
    const raw = typeof rr === "object" ? (rr.rr ?? rr.value) : rr;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/**
 * Resolve `filters` to a trade predicate. Accepts either a pre-built predicate
 * (output of buildTradePredicate) or an effectiveConfig to build one from. Null when
 * filtering is not requested.
 */
function resolvePredicate(filters) {
    if (filters == null) return null;
    if (typeof filters.active === "boolean"
        && ("sessionActive" in filters || "structDirActive" in filters || "directionActive" in filters)) {
        return filters; // already a predicate
    }
    return buildTradePredicate(filters);
}

// ── composer ──────────────────────────────────────────────────────────────────

/**
 * Compose a temporary, bundle-shaped preview from any subset of the four transforms.
 * NOT a store run — never added to state.runs, never persisted. Does NOT mutate
 * `sourceBundle`.
 *
 * @param {object} sourceBundle  the active run bundle (raw, lens-immune).
 * @param {object} [input]
 * @param {object|null} input.filters   predicate or effectiveConfig (Stage B).
 * @param {boolean|object|null} input.fft  desired FFT state — only ON→OFF is real (Stage A).
 * @param {number|object|null} input.rr   new RR target (Stage C).
 * @param {object|null} input.costs   { spread, slippage, commission } (Stage D).
 * @param {Array|Set|null} input.dirtyFields   provenance only.
 * @param {string|null} input.rerunTier        provenance only.
 * @returns {{
 *   bundle: object|null, ok: boolean,
 *   appliedStages: string[], skippedStages: string[], unavailableStages: string[],
 *   stages: object, warnings: string[], before: object|null, after: object|null
 * }}
 */
export function composePreviewBundle(sourceBundle, input = {}) {
    const {
        filters = null, fft = null, rr = null, costs = null,
        dirtyFields = null, rerunTier = null,
    } = input;

    // Stage descriptors. `requested` = caller asked for it; `available` = bundle supports
    // it; `applied` = actually took effect. Filter is always "available" (subset is free).
    const stages = {
        fft:    { requested: false, active: false, available: false, applied: false },
        filter: { requested: false, active: false, available: true,  applied: false },
        rr:     { requested: false, active: false, available: false, applied: false },
        cost:   { requested: false, active: false, available: false, applied: false },
    };
    const warnings = [];
    const ORDER = ["fft", "filter", "rr", "cost"];

    const finalize = (bundle, working) => {
        const primaryTrades = bundle ? pickPrimaryTrades(bundle) : [];
        const appliedStages = ORDER.filter((s) => stages[s].applied);
        const unavailableStages = ORDER.filter((s) => stages[s].requested && !stages[s].available);
        const skippedStages = ORDER.filter((s) => stages[s].requested && stages[s].available && !stages[s].applied);
        return {
            bundle, ok: appliedStages.length > 0,
            appliedStages, skippedStages, unavailableStages,
            stages, warnings,
            before: summarizeBundlePrimary(pickPrimaryTrades(sourceBundle)),
            after: bundle ? summarizeBundlePrimary(primaryTrades) : null,
        };
    };

    if (!sourceBundle || typeof sourceBundle !== "object") {
        return {
            bundle: null, ok: false,
            appliedStages: [], skippedStages: [], unavailableStages: [],
            stages, warnings, before: null, after: null,
        };
    }

    // ── Stage A: SWAP (FFT first; executionMode/variant swap is a future placeholder) ──
    let working = sourceBundle;
    const fftDesired = readFftDesired(fft);
    if (fftDesired !== null) {
        stages.fft.requested = true;
        stages.fft.active = true;
        // Controls are the FFT-OFF universe, so only ON→OFF is meaningful; the builder
        // encodes every guard (already-OFF, OFF→ON, no controls) and returns null otherwise.
        const swapped = fftDesired === false ? buildFftPreviewBundle(sourceBundle, { fftEnabled: false }) : null;
        if (swapped) {
            working = swapped;
            stages.fft.available = true;
            stages.fft.applied = true;
            stages.fft.swapScope = swapped.meta?.swapScope ?? null;
            stages.fft.coveredScenarios = swapped.meta?.coveredScenarios ?? [];
            stages.fft.missingScenarios = swapped.meta?.missingScenarios ?? [];
        } else {
            stages.fft.available = false;
            stages.fft.applied = false;
            stages.fft.reason = fftDesired === true
                ? "FFT ON cannot be synthesized (controls are the FFT-OFF universe)."
                : "No FFT-OFF controls available to swap.";
        }
    } else {
        // Informational: could we swap if asked? (does not change behavior).
        stages.fft.available = !!buildFftPreviewBundle(sourceBundle, { fftEnabled: false });
    }

    // ── Stage B: FILTER ──
    const predicate = resolvePredicate(filters);
    const filterRequested = filters != null;
    const filterActive = !!(predicate && predicate.active);
    stages.filter.requested = filterRequested;
    stages.filter.active = filterRequested;
    stages.filter.available = true;
    stages.filter.applied = filterActive;
    if (predicate) {
        stages.filter.sessionActive = !!predicate.sessionActive;
        stages.filter.structDirActive = !!predicate.structDirActive;
        stages.filter.directionActive = !!predicate.directionActive;
    }

    // ── Stage C: RR ──
    const newRR = readRr(rr);
    const rrRequested = newRR !== null && newRR > 0;
    const rrAvailable = rrRequested && canRescoreRr(working);
    stages.rr.requested = rrRequested;
    stages.rr.active = rrRequested;
    stages.rr.available = rrAvailable;
    stages.rr.applied = rrAvailable;
    if (rrRequested) {
        stages.rr.rr = newRR;
        stages.rr.model = RR_MODEL;
        if (rrAvailable) {
            stages.rr.warning = RR_PREVIEW_WARNING;
            if (!warnings.includes(RR_PREVIEW_WARNING)) warnings.push(RR_PREVIEW_WARNING);
        } else {
            stages.rr.reason = "This run has no stop-anchored excursion fields (mfeR / rIfNoTarget).";
        }
    }

    // ── Stage D: COST ──
    const costRequested = costs != null;
    const costAvailable = costRequested && canRescoreCosts(working);
    const costCtx = costAvailable
        ? {
            oldCosts: readOldCosts(working),
            newCosts: { spread: costs?.spread, slippage: costs?.slippage, commission: costs?.commission },
            pipSize: readPipSize(working),
        }
        : null;
    stages.cost.requested = costRequested;
    stages.cost.active = costRequested;
    stages.cost.available = costAvailable;
    stages.cost.applied = costAvailable;
    if (costRequested) {
        stages.cost.costs = { spread: costs?.spread, slippage: costs?.slippage, commission: costs?.commission };
        if (!costAvailable) stages.cost.reason = "Exact cost rescore unavailable for this run.";
    }

    // ── Composed per-array transform: Filter → RR → Cost (canonical order) ──
    const perArray = (arr) => {
        let a = Array.isArray(arr) ? arr : [];
        if (filterActive) a = a.filter((t) => tradeMatches(t, predicate));
        if (rrAvailable) a = rescoreRrTradeArray(a, newRR).trades;
        if (costAvailable) {
            const res = rescoreTradeArray(a, costCtx);
            // Per-array separability: a collection that lacks separable cost data passes
            // through unchanged rather than failing the whole compose.
            if (res.ok && res.exact) a = res.trades;
        }
        return a;
    };

    const anyPerArray = filterActive || rrAvailable || costAvailable;
    // One walk: recomputes every equity curve once + rebuilds summary from final primary
    // trades. When no per-array stage runs, the (possibly FFT-swapped) bundle passes through.
    const walked = anyPerArray ? mapBundleTradeCollections(working, perArray).bundle : working;

    const appliedStages = ORDER.filter((s) => stages[s].applied);
    const skippedStages = ORDER.filter((s) => stages[s].requested && stages[s].available && !stages[s].applied);
    const unavailableStages = ORDER.filter((s) => stages[s].requested && !stages[s].available);

    const out = {
        ...walked,
        id: `${sourceBundle.id}__composed`,
        isTemporary: true,
        derivedFrom: sourceBundle.id,
        meta: {
            ...(walked.meta || {}),
            temporary: true,
            source: "master_controls_composed_preview",
            mode: "composed",
            stages,
            appliedStages,
            skippedStages,
            unavailableStages,
            dirtyFields,
            rerunTier,
            warnings,
        },
    };

    return finalize(out, working);
}
