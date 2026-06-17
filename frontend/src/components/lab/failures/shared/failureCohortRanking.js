// ── failureCohortRanking.js ──────────────────────────────────────────────────
// Failures Lab V6 — the DECISION layer on top of the existing cohort cube.
// Answers "what should I investigate next?" by enumerating cohorts, joining the
// metrics the other engines already compute, scoring them through four lenses, and
// emitting a deduped Research Priority Queue of actionable suggestions.
//
// NOT another explorer / analytics table. Pure composition + ranking. No React.
//
// Reuses (never reimplements):
//   buildFilterDiscovery / simulateRemoval / recommendFilter  — truth-layer cohort spine.
//   aggregateFailures                                          — lift / loss-rate delta / severity.
//   getMfeR                                                    — per-cohort MFE reach / pool.
//   buildConfirmedFalseLosers                                  — confirmed false-loser % (when post-stop data present).
//   preventionConfidence                                      — sample-size confidence tier.
//   isPerformanceTrade                                        — valid trade universe (Run Detail parity).
//
// CAVEATS carried into the UI: recoverability / protection value is an OPTIMISTIC
// UPPER BOUND (peak MFE only — no retrace, no winner cost). Every suggestion is an
// in-sample research hypothesis, not a live rule.

import { rOf, filterLosers } from "./failuresUtils";
import { resolveDimension } from "./failuresDimensions";
import { aggregateFailures } from "./failuresAggregation";
import { getMfeR } from "./excursionAnalytics";
import { buildConfirmedFalseLosers, preventionConfidence } from "./failuresAnalytics";
import {
    buildFilterDiscovery, cohortMatcher, cohortLabel, DISCOVERY_PAIRS,
} from "./filterSimulator";
import { isPerformanceTrade } from "@/data/tradeClassification";

const round1 = (v) => Number(Number(v).toFixed(1));
const round2 = (v) => Number(Number(v).toFixed(2));

// ── Tunable weights (named, so research can tune without touching logic) ─────────
// Each lens is a weighted sum of RANK-NORMALISED metrics (rank-based ⇒ robust to
// outliers on small cohort sets). Weights within a lens are intended to sum to 1.
export const RANKING_WEIGHTS = {
    worst:      { lossR: 0.45, contributionPct: 0.30, lift: 0.15, lossRateDelta: 0.10 },
    recoverable:{ reach1R: 0.40, avgMfe: 0.25, recoverablePool: 0.20, confirmedPct: 0.15 },
    protection: { recoverablePool: 0.40, reach1R: 0.35, losers: 0.25 },
    // filter lens is NOT scored here — it ranks by truth-layer netRImpact directly.
};

// Confidence tier → score multiplier. SPECULATIVE cohorts are excluded from the pool
// entirely (rankable gate), so they can never top anything; the multiplier only
// down-weights WEAK vs MODERATE vs STRONG within the queue.
export const CONFIDENCE_MULTIPLIER = { STRONG: 1.0, MODERATE: 0.85, WEAK: 0.6, SPECULATIVE: 0.3 };

const RECOVERY_REACH_R = 1; // "recoverable" threshold: reached ≥ +1R before failing.

const LENS_META = {
    worst:      { tag: "Worst cohort",        action: "Investigate" },
    recoverable:{ tag: "Recoverable",         action: "Watch" },
    filter:     { tag: "Filter candidate",    action: "Test filter" },
    protection: { tag: "Protection candidate",action: "Test protection" },
};

// ── helpers ──────────────────────────────────────────────────────────────────

// Percentile rank-normalisation in [0,1] (higher value ⇒ closer to 1). Ties share a
// value. Robust to outliers (uses ranks, not magnitudes). Single/uniform set ⇒ 0.5.
function rankNorm(records, getVal) {
    const vals = records.map(getVal).map((v) => (Number.isFinite(v) ? v : 0));
    const n = vals.length;
    const out = new Map();
    if (n <= 1) { records.forEach((r) => out.set(r, 0.5)); return out; }
    records.forEach((r, i) => {
        const v = vals[i];
        const below = vals.filter((x) => x < v).length;
        out.set(r, below / (n - 1));
    });
    return out;
}

function cohortId({ dimA, keyA, dimB, keyB }) {
    return dimB ? `${dimA}:${keyA}||${dimB}:${keyB}` : `${dimA}:${keyA}`;
}

