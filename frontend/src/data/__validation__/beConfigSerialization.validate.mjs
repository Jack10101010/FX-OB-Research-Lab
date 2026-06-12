// beConfigSerialization.validate.mjs — BE Strategy-Builder → sidecar config wiring.
//
// Covers BE-END-TO-END-STRATEGY-BUILDER-INTEGRATION Phase G item 1
// (config serialization) + regression that non-BE runs are unchanged.
//
//   1. BE disabled → { be_enabled: false }, no arm levels emitted.
//   2. BE enabled → be_arm_levels / be_trigger_bases / be_stop_buffer_r /
//      be_delay_candles all present and sanitised.
//   3. Enabled + empty arms → never emits be_enabled:true (falls back to false).
//   4. Arm dedupe/sort, trigger sanitising, delay clamp.
//   5. buildBacktesterConfig embeds the BE block in the full payload.
//   6. Round-trip: a reloaded BE run restores the Strategy Builder toggles.
//
// Run from frontend/:  node src/data/__validation__/beConfigSerialization.validate.mjs

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
    // Stub bare imports; configRegistry is the only one and is unused by the
    // functions under test — return a harmless empty registry.
    const require = (p) => (String(p).includes("configRegistry") ? { CONFIG_REGISTRY: [] } : {});
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(require, mod, mod.exports);
    return mod.exports;
}

const { buildBeConfig, buildBacktesterConfig, buildRunConfigLoadReport, BE_ARM_LEVEL_CHOICES } = loadCjs("src/data/configTranslator.js");

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

// Minimal-but-complete cfg for buildBacktesterConfig (mirrors StrategyBuilder defaults).
const baseCfg = {
    symbol: "EURUSD", detectionTf: "M15", executionTf: "1m",
    dateFrom: "2025-05-18", dateTo: "2025-06-18", dataFile: "data/candles/EURUSD_1m.csv",
    swing: 50, obFilter: "ATR", minObSizePips: 0, maxObSizePips: 100,
    structure: "Both", direction: "Both", bosLong: true, bosShort: true, chochLong: true, chochShort: true,
    rr: 3.3, obEntryDepthPct: 0, entryBuffer: 0, stopBuffer: 1, verifyTicks: 0,
    executionMode: "multi_position", sessionFilter: false,
    london: true, lull: true, newYork: true, asia: true, outside: true,
    newsBlackout: false, spread: 0.2, slippage: 0.2, commission: 0,
    entryMode: "single", selectedEntryModel: "baseline",
    directionalEntryMode: "symmetric",
};

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  buildBeConfig — disabled");
// ─────────────────────────────────────────────────────────────────────────────
const off = buildBeConfig({ beEnabled: false, beArmLevels: [0.5], beTriggerBases: ["wick"] });
ok(off.be_enabled === false, "disabled → be_enabled false");
ok(!("be_arm_levels" in off), "disabled → no be_arm_levels key");
ok(Object.keys(off).length === 1, "disabled → only be_enabled emitted");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  buildBeConfig — enabled");
// ─────────────────────────────────────────────────────────────────────────────
const on = buildBeConfig({ beEnabled: true, beArmLevels: [1.0, 0.5, 2.0], beTriggerBases: ["wick", "close"], beDelayCandles: 1 });
ok(on.be_enabled === true, "enabled → be_enabled true");
ok(eqArr(on.be_arm_levels, [0.5, 1.0, 2.0]), "arm levels sorted ascending");
ok(eqArr(on.be_trigger_bases, ["wick", "close"]), "trigger bases preserved");
ok(on.be_stop_buffer_r === 0.0, "stop buffer fixed at 0R");
ok(on.be_delay_candles === 1, "delay passed through");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  buildBeConfig — guard: enabled but no valid arms");
// ─────────────────────────────────────────────────────────────────────────────
ok(buildBeConfig({ beEnabled: true, beArmLevels: [] }).be_enabled === false,
    "enabled + empty arms → be_enabled false (never invalid)");
ok(buildBeConfig({ beEnabled: true, beArmLevels: [0, -1, "x"] }).be_enabled === false,
    "enabled + all-invalid arms → be_enabled false");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  buildBeConfig — sanitising");
// ─────────────────────────────────────────────────────────────────────────────
const san = buildBeConfig({ beEnabled: true, beArmLevels: [0.5, 0.5, 1.0], beTriggerBases: ["wick", "bogus"], beDelayCandles: 7 });
ok(eqArr(san.be_arm_levels, [0.5, 1.0]), "duplicate arm levels deduped");
ok(eqArr(san.be_trigger_bases, ["wick"]), "invalid trigger filtered out");
ok(san.be_delay_candles === 0, "out-of-range delay clamped to 0");
const noTrig = buildBeConfig({ beEnabled: true, beArmLevels: [0.5], beTriggerBases: [] });
ok(eqArr(noTrig.be_trigger_bases, ["wick"]), "empty triggers → defaults to wick");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  buildBacktesterConfig — BE embedded in full payload");
// ─────────────────────────────────────────────────────────────────────────────
const cfgOff = buildBacktesterConfig({ ...baseCfg, beEnabled: false });
ok(cfgOff.be_enabled === false, "full payload (BE off) → be_enabled false");
ok(!("be_arm_levels" in cfgOff), "full payload (BE off) → no be_arm_levels");
ok(cfgOff.protection_modes && cfgOff.protection_modes.length === 1, "protection unaffected when BE off");

