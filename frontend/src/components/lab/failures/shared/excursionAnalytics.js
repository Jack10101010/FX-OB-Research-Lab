// ── excursionAnalytics.js ────────────────────────────────────────────────────
// Pure "Distance Before Stop" / MFE analytics for Failures Lab (V2 Phase 1).
// No React. No UI imports. Pure functions, safe inside useMemo.
//
// Answers: "before these losing trades stopped out, how far did they move in my
// favour?" — a hypothesis-generation surface for break-even / partials / protection
// research.
//
// ── INTEGRITY GUARDRAIL ──────────────────────────────────────────────────────
// All break-even "opportunity" / "savable R" outputs are an OPTIMISTIC UPPER BOUND.
// We only have peak MFE (`mfeR`), NOT the post-peak path. So we can say a loser
// *reached* a level (and *could* have armed BE), but we CANNOT know whether price
// retraced to entry to trigger the BE exit, nor model winner cost. Every returned
// object carries `upperBound: true`; callers MUST label these figures accordingly
// ("upper bound", "potentially savable", "validate with exact BE backtest").

import { rOf, isFiniteNumber } from "./failuresUtils";
import { aggregateFailures } from "./failuresAggregation";
import { FAILURE_DIMENSIONS, DIMENSION_BY_KEY, dimensionAvailable, availableDimensions, resolveDimension } from "./failuresDimensions";

const numOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const round1 = (v) => Number(Number(v).toFixed(1));
const round2 = (v) => Number(Number(v).toFixed(2));

// "Never moved" threshold in R — favourable excursion at/under this counts as zero.
export const EPS_R = 0.02;
// Minimum reached-loser count before a BE level is considered actionable.
export const SAMPLE_FLOOR = 10;

// ── Field accessors ─────────────────────────────────────────────────────────

// mfeR — max favourable excursion in R (stop-anchored: 1.0R = full risk distance).
// Aliases mirror the importer (mfeR / mfe_r) plus the legacy bare `mfe`.
export function getMfeR(trade) {
    return numOrNull(trade?.mfeR ?? trade?.mfe_r ?? trade?.mfe);
}

// maeR — max ADVERSE excursion in R (stop-anchored: -1.0R = the full stop distance,
// so values are ≤ 0). Aliases mirror the importer (maeR / mae_r) plus legacy bare `mae`.
export function getMaeR(trade) {
    return numOrNull(trade?.maeR ?? trade?.mae_r ?? trade?.mae);
}

// Stop-pressure MAE accessor (Phase 2B). Prefers the to-original-exit field (adverse R
// over the trade's REAL life — the correct "how close did the winner come to the stop
// before winning?" measure) and falls back to the stop-anchored mae_r for legacy bundles
// that predate the backend Phase 11A.2 export. Returns { value, source } where source is
// "to_original_exit" | "stop_anchored_fallback", or { value: null, source: null }.
export function getMaeForStopPressure(trade) {
    const toExit = numOrNull(trade?.maeRToOriginalExit ?? trade?.mae_r_to_original_exit);
    if (toExit != null) return { value: toExit, source: "to_original_exit" };
    const stopAnchored = getMaeR(trade);
    if (stopAnchored != null) return { value: stopAnchored, source: "stop_anchored_fallback" };
    return { value: null, source: null };
}

// Target RR multiple. Per-trade `rr_config` is preferred; falls back to the
// run/config RR. Returns null when no usable (>0) target exists.
export function getTargetRR(trade, config) {
    const perTrade = numOrNull(trade?.rr_config ?? trade?.rrConfig);
    if (perTrade != null && perTrade > 0) return perTrade;
    const cfg = config || {};
    const runRR = numOrNull(
        cfg.rr_multiple ?? cfg.rrMultiple ?? cfg.rr ?? cfg.risk_reward ?? cfg.riskReward,
    );
    return runRR != null && runRR > 0 ? runRR : null;
}

// % of target reached = mfeR / targetRR · 100, clamped to [0,100]. null if N/A.
export function mfePctOfTarget(mfeR, targetRR) {
    if (!isFiniteNumber(mfeR) || !isFiniteNumber(targetRR) || targetRR <= 0) return null;
    const pct = (mfeR / targetRR) * 100;
    return Math.max(0, Math.min(100, pct));
}

// ── Bucket definitions ────────────────────────────────────────────────────────

// Primary: % of target RR. ("never" is decided by the caller via mfeR ≤ EPS_R;
// the test here only sorts pct > 0.)
export const MFE_PCT_BUCKETS = [
    { key: "never",  label: "Never moved", flag: "instant", test: (p) => p <= 0 },
    { key: "lt10",   label: "<10%",         flag: "instant", test: (p) => p > 0 && p < 10 },
    { key: "10_25",  label: "10–25%",       flag: null,      test: (p) => p >= 10 && p < 25 },
    { key: "25_50",  label: "25–50%",       flag: null,      test: (p) => p >= 25 && p < 50 },
    { key: "50_75",  label: "50–75%",       flag: null,      test: (p) => p >= 50 && p < 75 },
    { key: "75_90",  label: "75–90%",       flag: "almost",  test: (p) => p >= 75 && p < 90 },
    { key: "90plus", label: "90%+",         flag: "almost",  test: (p) => p >= 90 },
];

// Raw-R buckets — the PRIMARY language as of V3 (survives RR/target changes,
// aligns directly with risk). "instant failure" = never / <0.25R; "almost worked"
// = 1–2R / 2R+ (moved a full risk distance or more in favour before failing).
export const MFE_RAW_BUCKETS = [
    { key: "never",   label: "Never moved", flag: "instant" },
    { key: "lt025",   label: "<0.25R",      flag: "instant" },
    { key: "025_05",  label: "0.25–0.5R",   flag: null },
    { key: "05_1",    label: "0.5–1R",      flag: null },
    { key: "1_2",     label: "1–2R",        flag: "almost" },
    { key: "2plus",   label: "2R+",         flag: "almost" },
];

