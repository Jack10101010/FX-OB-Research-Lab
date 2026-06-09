// Validation for excursionAnalytics.js (Failures Lab V2 Phase 1 — Distance Before Stop).
// excursionAnalytics imports failuresUtils (extensionless / aliased), so we Babel-load
// the real source and shim the unrelated entryFormatters re-export — same harness as the
// Phase-0 field-detection validation.
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/excursionAnalytics.validate.mjs

import babel from "@babel/core";
import fs from "fs";

const BASE = "src/components/lab/failures/shared";
function loadCjs(absPath, requireShim) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    return module.exports;
}

// failuresUtils re-exports isFiniteNumber / sessionOf / WEEKDAYS from entryFormatters;
// provide faithful-enough copies in the shim. sessionOf is stubbed to "Unknown" (the
// V3 drilldown tests exercise the local direction/structure accessors, which are real).
const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: () => "Unknown",
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [],
    dayIndex: () => null,
};
const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
// failuresRegistry (for archetypeLabel) re-exports sampleConfidence from entryRegistry — stub it.
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => ({ sampleConfidence: () => ({ label: "N/A", tone: "muted" }) }));
// V4: excursionAnalytics now delegates to the shared dimension registry + engine.
const dimensions = loadCjs(`${BASE}/failuresDimensions.js`, (spec) => {
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    return {};
});
const aggregation = loadCjs(`${BASE}/failuresAggregation.js`, (spec) => {
    if (spec.includes("failuresDimensions")) return dimensions;
    if (spec.includes("failuresUtils")) return utils;
    return {};
});
const exc = loadCjs(`${BASE}/excursionAnalytics.js`, (spec) => {
    if (spec.includes("failuresDimensions")) return dimensions;
    if (spec.includes("failuresAggregation")) return aggregation;
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    return {};
});
// tradeClassification is import-free — it provides the canonical valid-universe
// predicate (isPerformanceTrade) that the Explorer denominator must use.
const tc = loadCjs("src/data/tradeClassification.js", () => ({}));
const { isPerformanceTrade } = tc;

const {
    getMfeR, getTargetRR, mfePctOfTarget, bucketMfePct, bucketMfeRaw,
    buildMfeDistribution, buildBeOpportunity,
    buildBeExclusiveRanges, bucketBeExclusive,
    buildRawRDistribution, buildBucketDrilldown, losersInRawBucket, buildFailureDrivers, buildPairDrivers,
    buildExplorer, buildBucketExplorerRows, buildLoserMfeReachTable, buildMfeByDimension, buildDistanceInsights,
    isHighlightCell, EXPLORER_LIFT_HIGHLIGHT,
    getMaeR, bucketMaeDepth, buildWinnerMaeDistribution, getMaeForStopPressure,
} = exc;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};

// 1. mfeR extraction across current keys
console.log("field extraction");
ok(getMfeR({ mfeR: 1.5 }) === 1.5, "getMfeR reads mfeR");
ok(getMfeR({ mfe_r: 0.8 }) === 0.8, "getMfeR reads mfe_r");
ok(getMfeR({ mfe: 0.3 }) === 0.3, "getMfeR reads legacy mfe");
ok(getMfeR({}) === null, "getMfeR null when absent");

// 2 & 3. target RR precedence + fallback
console.log("target RR");
ok(getTargetRR({ rr_config: 3 }, { rr_multiple: 2 }) === 3, "per-trade rr_config preferred over run");
ok(getTargetRR({}, { rr_multiple: 2 }) === 2, "run rr_multiple fallback");
ok(getTargetRR({}, { risk_reward: 1.5 }) === 1.5, "run risk_reward fallback");
ok(getTargetRR({}, {}) === null, "null when no target available");

// 4. bucket edges + 6. clamp
console.log("buckets + clamp");
ok(mfePctOfTarget(1, 2) === 50, "mfeR 1 of RR 2 → 50%");
ok(mfePctOfTarget(5, 2) === 100, "clamp to 100% when mfeR ≥ target");
ok(mfePctOfTarget(-1, 2) === 0, "clamp to 0% on negative");
ok(mfePctOfTarget(1, 0) === null, "null when targetRR ≤ 0");
ok(bucketMfePct(5) === "lt10", "pct 5 → <10%");
ok(bucketMfePct(10) === "10_25", "pct 10 → 10–25% (lower edge inclusive)");
ok(bucketMfePct(50) === "50_75", "pct 50 → 50–75%");
ok(bucketMfePct(90) === "90plus", "pct 90 → 90%+");
ok(bucketMfeRaw(0.3) === "025_05", "raw 0.3R → 0.25–0.5R");
ok(bucketMfeRaw(1.2) === "1_2", "raw 1.2R → 1–2R (V3 6-band)");
ok(bucketMfeRaw(2.5) === "2plus", "raw 2.5R → 2R+");
ok(bucketMfeRaw(0.0) === "never", "raw 0R → never moved");

// Distribution (pct mode). RR=2 so % = mfeR/2*100.
console.log("buildMfeDistribution (pct mode)");
const cfg = { rr_multiple: 2 };
const losers = [
    { r: -1, mfeR: 0.0 },   // never (0%)
    { r: -1, mfeR: 0.1 },   // 5%   → <10%
    { r: -2, mfeR: 0.4 },   // 20%  → 10–25%
    { r: -1, mfeR: 1.0 },   // 50%  → 50–75%
    { r: -1, mfeR: 1.9 },   // 95%  → 90%+ (almost)
];
const dist = buildMfeDistribution(losers, { config: cfg });
const bk = (k) => dist.buckets.find((b) => b.key === k);
ok(dist.mode === "pct", "mode is pct when target RR available");
ok(bk("never").count === 1, "5. never-moved detected (1)");
ok(bk("lt10").count === 1, "<10% bucket count 1");
ok(bk("90plus").count === 1 && bk("90plus").flag === "almost", "90%+ flagged 'almost'");
ok(dist.coverage.withMfe === 5 && dist.coverage.pct === 100, "coverage 5/5 = 100%");
ok(dist.upperBound === true, "8. distribution carries upperBound metadata");
// contribution % uses loss-R (the -2R trade weighs more than a -1R)
ok(bk("10_25").lossR === 2, "10–25% bucket loss-R = 2 (the -2R loser)");

