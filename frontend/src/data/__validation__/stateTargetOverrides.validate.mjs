// stateTargetOverrides.validate.mjs — Market State Target Overrides model + serializer.
//
// Proves:
//   [1] normalization: full 24×6 map; unknown modes → inherit; custom snaps to the
//       canonical ladder; custom without rr degrades to inherit
//   [2] OFF ⇒ mergeStateOverridesIntoScenario returns the base scenario UNCHANGED
//       (same reference — byte-identical run discipline); nothing-to-emit ⇒ ditto
//   [3] ON ⇒ only non-inherit cells serialize; research carries rr for provenance;
//       disabled cohorts never carry state_overrides; meta counts stamped
//   [4] round-trip: scenario → stateOverridesFromScenario → identical cells
//   [5] resolved summary counts (the pre-launch "24 cohorts · 144 cells · …" line)
//   [6] PM-conflict warnings: custom/block in a PM-blocked state warns "will never
//       execute"; label cohorts never warn; PM off ⇒ no warnings
//   [7] the state axis is EXACTLY the six canonical engine states (never Unlabelled,
//       never invented labels)
//
// Run from frontend/:  node src/data/__validation__/stateTargetOverrides.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

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
        if (spec.startsWith("@/")) {
            const p = path.resolve("src", spec.slice(2));
            if (p.endsWith(".json")) return JSON.parse(fs.readFileSync(p, "utf8"));
            return loadCjs(p);
        }
        if (spec.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(resolved), spec), "utf8"));
        throw new Error("bare import: " + spec);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const M = loadCjs("src/data/stateTargetOverrides.js");