// Assign a pct value to a bucket key (pct > 0; "never" handled by caller via mfeR).
export function bucketMfePct(pct) {
    for (const b of MFE_PCT_BUCKETS) {
        if (b.key === "never") continue;
        if (b.test(pct)) return b.key;
    }
    return "never";
}

export function bucketMfeRaw(mfeR) {
    if (!isFiniteNumber(mfeR) || mfeR <= EPS_R) return "never";
    if (mfeR < 0.25) return "lt025";
    if (mfeR < 0.5)  return "025_05";
    if (mfeR < 1)    return "05_1";
    if (mfeR < 2)    return "1_2";
    return "2plus";
}

// ── Internal: enrich losers with mfeR / targetRR / pct / lossR ─────────────────

function enrich(losers, config) {
    return (Array.isArray(losers) ? losers : []).map((t) => {
        const mfeR = getMfeR(t);
        const targetRR = getTargetRR(t, config);
        return {
            lossR: Math.abs(rOf(t)),
            mfeR,
            targetRR,
            pct: mfePctOfTarget(mfeR, targetRR),
        };
    });
}

// Decide the distribution metric from data availability.
//   "pct"  — ≥50% of MFE-carrying losers have a usable target RR
//   "raw"  — MFE present but target RR mostly absent
//   "none" — no MFE data at all
function decideMode(withMfe, pctEligible) {
    if (!withMfe.length) return "none";
    return pctEligible.length >= withMfe.length * 0.5 ? "pct" : "raw";
}

function deriveTargetSource(losers, config) {
    const list = Array.isArray(losers) ? losers : [];
    const anyPerTrade = list.some((t) => numOrNull(t?.rr_config ?? t?.rrConfig) > 0);
    const cfg = config || {};
    const runRR = numOrNull(cfg.rr_multiple ?? cfg.rrMultiple ?? cfg.rr ?? cfg.risk_reward ?? cfg.riskReward);
    if (anyPerTrade) return "per_trade";
    if (runRR != null && runRR > 0) return "run";
    return "none";
}

// ── buildMfeDistribution ───────────────────────────────────────────────────────

export function buildMfeDistribution(losers, { config } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const total = list.length;
    const enriched = enrich(list, config);
    const withMfe = enriched.filter((e) => e.mfeR != null);
    const pctEligible = withMfe.filter((e) => e.targetRR != null);
    const mode = decideMode(withMfe, pctEligible);

    const base = {
        mode,
        coverage: {
            total,
            withMfe: withMfe.length,
            pct: total ? round1((withMfe.length / total) * 100) : 0,
            pctEligible: pctEligible.length,
        },
        targetRRSource: deriveTargetSource(list, config),
        upperBound: true,
    };

    if (mode === "none") return { ...base, buckets: [], totalLossR: 0 };

    const defs = mode === "pct" ? MFE_PCT_BUCKETS : MFE_RAW_BUCKETS;
    const considered = mode === "pct" ? pctEligible : withMfe; // pct mode: only losers with a target
    const totalLossR = considered.reduce((s, e) => s + e.lossR, 0);

    const counts = Object.fromEntries(defs.map((b) => [b.key, { count: 0, lossR: 0 }]));
    for (const e of considered) {
        const key = e.mfeR <= EPS_R
            ? "never"
            : (mode === "pct" ? bucketMfePct(e.pct) : bucketMfeRaw(e.mfeR));
        counts[key].count += 1;
        counts[key].lossR += e.lossR;
    }

    const buckets = defs.map((b) => {
        const c = counts[b.key];
        return {
            key: b.key,
            label: b.label,
            flag: b.flag ?? null,
            count: c.count,
            lossPct: considered.length ? round1((c.count / considered.length) * 100) : 0,
            lossR: round1(c.lossR),
            contributionPct: totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0,
        };
    });

    return { ...base, consideredN: considered.length, buckets, totalLossR: round1(totalLossR) };
}

// ── buildBeOpportunity ─────────────────────────────────────────────────────────
// Per arm level, the losers that REACHED it (could have armed BE) and the loss-R
// they represent. UPPER BOUND ONLY — see the integrity guardrail at the top.

export function buildBeOpportunity(losers, levels, { config, mode: modeOverride } = {}) {
    const enriched = enrich(losers, config);
    const withMfe = enriched.filter((e) => e.mfeR != null);
    const pctEligible = withMfe.filter((e) => e.targetRR != null);
    // Auto-decide pct vs raw, but let the caller force a framing (V3 made raw-R the
    // primary language for Distance to Stop). "none" (no MFE) always wins.
    const auto = decideMode(withMfe, pctEligible);
    const mode = auto === "none"
        ? "none"
        : (modeOverride === "raw" || modeOverride === "pct" ? modeOverride : auto);

    const base = { mode, sampleFloor: SAMPLE_FLOOR, upperBound: true };
    if (mode === "none") return { ...base, rows: [], consideredN: 0, totalLossR: 0 };

    const considered = mode === "pct" ? pctEligible : withMfe;
    const totalLossR = considered.reduce((s, e) => s + e.lossR, 0);
    const lvls = Array.isArray(levels) && levels.length
        ? levels
        : (mode === "pct" ? [25, 50, 75, 90] : [0.25, 0.5, 0.75, 1]);

    const rows = lvls.map((L) => {
        const reached = considered.filter((e) => (mode === "pct" ? (e.pct ?? -1) >= L : e.mfeR >= L));
        const lossR = round1(reached.reduce((s, e) => s + e.lossR, 0));
        return {
            level: L,
            label: mode === "pct" ? `${L}% of TP` : `+${L}R`,
            reached: reached.length,
            reachedPct: considered.length ? round1((reached.length / considered.length) * 100) : 0,
            savableLossRUpperBound: lossR,        // UPPER BOUND — winner cost / retrace not modelled
            contributionPct: totalLossR > 0 ? round1((lossR / totalLossR) * 100) : 0,
            lowSample: reached.length < SAMPLE_FLOOR,
        };
    });

    return { ...base, rows, consideredN: considered.length, totalLossR: round1(totalLossR) };
}

