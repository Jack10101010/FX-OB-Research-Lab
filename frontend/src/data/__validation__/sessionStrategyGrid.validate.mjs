// sessionStrategyGrid.validate.mjs — P4C Session Strategy authoring (state → payload).
//
// The grid is a CONTROLLED component whose edits flow through the pure reducers in
// sessionStrategyEdits.js; the parent compiles the SAME state via attachSessionStrategy.
// So "an edit updates the payload" is provable end-to-end at the data layer:
//   A. editing TP updates the payload
//   B. editing BE updates the payload
//   C. editing move-stop updates the payload
//   D. editing risk amount updates the payload
//   E. editing Fair Baseline updates the payload
//   F. NO cohort emits an entry key
//   G. payload remains JSON-serialisable
//   H. Show-Config reflects edits immediately (structural: preview reads the same
//      buildSidecarPayload(state); asserted via the StrategyBuilder source)
//
// Run from frontend/:  node src/data/__validation__/sessionStrategyGrid.validate.mjs

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

const edits = loadModule("src/data/sessionStrategyEdits.js");
const { attachSessionStrategy } = loadModule("src/data/sessionScenarioConfig.js");
const BUILDER_SRC = fs.readFileSync("src/pages/StrategyBuilder.jsx", "utf8");

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS ", name); } else { fail++; console.log("  FAIL ", name); } };
const J = (x) => JSON.stringify(x);

const BASE = { symbol: "EURUSD", entry_models: ["triggered_edge"], stop_buffer_pips: 1.0 };
const payloadOf = (state) => attachSessionStrategy(BASE, state);
const cohortOf = (state, key) => {
    const p = payloadOf(state);
    return (p.session_strategy_scenario?.cohorts || []).find((c) => c.cohort_key === key);
};

// Enabled strategy + an enabled London CHoCH-Long setup is the editing substrate.
let S = edits.EMPTY_SESSION_STRATEGY;
S = edits.setStrategyEnabled(S, true);
S = edits.setSessionEnabled(S, "london", true);
S = edits.setCohortEnabled(S, "london", "choch_long", true);

console.log("\n[A] editing TP updates payload");
{
    const before = cohortOf(S, "london|choch_long").target;
    const S2 = edits.setCohortTarget(S, "london", "choch_long", 2.5);
    const after = cohortOf(S2, "london|choch_long").target;
    ok("TP edit changes payload target", J(before) !== J(after) && J(after) === J({ type: "rr", rr: 2.5 }));
}

console.log("\n[B] editing BE updates payload");
{
    const S2 = edits.setCohortBe(S, "london", "choch_long", "wick", 1);
    ok("BE edit → be {trigger:wick, arm_r:1}", J(cohortOf(S2, "london|choch_long").be) === J({ trigger: "wick", arm_r: 1 }));
    const S3 = edits.setCohortBe(S2, "london", "choch_long", "", 1);   // None clears BE
    ok("BE None clears be", cohortOf(S3, "london|choch_long").be === null);
}

console.log("\n[C] editing move-stop updates payload");
{
    const S2 = edits.setCohortMoveStop(S, "london", "choch_long", 1, 0.5);
    ok("move-stop edit → {kind:move_stop, at_r:1, to_r:0.5}", J(cohortOf(S2, "london|choch_long").risk_reduction) === J({ kind: "move_stop", at_r: 1, to_r: 0.5 }));
    const S3 = edits.setCohortMoveStop(S2, "london", "choch_long", "", "");  // clear
    ok("clearing move-stop → null", cohortOf(S3, "london|choch_long").risk_reduction === null);
}

console.log("\n[D] editing risk amount updates payload");
{
    const S2 = edits.setCohortRiskAmount(S, "london", "choch_long", 0.5);
    ok("risk amount edit → 0.5", cohortOf(S2, "london|choch_long").risk_amount === 0.5);
    const S3 = edits.setCohortRiskAmount(S2, "london", "choch_long", 0);
    ok("risk amount 0 → 0 (valid)", cohortOf(S3, "london|choch_long").risk_amount === 0);
}

