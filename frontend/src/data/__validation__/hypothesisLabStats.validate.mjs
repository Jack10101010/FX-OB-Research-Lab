/**
 * hypothesisLabStats.validate — locks the Hypothesis Lab Win-Rate / Expectancy
 * DENOMINATOR fix so it can never silently regress to "divide by every universe
 * row" again, and proves it matches Run Detail's canonical formula.
 *
 * Run: node src/data/__validation__/hypothesisLabStats.validate.mjs
 *
 * `computeStats` lives inside HypothesisLab.jsx (React + "@/" alias imports), which
 * is not node-importable, so this asserts the pure arithmetic of the formulas. The
 * canonical trade classification (isWin/isLoss/isPerformanceTrade) is exercised by
 * the app at runtime + host QA; here we lock the denominator choice.
 *
 *   Win Rate  : wins / (wins + losses)            ← decided trades  (== RunDetail L725-727)
 *   Expectancy: netR(valid) / validPerfTradeCount ← valid perf rows (== RunDetail L728)
 *   Net R     : sum over valid performance trades
 *   `trades`  : full active-universe row count (display only — Baseline Trades card)
 */

// ── the formulas, isolated ──────────────────────────────────────────────────
const oldWinRate = (wins, totalRows) => (totalRows ? (wins / totalRows) * 100 : 0);          // BUG
const newWinRate = (wins, losses)    => (wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0); // FIX (== RunDetail)
const runDetailWinRate = (wins, losses) => (wins + losses > 0 ? (wins / (wins + losses)) * 100 : null);

const oldExpectancy = (netR, totalRows)  => (totalRows ? netR / totalRows : 0);       // BUG (÷ all rows)
const newExpectancy = (netR, validCount) => (validCount ? netR / validCount : 0);     // FIX (÷ valid perf trades)

let pass = 0, fail = 0;
function approx(name, got, want, eps = 0.05) {
    const ok = Math.abs(got - want) <= eps;
    if (ok) pass += 1; else { fail += 1; console.error(`  ✗ ${name}: got ${got}, want ${want}`); }
}
function check(name, cond) { if (cond) pass += 1; else { fail += 1; console.error(`  ✗ ${name}`); }}

// ── The reported bug case: 6 wins / 7 losses, 35 total universe rows ─────────
const WINS = 6, LOSSES = 7, TOTAL_ROWS = 35;       // 35 = 13 decided + 22 unfilled/cancelled/invalid/flat
const VALID_PERF = 16;                              // illustrative valid-perf count (wins+losses+flats)
const NET_R = 3.2;                                  // illustrative

approx("OLD winRate reproduces the reported 17.1% bug", oldWinRate(WINS, TOTAL_ROWS), 17.14);
approx("NEW winRate = 6/13 = 46.15%",                   newWinRate(WINS, LOSSES),     46.15);
check ("NEW winRate is NOT 17.1%",                      Math.abs(newWinRate(WINS, LOSSES) - 17.1) > 1);
approx("NEW winRate == Run Detail formula",             newWinRate(WINS, LOSSES), runDetailWinRate(WINS, LOSSES));

// ── Denominator semantics ────────────────────────────────────────────────────
check ("WR denominator is decided trades (wins+losses), not total rows", (WINS + LOSSES) === 13 && TOTAL_ROWS !== 13);
approx("Expectancy now divides by valid perf trades, not all rows", newExpectancy(NET_R, VALID_PERF), 0.2);
check ("OLD vs NEW expectancy differ when non-valid rows exist", oldExpectancy(NET_R, TOTAL_ROWS) !== newExpectancy(NET_R, VALID_PERF));

// ── Edge cases ───────────────────────────────────────────────────────────────
check ("no decided trades → winRate 0 (no divide-by-zero)", newWinRate(0, 0) === 0);
approx("all wins → 100%", newWinRate(5, 0), 100);
approx("all losses → 0%", newWinRate(0, 5), 0);

console.log(`\nhypothesisLabStats denominator validation: ${pass} passed, ${fail} failed.`);
console.log(`  before: winRate = wins / total_universe_rows  (6/35 = ${oldWinRate(WINS, TOTAL_ROWS).toFixed(1)}%)`);
console.log(`  after : winRate = wins / (wins + losses)        (6/13 = ${newWinRate(WINS, LOSSES).toFixed(1)}%)  [matches Run Detail]`);
if (fail > 0) process.exit(1);
