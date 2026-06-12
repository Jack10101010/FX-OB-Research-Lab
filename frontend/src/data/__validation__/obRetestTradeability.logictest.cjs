/**
 * obRetestTradeability.logictest.cjs — Tradeability Explorer pure-layer logic test
 * (Phase 2 Step 2).
 *
 * Compiles the real ES modules via Babel and injects the aliased imports through
 * globalThis (same pattern as obRetestMonetization.logictest.cjs):
 *   obRetest → obRetestResearch → obRetestMonetization → obRetestTradeability.
 *
 * Run from frontend/:  node src/data/__validation__/obRetestTradeability.logictest.cjs
 */
const path = require("path");
const { transformFileSync } = require("@babel/core");
const Module = require("module");

function compile(rel, replacements = {}) {
    let code = transformFileSync(path.resolve(__dirname, rel), { presets: ["@babel/preset-env"] }).code;
    for (const [from, to] of Object.entries(replacements)) code = code.split(from).join(to);
    const m = new Module(rel);
    m.paths = Module._nodeModulePaths(process.cwd());
    m._compile(code, rel + ".js");
    return m.exports;
}

globalThis.__OB_RETEST__ = compile("../obRetest.js");
const R = compile("../obRetestResearch.js", { 'require("@/data/obRetest")': "globalThis.__OB_RETEST__" });
globalThis.__OB_RESEARCH__ = R;
const Mon = compile("../obRetestMonetization.js", {
    'require("@/data/obRetest")': "globalThis.__OB_RETEST__",
    'require("@/data/obRetestResearch")': "globalThis.__OB_RESEARCH__",
});
globalThis.__OB_MON__ = Mon;
const T = compile("../obRetestTradeability.js", {
    'require("@/data/obRetestResearch")': "globalThis.__OB_RESEARCH__",
    'require("@/data/obRetestMonetization")': "globalThis.__OB_MON__",
});

let PASS = 0, FAIL = 0;
function check(name, cond, detail = "") {
    if (cond) { console.log(`  ✓  ${name}`); PASS += 1; }
    else { console.log(`  ✗  ${name}  ${detail}`); FAIL += 1; }
}
const approx = (a, b, eps = 1e-9) => a != null && b != null && Math.abs(a - b) < eps;

const at = (h) => Math.floor(Date.UTC(2025, 5, 2, h, 0, 0) / 1000);
function ev(o = {}) {
    return {
        obId: "1", structure: "BOS", direction: "bull",
        detectionTime: at(0), firstTouchTime: at(4), retestTime: at(4), retestIndex: 1,
        entryPenetrationPct: 20, maxPenetrationPct: 20,
        reactionMaxPips: 10, reactionMet: true, outcome: "survived",
        candlesToFailure: null, session: null, minutesSinceFirstTouch: 5,
        ...o,
    };
}
// v2.1 per-OB row (MFE-before-death present → monetization eligible).
function ob(o = {}) {
    return {
        obId: "1", touchCount: 1, retestCount: 1,
        finalOutcome: "invalidated_between_windows", timeToInvalidationMinutes: 30,
        killMarginPips: 2, killConfirmedTf: false, reheldAfterKill: true,
        mfeBeforeDeathPips: 10, mfeAfterR1Pips: null, mfeAfterR2Pips: null, mfeAfterR3Pips: null,
        ...o,
    };
}
const w = (id, width) => ({ id, obWidthPips: width });

// ── Shared scenario: 4 OBs, BOS/CHoCH, R values 2.5 / 1.0 / 0.2 (BOS) and 0.5 (CHoCH)
const rawEvents = [
    ev({ obId: "1", structure: "BOS",   direction: "bull", outcome: "survived", reactionMet: true }),
    ev({ obId: "2", structure: "BOS",   direction: "bull", outcome: "survived", reactionMet: false }),
    ev({ obId: "3", structure: "CHoCH", direction: "bear", outcome: "failed",   reactionMet: false, candlesToFailure: 3 }),
    ev({ obId: "4", structure: "BOS",   direction: "bull", outcome: "open",     reactionMet: false }),
];
const obs = [w("1", 10), w("2", 10), w("3", 10), w("4", 10)];
const perOB = [
    ob({ obId: "1", mfeBeforeDeathPips: 25 }), // 2.5R
    ob({ obId: "2", mfeBeforeDeathPips: 10 }), // 1.0R
    ob({ obId: "3", mfeBeforeDeathPips: 5 }),  // 0.5R
    ob({ obId: "4", mfeBeforeDeathPips: 2 }),  // 0.2R
];
const enriched = R.enrichRetestEvents(rawEvents, obs);

