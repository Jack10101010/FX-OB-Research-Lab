// ── cohortFilterSimulator.js ─────────────────────────────────────────────────
// Neutral cohort removal / discovery truth layer (Research Lab Phase 0). Extracted
// from components/lab/failures/shared/filterSimulator.js into the data layer so
// any consumer (Failures Lab today, Research Lab tomorrow) shares one engine.
// filterSimulator.js now re-exports this module unchanged.
//
// THE TRUTH LAYER. For any cohort ("Outside + CHoCH", "Deep breach >110%", …)
// this answers: "if I disable this cohort, what happens?" by REMOVING the actual
// matching trades and RECOMPUTING Net R / win rate / profit factor / counts from
// the remaining trades. No lift, no share-based estimates, no global averages —
// both sides of the trade-off (losses removed AND winners removed) come from the
// real R values of the matched trades.
//
// No React. Pure. No mutation of input trades (partitioning builds new arrays;
// trade objects are never written to). Safe math (no zero division).
//
// OVERFIT WARNING (carried into the UI): every result here is in-sample, single-run
// optimization. A discovered filter is a HYPOTHESIS to re-test — not a live
// trading instruction.

import {
    CORE_DIMENSIONS, DIMENSION_BY_KEY, resolveDimension, dimensionAvailable,
} from "@/data/cohortDimensions";

// rOf — inlined (was imported from failuresUtils) so this module depends only on
// the dimension registry. Identical semantics to failuresUtils.rOf.
function rOf(trade) {
    const v = Number(trade?.r ?? trade?.pnl_r ?? trade?.R);
    return Number.isFinite(v) ? v : 0;
}

const round1 = (v) => Number(Number(v).toFixed(1));
const round2 = (v) => Number(Number(v).toFixed(2));

// ── Population metrics (actual Rs) ────────────────────────────────────────────
// negR is reported as a positive magnitude. profitFactor is null when there are
// no losses (∞ when posR > 0 — render as "∞" upstream, never divide).
export function metricsOf(trades) {
    const list = Array.isArray(trades) ? trades : [];
    let winners = 0, losers = 0, posR = 0, negR = 0;
    for (const t of list) {
        const r = rOf(t);
        if (r > 0) { winners += 1; posR += r; }
        else if (r < 0) { losers += 1; negR += -r; }
        // r === 0 → counted in trades, neither winner nor loser (scratch).
    }
    const count = list.length;
    return {
        trades: count,
        winners,
        losers,
        posR: round2(posR),
        negR: round2(negR),
        netR: round2(posR - negR),
        winRate: count ? round1((winners / count) * 100) : 0,
        profitFactor: negR > 0 ? round2(posR / negR) : null,
    };
}

// ── Core simulation ───────────────────────────────────────────────────────────
// simulateRemoval(trades, matchFn) → one simulation result. Partitions the actual
// trades into removed (matchFn true) / kept, then recomputes everything from the
// kept set. netRImpact ≡ after.netR − before.netR ≡ lossRRemoved − winnerRRemoved.
export function simulateRemoval(trades, matchFn) {
    const list = Array.isArray(trades) ? trades : [];
    const removed = [];
    const kept = [];
    for (const t of list) (matchFn(t) ? removed : kept).push(t);

    const before = metricsOf(list);
    const after = metricsOf(kept);
    const rem = metricsOf(removed);

    return {
        // ── removed side (both costs, actual Rs) ──
        tradesRemoved: rem.trades,
        losersRemoved: rem.losers,
        winnersRemoved: rem.winners,
        lossRRemoved: rem.negR,      // "Loss R saved"
        winnerRRemoved: rem.posR,    // "Winner R lost"
        // ── net effect ──
        netRImpact: round2(after.netR - before.netR),
        contributionPct: before.negR > 0 ? round1((rem.negR / before.negR) * 100) : 0,
        // ── before / after (recomputed from remaining trades) ──
        before,
        after,
        winRateChange: round1(after.winRate - before.winRate),
        pfBefore: before.profitFactor,
        pfAfter: after.profitFactor,
    };
}

// ── Cohort definition → match function ────────────────────────────────────────
// A cohort is {dimA, keyA} or {dimA, keyA, dimB, keyB} — the same vocabulary the
// Explorer / drivers / pairs rows already carry, so any surfaced row can be
// re-simulated. Matching uses the SAME registry accessors those surfaces used to
// build the row (string-compared), so removal removes exactly the rows' trades.
export function cohortMatcher({ dimA, keyA, dimB = null, keyB = null }) {
    const A = resolveDimension(dimA);
    const B = dimB != null ? resolveDimension(dimB) : null;
    if (!A || keyA == null) return () => false;
    const a = String(keyA);
    const b = keyB == null ? null : String(keyB);
    return (t) => {
        const va = A.accessor(t);
        if (va == null || String(va) !== a) return false;
        if (!B) return true;
        const vb = B.accessor(t);
        return vb != null && String(vb) === b;
    };
}

export function cohortLabel({ dimA, keyA, dimB = null, keyB = null }) {
    const A = resolveDimension(dimA);
    const B = dimB != null ? resolveDimension(dimB) : null;
    const left = `${keyA}`;
    return B ? `${left} + ${keyB}` : left;
}

// ── Recommendation thresholds ─────────────────────────────────────────────────
// Derived from actual net R improvement + sample adequacy. Kept as exported
// constants (same pattern as bucketRowAction's ACTION_* thresholds) so research
// can tune them without touching logic.
export const REC_STRONG_NET_R = 3;    // ≥ +3R net improvement
export const REC_TEST_NET_R = 1.5;    // ≥ +1.5R
export const REC_WATCH_NET_R = 0.5;   // ≥ +0.5R
export const REC_WINNER_COST_RATIO = 0.5; // Strong only if winners lost ≤ 50% of losses saved
export const REC_SAMPLE_FLOOR = 8;    // min removed LOSERS before Test/Strong