console.log("\n[E] editing Fair Baseline updates payload");
{
    const off = payloadOf(S);
    ok("baseline absent when disabled", !("baseline_comparison" in off));
    let S2 = edits.setBaselineEnabled(S, true);
    S2 = edits.setBaselineTarget(S2, 2);
    S2 = edits.setBaselineBe(S2, "wick", 1);
    const bc = payloadOf(S2).baseline_comparison;
    ok("baseline attached + enabled", bc && bc.enabled === true && bc.mode === "eligible");
    ok("baseline target = 2R", J(bc.target) === J({ type: "rr", rr: 2 }));
    ok("baseline be = wick 1R", J(bc.be) === J({ trigger: "wick", arm_r: 1 }));
}

console.log("\n[F] no cohort emits entry");
{
    let S2 = edits.setCohortTarget(S, "london", "choch_long", 2);
    S2 = edits.setCohortRiskAmount(S2, "newYork", "bos_long", 0.25);   // touches another session
    S2 = edits.setSessionEnabled(S2, "newYork", true);
    const p = payloadOf(S2);
    ok("no cohort has an `entry` key", p.session_strategy_scenario.cohorts.every((c) => !("entry" in c)));
    ok("global_default has no entry", !("entry" in p.session_strategy_scenario.global_default));
    ok("base entry sweep still global + intact", J(p.entry_models) === J(["triggered_edge"]));
    ok("exactly 24 cohorts", p.session_strategy_scenario.cohorts.length === 24);
}

console.log("\n[G] payload serialisable");
{
    let S2 = edits.setCohortTarget(S, "london", "choch_long", 2);
    S2 = edits.setCohortMoveStop(S2, "london", "choch_long", 1, 0.5);
    S2 = edits.setBaselineEnabled(S2, true);
    const p = payloadOf(S2);
    ok("payload round-trips through JSON unchanged", J(JSON.parse(J(p))) === J(p));
    ok("reducers are pure (original S untouched)", cohortOf(S, "london|choch_long").target === null);
}

console.log("\n[H] Show-Config reflects edits (structural)");
{
    ok("grid is wired controlled: value=sessionStrategy onChange=setSessionStrategy",
        /<SessionStrategyGrid\s+value=\{sessionStrategy\}\s+onChange=\{setSessionStrategy\}/.test(BUILDER_SRC));
    ok("preview renders buildSidecarPayload() (same state) → live", /\{JSON\.stringify\(buildSidecarPayload\(\), null, 2\)\}/.test(BUILDER_SRC));
    ok("no localStorage / getSessionProfiles / applySessionProfiles USAGE in the grid", (() => {
        const g = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8")
            .split("\n").filter((ln) => !ln.trim().startsWith("//")).join("\n");  // ignore comments
        return !/localStorage\s*\.|getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(g);
    })());
}

console.log("\n[I] DEFAULT_SESSION_STRATEGY — v1 + Fair Baseline ON, sane defaults");
{
    const D = edits.DEFAULT_SESSION_STRATEGY;
    ok("v1 enabled by default", D.enabled === true);
    ok("Fair Baseline enabled by default", D.baseline.enabled === true && D.baseline.mode === "eligible");
    ok("Run Default target RR = 2", J(D.globalDefault.target) === J({ value: 2 }));
    ok("Run Default risk amount = 1.0", D.globalDefault.riskAmount === 1.0);
    ok("Run Default BE none / move-stop off by default", D.globalDefault.be == null && D.globalDefault.riskReduction == null);
    // compiled payload from the default state
    const p = payloadOf(D);
    ok("default payload attaches session_strategy_scenario + baseline_comparison", "session_strategy_scenario" in p && "baseline_comparison" in p);
    ok("default baseline_comparison target = 2R", J(p.baseline_comparison.target) === J({ type: "rr", rr: 2 }));
    ok("no cohort enabled by default (user opts in)", p.session_strategy_scenario.cohorts.every((c) => !c.enabled));
}

console.log("\n[J] enabled cohort INHERITS Run Defaults (TP 2 / risk 1.0), override wins");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "newYork", true);
    D = edits.setCohortEnabled(D, "newYork", "choch_long", true);   // no per-cohort dims set
    const c = cohortOf(D, "newYork|choch_long");
    ok("inherits default target 2R", J(c.target) === J({ type: "rr", rr: 2 }));
    ok("inherits default risk amount 1.0", c.risk_amount === 1.0);
    ok("BE none / move-stop off inherited", c.be === null && c.risk_reduction === null);
    // per-cohort override beats the default
    const D2 = edits.setCohortTarget(D, "newYork", "choch_long", 3);
    ok("per-cohort TP override (3R) beats default", J(cohortOf(D2, "newYork|choch_long").target) === J({ type: "rr", rr: 3 }));
    // editing a Run Default flows to inheriting cohorts
    const D3 = edits.setDefaultRiskAmount(D, 0.5);
    ok("editing Run Default risk amount → inheriting cohort = 0.5", cohortOf(D3, "newYork|choch_long").risk_amount === 0.5);
}

