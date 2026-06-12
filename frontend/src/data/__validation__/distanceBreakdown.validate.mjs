// distanceBreakdown.validate.mjs — pure distance-at-arm breakdown.
//
// Verifies bucketing (incl. 0→occupied and blank→unknown), dual-key field reading,
// metric aggregation, low-sample flag, and empty-input safety.
//
// Run from frontend/:  node src/data/__validation__/distanceBreakdown.validate.mjs

import babel from "@babel/core";
import fs from "fs";

function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    // distanceBreakdown.js has no imports, so the require shim is never invoked.
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { buildDistanceAtArmBreakdown, distanceBucketKey, distanceAtArmOf } =
    loadCjs("src/data/distanceBreakdown.js");

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ FAIL: ${msg}`); } };
const approx = (a, b, e = 0.001) => Math.abs(Number(a) - Number(b)) <= e;

// ── Fixtures ─────────────────────────────────────────────────────────────────
// `d` = price_distance_from_ob_at_arm_pips (snake) unless noted; `r` = realized R.
const t = (d, r, extra = {}) => ({ price_distance_from_ob_at_arm_pips: d, r, ...extra });

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  bucket boundaries (distanceBucketKey)");
ok(distanceBucketKey(0) === "occupied", "0 → occupied");
ok(distanceBucketKey(0.1) === "edge", "0.1 → edge");
ok(distanceBucketKey(1.9) === "edge", "1.9 → edge");
ok(distanceBucketKey(2) === "two_to_five", "2 → two_to_five");
ok(distanceBucketKey(4.9) === "two_to_five", "4.9 → two_to_five");
ok(distanceBucketKey(5) === "five_plus", "5 → five_plus");
ok(distanceBucketKey(11.7) === "five_plus", "11.7 → five_plus");
ok(distanceBucketKey(null) === "unknown", "null → unknown");
ok(distanceBucketKey(undefined) === "unknown", "undefined → unknown");
ok(distanceBucketKey("") === "unknown", "blank → unknown");
ok(distanceBucketKey("abc") === "unknown", "non-numeric → unknown");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  dual-key field read (camel + snake)");
ok(distanceAtArmOf({ price_distance_from_ob_at_arm_pips: 3 }) === 3, "snake_case read");
ok(distanceAtArmOf({ priceDistanceFromObAtArmPips: 4 }) === 4, "camelCase read");
ok(distanceAtArmOf({}) === null, "absent → null");
ok(distanceAtArmOf({ price_distance_from_ob_at_arm_pips: "" }) === null, "blank → null");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  bucketing of a mixed set");
const rows = [
    t(0, -1), t(0, -1), t(0, 3),            // occupied: 2 loss, 1 win
    t(0.1, 2), t(1.9, -1),                  // edge: 1 win, 1 loss
    t(2, 3), t(4.9, -1),                    // 2-5: 1 win, 1 loss
    t(5, 4), t(11.7, -1),                   // 5+: 1 win, 1 loss
    t(null, -1), t("", 2), {},              // unknown: distances missing → 3 rows (1L,1W,1 no-r=0)
];
const b = buildDistanceAtArmBreakdown(rows);
ok(b.buckets.occupied.count === 3 && b.buckets.occupied.wins === 1 && b.buckets.occupied.losses === 2, "occupied 3 (1W/2L)");
ok(b.buckets.edge.count === 2 && b.buckets.edge.wins === 1 && b.buckets.edge.losses === 1, "edge 2 (1W/1L)");
ok(b.buckets.two_to_five.count === 2, "two_to_five 2");
ok(b.buckets.five_plus.count === 2, "five_plus 2");
ok(b.buckets.unknown.count === 3, "unknown 3 (null + '' + {})");
ok(b.total === 12 && b.usable === 9 && b.unknownCount === 3, "total 12 · usable 9 · unknown 3");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  metric aggregation (occupied bucket: r = -1,-1,3)");
const occ = b.buckets.occupied;
ok(approx(occ.netR, 1), "occupied netR = +1");
ok(approx(occ.avgR, 1 / 3), "occupied avgR = +0.33");
ok(approx(occ.winRate, 1 / 3), "occupied WR = 1/3 (1 of 3 decided)");

// breakeven excluded from W/L denominator
const beSet = buildDistanceAtArmBreakdown([t(0, 1), t(0, -1), t(0, 0)]);
ok(beSet.buckets.occupied.count === 3 && beSet.buckets.occupied.wins === 1 && beSet.buckets.occupied.losses === 1,
   "breakeven (r=0) counted in count but not W/L");
ok(approx(beSet.buckets.occupied.winRate, 0.5), "WR = 1/2 (breakeven excluded from denom)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  low-sample flag (decided < threshold)");
ok(b.buckets.occupied.lowSample === true, "occupied (3 decided) low-sample with default 10");
const big = buildDistanceAtArmBreakdown(Array.from({ length: 12 }, () => t(0, 1)));
ok(big.buckets.occupied.lowSample === false, "12 decided → not low-sample");
const custom = buildDistanceAtArmBreakdown([t(0, 1), t(0, 1)], { lowSampleThreshold: 2 });
ok(custom.buckets.occupied.lowSample === false, "threshold honored (2 decided, threshold 2 → not low)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  availability gating");
ok(b.available === true, "available when a non-unknown bucket has trades");
const allUnknown = buildDistanceAtArmBreakdown([t(null, -1), t("", 2), {}]);
ok(allUnknown.available === false && allUnknown.usable === 0 && allUnknown.unknownCount === 3,
   "all-unknown (non-TE run) → available false");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  empty / safe input + camel field");
const empty = buildDistanceAtArmBreakdown([]);
ok(empty.total === 0 && empty.available === false && empty.buckets.occupied.count === 0, "empty input safe");
ok(buildDistanceAtArmBreakdown(null).total === 0, "null input safe");
const camel = buildDistanceAtArmBreakdown([{ priceDistanceFromObAtArmPips: 6, net_r: 2 }]);
ok(camel.buckets.five_plus.count === 1 && approx(camel.buckets.five_plus.netR, 2),
   "camelCase distance + net_r R-field read");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