// ── Test 1: OB-grain dimension returns full monetization + reaction parity ──────────
console.log("\nTest 1 — OB-grain (byStructure) monetization + reaction parity");
const t1 = T.buildTradeabilityRows(enriched, perOB, obs, "byStructure", { minN: 1 });
check("available, grain ob, mfeAnchor ob, monetizationAvailable", t1.available && t1.grain === "ob" && t1.mfeAnchor === "ob" && t1.monetizationAvailable === true);
const bos = t1.rows.find((r) => r.key === "BOS");
const choch = t1.rows.find((r) => r.key === "CHoCH");
check("BOS cohort eligibleN 3", bos.eligibleN === 3, String(bos.eligibleN));
check("BOS medianMfeR 1.0", approx(bos.medianMfeR, 1.0), String(bos.medianMfeR));
check("BOS capture1R 2/3, capture2R 1/3", approx(bos.capture1R, 2 / 3) && approx(bos.capture2R, 1 / 3));
check("BOS capture3R 0, capture5R 0", bos.capture3R === 0 && bos.capture5R === 0);
check("BOS suggestedTargetR 1 (only ≥1R clears 0.5 floor)", bos.suggestedTargetR === 1, String(bos.suggestedTargetR));
check("BOS suggestedBETriggerR null (none clears 0.7)", bos.suggestedBETriggerR === null);
check("CHoCH target falls back to nearest threshold of median 0.5 → 1", choch.suggestedTargetR === 1 && choch.targetFromFallback === true);
// Reaction parity with the existing research grouping.
const grp = R.groupRetestsByDimension(enriched, R.RETEST_DIMENSIONS.byStructure.fn, { minN: 1 });
const gBos = grp.find((g) => g.key === "BOS");
check("reaction stats == groupRetestsByDimension", approx(bos.reactionSuccessRate, gBos.reactionSuccessRate) && approx(bos.windowHoldRate, gBos.windowHoldRate) && approx(bos.failureRate, gBos.failureRate) && bos.n === gBos.n);
// Capture parity with buildRrCaptureCurve over the same cohort.
const bosCurve = Mon.buildRrCaptureCurve([perOB[0], perOB[1], perOB[3]], obs);
check("capture values == buildRrCaptureCurve(cohort)", approx(bos.capture1R, bosCurve.points.find((p) => p.r === 1).share) && approx(bos.capture2R, bosCurve.points.find((p) => p.r === 2).share));

// ── Test 2: event-grain dimension blocks monetization (reaction only) ───────────────
console.log("\nTest 2 — event-grain (byReactionQuality) withholds monetization");
const t2 = T.buildTradeabilityRows(enriched, perOB, obs, "byReactionQuality", { minN: 1 });
check("grain event, monetizationAvailable false + reason", t2.grain === "event" && t2.monetizationAvailable === false && /event-grain/.test(t2.reason));
check("every row has null monetization but real reaction stats", t2.rows.every((r) => r.medianMfeR === null && r.capture1R === null && r.suggestedTargetR === null && r.monetizationAvailable === false && r.reactionSuccessRate !== undefined));
const t2grp = R.groupRetestsByDimension(enriched, R.RETEST_DIMENSIONS.byReactionQuality.fn, { minN: 1 });
check("reaction parity preserved for event-grain", t2.rows.length === t2grp.length && t2.rows.every((r) => approx(r.windowHoldRate, t2grp.find((g) => g.key === r.key).windowHoldRate)));