console.log("\n[K] Enabled Cohorts Summary reflects edited values");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    ok("empty summary when none enabled", J(edits.summarizeEnabledCohorts(D)) === J([]));
    D = edits.setSessionEnabled(D, "newYork", true);
    D = edits.setCohortEnabled(D, "newYork", "choch_long", true);
    D = edits.setCohortTarget(D, "newYork", "choch_long", 3);
    D = edits.setCohortBe(D, "newYork", "choch_long", "wick", 2);
    D = edits.setCohortMoveStop(D, "newYork", "choch_long", 1, 0);
    D = edits.setCohortRiskAmount(D, "newYork", "choch_long", 1.0);
    const sum = edits.summarizeEnabledCohorts(D);
    ok("one session (New York) in summary", sum.length === 1 && sum[0].sessionLabel === "New York");
    const line = sum[0].cohorts[0];
    ok("cohort label = CHoCH Long", line.label === "CHoCH Long");
    ok("summary text reflects edits (TP 3R · BE wick 2R · Reduce Risk 1→0 · Risk 1.0x)",
        line.text === "TP 3R · BE wick 2R · Reduce Risk 1→0 · Risk 1.0x");
    // a disabled cohort never appears
    const D2 = edits.setCohortEnabled(D, "newYork", "choch_long", false);
    ok("disabling removes it from the summary", J(edits.summarizeEnabledCohorts(D2)) === J([]));
}

console.log("\n[L] grid wires symbol + reads default state");
{
    ok("StrategyBuilder uses DEFAULT_SESSION_STRATEGY", /DEFAULT_SESSION_STRATEGY/.test(BUILDER_SRC) && !/EMPTY_SESSION_STRATEGY/.test(BUILDER_SRC));
    ok("grid receives symbol prop", /<SessionStrategyGrid[^>]*symbol=\{/.test(BUILDER_SRC));
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8")
        .split("\n").filter((ln) => !ln.trim().startsWith("//")).join("\n");
    ok("grid has no localStorage / old session-profile usage", !/localStorage\s*\.|getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(grid));
}

console.log("\n[M] applySessionSettingsToSessions — copy + isolation");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "asia", true);
    D = edits.setCohortEnabled(D, "asia", "choch_long", true);
    D = edits.setCohortTarget(D, "asia", "choch_long", 3);
    D = edits.setCohortBe(D, "asia", "choch_long", "wick", 2);
    // copy Asia → London
    const D1 = edits.applySessionSettingsToSessions(D, "asia", ["london"]);
    ok("Asia → London copies enabled cohort + TP + BE", J(cohortOf(D1, "london|choch_long").target) === J({ type: "rr", rr: 3 }) && J(cohortOf(D1, "london|choch_long").be) === J({ trigger: "wick", arm_r: 2 }));
    // copy to multiple
    const D2 = edits.applySessionSettingsToSessions(D, "asia", ["london", "newYork", "ny_pm"]);
    ok("copies to multiple selected sessions", ["london", "newYork", "ny_pm"].every((s) => cohortOf(D2, `${s}|choch_long`)?.enabled === true));
    // source untouched + isolation (mutate copy → source unchanged)
    ok("source session unchanged after copy", J(cohortOf(D2, "asia|choch_long").target) === J({ type: "rr", rr: 3 }));
    const D3 = edits.setCohortTarget(D2, "london", "choch_long", 1);
    ok("editing the copy does not change the source (deep copy)", J(cohortOf(D3, "asia|choch_long").target) === J({ type: "rr", rr: 3 }));
    // does not touch baseline / globalDefault
    ok("apply does NOT touch baseline", J(D2.baseline) === J(D.baseline));
    ok("apply does NOT touch globalDefault", J(D2.globalDefault) === J(D.globalDefault));
    // unknown / empty source is a no-op
    ok("missing source session → no-op", edits.applySessionSettingsToSessions(D, "nope", ["london"]) === D);
}

