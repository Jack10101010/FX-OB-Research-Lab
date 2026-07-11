// cohortScenarioE2E.validate.mjs — Phase 1 end-to-end config path.
//
// Proves the FULL Run Workspace path through configTranslator: the panel state →
// buildBacktesterConfig → session_strategy_scenario (exact backend shape), for the
// required presets, and the reload/persistence round-trip (config → importer → panel
// state → identical scenario). Uses a real @/-alias-resolving loader so
// buildSessionStrategyScenario runs inside configTranslator exactly as in the app.
//
// Run from frontend/:  node src/data/__validation__/cohortScenarioE2E.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function resolveSpec(spec, fromDir) {
    if (spec.startsWith("@/")) return path.resolve("src", spec.slice(2));
    if (spec.startsWith(".")) return path.resolve(fromDir, spec);
    return null; // bare module → stub
}
function load(absPath) {
    let p = absPath;
    if (!p.endsWith(".js") && !p.endsWith(".json")) p = `${p}.js`;
    p = path.resolve(p);
    if (cache.has(p)) return cache.get(p);
    if (p.endsWith(".json")) { const j = JSON.parse(fs.readFileSync(p, "utf8")); cache.set(p, j); return j; }
    const { code } = babel.transformSync(fs.readFileSync(p, "utf8"), {
        filename: p, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(p, mod.exports);
    const req = (spec) => {
        const r = resolveSpec(spec, path.dirname(p));
        if (!r) return {};
        // try .js then .json
        if (fs.existsSync(r) || fs.existsSync(`${r}.js`)) return load(r.endsWith(".js") || r.endsWith(".json") ? r : `${r}.js`);
        if (fs.existsSync(`${r}.json`)) return load(`${r}.json`);
        return {};
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(p, mod.exports);
    return mod.exports;
}

const ct = load("src/data/configTranslator.js");
const M = load("src/data/cohortTargetOverrides.js");
const { buildBacktesterConfig, buildRunConfigLoadReport } = ct;
const { applyPreset, PRESETS, FINAL_CANDIDATE_TARGETS } = M;

// Reload a saved payload back into builder cfg via the real importer.
const importer = (payload) => buildRunConfigLoadReport({}, { config: payload }).config;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const scenOf = (cfg) => buildBacktesterConfig(cfg).session_strategy_scenario;
const enOf = (s) => s.cohorts.filter((c) => c.target);
const disOf = (s) => s.cohorts.filter((c) => c.enabled === false);
const keyOf = (c) => `${c.session}|${{ BOS: { Long: "bos_long", Short: "bos_short" }, CHoCH: { Long: "choch_long", Short: "choch_short" } }[c.structure][c.direction]}`;

console.log("cohortScenarioE2E.validate.mjs");

// ── Test 1: All enabled at RR2 ──────────────────────────────────────────────────
{
    const p = applyPreset(PRESETS.ALL_RR2);
    const cfg = { cohortOverridesEnabled: true, rr: 3.3, cohortTargetOverrides: p.overrides, cohortOverridesPreset: p.preset };
    const s = scenOf(cfg);
    ok(s && s.enabled === true && s.cohorts.length === 24, "T1 all-RR2: scenario has 24 cohorts, enabled:true");
    ok(enOf(s).length === 24 && enOf(s).every((c) => c.target.rr === 2.0), "T1 all-RR2: 24 enabled, every target rr=2.0");
    ok(disOf(s).length === 0, "T1 all-RR2: no disabled cohorts");
}

// ── Test 2: Final base-target candidate ─────────────────────────────────────────
{
    const p = applyPreset(PRESETS.FINAL_CANDIDATE);
    const cfg = { cohortOverridesEnabled: true, rr: 2.0, cohortTargetOverrides: p.overrides, cohortOverridesPreset: p.preset };
    const s = scenOf(cfg);
    ok(enOf(s).length === 12 && disOf(s).length === 12, "T2 final: 12 enabled + 12 disabled");
    const map = Object.fromEntries(enOf(s).map((c) => [keyOf(c), c.target.rr]));
    ok(Object.entries(FINAL_CANDIDATE_TARGETS).every(([k, v]) => map[k] === v), "T2 final: enabled targets match frozen book exactly");
    ok(map["lull|bos_short"] === 3.25 && map["outside|choch_long"] === 0.5, "T2 final: lull|bos_short=3.25, outside|choch_long=0.5");
    ok(s.meta.preset === PRESETS.FINAL_CANDIDATE && s.meta.enabled_count === 12, "T2 final: meta stamps preset + enabled_count");
}

// ── Test 3: Same enabled cohorts, all RR2 (mandatory control) ────────────────────
{
    const fin = applyPreset(PRESETS.FINAL_CANDIDATE);
    const ctl = applyPreset(PRESETS.SAME_ENABLED_RR2);
    const sFin = scenOf({ cohortOverridesEnabled: true, rr: 2.0, cohortTargetOverrides: fin.overrides });
    const sCtl = scenOf({ cohortOverridesEnabled: true, rr: 2.0, cohortTargetOverrides: ctl.overrides });
    const enSet = (s) => enOf(s).map(keyOf).sort().join(",");
    ok(enSet(sFin) === enSet(sCtl), "T3 control: same 12 enabled cohorts as final candidate");
    ok(enOf(sCtl).every((c) => c.target.rr === 2.0), "T3 control: every enabled at rr=2.0");
    ok(disOf(sCtl).length === 12, "T3 control: same 12 disabled");
}

// ── Test 4: Reload / persistence round-trip ─────────────────────────────────────
{
    ok(typeof importer === "function", "T4: importer function located");
    if (typeof importer === "function") {
        const p = applyPreset(PRESETS.FINAL_CANDIDATE);
        const cfg0 = { cohortOverridesEnabled: true, rr: 2.0, cohortTargetOverrides: p.overrides, cohortOverridesPreset: p.preset };
        const payload = buildBacktesterConfig(cfg0);      // save
        const restored = importer(payload);               // reload
        const cfg1 = { cohortOverridesEnabled: restored.cohortOverridesEnabled, rr: 2.0,
            cohortTargetOverrides: restored.cohortTargetOverrides, cohortOverridesPreset: restored.cohortOverridesPreset };
        const s0 = payload.session_strategy_scenario;
        const s1 = buildBacktesterConfig(cfg1).session_strategy_scenario;
        ok(restored.cohortOverridesEnabled === true, "T4: reload restores panel gate ON");
        ok(JSON.stringify(s0.cohorts) === JSON.stringify(s1.cohorts),
            "T4: re-serialized scenario cohorts byte-identical after reload (persistence)");
        ok(restored.cohortOverridesPreset === PRESETS.FINAL_CANDIDATE, "T4: preset provenance restored");
    }
}

// ── Test 4b: gate OFF emits no scenario (byte-identical normal run) ─────────────
{
    const cfg = { cohortOverridesEnabled: false, rr: 3.3, cohortTargetOverrides: applyPreset(PRESETS.ALL_RR2).overrides };
    ok(!("session_strategy_scenario" in buildBacktesterConfig(cfg)), "T4b: gate OFF → no session_strategy_scenario key");
}

console.log(fail === 0 ? "\nALL PASSED" : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
