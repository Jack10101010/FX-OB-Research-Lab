// scenarioCompile.validate.mjs — SESSION-STRATEGY-SCENARIO (Phase 1).
//
// Validates compileScenarioToRunConfig: inheritance (global/session/cohort),
// overrides, disabled cohorts, entry/BE/target translation, deterministic
// ordering, schema stability, baseConfig merge, and graceful handling of
// dangling refs.
//
// Run from frontend/:  node src/data/__validation__/scenarioCompile.validate.mjs

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
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(spec); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const sc = loadCjs("src/data/scenarioCompile.js");
const sp = loadCjs("src/data/sessionProfiles.js");
const { compileScenarioToRunConfig, SCENARIO_SCHEMA_VERSION } = sc;
const { entryProfileId, beProfileId, targetProfileId, BASELINE_ENTRY_ID, SESSION_KEYS, CELL_KEYS } = sp;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const find = (cohorts, s, c) => cohorts.find((x) => x.cohort_key === `${s}|${c}`);

// ── fixtures ─────────────────────────────────────────────────────────────────
const TE25 = { model: "triggered_edge", threshold: 25, arm: "next" };
const TE50 = { model: "triggered_edge", threshold: 50, arm: "d2" };
const PEN = { model: "penetration", threshold: 50 };
const BE1 = { trigger: "wick", armR: 1 };
const T2 = { type: "rr", value: 2 };
const T1 = { type: "rr", value: 1 };
const idE25 = entryProfileId(TE25), idE50 = entryProfileId(TE50), idPen = entryProfileId(PEN);
const idBE1 = beProfileId(BE1), idT2 = targetProfileId(T2), idT1 = targetProfileId(T1);

const profiles = {
    enabled: true,
    profiles: {
        entry: { [idE25]: TE25, [idE50]: TE50, [idPen]: PEN },
        be: { [idBE1]: BE1 },
        target: { [idT2]: T2, [idT1]: T1 },
    },
    globalDefaultRef: { entry: idE25, be: null, target: idT2 },
    cards: {
        asia: { enabled: true, default: { targetRef: idT1 }, overrides: { choch_long: { entryRef: idE50 }, bos_short: { enabled: false } } },
        newYork: { enabled: true, default: { beRef: idBE1 }, overrides: {} },
        ny_pm: { enabled: false, default: {}, overrides: {} },
    },
};

const out = compileScenarioToRunConfig(profiles);
const scn = out.session_strategy_scenario;
const C = scn.cohorts;

// 1. schema stability ──────────────────────────────────────────────────────────
console.log("\n[1] schema");
ok(scn && scn.version === SCENARIO_SCHEMA_VERSION && scn.version === 1, "version stamped (1)");
ok(scn.enabled === true, "enabled reflects master toggle");
ok(Array.isArray(scn.cohorts) && Array.isArray(scn.warnings), "cohorts + warnings arrays");
ok("global_default" in scn && "entry" in scn.global_default && "be" in scn.global_default && "target" in scn.global_default, "global_default shape");
ok("session_strategy_scenario" in out, "block nested under session_strategy_scenario");

// 2. deterministic ordering ─────────────────────────────────────────────────────
console.log("\n[2] ordering");
ok(C.length === SESSION_KEYS.length * CELL_KEYS.length, `24 cohorts (${C.length})`);
{
    const expected = [];
    for (const s of SESSION_KEYS) for (const c of CELL_KEYS) expected.push(`${s}|${c}`);
    ok(JSON.stringify(C.map((x) => x.cohort_key)) === JSON.stringify(expected), "cohorts in SESSIONS × CELLS order");
    ok(C[0].session === "london" && C[0].structure === "BOS" && C[0].direction === "Long", "first cohort = london BOS Long");
    ok(JSON.stringify(compileScenarioToRunConfig(profiles)) === JSON.stringify(out), "compile is deterministic (stable JSON)");
}

// 3. global inheritance ─────────────────────────────────────────────────────────
console.log("\n[3] global inheritance");
{
    const cell = find(C, "london", "bos_long");
    ok(cell.entry && cell.entry.model === "triggered_edge" && cell.entry.threshold === 25, "london BOS Long inherits global entry TE25");
    ok(cell.be === null, "london BOS Long be null (no global BE)");
    ok(cell.target && cell.target.rr === 2, "london BOS Long inherits global target 2R");
}