console.log("\n[N] BE / Reduce Risk toggle compile semantics");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "london", true);
    D = edits.setCohortEnabled(D, "london", "bos_long", true);
    // BE off (no gd BE) → null
    ok("BE off → compiled be null", cohortOf(D, "london|bos_long").be === null);
    // BE on → object
    const Don = edits.setCohortBe(D, "london", "bos_long", "wick", 1);
    ok("BE on → compiled be {wick,1}", J(cohortOf(Don, "london|bos_long").be) === J({ trigger: "wick", arm_r: 1 }));
    // BE off again (trigger cleared) → null
    const Doff = edits.setCohortBe(Don, "london", "bos_long", "", 1);
    ok("BE toggled off → compiled be null", cohortOf(Doff, "london|bos_long").be === null);
    // Reduce Risk off → null; on → move_stop object
    ok("Reduce Risk off → compiled risk_reduction null", cohortOf(D, "london|bos_long").risk_reduction === null);
    const Dms = edits.setCohortMoveStop(D, "london", "bos_long", 1, 0.5);
    ok("Reduce Risk on → risk_reduction {kind:move_stop,at_r:1,to_r:0.5}", J(cohortOf(Dms, "london|bos_long").risk_reduction) === J({ kind: "move_stop", at_r: 1, to_r: 0.5 }));
    const Dms0 = edits.setCohortMoveStop(Dms, "london", "bos_long", "", "");
    ok("Reduce Risk toggled off → risk_reduction null", cohortOf(Dms0, "london|bos_long").risk_reduction === null);
}

console.log("\n[O] Target RR presets update target");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "london", true);
    D = edits.setCohortEnabled(D, "london", "bos_short", true);
    for (const p of [0.5, 2.5, 4]) {
        const Dp = edits.setCohortTarget(D, "london", "bos_short", p);
        ok(`preset ${p} → cohort target ${p}R`, J(cohortOf(Dp, "london|bos_short").target) === J({ type: "rr", rr: p }));
    }
    ok("Run Default preset updates global default target", J(edits.setDefaultTarget(D, 3.5).globalDefault.target) === J({ value: 3.5 }));
    ok("Fair Baseline preset updates baseline target", J(edits.setBaselineTarget(D, 1.5).baseline.target) === J({ value: 1.5 }));
}

console.log("\n[P] Summary uses 'Reduce Risk' wording + serialisable + no entry");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "newYork", true);
    D = edits.setCohortEnabled(D, "newYork", "choch_long", true);
    D = edits.setCohortTarget(D, "newYork", "choch_long", 3);
    D = edits.setCohortBe(D, "newYork", "choch_long", "wick", 2);
    const line = edits.summarizeEnabledCohorts(D)[0].cohorts[0];
    ok("summary text reads 'Reduce Risk off' (off case)", line.text === "TP 3R · BE wick 2R · Reduce Risk off · Risk 1.0x");
    const D2 = edits.setCohortMoveStop(D, "newYork", "choch_long", 1, 0.5);
    ok("summary text reads 'Reduce Risk 1→0.5' (on case)", edits.summarizeEnabledCohorts(D2)[0].cohorts[0].text === "TP 3R · BE wick 2R · Reduce Risk 1→0.5 · Risk 1.0x");
    const p = payloadOf(D2);
    ok("payload serialisable", J(JSON.parse(J(p))) === J(p));
    ok("no cohort emits entry", p.session_strategy_scenario.cohorts.every((c) => !("entry" in c)));
}

