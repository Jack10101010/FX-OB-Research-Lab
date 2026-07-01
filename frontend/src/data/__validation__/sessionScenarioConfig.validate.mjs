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
    ok(eq(Object.keys(c0), ["session", "structure", "direction", "cohort_key", "enabled", "be", "target", "risk_reduction", "risk_amount", "protection", "exec"]), "cohort carries the exact v1 schema keys (no entry; + risk_amount)");
    // V1: entry is GLOBAL — NO cohort emits an entry key.
    ok(scn.cohorts.every((c) => !("entry" in c)), "no cohort emits a per-cohort `entry` key (v1)");
    ok(!("entry" in scn.global_default) && "risk_amount" in scn.global_default, "global_default has no entry; carries risk_amount (v1)");
}

// ── 3. disabled cohorts ────────────────────────────────────────────────────────
console.log("\n[3] disabled cohorts");
{
    const out = buildSessionScenarioConfig({ enabled: true, sessions: { london: { setups: { choch_long: { entry: { model: "baseline" }, target: { value: 1 } } } }, outside: { enabled: false } } });
    const c = cohort(out, "london|bos_long"); // not a configured setup → disabled
    ok(c.enabled === false && c.be === null && c.target === null && c.risk_reduction === null && c.risk_amount === null && !("entry" in c), "unconfigured cohort → disabled, all dims null, no entry");
    ok(c.protection === null && eq(c.exec, { entry_buffer_pips: null, stop_buffer_pips: null, ob_entry_depth_pct: null, verify_limit_ticks: null }), "disabled cohort exec/protection reserved-null");
    const outsideC = cohort(out, "outside|choch_long");
    ok(outsideC.enabled === false, "whole disabled session → its cohorts disabled");
    // explicit setup.enabled:false also disables
    const out2 = buildSessionScenarioConfig({ enabled: true, sessions: { asia: { setups: { bos_long: { enabled: false, entry: { model: "baseline" } } } } } });
    ok(cohort(out2, "asia|bos_long").enabled === false, "setup.enabled:false → cohort disabled");
}

// ── 4. London CHoCH Long example (v1: TP + BE + risk_amount; NO per-cohort entry) ─
console.log("\n[4] London CHoCH Long = 2R + wick 1R + risk_amount 0.5 (entry is global)");
{
    const out = buildSessionScenarioConfig({ enabled: true, sessions: { london: { setups: { choch_long: { target: { value: 2 }, be: { trigger: "wick", armR: 1 }, riskAmount: 0.5 } } } } });
    const c = cohort(out, "london|choch_long");
    ok(c.enabled === true && c.structure === "CHoCH" && c.direction === "Long", "london|choch_long enabled, CHoCH Long");
    ok(!("entry" in c), "no per-cohort entry key (entry is the global run sweep)");
    ok(eq(c.target, { type: "rr", rr: 2 }), "target = 2R");
    ok(eq(c.be, { trigger: "wick", arm_r: 1 }), "be = wick 1R");
    ok(c.risk_amount === 0.5, "risk_amount = 0.5 compiles");
    ok(cohort(out, "london|bos_long").enabled === false && cohort(out, "london|choch_short").enabled === false, "other London cohorts disabled");
}

// ── 5. multi-session example (v1: per-cohort TP / risk_amount / move_stop) ───────
console.log("\n[5] multi-session example");
{
    const out = buildSessionScenarioConfig({
        enabled: true,
        sessions: {
            london:  { setups: { choch_long:  { target: { value: 2 }, riskAmount: 1.0 } } },
            newYork: { setups: { bos_long:    { target: { value: 0.5 }, riskAmount: 0.25 } } },
            asia:    { setups: { choch_short: { target: { value: 1 }, riskReduction: { kind: "move_stop", atR: 1, toR: 0.5 } } } },
            outside: { enabled: false },
        },
        baseline: { enabled: true, mode: "eligible", target: { value: 2 } },
    });
    const enabled = out.session_strategy_scenario.cohorts.filter((c) => c.enabled);
    ok(enabled.length === 3, "exactly 3 enabled cohorts");
    ok(enabled.every((c) => !("entry" in c)), "no enabled cohort emits entry (entry is global)");
    ok(eq(cohort(out, "london|choch_long").target, { type: "rr", rr: 2 }) && cohort(out, "london|choch_long").risk_amount === 1.0, "London = 2R, risk_amount 1.0");
    ok(eq(cohort(out, "newYork|bos_long").target, { type: "rr", rr: 0.5 }) && cohort(out, "newYork|bos_long").risk_amount === 0.25, "New York = 0.5R, risk_amount 0.25");
    ok(eq(cohort(out, "asia|choch_short").risk_reduction, { kind: "move_stop", at_r: 1, to_r: 0.5 }), "Asia = move_stop {at_r:1,to_r:0.5}");
    ok(out.session_strategy_scenario.cohorts.filter((c) => !c.enabled).length === 21, "21 disabled cohorts");
}

// ── 5b. risk_amount + global_default.risk_amount inheritance + move_stop ──────────
console.log("\n[5b] risk_amount + global_default + move_stop");
{
    const out = buildSessionScenarioConfig({
        enabled: true,
        globalDefault: { riskAmount: 0.5, riskReduction: { kind: "move_stop", atR: 1, toR: 0.25 } },
        sessions: {
            london: { setups: { choch_long: { target: { value: 2 } } } },             // inherits gd riskAmount 0.5 + gd move_stop
            asia:   { setups: { bos_long:   { target: { value: 1 }, riskAmount: 0.1 } } }, // explicit overrides gd
        },
    });
    ok(out.session_strategy_scenario.global_default.risk_amount === 0.5, "global_default.risk_amount = 0.5 compiles");
    ok(eq(out.session_strategy_scenario.global_default.risk_reduction, { kind: "move_stop", at_r: 1, to_r: 0.25 }), "global_default.risk_reduction move_stop compiles");
    ok(cohort(out, "london|choch_long").risk_amount === 0.5, "cohort with no risk_amount inherits the Global Default (0.5)");
    ok(eq(cohort(out, "london|choch_long").risk_reduction, { kind: "move_stop", at_r: 1, to_r: 0.25 }), "cohort inherits global_default move_stop");
    ok(cohort(out, "asia|bos_long").risk_amount === 0.1, "explicit cohort risk_amount (0.1) overrides the Global Default");
    // 0 is valid; negative ignored → null
    const out2 = buildSessionScenarioConfig({ enabled: true, sessions: { london: { setups: {
        choch_long: { target: { value: 1 }, riskAmount: 0 },
        bos_long:   { target: { value: 1 }, riskAmount: -5 },
    } } } });
    ok(cohort(out2, "london|choch_long").risk_amount === 0, "risk_amount 0.0 compiles to 0 (valid)");
    ok(cohort(out2, "london|bos_long").risk_amount === null, "negative risk_amount → null (backend 1.0 default)");
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