// ── Exclusive arm-level ranges (companion view to buildBeOpportunity) ───────────
// buildBeOpportunity is CUMULATIVE (reached ≥ level). This is the EXCLUSIVE
// partition: each MFE-carrying loser lands in exactly one band by its peak MFE, so
// the table answers "where did losers top out before failing?".
//
// Boundaries are aligned to the BE arm levels (0.25 / 0.5 / 1 / 1.5 / 2R) and split
// 1–2R into 1–1.5R / 1.5–2R. This is DISTINCT from MFE_RAW_BUCKETS (the bucket-chart
// bands, 6 of them) — that set must not change, so we keep a separate band list here
// rather than mutating the chart's. Lower edge inclusive, upper edge exclusive;
// "never" is mfeR ≤ EPS_R. Still an UPPER-BOUND framing (peak MFE only).
export const BE_EXCLUSIVE_BANDS = [
    { key: "never",  label: "Never moved", flag: "instant", test: (m) => m <= EPS_R },
    { key: "0_025",  label: "0–0.25R",     flag: "instant", test: (m) => m > EPS_R && m < 0.25 },
    { key: "025_05", label: "0.25–0.5R",   flag: null,      test: (m) => m >= 0.25 && m < 0.5 },
    { key: "05_1",   label: "0.5–1R",      flag: null,      test: (m) => m >= 0.5  && m < 1 },
    { key: "1_15",   label: "1–1.5R",      flag: "almost",  test: (m) => m >= 1    && m < 1.5 },
    { key: "15_2",   label: "1.5–2R",      flag: "almost",  test: (m) => m >= 1.5  && m < 2 },
    { key: "2plus",  label: "2R+",         flag: "almost",  test: (m) => m >= 2 },
];

// mfeR → exactly one BE_EXCLUSIVE_BANDS key (null when MFE absent/non-finite).
export function bucketBeExclusive(mfeR) {
    if (!isFiniteNumber(mfeR)) return null;
    for (const b of BE_EXCLUSIVE_BANDS) if (b.test(mfeR)) return b.key;
    return null; // unreachable for finite mfeR, but keeps the contract explicit
}

export function buildBeExclusiveRanges(losers, { config } = {}) {
    const enriched = enrich(losers, config);
    const withMfe = enriched.filter((e) => e.mfeR != null);
    const base = { mode: "raw", upperBound: true };
    if (!withMfe.length) return { ...base, mode: "none", rows: [], consideredN: 0, totalLossR: 0 };

    const totalLossR = withMfe.reduce((s, e) => s + e.lossR, 0);
    const counts = Object.fromEntries(BE_EXCLUSIVE_BANDS.map((b) => [b.key, { count: 0, lossR: 0 }]));
    for (const e of withMfe) {
        const k = bucketBeExclusive(e.mfeR);
        if (k == null) continue; // defensive; finite mfeR always matches a band
        counts[k].count += 1;
        counts[k].lossR += e.lossR;
    }
    const rows = BE_EXCLUSIVE_BANDS.map((b) => {
        const c = counts[b.key];
        return {
            key: b.key, label: b.label, flag: b.flag ?? null,
            trades: c.count,
            pctOfLosers: withMfe.length ? round1((c.count / withMfe.length) * 100) : 0,
            lossR: round1(c.lossR),
            contributionPct: totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0,
        };
    });
    return { ...base, rows, consideredN: withMfe.length, totalLossR: round1(totalLossR) };
}

// ══════════════════════════════════════════════════════════════════════════════
// V3 — Raw-R primary distribution + drilldown / failure-driver / pair-driver engine
// All ranked by DAMAGE (loss-R contribution), never by loss rate. Upper-bound note
// applies to BE framing only; the driver tables describe realized losses.
// ══════════════════════════════════════════════════════════════════════════════

export const DRILL_SAMPLE_FLOOR = 8; // min trades in a cell before it ranks

// Dimension registry + aggregation now live in failuresDimensions.js /
// failuresAggregation.js (V4 shared engine). The builders below are thin
// configurations of that engine.

const lossRof = (t) => Math.abs(rOf(t));
const sumLossR = (list) => list.reduce((s, t) => s + lossRof(t), 0);

// ── Loser MFE reach table (cumulative ≥ level, realized-loss framing) ──────────
// "How many losing trades reached +0.25 / +0.5 / +1 / +2 / +3 R in favour before
// stopping out?" This DESCRIBES realized losses (how far losers travelled) and makes
// NO break-even claim — buildBeOpportunity owns the optimistic upper-bound savable
// framing. `eligible` = losers carrying an mfeR value; reachedPct is over eligible;
// lossR is the absolute loss-R of the reached trades; contributionPct is their share
// of total eligible loss-R. Counts are cumulative, so they're non-increasing as the
// level rises. Safe on empty / MFE-less input (eligible 0 → zeroed rows).
export const MFE_REACH_LEVELS = [0.25, 0.5, 1, 2, 3];

export function buildLoserMfeReachTable(losses, levels = MFE_REACH_LEVELS) {
    const list = Array.isArray(losses) ? losses : [];
    const total = list.length;
    const withMfe = list.filter((t) => getMfeR(t) != null);
    const eligible = withMfe.length;
    const totalLossR = sumLossR(withMfe);
    const lvls = Array.isArray(levels) && levels.length ? levels : MFE_REACH_LEVELS;
    const rows = lvls.map((L) => {
        const reached = withMfe.filter((t) => getMfeR(t) >= L);
        const lossR = round1(sumLossR(reached));
        return {
            levelR: L,
            label: `+${L}R`,
            reachedCount: reached.length,
            reachedPct: eligible ? round1((reached.length / eligible) * 100) : 0,
            lossR,
            contributionPct: totalLossR > 0 ? round1((lossR / totalLossR) * 100) : 0,
            lowSample: reached.length < SAMPLE_FLOOR,
        };
    });
    return {
        rows,
        eligible,
        coverage: { total, eligible, pct: total ? round1((eligible / total) * 100) : 0 },
        totalLossR: round1(totalLossR),
        sampleFloor: SAMPLE_FLOOR,
    };
}