// 7 & 8. BE opportunity counts + upper-bound label
console.log("buildBeOpportunity");
const be = buildBeOpportunity(losers, [25, 50, 75, 90], { config: cfg });
const lvl = (L) => be.rows.find((r) => r.level === L);
ok(be.mode === "pct", "BE mode pct");
ok(lvl(25).reached === 2, "≥25% of TP reached by 2 losers (50% and 95%)");
ok(lvl(50).reached === 2, "≥50% reached by 2");
ok(lvl(90).reached === 1, "≥90% reached by 1");
ok("savableLossRUpperBound" in lvl(50) && be.upperBound === true, "8. savable R explicitly upper-bound");
ok(lvl(25).savableLossRUpperBound === 2, "≥25% savable upper-bound loss-R = 1+1 = 2");

// 9. graceful degrade (no MFE)
console.log("graceful degrade");
const distNone = buildMfeDistribution([{ r: -1 }, { r: -2 }], { config: cfg });
ok(distNone.mode === "none" && distNone.buckets.length === 0, "no MFE → mode none, empty buckets");
ok(distNone.coverage.withMfe === 0, "coverage withMfe 0 when no excursion data");
ok(buildBeOpportunity([{ r: -1 }], null, { config: cfg }).rows.length === 0, "BE rows empty without MFE");

// 10. raw-R fallback when no target RR
console.log("raw-R fallback (no target RR)");
const rawLosers = [
    { r: -1, mfeR: 0.0 },   // never
    { r: -1, mfeR: 0.3 },   // 0.25–0.5R
    { r: -1, mfeR: 0.7 },   // 0.5–1R
    { r: -1, mfeR: 1.5 },   // ≥1R
];
const distRaw = buildMfeDistribution(rawLosers, { config: {} });
ok(distRaw.mode === "raw", "mode raw when no target RR");
ok(distRaw.buckets.find((b) => b.key === "025_05").count === 1, "raw 0.25–0.5R count 1");
const beRaw = buildBeOpportunity(rawLosers, null, { config: {} });
ok(beRaw.mode === "raw" && beRaw.rows.some((r) => r.label === "+0.5R"), "raw BE levels expressed in R");

// ── V3: raw-R primary distribution + drilldown / drivers / pairs ───────────────
// Trades use local accessors (direction / structureTag) so the shimmed session
// dimension stays "Unknown" (and auto-hides), proving the auto-hide path too.
const mk = (r, mfeR, direction, structureTag) => ({ r, mfeR, direction, structureTag });
const v3 = [
    mk(-1, 0.0,  "long",  "choch"),  // never
    mk(-1, 0.1,  "short", "bos"),    // <0.25R
    mk(-2, 0.3,  "long",  "choch"),  // 0.25–0.5R
    mk(-1, 0.7,  "long",  "choch"),  // 0.5–1R
    mk(-3, 0.8,  "short", "choch"),  // 0.5–1R  (big damage)
    mk(-1, 1.5,  "long",  "bos"),    // 1–2R   (almost)
    mk(-2, 2.4,  "short", "bos"),    // 2R+    (almost)
];

console.log("V3 buildRawRDistribution");
const rd = rd0 => rd0; // noop
const rawDist = buildRawRDistribution(v3);
const rb = (k) => rawDist.buckets.find((b) => b.key === k);
ok(rawDist.mode === "raw", "raw distribution mode is raw");
ok(rb("never").count === 1, "never bucket count 1");
ok(rb("05_1").count === 2 && rb("05_1").lossR === 4, "0.5–1R: 2 trades, 4R loss (1+3)");
ok(rb("1_2").flag === "almost" && rb("2plus").flag === "almost", "1–2R and 2R+ flagged almost");
ok(rb("never").flag === "instant" && rb("lt025").flag === "instant", "never and <0.25R flagged instant");
// contribution sums to ~100 across buckets
const contribSum = rawDist.buckets.reduce((s, b) => s + b.contributionPct, 0);
ok(Math.abs(contribSum - 100) <= 0.5, `bucket contribution % sums to ~100 (got ${contribSum})`);
ok(rawDist.coverage.withMfe === 7, "coverage withMfe 7");

console.log("V3 buildBucketDrilldown");
const drill = buildBucketDrilldown(v3, "05_1");
ok(drill.trades === 2 && drill.lossR === 4, "0.5–1R drilldown: 2 trades, 4R");
const dimKeys = drill.sections.map((s) => s.key);
ok(dimKeys.includes("direction") && dimKeys.includes("structure"), "drilldown surfaces direction + structure sections");
ok(!dimKeys.includes("session"), "session auto-hidden (all Unknown via stub)");
const dirSec = drill.sections.find((s) => s.key === "direction");
ok(dirSec.rows[0].value === "Short" && dirSec.rows[0].lossR === 3, "direction ranked by damage: Short (3R) first");

console.log("V3 buildFailureDrivers (ranked by loss-R, sample floor)");
const drv = buildFailureDrivers(v3, { minSample: 1, topN: 10 });
ok(drv.drivers.length > 0, "drivers produced");
ok(drv.drivers.every((d, i, a) => i === 0 || a[i - 1].lossR >= d.lossR), "drivers sorted by loss-R desc");
const choch = drv.drivers.find((d) => d.dimKey === "structure" && d.value === "CHoCH");
ok(choch && choch.count === 4 && choch.lossR === 7, "CHoCH driver: 4 trades, 7R loss");
const drvFloor = buildFailureDrivers(v3, { minSample: 5, topN: 10 });
ok(drvFloor.drivers.every((d) => d.count >= 5), "sample floor excludes cells below minSample");

console.log("V3 buildPairDrivers (curated, sample floor)");
const pd = buildPairDrivers(v3, { minSample: 1, topN: 10 });
ok(pd.pairs.length > 0, "pair drivers produced");
ok(pd.pairs.some((p) => p.pairLabel === "Structure × Direction"), "includes Structure × Direction curated pair");
ok(pd.pairs.every((p, i, a) => i === 0 || a[i - 1].lossR >= p.lossR), "pairs sorted by loss-R desc");
const pdFloor = buildPairDrivers(v3, { minSample: 4, topN: 10 });
ok(pdFloor.pairs.every((p) => p.count >= 4), "pair sample floor enforced");

