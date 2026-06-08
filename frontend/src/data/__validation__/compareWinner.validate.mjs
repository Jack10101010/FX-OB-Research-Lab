// Validation for compareWinner.js (MODEL-FAMILY-COMPARISON-2D).
//
// compareWinner.js is a verbatim extraction of the COCKPIT-2A explainable-winner logic
// from ComparisonLab.jsx. These fixtures are the behavior spec; passing them proves the
// relocation preserved behavior. Pure module → node-testable, no framework.
//
// Branches covered:
//   1. clear winner (sweeps all metrics)
//   2. a metric tie awards that metric to nobody
//   3. no metric leader → Net R fallback (else branch)
//   4. equal win-count → tie-break by Net R
//   5. smallSample true when winner trades < 0.5 × maxTrades
//   6. otherLeads grouping (per-index labels)
//   7. empty / undefined input guard
//   8. non-finite / null metric values skipped
//   9. fallback is crash-safe when Net R is non-finite
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/compareWinner.validate.mjs

import { computeExplainableWinner, WINNER_METRICS } from "../compareWinner.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

console.log("WINNER_METRICS shape");
ok(Array.isArray(WINNER_METRICS) && WINNER_METRICS.length === 5, "5 metrics exported");
ok(sameSet(WINNER_METRICS.map((m) => m.key), ["netR", "winRate", "pf", "maxDd", "validation"]),
    "metric keys: netR/winRate/pf/maxDd/validation");

console.log("1. clear winner (sweeps all metrics)");
{
    const w = computeExplainableWinner([
        { netR: 10, winRate: 60, pf: 2.0, maxDd: -1, validation: 90, trades: 100 },
        { netR: 5,  winRate: 50, pf: 1.5, maxDd: -3, validation: 80, trades: 100 },
    ]);
    ok(w.winnerIdx === 0, "Run0 is the winner");
    ok(w.winnerWinCount === 5, "Run0 wins all 5 metrics");
    ok(w.totalMetrics === 5, "totalMetrics = 5");
    ok(w.winnerLabels.length === 5, "winnerLabels lists all 5");
    ok(w.otherLeads.length === 0, "no otherLeads when one run sweeps");
    ok(w.smallSample === false, "equal trade counts → not small sample");
}

console.log("2. a metric tie awards that metric to nobody");
{
    const w = computeExplainableWinner([
        { netR: 5, winRate: 60, pf: 2.0, maxDd: -1, validation: 90, trades: 50 },
        { netR: 5, winRate: 50, pf: 1.5, maxDd: -3, validation: 80, trades: 50 },
    ]);
    // netR ties (5 vs 5) → awarded to nobody; Run0 wins the other 4.
    ok(w.winnerIdx === 0, "Run0 wins overall");
    ok(w.winnerWinCount === 4, "winner has 4 metric wins (Net R tie awarded to nobody)");
    ok(!w.winnerLabels.includes("Net R"), "Net R is NOT among winnerLabels (it tied)");
    ok(sameSet(w.winnerLabels, ["Win Rate", "Profit Factor", "Max DD", "Validation"]),
        "winnerLabels = the 4 decisive metrics");
}

console.log("3. no metric leader → Net R fallback (else branch)");
{
    const w = computeExplainableWinner([
        { netR: 5, winRate: 50, pf: 1.5, maxDd: -2, validation: 80, trades: 30 },
        { netR: 5, winRate: 50, pf: 1.5, maxDd: -2, validation: 80, trades: 30 },
    ]);
    // Every metric ties → no awards → fallback to pure Net R winner (first max → idx 0).
    ok(w.winnerWinCount === 0, "no metric awarded (winnerWinCount 0)");
    ok(w.winnerLabels.length === 0, "winnerLabels empty under fallback");
    ok(w.winnerIdx === 0, "fallback picks the Net R max (idx 0 on a tie)");
}

console.log("4. equal win-count → tie-break by Net R (3 runs)");
{
    const w = computeExplainableWinner([
        { netR: 3, winRate: 70, pf: 3.0, maxDd: -5, validation: 70, trades: 40 }, // wins winRate, pf
        { netR: 6, winRate: 50, pf: 1.2, maxDd: -1, validation: 95, trades: 40 }, // wins maxDd, validation; higher netR than Run0
        { netR: 9, winRate: 40, pf: 1.0, maxDd: -8, validation: 60, trades: 40 }, // wins netR only
    ]);
    // winsCount = [2,2,1]; Run0 & Run1 tie at 2 → tie-break by Net R (6 > 3) → Run1.
    ok(w.winnerIdx === 1, "tie-break by Net R selects Run1 (netR 6 > Run0 netR 3)");
    ok(w.winnerWinCount === 2, "winner has 2 metric wins");
    ok(sameSet(w.winnerLabels, ["Max DD", "Validation"]), "Run1 won Max DD + Validation");
}

