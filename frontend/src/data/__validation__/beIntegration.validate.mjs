// beIntegration.validate.mjs — BE import + variant-aware resolution (P2).
//
// Storage is nested: beResults / beTradesByMode [mode][entryVariantKey][beKey].
// Old flat bundles ([mode][beKey]) normalise to entryVariantKey "baseline".
//
// Covers:
//   §1  BE file detection precedes the protection catch-all (baseline + variant).
//   §2  beTradeFileInfo parses executionMode / entryVariantKey / beKey / arm / trigger.
//   §3  beResolve key helpers + decimal tolerance.
//   §4  normalizeBeResults: flat→baseline, nested as-is, mixed.
//   §5  Resolve baseline EXACT (nested).
//   §6  Resolve variant EXACT (nested) for the matching result view.
//   §7  INTEGRITY: variant requested but only baseline exists → REPLAY / no_matching_variant.
//   §8  buildExactBeSummary shape.
//   §9  Central BE_EXIT classification + regression.
//   §10 Old flat bundle end-to-end (normalize → resolve baseline EXACT).
//   §11 describeBeAvailability variant fields.
//   §12 Old bundles / empty maps safe.
//
// Run from frontend/:  node src/data/__validation__/beIntegration.validate.mjs

import babel from "@babel/core";
import fs    from "fs";

function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { detectFileKind, beTradeFileInfo, normalizeBeResults } = loadCjs("src/data/importer.js");
const { classifyTrade } = loadCjs("src/data/tradeClassification.js");
const {
    formatArmToken, beScenarioKey, parseBeScenarioKey,
    findBeScenario, buildExactBeSummary, resolveBeScenarioSource,
    hasAnyExactBe, entryVariantHasExact, describeBeAvailability,
} = loadCjs("src/data/beResolve.js");

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 0.02) => Math.abs(Number(a) - Number(b)) <= eps;
const VKEY = "entry_triggered_edge_25p0_d2";

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  BE file detection precedes protection catch-all");
ok(detectFileKind("trades_single_position__be_wick_0p50R.csv") === "trades_be", "baseline wick BE → trades_be");
ok(detectFileKind(`trades_single_position__${VKEY}__be_wick_0p50R.csv`) === "trades_be", "variant BE → trades_be");
ok(detectFileKind("trades_single_position__penetration_50.csv") === "trades_protected", "protection unchanged");
ok(detectFileKind("trades_single_position__entry_triggered_edge_25p0.csv") === "trades_entry", "entry unchanged");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  beTradeFileInfo parsing (baseline + variant)");
const b = beTradeFileInfo("trades_single_position__be_wick_0p50R.csv");
ok(b && b.executionMode === "single_position", "baseline executionMode");
ok(b && b.entryVariantKey === "baseline", "baseline entryVariantKey = baseline");
ok(b && b.scenarioKey === "be_wick_0p50R" && approx(b.armLevelR, 0.5), "baseline scenarioKey + arm");
const v = beTradeFileInfo(`trades_single_position__${VKEY}__be_close_1p00R.csv`);
ok(v && v.entryVariantKey === VKEY, "variant entryVariantKey parsed");
ok(v && v.scenarioKey === "be_close_1p00R" && v.triggerBasis === "close" && approx(v.armLevelR, 1.0), "variant scenarioKey + trigger + arm");
ok(beTradeFileInfo("trades_single_position__penetration_50.csv") === null, "protection file → null");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  beResolve key helpers");
ok(formatArmToken(0.5) === "0p50" && formatArmToken(1) === "1p00", "formatArmToken");
ok(beScenarioKey("wick", 0.5) === "be_wick_0p50R", "beScenarioKey");
ok(parseBeScenarioKey("be_wick_0p5R")?.armLevelR === 0.5, "parse single-decimal 0p5 → 0.5");
// Research expansion — higher arm levels round-trip through the key helpers.
ok(formatArmToken(2.5) === "2p50" && formatArmToken(3) === "3p00" && formatArmToken(3.5) === "3p50", "formatArmToken 2.5/3/3.5");
ok(beScenarioKey("close", 2.5) === "be_close_2p50R" && beScenarioKey("wick", 3.5) === "be_wick_3p50R", "beScenarioKey 2.5/3.5");
ok(parseBeScenarioKey("be_wick_2p50R")?.armLevelR === 2.5 && parseBeScenarioKey("be_close_3p00R")?.armLevelR === 3 && parseBeScenarioKey("be_wick_3p50R")?.armLevelR === 3.5, "parse 2.5/3/3.5 keys");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  normalizeBeResults (dual-shape)");
const flatRaw = { single_position: { be_wick_0p50R: { net_r: 0 }, be_close_0p50R: { net_r: 1 } } };
const flatNorm = normalizeBeResults(flatRaw);
ok(!!flatNorm.single_position.baseline, "flat → nested under baseline");
ok("be_wick_0p50R" in flatNorm.single_position.baseline, "flat be keys preserved under baseline");
ok(!("be_wick_0p50R" in flatNorm.single_position), "flat be keys not left at entry level");
const nestedRaw = { single_position: { baseline: { be_wick_0p50R: {} }, [VKEY]: { be_wick_0p50R: {} } } };
const nestedNorm = normalizeBeResults(nestedRaw);
ok("baseline" in nestedNorm.single_position && VKEY in nestedNorm.single_position, "nested kept as-is");
ok(normalizeBeResults(undefined) && Object.keys(normalizeBeResults(undefined)).length === 0, "undefined → {}");