// Is single S a component dimension of pair P (e.g. "London" is part of "London + BOS")?
function singleIsComponentOfPair(single, pair) {
    if (single.dimB || !pair.dimB) return false;
    return (pair.dimA === single.dimA && String(pair.keyA) === String(single.keyA))
        || (pair.dimB === single.dimA && String(pair.keyB) === String(single.keyA));
}

function emptyResult(meta) {
    return { queue: [], worst: [], recoverable: [], filterCandidates: [], protectionCandidates: [], meta };
}

// ── builder ──────────────────────────────────────────────────────────────────

export function buildFailureCohortRanking(allTrades, { config, sampleFloor = 8, topN = 6 } = {}) {
    const raw = Array.isArray(allTrades) ? allTrades : [];
    const valid = raw.filter(isPerformanceTrade);
    const baseMeta = {
        sampleFloor, topN,
        totalTrades: valid.length,
        totalCohorts: 0,
        mfeAvailable: false,
        confirmedAvailable: false,
        weights: RANKING_WEIGHTS,
    };
    if (!valid.length) return emptyResult(baseMeta);

    const losers = filterLosers(valid);
    const mfeAvailable = losers.some((t) => getMfeR(t) != null);

    // Canonical per-trade false-loser classification (only lights up with post-stop
    // export). Keyed off the trade ref so it joins to ANY cohort without label drift.
    const cfl = buildConfirmedFalseLosers(losers);
    const confirmedAvailable = !!cfl.available;
    const classified = confirmedAvailable
        ? [...cfl.confirmed, ...cfl.candidate, ...cfl.genuine]
        : [];

    // 1. Cohort spine + truth-layer filter metrics (single dims + curated pairs).
    const discovery = buildFilterDiscovery(valid, { sampleFloor, topN: Infinity });
    const baselineLossRate = discovery.totals.trades
        ? (discovery.totals.losers / discovery.totals.trades) * 100
        : 0;

    // 2. aggregateFailures lookup for lift / lossRateDelta / avgSeverity, indexed by
    //    cohort id. One pass per available single dim + per curated pair.
    const aggIndex = new Map();
    const singleDimKeys = [...new Set(discovery.rows.filter((r) => !r.isPair).map((r) => r.dimA))];
    for (const dk of singleDimKeys) {
        const dim = resolveDimension(dk);
        if (!dim) continue;
        const { cells } = aggregateFailures(valid, { dimA: dim, baseline: valid, sampleFloor });
        for (const c of cells) aggIndex.set(`${dk}:${c.keyA}`, c);
    }
    for (const [aKey, bKey] of DISCOVERY_PAIRS) {
        const A = resolveDimension(aKey); const B = resolveDimension(bKey);
        if (!A || !B) continue;
        const { cells } = aggregateFailures(valid, { dimA: A, dimB: B, baseline: valid, sampleFloor });
        for (const c of cells) aggIndex.set(`${aKey}:${c.keyA}||${bKey}:${c.keyB}`, c);
    }

    // 3. Assemble cohort records (rankable cohorts only → SPECULATIVE excluded up front).
    const records = [];
    for (const row of discovery.rows) {
        if (!row.rankable) continue;                    // losersRemoved ≥ sampleFloor
        const def = { dimA: row.dimA, keyA: row.keyA, dimB: row.dimB ?? null, keyB: row.keyB ?? null };
        const matchFn = cohortMatcher(def);

        // Per-cohort MFE reach / pool (uniform for single + pair; getMfeR is the canonical accessor).
        const cohortLosers = losers.filter(matchFn);
        const mfes = cohortLosers.map(getMfeR).filter((m) => Number.isFinite(m));
        const reachers = cohortLosers.filter((t) => { const m = getMfeR(t); return Number.isFinite(m) && m >= RECOVERY_REACH_R; });
        const avgMfe = mfes.length ? round2(mfes.reduce((s, m) => s + m, 0) / mfes.length) : null;
        const reach1R = mfes.length ? round1((reachers.length / mfes.length) * 100) : null;
        const recoverablePool = round1(reachers.reduce((s, t) => s + Math.abs(rOf(t)), 0));

        // Per-cohort confirmed false-loser % (label-drift-free: joins on the trade ref).
        let confirmedPct = null;
        if (confirmedAvailable) {
            const members = classified.filter((c) => c._trade && matchFn(c._trade));
            if (members.length) confirmedPct = round1((members.filter((c) => c.class === "confirmed").length / members.length) * 100);
        }

        const agg = aggIndex.get(cohortId(def));
        const count = row.tradesRemoved;
        const cohortNetR = round2(row.winnerRRemoved - row.lossRRemoved);
        const metrics = {
            count,
            losers: row.losersRemoved,
            winners: row.winnersRemoved,
            netR: cohortNetR,                                   // cohort's own net R
            expectancy: count ? round2(cohortNetR / count) : 0,
            lossR: row.lossRRemoved,
            contributionPct: row.contributionPct,
            lift: agg ? agg.lift : null,
            lossRateDelta: agg ? agg.lossRateDelta : round1((count ? (row.losersRemoved / count) * 100 : 0) - baselineLossRate),
            avgSeverity: agg ? agg.avgSeverity : null,
            avgMfe,
            reach1R,
            recoverablePool,
            filterNetRImpact: row.netRImpact,                   // truth layer — never re-estimated
            winnersRemoved: row.winnersRemoved,
            losersRemoved: row.losersRemoved,
            recommendation: row.recommendation,
            confirmedPct,
        };

        records.push({
            dimA: def.dimA, keyA: def.keyA, dimB: def.dimB, keyB: def.keyB,
            isPair: !!def.dimB,
            cohortLabel: cohortLabel(def),
            confidence: preventionConfidence(row.losersRemoved),
            metrics,
        });
    }

    if (!records.length) {
        return emptyResult({ ...baseMeta, totalCohorts: discovery.rows.length, mfeAvailable, confirmedAvailable });
    }

    const confMult = (r) => CONFIDENCE_MULTIPLIER[r.confidence] ?? 0.3;

    // 4. Lens scoring (rank-normalised, confidence-weighted).
    // A — Worst cohorts (damage / contribution / lift / loses-more-often).
    const nLossR = rankNorm(records, (r) => r.metrics.lossR);
    const nContrib = rankNorm(records, (r) => r.metrics.contributionPct);
    const nLift = rankNorm(records, (r) => r.metrics.lift ?? 0);
    const nDelta = rankNorm(records, (r) => Math.max(0, r.metrics.lossRateDelta ?? 0));
    const WW = RANKING_WEIGHTS.worst;
    const worstScore = (r) => (WW.lossR * nLossR.get(r) + WW.contributionPct * nContrib.get(r)
        + WW.lift * nLift.get(r) + WW.lossRateDelta * nDelta.get(r)) * confMult(r);

    // B & D — recoverable / protection need MFE. Only consider cohorts carrying MFE.
    const mfeRecords = records.filter((r) => r.metrics.reach1R != null && r.metrics.avgMfe != null);
    const nReach = rankNorm(mfeRecords, (r) => r.metrics.reach1R);
    const nAvgMfe = rankNorm(mfeRecords, (r) => r.metrics.avgMfe);
    const nPool = rankNorm(mfeRecords, (r) => r.metrics.recoverablePool);
    const nConfirmed = rankNorm(mfeRecords, (r) => r.metrics.confirmedPct ?? 0);
    const nLosers = rankNorm(mfeRecords, (r) => r.metrics.losers);
    const WR = RANKING_WEIGHTS.recoverable;
    const recoverableScore = (r) => {
        // Redistribute the confirmedPct weight into reach when post-stop data is absent.
        const conf = confirmedAvailable ? WR.confirmedPct * nConfirmed.get(r) : 0;
        const reachW = confirmedAvailable ? WR.reach1R : WR.reach1R + WR.confirmedPct;
        return (reachW * nReach.get(r) + WR.avgMfe * nAvgMfe.get(r) + WR.recoverablePool * nPool.get(r) + conf) * confMult(r);
    };
    const WP = RANKING_WEIGHTS.protection;
    const protectionScore = (r) => (WP.recoverablePool * nPool.get(r) + WP.reach1R * nReach.get(r)
        + WP.losers * nLosers.get(r)) * confMult(r);

    const sortedBy = (list, fn) => [...list].map((r) => ({ r, s: fn(r) })).sort((a, b) => b.s - a.s);

    const worst = sortedBy(records, worstScore).slice(0, topN).map(({ r, s }) => ({ ...r, score: round2(s) }));
    const recoverable = sortedBy(mfeRecords, recoverableScore).slice(0, topN).map(({ r, s }) => ({ ...r, score: round2(s) }));
    const protectionCandidates = sortedBy(mfeRecords, protectionScore).slice(0, topN).map(({ r, s }) => ({ ...r, score: round2(s) }));

    // C — Filter candidates: truth-layer netRImpact directly, among RECOMMENDED cohorts
    //     (recommendFilter already bakes in the winner-cost / sample guards).
    const filterRecKeys = new Set(["strong_disable", "test_disable", "watchlist"]);
    const filterPool = records.filter((r) => filterRecKeys.has(r.metrics.recommendation?.key) && r.metrics.filterNetRImpact > 0);
    const nFilter = rankNorm(filterPool, (r) => r.metrics.filterNetRImpact);
    const filterCandidates = [...filterPool]
        .sort((a, b) => b.metrics.filterNetRImpact - a.metrics.filterNetRImpact)
        .slice(0, topN)
        .map((r) => ({ ...r, score: round2(nFilter.get(r) ?? 0) }));

    // 5. Research Priority Queue — diversity-first, deduped, pair-preferred, capped.
    const reasonFor = (lens, m) => {
        if (lens === "worst") {
            const bits = [`Large damage: ${m.lossR}R loss (${m.contributionPct}% of all losses)`];
            if (m.lift != null && m.lift >= 1.3) bits.push(`${m.lift}× over-represented`);
            if (m.expectancy < 0) bits.push(`expectancy ${m.expectancy}R`);
            return bits.join(" · ") + ".";
        }
        if (lens === "filter") {
            return `Disabling it improves Net R by ${m.filterNetRImpact >= 0 ? "+" : ""}${m.filterNetRImpact}R (removes ${m.losersRemoved} losers, ${m.winnersRemoved} winners). In-sample — re-test.`;
        }
        if (lens === "protection") {
            return `~${m.recoverablePool}R recoverable (upper bound): ${m.reach1R}% of its losers reached +1R before failing, avg MFE +${m.avgMfe}R.`;
        }
        // recoverable
        const tail = m.confirmedPct != null ? ` · ${m.confirmedPct}% confirmed false losers` : "";
        return `${m.reach1R}% reached +1R before failing (avg MFE +${m.avgMfe}R)${tail}.`;
    };

    const mkEntry = (rec, lens) => ({
        ...LENS_META[lens],
        lens,
        dimA: rec.dimA, keyA: rec.keyA, dimB: rec.dimB, keyB: rec.keyB,
        isPair: rec.isPair,
        cohortLabel: rec.cohortLabel,
        confidence: rec.confidence,
        score: rec.score,
        reason: reasonFor(lens, rec.metrics),
        metrics: rec.metrics,
    });

    // Seed: top-2 of each lens (priority order), tagged.
    const seeded = [
        ...worst.slice(0, 2).map((r) => mkEntry(r, "worst")),
        ...filterCandidates.slice(0, 2).map((r) => mkEntry(r, "filter")),
        ...protectionCandidates.slice(0, 2).map((r) => mkEntry(r, "protection")),
        ...recoverable.slice(0, 2).map((r) => mkEntry(r, "recoverable")),
    ];

    // Dedup by cohort: keep the highest-scoring lens entry for each cohort.
    const byCohort = new Map();
    for (const e of seeded) {
        const id = cohortId(e);
        const prev = byCohort.get(id);
        if (!prev || e.score > prev.score) byCohort.set(id, e);
    }
    let entries = [...byCohort.values()];

    // Prefer the more specific pair over a broad single describing the same issue.
    const pairEntries = entries.filter((e) => e.isPair);
    entries = entries.filter((e) => {
        if (e.isPair) return true;
        const coveredByPair = pairEntries.find((p) => singleIsComponentOfPair(e, p) && p.score >= e.score);
        return !coveredByPair;
    });

    // Cap pair-heavy output so the queue stays readable.
    const maxPairs = Math.ceil(topN / 2);
    entries.sort((a, b) => b.score - a.score);
    let pairCount = 0;
    const capped = [];
    for (const e of entries) {
        if (e.isPair) { if (pairCount >= maxPairs) continue; pairCount += 1; }
        capped.push(e);
    }

    const queue = capped.slice(0, topN).map((e, i) => ({ rank: i + 1, ...e }));

    return {
        queue,
        worst,
        recoverable,
        filterCandidates,
        protectionCandidates,
        meta: { ...baseMeta, totalCohorts: discovery.rows.length, mfeAvailable, confirmedAvailable, baselineLossRate: round1(baselineLossRate) },
    };
}

export default buildFailureCohortRanking;
