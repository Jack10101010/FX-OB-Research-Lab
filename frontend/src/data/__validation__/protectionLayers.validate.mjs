// protectionLayers.validate.mjs — PROTECTION-LAYER-TRADE-UNIVERSE Phase 1.
//
// Verifies the generic protection-layer contract, the break_even adapter, the
// resolver branch, deterministic keys, no mutation, and Strategy-Map parity.
//
// Run from frontend/:  node src/data/__validation__/protectionLayers.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

// Recursive CJS loader — resolves relative ESM imports between data modules.
const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => {
        if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec));
        throw new Error(`unexpected non-relative import: ${spec}`);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const tu = loadCjs("src/data/tradeUniverse.js");
const pl = loadCjs("src/data/protectionLayers.js");
const { resolveTradeUniverse, selectTrades } = tu;
const {
    serializeLayerFilters, buildLayerKey, buildProtectedSourceKey,
    buildProtectionLabel, applyTradeUniverseLayer, applyProtectionLayers, normalizeLayers,
} = pl;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, e = 0.001) => Math.abs(Number(a) - Number(b)) <= e;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const t = (id, dir, str, ses, r, mfe) => ({ id, trade_id: id, base_trade_id: id, direction: dir, structure: str, session: ses, net_r: r, mfe_r: mfe });
const beT = (id, r) => ({ id, trade_id: id, base_trade_id: id, net_r: r, be_triggered: true, be_exit_reason: "be_stop" });

const variantTrades = [
    t("A", "Long", "CHoCH", "London", -1, 1.5),
    t("B", "Short", "BOS", "New York", 3, 2.2),
    t("C", "Long", "BOS", "Asia", -1, 0.4),
];
const baselineTrades = [
    t("X", "Long", "CHoCH", "London", -1, 1.0),
    t("Y", "Short", "BOS", "Asia", 2, 1.3),
];
const beVariant = [beT("A", 0), beT("B", 0), beT("C", 0)];

const bundle = {
    primaryVariant: "single_position",
    tradesByVariant: { single_position: baselineTrades },
    entryResults: { tradesByMode: { baseline: baselineTrades, entry_triggered_edge_25p0_d2: variantTrades } },
    beResults: { single_position: { entry_triggered_edge_25p0_d2: { be_wick_1p00R: {} } } },
    beTradesByMode: { single_position: { entry_triggered_edge_25p0_d2: { be_wick_1p00R: beVariant } } },
};

const SC_TE = { family: "triggered_edge", threshold: 25, fillMode: "d2", positionVariant: "single_position" };
const SC_BASE = { family: "baseline", positionVariant: "single_position" };
const beLayer = (extra = {}) => ({ type: "break_even", params: { beScenarioKey: "be_wick_1p00R" }, filters: {}, exploratory: true, ...extra });

console.log("§1  Base universe unchanged with no layer");
const u1 = resolveTradeUniverse({ bundle, scenario: SC_TE, fallbackVariant: "single_position" });
ok(u1.universeType === "scenario", "no layer → universeType scenario (not protected)");
ok(u1.trades.length === 3 && u1.protection === undefined, "no layer → base trades, no protection metadata");

console.log("\n§10 Old scenario (no protection/layers key) loads unchanged");
ok(resolveTradeUniverse({ bundle, scenario: { ...SC_TE }, fallbackVariant: "single_position" }).universeType === "scenario", "legacy scenario object → unchanged");
ok(normalizeLayers({}).length === 0 && normalizeLayers({ family: "baseline" }).length === 0, "normalizeLayers([]) for legacy scenarios");

console.log("\n§9  Strategy-Map resolver parity (same selectTrades source)");
const mapTrades = selectTrades("entry_triggered_edge_25p0_d2", "d2", bundle, baselineTrades);
ok(mapTrades === variantTrades || mapTrades.length === 3, "base universe trades == selectTrades() the map uses");
ok(u1.trades.every((x, i) => x.id === mapTrades[i].id), "protected resolver builds on the SAME trade selection");

console.log("\n§2/§7  BE layer (mode=all) transforms trades + metadata");
const uAll = resolveTradeUniverse({ bundle, scenario: { ...SC_TE, protection: beLayer({ mode: "all" }) }, fallbackVariant: "single_position" });
ok(uAll.universeType === "protected_result", "with layer → universeType protected_result");
ok(uAll.trades.length === 3 && uAll.trades.every((x) => x.protectionApplied), "all 3 trades protected");
const m = uAll.protection.layers[0];
ok(m.appliedCount === 3 && m.modifiedCount === 3 && m.excludedCount === 0, "metadata counts (applied 3 / excluded 0)");
ok(approx(m.originalNetR, 1) && approx(m.transformedNetR, 0) && approx(m.deltaNetR, -1), "delta math: 1 → 0 (Δ -1)");
ok(m.layerType === "break_even" && m.exploratory === true, "metadata layerType + exploratory");
ok(uAll.stats && approx(uAll.stats.netR, 0), "universe.stats recomputed from protected trades");
ok(approx(uAll.baseEntryStats.netR, 1), "baseEntryStats preserves pre-protection Net R");