// ── Raw-R primary distribution (always raw; ignores targetRR) ──────────────────
export function buildRawRDistribution(losers) {
    const list = Array.isArray(losers) ? losers : [];
    const total = list.length;
    const withMfe = list.filter((t) => getMfeR(t) != null);
    const totalLossR = sumLossR(withMfe);
    const counts = Object.fromEntries(MFE_RAW_BUCKETS.map((b) => [b.key, { count: 0, lossR: 0 }]));
    for (const t of withMfe) {
        const k = bucketMfeRaw(getMfeR(t));
        counts[k].count += 1;
        counts[k].lossR += lossRof(t);
    }
    const buckets = MFE_RAW_BUCKETS.map((b) => {
        const c = counts[b.key];
        const tradeSharePct = withMfe.length ? round1((c.count / withMfe.length) * 100) : 0;
        const contributionPct = totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0;
        // Lift (same methodology as failuresAggregation): loss-R share ÷ trade share.
        // 1.00× = a bucket loses exactly its share of trades; >1 = disproportionately
        // damaging (the bucket's average loss is bigger than the typical loser).
        // Additive field — the clickable chart ignores it, so behaviour is unchanged.
        const lift = tradeSharePct > 0 ? round2(contributionPct / tradeSharePct) : 0;
        return {
            key: b.key, label: b.label, flag: b.flag ?? null,
            count: c.count,
            lossPct: withMfe.length ? round1((c.count / withMfe.length) * 100) : 0,
            tradeSharePct,
            lossR: round1(c.lossR),
            contributionPct,
            lift,
        };
    });
    return {
        mode: "raw",
        buckets,
        coverage: { total, withMfe: withMfe.length, pct: total ? round1((withMfe.length / total) * 100) : 0 },
        totalLossR: round1(totalLossR),
        upperBound: true,
    };
}

// Trades whose mfeR falls in `bucketKey`.
export function losersInRawBucket(losers, bucketKey) {
    return (Array.isArray(losers) ? losers : [])
        .filter((t) => getMfeR(t) != null && bucketMfeRaw(getMfeR(t)) === bucketKey);
}

// ── Bucket drilldown — ranked contributors within a selected raw-R bucket ──────
// Thin config of the shared engine: pre-filter to the bucket, aggregate per
// available dimension. Within-bucket contribution; Unknown dropped; lift exposed.
export function buildBucketDrilldown(losers, bucketKey, { topN = 6, dims = FAILURE_DIMENSIONS } = {}) {
    const withMfe = (Array.isArray(losers) ? losers : []).filter((t) => getMfeR(t) != null);
    const inBucket = withMfe.filter((t) => bucketMfeRaw(getMfeR(t)) === bucketKey);
    const allLossR = sumLossR(withMfe);
    const bucketLossR = sumLossR(inBucket);
    const sections = [];
    for (const dim of dims) {
        if (!dimensionAvailable(dim, inBucket)) continue;
        const { cells } = aggregateFailures(inBucket, { dimA: dim, sampleFloor: 1, requireKnown: true, topN });
        if (!cells.length) continue;
        sections.push({
            key: dim.key,
            label: dim.label,
            rows: cells.map((c) => ({ value: c.keyA, count: c.count, lossR: c.lossR, contributionPct: c.contributionPct, lift: c.lift })),
        });
    }
    return {
        bucketKey,
        trades: inBucket.length,
        lossR: round1(bucketLossR),
        contributionPct: allLossR > 0 ? round1((bucketLossR / allLossR) * 100) : 0,
        sections,
    };
}

// ── Failure drivers — top single-factor contributors across ALL losers ─────────
// Ranks by loss-R but now carries `lift` so a surface can tell volume from a true
// (disproportionate) driver.
export function buildFailureDrivers(losers, { minSample = DRILL_SAMPLE_FLOOR, topN = 8, dims = FAILURE_DIMENSIONS } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const totalLossR = sumLossR(list);
    const out = [];
    for (const dim of dims) {
        if (!dimensionAvailable(dim, list)) continue;
        const { cells } = aggregateFailures(list, { dimA: dim, sampleFloor: minSample, requireKnown: true });
        for (const c of cells) {
            if (!c.rankable) continue;
            out.push({
                dimKey: dim.key, dimLabel: dim.label, value: c.keyA,
                count: c.count, lossR: c.lossR, contributionPct: c.contributionPct,
                lift: c.lift, lossRateLift: c.lossRateLift,
            });
        }
    }
    out.sort((a, b) => b.lossR - a.lossR);
    return { totalLossR: round1(totalLossR), minSample, drivers: out.slice(0, topN) };
}

// ── Curated pair drivers (NO free-form combination mining) ─────────────────────
export const CURATED_PAIRS = [
    ["session", "direction"],
    ["structure", "direction"],
    ["fft", "session"],
    ["structure", "fft"],
    ["hour", "session"],
];

export function buildPairDrivers(losers, { minSample = DRILL_SAMPLE_FLOOR, topN = 8, pairs = CURATED_PAIRS } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const totalLossR = sumLossR(list);
    const out = [];
    for (const [aKey, bKey] of pairs) {
        const A = DIMENSION_BY_KEY[aKey];
        const B = DIMENSION_BY_KEY[bKey];
        if (!A || !B) continue;
        if (!dimensionAvailable(A, list) || !dimensionAvailable(B, list)) continue;
        const { cells } = aggregateFailures(list, { dimA: A, dimB: B, sampleFloor: minSample, requireKnown: true });
        for (const c of cells) {
            if (!c.rankable) continue;
            out.push({
                pairLabel: `${A.label} × ${B.label}`,
                valueLabel: `${c.keyA} · ${c.keyB}`,
                count: c.count, lossR: c.lossR, contributionPct: c.contributionPct, lift: c.lift,
            });
        }
    }
    out.sort((a, b) => b.lossR - a.lossR);
    return { totalLossR: round1(totalLossR), minSample, pairs: out.slice(0, topN) };
}