// ── V4 Phase 2: forced raw-R BE table ──────────────────────────────────────────
// Same `losers` (mfeR 0.0, 0.1, 0.4, 1.0, 1.9; RR=2 ⇒ pct-eligible). With mode:"raw"
// forced, the BE table must speak R, not % of TP, and stay an upper bound.
console.log("V4 buildBeOpportunity (forced raw mode)");
const beRawForced = buildBeOpportunity(losers, [0.25, 0.5, 0.75, 1, 1.5, 2], { config: cfg, mode: "raw" });
const rlvl = (L) => beRawForced.rows.find((r) => r.level === L);
ok(beRawForced.mode === "raw", "mode forced to raw even though target RR is available");
ok(rlvl(0.25).label === "+0.25R", "raw labels expressed in R, not % of TP");
ok(rlvl(0.25).reached === 3, "≥0.25R reached by 3 (0.4, 1.0, 1.9)");
ok(rlvl(1).reached === 2, "≥1R reached by 2 (1.0, 1.9)");
ok(rlvl(2).reached === 0, "≥2R reached by 0 (no loser hit 2R)");
ok(rlvl(0.25).savableLossRUpperBound === 4, "≥0.25R savable upper-bound loss-R = 2+1+1 = 4");
ok(beRawForced.upperBound === true, "forced-raw BE still flagged upper bound");
ok(buildBeOpportunity([{ r: -1 }], [0.25], { config: cfg, mode: "raw" }).mode === "none", "no MFE → none wins over forced raw");
// cumulative stays cumulative: reached counts never increase as the level rises.
ok(beRawForced.rows.every((r, i, a) => i === 0 || a[i - 1].reached >= r.reached), "cumulative reached is non-increasing by level (stays cumulative)");

// ── V4: BE exclusive ranges (companion view to the cumulative table) ────────────
// Same `losers` (mfeR 0.0, 0.1, 0.4, 1.0, 1.9; loss-R 1,1,2,1,1 ⇒ total 6).
console.log("V4 buildBeExclusiveRanges (mutually exclusive + exhaustive)");
const exr = buildBeExclusiveRanges(losers, { config: cfg });
const band = (k) => exr.rows.find((r) => r.key === k);
ok(exr.mode === "raw" && exr.upperBound === true, "exclusive ranges still flagged upper bound");
ok(exr.rows.length === 7, "7 exclusive bands (never … 2R+)");
ok(exr.consideredN === 5, "considers all 5 MFE losers");
// EXHAUSTIVE + MUTUALLY EXCLUSIVE: every MFE loser lands in exactly one band.
const sumTrades = exr.rows.reduce((s, r) => s + r.trades, 0);
ok(sumTrades === exr.consideredN, `band trades sum to consideredN (${sumTrades} === ${exr.consideredN})`);
ok(band("never").trades === 1, "never: mfeR 0.0 (1)");
ok(band("0_025").trades === 1, "0–0.25R: mfeR 0.1 (1)");
ok(band("025_05").trades === 1 && band("025_05").lossR === 2, "0.25–0.5R: mfeR 0.4 → the -2R loser");
ok(band("05_1").trades === 0, "0.5–1R: empty (no loser in [0.5,1))");
ok(band("1_15").trades === 1, "1–1.5R: mfeR 1.0");
ok(band("15_2").trades === 1, "1.5–2R: mfeR 1.9");
ok(band("2plus").trades === 0, "2R+: empty (no loser ≥ 2R)");
const exrContrib = exr.rows.reduce((s, r) => s + r.contributionPct, 0);
ok(Math.abs(exrContrib - 100) <= 0.5, `exclusive contribution % sums to ~100 (got ${exrContrib})`);

console.log("V4 bucketBeExclusive boundary handling (lower edge inclusive)");
ok(bucketBeExclusive(0) === "never", "0R → never");
ok(bucketBeExclusive(0.02) === "never", "EPS_R (0.02) → never (≤ EPS inclusive)");
ok(bucketBeExclusive(0.0201) === "0_025", "just above EPS_R → 0–0.25R");
ok(bucketBeExclusive(0.25) === "025_05", "0.25R lower edge → 0.25–0.5R");
ok(bucketBeExclusive(0.5) === "05_1", "0.5R lower edge → 0.5–1R");
ok(bucketBeExclusive(1) === "1_15", "1R lower edge → 1–1.5R");
ok(bucketBeExclusive(1.5) === "15_2", "1.5R lower edge → 1.5–2R");
ok(bucketBeExclusive(2) === "2plus", "2R lower edge → 2R+");
ok(bucketBeExclusive(null) === null && bucketBeExclusive(undefined) === null, "non-finite mfeR → null (no band)");
ok(buildBeExclusiveRanges([{ r: -1 }], { config: cfg }).mode === "none", "exclusive ranges → none without MFE");

// ── V4 Phase 2: Failure Explorer (shared engine, winners-inclusive) ─────────────
// Mixed population so loss-rate / lift are real. session stays Unknown (stub) and
// must auto-hide; direction/structure are real accessors.
console.log("V4 buildExplorer (controlled, all-trades population)");
const exTrades = [
    ...Array.from({ length: 5 },  () => ({ r: -2, direction: "short", structureTag: "choch", severity: 7 })), // 5 short losers
    ...Array.from({ length: 5 },  () => ({ r: -1, direction: "long",  structureTag: "bos",   severity: 2 })), // 5 long losers
    ...Array.from({ length: 10 }, () => ({ r: 1,  direction: "long",  structureTag: "bos",   severity: 1 })), // 10 long winners
];
// 20 trades; totalLossR = 5*2 + 5*1 = 15; baseline loss rate = 10/20 = 50%.
const ex = buildExplorer(exTrades, { dimA: "direction", metric: "lift", sampleFloor: 8 });
ok(ex.dimA === "direction" && ex.dimB === null, "explorer resolves Dimension A, no B by default");
ok(ex.available.some((d) => d.key === "direction") && !ex.available.some((d) => d.key === "session"),
    "available dims include direction, exclude all-Unknown session");
