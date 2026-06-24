// sessionScenarioConfig.validate.mjs — Session-First Strategy compiler (4-Layer P1).
//
// Proves the pure flat compiler (data/sessionScenarioConfig.js):
//   • preview == payload (pure, deterministic, fully JSON-serialisable)
//   • deterministic output (same input → byte-identical JSON)
//   • 24-cohort emission in SESSIONS × CELLS order
//   • disabled cohorts compile to { enabled:false, entry/be/target/risk_reduction: null }
//   • London CHoCH Long example compiles correctly
//   • multi-session example compiles correctly
//   • baseline_comparison compiles correctly (eligible + whole_run)
//   • Global Default inheritance (flat, single-level)
//
// Run from frontend/:  node src/data/__validation__/sessionScenarioConfig.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const { code } = babel.transformSync(fs.readFileSync(resolved, "utf8"), {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(`unexpected non-relative import: ${spec}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const { buildSessionScenarioConfig, SESSION_SCENARIO_VERSION } = loadCjs("src/data/sessionScenarioConfig.js");
const { SESSION_KEYS, CELL_KEYS } = loadCjs("src/data/cohortKeys.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const J = (x) => JSON.stringify(x);
const eq = (a, b) => J(a) === J(b);
const cohort = (out, key) => out.session_strategy_scenario.cohorts.find((c) => c.cohort_key === key);

// ── 1. preview == payload + determinism ────────────────────────────────────────
console.log("\n[1] preview == payload + deterministic");
{
    const input = { enabled: true, sessions: { london: { setups: { choch_long: { entry: { model: "triggered_edge", threshold: 25, arm: "C40" }, target: { value: 2 }, be: { trigger: "wick", armR: 1 } } } } } };
    const a = buildSessionScenarioConfig(input);
    const b = buildSessionScenarioConfig(input);
    ok(eq(a, b), "same input → byte-identical output (deterministic)");
    // preview (JSON shown) === payload (object submitted): fully serialisable round-trip
    ok(eq(a, JSON.parse(J(a))), "output is plain JSON (preview JSON === payload object)");
    // no hidden non-serialisable fields (functions/undefined would drop in JSON)
    ok(JSON.parse(J(a)).session_strategy_scenario.cohorts.length === a.session_strategy_scenario.cohorts.length, "no fields lost in serialisation");
}

// ── 2. schema + 24-cohort emission ─────────────────────────────────────────────
console.log("\n[2] schema + 24 cohorts");
{
    const out = buildSessionScenarioConfig({ enabled: true, sessions: {} });
    const scn = out.session_strategy_scenario;
    ok(scn.version === SESSION_SCENARIO_VERSION && scn.version === 1, "version = 1");
    ok(scn.enabled === true, "enabled passthrough");
    ok(Array.isArray(scn.cohorts) && scn.cohorts.length === SESSION_KEYS.length * CELL_KEYS.length, `${SESSION_KEYS.length}×${CELL_KEYS.length} = ${scn.cohorts.length} cohorts`);
    ok(scn.cohorts.length === 24, "exactly 24 cohorts");
    // emission order: SESSIONS × CELLS
    const expectKeys = SESSION_KEYS.flatMap((s) => CELL_KEYS.map((c) => `${s}|${c}`));
    ok(eq(scn.cohorts.map((c) => c.cohort_key), expectKeys), "cohorts emitted in SESSIONS × CELLS order");
    ok("global_default" in scn && "warnings" in scn && Array.isArray(scn.warnings), "global_default + warnings present");
    // cohort shape keys
    const c0 = scn.cohorts[0];
    ok(eq(Object.keys(c0), ["session", "structure", "direction", "cohort_key", "enabled", "entry", "be", "target", "risk_reduction", "protection", "exec"]), "cohort carries the exact schema keys");
}

// ── 3. disabled cohorts ────────────────────────────────────────────────────────
console.log("\n[3] disabled cohorts");
{
    const out = buildSessionScenarioConfig({ enabled: true, sessions: { london: { setups: { choch_long: { entry: { model: "baseline" }, target: { value: 1 } } } }, outside: { enabled: false } } });
    const c = cohort(out, "london|bos_long"); // not a configured setup → disabled
    ok(c.enabled === false && c.entry === null && c.be === null && c.target === null && c.risk_reduction === null, "unconfigured cohort → disabled, all dims null");
    ok(c.protection === null && eq(c.exec, { entry_buffer_pips: null, stop_buffer_pips: null, ob_entry_depth_pct: null, verify_limit_ticks: null }), "disabled cohort exec/protection reserved-null");
    const outsideC = cohort(out, "outside|choch_long");
    ok(outsideC.enabled === false, "whole disabled session → its cohorts disabled");
    // explicit setup.enabled:false also disables
    const out2 = buildSessionScenarioConfig({ enabled: true, sessions: { asia: { setups: { bos_long: { enabled: false, entry: { model: "baseline" } } } } } });
    ok(cohort(out2, "asia|bos_long").enabled === false, "setup.enabled:false → cohort disabled");
}

// ── 4. London CHoCH Long example ───────────────────────────────────────────────
console.log("\n[4] London CHoCH Long = TE25 C40 + 2R + wick 1R");
{
    const out = buildSessionScenarioConfig({ enabled: true, sessions: { london: { setups: { choch_long: { entry: { model: "triggered_edge", threshold: 25, arm: "C40" }, target: { value: 2 }, be: { trigger: "wick", armR: 1 } } } } } });
    const c = cohort(out, "london|choch_long");
    ok(c.enabled === true && c.structure === "CHoCH" && c.direction === "Long", "london|choch_long enabled, CHoCH Long");
    ok(eq(c.entry, { model: "triggered_edge", threshold: 25, arm: "C40", fill_mode: "d40", entry_key: "entry_triggered_edge_25p0_d40" }), "entry = TE 25% C40 → d40 / entry_triggered_edge_25p0_d40");
    ok(eq(c.target, { type: "rr", rr: 2 }), "target = 2R");
    ok(eq(c.be, { trigger: "wick", arm_r: 1 }), "be = wick 1R");
    ok(cohort(out, "london|bos_long").enabled === false && cohort(out, "london|choch_short").enabled === false, "other London cohorts disabled");
}

// ── 5. multi-session example ───────────────────────────────────────────────────
console.log("\n[5] multi-session example");
{
    const out = buildSessionScenarioConfig({
        enabled: true,
        sessions: {
            london:  { setups: { choch_long:  { entry: { model: "triggered_edge", threshold: 25, arm: "C40" }, target: { value: 2 } } } },
            newYork: { setups: { bos_long:    { entry: { model: "baseline" }, target: { value: 0.5 } } } },
            asia:    { setups: { choch_short: { entry: { model: "triggered_edge", threshold: 10, arm: "C20" }, target: { value: 1 } } } },
            outside: { enabled: false },
        },
        baseline: { enabled: true, mode: "eligible", target: { value: 2 } },
    });
    const enabled = out.session_strategy_scenario.cohorts.filter((c) => c.enabled);
    ok(enabled.length === 3, "exactly 3 enabled cohorts");
    ok(cohort(out, "london|choch_long").entry.entry_key === "entry_triggered_edge_25p0_d40", "London = TE25 C40");
    ok(eq(cohort(out, "newYork|bos_long").entry, { model: "baseline", entry_key: "baseline" }) && eq(cohort(out, "newYork|bos_long").target, { type: "rr", rr: 0.5 }), "New York = Baseline + 0.5R");
    ok(cohort(out, "asia|choch_short").entry.entry_key === "entry_triggered_edge_10p0_d20" && eq(cohort(out, "asia|choch_short").target, { type: "rr", rr: 1 }), "Asia = TE10 C20 + 1R");
    ok(out.session_strategy_scenario.cohorts.filter((c) => !c.enabled).length === 21, "21 disabled cohorts");
}

// ── 6. baseline_comparison ─────────────────────────────────────────────────────
console.log("\n[6] baseline_comparison");
{
    const base = {
        enabled: true,
        sessions: { london: { setups: { choch_long: { entry: { model: "triggered_edge", threshold: 25, arm: "C40" }, target: { value: 2 } } } }, newYork: { setups: { bos_long: { entry: { model: "baseline" }, target: { value: 0.5 } } } } },
    };
    const elig = buildSessionScenarioConfig({ ...base, baseline: { enabled: true, mode: "eligible", target: { value: 2 }, be: null } }).baseline_comparison;
    ok(elig.enabled === true && elig.mode === "eligible", "eligible mode");
    ok(eq(elig.entry, { model: "baseline", entry_key: "baseline" }), "baseline entry fixed to Baseline");
    ok(eq(elig.target, { type: "rr", rr: 2 }) && elig.be === null, "baseline TP = 2R, BE None");
    ok(eq(elig.eligible_cohort_keys, ["london|choch_long", "newYork|bos_long"]), "eligible cohorts = the scenario's enabled cohorts (in order)");

    const whole = buildSessionScenarioConfig({ ...base, baseline: { enabled: true, mode: "whole_run", target: { value: 2 } } }).baseline_comparison;
    ok(whole.mode === "whole_run" && whole.eligible_cohort_keys.length === 24, "whole_run → all 24 cohort keys");

    const off = buildSessionScenarioConfig({ ...base }).baseline_comparison;
    ok(eq(off, { enabled: false }), "no baseline → { enabled:false }");
}

// ── 7. Global Default inheritance (flat, single-level) ─────────────────────────
console.log("\n[7] Global Default inheritance");
{
    const out = buildSessionScenarioConfig({ enabled: true, globalDefault: { target: { value: 3.3 } }, sessions: { london: { setups: { choch_long: { entry: { model: "baseline" } } } } } });
    ok(eq(out.session_strategy_scenario.global_default.target, { type: "rr", rr: 3.3 }), "global_default.target compiled");
    ok(eq(cohort(out, "london|choch_long").target, { type: "rr", rr: 3.3 }), "cohort with no target inherits the Global Default (flat)");
    // explicit cohort value wins over global default
    const out2 = buildSessionScenarioConfig({ enabled: true, globalDefault: { target: { value: 3.3 } }, sessions: { london: { setups: { choch_long: { entry: { model: "baseline" }, target: { value: 0.5 } } } } } });
    ok(eq(cohort(out2, "london|choch_long").target, { type: "rr", rr: 0.5 }), "explicit cohort target overrides Global Default");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