// ── Shared nested fixtures ──────────────────────────────────────────────────
const beTradesBaseline = [
    { id: "t1", net_r: 1.0, outcome: "WIN" },
    { id: "t2", net_r: 0.0, outcome: "BE_EXIT", be_exit_r: 0, be_triggered: true },
    { id: "t3", net_r: -1.0, outcome: "LOSS" },
];
const beTradesVariant = [
    { id: "x1", net_r: 0.0, outcome: "BE_EXIT", be_exit_r: 0, be_triggered: true },
    { id: "x2", net_r: 2.0, outcome: "WIN" },
];
const beResults = { single_position: {
    baseline: { be_wick_0p50R: { be_exit_count: 1, losses_saved: 1, loser_r_saved: 1.0, delta_net_r: 1.0, filled_trades: 3, net_r: 0.0 } },
    [VKEY]:   { be_wick_0p50R: { be_exit_count: 1, losses_saved: 0, winners_cut: 0, delta_net_r: 0.5, filled_trades: 2, net_r: 2.0 } },
} };
const beTradesByMode = { single_position: {
    baseline: { be_wick_0p50R: beTradesBaseline },
    [VKEY]:   { be_wick_0p50R: beTradesVariant },
} };

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  Resolve baseline EXACT (nested)");
const rBase = resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: "baseline", beResults, beTradesByMode });
ok(rBase.source === "EXACT", "baseline view → EXACT");
ok(rBase.entryVariantKey === "baseline", "EXACT carries entryVariantKey baseline");
ok(approx(rBase.summary.netR, 0.0), "baseline netR from its trades (1+0-1)");
// Null entry key defaults to baseline.
ok(resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", beResults, beTradesByMode }).source === "EXACT",
    "null entryVariantKey defaults to baseline EXACT");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  Resolve variant EXACT (nested)");
const rVar = resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: VKEY, beResults, beTradesByMode });
ok(rVar.source === "EXACT", "variant view → EXACT");
ok(rVar.entryVariantKey === VKEY, "EXACT carries variant key");
ok(approx(rVar.summary.netR, 2.0), "variant netR from VARIANT trades (0+2), NOT baseline");
ok(rVar.summary.netR !== rBase.summary.netR, "variant summary differs from baseline summary");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  INTEGRITY: baseline BE never substituted for a variant");
const onlyBaseline = { single_position: { baseline: { be_wick_0p50R: { net_r: 0 } } } };
const onlyBaselineTrades = { single_position: { baseline: { be_wick_0p50R: beTradesBaseline } } };
const rMissing = resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: VKEY, beResults: onlyBaseline, beTradesByMode: onlyBaselineTrades });
ok(rMissing.source === "REPLAY", "variant requested + only baseline exists → REPLAY (not EXACT)");
ok(rMissing.reason === "no_matching_variant", "reason = no_matching_variant");
ok(rMissing.summary === null && rMissing.trades === null, "no baseline data leaked into variant result");
// But the baseline view of that same run still resolves EXACT.
ok(resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: "baseline", beResults: onlyBaseline, beTradesByMode: onlyBaselineTrades }).source === "EXACT",
    "baseline view of same run still EXACT");