// ── Test 3: retest-number special case (per-retest MFE anchors) ─────────────────────
console.log("\nTest 3 — byRetestNumber uses mfeAfterR1/R2/R3 anchors");
const rnEvents = [
    ev({ obId: "10", retestIndex: 1 }),
    ev({ obId: "10", retestIndex: 2 }),
];
const rnObs = [w("10", 10), w("11", 10)];
const rnPerOB = [
    ob({ obId: "10", mfeAfterR1Pips: 20, mfeAfterR2Pips: 5 }), // R1 2.0R · R2 0.5R
    ob({ obId: "11", mfeAfterR1Pips: 10 }),                     // R1 1.0R
];
const rnEnriched = R.enrichRetestEvents(rnEvents, rnObs);
const t3 = T.buildTradeabilityRows(rnEnriched, rnPerOB, rnObs, "byRetestNumber", { minN: 1 });
check("grain event but mfeAnchor retest, monetizationAvailable true", t3.grain === "event" && t3.mfeAnchor === "retest" && t3.monetizationAvailable === true);
const r1 = t3.rows.find((r) => r.key === "R1");
check("R1 anchor eligibleN 2, medianMfeR 1.5", r1.eligibleN === 2 && approx(r1.medianMfeR, 1.5));
check("R1 capture1R 1.0, capture2R 0.5, capture3R/5R null", r1.capture1R === 1 && approx(r1.capture2R, 0.5) && r1.capture3R === null && r1.capture5R === null);
check("R1 suggestedTargetR 2 (≥2R clears 0.5), BE 1 (≥1R clears 0.7)", r1.suggestedTargetR === 2 && r1.suggestedBETriggerR === 1);

// ── Test 4: suggested target floor + BE floor logic (direct unit) ───────────────────
console.log("\nTest 4 — deriveSuggestedTargetAndBE floors");
const curve = { available: true, medianMfeR: 1.0, points: [{ r: 1, share: 0.9 }, { r: 2, share: 0.6 }, { r: 3, share: 0.2 }] };
const d4a = T.deriveSuggestedTargetAndBE(curve, null);
check("default floors: target 2 (largest ≥0.5), BE 1 (smallest ≥0.7)", d4a.suggestedTargetR === 2 && d4a.suggestedBETriggerR === 1 && d4a.targetFromFallback === false);
const d4b = T.deriveSuggestedTargetAndBE(curve, null, { targetFloor: 0.25, beFloor: 0.95 });
// r3 share 0.2 < 0.25 floor → largest clearing is r2; beFloor 0.95 cleared by none.
check("custom floors: target 2, BE null", d4b.suggestedTargetR === 2 && d4b.suggestedBETriggerR === null);
const d4c = T.deriveSuggestedTargetAndBE({ available: true, medianMfeR: 1.4, points: [{ r: 1, share: 0.1 }, { r: 2, share: 0 }] }, null);
check("no threshold clears floor → fallback to nearest-threshold of median (1.4→1)", d4c.suggestedTargetR === 1 && d4c.targetFromFallback === true);
const d4d = T.deriveSuggestedTargetAndBE({ available: false, points: [] }, null);
check("unavailable curve → all null", d4d.suggestedTargetR === null && d4d.suggestedBETriggerR === null);

// ── Test 5: missing OB width exclusion (counted, not faked) ─────────────────────────
console.log("\nTest 5 — missing width exclusion");
const wEvents = [ev({ obId: "1", structure: "BOS" }), ev({ obId: "2", structure: "BOS" })];
const wObs = [w("1", 10)]; // no width for ob 2
const wPerOB = [ob({ obId: "1", mfeBeforeDeathPips: 15 }), ob({ obId: "2", mfeBeforeDeathPips: 20 })];
const wEnriched = R.enrichRetestEvents(wEvents, wObs);
const t5 = T.buildTradeabilityRows(wEnriched, wPerOB, wObs, "byStructure", { minN: 1 });
const t5bos = t5.rows.find((r) => r.key === "BOS");
check("cohort eligibleN 1 (width-less OB excluded)", t5bos.eligibleN === 1, String(t5bos.eligibleN));
check("excludedNoWidth 1 on row + table", t5bos.excludedNoWidth === 1 && t5.excludedNoWidth === 1);

