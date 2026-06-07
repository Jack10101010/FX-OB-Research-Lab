// Validation for enabledVariantBreakdown.js (CLASSIFICATION-ENABLED-VARIANTS).
//
// Confirms, without a test framework, that:
//   1. Canonical sort: baseline → TE C0..C3 → EP → unknown (last).
//   2. Metrics: Trades / WR (BE excluded) / Net R / Avg R (BE included).
//   3. Empty / non-performance-only variants are dropped.
//   4. Labels resolve via the classification registry (TE C0..C3 wording).
//   5. Input is not mutated.
//   6. buildEnabledVariantBreakdown reads entryResults.tradesByMode (+ snake alias).
//
// Run from the frontend/ directory (Node ≥ 22 ESM):
//   node src/data/__validation__/enabledVariantBreakdown.validate.mjs

import { buildVariantRows, buildEnabledVariantBreakdown } from "../enabledVariantBreakdown.js";
import { getTagMeta } from "../classificationRegistry.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;

const T = (over) => ({ fill_time: "2026-01-01T08:00:00Z", ...over });

// Intentionally NOT in canonical order, to prove sorting.
const tradesByMode = {
    "entry_triggered_edge_25p0_d2": [   // C2 — 2 wins (+2,+2), 1 loss (-1), 1 BE(0) → n4 wr 2/3 net+3 avg+0.75
        T({ outcome: "Win",  r: 2 }), T({ outcome: "Win", r: 2 }),
        T({ outcome: "Loss", r: -1 }), T({ outcome: "Breakeven", r: 0 }),
    ],
    "entry_penetration_50p0":       [ T({ outcome: "Win", r: 1 }) ],                 // EP 50
    "baseline":                     [ T({ outcome: "Win", r: 1 }), T({ outcome: "Loss", r: -1 }) ],
    "entry_triggered_edge_25p0_same": [ T({ outcome: "Win", r: 1 }) ],              // C0
    "entry_triggered_edge_25p0_d3": [ T({ outcome: "Loss", r: -1 }) ],             // C3
    "entry_triggered_edge_25p0_next": [ T({ outcome: "Win", r: 3 }) ],             // C1
    "some_unrecognized_key":        [ T({ outcome: "Win", r: 1 }) ],               // → unknown_model (last)
    "entry_triggered_edge_25p0_d3_unfilled_only": [ { outcome: "Unfilled" }, { outcome: "Unfilled" } ], // dropped
};

const snapshot = JSON.stringify(tradesByMode);
const rows = buildVariantRows(tradesByMode);
const tags = rows.map((r) => r.tag);

console.log("canonical sort order");
ok(JSON.stringify(tags) === JSON.stringify(
    ["baseline", "te_same", "te_next", "te_d2", "te_d3", "ep_50", "unknown_model"]),
   `order = baseline, C0, C1, C2, C3, EP, unknown  (got: ${tags.join(", ")})`);
ok(tags.indexOf("ep_50") > tags.indexOf("te_d3"), "EP sorts after TE variants");
ok(tags[tags.length - 1] === "unknown_model", "unknown sorts last");

console.log("metrics");
const c2 = rows.find((r) => r.tag === "te_d2");
ok(c2.count === 4, "C2 Trades = 4 (BE included in count)");
ok(approx(c2.winRate, 2 / 3), "C2 WR = 2/3 (BE excluded from denominator)");
ok(approx(c2.netR, 3), "C2 Net R = +3");
ok(approx(c2.avgR, 0.75), "C2 Avg R = +0.75 (BE included in denominator)");

console.log("empty variants dropped");
ok(!rows.some((r) => r.key.endsWith("unfilled_only")), "all-Unfilled variant dropped (no performance trades)");
ok(rows.length === 7, "7 variants kept (8th dropped)");

console.log("labels resolve via registry");
ok(c2.label === getTagMeta("te_d2").label && c2.label === "TE C2 (+2 Delay)", 'C2 label = "TE C2 (+2 Delay)"');
ok(rows.find((r) => r.tag === "te_same").label === "TE C0 (Same Candle)", "C0 label correct");
ok(rows.find((r) => r.tag === "ep_50").label === "EP 50%", "EP label correct");
ok(rows.every((r) => r.tooltipKey === r.tag), "tooltipKey === tag for every row");

console.log("no input mutation");
ok(JSON.stringify(tradesByMode) === snapshot, "buildVariantRows did not mutate its input");

console.log("buildEnabledVariantBreakdown reads entryResults.tradesByMode");
const fromCamel = buildEnabledVariantBreakdown({ entryResults: { tradesByMode } });
ok(fromCamel.length === 7, "reads bundle.entryResults.tradesByMode");
const fromSnake = buildEnabledVariantBreakdown({ entry_results: { trades_by_mode: tradesByMode } });
ok(fromSnake.length === 7, "reads bundle.entry_results.trades_by_mode (snake alias)");
ok(buildEnabledVariantBreakdown({}).length === 0, "empty bundle → []");
ok(buildEnabledVariantBreakdown(null).length === 0, "null bundle → [] (no throw)");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
