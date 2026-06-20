// deepDelaySelection.validate.mjs — DEEP-DELAY TRIGGERED EDGE SELECTION.
//
// Confirms the arm selector + fill-mode fallbacks are data-driven and delay-aware,
// so a run whose arms are d20…d50 shows/selects C20…C50 (not dead C0–C6), while a
// shallow C0–C6 run is byte-for-byte unchanged. Covers:
//   armSlotsFromFillModes / armLabel / armCandleIndex  (selector slot generation)
//   pickFillModeForSelection                            (model/threshold → arm)
//   safeFillModeWhenNoCombined / resolveHierarchy.coerce(via buildCanonicalKey)
//   derivePrimaryResultView                             (default opens on real arm)
//
// Run from frontend/:  node src/data/__validation__/deepDelaySelection.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

function loadModule(absPath, cache = new Map()) {
    if (cache.has(absPath)) return cache.get(absPath);
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(absPath, mod.exports);
    const req = (spec) => {
        if (spec.startsWith(".")) {
            let p = path.resolve(path.dirname(absPath), spec);
            if (!p.endsWith(".js")) p += ".js";
            return loadModule(p, cache);
        }
        return {};
    };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(absPath, mod.exports);
    return mod.exports;
}

const tu = loadModule("src/data/tradeUniverse.js");
const {
    armCandleIndex, armLabel, armSlotsFromFillModes, pickFillModeForSelection,
    safeFillModeWhenNoCombined, buildCanonicalKey, derivePrimaryResultView,
} = tu;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const DEEP = ["d20", "d25", "d30", "d35", "d40", "d45", "d50"];
const SHALLOW = ["same", "next", "d2", "d3", "d4", "d5", "d6"];

console.log("\n[1] armCandleIndex / armLabel");
ok(armCandleIndex("same") === 0 && armCandleIndex("next") === 1, "same=0, next=1");
ok(armCandleIndex("d2") === 2 && armCandleIndex("d50") === 50, "d2=2, d50=50");
ok(armLabel("same") === "Arm C0" && armLabel("next") === "Arm C1" && armLabel("d20") === "Arm C20", "labels same→C0, next→C1, d20→C20");

console.log("\n[2] armSlotsFromFillModes — deep run yields C20…C50 (only real arms)");
const deepSlots = armSlotsFromFillModes(DEEP);
ok(eq(deepSlots.map((s) => s.label), ["Arm C20", "Arm C25", "Arm C30", "Arm C35", "Arm C40", "Arm C45", "Arm C50"]),
    "labels are C20…C50 in candle order");
ok(deepSlots.every((s) => DEEP.includes(s.fillMode)) && deepSlots.length === 7, "no C0–C6 placeholders injected");
// containing d20,d25,d30 produces C20/C25/C30 slots (task case)
const triSlots = armSlotsFromFillModes(["d30", "d20", "d25"]);
ok(eq(triSlots.map((s) => s.label), ["Arm C20", "Arm C25", "Arm C30"]), "[d30,d20,d25] → C20,C25,C30 sorted");

console.log("\n[3] armSlotsFromFillModes — shallow run unchanged (C0…C6)");
const shallowSlots = armSlotsFromFillModes(SHALLOW);
ok(eq(shallowSlots.map((s) => s.label), ["Arm C0", "Arm C1", "Arm C2", "Arm C3", "Arm C4", "Arm C5", "Arm C6"]),
    "labels are C0…C6 in candle order");
// combined/null is not an arm slot
ok(eq(armSlotsFromFillModes([null, "both", "same", "d2"]).map((s) => s.label), ["Arm C0", "Arm C2"]),
    "null/both excluded from arm slots");

console.log("\n[4] pickFillModeForSelection — deep-aware fallback");
ok(pickFillModeForSelection(["d20", "d25"], null) === "d20", "available [d20,d25], no pref → d20 (not null)");
ok(pickFillModeForSelection(["d50", "d20", "d35"], null) === "d20", "first deep arm by candle index → d20");
ok(pickFillModeForSelection(["d20", "d25"], "d25") === "d25", "requested d25 honored when available");
ok(pickFillModeForSelection(["d20", "d25"], "d2") === "d20", "requested d2 absent → first deep arm d20");
ok(pickFillModeForSelection([null, "same", "next"], null) === null, "combined present → null (shallow unchanged)");
ok(pickFillModeForSelection(["same", "next"], null) === "same", "no combined → same (shallow unchanged)");
ok(pickFillModeForSelection(["next", "d3"], null) === "next", "same absent, next present → next (shallow unchanged)");
ok(pickFillModeForSelection([], null) === null, "no arms → null");

console.log("\n[5] safeFillModeWhenNoCombined — deep-aware, shallow preserved");
ok(safeFillModeWhenNoCombined(["d20", "d25"]) === "d20", "available [d20,d25] → d20 (not null)");
ok(safeFillModeWhenNoCombined(["next", "same", "d2"]) === "next", "next preferred (shallow unchanged)");
ok(safeFillModeWhenNoCombined(["same", "d6"]) === "same", "same preferred (shallow unchanged)");
ok(safeFillModeWhenNoCombined([]) === null, "empty → null");
// the produced canonical key maps to a real deep file
ok(buildCanonicalKey("triggered_edge", 10, "d20") === "entry_triggered_edge_10p0_d20", "buildCanonicalKey deep suffix correct");

console.log("\n[6] derivePrimaryResultView — deep run opens on a real arm (lazy: empty byMode)");
// Lazy bundle: tradesByMode empty, but entry summary lists deep keys (manifest-derived).
const lazyDeepBundle = {
    config: {},
    trades: [],
    entryResults: {
        summary: { allow_multi_position: {
            baseline: {},
            entry_triggered_edge_10p0_d20: {}, entry_triggered_edge_10p0_d25: {},
            entry_triggered_edge_10p0_d50: {},
        } },
        tradesByMode: {},
    },
};
const deepView = derivePrimaryResultView(lazyDeepBundle);
ok(deepView && deepView.family === "triggered_edge", "deep lazy run → triggered_edge (not Baseline/null)");
ok(deepView && deepView.threshold === 10 && deepView.fillMode === "d20", "opens on threshold 10, arm d20 (lowest candle index)");

console.log("\n[7] derivePrimaryResultView — shallow run behaviour preserved");
// Eager shallow run with resident rows hits the existing row-based scan (step 3).
const eagerShallow = {
    config: {},
    trades: [],
    entryResults: { summary: {}, tradesByMode: {
        entry_triggered_edge_10p0_d3: [{ id: 1 }],
        entry_triggered_edge_10p0_d2: [{ id: 2 }],
    } },
};
const shallowView = derivePrimaryResultView(eagerShallow);
ok(shallowView && shallowView.family === "triggered_edge" && shallowView.fillMode === "d3",
    "eager shallow run still resolves via row scan → d3 (unchanged)");
// no entry data at all → null (Baseline)
ok(derivePrimaryResultView({ config: {}, trades: [], entryResults: { summary: {}, tradesByMode: {} } }) === null,
    "no entry variants → null (Baseline), unchanged");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
