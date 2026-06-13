/**
 * clusterExplorer.js — Research Cluster Explorer engine (CLUSTER-1 MVP).
 *
 * A DISCOVERY engine, not a dashboard. Given a run's trades and a pluggable TARGET
 * (losses / winners / breaches / give-backs / false-losers / round-trips), it finds
 * the cohorts of conditions (Session × Direction × Structure × FFT × …) most
 * disproportionately associated with that target — WITHOUT N-way brute force and with
 * a statistical-validity layer designed to defeat the multiple-comparisons /
 * garden-of-forking-paths problem.
 *
 * Design (see RESEARCH-CLUSTER-EXPLORER-DESIGN-AUDIT-1.md + D-015):
 *   - Pure, React-free, node-testable. No backend, no replay, no new simulation.
 *   - REUSES existing infrastructure: `computeConfidence` (no second confidence
 *     system), the `FAILURE_DIMENSIONS` accessor catalogue, the canonical Loss-Triage
 *     thresholds, and trade-classification predicates. It is a SEARCH + STATISTICS
 *     layer over these, not a re-implementation.
 *   - The engine PROPOSES candidate cohorts (hypotheses); it never prescribes a
 *     trade-management action ("use BE", "optimal TP"). Cross-run replication is the
 *     real validation and lives downstream (Save Finding → Hypothesis Lab).
 *
 * SEARCH = guided greedy beam search:
 *   1. Seed all 1-D cohorts that clear the (depth-1) sample floor.
 *   2. Score each vs the global baseline.
 *   3. Keep the top `beamWidth`, expand each by ONE more dimension at a time.
 *   4. A child survives only if it MATERIALLY IMPROVES on its PARENT (parent-conditional
 *      gate) — the primary anti-overfitting mechanism.
 *   5. Stop at `maxDepth`; the sample floor SCALES with depth.
 *
 * VALIDITY LAYER (the part that matters most):
 *   A. Depth-scaled sample floors        (deeper cohorts need MORE evidence)
 *   B. Effect-size gate                   (don't surface tiny effects)
 *   C. Confidence via computeConfidence   (REUSED — Wilson / effect-SE)
 *   D. Benjamini–Hochberg FDR correction  (over all evaluated cohorts)
 *   E. Temporal split-half stability flag (first half vs second half)
 *   F. Empirical-Bayes shrinkage ranking  (small extreme cohorts pulled to parent)
 */

import { computeConfidence } from "./researchSignals.js";
import { isWinTrade, isLossTrade, isPerformanceTrade } from "./tradeClassification.js";
import { TRIAGE_CANDIDATE_R, TRIAGE_RUNUP_R } from "./lossTriage.js";

// NOTE: this engine is intentionally DIMENSION-AGNOSTIC — it imports no dimension
// catalogue (which would drag the Failures-Lab module chain and break node-only
// validation). The host page supplies the dimension array (built from the canonical
// `FAILURE_DIMENSIONS` + `distanceBandDim` below) via `options.dimensions`; the
// validator injects simple test dimensions. Each dimension = { key, label, accessor }.

// ── Mirrored / engine constants ──────────────────────────────────────────────
// BASE_SAMPLE_N mirrors TRIAGE_LOW_SAMPLE_N (data/lossTriage.js); LIFT_MIN mirrors
// EXPLORER_LIFT_HIGHLIGHT (excursionAnalytics.js). Same single-source intent, kept
// import-free for these two so the engine has no surprising coupling.
export const BASE_SAMPLE_N = 15;     // depth-1 minimum cohort size
export const SAMPLE_GROWTH = 1.6;    // floor grows by this factor per depth level
export const MAX_DEPTH = 4;          // never grow a cohort deeper than this
export const DEFAULT_BEAM_WIDTH = 8; // top-N cohorts expanded per level
export const LIFT_MIN = 1.5;         // effect-size gate (over-representation)
export const MIN_RATE_DELTA = 0.05;  // effect-size gate (absolute rate pp vs baseline)
export const MIN_MARGINAL_GAIN = 0.05; // child must beat parent by ≥ this in rate
export const MARGIN_Z = 0.84;        // child−parent must also clear this × SE(diff) (~80% one-sided)
export const FDR_Q = 0.10;           // Benjamini–Hochberg false-discovery rate
export const SHRINK_K = 20;          // empirical-Bayes pseudo-count (pull toward parent)
export const SPLIT_MIN_PER_HALF = 6; // min cohort trades per half to judge stability
export const MAX_PRUNED_KEPT = 200;  // cap pruned-trail size (UI explain tree)

