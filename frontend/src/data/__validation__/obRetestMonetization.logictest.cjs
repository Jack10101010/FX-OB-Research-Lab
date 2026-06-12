/**
 * obRetestMonetization.logictest.cjs — Phase C monetization-layer logic test.
 *
 * Loads the real ES modules via Babel (same pattern as obRetestResearch.logictest.cjs):
 * obRetest → obRetestResearch → obRetestMonetization, with aliased imports
 * injected via globalThis.
 *
 * Run from frontend/:  node src/data/__validation__/obRetestMonetization.logictest.cjs
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
globalThis.__OB_RESEARCH__ = compile("../obRetestResearch.js", { 'require("@/data/obRetest")': "globalThis.__OB_RETEST__" });
const M = compile("../obRetestMonetization.js", {
    'require("@/data/obRetest")': "globalThis.__OB_RETEST__",
    'require("@/data/obRetestResearch")': "globalThis.__OB_RESEARCH__",
});

let PASS = 0, FAIL = 0;
function check(name, cond, detail = "") {
    if (cond) { console.log(`  ✓  ${name}`); PASS += 1; }
    else { console.log(`  ✗  ${name}  ${detail}`); FAIL += 1; }
}

// v2.1-style per-OB row factory (frontend-derived shape).
function row(o = {}) {
    return {
        obId: "1", touchCount: 1, retestCount: 1,
        finalOutcome: "invalidated_between_windows", timeToInvalidationMinutes: 30,
        killMarginPips: 2, killConfirmedTf: false, reheldAfterKill: true,
        mfeBeforeDeathPips: 10, mfeAfterR1Pips: null, mfeAfterR2Pips: null, mfeAfterR3Pips: null,
        ...o,
    };
}
const obW = (id, w) => ({ id, obWidthPips: w });

// ── Test 1: RR capture curve — exact shares + monotonicity + median ───────────────
console.log("\nTest 1 — RR capture curve");
const perOB1 = [
    row({ obId: "1", mfeBeforeDeathPips: 25 }),  // 2.5R
    row({ obId: "2", mfeBeforeDeathPips: 10 }),  // 1.0R
    row({ obId: "3", mfeBeforeDeathPips: 5 }),   // 0.5R
    row({ obId: "4", mfeBeforeDeathPips: 2 }),   // 0.2R
];
const obs1 = [obW("1", 10), obW("2", 10), obW("3", 10), obW("4", 10)];
const c1 = M.buildRrCaptureCurve(perOB1, obs1);
check("available true, eligibleN 4, excludedNoWidth 0", c1.available && c1.eligibleN === 4 && c1.excludedNoWidth === 0);
const shareAt = (r) => c1.points.find((p) => p.r === r)?.share;
check("share ≥1R = 2/4", shareAt(1) === 0.5);
check("share ≥1.5R = 1/4", shareAt(1.5) === 0.25);
check("share ≥2R = 1/4", shareAt(2) === 0.25);
check("share ≥2.5R = 1/4", shareAt(2.5) === 0.25);
check("share ≥3R = 0, ≥5R = 0", shareAt(3) === 0 && shareAt(5) === 0);
check("curve monotone non-increasing", c1.points.every((p, i) => i === 0 || p.share <= c1.points[i - 1].share));
check("thresholds exactly [1,1.5,2,2.5,3,3.5,4,4.5,5]", JSON.stringify(c1.points.map((p) => p.r)) === JSON.stringify([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]));
check("medianMfeR 0.75 ((0.5+1.0)/2)", c1.medianMfeR === 0.75, String(c1.medianMfeR));

// ── Test 2: missing/invalid OB width excluded + reported ───────────────────────────
console.log("\nTest 2 — missing width exclusion");
const perOB2 = [...perOB1, row({ obId: "5", mfeBeforeDeathPips: 50 })]; // no matching OB
const obs2 = [...obs1, { id: "6", obWidthPips: 0 }]; // width 0 = invalid, but no row 6 anyway
const c2 = M.buildRrCaptureCurve(perOB2, obs2);
check("row without width excluded from eligibleN", c2.eligibleN === 4, String(c2.eligibleN));
check("excludedNoWidth 1", c2.excludedNoWidth === 1, String(c2.excludedNoWidth));
check("shares unchanged by the excluded row", c2.points.find((p) => p.r === 1).share === 0.5);
const c2b = M.buildRrCaptureCurve([row({ obId: "9", mfeBeforeDeathPips: 10 })], [{ id: "9", obWidthPips: -3 }]);
check("non-positive width treated as missing", c2b.eligibleN === 0 && c2b.excludedNoWidth === 1);

// ── Test 3: TTI buckets — boundaries, totals, censored, never_touched excluded ─────
console.log("\nTest 3 — TTI buckets");
const perOB3 = [
    row({ obId: "1", timeToInvalidationMinutes: 5 }),      // <15m
    row({ obId: "2", timeToInvalidationMinutes: 15 }),     // 15-60m (lower bound inclusive)
    row({ obId: "3", timeToInvalidationMinutes: 120 }),    // 1-4h
    row({ obId: "4", timeToInvalidationMinutes: 300 }),    // 4-24h
    row({ obId: "5", timeToInvalidationMinutes: 2000 }),   // 1-7d
    row({ obId: "6", timeToInvalidationMinutes: 20000 }),  // >7d
    row({ obId: "7", finalOutcome: "alive_at_data_end", timeToInvalidationMinutes: null, killMarginPips: null, killConfirmedTf: null, reheldAfterKill: null, mfeBeforeDeathPips: 4 }),
    row({ obId: "8", finalOutcome: "capped", timeToInvalidationMinutes: null, killMarginPips: null, killConfirmedTf: null, reheldAfterKill: null, mfeBeforeDeathPips: 4 }),
    row({ obId: "9", finalOutcome: "never_touched", touchCount: 0, timeToInvalidationMinutes: null, killMarginPips: null, killConfirmedTf: null, reheldAfterKill: null, mfeBeforeDeathPips: null }),
];
const t3 = M.buildTtiBuckets(perOB3);
check("killed 6, censored 2 (alive + capped), total 8", t3.killed === 6 && t3.censored === 2 && t3.total === 8, JSON.stringify(t3));
check("never_touched excluded entirely", t3.total === 8);
const bn = (k) => t3.buckets.find((b) => b.key === k)?.n;
check("each time bucket has exactly 1", ["lt15m", "m15to60", "h1to4", "h4to24", "d1to7", "gt7d"].every((k) => bn(k) === 1));
check("tti=15 lands in 15-60m (inclusive lower bound)", bn("m15to60") === 1);
check("censored bucket n=2", bn("censored") === 2);
check("bucket n sum === killed + censored", t3.buckets.reduce((s, b) => s + b.n, 0) === t3.killed + t3.censored);
check("shares sum ≈ 1", Math.abs(t3.buckets.reduce((s, b) => s + (b.share || 0), 0) - 1) < 1e-9);

// ── Test 4: decay by retest — anchors, medians, captures, missing anchors ──────────
console.log("\nTest 4 — decay by retest");
const perOB4 = [
    row({ obId: "1", mfeAfterR1Pips: 20, mfeAfterR2Pips: 5 }),  // R1 2.0R · R2 0.5R
    row({ obId: "2", mfeAfterR1Pips: 10 }),                      // R1 1.0R · no R2/R3
    row({ obId: "3", mfeAfterR1Pips: null }),                    // no anchors at all
];
const d4 = M.buildDecayByRetest(perOB4, [obW("1", 10), obW("2", 10), obW("3", 10)]);
const dr = (k) => d4.rows.find((r) => r.key === k);
check("available, 3 anchor rows R1/R2/R3", d4.available && d4.rows.length === 3);
check("R1: n 2, medianR 1.5", dr("R1").n === 2 && dr("R1").medianR === 1.5, JSON.stringify(dr("R1")));
check("R1: capture1R 1.0, capture2R 0.5", dr("R1").capture1R === 1 && dr("R1").capture2R === 0.5);
check("R2: n 1, medianR 0.5, capture1R 0", dr("R2").n === 1 && dr("R2").medianR === 0.5 && dr("R2").capture1R === 0);
check("R3: n 0, medianR null, captures null", dr("R3").n === 0 && dr("R3").medianR === null && dr("R3").capture1R === null);
const d4b = M.buildDecayByRetest([row({ obId: "77", mfeAfterR1Pips: 10 })], []);
check("width-less OB excluded once + reported", d4b.rows[0].n === 0 && d4b.excludedNoWidth === 1, JSON.stringify(d4b));

// ── Test 5: unavailable on v1/v2 rows (no fake zeros) ──────────────────────────────
console.log("\nTest 5 — null-gating (v1/v2 artifacts unavailable)");
const v2Rows = [{ obId: "1", touchCount: 1, retestCount: 1, finalOutcome: "invalidated_in_window", timeToInvalidationMinutes: 9, killMarginPips: null, killConfirmedTf: null, reheldAfterKill: null, mfeBeforeDeathPips: null, mfeAfterR1Pips: null, mfeAfterR2Pips: null, mfeAfterR3Pips: null }];
const v1Rows = [{ obId: "1", touchCount: 1, retestCount: 1 }];
for (const [label, rows] of [["v2", v2Rows], ["v1", v1Rows]]) {
    check(`${label}: rr curve unavailable`, M.buildRrCaptureCurve(rows, []).available === false);
    check(`${label}: tti unavailable`, M.buildTtiBuckets(rows).available === false);
    check(`${label}: decay unavailable`, M.buildDecayByRetest(rows, []).available === false);
    const s = M.buildMonetizationSummary(rows, []);
    check(`${label}: summary unavailable with reason`, s.available === false && typeof s.reason === "string" && s.medianMfeBeforeDeathR === null);
}
check("v2.1 artifact tag alone (all values null) IS available", M.buildTtiBuckets([{ obId: "1", retestArtifactVersion: 2.1, finalOutcome: "never_touched" }]).available === true);

// ── Test 6: summary umbrella composition ───────────────────────────────────────────
console.log("\nTest 6 — monetization summary");
const s6 = M.buildMonetizationSummary(perOB1, obs1);
check("available, eligibleN 4, median 0.75R", s6.available && s6.eligibleN === 4 && s6.medianMfeBeforeDeathR === 0.75);
check("composes rrCapture/ttiBuckets/decayByRetest", s6.rrCapture.available && s6.ttiBuckets.available && s6.decayByRetest.available);
check("summary medianMfeBeforeDeathR === rrCapture.medianMfeR", s6.medianMfeBeforeDeathR === s6.rrCapture.medianMfeR);

// ── result ───────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(52)}`);
console.log(`Results: ${PASS} passed, ${FAIL} failed`);
if (FAIL) { console.log(`FAILURES: ${FAIL}`); process.exit(1); }
console.log("ALL TESTS PASSED ✓");