const exShort = ex.rows.find((c) => c.keyA === "Short");
const exLong = ex.rows.find((c) => c.keyA === "Long");
ok(exShort.count === 5 && exShort.lossR === 10, "Short cell: 5 trades, 10 loss-R");
ok(exLong.count === 15 && Math.abs(exLong.lossRate - 33.3) <= 0.1, "Long: 15 trades, loss rate ~33.3% (winners present ⇒ real rate)");
ok(Math.abs(exShort.lift - 2.67) <= 0.05, `Short lift ~2.67 (got ${exShort.lift})`);
ok(exShort.lowSample === true && exLong.lowSample === false, "Short (n=5) low-sample at floor 8; Long (n=15) not");
ok(ex.rows[0].keyA === "Long", "rankable cell sorted above low-sample Short");
// Fallback: requesting an unavailable dim resolves to the first available one.
const exFallback = buildExplorer(exTrades, { dimA: "session", metric: "lift" });
ok(exFallback.dimA != null && exFallback.dimA !== "session", "unavailable Dimension A falls back to first available");
// Pair (cap 2 dims) + metric sort.
const exPair = buildExplorer(exTrades, { dimA: "direction", dimB: "structure", sampleFloor: 1, metric: "lossR" });
ok(exPair.dimB === "structure" && exPair.rows.every((c) => "keyB" in c), "pair explorer carries Dimension B on every row");
ok(exPair.rows.every((c, i, a) => i === 0 || a[i - 1].lossR >= c.lossR || c.lowSample), "rows ranked by chosen metric (loss-R) among rankable");

// ── V2 Phase 1: Loser MFE reach table (cumulative ≥ level, realized framing) ────
console.log("buildLoserMfeReachTable");
const reachLosers = [
    { r: -1, mfeR: 0.1 },   // reaches no level (< 0.25)
    { r: -1, mfeR: 0.3 },   // ≥0.25
    { r: -2, mfeR: 0.6 },   // ≥0.25, ≥0.5  (big damage: -2R)
    { r: -1, mfeR: 1.2 },   // ≥0.25, 0.5, 1
    { r: -1, mfeR: 2.5 },   // ≥0.25, 0.5, 1, 2
    { r: -1, mfeR: 3.4 },   // ≥0.25, 0.5, 1, 2, 3
];
const reachTbl = buildLoserMfeReachTable(reachLosers);
const rL = (L) => reachTbl.rows.find((r) => r.levelR === L);
ok(reachTbl.rows.length === 5, "reach: 5 default levels (0.25/0.5/1/2/3)");
ok(reachTbl.eligible === 6 && reachTbl.coverage.total === 6, "reach: 6 eligible MFE losers");
ok(rL(0.25).reachedCount === 5, "1. reach ≥0.25R → 5 losers");
ok(rL(0.5).reachedCount === 4, "1. reach ≥0.5R → 4");
ok(rL(1).reachedCount === 3, "1. reach ≥1R → 3");
ok(rL(2).reachedCount === 2, "1. reach ≥2R → 2");
ok(rL(3).reachedCount === 1, "1. reach ≥3R → 1");
ok(reachTbl.rows.every((r, i, a) => i === 0 || a[i - 1].reachedCount >= r.reachedCount), "reach counts non-increasing by level (cumulative)");
ok(Math.abs(rL(0.25).reachedPct - 83.3) <= 0.1, `reach ≥0.25R reachedPct ~83.3 (got ${rL(0.25).reachedPct})`);
// 4. contributionPct: reached-≥0.25 loss-R = 1+2+1+1+1 = 6 over total eligible loss-R 7.
ok(rL(0.25).lossR === 6 && rL(1).lossR === 3, "reach loss-R sums (≥0.25R=6, ≥1R=3)");
ok(Math.abs(rL(0.25).contributionPct - 85.7) <= 0.2, `4. reach ≥0.25R contributionPct ~85.7 (got ${rL(0.25).contributionPct})`);
ok(Math.abs(rL(1).contributionPct - 42.9) <= 0.2, `4. reach ≥1R contributionPct ~42.9 (got ${rL(1).contributionPct})`);
// custom levels honoured
const reachCustom = buildLoserMfeReachTable(reachLosers, [1]);
ok(reachCustom.rows.length === 1 && reachCustom.rows[0].reachedCount === 3, "reach: custom levels honoured");
// 5. cross-check — reach count matches BE raw "reached" at the same level (same definition)
const beReachCheck = buildBeOpportunity(reachLosers, [0.25, 1], { config: {}, mode: "raw" });
ok(beReachCheck.rows.find((r) => r.level === 0.25).reached === rL(0.25).reachedCount, "5. reach count matches BE raw reached at +0.25R");
ok(beReachCheck.rows.find((r) => r.level === 1).reached === rL(1).reachedCount, "5. reach count matches BE raw reached at +1R");

// 2 & 3. graceful degrade — no MFE / empty input must not crash
console.log("reach graceful degrade");
const reachNone = buildLoserMfeReachTable([{ r: -1 }, { r: -2 }]);
ok(reachNone.eligible === 0 && reachNone.rows.length === 5, "2. reach no-MFE: eligible 0, still 5 rows");
ok(reachNone.rows.every((r) => r.reachedCount === 0 && r.reachedPct === 0 && r.contributionPct === 0), "2. reach no-MFE: all rows zeroed (no crash)");
const reachEmpty = buildLoserMfeReachTable([]);
ok(reachEmpty.eligible === 0 && reachEmpty.coverage.total === 0 && reachEmpty.rows.length === 5, "3. reach empty list: eligible 0, total 0, 5 zeroed rows");

// 6. low-sample flag (SAMPLE_FLOOR = 10)
console.log("reach low-sample flags");
const reachBig = buildLoserMfeReachTable([
    ...Array.from({ length: 12 }, () => ({ r: -1, mfeR: 0.3 })), // reach +0.25R only
    ...Array.from({ length: 3 },  () => ({ r: -1, mfeR: 3.5 })), // reach every level
]);
const rbL = (L) => reachBig.rows.find((r) => r.levelR === L);
ok(rbL(0.25).reachedCount === 15 && rbL(0.25).lowSample === false, "6. reach ≥0.25R reached by 15 → not low-sample");
ok(rbL(0.5).reachedCount === 3 && rbL(0.5).lowSample === true, "6. reach ≥0.5R reached by 3 → low-sample");
ok(rbL(3).reachedCount === 3 && rbL(3).lowSample === true, "6. reach ≥3R reached by 3 → low-sample");

