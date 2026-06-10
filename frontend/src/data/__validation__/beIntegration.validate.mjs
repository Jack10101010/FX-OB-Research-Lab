// beIntegration.validate.mjs — validation suite for BE-FRONTEND-INTEGRATION.
//
// Covers the EXACT-import + resolution wiring:
//   1. BE file detection runs BEFORE the protection catch-all.
//   2. BE files parse into executionMode / scenarioKey / trigger / arm.
//   3. beResolve key formatting + tolerant matching (0.5 ⇄ 0p50, 1 ⇄ 1p00).
//   4. resolveBeScenarioSource → EXACT when a scenario matches, REPLAY otherwise.
//   5. buildExactBeSummary shape (matches buildBeScenarioSummary consumers).
//   6. Central BE_EXIT classification (WIN/LOSS/BREAKEVEN by be_exit_r).
//   7. Existing WIN / LOSS / BREAKEVEN / PROTECTION_EXIT / NEWS_FLATTEN unchanged.
//   8. Old bundles (no BE data) resolve to REPLAY and never crash.
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/beIntegration.validate.mjs
//
// Exits non-zero if any assertion fails. All fixtures hand-built.

import babel from "@babel/core";
import fs    from "fs";

// Load an ESM source file as CommonJS. Nested relative imports resolve to {} —
// fine here because the functions under test have no cross-module dependency.
function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { detectFileKind, beTradeFileInfo } = loadCjs("src/data/importer.js");
const { classifyTrade } = loadCjs("src/data/tradeClassification.js");
const {
    formatArmToken, beScenarioKey, parseBeScenarioKey,
    findBeScenario, buildExactBeSummary, resolveBeScenarioSource, hasAnyExactBe,
} = loadCjs("src/data/beResolve.js");

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 0.02) => Math.abs(Number(a) - Number(b)) <= eps;

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  BE file detection precedes protection catch-all");
// ─────────────────────────────────────────────────────────────────────────────
ok(detectFileKind("trades_single_position__be_wick_0p50R.csv") === "trades_be",
    "wick BE file → trades_be");
ok(detectFileKind("trades_allow_multi_position__be_close_1p00R.csv") === "trades_be",
    "close BE file → trades_be");
ok(detectFileKind("trades_one_per_direction__be_wick_0p75R.csv") === "trades_be",
    "one_per_direction BE file → trades_be");
ok(detectFileKind("trades_single_position__penetration_50.csv") === "trades_protected",
    "protection file still → trades_protected (unchanged)");
ok(detectFileKind("trades_single_position__entry_triggered_edge_25p0.csv") === "trades_entry",
    "entry file still → trades_entry (unchanged)");
ok(detectFileKind("trades_single_position.csv") === "trades_single_position",
    "plain variant file still → trades_single_position (unchanged)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  beTradeFileInfo parsing");
// ─────────────────────────────────────────────────────────────────────────────
const info = beTradeFileInfo("trades_single_position__be_wick_0p50R.csv");
ok(info && info.executionMode === "single_position", "executionMode parsed");
ok(info && info.scenarioKey === "be_wick_0p50R", "scenarioKey preserved verbatim");
ok(info && info.triggerBasis === "wick", "triggerBasis parsed");
ok(info && approx(info.armLevelR, 0.5), "armLevelR parsed = 0.5");
const info2 = beTradeFileInfo("trades_allow_multi_position__be_close_1p00R.csv");
ok(info2 && approx(info2.armLevelR, 1.0) && info2.triggerBasis === "close", "1p00R close parsed = 1.0");
ok(beTradeFileInfo("trades_single_position__penetration_50.csv") === null,
    "protection file does NOT match beTradeFileInfo");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  beResolve key helpers");