const { buildSessionStrategyScenario } = loadCjs("src/data/cohortTargetOverrides.js");
const { MARKET_STATES } = loadCjs("src/data/marketState.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

console.log("\n[7] state axis = the six canonical engine states");
ok(JSON.stringify(M.STATE_AXIS) === JSON.stringify(MARKET_STATES), "STATE_AXIS === MARKET_STATES");
ok(!M.STATE_AXIS.includes("unlabelled") && !M.STATE_AXIS.includes("Unlabelled"), "Unlabelled is NOT a configurable state (always inherits base)");
ok(JSON.stringify(M.STATE_MODES) === JSON.stringify(["inherit", "custom", "block", "research"]), "four cell modes");

console.log("\n[1] normalization");
const norm = M.normalizeStateOverrides({ "newYork|bos_short": { "Bull/Expand": { mode: "custom", rr: 3.97 }, "Bear/Chop": { mode: "wat" } } });
ok(Object.keys(norm).length === 24 && Object.keys(norm["london|bos_long"]).length === 6, "full 24 × 6 map");
ok(norm["newYork|bos_short"]["Bull/Expand"].mode === "custom" && norm["newYork|bos_short"]["Bull/Expand"].rr === 4.0, "custom rr snaps to the ladder (3.97 → 4.0)");
ok(norm["newYork|bos_short"]["Bear/Chop"].mode === "inherit", "unknown mode → inherit");
ok(M.normalizeCell({ mode: "custom" }).mode === "inherit", "custom without rr degrades to inherit");
ok(M.normalizeCell({ mode: "block", rr: 9 }).rr === null, "block carries no rr");

console.log("\n[2] OFF / nothing-to-emit ⇒ base scenario unchanged (same reference)");
const cfgBase = { cohortOverridesEnabled: true, rr: 2, cohortTargetOverrides: {} };
const base = buildSessionStrategyScenario(cfgBase);
ok(M.mergeStateOverridesIntoScenario(base, { ...cfgBase, stateOverridesEnabled: false, stateTargetOverrides: { "london|bos_long": { "Bull/Expand": { mode: "block" } } } }) === base,
   "panel OFF ⇒ identical reference (byte-identical run)");
ok(M.mergeStateOverridesIntoScenario(base, { ...cfgBase, stateOverridesEnabled: true, stateTargetOverrides: {} }) === base,
   "all-inherit ⇒ identical reference");
ok(M.mergeStateOverridesIntoScenario(base, { ...cfgBase, stateOverridesEnabled: true, stateTargetOverrides: { "london|bos_long": { "Bull/Expand": { mode: "research", rr: 3.0 } } } }) === base,
   "research-only panel ⇒ NOTHING serialized ⇒ identical reference (research never affects execution)");
ok(M.mergeStateOverridesIntoScenario(null, { stateOverridesEnabled: true }) === null, "no base scenario ⇒ untouched");

console.log("\n[3] ON ⇒ additive emission");
const cfgOn = {
    ...cfgBase, stateOverridesEnabled: true,
    cohortTargetOverrides: { "asia|bos_long": { enabled: false, target: "default" } },
    stateTargetOverrides: {
        "newYork|bos_short": { "Bull/Expand": { mode: "custom", rr: 4.0 }, "Bear/Chop": { mode: "research", rr: 2.75 } },
        "london|choch_long": { "Bear/Expand": { mode: "block" } },
        "asia|bos_long": { "Bull/Expand": { mode: "block" } },      // cohort disabled → dropped
    },
};
const merged = M.mergeStateOverridesIntoScenario(buildSessionStrategyScenario(cfgOn), cfgOn);
const rowOf = (s, st, d) => merged.cohorts.find((c) => c.session === s && c.structure === st && c.direction === d);
const ny = rowOf("newYork", "BOS", "Short");
ok(ny.state_overrides["Bull/Expand"].mode === "custom" && ny.state_overrides["Bull/Expand"].rr === 4.0, "custom cell serialized with rr");
ok(!("Bear/Chop" in ny.state_overrides), "research cells are NOT serialized — execution config carries only inherit/custom/block (research lives in the draft layer)");
ok(!("Bull/Compress" in ny.state_overrides), "inherit cells are NOT serialized");
ok(rowOf("london", "CHoCH", "Long").state_overrides["Bear/Expand"].mode === "block", "block cell serialized");
ok(rowOf("asia", "BOS", "Long").enabled === false && !rowOf("asia", "BOS", "Long").state_overrides, "disabled cohort never carries state_overrides");
ok(merged.meta.state_cells_custom === 1 && merged.meta.state_cells_block === 2 && merged.meta.state_cells_research === 1,
   "meta counts still reflect the PANEL state (incl. research bookmarks) for provenance — but the cells themselves never serialize");

console.log("\n[4] round-trip");
const rt = M.stateOverridesFromScenario(merged);
ok(rt.enabled === true, "round-trip enables the panel");
ok(rt.overrides["newYork|bos_short"]["Bull/Expand"].mode === "custom" && rt.overrides["newYork|bos_short"]["Bull/Expand"].rr === 4.0, "custom survives round-trip");
ok(rt.overrides["london|choch_long"]["Bear/Expand"].mode === "block", "block survives round-trip");
ok(rt.overrides["newYork|bos_short"]["Bull/Compress"].mode === "inherit", "unspecified cells restore as inherit");
ok(rt.overrides["newYork|bos_short"]["Bear/Chop"].mode === "inherit", "research bookmark did not round-trip through the scenario (draft layer owns it)");
ok(M.stateOverridesFromScenario(base).enabled === false, "scenario without state_overrides ⇒ panel stays OFF");

console.log("\n[5] resolved summary");
const sum = M.summarizeStateOverrides(cfgOn);
ok(sum.cohorts === 24 && sum.cells === 144, "24 cohorts · 144 cells");
ok(sum.custom === 1 && sum.block === 2 && sum.research === 1 && sum.inherit === 140, `counts ${sum.inherit}/${sum.custom}/${sum.block}/${sum.research}`);

console.log("\n[6] PM-conflict warnings");
const { loadPolicy } = loadCjs("src/data/portfolioPolicy.js");
const table = loadPolicy(JSON.parse(fs.readFileSync("src/data/deployedPolicy.v1.json", "utf8")));
// NY CHoCH Short is DIRECTION_AWARE ⇒ Bull/Expand + Bull/Compress can never execute.
const warnCfg = { portfolioEnabled: true, stateOverridesEnabled: true, stateTargetOverrides: {
    "newYork|choch_short": { "Bull/Expand": { mode: "custom", rr: 3.0 }, "Bear/Expand": { mode: "custom", rr: 3.0 } } } };
const warns = M.buildStateOverrideWarnings(warnCfg, table);
ok(warns.length === 1 && warns[0].state === "Bull/Expand" && /never execute/.test(warns[0].message),
   "DIRECTION_AWARE cohort: Bull/Expand custom warns; aligned Bear/Expand does not");
ok(M.buildStateOverrideWarnings({ ...warnCfg, portfolioEnabled: false }, table).length === 0, "PM off ⇒ no warnings");
ok(JSON.stringify(M.pmBlockedStates("STATE_ONLY", "Long")) === JSON.stringify(["Bull/Chop", "Bear/Chop"]), "STATE_ONLY blocks both chop states");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