// ── depth-scaled sample floor ────────────────────────────────────────────────
export function minSampleForDepth(depth, base = BASE_SAMPLE_N, growth = SAMPLE_GROWTH) {
    return Math.round(base * Math.pow(growth, Math.max(0, depth - 1)));
}

// ── small pure math ──────────────────────────────────────────────────────────
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round1 = (v) => Math.round(Number(v) * 10) / 10;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round3 = (v) => Math.round(Number(v) * 1000) / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Abramowitz-Stegun erf → standard-normal CDF (for two-proportion p-values).
function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
}
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// One-sided p-value that the cohort's target rate EXCEEDS the baseline rate
// (over-representation), via a two-proportion z-test (pooled SE).
function twoPropP(targetN, n, baseTargetN, baseN) {
    if (!n || !baseN) return 1;
    const p1 = targetN / n;
    const p2 = baseTargetN / baseN;
    const pPool = (targetN + baseTargetN) / (n + baseN);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n + 1 / baseN));
    if (!(se > 0)) return p1 > p2 ? 0.5 : 1;
    const z = (p1 - p2) / se;
    return clamp01(1 - normCdf(z)); // small when cohort >> baseline
}

// SE of the difference between two independent proportions (child vs parent).
function diffSE(p1, n1, p2, n2) {
    if (!n1 || !n2) return Infinity;
    return Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
}

// ── tolerant per-trade field readers (mirror lossTriage's; engine stays pure) ──
const truthy = (v) => v === true || v === 1 || String(v).toLowerCase() === "true";
const postStopMfeR = (t) => numOrNull(t?.postStopMfeR ?? t?.post_stop_mfe_r ?? t?.post_stop_continuation_r);
const reachedTp = (t) => {
    const v = t?.postStopReachedOriginalTp ?? t?.post_stop_reached_original_tp;
    return v == null || v === "" ? null : truthy(v);
};
const mfeR = (t) => numOrNull(t?.mfeR ?? t?.mfe_r);
const rOf = (t) => { const v = numOrNull(t?.r ?? t?.netR ?? t?.net_r); return v == null ? 0 : v; };
const isFullBreach = (t) =>
    t?.ob_fully_breached === true ||
    (Number.isFinite(Number(t?.max_ob_penetration_pct)) && Number(t.max_ob_penetration_pct) >= 100);

// Loss-triage axes, replicated from the canonical thresholds (imported), so the
// give-back / false-loser / round-trip targets match the Loss Triage panel exactly.
const recovered = (t) => { const m = postStopMfeR(t), tp = reachedTp(t); if (m == null && tp == null) return null; return tp === true || (m != null && m >= TRIAGE_CANDIDATE_R); };
const ran = (t) => { const v = mfeR(t); return v == null ? null : v >= TRIAGE_RUNUP_R; };

// ── Target registry (pluggable; easy to extend) ──────────────────────────────
// kind 'rate': metric is P(hit | cohort) vs baseline; over-representation = danger/edge.
// `universe(t)` = trades eligible for the rate denominator. `hit(t)` = the event.
// `direction`: 'over' = a high rate is the interesting signal (danger / win-edge).
export const CLUSTER_TARGETS = {
    losses:       { key: "losses",       label: "Losers",          kind: "rate", direction: "over", universe: isPerformanceTrade, hit: isLossTrade },
    winners:      { key: "winners",      label: "Winners",         kind: "rate", direction: "over", universe: isPerformanceTrade, hit: isWinTrade },
    breaches:     { key: "breaches",     label: "Catastrophic Breaches", kind: "rate", direction: "over", universe: () => true, hit: isFullBreach },
    give_backs:   { key: "give_backs",   label: "Give-Back Losses", kind: "rate", direction: "over", universe: isPerformanceTrade, hit: (t) => isLossTrade(t) && ran(t) === true && recovered(t) === false },
    false_losers: { key: "false_losers", label: "False Losers",    kind: "rate", direction: "over", universe: isPerformanceTrade, hit: (t) => isLossTrade(t) && recovered(t) === true && ran(t) === false },
    round_trips:  { key: "round_trips",  label: "Round-Trip Losses", kind: "rate", direction: "over", universe: isPerformanceTrade, hit: (t) => isLossTrade(t) && recovered(t) === true && ran(t) === true },
};
export const CLUSTER_TARGET_ORDER = ["losses", "breaches", "give_backs", "false_losers", "round_trips", "winners"];