// ── Failure Explorer (V4 Phase 2) ──────────────────────────────────────────────
// A *controlled* surface over the shared engine: pick 1–2 dimensions + a ranking
// metric + a sample floor. This is NOT a new aggregator — it's a thin config of
// aggregateFailures, capped at two dimensions (no N-way / waterfall mining).
//
// Run over a winners-INCLUSIVE population (all trades) so trade-share, loss-rate
// and lift are genuine ("New York is 20% of trades but 40% of loss-R → lift 2.0×").
// Only dimensions that the run actually carries are offered (availableDimensions),
// so the controls never present an all-Unknown column. Requested dimension keys
// fall back to the first available one rather than rendering an empty table.

// Rank modes — default Lift (we want "disproportionately damaging", not "frequent").
export const EXPLORER_METRICS = [
    { key: "lift",         label: "Lift" },
    { key: "lossR",        label: "Loss-R" },
    { key: "lossRate",     label: "Loss rate" },
    { key: "contribution", label: "Contribution" },
    { key: "count",        label: "Trade count" },
];
export const EXPLORER_FLOORS = [4, 8, 12, 20];

// PHASE E — a cohort is a "real driver" worth surfacing only when the sample floor
// is met AND its lift clears this threshold. Used to highlight rows without
// promoting noise. Pure + testable.
export const EXPLORER_LIFT_HIGHLIGHT = 1.5;
export function isHighlightCell(cell, threshold = EXPLORER_LIFT_HIGHLIGHT) {
    return !!cell && cell.rankable === true && (cell.lift ?? 0) >= threshold;
}

export function buildExplorer(trades, { dimA = "session", dimB = null, sampleFloor = DRILL_SAMPLE_FLOOR, metric = "lift" } = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const available = availableDimensions(list);
    const availKeys = new Set(available.map((d) => d.key));

    // Resolve A (fallback to first available), then B (≠ A, available, optional).
    const aKey = availKeys.has(dimA) ? dimA : (available[0]?.key ?? null);
    const bKey = dimB && dimB !== aKey && availKeys.has(dimB) ? dimB : null;

    const emptyTotals = { trades: list.length, lossR: 0, baselineLossRate: 0 };
    if (!aKey) {
        return { available, dimA: null, dimB: null, metric, sampleFloor, rows: [], totals: emptyTotals };
    }

    const { cells, totals } = aggregateFailures(list, {
        dimA: aKey, dimB: bKey, sampleFloor, baseline: list, requireKnown: true,
    });

    const metricVal = (c) => (
        metric === "lossR" ? c.lossR
        : metric === "lossRate" ? c.lossRate
        : metric === "contribution" ? c.contributionPct
        : metric === "count" ? c.count
        : metric === "tradeShare" ? c.tradeSharePct // back-compat
        : c.lift
    );
    // Keep low-sample cells last (never a "strong finding"), then rank by metric,
    // tie-break by raw loss-R.
    const rows = [...cells].sort((x, y) =>
        (Number(y.rankable) - Number(x.rankable)) ||
        (metricVal(y) - metricVal(x)) ||
        (y.lossR - x.lossR),
    );

    return { available, dimA: aKey, dimB: bKey, metric, sampleFloor, rows, totals };
}