// 4. session inheritance ────────────────────────────────────────────────────────
console.log("\n[4] session inheritance");
{
    const a = find(C, "asia", "bos_long");
    ok(a.target && a.target.rr === 1, "asia BOS Long uses session-default target 1R");
    ok(a.entry && a.entry.threshold === 25, "asia BOS Long still inherits global entry TE25");
    const ny = find(C, "newYork", "bos_long");
    ok(ny.be && ny.be.trigger === "wick" && ny.be.arm_r === 1, "newYork BOS Long uses session-default BE (wick 1R)");
}

// 5. cohort override beats session/global ───────────────────────────────────────
console.log("\n[5] cohort override");
{
    const cl = find(C, "asia", "choch_long");
    ok(cl.entry && cl.entry.threshold === 50 && cl.entry.arm === "d2", "asia CHoCH Long cohort entry TE50/d2");
    ok(cl.target && cl.target.rr === 1, "asia CHoCH Long still inherits session target 1R");
}

// 6. disabled cohorts ───────────────────────────────────────────────────────────
console.log("\n[6] disabled");
{
    const bs = find(C, "asia", "bos_short");
    ok(bs.enabled === false && bs.entry === null && bs.be === null && bs.target === null, "cohort-disabled → enabled:false, all null");
    const nyAll = C.filter((x) => x.session === "ny_pm");
    ok(nyAll.length === 4 && nyAll.every((x) => x.enabled === false), "session-disabled ny_pm → all 4 cohorts disabled");
}

// 7. entry/BE/target translation ────────────────────────────────────────────────
console.log("\n[7] translation");
{
    const cl = find(C, "asia", "choch_long");
    ok(cl.entry.fill_mode === "d2", "arm d2 → fill_mode d2");
    ok(cl.entry.entry_key === "entry_triggered_edge_50p0_d2", `entry_key built (${cl.entry.entry_key})`);
    const ln = find(C, "london", "bos_long");
    ok(ln.entry.fill_mode === "next" && ln.entry.entry_key === "entry_triggered_edge_25p0_next", "arm next → fill_mode next + key");
    ok(scn.global_default.target.type === "rr" && scn.global_default.target.rr === 2, "target compiles to {type:'rr', rr}");
    ok(find(C, "newYork", "bos_long").be.arm_r === 1, "BE compiles to {trigger, arm_r}");
    // reserved slots present
    ok(ln.protection === null && ln.exec && "entry_buffer_pips" in ln.exec && "stop_buffer_pips" in ln.exec && "ob_entry_depth_pct" in ln.exec && "verify_limit_ticks" in ln.exec, "reserved protection + exec slots present");
}

// 8. baseline + penetration entry ───────────────────────────────────────────────
console.log("\n[8] baseline + penetration");
{
    const baseOut = compileScenarioToRunConfig({ enabled: true, globalDefaultRef: { entry: BASELINE_ENTRY_ID } }).session_strategy_scenario;
    ok(baseOut.global_default.entry.model === "baseline" && baseOut.global_default.entry.entry_key === "baseline", "baseline entry compiles");
    const penOut = compileScenarioToRunConfig({ enabled: true, profiles: { entry: { [idPen]: PEN } }, globalDefaultRef: { entry: idPen } }).session_strategy_scenario;
    ok(penOut.global_default.entry.model === "penetration" && penOut.global_default.entry.entry_key === "entry_penetration_50p0", "penetration entry compiles");
}

// 9. baseConfig merge ───────────────────────────────────────────────────────────
console.log("\n[9] baseConfig merge");
{
    const merged = compileScenarioToRunConfig(profiles, { rr_multiple: 3.3, symbol: "EURUSD" });
    ok(merged.rr_multiple === 3.3 && merged.symbol === "EURUSD", "baseConfig fields preserved");
    ok(merged.session_strategy_scenario && merged.session_strategy_scenario.version === 1, "scenario block added alongside baseConfig");
}

// 10. dangling ref handled (missing profile) ────────────────────────────────────
console.log("\n[10] dangling ref");
{
    const o = compileScenarioToRunConfig({ enabled: true, globalDefaultRef: { entry: "nonexistent_id" }, profiles: {}, cards: {} }).session_strategy_scenario;
    ok(o.global_default.entry === null, "dangling globalDefault entry → null (normalized away)");
    ok(o.cohorts.every((x) => x.entry === null), "no cohort inherits a dangling entry");
}

