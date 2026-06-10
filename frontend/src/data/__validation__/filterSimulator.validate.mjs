// Validation for the Failures Lab V5 filter-discovery simulator (truth layer).
// Babel-loads the real source modules with a require-shim (same harness style as
// failuresAggregation.validate.mjs).
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/filterSimulator.validate.mjs
//
// Required coverage (V5 Phase 1 spec):
//   1. Cohort removal removes only matching trades.
//   2. Metrics recompute correctly.
//   3. Net R calculations are correct.
//   4. Win rate recalculates correctly.
//   5. Empty cohort safe.
//   6. Cohort removing only winners behaves correctly.
//   7. Cohort removing only losers behaves correctly.
//   8. No mutation of source trades.
// Plus: recommendation thresholds · discovery ranking / pairs / topN · quick cards.

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

// entryFormatters shim — sessionOf maps the synthetic `entry` marker directly so
// the real session dimension is exercisable without timestamp plumbing.
const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: (e) => (e === "A" ? "Asia" : e === "N" ? "New York" : "Unknown"),
    parseDate: () => null,
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [], dayIndex: () => null,
    num: Number, round1: (v) => Number(Number(v).toFixed(1)), round2: (v) => Number(Number(v).toFixed(2)),
    fmtR: String, fmtPct: String, fmtMaybeR: String, fmtMaybePct: String,
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const dimensions = loadCjs(`${BASE}/failuresDimensions.js`, (spec) => {
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    return {};
});
const sim = loadCjs(`${BASE}/filterSimulator.js`, (spec) => {
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresDimensions")) return dimensions;
    return {};
});

const {
    metricsOf, simulateRemoval, cohortMatcher, cohortLabel,
    recommendFilter, buildFilterDiscovery, bestFiltersByDimension,
    REC_SAMPLE_FLOOR,
} = sim;