// ── Bucket Explorer rows with TRUE denominators (cohort-context fix) ────────────
// When an MFE bucket is selected, the Explorer must answer two things per row:
//   (1) how much of the SELECTED BUCKET's damage came from this dimension value/pair
//       — computed from `bucketLosers` only (losers inside the bucket); and
//   (2) the FULL-COHORT context for that same value/pair — winners + losers + loss
//       rate vs baseline — computed from `allTrades`.
// MFE buckets are a loser-only concept, so winners can NEVER live in a bucket; we
// recover the real denominator by MATCHING `allTrades` on the same dimension key(s)
// (e.g. Session=New York AND Structure=CHoCH) rather than pretending winners belong
// to the bucket. This does NOT touch MFE bucket logic — `bucketLosers` is produced
// upstream (losersInRawBucket); we only read it.
//
// Rows are the value/pair combinations that actually contributed losses to the
// bucket ("what caused THIS bucket"), each enriched with its full denominator.
export function buildBucketExplorerRows({ bucketLosers, allTrades, dimA, dimB = null, sampleFloor = DRILL_SAMPLE_FLOOR } = {}) {
    const bl = Array.isArray(bucketLosers) ? bucketLosers : [];
    const at = Array.isArray(allTrades) ? allTrades : [];

    // Availability + dim resolution judged over the winners-inclusive population.
    const available = availableDimensions(at.length ? at : bl);
    const availKeys = new Set(available.map((d) => d.key));
    const reqA = resolveDimension(dimA);
    const reqB = dimB != null ? resolveDimension(dimB) : null;
    const aKey = reqA && availKeys.has(reqA.key) ? reqA.key : (available[0]?.key ?? null);
    const bKey = reqB && reqB.key !== aKey && availKeys.has(reqB.key) ? reqB.key : null;
    const dA = resolveDimension(aKey);
    const dB = bKey ? resolveDimension(bKey) : null;

    // Baseline loss rate over ALL trades (the genuine denominator).
    const baseLosers = at.filter((t) => rOf(t) < 0).length;
    const baselineLossRate = at.length ? (baseLosers / at.length) * 100 : 0;
    const totalAll = at.length;
    const allLossR = at.reduce((s, t) => s + lossRof(t), 0);

    const totals = {
        bucketTrades: bl.length,
        bucketLossR: round1(sumLossR(bl)),
        allTrades: totalAll,
        baselineLossRate: round1(baselineLossRate),
    };
    if (!dA) return { available, dimA: null, dimB: null, sampleFloor, rows: [], totals };

    const SEP = "\u0000";
    const idOf = (t, dim2) => {
        const va = dA.accessor(t);
        if (va == null) return null;
        if (dim2) { const vb = dim2.accessor(t); if (vb == null) return null; return `${String(va)}${SEP}${String(vb)}`; }
        return String(va);
    };

    // Bucket-side groups (losers inside the selected bucket).
    const bucketTotalLossR = sumLossR(bl);
    const bucketGroups = new Map(); // id → { keyA, keyB, losers, lossR }
    for (const t of bl) {
        const id = idOf(t, dB);
        if (id == null) continue;
        const [keyA, keyB] = dB ? id.split(SEP) : [id, null];
        let g = bucketGroups.get(id);
        if (!g) { g = { keyA, keyB, losers: 0, lossR: 0 }; bucketGroups.set(id, g); }
        g.losers += 1;
        g.lossR += lossRof(t);
    }

    // Full-cohort groups (ALL trades matching the same key) — single pass.
    const fullGroups = new Map(); // id → { total, losers, lossR }
    for (const t of at) {
        const id = idOf(t, dB);
        if (id == null) continue;
        let g = fullGroups.get(id);
        if (!g) { g = { total: 0, losers: 0, lossR: 0 }; fullGroups.set(id, g); }
        g.total += 1;
        const r = rOf(t);
        if (r < 0) { g.losers += 1; g.lossR += -r; }
    }

    const rows = [...bucketGroups.values()].map((g) => {
        const id = dB ? `${g.keyA}${SEP}${g.keyB}` : g.keyA;
        const full = fullGroups.get(id) || { total: 0, losers: 0, lossR: 0 };
        const fullWinners = full.total - full.losers;
        const fullLossRate = full.total ? (full.losers / full.total) * 100 : 0;
        const lossRateDelta = fullLossRate - baselineLossRate;
        const tradeSharePct = totalAll ? (full.total / totalAll) * 100 : 0;
        const lossSharePct = allLossR > 0 ? (full.lossR / allLossR) * 100 : 0;
        const lift = tradeSharePct > 0 ? lossSharePct / tradeSharePct : 0;
        const lowSample = full.total < sampleFloor;
        const bucketContributionPct = bucketTotalLossR > 0 ? round1((g.lossR / bucketTotalLossR) * 100) : 0;
        const row = {
            keyA: g.keyA, labelA: dA.label,
            // ── selected-bucket metrics (losses inside the bucket only) ──
            bucketLosers: g.losers,
            bucketLossR: round1(g.lossR),
            bucketLossRSharePct: bucketContributionPct,
            bucketContributionPct, // alias
            // ── full-cohort denominator (ALL trades matching the same key) ──
            fullLosers: full.losers,
            fullWinners,
            fullTotal: full.total,
            fullLossRate: round1(fullLossRate),
            baselineLossRate: round1(baselineLossRate),
            lossRateDelta: round1(lossRateDelta),
            tradeSharePct: round1(tradeSharePct),
            lossSharePct: round1(lossSharePct),
            lift: round2(lift),
            lowSample,
            rankable: !lowSample,
        };
        if (dB) { row.keyB = g.keyB; row.labelB = dB.label; }
        return row;
    });

    // "What caused THIS bucket": rank by bucket damage (rankable-first by full sample).
    rows.sort((a, b) => (Number(b.rankable) - Number(a.rankable)) || (b.bucketLossR - a.bucketLossR));

    return { available, dimA: aKey, dimB: bKey, sampleFloor, rows, totals };
}

// ── MFE-by-dimension outcome (V4 Phase 2) ──────────────────────────────────────
// "Which <structures | sessions> tend to move far before failing?" For each value
// of a dimension, the shared engine supplies count / loss-R / contribution / lift,
// and we enrich with MFE-specific stats (avg MFE, % of that value's losers reaching
// each arm level). MFE-only realized-loss framing — NO break-even claim, no winner
// cost. Ranked by contribution (loss-R) first. Reused for Structure×MFE & Session×MFE
// (and any future dimension) — it is NOT a second aggregator: aggregateFailures does
// the grouping; this only attaches per-group MFE reach percentages.
export const MFE_DIM_REACH_LEVELS = [0.5, 1, 1.5, 2];

export function buildMfeByDimension(losers, dimKey, { sampleFloor = DRILL_SAMPLE_FLOOR, reachLevels = MFE_DIM_REACH_LEVELS } = {}) {
    const dim = resolveDimension(dimKey);
    const list = (Array.isArray(losers) ? losers : []).filter((t) => getMfeR(t) != null);
    const lvls = Array.isArray(reachLevels) && reachLevels.length ? reachLevels : MFE_DIM_REACH_LEVELS;
    if (!dim || !list.length || !dimensionAvailable(dim, list)) {
        return { dimKey: dim?.key ?? null, dimLabel: dim?.label ?? null, reachLevels: lvls, rows: [], available: false, eligible: list.length, totalLossR: 0, avgMfe: null };
    }

    const totalLossR = sumLossR(list);
    const overallAvgMfe = round2(list.reduce((s, t) => s + getMfeR(t), 0) / list.length);

    // value → member losers (single pass)
    const membersByValue = new Map();
    for (const t of list) {
        const v = dim.accessor(t);
        if (v == null) continue;
        const k = String(v);
        if (!membersByValue.has(k)) membersByValue.set(k, []);
        membersByValue.get(k).push(t);
    }

    const { cells } = aggregateFailures(list, { dimA: dim, sampleFloor, requireKnown: true });
    const rows = cells.map((c) => {
        const members = membersByValue.get(c.keyA) || [];
        const mfes = members.map((t) => getMfeR(t)).filter((m) => isFiniteNumber(m));
        const avgMfe = mfes.length ? round2(mfes.reduce((s, m) => s + m, 0) / mfes.length) : null;
        const reach = {};
        for (const L of lvls) reach[L] = mfes.length ? round1((mfes.filter((m) => m >= L).length / mfes.length) * 100) : 0;
        return {
            value: c.keyA, count: c.count, lossR: c.lossR,
            contributionPct: c.contributionPct, lift: c.lift,
            avgMfe, reach, lowSample: c.lowSample, rankable: c.rankable,
        };
    });
    rows.sort((a, b) => b.lossR - a.lossR); // contribution-first
    return { dimKey: dim.key, dimLabel: dim.label, reachLevels: lvls, rows, available: true, eligible: list.length, totalLossR: round1(totalLossR), avgMfe: overallAvgMfe };
}

