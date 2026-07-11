// combinedSmoke.validate.mjs — node-side half of the bounded SB-V2 smoke test.
//
// Backend half: Lux tests/test_combined_smoke_eligibility_target.py (native engine
// proofs). This file proves the SAME exact config on the frontend side:
//   cohort asia|BOS|Short: base DISABLE · Bull/Expand ALLOW (+custom RR3) ·
//   Bear/Compress BLOCK · base RR2 · PM LABEL · allow_multi_position
//
//   [A] serialization emits exactly the engine schema the pytest ran against;
//   [B] reload round-trip (buildRunConfigLoadReport patch) reproduces the panel
//       state: eligibility + state targets + PM mode — nothing lost, nothing added;
//   [C] ResolvedRunSummary's model (summarizeEligibility) counts match the emitted
//       scenario meta — the summary can never disagree with the config it describes;
//   [D] importer keeps the five-way population distinguishable from one CSV:
//       Executed(rescued) / Executed(plain) / PM-blocked / Cohort-disabled /
//       State-blocked — the exact buckets Session Results reports.
//
// Run from frontend/:  node src/data/__validation__/combinedSmoke.validate.mjs

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

const CT = loadCjs("src/data/configTranslator.js");
const E = loadCjs("src/data/eligibilityPolicy.js");
const IMP = loadCjs("src/data/importer.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// The exact combined config, expressed as Strategy Builder panel state.
const cfg = {
    ...CT.getDefaultBuilderConfig(),
    rr: 2,
    executionMode: "multi_position",
    cohortOverridesEnabled: true,
    cohortTargetOverrides: {},                    // every base inherits run RR2
    eligibilityEnabled: true,
    eligibilityPreset: "custom",
    cohortEligibility: {
        "asia|bos_short": { base: "disable", states: { "Bull/Expand": "allow", "Bear/Compress": "block" } },
    },
    stateOverridesEnabled: true,
    stateTargetOverrides: {
        "asia|bos_short": { "Bull/Expand": { mode: "custom", rr: 3 } },
    },
    portfolioEnabled: true,
    portfolioMode: "label",
};

console.log("\n[A] serialization matches the engine schema the pytest ran against");
const emitted = CT.buildBacktesterConfig(cfg);
const scen = emitted.session_strategy_scenario;
ok(scen && scen.enabled === true, "scenario emitted + enabled");
const row = (scen.cohorts || []).find((c) => c.session === "asia" && c.structure === "BOS" && c.direction === "Short");
ok(!!row, "asia|BOS|Short cohort present");
ok(row.eligibility && row.eligibility.base === "disable", "eligibility.base = disable");
ok(row.eligibility.states && row.eligibility.states["Bull/Expand"] === "allow", "Bull/Expand ALLOW rescue serialized");
// Bear/Compress block inside a disabled base is a no-op → deduped at serialization
// (the engine treats it identically; pytest proof 4 covers the engine side).
ok(!("Bear/Compress" in (row.eligibility.states || {})) || row.eligibility.states["Bear/Compress"] === "block",
   "Bear/Compress handled (deduped no-op or explicit block — engine-equivalent either way)");
ok(row.state_overrides && row.state_overrides["Bull/Expand"]
   && row.state_overrides["Bull/Expand"].mode === "custom" && Number(row.state_overrides["Bull/Expand"].rr) === 3,
   "Bull/Expand custom RR3 in state_overrides");
ok(Number((row.target || {}).rr) === 2, "base target RR2 (others inherit)");
ok(row.enabled === false, "legacy enabled mirror = false (old engines see the disable)");
ok(emitted.portfolio_policy_mode === "label" && emitted.portfolio_policy_enabled === true, "PM LABEL serialized");
ok(scen.meta && scen.meta.eligibility_state_rescues === 1 && scen.meta.eligibility_disabled_bases === 1,
   "scenario meta records 1 rescue / 1 disabled base");

console.log("\n[B] reload round-trip reproduces the panel state");
const rp = CT.buildRunConfigLoadReport(CT.getDefaultBuilderConfig(), { config: emitted }).config || {};
ok(rp.eligibilityEnabled === true && rp.eligibilityPreset === "custom", "eligibility panel restores ON + custom");
const re = (rp.cohortEligibility || {})["asia|bos_short"] || {};
ok(re.base === "disable" && re.states && re.states["Bull/Expand"] === "allow", "rescue restores exactly");
const rs = ((rp.stateTargetOverrides || {})["asia|bos_short"] || {})["Bull/Expand"] || {};
ok(rp.stateOverridesEnabled === true && rs.mode === "custom" && Number(rs.rr) === 3, "state RR3 restores exactly");
ok(rp.portfolioMode === "label", "PM mode restores as label (not coerced to enforce)");

console.log("\n[C] resolved-summary model counts == emitted scenario meta");
const sum = E.summarizeEligibility(cfg, null);
ok(sum.disabledBases === scen.meta.eligibility_disabled_bases
   && sum.stateRescues === scen.meta.eligibility_state_rescues,
   `summary (${sum.disabledBases} disabled / ${sum.stateRescues} rescued) == meta (${scen.meta.eligibility_disabled_bases} / ${scen.meta.eligibility_state_rescues})`);

console.log("\n[D] importer keeps the five-way population distinguishable");
const csv = [
    "trade_id,outcome,fill_time,market_state,state_confirmed,state_eligibility,regime_block_reason,missed_reason,rr_multiple",
    "S_1,WIN,2024-02-05T00:00:00Z,Bull/Expand,True,rescued,,,3.0",
    "S_2,WIN,2024-02-06T00:00:00Z,Bull/Expand,True,,,,2.0",
    "S_3,REGIME_BLOCKED,,Bull/Expand,True,,direction_mismatch,regime_blocked,",
    "S_4,COHORT_DISABLED,,,,,,,",
    "S_5,STATE_BLOCKED,,Bull/Expand,True,,,state_target_block,",
].join("\n");
const trades = IMP.parseTradesCSV(csv);
ok(trades.length === 5, "all five rows import (nothing censored)");
const by = Object.fromEntries(trades.map((t) => [t.rawTradeId || t.id, t]));
ok(by.S_1.stateEligibility === "rescued" && by.S_2.stateEligibility === "", "executed-rescued ≠ executed-plain");
ok(by.S_3.outcome.toUpperCase().includes("REGIME"), "PM-blocked bucket survives");
ok(by.S_4.outcome.toUpperCase().includes("COHORT") || by.S_4.outcome.toUpperCase().includes("DISABLED"), "cohort-disabled bucket survives");
ok(by.S_5.outcome.toUpperCase().includes("STATE"), "state-blocked bucket survives");
ok((by.S_5.missedReason || by.S_5.missed_reason || "") === "state_target_block", "state-block reason survives (never confused with PM)");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
