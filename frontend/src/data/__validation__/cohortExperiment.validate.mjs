// cohortExperiment.validate.mjs — Cohort Experiment Engine (Phase 2A, EXACT layer).
//
// Verifies baseline metrics, exclusion (single + pair), TP retarget (incl. held
// news-flatten), composition (exclusions before TP; commutativity), last-TP-wins,
// combined grade EXACT, empty-safety, and no mutation.
//
// Loaders: sessionResults loads via a simple relative loader (its ./ chain);
// the failures + cohort modules load via a require-shim that stubs entryFormatters.
//
// Run from frontend/:  node src/data/__validation__/cohortExperiment.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const compile = (src, file) => babel.transformSync(src, {
    filename: file, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
}).code;

// Simple relative loader (recursive) — for sessionResults + its ./ dependencies.
const relCache = new Map();
function loadRel(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (relCache.has(resolved)) return relCache.get(resolved).exports;
    const code = compile(fs.readFileSync(resolved, "utf8"), resolved);
    const mod = { exports: {} }; relCache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadRel(path.resolve(path.dirname(resolved), spec)); throw new Error(`unexpected non-relative import: ${spec}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

// Require-shim loader — for the failures chain + cohort modules + the engine.
function loadShim(absPath, requireShim) {
    const code = compile(fs.readFileSync(absPath, "utf8"), absPath);
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(requireShim, mod, mod.exports);
    return mod.exports;
}

const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: (e) => (e === "A" ? "Asia" : e === "N" ? "New York" : "Unknown"),
    parseDate: () => null, WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [], dayIndex: () => null,
    num: Number, round1: (v) => Number(Number(v).toFixed(1)), round2: (v) => Number(Number(v).toFixed(2)),
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const BASE = "src/components/lab/failures/shared";
const utils = loadShim(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadShim(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const cohortDims = loadShim("src/data/cohortDimensions.js", (s) => (s.includes("failuresUtils") ? utils : s.includes("failuresRegistry") ? registry : {}));
const cohortSim = loadShim("src/data/cohortFilterSimulator.js", (s) => (s.includes("cohortDimensions") ? cohortDims : {}));
const sessionResults = loadRel("src/data/sessionResults.js");
const exp = loadShim("src/data/cohortExperiment.js", (s) => {
    if (s.includes("cohortFilterSimulator")) return cohortSim;
    if (s.includes("cohortDimensions")) return cohortDims;
    if (s.includes("sessionResults")) return sessionResults;
    return {};
});

const { runExperimentStack, buildExcludeExperiment, buildTargetExperiment, applyExactExclusions, retargetTradesExact, EXPERIMENT_GRADES } = exp;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// 2024-01-06 = Sat, 2024-01-08 = Mon, 2024-02-06 = Tue.
const T = (outcome, r, mfe, date) => Object.freeze({ outcome, outcomeRaw: outcome, r, netR: r, net_r: r, mfe_r: mfe, entry: `${date}T08:00:00Z` });
const TRADES = Object.freeze([
    T("WIN", 2, 2.5, "2024-01-06"), T("WIN", 2, 2.5, "2024-01-06"), T("WIN", 2, 2.5, "2024-01-06"), // Jan/Sat winners
    T("LOSS", -1, 0.3, "2024-01-08"), T("LOSS", -1, 0.3, "2024-01-08"),                              // Jan/Mon losers
    T("WIN", 2, 1.2, "2024-02-06"), T("WIN", 2, 1.2, "2024-02-06"),                                  // Feb winners
    T("LOSS", -1, 0.8, "2024-02-06"),                                                                // Feb loser
]);
const SNAP = JSON.stringify(TRADES);
const exclJan = buildExcludeExperiment([{ dim: "month", value: "Jan" }]);
const tp2 = buildTargetExperiment(2);

// 1. baseline ──────────────────────────────────────────────────────────────────
console.log("\n[1] baseline");
{
    const b = runExperimentStack(TRADES, []).baseline;
    ok(b.trades === 8 && b.winners === 5 && b.losers === 3, "8 trades, 5W/3L");
    ok(b.netR === 7 && b.pf === 3.33 && b.winRate === 62.5, "netR 7, PF 3.33, WR 62.5%");
    ok(runExperimentStack(TRADES, []).combined.deltaNetR === 0, "no experiments → Δ 0 (after = baseline)");
}

// 2. exclusion (single + pair) ─────────────────────────────────────────────────
console.log("\n[2] exclusion");
{
    const s = runExperimentStack(TRADES, [exclJan]);
    const step = s.steps[0];
    ok(step.result.tradesRemoved === 5 && step.result.winnersRemoved === 3 && step.result.losersRemoved === 2, "Exclude Jan: −5 (3W/2L)");
    ok(step.result.lossRSaved === 2 && step.result.winnerRLost === 6, "loss R saved 2 / winner R lost 6");
    ok(step.after.trades === 3 && step.after.netR === 3 && step.deltaNetR === -4, "after Jan: 3 trades, +3R (Δ −4)");
    ok(s.combined.tradesAfter === 3 && s.combined.after.netR === 3, "combined post-exclusion = +3R / 3 trades");
    ok(applyExactExclusions(TRADES, [exclJan]).length === 3, "applyExactExclusions removes Jan (3 survive)");
    // pair: month Jan × weekday Sat → only the 3 Jan/Sat winners
    const pair = applyExactExclusions(TRADES, [buildExcludeExperiment([{ dim: "month", value: "Jan" }, { dim: "weekday", value: "Sat" }])]);
    ok(pair.length === 5, "pair exclude (Jan × Sat) removes only the 3 Jan/Sat winners (5 survive)");
    ok(JSON.stringify(TRADES) === SNAP, "exclusion does not mutate input");
}

// 3. TP retarget ───────────────────────────────────────────────────────────────
console.log("\n[3] TP retarget");
{
    const rt = retargetTradesExact(TRADES, 2);
    // at 2R: only the 3 winners with mfe 2.5 win; everything else (mfe<2) loses
    ok(rt.estW === 3 && rt.estL === 5, "2R: Est W 3 / Est L 5 (mfe≥2 only the 2.5s)");
    ok(rt.estNetR === 1 && rt.after.netR === 1 && rt.after.trades === 8, "2R: Est Net R +1, after keeps 8 trades");
    ok(rt.estWR === 37.5 && rt.decided === 8, "2R: Est WR 37.5%, decided 8");
    // news-flatten held at actual
    const nf = retargetTradesExact([
        { outcome: "WIN", outcomeRaw: "WIN", r: 2, netR: 2, mfe_r: 2.5, entry: "2024-01-06T08:00:00Z" },
        { outcome: "NEWS_FLATTEN", outcomeRaw: "NEWS_FLATTEN", r: 0.5, netR: 0.5, mfe_r: 1.5, entry: "2024-01-06T08:00:00Z" },
    ], 2);
    ok(nf.estNetR === 2.5, "news-flatten held at actual: 2R net = +2 (win) + 0.5 (held NF)");
}

// 4. composition ───────────────────────────────────────────────────────────────
console.log("\n[4] composition");
{
    const s = runExperimentStack(TRADES, [exclJan, tp2]);
    // survivors = Feb (2 win mfe1.2, 1 loss mfe0.8); at 2R all mfe<2 → 3 losses → −3R
    ok(s.combined.after.netR === -3, "exclude Jan → TP 2R on survivors = −3R");
    ok(s.steps[0].type === "exclude" && s.steps[1].type === "tp", "exclusions apply before TP (step order)");
    // commutativity: TP on the manually-excluded survivors equals the stack
    const direct = retargetTradesExact(applyExactExclusions(TRADES, [exclJan]), 2).after.netR;
    ok(direct === s.combined.after.netR, "exclude-then-TP == TP-on-survivors (commutative/exact)");
    // multiple exclusions stack
    const both = runExperimentStack(TRADES, [exclJan, buildExcludeExperiment([{ dim: "month", value: "Feb" }])]);
    ok(both.combined.tradesAfter === 0 && both.combined.after.netR === 0, "stacking Jan+Feb exclusions removes all → 0");
    // multiple TP → last wins
    const multi = runExperimentStack(TRADES, [buildTargetExperiment(0.5), tp2]);
    const tpStep = multi.steps.find((x) => x.type === "tp");
    ok(multi.combined.after.netR === 1 && tpStep.result.target === 2 && tpStep.ignoredPriorTp === 1, "two TP experiments → last (2R) wins, prior ignored");
}

// 5. grade + 6. empty + no mutation ────────────────────────────────────────────
console.log("\n[5] grade / empty / no-mutation");
{
    ok(runExperimentStack(TRADES, [exclJan, tp2]).combined.grade === EXPERIMENT_GRADES.EXACT, "combined grade EXACT for exact-only stack");
    const empty = runExperimentStack([], []);
    ok(empty.baseline.trades === 0 && empty.combined.after.netR === 0, "empty input safe");
    const snap = JSON.stringify(TRADES);
    runExperimentStack(TRADES, [exclJan, tp2]); applyExactExclusions(TRADES, [exclJan]); retargetTradesExact(TRADES, 2);
    ok(JSON.stringify(TRADES) === snap, "engine does not mutate input trades");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