let failures = 0;
function ok(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ ${msg}`); }
}
function eq(actual, expected, msg) {
    const pass = actual === expected;
    if (!pass) { failures += 1; console.error(`  ✗ ${msg} (expected ${expected}, got ${actual})`); }
    else { console.log(`  ✓ ${msg}`); }
}

// ── Fixture ───────────────────────────────────────────────────────────────────
// Asia: 5 losers @ −1R, 1 winner @ +0.5R  → removing Asia: save 5R, lose 0.5R, net +4.5R
// New York: 4 winners @ +2R, 2 losers @ −1R → removing NY: save 2R, lose 8R, net −6R
// Totals: 12 trades · 5W/7L · +8.5R / −7R · net +1.5R · WR 41.7%
const mk = (session, direction, structure, r, i) => Object.freeze({
    id: `${session}${i}`, entry: session, direction, structure, r,
});
const TRADES = Object.freeze([
    mk("A", "long", "choch", -1, 1),
    mk("A", "long", "choch", -1, 2),
    mk("A", "long", "bos", -1, 3),
    mk("A", "short", "bos", -1, 4),
    mk("A", "short", "choch", -1, 5),
    mk("A", "short", "bos", 0.5, 6),
    mk("N", "long", "bos", 2, 7),
    mk("N", "long", "choch", 2, 8),
    mk("N", "short", "bos", 2, 9),
    mk("N", "short", "choch", 2, 10),
    mk("N", "long", "bos", -1, 11),
    mk("N", "short", "choch", -1, 12),
]);
const SNAPSHOT = JSON.stringify(TRADES);
const asiaMatch = cohortMatcher({ dimA: "session", keyA: "Asia" });

console.log("metricsOf (baseline)");
{
    const m = metricsOf(TRADES);
    eq(m.trades, 12, "trades = 12");
    eq(m.winners, 5, "winners = 5");
    eq(m.losers, 7, "losers = 7");
    eq(m.posR, 8.5, "posR = 8.5");
    eq(m.negR, 7, "negR = 7");
    eq(m.netR, 1.5, "netR = 1.5");
    eq(m.winRate, 41.7, "winRate = 41.7");
    eq(m.profitFactor, 1.21, "PF = 1.21");
    const e = metricsOf([]);
    ok(e.trades === 0 && e.netR === 0 && e.winRate === 0 && e.profitFactor === null, "empty population → zeros, PF null");
}

console.log("1. cohort removal removes ONLY matching trades");
{
    const s = simulateRemoval(TRADES, asiaMatch);
    eq(s.tradesRemoved, 6, "Asia cohort removes exactly 6 trades");
    eq(s.after.trades, 6, "6 trades remain");
    ok(s.tradesRemoved + s.after.trades === TRADES.length, "removed + kept = total (no trade lost or duplicated)");
    const none = simulateRemoval(TRADES, cohortMatcher({ dimA: "session", keyA: "London" }));
    eq(none.tradesRemoved, 0, "non-matching cohort (London) removes 0 trades");
    // matcher precision: only trades whose accessor equals the key
    eq(TRADES.filter(asiaMatch).length, 6, "matcher hits exactly the 6 Asia trades");
}

console.log("2. metrics recompute correctly from REMAINING trades");
{
    const s = simulateRemoval(TRADES, asiaMatch);
    eq(s.after.winners, 4, "after: winners = 4");
    eq(s.after.losers, 2, "after: losers = 2");
    eq(s.after.posR, 8, "after: posR = 8");
    eq(s.after.negR, 2, "after: negR = 2");
    eq(s.after.netR, 6, "after: netR = 6");
    eq(s.after.profitFactor, 4, "after: PF = 4");
}

console.log("3. net R calculations are correct (both sides, actual Rs)");
{
    const s = simulateRemoval(TRADES, asiaMatch);
    eq(s.lossRRemoved, 5, "loss R removed (saved) = 5");
    eq(s.winnerRRemoved, 0.5, "winner R removed (lost) = 0.5");
    eq(s.netRImpact, 4.5, "netRImpact = +4.5");
    ok(Math.abs(s.netRImpact - (s.after.netR - s.before.netR)) < 1e-9, "netRImpact ≡ after.netR − before.netR");
    ok(Math.abs(s.netRImpact - (s.lossRRemoved - s.winnerRRemoved)) < 1e-9, "netRImpact ≡ lossRRemoved − winnerRRemoved");
    const bad = simulateRemoval(TRADES, cohortMatcher({ dimA: "session", keyA: "New York" }));
    eq(bad.netRImpact, -6, "removing New York = −6R (winners cost more than losses saved)");
    eq(s.contributionPct, 71.4, "Asia carries 71.4% of total loss R");
}

console.log("4. win rate recalculates correctly");
{
    const s = simulateRemoval(TRADES, asiaMatch);
    eq(s.before.winRate, 41.7, "before WR = 41.7%");
    eq(s.after.winRate, 66.7, "after WR = 66.7% (4W of 6)");
    eq(s.winRateChange, 25, "WR change = +25.0 pts");
}

console.log("5. empty cohort safe");
{
    const s = simulateRemoval(TRADES, () => false);
    eq(s.tradesRemoved, 0, "no trades removed");
    eq(s.netRImpact, 0, "netRImpact = 0");
    ok(s.before.netR === s.after.netR && s.before.winRate === s.after.winRate, "before == after");
    eq(recommendFilter(s).key, "neutral", "recommendation = neutral");
    const onEmpty = simulateRemoval([], asiaMatch);
    ok(onEmpty.tradesRemoved === 0 && onEmpty.netRImpact === 0 && onEmpty.pfBefore === null, "empty trade list safe");
    ok(simulateRemoval(null, asiaMatch).tradesRemoved === 0, "null trade list safe");
}

console.log("6. cohort removing ONLY winners");
{
    const s = simulateRemoval(TRADES, (t) => t.r > 0);
    eq(s.winnersRemoved, 5, "5 winners removed");
    eq(s.losersRemoved, 0, "0 losers removed");
    eq(s.lossRRemoved, 0, "0 loss R saved");
    eq(s.netRImpact, -8.5, "netRImpact = −8.5 (pure cost)");
    eq(s.after.winRate, 0, "after WR = 0%");
    eq(s.after.profitFactor, 0, "after PF = 0 (no profit, losses remain)");
    eq(recommendFilter(s).key, "neutral", "recommendation = neutral (never disable a winner cohort)");
}

console.log("7. cohort removing ONLY losers");
{
    const s = simulateRemoval(TRADES, (t) => t.r < 0);
    eq(s.losersRemoved, 7, "7 losers removed");
    eq(s.winnersRemoved, 0, "0 winners removed");
    eq(s.netRImpact, 7, "netRImpact = +7 (all loss R saved)");
    eq(s.after.winRate, 100, "after WR = 100%");
    ok(s.pfAfter === null && s.after.posR > 0, "after PF = null (no losses → render ∞)");
    eq(s.contributionPct, 100, "contribution = 100%");
}

console.log("8. no mutation of source trades");
{
    // Trade objects and the array are frozen; a mutating implementation would throw
    // in strict mode or change the snapshot. Run every public entry point.
    simulateRemoval(TRADES, asiaMatch);
    buildFilterDiscovery(TRADES);
    metricsOf(TRADES);
    ok(JSON.stringify(TRADES) === SNAPSHOT, "trades unchanged after all engine calls (frozen + snapshot)");
}

console.log("recommendation thresholds");
{
    const base = { tradesRemoved: 20, losersRemoved: 10, winnersRemoved: 2 };
    eq(recommendFilter({ ...base, netRImpact: 4, lossRRemoved: 5, winnerRRemoved: 1 }).key, "strong_disable", "≥3R + sample + cheap winners → Strong Disable");
    eq(recommendFilter({ ...base, netRImpact: 4, lossRRemoved: 5, winnerRRemoved: 3.5 }).key, "test_disable", "≥3R but winner cost >50% of saved → capped at Test Disable");
    eq(recommendFilter({ ...base, netRImpact: 2, lossRRemoved: 3, winnerRRemoved: 1 }).key, "test_disable", "≥1.5R + sample → Test Disable");
    eq(recommendFilter({ ...base, netRImpact: 4, losersRemoved: 3, lossRRemoved: 4, winnerRRemoved: 0 }).key, "watchlist", "big net R but thin sample → capped at Watchlist");
    eq(recommendFilter({ ...base, netRImpact: 0.7, lossRRemoved: 1, winnerRRemoved: 0.3 }).key, "watchlist", "small positive → Watchlist");
    eq(recommendFilter({ ...base, netRImpact: 0.2, lossRRemoved: 1, winnerRRemoved: 0.8 }).key, "neutral", "≈0 → Neutral");
    eq(recommendFilter({ ...base, netRImpact: -2, lossRRemoved: 1, winnerRRemoved: 3 }).key, "neutral", "negative → Neutral");
    eq(recommendFilter(null).key, "neutral", "null sim → Neutral");
}

console.log("discovery: enumeration, ranking, pairs, topN, quick cards");
{
    const d = buildFilterDiscovery(TRADES, { sampleFloor: 5 });
    ok(d.rows.length > 0, "rows produced");
    const asia = d.rows.find((r) => !r.isPair && r.dimA === "session" && r.keyA === "Asia");
    ok(!!asia, "Asia single-dim cohort present");
    eq(asia.netRImpact, 4.5, "Asia row netRImpact = +4.5");
    ok(asia.rankable, "Asia row rankable at floor 5 (5 losers)");
    eq(asia.recommendation.key, "strong_disable", "Asia at floor 5 → Strong Disable");
    // ranking: rankable rows first, then netRImpact desc
    const rankables = d.rows.filter((r) => r.rankable);
    ok(rankables.length > 0 && rankables[0].netRImpact === Math.max(...rankables.map((r) => r.netRImpact)),
        "best rankable cohort ranks first");
    for (let i = 1; i < rankables.length; i++) {
        if (rankables[i - 1].netRImpact < rankables[i].netRImpact) { ok(false, "rankable rows sorted desc"); break; }
        if (i === rankables.length - 1) ok(true, "rankable rows sorted desc");
    }
    // pairs
    const pair = d.rows.find((r) => r.isPair && r.dimA === "session" && r.dimB === "direction");
    ok(!!pair, "curated Session × Direction pair cohorts present");
    const asiaLong = d.rows.find((r) => r.isPair && r.keyA === "Asia" && r.keyB === "Long");
    ok(!!asiaLong && asiaLong.tradesRemoved === 3, "Asia + Long pair removes exactly its 3 trades");
    eq(cohortLabel({ dimA: "session", keyA: "Asia", dimB: "direction", keyB: "Long" }), "Asia + Long", "pair cohort label");
    // topN
    const small = buildFilterDiscovery(TRADES, { topN: 3 });
    eq(small.rows.length, 3, "topN respected");
    ok(small.totalCohorts >= small.rows.length, "totalCohorts ≥ shown rows");
    // quick cards
    const cards = bestFiltersByDimension(d, ["session", "structure", "penetration"]);
    const sessionCard = cards.find((c) => c.slot === "session");
    ok(!!sessionCard && sessionCard.row.keyA === "Asia", "best session card = Asia");
    ok(!cards.find((c) => c.slot === "penetration"), "no penetration card (dimension unavailable in fixture)");
    const pairCard = cards.find((c) => c.slot === "pair");
    ok(!!pairCard && pairCard.row.netRImpact > 0, "best pair card present with positive net R");
    // empty input
    const empty = buildFilterDiscovery([]);
    ok(empty.rows.length === 0 && empty.totals.trades === 0, "empty trades → no rows, zero totals");
    ok(typeof REC_SAMPLE_FLOOR === "number" && REC_SAMPLE_FLOOR > 0, "sample floor exported");
}

if (failures) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
}
console.log("\nALL PASS");