// ─────────────────────────────────────────────────────────────────────────────
ok(formatArmToken(0.5) === "0p50", "formatArmToken 0.5 → 0p50");
ok(formatArmToken(1) === "1p00", "formatArmToken 1 → 1p00");
ok(formatArmToken(0.75) === "0p75", "formatArmToken 0.75 → 0p75");
ok(formatArmToken(2) === "2p00", "formatArmToken 2 → 2p00");
ok(beScenarioKey("wick", 0.5) === "be_wick_0p50R", "beScenarioKey wick/0.5");
ok(beScenarioKey("close", 1) === "be_close_1p00R", "beScenarioKey close/1");
const pk = parseBeScenarioKey("be_close_1p00R");
ok(pk && pk.triggerBasis === "close" && approx(pk.armLevelR, 1.0), "parseBeScenarioKey round-trip");
const pk2 = parseBeScenarioKey("be_wick_0p50r"); // lowercase r tolerated
ok(pk2 && pk2.triggerBasis === "wick" && approx(pk2.armLevelR, 0.5), "parseBeScenarioKey lowercase r");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  findBeScenario + resolveBeScenarioSource");
// ─────────────────────────────────────────────────────────────────────────────
const beTrades = [
    { id: "t1", net_r: 1.0, outcome: "WIN" },
    { id: "t2", net_r: 0.0, outcome: "BE_EXIT", be_exit_r: 0, be_exit_reason: "be_stop", be_triggered: true },
    { id: "t3", net_r: -1.0, outcome: "LOSS", be_exit_reason: "never_armed" },
    { id: "t4", net_r: 0.0, outcome: "BE_EXIT", be_exit_r: 0, be_exit_reason: "be_stop", be_triggered: true },
];
const beResults = {
    single_position: {
        be_wick_0p50R: {
            be_scenario_key: "be_wick_0p50R", be_arm_level_r: 0.5, be_trigger_basis: "wick",
            be_exit_count: 2, losses_saved: 1, winners_cut: 0,
            loser_r_saved: 1.0, winner_r_cost: 0.0, efficiency_ratio: null,
            delta_net_r: 1.0, filled_trades: 4, net_r: 0.0,
        },
    },
};
const beTradesByMode = { single_position: { be_wick_0p50R: beTrades } };

const found = findBeScenario(beResults, beTradesByMode, { executionMode: "single_position", triggerBasis: "wick", armLevelR: 0.5 });
ok(found && found.scenarioKey === "be_wick_0p50R", "findBeScenario matches exact key");
ok(found && Array.isArray(found.trades) && found.trades.length === 4, "findBeScenario returns trades");

// Tolerant match: number 0.5 against stored token form.
const foundTol = findBeScenario(beResults, beTradesByMode, { executionMode: "single_position", triggerBasis: "wick", armLevelR: 0.50 });
ok(!!foundTol, "tolerant arm match 0.50 ⇄ 0p50");

// Execution mode auto-resolution when not provided (single mode present).
const foundAuto = findBeScenario(beResults, beTradesByMode, { triggerBasis: "wick", armLevelR: 0.5 });
ok(!!foundAuto && foundAuto.executionMode === "single_position", "executionMode auto-resolved");

const resExact = resolveBeScenarioSource({
    armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position",
    beResults, beTradesByMode, baseline: { netR: -1.0, maxDrawdown: -1.0, profitFactor: 1.0, worstLossStreak: 1 },
});
ok(resExact.source === "EXACT", "resolve → EXACT when scenario present");
ok(resExact.scenarioKey === "be_wick_0p50R", "EXACT carries scenarioKey");

const resReplay = resolveBeScenarioSource({
    armLevelR: 2.0, triggerBasis: "wick", executionMode: "single_position",
    beResults, beTradesByMode,
});
ok(resReplay.source === "REPLAY", "resolve → REPLAY for an un-exported arm");
ok(resReplay.summary === null && resReplay.trades === null, "REPLAY carries no EXACT summary/trades");