// 11. disabled master toggle still compiles deterministically ────────────────────
console.log("\n[11] disabled master toggle");
{
    const o = compileScenarioToRunConfig({ ...profiles, enabled: false }).session_strategy_scenario;
    ok(o.enabled === false, "scenario.enabled false when master off");
    ok(o.cohorts.length === 24, "cohorts still fully emitted when master off");
}

// 12. deep arms + low thresholds compile (C0–C50, threshold 0.5–5) ──────────────
console.log("\n[12] deep arms + low thresholds");
{
    const TE3_C40 = { model: "triggered_edge", threshold: 3, arm: "d40" };
    const idDeep = entryProfileId(TE3_C40);
    const o = compileScenarioToRunConfig({
        enabled: true,
        profiles: { entry: { [idDeep]: TE3_C40 } },
        globalDefaultRef: { entry: idDeep },
    }).session_strategy_scenario;
    const e = o.global_default.entry;
    ok(e.model === "triggered_edge" && e.threshold === 3, "TE 3% C40 compiles (model + threshold)");
    ok(e.arm === "d40" && e.fill_mode === "d40", "arm/fill_mode carry C40 (d40)");
    ok(e.entry_key === "entry_triggered_edge_3p0_d40", `entry_key = entry_triggered_edge_3p0_d40 (${e.entry_key})`);
    // every cohort inheriting it carries the deep arm
    ok(o.cohorts.every((x) => x.entry && x.entry.fill_mode === "d40"), "all cohorts inherit C40 fill_mode");

    // fractional threshold + deepest arm
    const TE05_C50 = { model: "triggered_edge", threshold: 0.5, arm: "d50" };
    const id05 = entryProfileId(TE05_C50);
    const o2 = compileScenarioToRunConfig({
        enabled: true, profiles: { entry: { [id05]: TE05_C50 } }, globalDefaultRef: { entry: id05 },
    }).session_strategy_scenario;
    ok(o2.global_default.entry.entry_key === "entry_triggered_edge_0p5_d50", "TE 0.5% C50 → entry_triggered_edge_0p5_d50");

    // C0/C1 regression: same/next still map correctly
    const TE5_C0 = { model: "triggered_edge", threshold: 5, arm: "same" };
    const id5 = entryProfileId(TE5_C0);
    const o3 = compileScenarioToRunConfig({
        enabled: true, profiles: { entry: { [id5]: TE5_C0 } }, globalDefaultRef: { entry: id5 },
    }).session_strategy_scenario;
    ok(o3.global_default.entry.fill_mode === "same" && o3.global_default.entry.entry_key === "entry_triggered_edge_5p0_same", "TE 5% C0 → fill_mode same + key");
}

// 13. custom RR targets compile to exact target.rr ───────────────────────────────
console.log("\n[13] custom RR targets");
{
    for (const v of [0.25, 0.5, 0.75, 1.2, 2.7, 10]) {
        const sel = { type: "rr", value: v };
        const id = targetProfileId(sel);
        const o = compileScenarioToRunConfig({
            enabled: true,
            profiles: { target: { [id]: sel } },
            globalDefaultRef: { target: id },
        }).session_strategy_scenario;
        ok(o.global_default.target.type === "rr" && o.global_default.target.rr === v, `custom ${v}R → target.rr === ${v} exactly`);
        // every inheriting cohort carries the exact rr
        ok(o.cohorts.every((x) => x.target && x.target.rr === v), `all cohorts inherit ${v}R`);
    }
    // Cohort-level custom override beats global custom default.
    const idA = targetProfileId({ type: "rr", value: 1.2 });
    const idB = targetProfileId({ type: "rr", value: 2.7 });
    const o2 = compileScenarioToRunConfig({
        enabled: true,
        profiles: { target: { [idA]: { type: "rr", value: 1.2 }, [idB]: { type: "rr", value: 2.7 } } },
        globalDefaultRef: { target: idA },
        cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { targetRef: idB } } } },
    }).session_strategy_scenario;
    ok(find(o2.cohorts, "asia", "choch_long").target.rr === 2.7, "cohort custom 2.7R overrides global custom 1.2R");
    ok(find(o2.cohorts, "london", "bos_long").target.rr === 1.2, "non-overridden cohort keeps global custom 1.2R");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
