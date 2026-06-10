// Validation for the shared Failures aggregation engine (V4 Phase 1).
// The engine + registry use extensionless / aliased imports, so we Babel-load the
// real source modules and resolve their relative imports via a small require-shim
// (same harness style as the other failures validations).
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/failuresAggregation.validate.mjs

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

// Stubs for the two cross-package re-exports the failures modules pull in.
const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: () => "Unknown",            // session derivation not under test here
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [], dayIndex: () => null,
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const dimensions = loadCjs(`${BASE}/failuresDimensions.js`, (spec) => {
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    return {};
});
const agg = loadCjs(`${BASE}/failuresAggregation.js`, (spec) => {
    if (spec.includes("failuresDimensions")) return dimensions;
    if (spec.includes("failuresUtils")) return utils;
    return {};
});

const { aggregateFailures } = agg;
const { dimensionAvailable } = dimensions;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

// Mixed population (winners + losers) so loss-rate metrics are meaningful.
const mk = (r, direction, structureTag, severity) => ({ r, direction, structureTag, severity });
const trades = [
    ...Array.from({ length: 5 }, () => mk(-2, "short", "choch", 7)),  // big short/choch losers
    ...Array.from({ length: 5 }, () => mk(-1, "long",  "bos", 3)),    // small long/bos losers
    ...Array.from({ length: 10 }, () => mk(1, "long",  "bos", 0)),    // long/bos winners
];
// totals: 20 trades, 10 losers, totalLossR = 5*2 + 5*1 = 15, baselineLossRate = 50%

console.log("single-dimension aggregation + shares + lift");
const A = aggregateFailures(trades, { dimA: "direction", sampleFloor: 8 });
const short = A.cells.find((c) => c.keyA === "Short");
const long = A.cells.find((c) => c.keyA === "Long");
ok(A.totals.trades === 20 && A.totals.lossR === 15, "totals: 20 trades, 15 loss-R");
ok(A.totals.baselineLossRate === 50, "baseline loss rate 50%");
ok(short.count === 5 && short.lossR === 10, "short cell: 5 trades, 10 loss-R");
ok(long.count === 15 && long.lossR === 5, "long cell: 15 trades, 5 loss-R");
ok(short.tradeSharePct === 25 && approx(short.lossRSharePct, 66.7), "short trade-share 25%, loss-R-share ~66.7%");
ok(short.contributionPct === short.lossRSharePct, "contributionPct alias == lossRSharePct");
ok(approx(short.lift, 2.67, 0.05), `short lift ~2.67 over-represented (got ${short.lift})`);
ok(long.lift < 1, `long lift < 1 under-represented (got ${long.lift})`);

console.log("loss-rate lift (needs winners in population)");
ok(short.lossRate === 100, "short loss rate 100% (all short are losers)");
ok(approx(long.lossRate, 33.3), "long loss rate ~33.3% (5 of 15)");
ok(short.lossRateLift === 2 && approx(long.lossRateLift, 0.67), "loss-rate lift: short 2×, long ~0.67×");

console.log("cohort context fields (PHASE A — additive, keeps existing metrics)");
ok(short.losers === 5 && short.winners === 0 && short.totalTrades === 5, "short cohort: 5 losers / 0 winners / 5 total");
ok(long.losers === 5 && long.winners === 10 && long.totalTrades === 15, "long cohort: 5 losers / 10 winners / 15 total");
ok(short.winRate === 0 && approx(long.winRate, 66.7), "winRate: short 0%, long ~66.7%");
ok(short.baselineLossRate === 50 && long.baselineLossRate === 50, "baselineLossRate exposed per cell (50%)");
ok(short.lossRateDelta === 50 && approx(long.lossRateDelta, -16.7), "lossRateDelta: short +50, long ~-16.7 (lossRate − baseline)");
ok(short.lossSharePct === short.lossRSharePct && long.lossSharePct === long.lossRSharePct, "lossSharePct alias == lossRSharePct");
ok(short.tradeSharePct === 25 && long.tradeSharePct === 75, "tradeSharePct retained (existing metric)");
ok(short.contributionPct === short.lossSharePct, "contribution metric retained (== loss share)");

console.log("sample floor → rankable");
ok(short.rankable === false && short.lowSample === true, "short (n=5) not rankable at floor 8");
ok(long.rankable === true, "long (n=15) rankable at floor 8");

console.log("avg severity");
ok(short.avgSeverity === 7 && long.avgSeverity === 1, "avg severity: short 7, long (3+3+3+3+3+0*10)/15=1");

console.log("pair aggregation (cap 2 dims)");
const P = aggregateFailures(trades, { dimA: "direction", dimB: "structure", sampleFloor: 1 });
const sc = P.cells.find((c) => c.keyA === "Short" && c.keyB === "CHoCH");
ok(sc && sc.count === 5 && sc.lossR === 10, "pair Short·CHoCH: 5 trades, 10 loss-R");
ok(P.cells.every((c) => "keyB" in c && c.labelB === "Structure"), "pair cells carry keyB / labelB");

console.log("requireKnown (Unknown handling) + dimensionAvailable");
const noStruct = [mk(-1, "long", undefined, 2), mk(-1, "short", undefined, 2)]; // structure absent
ok(dimensionAvailable("structure", noStruct) === false, "structure dimension unavailable when absent");
const aggNoStruct = aggregateFailures(noStruct, { dimA: "structure", requireKnown: true });
ok(aggNoStruct.cells.length === 0, "requireKnown drops Unknown cells (empty result)");
const aggKeepUnknown = aggregateFailures(noStruct, { dimA: "structure", requireKnown: false });
ok(aggKeepUnknown.cells.length === 1 && aggKeepUnknown.cells[0].keyA === "Unknown", "requireKnown:false keeps an Unknown cell");

console.log("baseline behavior (losers-only input)");
const losersOnly = trades.filter((t) => t.r < 0);
const B = aggregateFailures(losersOnly, { dimA: "direction", baseline: trades, sampleFloor: 1 });
ok(B.totals.baselineLossRate === 50, "explicit baseline (all trades) → loss-rate lift still computed vs 50%");
const Bnobase = aggregateFailures(losersOnly, { dimA: "direction", sampleFloor: 1 });
ok(Bnobase.totals.baselineLossRate === 100, "no baseline + losers-only → baseline rate 100% (lossRateLift not meaningful)");

console.log("safe math (empty input)");
const E = aggregateFailures([], { dimA: "direction" });
ok(E.cells.length === 0 && E.totals.lossR === 0, "empty trades → empty cells, no division error");
const noDim = aggregateFailures(trades, {});
ok(noDim.cells.length === 0, "missing dimA → empty cells (no crash)");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
