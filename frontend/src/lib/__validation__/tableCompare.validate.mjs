// Lightweight validation for the Table Compare delta engine (Phase TC-1).
//
// Standalone Node script (no jest) confirming:
//   1. Row matching by stable key (BOS / CHoCH / Limited Data).
//   2. only_current / only_compared statuses (no coercion to 0).
//   3. Delta math (current − compared) for netR / winRate(pp) / expectancy / count.
//   4. Profit Factor safety: undefined (∞ / null) PF → Δ null → "—".
//   5. Summary counts + countDivergencePct.
//
// Run:  node frontend/src/lib/__validation__/tableCompare.validate.mjs

import {
    buildTableComparison,
    compareBucketRows,
    computeMetricDelta,
    formatCompareDelta,
    COMPARE_METRIC_DEFS,
} from "../tableCompare.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 1e-9) =>
    (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps);

// Legacy finalizeBucket-shaped rows (what OrderBlockLab passes as currentRows).
// Side A (current run)
const A = [
    { label: "BOS",          count: 100, wins: 60, losses: 40, netR: 30.0, winRate: 60.0, expectancy: 0.30, profitFactor: 1.50 },
    { label: "CHoCH",        count: 50,  wins: 20, losses: 30, netR: -5.0, winRate: 40.0, expectancy: -0.10, profitFactor: 0.80 },
    { label: "Limited Data", count: 3,   wins: 2,  losses: 1,  netR: 1.0,  winRate: 66.7, expectancy: 0.33, profitFactor: null }, // PF ∞ (no losses scenario stand-in)
];
// Side B (compared run): BOS improved, CHoCH worse, no Limited Data, extra "Sweep"
const B = [
    { label: "BOS",   count: 120, wins: 78, losses: 42, netR: 42.0, winRate: 65.0, expectancy: 0.35, profitFactor: 1.80 },
    { label: "CHoCH", count: 40,  wins: 14, losses: 26, netR: -9.0, winRate: 35.0, expectancy: -0.225, profitFactor: 0.60 },
    { label: "Sweep", count: 10,  wins: 6,  losses: 4,  netR: 4.0,  winRate: 60.0, expectancy: 0.40, profitFactor: 1.40 },
];

console.log("\n[1] Row matching + status");
const cmp = buildTableComparison({ currentRows: A, comparedRows: B, rowKey: "label" });
const byKey = Object.fromEntries(cmp.rows.map((r) => [r.key, r]));
ok(cmp.rows.length === 4, `4 rows total (BOS, CHoCH, Limited Data, Sweep) — got ${cmp.rows.length}`);
ok(byKey.BOS?.status === "matched", "BOS matched");
ok(byKey.CHoCH?.status === "matched", "CHoCH matched");
ok(byKey["Limited Data"]?.status === "only_current", "Limited Data only_current");
ok(byKey.Sweep?.status === "only_compared", "Sweep only_compared");
// current order preserved, compared-only appended last
ok(cmp.rows[0].key === "BOS" && cmp.rows[3].key === "Sweep", "current order preserved; compared-only appended");

console.log("\n[2] Delta math (current − compared)");
ok(approx(byKey.BOS.deltas.netR.value, 30.0 - 42.0), `BOS Δ netR = -12 (got ${byKey.BOS.deltas.netR.value})`);
ok(approx(byKey.BOS.deltas.winRate.value, 60.0 - 65.0), `BOS Δ WR = -5pp (got ${byKey.BOS.deltas.winRate.value})`);
ok(approx(byKey.BOS.deltas.expectancy.value, 0.30 - 0.35), `BOS Δ exp = -0.05 (got ${byKey.BOS.deltas.expectancy.value})`);
ok(approx(byKey.BOS.deltas.count.value, 100 - 120), `BOS Δ count = -20 (got ${byKey.BOS.deltas.count.value})`);
ok(approx(byKey.CHoCH.deltas.netR.value, -5.0 - -9.0), `CHoCH Δ netR = +4 (got ${byKey.CHoCH.deltas.netR.value})`);