// ── Distance-to-Stop insight synthesis (V4 Phase 2 — Command Center) ────────────
// Pure, data-driven findings. Every statement is filled from computed metrics —
// no hardcoded findings, no AI, no speculative language. Priority mirrors research
// value: contribution > over-representation (lift) > unusually-large MFE. Returns
// 0..maxInsights; we never fabricate to hit a minimum. MFE-only / realized losses.
// Priority mirrors actionability: a disproportionately-damaging cohort (high lift)
// or one that loses far more often than baseline (high loss-rate delta) outranks raw
// contribution — "large because genuinely problematic", not "large because frequent".
const INSIGHT_TIER = { cohort_lift: 130, cohort_delta: 120, contribution: 100, bucket_driver: 95, reach: 85, lift: 70, overrep: 55, mfe: 40 };
// Thresholds for cohort context insights (need a winners-inclusive `allTrades`).
const COHORT_INSIGHT_LIFT = 1.5;      // ≥ this lift = disproportionate damage
const COHORT_INSIGHT_DELTA = 10;      // ≥ this many pts above baseline loss rate
const COHORT_INSIGHT_DIMS = ["session", "structure", "direction", "archetype"];

export function buildDistanceInsights(losers, { config = {}, activeBucketKey = null, allTrades = null, maxInsights = 6 } = {}) {
    const list = (Array.isArray(losers) ? losers : []).filter((t) => getMfeR(t) != null);
    if (!list.length) return { insights: [], eligible: 0 };

    const out = [];
    const push = (kind, text, weight) => out.push({ kind, tier: INSIGHT_TIER[kind] ?? 0, weight: Number(weight) || 0, text });

    // ── Cohort context (needs winners) — the highest-value findings ──────────────
    // Over a winners-inclusive population, surface the cohort that is disproportionately
    // damaging (lift) and the one that loses far more often than baseline (delta).
    let cohortLiftShown = false;
    const pop = Array.isArray(allTrades) ? allTrades.filter((t) => getMfeR(t) != null) : [];
    if (pop.length) {
        const cohortCells = [];
        for (const dk of COHORT_INSIGHT_DIMS) {
            const dim = resolveDimension(dk);
            if (!dim || !dimensionAvailable(dim, pop)) continue;
            const { cells } = aggregateFailures(pop, { dimA: dim, sampleFloor: DRILL_SAMPLE_FLOOR, requireKnown: true });
            for (const c of cells) if (c.rankable) cohortCells.push(c);
        }
        const byLift = [...cohortCells].filter((c) => c.lift >= COHORT_INSIGHT_LIFT).sort((a, b) => b.lift - a.lift)[0];
        if (byLift) {
            push("cohort_lift", `${byLift.keyA} contributes ${byLift.contributionPct}% of loss-R from only ${byLift.tradeSharePct}% of trades (${byLift.lift}× lift).`, byLift.lift);
            cohortLiftShown = true;
        }
        const byDelta = [...cohortCells].filter((c) => c.lossRateDelta >= COHORT_INSIGHT_DELTA).sort((a, b) => b.lossRateDelta - a.lossRateDelta)[0];
        if (byDelta && byDelta.keyA !== byLift?.keyA) {
            push("cohort_delta", `${byDelta.keyA} loses ${byDelta.lossRate}% of the time vs ${byDelta.baselineLossRate}% baseline (+${byDelta.lossRateDelta} pts).`, byDelta.lossRateDelta);
        }
    }

    const dist = buildRawRDistribution(list);
    const reach = buildLoserMfeReachTable(list);
    const drivers = buildFailureDrivers(list, { minSample: DRILL_SAMPLE_FLOOR, topN: 20 });
    const struct = buildMfeByDimension(list, "structure");

    // 1. contribution — the bucket carrying the most loss-R
    const topBucket = [...dist.buckets].filter((b) => b.count > 0).sort((a, b) => b.contributionPct - a.contributionPct)[0];
    if (topBucket && topBucket.contributionPct > 0) {
        const phrase = topBucket.key === "never" ? "never moved in favour"
            : topBucket.key === "lt025" ? "moved less than +0.25R"
            : `reached ${topBucket.label}`;
        push("contribution", `${topBucket.contributionPct}% of loss-R comes from losers that ${phrase} before failing.`, topBucket.contributionPct);
    }

    // 2. reach — how many losers got into profit at all / to +1R
    const r025 = reach.rows.find((r) => r.levelR === 0.25);
    if (r025 && r025.reachedPct > 0) push("reach", `${r025.reachedPct}% of losers reached at least +0.25R before failing.`, r025.reachedPct);
    const r1 = reach.rows.find((r) => r.levelR === 1);
    if (r1 && r1.reachedCount >= SAMPLE_FLOOR && r1.reachedPct > 0) push("reach", `${r1.reachedPct}% of losers reached at least +1R before failing.`, r1.reachedPct * 0.9);

    // 3. bucket_driver — within the selected bucket, the top structure / session
    if (activeBucketKey) {
        const bdef = MFE_RAW_BUCKETS.find((b) => b.key === activeBucketKey);
        const drill = buildBucketDrilldown(list, activeBucketKey);
        for (const secKey of ["structure", "session"]) {
            const top = drill.sections.find((s) => s.key === secKey)?.rows?.[0];
            if (bdef && top && top.contributionPct > 0) {
                push("bucket_driver", `${top.value} contributes ${top.contributionPct}% of loss-R inside the ${bdef.label} bucket.`, top.contributionPct);
            }
        }
    }

    // 4. lift — most over-represented single factor (losers-only fallback; skipped
    //    when the winners-inclusive cohort-lift insight above already covers this).
    if (!cohortLiftShown) {
        const topLift = [...drivers.drivers].filter((d) => d.lift >= 1.15).sort((a, b) => b.lift - a.lift)[0];
        if (topLift) push("lift", `${topLift.value} carries ${topLift.lift}× its share of losses — disproportionate damage.`, (topLift.lift - 1) * 100);
    }

    // 5. overrep — structure reach gap at +1R (e.g. BOS vs CHoCH)
    if (struct.available && struct.rows.length >= 2) {
        const ranked = struct.rows.filter((r) => !r.lowSample);
        if (ranked.length >= 2) {
            const byReach1 = [...ranked].sort((a, b) => (b.reach[1] ?? 0) - (a.reach[1] ?? 0));
            const hi = byReach1[0], lo = byReach1[byReach1.length - 1];
            if (hi && lo && hi.value !== lo.value && (lo.reach[1] ?? 0) > 0) {
                const ratio = round1((hi.reach[1] ?? 0) / (lo.reach[1] ?? 0));
                if (ratio >= 1.3) push("overrep", `${hi.value} losers reach +1R ${ratio}× as often as ${lo.value} losers.`, ratio);
            }
        }
    }

    // 6. mfe — the value whose losers travel unusually far
    if (struct.available && struct.avgMfe != null) {
        const cand = struct.rows
            .filter((r) => !r.lowSample && r.avgMfe != null && r.avgMfe >= struct.avgMfe * 1.3)
            .sort((a, b) => b.avgMfe - a.avgMfe)[0];
        if (cand) push("mfe", `${cand.value} losers travel furthest before failing — avg +${cand.avgMfe}R vs +${struct.avgMfe}R overall.`, cand.avgMfe);
    }

    out.sort((a, b) => (b.tier - a.tier) || (b.weight - a.weight));
    const insights = out.slice(0, Math.max(0, maxInsights)).map((x, i) => ({ id: `${x.kind}-${i}`, ...x }));
    return { insights, eligible: list.length };
}