// ── V4 Phase 2: lift on raw-R buckets (PHASE E) ─────────────────────────────────
console.log("V4 raw-R bucket lift (PHASE E)");
const rawDistLift = buildRawRDistribution(v3);
ok(rawDistLift.buckets.every((b) => "lift" in b && "tradeSharePct" in b), "every raw bucket carries lift + tradeSharePct");
ok(rawDistLift.buckets.every((b) => b.tradeSharePct === 0 || Math.abs(b.lift - Number((b.contributionPct / b.tradeSharePct).toFixed(2))) <= 0.001),
    "bucket lift == loss-R share ÷ trade share (failuresAggregation methodology)");
const b051 = rawDistLift.buckets.find((b) => b.key === "05_1");
ok(b051 && b051.lift > 1, "0.5–1R bucket lift > 1 (its losses are bigger than the typical loser)");

// ── V4 Phase 2: Structure × MFE outcome (PHASE B) ───────────────────────────────
console.log("V4 buildMfeByDimension (structure × MFE)");
const mfeTrades = [
    { r: -2, structureTag: "choch", mfeR: 0.3 },
    { r: -3, structureTag: "choch", mfeR: 0.8 },
    { r: -1, structureTag: "choch", mfeR: 1.2 },
    { r: -1, structureTag: "choch", mfeR: 0.1 },
    { r: -1, structureTag: "bos",   mfeR: 1.5 },
    { r: -2, structureTag: "bos",   mfeR: 2.4 },
    { r: -1, structureTag: "bos",   mfeR: 0.7 },
];
const md = buildMfeByDimension(mfeTrades, "structure", { sampleFloor: 1 });
ok(md.available === true && md.rows.length === 2, "structure MFE-by-dim available with 2 rows");
ok(md.rows[0].value === "CHoCH" && md.rows[0].lossR === 7, "ranked by contribution: CHoCH first (7R)");
const mdCh = md.rows.find((r) => r.value === "CHoCH");
const mdBo = md.rows.find((r) => r.value === "BOS");
ok(mdCh.count === 4 && mdBo.count === 3, "counts: CHoCH 4, BOS 3");
ok(mdCh.avgMfe === 0.6, `CHoCH avg MFE 0.6 (got ${mdCh.avgMfe})`);
ok(Math.abs(mdBo.avgMfe - 1.53) <= 0.01, `BOS avg MFE ~1.53 (got ${mdBo.avgMfe})`);
ok(mdCh.reach[0.5] === 50 && mdCh.reach[1] === 25, "CHoCH reach ≥0.5R=50%, ≥1R=25%");
ok(mdBo.reach[1] === 66.7 && mdBo.reach[2] === 33.3, "BOS reach ≥1R=66.7%, ≥2R=33.3%");
ok(md.reachLevels.length === 4, "4 reach levels (0.5 / 1 / 1.5 / 2)");
ok(buildMfeByDimension(mfeTrades, "session").available === false, "session × MFE unavailable (session stubbed Unknown)");
ok(buildMfeByDimension([], "structure").available === false && buildMfeByDimension([], "structure").rows.length === 0, "empty input → unavailable, no crash");

// ── V4 Phase 2: bucket → Explorer wiring + all-loser fallback (PHASE A) ──────────
console.log("V4 bucket → Explorer wiring (PHASE A)");
const inBucket051 = losersInRawBucket(v3, "05_1");
ok(inBucket051.length === 2 && inBucket051.every((t) => bucketMfeRaw(getMfeR(t)) === "05_1"), "losersInRawBucket returns only that bucket's losers");
const expBucket = buildExplorer(inBucket051, { dimA: "structure", sampleFloor: 1 });
const expAll = buildExplorer(v3, { dimA: "structure", sampleFloor: 1 });
ok(expBucket.totals.trades === 2, "explorer scoped to selected bucket sees 2 trades");
ok(expAll.totals.trades === 7, "explorer all-losers fallback sees all 7 trades");

// ── V4 Phase 2: insight synthesis (PHASE D) ─────────────────────────────────────
console.log("V4 buildDistanceInsights (data-driven, prioritised)");
const ins = buildDistanceInsights(mfeTrades, { activeBucketKey: "05_1" });
ok(Array.isArray(ins.insights) && ins.insights.length >= 1 && ins.insights.length <= 8, "produces 1..8 insights");
ok(ins.insights.every((i) => typeof i.text === "string" && i.text.length > 0), "every insight has computed text (no empty)");
ok(ins.insights.every((i, idx, a) => idx === 0 || a[idx - 1].tier >= i.tier), "insights sorted by priority tier (contribution before lift/over-rep/MFE)");
ok(/\d/.test(ins.insights[0].text), "top insight contains a computed number (data-driven)");
ok(ins.insights.some((i) => i.kind === "contribution"), "includes a contribution insight");
ok(ins.insights.some((i) => i.kind === "bucket_driver"), "includes a within-bucket driver insight when a bucket is active");
ok(buildDistanceInsights([], {}).insights.length === 0, "no insights on empty input (never fabricates)");

// ── V2 Phase 2: Winner MAE / stop-pressure distribution ────────────────────────
console.log("getMaeR + bucketMaeDepth");
ok(getMaeR({ maeR: -0.5 }) === -0.5, "getMaeR reads maeR");
ok(getMaeR({ mae_r: -0.8 }) === -0.8, "getMaeR reads mae_r");
ok(getMaeR({ mae: -0.3 }) === -0.3, "getMaeR reads legacy mae");
ok(getMaeR({}) === null, "getMaeR null when absent");
ok(bucketMaeDepth(0) === "0_025", "depth 0 → 0 to -0.25R");
ok(bucketMaeDepth(-0.1) === "0_025", "-0.1R → 0 to -0.25R");
ok(bucketMaeDepth(-0.25) === "025_05", "-0.25R lower edge → -0.25 to -0.5R (deeper band)");
ok(bucketMaeDepth(-0.5) === "05_075", "-0.5R lower edge → -0.5 to -0.75R");
ok(bucketMaeDepth(-0.75) === "075_1", "-0.75R lower edge → -0.75 to -1R");
ok(bucketMaeDepth(-1) === "le_1", "6. -1R lower edge → ≤ -1R (anomaly band)");
ok(bucketMaeDepth(-2) === "le_1", "6. -2R → ≤ -1R");
ok(bucketMaeDepth(0.05) === "0_025", "positive maeR noise clamps to shallowest band");
ok(bucketMaeDepth(null) === null, "non-finite maeR → null");