// ── Test 6: v1/v2 rows never fake monetization ──────────────────────────────────────
console.log("\nTest 6 — v1/v2 artifacts: monetization unavailable, reaction intact");
const v2PerOB = [
    { obId: "1", touchCount: 1, retestCount: 1, finalOutcome: "invalidated_in_window", mfeBeforeDeathPips: null },
    { obId: "2", touchCount: 1, retestCount: 1, finalOutcome: "invalidated_in_window", mfeBeforeDeathPips: null },
    { obId: "3", touchCount: 1, retestCount: 1, finalOutcome: "failed", mfeBeforeDeathPips: null },
    { obId: "4", touchCount: 1, retestCount: 1, finalOutcome: "open", mfeBeforeDeathPips: null },
];
const t6 = T.buildTradeabilityRows(enriched, v2PerOB, obs, "byStructure", { minN: 1 });
check("OB-grain but monetizationAvailable false (no v2.1) with reason", t6.monetizationAvailable === false && /v2\.1/.test(t6.reason));
check("rows: monetization null, reaction present", t6.rows.every((r) => r.medianMfeR === null && r.capture1R === null) && t6.rows.find((r) => r.key === "BOS").n === 3);
const t6rn = T.buildTradeabilityRows(enriched, v2PerOB, obs, "byRetestNumber", { minN: 1 });
check("retestNumber also withholds monetization on v1/v2", t6rn.monetizationAvailable === false && t6rn.rows.every((r) => r.medianMfeR === null));

// ── Test 7: min-N flagging passes through ───────────────────────────────────────────
console.log("\nTest 7 — minN flagging");
const t7 = T.buildTradeabilityRows(enriched, perOB, obs, "byStructure", { minN: 100 });
check("all rows belowMinN at minN 100", t7.rows.every((r) => r.belowMinN === true));
const t7b = T.buildTradeabilityRows(enriched, perOB, obs, "byStructure", { minN: 1 });
check("rows not belowMinN at minN 1", t7b.rows.every((r) => r.belowMinN === false));

// ── Test 8: invalid dimension key handling ──────────────────────────────────────────
console.log("\nTest 8 — invalid dimension key");
const t8 = T.buildTradeabilityRows(enriched, perOB, obs, "nope", { minN: 1 });
check("unavailable with explicit reason, empty rows", t8.available === false && /unknown dimension/.test(t8.reason) && t8.rows.length === 0);

// ── Test 9: every dimension declares a valid grain (registry guard) ─────────────────
console.log("\nTest 9 — dimension registry grain coverage");
const grains = R.RETEST_DIMENSION_GRAINS;
const allValid = Object.values(R.RETEST_DIMENSIONS).every((d) => grains.includes(d.grain));
check("every RETEST_DIMENSIONS entry has a valid grain", allValid);
check("byStructure/byDirection/byOriginSession are ob-grain", ["byStructure", "byDirection", "byStructureDirection", "byObSize", "byOriginSession", "byOriginBodyDominance", "byOriginWickDominance", "byDominantWickSide", "byOriginRange", "byOriginImpulse"].every((k) => R.RETEST_DIMENSIONS[k].grain === "ob"));
check("retest/session/penetration/timing/behaviour are event-grain", ["byRetestNumber", "byRetestSession", "bySameSession", "byEntryPenetration", "byPenetration", "byTimeSinceDetection", "byTimeSinceFirstTouch", "byTimeSincePrevRetest", "byFirstTouchOutcome", "byFailureBehavior", "byReactionQuality"].every((k) => R.RETEST_DIMENSIONS[k].grain === "event"));
check("only byRetestNumber carries mfeAnchor 'retest'", Object.entries(R.RETEST_DIMENSIONS).every(([k, d]) => (d.mfeAnchor === "retest") === (k === "byRetestNumber")));

// ── result ──────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(52)}`);
console.log(`Results: ${PASS} passed, ${FAIL} failed`);
if (FAIL) { console.log(`FAILURES: ${FAIL}`); process.exit(1); }
console.log("ALL TESTS PASSED ✓");
