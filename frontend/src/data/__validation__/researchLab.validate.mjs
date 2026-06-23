// researchLab.validate.mjs — Research Lab cohort model (Phase 1).
//
// Verifies buildResearchUniverse / resolveResearchCohort / cohortSummary /
// observedValuesFor, plus that buildFilterDiscovery runs on a resolved cohort's
// trades. Loaded through the Phase-0 module graph; isPerformanceTrade is stubbed so
// universe filtering is exercised against a known predicate.
//
// Run from frontend/:  node src/data/__validation__/researchLab.validate.mjs

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
// isPerformanceTrade stub — a trade is "performance" unless explicitly excluded.
const tcShim = { isPerformanceTrade: (t) => t?.perf !== false };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const cohortDims = loadCjs("src/data/cohortDimensions.js", (s) => (s.includes("failuresUtils") ? utils : s.includes("failuresRegistry") ? registry : {}));
const cohortSim = loadCjs("src/data/cohortFilterSimulator.js", (s) => (s.includes("cohortDimensions") ? cohortDims : {}));
const rl = loadCjs("src/data/researchLab.js", (s) => {
    if (s.includes("tradeClassification")) return tcShim;
    if (s.includes("cohortFilterSimulator")) return cohortSim;
    if (s.includes("cohortDimensions")) return cohortDims;
    return {};
});
const { buildResearchUniverse, resolveResearchCohort, cohortSummary, observedValuesFor } = rl;
const { buildFilterDiscovery } = cohortSim;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// Asia: 5 losers + 1 winner; New York: 4 winners + 2 losers; + 1 excluded (perf:false).
const mk = (session, direction, r, i, extra = {}) => Object.freeze({ id: `${session}${i}`, entry: session, direction, r, ...extra });
const RAW = [
    mk("A", "long", -1, 1), mk("A", "long", -1, 2), mk("A", "long", -1, 3),
    mk("A", "short", -1, 4), mk("A", "short", -1, 5), mk("A", "short", 0.5, 6),
    mk("N", "long", 2, 7), mk("N", "long", 2, 8), mk("N", "short", 2, 9),
    mk("N", "short", 2, 10), mk("N", "long", -1, 11), mk("N", "short", -1, 12),
    mk("N", "long", 9, 13, { perf: false }), // excluded from the universe
];
const SNAP = JSON.stringify(RAW);

// 1. buildResearchUniverse ─────────────────────────────────────────────────────
console.log("\n[1] buildResearchUniverse");
{
    const u = buildResearchUniverse(RAW);
    ok(u.length === 12, "filters out non-performance trade (12 of 13)");
    ok(buildResearchUniverse({ trades: RAW }).length === 12, "accepts a {trades} bundle shape");
    ok(buildResearchUniverse(null).length === 0 && buildResearchUniverse({}).length === 0, "empty/missing bundle → []");
    ok(JSON.stringify(RAW) === SNAP, "does not mutate input");
}

const UNIV = buildResearchUniverse(RAW);

// 2. resolveResearchCohort ─────────────────────────────────────────────────────
console.log("\n[2] resolveResearchCohort");
{
    const whole = resolveResearchCohort(UNIV, {});
    ok(whole.id === "whole-run" && whole.label === "Whole Run" && whole.trades.length === 12, "empty selection → Whole Run (all 12)");

    const asia = resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "Asia" }] });
    ok(asia.trades.length === 6 && asia.label === "Session Asia", "single dim: Asia = 6");

    const pair = resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "New York" }, { dim: "direction", value: "Long" }] });
    ok(pair.trades.length === 3 && pair.dims.length === 2, "pair dim: New York × Long = 3");

    // incomplete second dimension (missing value) → ignored, falls back to single
    const incomplete = resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "Asia" }, { dim: "direction", value: "" }] });
    ok(incomplete.trades.length === 6 && incomplete.dims.length === 1, "incomplete 2nd dim ignored → single-dim cohort");

    // unknown dimension safe (ignored)
    const unknown = resolveResearchCohort(UNIV, { dims: [{ dim: "bogus", value: "x" }] });
    ok(unknown.id === "whole-run" && unknown.trades.length === 12, "unknown dimension → ignored (Whole Run)");

    // cap at 2 dims
    const capped = resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "New York" }, { dim: "direction", value: "Long" }, { dim: "structure", value: "BOS" }] });
    ok(capped.dims.length === 2, "caps at 2 dimensions");

    const snap = JSON.stringify(UNIV);
    resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "Asia" }] });
    ok(JSON.stringify(UNIV) === snap, "does not mutate universe");
}

// 3. cohortSummary ─────────────────────────────────────────────────────────────
console.log("\n[3] cohortSummary");
{
    const s = cohortSummary(resolveResearchCohort(UNIV, {}));
    ok(s.trades === 12 && s.winners === 5 && s.losers === 7, "Whole Run: 12 trades, 5W/7L");
    ok(s.netR === 1.5 && s.pf === 1.21 && s.winRate === 41.7, "netR 1.5, PF 1.21, WR 41.7%");
    ok(s.expectancy === 0.13, "expectancy = netR/trades = 0.13");
    const asia = cohortSummary(resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "Asia" }] }));
    ok(asia.netR === -4.5 && asia.winners === 1 && asia.losers === 5, "Asia cohort: −4.5R, 1W/5L");
    const empty = cohortSummary({ trades: [] });
    ok(empty.trades === 0 && empty.netR === 0 && empty.pf === null && empty.expectancy === null, "empty cohort safe");
}

// 4. observedValuesFor ─────────────────────────────────────────────────────────
console.log("\n[4] observedValuesFor");
{
    const sessions = observedValuesFor(UNIV, "session");
    ok(sessions.join(",") === "Asia,New York", "session values sorted, nulls excluded");
    const dirs = observedValuesFor(UNIV, "direction");
    ok(dirs.join(",") === "Long,Short", "direction values");
    ok(observedValuesFor(UNIV, "bogus").length === 0, "unknown dimension → []");
}

// 5. Discovery runs on a resolved cohort ───────────────────────────────────────
console.log("\n[5] discovery on cohort");
{
    const nyCohort = resolveResearchCohort(UNIV, { dims: [{ dim: "session", value: "New York" }] });
    const disc = buildFilterDiscovery(nyCohort.trades, { dims: cohortDims.DIMENSIONS, topN: 30 });
    ok(Array.isArray(disc.rows), "buildFilterDiscovery runs on cohort.trades");
    ok(disc.totals.trades === 6, "discovery totals scoped to the cohort (NY = 6)");
    // within New York, a direction filter is discoverable (direction available there)
    ok(disc.rows.some((r) => r.dimA === "direction"), "within-cohort candidates produced (direction)");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