// ── local extra dimension: distance-at-arm band (field already exported, TE-only) ─
export const distanceBandDim = {
    key: "distance_at_arm", label: "Distance at arm", tier: 1,
    accessor: (t) => {
        const d = numOrNull(t?.price_distance_from_ob_at_arm_pips ?? t?.priceDistanceFromObAtArmPips);
        if (d == null) return null;
        const a = Math.abs(d);
        return a < 2 ? "<2 pips" : a < 5 ? "2–5 pips" : "5+ pips";
    },
};

// Default in-play dimensions: curated categorical set (avoids high-cardinality
// dims like raw hour that inflate the search). The PAGE resolves these keys against
// the canonical `FAILURE_DIMENSIONS` catalogue (+ distanceBandDim) and passes the
// resulting accessor objects in.
export const DEFAULT_DIMENSION_KEYS = ["session", "direction", "structure", "fft", "entryModel", "weekday", "distance_at_arm"];

// Pure availability filter: keep only dimensions a run actually carries (≥ threshold
// of trades expose a non-null value over a sample). Mirrors `dimensionAvailable`'s
// intent without importing the Failures-Lab module chain.
export function selectAvailableDimensions(trades, catalogue, { keys = DEFAULT_DIMENSION_KEYS, sampleSize = 20, threshold = 0.5 } = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const byKey = Object.fromEntries((catalogue || []).map((d) => [d.key, d]));
    const sample = list.slice(0, Math.max(sampleSize, Math.min(list.length, 200)));
    const isAvail = (d) => {
        if (typeof d?.accessor !== "function") return false;
        const nonNull = sample.filter((t) => d.accessor(t) != null).length;
        return sample.length ? nonNull / sample.length >= threshold : false;
    };
    return (keys || []).map((k) => byKey[k]).filter(Boolean).filter(isAvail);
}

// ── cohort evaluation ────────────────────────────────────────────────────────
// Compute a cohort's stats vs the GLOBAL baseline and (optionally) vs its PARENT.
function evalCohort(cohortTrades, { target, baseRate, baseTargetN, baseN, parent }) {
    const universe = cohortTrades.filter((t) => target.universe(t));
    const n = universe.length;
    const targetN = universe.filter((t) => target.hit(t)).length;
    const rate = n ? targetN / n : 0;

    // win/loss/avgR for the REUSED confidence engine + expectancy context.
    const perf = cohortTrades.filter((t) => isPerformanceTrade(t));
    const wins = perf.filter((t) => isWinTrade(t)).length;
    const losses = perf.filter((t) => isLossTrade(t)).length;
    const avgR = perf.length ? perf.reduce((s, t) => s + rOf(t), 0) / perf.length : 0;
    const conf = computeConfidence({ count: cohortTrades.length, wins, losses, avgR });

    const lift = baseRate > 0 ? rate / baseRate : 0;
    const breachN = cohortTrades.filter((t) => isFullBreach(t)).length;

    // empirical-Bayes shrinkage toward the PARENT rate (baseline at depth 1).
    const priorRate = parent ? parent.rate : baseRate;
    const shrunkRate = (n * rate + SHRINK_K * priorRate) / (n + SHRINK_K);
    const shrunkLift = baseRate > 0 ? shrunkRate / baseRate : 0;

    const pValue = twoPropP(targetN, n, baseTargetN, baseN);

    return {
        n, targetN, rate, lift,
        shrunkRate, shrunkLift,
        avgR: round3(avgR), wins, losses,
        confidence: conf.level, confidenceScore: round3(conf.score),
        breachRate: cohortTrades.length ? round1((breachN / cohortTrades.length) * 100) : 0,
        pValue,
        parentRate: priorRate,
        marginalGain: rate - priorRate,
        marginalSE: parent ? diffSE(rate, n, parent.rate, parent.n) : diffSE(rate, n, baseRate, baseN),
    };
}

// Distinct non-null values of a dimension over a trade list.
function distinctValues(trades, dim) {
    const set = new Set();
    for (const t of trades) { const v = dim.accessor(t); if (v != null) set.add(String(v)); }
    return [...set];
}

// Temporal split-half stability: does the over/under-baseline direction hold in BOTH
// halves? Split by entry time when present, else by array order.
function stabilityFlag(cohortTrades, { target, baseRate }) {
    const ordered = [...cohortTrades].sort((a, b) => String(a?.entry ?? "").localeCompare(String(b?.entry ?? "")));
    const mid = Math.floor(ordered.length / 2);
    const halves = [ordered.slice(0, mid), ordered.slice(mid)];
    const dirs = halves.map((h) => {
        const u = h.filter((t) => target.universe(t));
        if (u.length < SPLIT_MIN_PER_HALF) return null;
        const r = u.filter((t) => target.hit(t)).length / u.length;
        return r > baseRate ? "over" : "under";
    });
    if (dirs[0] == null || dirs[1] == null) return "unstable";
    if (dirs[0] === dirs[1]) return dirs[0] === "over" ? "stable" : "stable_under";
    return "one_half_only";
}