console.log("buildWinnerMaeDistribution");
const maeWinners = [
    { r: 2, maeR: -0.1 },   // 0_025
    { r: 2, maeR: -0.25 },  // 025_05
    { r: 2, maeR: -0.3 },   // 025_05
    { r: 2, maeR: -0.6 },   // 05_075
    { r: 2, maeR: -0.8 },   // 075_1  (near_stop)
    { r: 2, maeR: -1.0 },   // le_1   (anomaly)
    { r: 2, maeR: -1.5 },   // le_1   (anomaly)
    { r: 2 },               // no maeR → excluded
];
const maeSnapshot = JSON.stringify(maeWinners);
const maeDist = buildWinnerMaeDistribution(maeWinners);
const mrow = (k) => maeDist.rows.find((r) => r.key === k);
ok(maeDist.rows.length === 5, "MAE: 5 bands");
ok(maeDist.eligible === 7 && maeDist.coverage.total === 8, "2. one winner without maeR excluded (7 of 8 eligible)");
// 1. winners bucket into all bands
ok(mrow("0_025").count === 1, "1. 0 to -0.25R → 1 winner");
ok(mrow("025_05").count === 2, "1. -0.25 to -0.5R → 2 winners");
ok(mrow("05_075").count === 1, "1. -0.5 to -0.75R → 1");
ok(mrow("075_1").count === 1 && mrow("075_1").flag === "near_stop", "1. -0.75 to -1R → 1 (near_stop)");
ok(mrow("le_1").count === 2 && mrow("le_1").flag === "anomaly", "6. ≤ -1R → 2 (anomaly band)");
ok(maeDist.nearStopCount === 3 && maeDist.anomalyCount === 2, "nearStop=3 (≤ -0.75R), anomaly=2 (≤ -1R)");
// 4. pct calculations (over eligible 7)
ok(Math.abs(mrow("0_025").pctOfWinners - 14.3) <= 0.1, `4. 0 to -0.25R pctOfWinners ~14.3 (got ${mrow("0_025").pctOfWinners})`);
ok(Math.abs(mrow("025_05").pctOfWinners - 28.6) <= 0.1, `4. -0.25 to -0.5R pctOfWinners ~28.6 (got ${mrow("025_05").pctOfWinners})`);
ok(mrow("025_05").winR === 4 && mrow("025_05").avgWinR === 2, "winR sum + avg correct (2 × 2R = 4R, avg 2R)");
ok(maeDist.totalWinR === 14, "totalWinR = 14 (7 winners × 2R)");
// 7. source not mutated
ok(JSON.stringify(maeWinners) === maeSnapshot, "7. source winners array not mutated");

// 3. zero eligible — empty input + all-missing-maeR input
console.log("MAE graceful degrade");
const maeEmpty = buildWinnerMaeDistribution([]);
ok(maeEmpty.eligible === 0 && maeEmpty.rows.length === 5, "3. empty winners → eligible 0, 5 zeroed bands");
ok(maeEmpty.rows.every((r) => r.count === 0 && r.pctOfWinners === 0), "3. empty winners → all bands zeroed (no crash)");
const maeNoField = buildWinnerMaeDistribution([{ r: 1 }, { r: 2 }]);
ok(maeNoField.eligible === 0 && maeNoField.coverage.total === 2, "2. winners without maeR → eligible 0 (safely excluded)");

// 5. low-sample flags (SAMPLE_FLOOR = 10)
console.log("MAE low-sample flags");
ok(mrow("0_025").lowSample === true, "5. band with 1 winner → low-sample");
const maeBig = buildWinnerMaeDistribution(Array.from({ length: 12 }, () => ({ r: 1, maeR: -0.1 })));
ok(maeBig.rows.find((r) => r.key === "0_025").count === 12, "MAE big: 12 winners in shallow band");
ok(maeBig.rows.find((r) => r.key === "0_025").lowSample === false, "5. band with 12 winners → not low-sample");
ok(maeBig.rows.find((r) => r.key === "le_1").lowSample === false, "5. empty band → not flagged low-sample");

// ── COHORT-CONTEXT-METRICS: ranking modes, highlight, cohort insights ───────────
// Reuses exTrades: 5 short losers (-2), 5 long losers (-1), 10 long winners (+1).
console.log("Cohort: Explorer rank modes (PHASE C)");
const exContrib = buildExplorer(exTrades, { dimA: "direction", metric: "contribution", sampleFloor: 1 });
ok(exContrib.rows[0].contributionPct >= exContrib.rows[exContrib.rows.length - 1].contributionPct, "contribution rank: first ≥ last (Short 66.7% on top)");
const exCount = buildExplorer(exTrades, { dimA: "direction", metric: "count", sampleFloor: 1 });
ok(exCount.rows[0].count >= exCount.rows[exCount.rows.length - 1].count, "trade-count rank: first ≥ last (Long 15 on top)");

console.log("Cohort: context fields on Explorer cells (PHASE A surfaced)");
const expHL = buildExplorer(exTrades, { dimA: "direction", sampleFloor: 1 });
const shortHL = expHL.rows.find((c) => c.keyA === "Short");
const longHL = expHL.rows.find((c) => c.keyA === "Long");
ok(shortHL.losers === 5 && shortHL.winners === 0 && shortHL.totalTrades === 5, "Short cell carries losers/winners/total");
ok(longHL.winners === 10 && Math.abs(longHL.lossRate - 33.3) <= 0.1 && Math.abs(longHL.lossRateDelta - (-16.7)) <= 0.1, "Long cell: 10 winners, lossRate 33.3%, Δ -16.7");
ok("baselineLossRate" in shortHL && shortHL.baselineLossRate === 50, "explorer cells expose baselineLossRate");

console.log("Cohort: highlight thresholds (PHASE E)");
ok(isHighlightCell(shortHL) === true, `Short highlighted (lift ${shortHL.lift} ≥ ${EXPLORER_LIFT_HIGHLIGHT}, rankable)`);
ok(isHighlightCell(longHL) === false, "Long not highlighted (lift < 1.5)");
ok(isHighlightCell({ rankable: false, lift: 5 }) === false, "below-floor cell never highlighted (sample floor gate)");
ok(isHighlightCell(shortHL, 3) === false, "custom threshold respected (2.67 < 3)");

