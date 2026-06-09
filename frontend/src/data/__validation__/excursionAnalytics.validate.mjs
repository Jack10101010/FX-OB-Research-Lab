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

const {
    getMfeR, getTargetRR, mfePctOfTarget, bucketMfePct, bucketMfeRaw,
    buildMfeDistribution, buildBeOpportunity,
    buildRawRDistribution, buildBucketDrilldown, buildFailureDrivers, buildPairDrivers,
    buildExplorer,
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

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