// Benjamini–Hochberg: mark fdrPass on the ranked evaluated set at level q.
function applyBH(evaluated, q) {
    const sorted = [...evaluated].sort((a, b) => a.pValue - b.pValue);
    const m = sorted.length;
    let kMax = 0;
    for (let i = 0; i < m; i++) if (sorted[i].pValue <= ((i + 1) / m) * q) kMax = i + 1;
    const threshold = kMax > 0 ? sorted[kMax - 1].pValue : -1;
    for (const e of evaluated) { e.fdrPass = e.pValue <= threshold; }
    return { threshold, kMax, m };
}

function predicateKey(predicate) {
    return predicate.map((p) => `${p.dim}=${p.value}`).sort().join(" · ");
}
function predicateLabel(predicate) {
    return predicate.map((p) => p.value).join(" · ");
}

// ── main engine ──────────────────────────────────────────────────────────────
/**
 * buildClusterExplorer(trades, options) → discovery result.
 * @param trades            run trades
 * @param options.target    a key of CLUSTER_TARGETS (default "losses")
 * @param options.dimensions optional dimension catalogue (defaults to defaultDimensions)
 * @param options.beamWidth / maxDepth / q / gates… (all have safe defaults)
 */
export function buildClusterExplorer(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const target = CLUSTER_TARGETS[options.target] || CLUSTER_TARGETS.losses;
    const dims = (Array.isArray(options.dimensions) ? options.dimensions : [])
        .filter((d) => d && typeof d.accessor === "function");
    const beamWidth = options.beamWidth ?? DEFAULT_BEAM_WIDTH;
    const maxDepth = options.maxDepth ?? MAX_DEPTH;
    const q = options.q ?? FDR_Q;
    const liftMin = options.liftMin ?? LIFT_MIN;
    const minRateDelta = options.minRateDelta ?? MIN_RATE_DELTA;
    const minMarginalGain = options.minMarginalGain ?? MIN_MARGINAL_GAIN;
    const marginZ = options.marginZ ?? MARGIN_Z;

    // global baseline
    const baseUniverse = list.filter((t) => target.universe(t));
    const baseN = baseUniverse.length;
    const baseTargetN = baseUniverse.filter((t) => target.hit(t)).length;
    const baseRate = baseN ? baseTargetN / baseN : 0;

    const result = {
        target: target.key, targetLabel: target.label,
        available: false, reason: null,
        baseline: { n: baseN, rate: round3(baseRate), targetN: baseTargetN },
        dimensionsUsed: dims.map((d) => ({ key: d.key, label: d.label })),
        clusters: [], pruned: [], evaluatedCount: 0, fdr: null,
    };
    if (baseN < BASE_SAMPLE_N) { result.reason = `Too few eligible trades (${baseN} < ${BASE_SAMPLE_N}) for the ${target.label} target.`; return result; }
    if (!dims.length) { result.reason = "No dimensions available for this run."; return result; }
    result.available = true;

    const evaluated = [];          // every floor-passing cohort (for FDR)
    const survivors = [];          // cohorts passing every gate
    const pruned = [];             // pruned cohorts + reason (UI explain trail)
    const seenPred = new Set();    // dedup identical predicates

    const baseAsParent = { rate: baseRate, n: baseN };

    function consider(predicate, cohortTrades, depth, parentStats, parentPredicate) {
        const key = predicateKey(predicate);
        if (seenPred.has(key)) return null;
        seenPred.add(key);

        const floor = minSampleForDepth(depth);
        if (cohortTrades.length < floor) {
            if (pruned.length < MAX_PRUNED_KEPT) pruned.push({ predicate, parentPredicate, depth, reason: "below_floor", detail: `n=${cohortTrades.length} < floor ${floor}` });
            return null;
        }

        const s = evalCohort(cohortTrades, { target, baseRate, baseTargetN, baseN, parent: parentStats });
        const stats = { ...s, predicate, parentPredicate, depth, predLabel: predicateLabel(predicate), trades: cohortTrades };
        evaluated.push(stats);

        // (B) effect-size gate vs baseline
        const overBaseline = (stats.rate - baseRate) >= minRateDelta && stats.lift >= liftMin;
        if (!overBaseline) {
            if (pruned.length < MAX_PRUNED_KEPT) pruned.push({ predicate, parentPredicate, depth, reason: "effect_too_small", detail: `lift ${round2(stats.lift)} / Δ ${round2(stats.rate - baseRate)}` });
            return stats; // still a valid parent to expand from, but not surfaced
        }
        // parent-conditional gate (only for depth ≥ 2): child must beat parent
        if (depth >= 2) {
            const gainOk = stats.marginalGain >= minMarginalGain && stats.marginalGain >= marginZ * stats.marginalSE;
            if (!gainOk) {
                if (pruned.length < MAX_PRUNED_KEPT) pruned.push({ predicate, parentPredicate, depth, reason: "no_marginal_gain", detail: `+${round2(stats.marginalGain)} over parent (need ${round2(Math.max(minMarginalGain, marginZ * stats.marginalSE))})` });
                return stats; // expandable, not surfaced
            }
        }
        if (stats.confidence === "Very Low") {
            if (pruned.length < MAX_PRUNED_KEPT) pruned.push({ predicate, parentPredicate, depth, reason: "low_confidence", detail: "confidence Very Low" });
            return stats;
        }
        stats.surfacedPreFDR = true;
        survivors.push(stats);
        return stats;
    }

    // depth 1 — seed
    let beam = [];
    for (const dim of dims) {
        for (const value of distinctValues(list, dim)) {
            const cohort = list.filter((t) => String(dim.accessor(t)) === value);
            const stats = consider([{ dim: dim.key, label: dim.label, value }], cohort, 1, baseAsParent, null);
            if (stats) beam.push(stats);
        }
    }
    beam = beam.sort((a, b) => b.shrunkLift - a.shrunkLift).slice(0, beamWidth);

    // depth 2…maxDepth — guided greedy expansion
    for (let depth = 2; depth <= maxDepth; depth++) {
        const next = [];
        for (const parent of beam) {
            const usedKeys = new Set(parent.predicate.map((p) => p.dim));
            for (const dim of dims) {
                if (usedKeys.has(dim.key)) continue;
                for (const value of distinctValues(parent.trades, dim)) {
                    const childTrades = parent.trades.filter((t) => String(dim.accessor(t)) === value);
                    const predicate = [...parent.predicate, { dim: dim.key, label: dim.label, value }];
                    const stats = consider(predicate, childTrades, depth, parent, parent.predicate);
                    if (stats) next.push(stats);
                }
            }
        }
        beam = next.sort((a, b) => b.shrunkLift - a.shrunkLift).slice(0, beamWidth);
        if (!beam.length) break;
    }

    // (D) Benjamini–Hochberg over all evaluated cohorts
    const fdr = applyBH(evaluated, q);
    result.evaluatedCount = evaluated.length;
    result.fdr = { q, threshold: round3(fdr.threshold), discoveries: fdr.kMax, tested: fdr.m };

    // final survivors = passed all gates AND FDR; attach stability + explanation
    const final = survivors.filter((s) => s.fdrPass).map((s) => {
        const stability = stabilityFlag(s.trades, { target, baseRate });
        const dimensions = s.predicate.map((p) => ({ dim: p.dim, label: p.label, value: p.value }));
        const explanation =
            `${target.label}: ${round1(s.rate * 100)}% in this cohort vs ${round1(baseRate * 100)}% baseline ` +
            `(lift ${round2(s.lift)}×, n=${s.n}, ${s.confidence} confidence, ${stability})` +
            (s.depth >= 2 ? ` · +${round1(s.marginalGain * 100)}pp over parent "${predicateLabel(s.parentPredicate)}"` : "");
        return {
            target: target.key,
            dimensions, depth: s.depth,
            label: s.predLabel,
            effect: round3(s.rate), shrunkEffect: round3(s.shrunkRate),
            confidence: s.confidence, confidenceScore: s.confidenceScore,
            stability,
            sampleSize: s.n, cohortTrades: s.trades.length,
            parentEffect: round3(s.parentRate), marginalGain: round3(s.marginalGain),
            breachRate: s.breachRate, lift: round2(s.lift), shrunkLift: round2(s.shrunkLift),
            avgR: s.avgR,
            pValue: round3(s.pValue),
            fdr: { pass: true },
            predicate: s.predicate, parentPredicate: s.parentPredicate,
            explanation,
        };
    });

    // rank: stable first, then shrunk lift, then confidence
    const stabRank = { stable: 0, stable_under: 0, one_half_only: 1, unstable: 2 };
    final.sort((a, b) =>
        (stabRank[a.stability] - stabRank[b.stability]) ||
        (b.shrunkLift - a.shrunkLift) ||
        (b.confidenceScore - a.confidenceScore),
    );

    result.clusters = final;
    result.pruned = pruned;
    return result;
}

export default buildClusterExplorer;