console.log("6. otherLeads grouping (per-index labels)");
{
    const w = computeExplainableWinner([
        { netR: 3, winRate: 70, pf: 3.0, maxDd: -5, validation: 70, trades: 40 },
        { netR: 6, winRate: 50, pf: 1.2, maxDd: -1, validation: 95, trades: 40 },
        { netR: 9, winRate: 40, pf: 1.0, maxDd: -8, validation: 60, trades: 40 },
    ]);
    // winner is Run1; otherLeads = Run0 (Win Rate, Profit Factor) + Run2 (Net R).
    const byIdx = {};
    for (const o of w.otherLeads) (byIdx[o.idx] = byIdx[o.idx] || []).push(o.label);
    ok(sameSet(byIdx[0] || [], ["Win Rate", "Profit Factor"]), "Run0 leads Win Rate & Profit Factor");
    ok(sameSet(byIdx[2] || [], ["Net R"]), "Run2 leads Net R");
    ok(!(1 in byIdx), "winner (Run1) not listed in otherLeads");
}

console.log("5. smallSample true when winner trades < 0.5 × maxTrades");
{
    const w = computeExplainableWinner([
        { netR: 100, winRate: 90, pf: 5.0, maxDd: -1, validation: 99, trades: 10 },  // dominant but tiny
        { netR: 1,   winRate: 40, pf: 1.0, maxDd: -9, validation: 50, trades: 100 },
    ]);
    ok(w.winnerIdx === 0, "dominant run wins despite tiny sample");
    ok(w.smallSample === true, "smallSample true (10 < 0.5 × 100)");
    ok(w.winnerTrades === 10, "winnerTrades reported = 10");
    ok(w.maxTrades === 100, "maxTrades reported = 100");
}

console.log("7. empty / undefined input guard");
{
    const empty = computeExplainableWinner([]);
    ok(empty.winnerIdx === 0 && empty.winnerWinCount === 0 && empty.totalMetrics === 5, "empty array → safe default shape");
    ok(empty.winnerLabels.length === 0 && empty.otherLeads.length === 0, "empty arrays for labels/leads");
    ok(empty.winnerTrades === null && empty.maxTrades === 0 && empty.smallSample === false, "null/0/false defaults");
    const undef = computeExplainableWinner(undefined);
    ok(undef.winnerIdx === 0 && undef.totalMetrics === 5, "undefined input → same safe default (no throw)");
}

console.log("8. non-finite / null metric values skipped");
{
    const w = computeExplainableWinner([
        { netR: null, winRate: 60, pf: undefined, maxDd: -2, validation: NaN, trades: 20 },
        { netR: 5,    winRate: 50, pf: 1.5,       maxDd: -1, validation: 80,  trades: 20 },
    ]);
    // Run1 wins netR/pf/maxDd/validation (Run0 non-finite skipped); Run0 wins winRate only.
    ok(w.winnerIdx === 1, "Run1 wins (non-finite Run0 values skipped)");
    ok(w.winnerWinCount === 4, "Run1 wins 4 metrics");
    const byIdx = {};
    for (const o of w.otherLeads) (byIdx[o.idx] = byIdx[o.idx] || []).push(o.label);
    ok(sameSet(byIdx[0] || [], ["Win Rate"]), "Run0 leads only Win Rate (its sole finite advantage)");
}

console.log("9. fallback crash-safe when Net R is non-finite");
{
    const w = computeExplainableWinner([
        { netR: null, winRate: 50, pf: 1.0, maxDd: -2, validation: 70, trades: 5 },
        { netR: null, winRate: 50, pf: 1.0, maxDd: -2, validation: 70, trades: 5 },
    ]);
    // netR skipped both; all else ties → no awards → fallback; netROrNegInf(-Inf) → idx 0, no throw.
    ok(w.winnerIdx === 0, "fallback returns idx 0 when all Net R non-finite");
    ok(w.winnerWinCount === 0, "no metric awarded");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