console.log("\n§2b Selective BE layer (cohort filters)");
const uSel = resolveTradeUniverse({ bundle, scenario: { ...SC_TE, protection: beLayer({ filters: { structures: ["choch"] } }) }, fallbackVariant: "single_position" });
const protectedIds = uSel.trades.filter((x) => x.protectionApplied).map((x) => x.id);
ok(protectedIds.length === 1 && protectedIds[0] === "A", "CHoCH filter → only A protected");
ok(uSel.protection.layers[0].appliedCount === 1, "selective appliedCount 1");

console.log("\n§3  BE layer uses current entry variant, not baseline");
const uBaseProt = resolveTradeUniverse({ bundle, scenario: { ...SC_BASE, protection: beLayer({ mode: "all" }) }, fallbackVariant: "single_position" });
ok(uBaseProt.trades.length === 2 && !uBaseProt.trades.some((x) => x.protectionApplied), "baseline view: variant BE NOT applied");
ok(uBaseProt.warnings.some((w) => w.code === "NO_MATCHING_VARIANT"), "baseline view → NO_MATCHING_VARIANT warning (no baseline-BE substitution)");

console.log("\n§4  Missing BE data → base + warning");
const noBeBundle = { ...bundle, beResults: {}, beTradesByMode: {} };
const uNoBe = resolveTradeUniverse({ bundle: noBeBundle, scenario: { ...SC_TE, protection: beLayer({ mode: "all" }) }, fallbackVariant: "single_position" });
ok(uNoBe.trades.length === 3 && !uNoBe.trades.some((x) => x.protectionApplied), "no BE data → base trades unchanged");
ok(uNoBe.warnings.some((w) => w.code === "NO_BE_DATA"), "no BE data → NO_BE_DATA warning");

console.log("\n§5  Filter serialization deterministic + order-independent");
const f1 = serializeLayerFilters({ directions: ["Short", "Long"], structures: ["CHoCH"], sessions: ["New York", "London"], armLevels: [2, 1] });
const f2 = serializeLayerFilters({ armLevels: [1, 2], sessions: ["London", "New York"], structures: ["choch"], directions: ["long", "short"] });
ok(f1 === "dir-long_short-str-choch-ses-london_new_york-mfe-1p0_2p0", `filter key formatted: ${f1}`);
ok(f1 === f2, "filter key is order-independent (deterministic)");
ok(serializeLayerFilters({}) === "", "empty filters → empty key segment");

console.log("\n§6  Source key + label deterministic");
const L = beLayer({ filters: { structures: ["choch"], sessions: ["London"] } });
const k1 = buildProtectedSourceKey("entry_triggered_edge_25p0_d2", [L]);
const k2 = buildProtectedSourceKey("entry_triggered_edge_25p0_d2", [L]);
ok(k1 === k2, "source key stable across calls");
ok(k1 === "entry_triggered_edge_25p0_d2__protection-break_even-be_wick_1p00R-str-choch-ses-london", `source key: ${k1}`);
ok(buildLayerKey(beLayer({ mode: "all" })) === "protection-break_even-be_wick_1p00R-all", "all-mode layer key");
ok(buildProtectionLabel(beLayer({ filters: { structures: ["choch"], sessions: ["london"] } })) === "BE 1R Wick · CHoCH + London", "protection label: BE 1R Wick · CHoCH + London");
ok(buildProtectionLabel(beLayer({ mode: "all" })) === "BE 1R Wick · All Trades", "protection label (all): BE 1R Wick · All Trades");

console.log("\n§8  No mutation of base trades");
ok(variantTrades[0].net_r === -1 && variantTrades[0].protectionApplied === undefined, "base trade object untouched after protected build");
ok(beVariant[0].protectionApplied === undefined, "base BE trade object untouched");

console.log("\n§extra  Layer array form == single protection form");
const uArr = resolveTradeUniverse({ bundle, scenario: { ...SC_TE, layers: [beLayer({ mode: "all" })] }, fallbackVariant: "single_position" });
ok(uArr.universeType === "protected_result" && uArr.protection.layers[0].appliedCount === 3, "scenario.layers[] resolves same as scenario.protection");
ok(buildProtectedSourceKey("baseline", []) === "baseline", "no layers → base source key");

console.log("\n§extra  Unknown layer type → passthrough + warning");
const uUnk = applyTradeUniverseLayer({ baseUniverse: { trades: variantTrades, variant: "single_position", sourceKey: "entry_triggered_edge_25p0_d2" }, bundle, layer: { type: "ema_filter" } });
ok(uUnk.trades.length === 3 && uUnk.warnings.some((w) => w.code === "UNKNOWN_LAYER_TYPE"), "unknown layer type ignored with warning");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
