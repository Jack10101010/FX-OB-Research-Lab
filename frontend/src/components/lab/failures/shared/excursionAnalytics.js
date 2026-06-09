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
import { FAILURE_DIMENSIONS, DIMENSION_BY_KEY, dimensionAvailable, availableDimensions } from "./failuresDimensions";

const numOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const round1 = (v) => Number(Number(v).toFixed(1));

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
        return {
            key: b.key, label: b.label, flag: b.flag ?? null,
            count: c.count,
            lossPct: withMfe.length ? round1((c.count / withMfe.length) * 100) : 0,
            lossR: round1(c.lossR),
            contributionPct: totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0,
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

export const EXPLORER_METRICS = [
    { key: "lift",       label: "Lift" },
    { key: "lossR",      label: "Loss-R" },
    { key: "lossRate",   label: "Loss rate" },
    { key: "tradeShare", label: "Trade share" },
];
export const EXPLORER_FLOORS = [4, 8, 12, 20];

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
        : metric === "tradeShare" ? c.tradeSharePct
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