console.log("\n[3] better/direction semantics");
ok(byKey.BOS.deltas.netR.better === false, "BOS Δ netR worse (current < compared, higherBetter)");
ok(byKey.CHoCH.deltas.netR.better === true, "CHoCH Δ netR better (current > compared)");
ok(byKey.BOS.deltas.count.better === null, "Δ count is neutral (no better/worse)");

console.log("\n[4] only_* rows carry null deltas (no coercion to 0)");
ok(byKey["Limited Data"].deltas.netR.value === null, "Limited Data Δ netR is null");
ok(byKey.Sweep.deltas.winRate.value === null, "Sweep Δ WR is null");
ok(formatCompareDelta(COMPARE_METRIC_DEFS.netR, byKey.Sweep.deltas.netR) === "—", "null delta formats as —");

console.log("\n[5] Profit Factor safety (∞ / null PF → null Δ)");
const pfDelta = computeMetricDelta(COMPARE_METRIC_DEFS.profitFactor,
    { profitFactor: null }, { profitFactor: 1.2 });
ok(pfDelta.value === null, "PF Δ vs null(∞) is null");
const pfDelta2 = computeMetricDelta(COMPARE_METRIC_DEFS.profitFactor,
    { profitFactor: Infinity }, { profitFactor: 1.2 });
ok(pfDelta2.value === null, "PF Δ vs Infinity is null");
const pfDelta3 = computeMetricDelta(COMPARE_METRIC_DEFS.profitFactor,
    { profitFactor: 1.8 }, { profitFactor: 1.5 });
ok(approx(pfDelta3.value, 0.3), `defined PF Δ computes (got ${pfDelta3.value})`);

console.log("\n[6] Summary");
ok(cmp.summary.matched === 2, `2 matched (got ${cmp.summary.matched})`);
ok(cmp.summary.onlyCurrent === 1, `1 only-current (got ${cmp.summary.onlyCurrent})`);
ok(cmp.summary.onlyCompared === 1, `1 only-compared (got ${cmp.summary.onlyCompared})`);
ok(cmp.summary.countCurrent === 153 && cmp.summary.countCompared === 170,
    `count totals A=153 B=170 (got A=${cmp.summary.countCurrent} B=${cmp.summary.countCompared})`);
// divergence = |153-170| / max = 17/170 = 10.0%
ok(approx(cmp.summary.countDivergencePct, 10.0, 0.05), `countDivergencePct ≈ 10.0 (got ${cmp.summary.countDivergencePct})`);

console.log("\n[7] Format conventions");
ok(formatCompareDelta(COMPARE_METRIC_DEFS.netR, byKey.BOS.deltas.netR) === "-12.0R", "netR fmt -12.0R");
ok(formatCompareDelta(COMPARE_METRIC_DEFS.winRate, byKey.BOS.deltas.winRate) === "-5.0pp", "WR fmt pp");
ok(formatCompareDelta(COMPARE_METRIC_DEFS.count, byKey.BOS.deltas.count) === "-20", "count fmt integer");

console.log("\n[8] compareBucketRows convenience");
const rowsOnly = compareBucketRows(A, B, { rowKey: "label" });
ok(Array.isArray(rowsOnly) && rowsOnly.length === 4, "compareBucketRows returns matched rows array");

console.log("\n[9] Empty / defensive inputs");
const emptyCmp = buildTableComparison({ currentRows: [], comparedRows: [] });
ok(emptyCmp.rows.length === 0 && emptyCmp.summary.matched === 0, "empty inputs → empty comparison");
const oneSide = buildTableComparison({ currentRows: A, comparedRows: [] });
ok(oneSide.rows.every((r) => r.status === "only_current"), "no compared rows → all only_current");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✓" : `${failures} CHECK(S) FAILED ✗`}\n`);
process.exit(failures === 0 ? 0 : 1);