const cfgOn = buildBacktesterConfig({ ...baseCfg, beEnabled: true, beArmLevels: [0.5, 1.0, 2.0], beTriggerBases: ["wick", "close"], beDelayCandles: 2 });
ok(cfgOn.be_enabled === true, "full payload (BE on) → be_enabled true");
ok(eqArr(cfgOn.be_arm_levels, [0.5, 1.0, 2.0]), "full payload carries arm levels");
ok(eqArr(cfgOn.be_trigger_bases, ["wick", "close"]), "full payload carries trigger bases");
ok(cfgOn.be_delay_candles === 2, "full payload carries delay");
ok(cfgOn.be_stop_buffer_r === 0.0, "full payload carries stop buffer 0R");
ok(cfgOn.protection_modes && cfgOn.protection_modes.length === 1, "protection still baseline when BE on (separate concern)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  Round-trip — reloaded BE run restores Strategy Builder toggles");
// ─────────────────────────────────────────────────────────────────────────────
const report = buildRunConfigLoadReport({}, {
    config: { be_enabled: true, be_arm_levels: [0.5, 1.0], be_trigger_bases: ["wick"], be_delay_candles: 1 },
    summary: {},
});
ok(report.config.beEnabled === true, "round-trip restores beEnabled");
ok(eqArr(report.config.beArmLevels, [0.5, 1.0]), "round-trip restores arm levels");
ok(eqArr(report.config.beTriggerBases, ["wick"]), "round-trip restores trigger bases");
ok(report.config.beDelayCandles === 1, "round-trip restores delay");

const reportOff = buildRunConfigLoadReport({}, { config: {}, summary: {} });
ok(reportOff.config.beEnabled === undefined || reportOff.config.beEnabled === false,
    "old bundle without BE → beEnabled not forced on");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  be_variants serialization (P2)");
// ─────────────────────────────────────────────────────────────────────────────
ok(buildBeConfig({ beEnabled: true, beArmLevels: [0.5] }).be_variants === "baseline",
    "default (no beVariants) → be_variants 'baseline'");
ok(buildBeConfig({ beEnabled: true, beArmLevels: [0.5], beVariants: "baseline" }).be_variants === "baseline",
    "explicit baseline → 'baseline'");
ok(buildBeConfig({ beEnabled: true, beArmLevels: [0.5], beVariants: "all" }).be_variants === "all",
    "'all' → 'all'");
ok(buildBeConfig({ beEnabled: true, beArmLevels: [0.5], beVariants: "bogus" }).be_variants === "baseline",
    "unknown value coerced to 'baseline' (never silently 'all')");
ok(!("be_variants" in buildBeConfig({ beEnabled: false, beVariants: "all" })),
    "BE disabled → no be_variants emitted (only be_enabled:false)");
// Full payload carries be_variants when on.
const cfgAll = buildBacktesterConfig({ ...baseCfg, beEnabled: true, beArmLevels: [0.5, 1.0], beTriggerBases: ["wick"], beVariants: "all" });
ok(cfgAll.be_variants === "all", "full payload carries be_variants 'all'");
const cfgBaseOnly = buildBacktesterConfig({ ...baseCfg, beEnabled: true, beArmLevels: [0.5], beTriggerBases: ["wick"] });
ok(cfgBaseOnly.be_variants === "baseline", "full payload defaults be_variants 'baseline'");

console.log("\nHigher arm levels (research expansion)");
ok([2.5, 3, 3.5].every((a) => BE_ARM_LEVEL_CHOICES.includes(a)), "BE_ARM_LEVEL_CHOICES includes 2.5/3/3.5");
const cfgHi = buildBeConfig({ beEnabled: true, beArmLevels: [0.5, 2.5, 3, 3.5], beTriggerBases: ["wick", "close"] });
ok(JSON.stringify(cfgHi.be_arm_levels) === JSON.stringify([0.5, 2.5, 3, 3.5]), "buildBeConfig serializes 2.5/3/3.5 (sorted, no whitelist drop)");

console.log("\nTriggered Edge entry-universe expansion (thresholds + delays)");
const teCfg = (over) => buildBacktesterConfig({ ...baseCfg, selectedEntryModel: "triggered_edge", triggeredEdgeDelays: [0, 1], ...over });
// Threshold SET via presets array.
ok(JSON.stringify(teCfg({ singleTriggeredEdgeThresholds: [25, 10, 75, 50] }).triggered_edge_trigger_thresholds) === JSON.stringify([10, 25, 50, 75]),
    "preset set [10,25,50,75] serializes sorted/deduped");
// Backward compat: single value only.
ok(JSON.stringify(teCfg({ singleTriggeredEdgeThreshold: 25, singleTriggeredEdgeThresholds: undefined }).triggered_edge_trigger_thresholds) === JSON.stringify([25]),
    "single threshold (no array) → [25] (back-compat)");
// Threshold ≥ 100 rejected.
ok(JSON.stringify(teCfg({ singleTriggeredEdgeThresholds: [50, 100, 150] }).triggered_edge_trigger_thresholds) === JSON.stringify([50]),
    "threshold ≥ 100 dropped");
// Delays 0–6 serialize.
ok(JSON.stringify(teCfg({ triggeredEdgeDelays: [0, 1, 2, 3, 4, 5, 6] }).triggered_edge_candle_delays) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
    "delays 0–6 serialize");
// Old C0–C3 unchanged.
ok(JSON.stringify(teCfg({ triggeredEdgeDelays: [0, 1, 2, 3] }).triggered_edge_candle_delays) === JSON.stringify([0, 1, 2, 3]),
    "old C0–C3 delays unchanged");
// BE not silently set to all variants.
ok(teCfg({}).be_variants !== "all", "TE expansion does not force be_variants 'all'");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