console.log("Cohort: insight engine prioritises lift / delta over contribution (PHASE F)");
const cohort = [
    ...Array.from({ length: 18 }, (_, i) => ({ r: i < 2 ? -1 : 1, structureTag: "bos",   direction: "long",  mfeR: 0.5 })),
    ...Array.from({ length: 10 }, (_, i) => ({ r: i < 8 ? -2 : 1, structureTag: "choch", direction: "short", mfeR: 0.8 })),
];
const cohortLosers = cohort.filter((t) => t.r < 0);
const insC = buildDistanceInsights(cohortLosers, { allTrades: cohort });
ok(insC.insights.some((i) => i.kind === "cohort_lift"), "cohort_lift insight generated when allTrades (winners) supplied");
ok(insC.insights[0].kind === "cohort_lift", "cohort_lift is the top-priority insight (outranks contribution)");
const liftText = insC.insights.find((i) => i.kind === "cohort_lift").text;
ok(/×\s*lift/.test(liftText) && /% of trades/.test(liftText), "cohort_lift text cites lift multiplier + trade share (actionable)");
const insNo = buildDistanceInsights(cohortLosers, {});
ok(!insNo.insights.some((i) => i.kind === "cohort_lift" || i.kind === "cohort_delta"), "no cohort insights without allTrades (losers-only)");
ok(insNo.insights.length >= 1, "losers-only insights still generated (no regression)");

// ── TRUE-DENOMINATOR FIX: buildBucketExplorerRows (PHASE F) ─────────────────────
// Session is stubbed Unknown in the harness, so we model "NY × CHOCH / London × BOS"
// with direction × structure (both real accessors). All trades:
//   short×choch: 7 losers (all in bucket) + 12 winners  → 19 total
//   long×bos:    3 losers (all in bucket) + 20 winners  → 23 total
console.log("True-denominator bucket Explorer rows (PHASE F)");
const denomAll = [
    ...Array.from({ length: 7 },  () => ({ direction: "short", structureTag: "choch", r: -1 })),
    ...Array.from({ length: 12 }, () => ({ direction: "short", structureTag: "choch", r: 1 })),
    ...Array.from({ length: 3 },  () => ({ direction: "long",  structureTag: "bos",   r: -1 })),
    ...Array.from({ length: 20 }, () => ({ direction: "long",  structureTag: "bos",   r: 1 })),
];
const denomBucket = denomAll.filter((t) => t.r < 0); // the 10 losers = the selected bucket
const bx = buildBucketExplorerRows({ bucketLosers: denomBucket, allTrades: denomAll, dimA: "direction", dimB: "structure", sampleFloor: 8 });
const nyCh = bx.rows.find((r) => r.keyA === "Short" && r.keyB === "CHoCH");
const lonBos = bx.rows.find((r) => r.keyA === "Long" && r.keyB === "BOS");
ok(nyCh && lonBos, "pair rows keyed by direction × structure");
ok(nyCh.bucketLosers === 7 && nyCh.bucketLossR === 7, "2. bucket metrics count ONLY bucket losers (7 losers, 7R)");
ok(nyCh.fullLosers === 7 && nyCh.fullWinners === 12 && nyCh.fullTotal === 19, "1+3. full denominator = ALL matching trades (7L / 12W / 19 total)");
ok(nyCh.fullWinners > 0, "7. winners recovered (the original bug: winners were 0 in bucket mode)");
ok(nyCh.bucketLosers <= nyCh.fullLosers, "7. no winners falsely assigned to the MFE bucket (bucketLosers ≤ fullLosers)");
ok(Math.abs(nyCh.fullLossRate - 36.8) <= 0.1, "full loss rate 36.8% (7/19)");
ok(Math.abs(bx.totals.baselineLossRate - 23.8) <= 0.1, "5. baseline loss rate uses allTrades (10/42 = 23.8%)");
ok(Math.abs(nyCh.lossRateDelta - 13.0) <= 0.1, "6. loss-rate delta = fullLossRate − baseline (+13.0)");
ok(nyCh.bucketContributionPct === 70 && lonBos.bucketContributionPct === 30, "bucket contribution % from bucket losers only (70 / 30)");
ok(lonBos.fullLosers === 3 && lonBos.fullWinners === 20 && lonBos.fullTotal === 23, "4. pair matching works for the second group (3L / 20W / 23)");
ok(Math.abs(lonBos.lossRateDelta - (-10.8)) <= 0.1, "London×BOS delta negative (13.0% − 23.8% ≈ -10.8)");
// single-dimension matching
const bx1 = buildBucketExplorerRows({ bucketLosers: denomBucket, allTrades: denomAll, dimA: "direction", sampleFloor: 8 });
const shortRow = bx1.rows.find((r) => r.keyA === "Short");
ok(shortRow.bucketLosers === 7 && shortRow.fullWinners === 12 && shortRow.fullTotal === 19, "single-dim denominator works (Short: 7 bucket L, 12W, 19 total)");
// multi-word value safety (values containing spaces must group correctly)
const spaced = [
    { direction: "long", structureTag: "bos", r: -1 },
    { direction: "long", structureTag: "bos", r: 1 },
];
// (direction caps to "Long"; this just exercises the NUL-separated pair id path)
const bxSpace = buildBucketExplorerRows({ bucketLosers: spaced.filter((t) => t.r < 0), allTrades: spaced, dimA: "direction", dimB: "structure", sampleFloor: 1 });
ok(bxSpace.rows.length === 1 && bxSpace.rows[0].keyA === "Long" && bxSpace.rows[0].keyB === "BOS", "pair id keeps keyA/keyB intact (no split corruption)");
// empty-safe
ok(buildBucketExplorerRows({ bucketLosers: [], allTrades: [], dimA: "direction" }).rows.length === 0, "empty input → no rows, no crash");

