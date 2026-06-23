// cohortFilterSimulator.validate.mjs — neutral removal/discovery engine (Research Lab Phase 0).
//
// Verifies the extracted truth layer matches the legacy filterSimulator math:
// metricsOf, exact simulateRemoval before/after/delta, cohortMatcher (single + pair),
// buildFilterDiscovery candidates, deterministic recommendFilter, empty-safety, and
// no mutation. Loaded through the Phase-0 module graph (cohortDimensions → cohortFilterSimulator).
//
// Run from frontend/:  node src/data/__validation__/cohortFilterSimulator.validate.mjs

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

const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: (e) => (e === "A" ? "Asia" : e === "N" ? "New York" : "Unknown"),
    parseDate: () => null, WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [], dayIndex: () => null,
    num: Number, round1: (v) => Number(Number(v).toFixed(1)), round2: (v) => Number(Number(v).toFixed(2)),
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const cohortDims = loadCjs("src/data/cohortDimensions.js", (s) => (s.includes("failuresUtils") ? utils : s.includes("failuresRegistry") ? registry : {}));
const sim = loadCjs("src/data/cohortFilterSimulator.js", (s) => (s.includes("cohortDimensions") ? cohortDims : {}));

const { metricsOf, simulateRemoval, cohortMatcher, cohortLabel, recommendFilter, buildFilterDiscovery } = sim;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// Asia: 5 losers + 1 winner(+0.5); New York: 4 winners(+2) + 2 losers. (Mirrors filterSimulator fixture.)
const mk = (session, direction, r, i) => Object.freeze({ id: `${session}${i}`, entry: session, direction, r });
const TRADES = Object.freeze([
    mk("A", "long", -1, 1), mk("A", "long", -1, 2), mk("A", "long", -1, 3),
    mk("A", "short", -1, 4), mk("A", "short", -1, 5), mk("A", "short", 0.5, 6),
    mk("N", "long", 2, 7), mk("N", "long", 2, 8), mk("N", "short", 2, 9),
    mk("N", "short", 2, 10), mk("N", "long", -1, 11), mk("N", "short", -1, 12),
]);
const SNAP = JSON.stringify(TRADES);

// 1. metricsOf ─────────────────────────────────────────────────────────────────
console.log("\n[1] metricsOf");
{
    const m = metricsOf(TRADES);
    ok(m.trades === 12 && m.winners === 5 && m.losers === 7, "12 trades, 5W/7L");
    ok(m.posR === 8.5 && m.negR === 7 && m.netR === 1.5, "posR 8.5 / negR 7 / netR 1.5");
    ok(m.winRate === 41.7 && m.profitFactor === 1.21, "WR 41.7%, PF 1.21");
    const e = metricsOf([]);
    ok(e.trades === 0 && e.netR === 0 && e.profitFactor === null, "empty → zeros, PF null");
}

// 2. simulateRemoval exact before/after/delta ──────────────────────────────────
console.log("\n[2] simulateRemoval");
{
    const s = simulateRemoval(TRADES, cohortMatcher({ dimA: "session", keyA: "Asia" }));
    ok(s.tradesRemoved === 6 && s.after.trades === 6, "Asia removes 6, keeps 6");
    ok(s.tradesRemoved + s.after.trades === TRADES.length, "removed + kept = total");
    ok(s.before.netR === 1.5 && s.after.netR === 6 && s.netRImpact === 4.5, "before 1.5 → after 6 (Δ +4.5)");
    ok(s.losersRemoved === 5 && s.winnersRemoved === 1, "removed 5 losers / 1 winner");
    ok(s.lossRRemoved === 5 && s.winnerRRemoved === 0.5, "loss R saved 5 / winner R lost 0.5");
    ok(s.after.winRate === 66.7 && s.winRateChange === 25, "WR 41.7 → 66.7 (Δ +25)");
    ok(simulateRemoval(TRADES, () => false).tradesRemoved === 0, "no match → removes 0");
    ok(simulateRemoval([], cohortMatcher({ dimA: "session", keyA: "Asia" })).tradesRemoved === 0, "empty input safe");
}

// 3. cohortMatcher single + pair ───────────────────────────────────────────────
console.log("\n[3] cohortMatcher");
{
    ok(TRADES.filter(cohortMatcher({ dimA: "session", keyA: "Asia" })).length === 6, "single dim: Asia = 6");
    ok(TRADES.filter(cohortMatcher({ dimA: "session", keyA: "New York" })).length === 6, "single dim: New York = 6");
    ok(TRADES.filter(cohortMatcher({ dimA: "session", keyA: "Asia", dimB: "direction", keyB: "Long" })).length === 3, "pair: Asia × Long = 3");
    ok(cohortLabel({ dimA: "session", keyA: "Asia", dimB: "direction", keyB: "Long" }) === "Asia + Long", "cohortLabel pair");
}

// 4. buildFilterDiscovery ──────────────────────────────────────────────────────
console.log("\n[4] buildFilterDiscovery");
{
    const d = buildFilterDiscovery(TRADES);
    ok(Array.isArray(d.rows) && d.rows.length > 0, "produces candidate rows");
    ok(d.totals.trades === 12, "carries population totals");
    const asia = d.rows.find((r) => r.dimA === "session" && r.keyA === "Asia" && !r.isPair);
    ok(asia && asia.netRImpact === 4.5, "Asia single-dim candidate Δ +4.5");
    ok(buildFilterDiscovery([]).rows.length === 0, "empty input → no candidates");
}

// 5. recommendFilter deterministic ─────────────────────────────────────────────
console.log("\n[5] recommendFilter");
{
    const asia = simulateRemoval(TRADES, cohortMatcher({ dimA: "session", keyA: "Asia" }));
    // +4.5R but only 5 losers removed (< floor 8) → Watchlist, not Strong/Test
    ok(recommendFilter(asia).key === "watchlist", "Asia (+4.5R, 5 losers) → Watchlist (below sample floor)");
    ok(recommendFilter({ tradesRemoved: 0 }).key === "neutral", "nothing removed → Neutral");
    // Strong path: synthetic sim meeting all gates
    const strong = recommendFilter({ tradesRemoved: 12, losersRemoved: 10, winnerRRemoved: 1, lossRRemoved: 10, netRImpact: 5 });
    ok(strong.key === "strong_disable", "Δ≥3, ≥8 losers, cheap winners → Strong Disable");
}

// 6. no mutation ───────────────────────────────────────────────────────────────
console.log("\n[6] no mutation");
{
    buildFilterDiscovery(TRADES); simulateRemoval(TRADES, () => true); metricsOf(TRADES);
    ok(JSON.stringify(TRADES) === SNAP, "engine does not mutate input trades");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