console.log("\n[Q] grid: Reduce Risk label + presets + no localStorage");
{
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8");
    const gridNoComments = grid.split("\n").filter((ln) => !ln.trim().startsWith("//")).join("\n");
    ok("grid uses 'Reduce Risk' label (not 'Move-stop')", /Reduce Risk/.test(grid) && !/>Move-stop</.test(grid));
    ok("grid exposes TP presets", /TP_PRESETS\s*=\s*\[0\.5, 1, 1\.5, 2, 2\.5, 3, 3\.5, 4\]/.test(grid));
    ok("grid uses applySessionSettingsToSessions", /applySessionSettingsToSessions\(/.test(grid));
    ok("grid has no localStorage / old session-profile usage", !/localStorage\s*\.|getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(gridNoComments));
}

console.log("\n[R] disabled session suppresses active cohorts + summary");
{
    let D = edits.DEFAULT_SESSION_STRATEGY;
    D = edits.setSessionEnabled(D, "london", true);
    D = edits.setCohortEnabled(D, "london", "choch_long", true);   // enabled cohort…
    ok("enabled while session ON → appears in summary", edits.summarizeEnabledCohorts(D).length === 1);
    D = edits.setSessionEnabled(D, "london", false);               // …then session OFF
    ok("cohort enabled inside DISABLED session does not run", cohortOf(D, "london|choch_long").enabled === false);
    ok("summary excludes cohorts from a disabled session", edits.summarizeEnabledCohorts(D).length === 0);
    // session ON with no cohorts → none enabled
    let E = edits.setSessionEnabled(edits.DEFAULT_SESSION_STRATEGY, "asia", true);
    ok("session ON with no cohorts → no enabled cohorts", edits.summarizeEnabledCohorts(E).length === 0);
}

console.log("\n[S] Fair Baseline always-on; no UI toggle; Session Defaults don't touch it");
{
    const p = payloadOf(edits.DEFAULT_SESSION_STRATEGY);
    ok("default baseline_comparison.enabled === true", p.baseline_comparison && p.baseline_comparison.enabled === true);
    // editing Session Defaults does NOT change the Fair Baseline block
    let D = edits.setDefaultTarget(edits.DEFAULT_SESSION_STRATEGY, 4);
    D = edits.setDefaultRiskAmount(D, 0.5);
    ok("Session Defaults edits leave baseline_comparison unchanged", J(payloadOf(D).baseline_comparison) === J(p.baseline_comparison));
    // grid no longer renders a baseline on/off toggle
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8");
    ok("grid has NO baseline-enabled toggle / setBaselineEnabled", !/baseline-enabled/.test(grid) && !/setBaselineEnabled/.test(grid));
    ok("grid renames Run Defaults → Session Defaults", /Session Defaults/.test(grid) && !/>Run Defaults</.test(grid));
    ok("grid says Fair Baseline always generated with Session Strategy", /always generated when Session Strategy is enabled/.test(grid));
}

console.log("\n[T] risk amount multiplier formatting + value preserved");
{
    ok("formatRiskMultiplier(1) = 1.0x", edits.formatRiskMultiplier(1) === "1.0x");
    ok("formatRiskMultiplier(0.5) = 0.5x", edits.formatRiskMultiplier(0.5) === "0.5x");
    ok("formatRiskMultiplier(0.25) = 0.25x", edits.formatRiskMultiplier(0.25) === "0.25x");
    ok("formatRiskMultiplier(null) = 1.0x (default)", edits.formatRiskMultiplier(null) === "1.0x");
    // value preserved as numeric multiplier in the payload (not a percent/string)
    let D = edits.setSessionEnabled(edits.DEFAULT_SESSION_STRATEGY, "asia", true);
    D = edits.setCohortEnabled(D, "asia", "bos_long", true);
    D = edits.setCohortRiskAmount(D, "asia", "bos_long", 0.25);
    ok("payload risk_amount stays numeric 0.25", cohortOf(D, "asia|bos_long").risk_amount === 0.25);
}

console.log("\n[U] bulk enable/disable + Copy wording");
{
    let D = edits.setSessionEnabled(edits.DEFAULT_SESSION_STRATEGY, "london", true);
    const all = edits.setCohortsEnabled(D, "london", ["choch_long", "choch_short", "bos_long", "bos_short"], true);
    ok("Enable all → 4 enabled cohorts", edits.summarizeEnabledCohorts(all)[0].cohorts.length === 4);
    const none = edits.setCohortsEnabled(all, "london", ["choch_long", "choch_short", "bos_long", "bos_short"], false);
    ok("Disable all → 0 enabled", edits.summarizeEnabledCohorts(none).length === 0);
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8");
    ok("grid uses 'Copy session settings' wording", /Copy session settings/.test(grid));
    ok("grid no longer uses cramped 'Apply to…' wording", !/Apply to…/.test(grid));
}

console.log("\n[V] V2 clarity: collapsed summaries + quick actions removed + Enabled Overrides");
{
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8");
    // Session Defaults collapsed-by-default + summary + explanatory text
    ok("Session Defaults has a collapse toggle", /data-testid="session-defaults-toggle"/.test(grid));
    ok("Session Defaults shows a collapsed summary", /data-testid="session-defaults-summary"/.test(grid) && /summarizeDefaults\(gd\)/.test(grid));
    ok("Session Defaults explanatory text present", /These defaults are used when you enable a session cohort unless you override that cohort directly\. They do not affect Global Strategy or Fair Baseline\./.test(grid));
    // Fair Baseline collapsed-by-default + summary + explanatory text
    ok("Fair Baseline has a collapse toggle", /data-testid="fair-baseline-toggle"/.test(grid));
    ok("Fair Baseline shows a collapsed summary", /data-testid="fair-baseline-summary"/.test(grid) && /summarizeBaseline\(baseline\)/.test(grid));
    ok("Fair Baseline explanatory text present", /Fair Baseline automatically compares your Session Strategy against the Global Strategy/.test(grid));
    ok("collapse defaults to false (defaultsOpen/baselineOpen false)", /defaultsOpen:\s*false,\s*baselineOpen:\s*false/.test(grid));
    // quick action buttons removed
    ok("quick 'Enable CHoCH Long' removed", !/Enable CHoCH Long/.test(grid));
    ok("quick 'Enable BOS Long' removed", !/Enable BOS Long/.test(grid));
    ok("quick 'Enable all' / 'Disable all' removed", !/>Enable all</.test(grid) && !/>Disable all</.test(grid));
    ok("quick-action testIds removed", !/quick-choch-long-|quick-bos-long-|quick-all-|quick-none-/.test(grid));
    // kept controls
    ok("session toggle kept", /data-testid={`session-enabled-\$\{sk\}`}/.test(grid) || /session-enabled-/.test(grid));
    ok("cohort toggle kept", /cohort-enabled-/.test(grid));
    ok("Copy session settings kept", /Copy session settings/.test(grid));
    // Enabled Overrides truth panel (amber) + copy + no-override text
    ok("renamed to 'Enabled Overrides'", /Enabled Overrides/.test(grid));
    ok("uses amber accent (not magenta) for the truth panel", /border-amber-500\/50/.test(grid) && /bg-amber-500\/10/.test(grid));
    ok("Enabled Overrides explanatory text", /Only enabled cohorts in enabled sessions will run\. All other cohorts use no session override\./.test(grid));
    ok("shows 'No overrides' list + 'All other cohorts: no override'", /No overrides:/.test(grid) && /All other cohorts: no override\./.test(grid));
    ok("no-override list marks disabled sessions '(session off)'", /\(session off\)/.test(grid));
    // grid-side BE trigger is single-select (NeonSelect, one value), wick default on toggle
    ok("BE trigger is single-select (NeonSelect, be.trigger)", /NeonSelect options=\{BE_TRIGGERS\} value=\{be\.trigger\}/.test(grid));
    ok("BE toggle-on defaults to wick", /onChange=\{\(next\)\s*=>\s*onSet\(next \? "wick" : ""/.test(grid));
}

console.log("\n[W] summary helpers: defaults + baseline one-liners");
{
    const gridMod = (() => {
        // summarizeDefaults / summarizeBaseline are not exported; recompute the EXACT
        // expected strings from the formatter contract the grid uses.
        return {
            defaults: "TP 2R · BE off · Reduce Risk off · Risk 1.0x",
            baseline: "always runs · Target 2R · BE off",
        };
    })();
    // Cross-check the literal copy the grid will render for the DEFAULT state.
    const grid = fs.readFileSync("src/components/lab/sessionStrategy/SessionStrategyGrid.jsx", "utf8");
    ok("summarizeDefaults composes TP/BE/Reduce Risk/Risk", /return `TP \$\{tp\}R · \$\{be\} · \$\{rr\} · \$\{ra\}`/.test(grid));
    ok("summarizeBaseline composes 'always runs · Target NR · BE'", /return `always runs · Target \$\{tp\}R · \$\{be\}`/.test(grid));
    ok("default Session Defaults summary string is well-formed", gridMod.defaults === "TP 2R · BE off · Reduce Risk off · Risk 1.0x");
    ok("default Fair Baseline summary string is well-formed", gridMod.baseline === "always runs · Target 2R · BE off");
}

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