// ── V2 Phase 2B: to-original-exit MAE preference + legacy fallback ─────────────
console.log("getMaeForStopPressure (to-exit preferred, stop-anchored fallback)");
ok(getMaeForStopPressure({ maeRToOriginalExit: -0.3, maeR: -2.5 }).value === -0.3, "prefers maeRToOriginalExit value over maeR");
ok(getMaeForStopPressure({ maeRToOriginalExit: -0.3, maeR: -2.5 }).source === "to_original_exit", "source = to_original_exit when present");
ok(getMaeForStopPressure({ mae_r_to_original_exit: -0.6 }).value === -0.6, "reads snake mae_r_to_original_exit");
ok(getMaeForStopPressure({ maeR: -1.5 }).source === "stop_anchored_fallback", "falls back to maeR → source stop_anchored_fallback");
ok(getMaeForStopPressure({ maeR: -1.5 }).value === -1.5, "fallback value = stop-anchored maeR");
ok(getMaeForStopPressure({}).value === null && getMaeForStopPressure({}).source === null, "neither field → { value:null, source:null }");

console.log("buildWinnerMaeDistribution source preference + fallback metadata");
const spWinners = [
    { r: 2, maeRToOriginalExit: -0.3, maeR: -2.5 },  // prefers to-exit (-0.3 → 0.25–0.5R, NOT ≤ -1R)
    { r: 2, mae_r_to_original_exit: -0.6 },           // to-exit only
    { r: 2, maeR: -1.5 },                             // legacy fallback (→ ≤ -1R)
    { r: 2 },                                         // neither → excluded
];
const spSnapshot = JSON.stringify(spWinners);
const spDist = buildWinnerMaeDistribution(spWinners);
const spRow = (k) => spDist.rows.find((r) => r.key === k);
ok(spDist.eligible === 3, "missing-both winner excluded (3 of 4 eligible)");
ok(spDist.fallbackCount === 1 && spDist.fallbackPct === 33.3, "fallbackCount=1, fallbackPct=33.3 (the legacy-only winner)");
ok(spDist.source === "mixed" && /Some trades use legacy/.test(spDist.warning), "mixed source → soft warning");
ok(spRow("025_05").count === 1, "to-exit winner (-0.3) buckets to -0.25→-0.5R (NOT pinned to ≤ -1R by stop-anchored -2.5)");
ok(spRow("le_1").count === 1, "only the legacy-fallback winner (-1.5) lands in ≤ -1R");
ok(JSON.stringify(spWinners) === spSnapshot, "source winners array not mutated");

console.log("all-fallback → stronger warning; all-to-exit → no warning");
const spAllLegacy = buildWinnerMaeDistribution([{ r: 2, maeR: -1.2 }, { r: 2, maeR: -0.5 }]);
ok(spAllLegacy.source === "stop_anchored_fallback" && spAllLegacy.fallbackCount === 2, "all legacy → source stop_anchored_fallback");
ok(/Re-export with mae_r_to_original_exit/.test(spAllLegacy.warning), "all-fallback → stronger re-export warning");
const spAllToExit = buildWinnerMaeDistribution([{ r: 2, maeRToOriginalExit: -0.4 }]);
ok(spAllToExit.source === "to_original_exit" && spAllToExit.fallbackCount === 0 && spAllToExit.warning == null, "all to-exit → no fallback, no warning");

// ── VALID-UNIVERSE DENOMINATOR FIX ──────────────────────────────────────────────
// Bug: the Explorer denominator used useTradeUniverse().trades (raw imported rows,
// e.g. 330) instead of the valid/performance universe shown on Run Detail (e.g.
// 165). The component now gates `allTrades` through isPerformanceTrade — the SAME
// predicate Run Detail uses — before any denominator math. This proves that gating
// at the data layer (the exact transform the component performs).
console.log("Valid-universe denominator (Run Detail parity)");
const validUniverseHasFn = typeof isPerformanceTrade === "function";
ok(validUniverseHasFn, "isPerformanceTrade loaded from tradeClassification (canonical predicate)");
// Cohort short×choch: 7 real losers + 12 real winners (valid) + 80 excluded rows
// (UNFILLED / SESSION_FILTERED) that share the SAME dimension key but are NOT trades.
const mixedAll = [
    ...Array.from({ length: 7 },  () => ({ direction: "short", structureTag: "choch", r: -1, outcome: "LOSS", entry: "x" })),
    ...Array.from({ length: 12 }, () => ({ direction: "short", structureTag: "choch", r: 1,  outcome: "WIN",  entry: "x" })),
    ...Array.from({ length: 50 }, () => ({ direction: "short", structureTag: "choch", outcome: "UNFILLED" })),
    ...Array.from({ length: 30 }, () => ({ direction: "short", structureTag: "choch", outcome: "SESSION_FILTERED" })),
]; // 99 raw rows; valid universe = 19
const validUniverse = mixedAll.filter(isPerformanceTrade);
ok(mixedAll.length === 99 && validUniverse.length === 19, "valid universe drops excluded setups (99 raw → 19 valid)");
const vuBucketLosers = validUniverse.filter((t) => t.r < 0); // 7 performance losers
const fixed = buildBucketExplorerRows({ bucketLosers: vuBucketLosers, allTrades: validUniverse, dimA: "direction", dimB: "structure", sampleFloor: 8 });
const fixedRow = fixed.rows.find((r) => r.keyA === "Short" && r.keyB === "CHoCH");
ok(fixedRow.fullTotal === 19, "denominator = valid universe (fullTotal 19, NOT 99 raw rows)");
ok(fixedRow.fullLosers === 7 && fixedRow.fullWinners === 12, "valid denominator splits 7L / 12W");
ok(fixedRow.bucketLosers === 7 && fixedRow.bucketLosers <= fixedRow.fullLosers, "bucket losers ⊆ valid denominator (no orphan losers)");
ok(Math.abs(fixed.totals.baselineLossRate - (7 / 19) * 100) <= 0.1, "baseline loss rate uses valid universe (7/19 = 36.8%)");
// Counter-proof: feeding the RAW rows (the old bug) inflates the denominator.
const buggy = buildBucketExplorerRows({ bucketLosers: vuBucketLosers, allTrades: mixedAll, dimA: "direction", dimB: "structure", sampleFloor: 8 });
const buggyRow = buggy.rows.find((r) => r.keyA === "Short" && r.keyB === "CHoCH");
ok(buggyRow.fullTotal === 99, "raw-rows denominator (the bug) would report 99 total");
ok(fixedRow.fullTotal < buggyRow.fullTotal, "valid-universe denominator < raw-rows denominator (fix confirmed: 19 < 99)");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