// ══════════════════════════════════════════════════════════════════════════════
// V2 Phase 2 — Winner MAE / stop-pressure distribution
// "How close did WINNING trades come to the stop before succeeding?" Bucketed by worst
// adverse excursion (maeR ≤ 0; -1R = the full stop distance). Describes realized winners
// — it does NOT prove a tighter stop would still have won (winners that dipped deep would
// likely have been stopped under a tighter stop; only a replay can confirm). Source array
// is never mutated.
// ══════════════════════════════════════════════════════════════════════════════

export const MAE_BUCKETS = [
    { key: "0_025",  label: "0 to -0.25R",    flag: null },
    { key: "025_05", label: "-0.25 to -0.5R", flag: null },
    { key: "05_075", label: "-0.5 to -0.75R", flag: null },
    { key: "075_1",  label: "-0.75 to -1R",   flag: "near_stop" },
    { key: "le_1",   label: "≤ -1R",          flag: "anomaly" },
];

// maeR (≤ 0) → exactly one MAE_BUCKETS key by depth toward the stop d = |maeR|. Lower
// (deeper) edge inclusive: exactly -0.25R lands in -0.25→-0.5R; exactly -1R lands in
// ≤ -1R. Positive noise clamps to depth 0 (shallowest band). null when MAE absent.
export function bucketMaeDepth(maeR) {
    if (!isFiniteNumber(maeR)) return null;
    const d = Math.max(0, -Number(maeR));
    if (d < 0.25) return "0_025";
    if (d < 0.5)  return "025_05";
    if (d < 0.75) return "05_075";
    if (d < 1)    return "075_1";
    return "le_1";
}

export function buildWinnerMaeDistribution(winners) {
    const list = Array.isArray(winners) ? winners : [];
    const total = list.length;
    // Resolve each winner's stop-pressure MAE: prefer to-original-exit, fall back to the
    // stop-anchored mae_r (legacy export). Trades carrying neither are excluded.
    const resolved = list
        .map((t) => ({ t, res: getMaeForStopPressure(t) }))
        .filter((x) => x.res.value != null);
    const eligible = resolved.length;
    const fallbackCount = resolved.filter((x) => x.res.source === "stop_anchored_fallback").length;
    const totalWinR = resolved.reduce((s, x) => s + (rOf(x.t) || 0), 0);

    const counts = Object.fromEntries(MAE_BUCKETS.map((b) => [b.key, { count: 0, winR: 0 }]));
    for (const { t, res } of resolved) {
        const k = bucketMaeDepth(res.value);
        if (k == null) continue;
        counts[k].count += 1;
        counts[k].winR += (rOf(t) || 0);
    }

    const rows = MAE_BUCKETS.map((b) => {
        const c = counts[b.key];
        return {
            key: b.key,
            label: b.label,
            flag: b.flag ?? null,
            count: c.count,
            pctOfWinners: eligible ? round1((c.count / eligible) * 100) : 0,
            winR: round1(c.winR),
            avgWinR: c.count ? round2(c.winR / c.count) : 0,
            lowSample: c.count > 0 && c.count < SAMPLE_FLOOR,
        };
    });

    // Source provenance for the UI: all to-exit / all legacy / mixed.
    const allFallback = eligible > 0 && fallbackCount === eligible;
    const source = eligible === 0
        ? null
        : fallbackCount === 0 ? "to_original_exit"
        : allFallback ? "stop_anchored_fallback"
        : "mixed";
    const warning = fallbackCount === 0
        ? null
        : allFallback
            ? "This run uses legacy stop-anchored MAE. Re-export with mae_r_to_original_exit for accurate stop-pressure research."
            : "Some trades use legacy stop-anchored MAE because mae_r_to_original_exit is missing.";

    return {
        rows,
        eligible,
        coverage: { total, eligible, pct: total ? round1((eligible / total) * 100) : 0 },
        totalWinR: round1(totalWinR),
        sampleFloor: SAMPLE_FLOOR,
        // headline counts: winners that nearly failed (≤ -0.75R) and the ≤ -1R anomalies.
        nearStopCount: counts["075_1"].count + counts["le_1"].count,
        anomalyCount: counts["le_1"].count,
        // source provenance (Phase 2B).
        fallbackCount,
        fallbackPct: eligible ? round1((fallbackCount / eligible) * 100) : 0,
        source,
        sourceLabel: source === "to_original_exit" ? "To original exit"
            : source === "stop_anchored_fallback" ? "Stop-anchored (legacy)"
            : source === "mixed" ? "Mixed (some legacy)"
            : null,
        warning,
    };
}