// Arm not exported for an existing variant → no_matching_scenario (not no_matching_variant).
ok(resolveBeScenarioSource({ armLevelR: 2.0, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: VKEY, beResults, beTradesByMode }).reason === "no_matching_scenario",
    "variant present, arm absent → no_matching_scenario");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§8  buildExactBeSummary shape");
ok(rBase.summary.coveragePct === 100 && rBase.summary.sameCandleAmbiguousCount === 0, "EXACT coverage 100, ambig 0");
ok(rBase.summary.lossesSaved === 1 && approx(rBase.summary.loserRSaved, 1.0), "EXACT reads losses_saved/loser_r_saved from summary");
ok(typeof rBase.summary.winnerRCost === "number", "winnerRCost numeric (no NaN)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§9  Central BE_EXIT classification + regression");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 0, entry: "x" }) === "BREAKEVEN", "BE_EXIT 0 → BREAKEVEN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 1.2, entry: "x" }) === "WIN", "BE_EXIT +R → WIN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: -0.8, entry: "x" }) === "LOSS", "BE_EXIT -R → LOSS");
ok(classifyTrade({ outcome: "WIN", r: 2, entry: "x" }) === "WIN", "WIN unchanged");
ok(classifyTrade({ outcome: "PROTECTION_EXIT", r: 0.4, entry: "x" }) === "WIN", "PROTECTION_EXIT unchanged");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§10  Old flat bundle end-to-end");
// An old bundle: flat be_results + flat-keyed trades (importer would route a
// no-token file under "baseline", and normalizeBeResults nests the summary).
const oldResults = normalizeBeResults({ single_position: { be_wick_0p50R: { net_r: 0, losses_saved: 1, loser_r_saved: 1.0 } } });
const oldTrades = { single_position: { baseline: { be_wick_0p50R: beTradesBaseline } } };
const rOld = resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", executionMode: "single_position", entryVariantKey: "baseline", beResults: oldResults, beTradesByMode: oldTrades });
ok(rOld.source === "EXACT", "old flat bundle → baseline EXACT after normalize");
ok(rOld.summary.lossesSaved === 1, "old flat summary fields preserved through normalize");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§11  describeBeAvailability variant fields");
const dVar = describeBeAvailability(beResults, beTradesByMode, { executionMode: "single_position", entryVariantKey: VKEY, triggerBasis: "wick", armLevelR: 0.5 });
ok(dVar.entryHasExact === true, "describe: variant has exact");
ok(dVar.availableEntryVariantKeys.includes("baseline") && dVar.availableEntryVariantKeys.includes(VKEY), "describe lists available entry variant keys");
ok(dVar.requestedKey === "be_wick_0p50R", "describe requested key");
const dMissing = describeBeAvailability(onlyBaseline, onlyBaselineTrades, { executionMode: "single_position", entryVariantKey: VKEY });
ok(dMissing.entryHasExact === false, "describe: missing variant → entryHasExact false");
ok(entryVariantHasExact(beResults, beTradesByMode, { executionMode: "single_position", entryVariantKey: "baseline" }) === true, "entryVariantHasExact baseline true");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§12  Old bundles / empty maps safe");
ok(hasAnyExactBe({}, {}) === false, "empty → false");
ok(hasAnyExactBe(beResults, beTradesByMode) === true, "nested present → true");
ok(resolveBeScenarioSource({ armLevelR: 0.5, triggerBasis: "wick", beResults: {}, beTradesByMode: {} }).reason === "no_be_data", "empty → no_be_data");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