export function recommendFilter(sim, { sampleFloor = REC_SAMPLE_FLOOR } = {}) {
    if (!sim || !sim.tradesRemoved) {
        return { key: "neutral", label: "Neutral", tone: "muted" };
    }
    const enoughSample = sim.losersRemoved >= sampleFloor;
    const cheapWinners = sim.winnerRRemoved <= sim.lossRRemoved * REC_WINNER_COST_RATIO;

    if (sim.netRImpact >= REC_STRONG_NET_R && enoughSample && cheapWinners) {
        return { key: "strong_disable", label: "Strong Disable", tone: "danger" };
    }
    if (sim.netRImpact >= REC_TEST_NET_R && enoughSample) {
        return { key: "test_disable", label: "Test Disable", tone: "warning" };
    }
    if (sim.netRImpact >= REC_WATCH_NET_R) {
        // Positive but small — or big-but-thin sample (capped here on purpose).
        return { key: "watchlist", label: "Watchlist", tone: "secondary" };
    }
    return { key: "neutral", label: "Neutral", tone: "muted" };
}

// ── Discovery: enumerate cohorts and rank by net R improvement ────────────────
// Single-dimension cohorts come from every observed value of every AVAILABLE
// registry dimension; pair cohorts from the curated pair list (no free-form
// combination mining — V4 decision, unchanged). Each cohort runs through the same
// simulateRemoval truth layer.
export const DISCOVERY_PAIRS = [
    ["session", "direction"],
    ["structure", "direction"],
    ["session", "structure"],
    ["hour", "structure"],
];

function observedValues(trades, dim) {
    const seen = new Set();
    for (const t of trades) {
        const v = dim.accessor(t);
        if (v != null) seen.add(String(v));
    }
    return [...seen];
}

function observedPairValues(trades, A, B) {
    const seen = new Set();
    const out = [];
    for (const t of trades) {
        const va = A.accessor(t);
        if (va == null) continue;
        const vb = B.accessor(t);
        if (vb == null) continue;
        const id = `${va}${vb}`;
        if (!seen.has(id)) { seen.add(id); out.push([String(va), String(vb)]); }
    }
    return out;
}

export function buildFilterDiscovery(trades, {
    dims = CORE_DIMENSIONS,
    pairs = DISCOVERY_PAIRS,
    sampleFloor = REC_SAMPLE_FLOOR,
    topN = 30,
} = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const totals = metricsOf(list);
    const rows = [];

    if (list.length) {
        // ── single-dimension cohorts ──
        for (const dimRef of dims) {
            const dim = resolveDimension(dimRef);
            if (!dim || !dimensionAvailable(dim, list)) continue;
            for (const value of observedValues(list, dim)) {
                const def = { dimA: dim.key, keyA: value };
                const sim = simulateRemoval(list, cohortMatcher(def));
                if (!sim.tradesRemoved) continue;
                rows.push(makeRow(def, dim, null, sim, sampleFloor));
            }
        }
        // ── curated pair cohorts ──
        for (const [aKey, bKey] of pairs) {
            const A = DIMENSION_BY_KEY[aKey];
            const B = DIMENSION_BY_KEY[bKey];
            if (!A || !B) continue;
            if (!dimensionAvailable(A, list) || !dimensionAvailable(B, list)) continue;
            for (const [va, vb] of observedPairValues(list, A, B)) {
                const def = { dimA: A.key, keyA: va, dimB: B.key, keyB: vb };
                const sim = simulateRemoval(list, cohortMatcher(def));
                if (!sim.tradesRemoved) continue;
                rows.push(makeRow(def, A, B, sim, sampleFloor));
            }
        }
    }

    // Rank: adequate-sample rows first, then net R improvement descending.
    rows.sort((a, b) => (Number(b.rankable) - Number(a.rankable)) || (b.netRImpact - a.netRImpact));

    return {
        rows: rows.slice(0, topN),
        totalCohorts: rows.length,
        totals,
        meta: { sampleFloor, topN, pairs },
    };
}

function makeRow(def, A, B, sim, sampleFloor) {
    const recommendation = recommendFilter(sim, { sampleFloor });
    return {
        id: B ? `${A.key}:${def.keyA}${B.key}:${def.keyB}` : `${A.key}:${def.keyA}`,
        cohort: cohortLabel(def),
        dimLabel: B ? `${A.label} × ${B.label}` : A.label,
        isPair: !!B,
        ...def,
        ...sim,
        lowSample: sim.losersRemoved < sampleFloor,
        rankable: sim.losersRemoved >= sampleFloor,
        recommendation,
    };
}

// ── Quick cards: the single best (positive) filter per requested dimension ─────
// and the best curated pair. Returns only entries that actually improve net R.
export function bestFiltersByDimension(discovery, dimKeys = ["session", "structure", "penetration"]) {
    const rows = discovery?.rows ?? [];
    const out = [];
    for (const key of dimKeys) {
        const best = rows.find((r) => !r.isPair && r.dimA === key && r.netRImpact > 0 && r.rankable)
            ?? rows.find((r) => !r.isPair && r.dimA === key && r.netRImpact > 0);
        if (best) out.push({ slot: key, slotLabel: DIMENSION_BY_KEY[key]?.label ?? key, row: best });
    }
    const bestPair = rows.find((r) => r.isPair && r.netRImpact > 0 && r.rankable)
        ?? rows.find((r) => r.isPair && r.netRImpact > 0);
    if (bestPair) out.push({ slot: "pair", slotLabel: "Pair", row: bestPair });
    return out;
}