// Different trigger with no matching scenario → REPLAY.
const resTrig = resolveBeScenarioSource({
    armLevelR: 0.5, triggerBasis: "close", executionMode: "single_position",
    beResults, beTradesByMode,
});
ok(resTrig.source === "REPLAY", "trigger mismatch → REPLAY");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  buildExactBeSummary shape");
// ─────────────────────────────────────────────────────────────────────────────
const exSum = resExact.summary;
ok(approx(exSum.netR, 0.0), "EXACT netR computed from trades (1+0-1+0=0)");
ok(exSum.coveragePct === 100, "EXACT coveragePct = 100");
ok(exSum.sameCandleAmbiguousCount === 0, "EXACT sameCandleAmbiguousCount = 0");
ok(exSum.missingPathCount === 0, "EXACT missingPathCount = 0");
ok(exSum.beExitCount === 2, "EXACT beExitCount from summary");
ok(exSum.lossesSaved === 1, "EXACT lossesSaved from summary");
ok(approx(exSum.loserRSaved, 1.0), "EXACT loserRSaved from summary");
ok(approx(exSum.deltaNetR, 1.0), "EXACT deltaNetR from summary");
ok(exSum.replayedCount === 4, "EXACT replayedCount = filled_trades");
ok(typeof exSum.winnerRCost === "number", "EXACT winnerRCost defaulted to number (no NaN)");

// Summary recomputes from trades when backend summary absent.
const exSumNoRaw = buildExactBeSummary(beTrades, null, { netR: -1.0 });
ok(approx(exSumNoRaw.netR, 0.0), "buildExactBeSummary works with null backend summary");
ok(exSumNoRaw.beExitCount === 2, "beExitCount falls back to computed (be_triggered)");
ok(approx(exSumNoRaw.deltaNetR, 1.0), "deltaNetR falls back to netR - baseline");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  Central BE_EXIT classification");
// ─────────────────────────────────────────────────────────────────────────────
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 0, entry: "2025-01-01T00:00:00Z" }) === "BREAKEVEN",
    "BE_EXIT @ be_exit_r 0 → BREAKEVEN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 1.2, entry: "x" }) === "WIN",
    "BE_EXIT @ be_exit_r +1.2 → WIN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: -0.8, entry: "x" }) === "LOSS",
    "BE_EXIT @ be_exit_r -0.8 → LOSS");
// Mangled importer label "Be_exit" must still classify correctly via normalize.
ok(classifyTrade({ outcome: "Be_exit", be_exit_r: 0, entry: "x" }) === "BREAKEVEN",
    "legacy mangled 'Be_exit' still → BREAKEVEN");
// be_exit_r absent → falls back to row R.
ok(classifyTrade({ outcome: "BE_EXIT", net_r: -0.5, entry: "x" }) === "LOSS",
    "BE_EXIT with no be_exit_r falls back to net_r");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  Existing classification unchanged (regression)");
// ─────────────────────────────────────────────────────────────────────────────
ok(classifyTrade({ outcome: "WIN", r: 2, entry: "x" }) === "WIN", "WIN unchanged");
ok(classifyTrade({ outcome: "LOSS", r: -1, entry: "x" }) === "LOSS", "LOSS unchanged");
ok(classifyTrade({ outcome: "", r: 0, entry: "x" }) === "BREAKEVEN", "flat r → BREAKEVEN unchanged");
ok(classifyTrade({ outcome: "PROTECTION_EXIT", r: 0.4, entry: "x" }) === "WIN", "PROTECTION_EXIT +R → WIN unchanged");
ok(classifyTrade({ outcome: "NEWS_FLATTEN", r: 0.3, entry: "x" }) === "NEWS_FLATTEN_WIN", "NEWS_FLATTEN +R unchanged");
ok(classifyTrade({ outcome: "UNFILLED" }) === "UNFILLED", "UNFILLED unchanged");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§8  Old bundles (no BE data) safe");
// ─────────────────────────────────────────────────────────────────────────────
ok(hasAnyExactBe({}, {}) === false, "hasAnyExactBe empty → false");
ok(hasAnyExactBe(undefined, undefined) === false, "hasAnyExactBe undefined → false");
const resOld = resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", beResults: {}, beTradesByMode: {} });
ok(resOld.source === "REPLAY", "empty maps → REPLAY (no crash)");
ok(hasAnyExactBe(beResults, beTradesByMode) === true, "hasAnyExactBe true when scenarios present");

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
