// cohortTargetOverrides.validate.mjs — Phase 1 per-cohort custom targets.
//
// Validates the pure model + serializer: 24-cohort axis, canonical target options,
// presets (all-RR2 / final-candidate / same-enabled-RR2 / reset), the backend
// session_strategy_scenario serialization (exact shape), RUN_DEFAULT → global RR,
// gate-off → null, and the run summary + PM warnings (custom-target-may-block,
// enabled-over-PM-disable). Proves custom targets never bypass PM state/direction.
//
// Run from frontend/:  node src/data/__validation__/cohortTargetOverrides.validate.mjs

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

const M = loadCjs("src/data/cohortTargetOverrides.js");
const PP = loadCjs("src/data/portfolioPolicy.js");
const {
    COHORTS, COHORT_KEYS, COHORTS_BY_SESSION, TARGET_OPTIONS, RUN_DEFAULT,
    FINAL_CANDIDATE_TARGETS, FINAL_CANDIDATE_ENABLED_KEYS, PRESETS,
    applyPreset, normalizeOverrides, snapTarget, buildSessionStrategyScenario,
    buildRunSummary, cohortPmAction, pmBlockCapable, pmWouldDisable, globalRunRR,
} = M;
const { cohortKey } = PP;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// Build a fake PM policy table (byKey keyed exactly like the real loader) so we can
// exercise PM-action lookups without loading the deployed mirror JSON.
function fakePolicy(actionsByCohortKey, { version = "test-v1.2", sha = "deadbeef" } = {}) {
    const byKey = new Map();
    for (const c of COHORTS) {
        const action = actionsByCohortKey[c.key] || "LABEL";
        byKey.set(cohortKey("EURUSD", c.sessionKey, c.structure, c.direction), { policy: action });
    }
    return { policyVersion: version, policySha256: sha, byKey };
}

console.log("cohortTargetOverrides.validate.mjs");

// ── 1. Axis ────────────────────────────────────────────────────────────────────
ok(COHORTS.length === 24, "24 cohorts total");
ok(new Set(COHORT_KEYS).size === 24, "cohort keys are unique");
ok(COHORTS_BY_SESSION.length === 6, "grouped into 6 sessions");
ok(COHORTS_BY_SESSION.every((g) => g.cohorts.length === 4), "each session has 4 cohorts");
ok(COHORT_KEYS.includes("newYork|choch_short") && COHORT_KEYS.includes("outside|choch_long"),
    "canonical keys present (newYork|choch_short, outside|choch_long)");

// ── 2. Target options ────────────────────────────────────────────────────────────
ok(TARGET_OPTIONS[0] === 0.5 && TARGET_OPTIONS.includes(1.0), "low options 0.5…1.0 present");
ok(TARGET_OPTIONS.includes(1.25) && TARGET_OPTIONS.includes(3.25) && TARGET_OPTIONS.includes(5.0),
    "0.25-step options through 5.0 present (incl 3.25)");
ok(TARGET_OPTIONS[TARGET_OPTIONS.length - 1] === 5.0, "max option is 5.0");
ok(FINAL_CANDIDATE_ENABLED_KEYS.every((k) => TARGET_OPTIONS.includes(FINAL_CANDIDATE_TARGETS[k])),
    "every FINAL candidate target is a selectable option");
ok(snapTarget(0.83) === 0.8 && snapTarget(3.3) === 3.25, "snapTarget snaps to nearest option");

// ── 3. Presets ───────────────────────────────────────────────────────────────────
const allRR2 = applyPreset(PRESETS.ALL_RR2);
ok(allRR2.enabled === true && Object.values(allRR2.overrides).every((o) => o.enabled && o.target === 2.0),
    "ALL_RR2: 24 enabled at 2.0");

const finalC = applyPreset(PRESETS.FINAL_CANDIDATE);
const finEnabled = Object.entries(finalC.overrides).filter(([, o]) => o.enabled);
ok(finEnabled.length === 12, "FINAL_CANDIDATE: exactly 12 enabled");
ok(finEnabled.every(([k, o]) => o.target === FINAL_CANDIDATE_TARGETS[k]), "FINAL_CANDIDATE: targets match locked book");
ok(finalC.overrides["lull|bos_short"].target === 3.25 && finalC.overrides["london|bos_short"].enabled === false,
    "FINAL_CANDIDATE: lull|bos_short=3.25, london|bos_short disabled");

const sameRR2 = applyPreset(PRESETS.SAME_ENABLED_RR2);
const sameEnabled = Object.entries(sameRR2.overrides).filter(([, o]) => o.enabled);
ok(sameEnabled.length === 12, "SAME_ENABLED_RR2: same 12 enabled");
ok(sameEnabled.every(([k, o]) => o.target === 2.0), "SAME_ENABLED_RR2: every enabled at 2.0");
ok(JSON.stringify(sameEnabled.map(([k]) => k).sort()) === JSON.stringify(finEnabled.map(([k]) => k).sort()),
    "SAME_ENABLED_RR2 enabled set == FINAL_CANDIDATE enabled set (mandatory control)");

const reset = applyPreset(PRESETS.RESET);
ok(reset.enabled === false, "RESET turns the panel gate OFF");

const allDef = applyPreset(PRESETS.ALL_RUN_DEFAULT);
ok(Object.values(allDef.overrides).every((o) => o.enabled && o.target === RUN_DEFAULT),
    "ALL_RUN_DEFAULT: 24 enabled at run default");

// ── 4. Serializer → backend session_strategy_scenario ──────────────────────────
ok(buildSessionStrategyScenario({ cohortOverridesEnabled: false }) === null,
    "gate OFF → serializer returns null (normal run, byte-identical)");

const cfgFinal = { cohortOverridesEnabled: true, rr: 2.0, cohortTargetOverrides: finalC.overrides, cohortOverridesPreset: PRESETS.FINAL_CANDIDATE };
const scen = buildSessionStrategyScenario(cfgFinal);
ok(scen && scen.enabled === true && Array.isArray(scen.cohorts) && scen.cohorts.length === 24,
    "scenario: {enabled:true, cohorts:[24]}");
const enRows = scen.cohorts.filter((c) => c.target);
const disRows = scen.cohorts.filter((c) => c.enabled === false);
ok(enRows.length === 12 && disRows.length === 12, "scenario: 12 enabled (target) + 12 disabled");
ok(enRows.every((c) => c.session && c.structure && c.direction && typeof c.target.rr === "number"),
    "enabled cohorts carry {session,structure,direction,target:{rr}}");
ok(disRows.every((c) => c.session && c.structure && c.direction && c.enabled === false && !("target" in c)),
    "disabled cohorts carry {session,structure,direction,enabled:false} (no target) — PM-safe disable");
const nyShort = scen.cohorts.find((c) => c.session === "newYork" && c.structure === "CHoCH" && c.direction === "Short");
ok(nyShort && nyShort.target.rr === 2.0, "newYork CHoCH Short serializes rr=2.0 (matches frozen book)");

// RUN_DEFAULT resolves to global RR at serialize time.
const cfgDef = { cohortOverridesEnabled: true, rr: 3.3, cohortTargetOverrides: allDef.overrides };
const scenDef = buildSessionStrategyScenario(cfgDef);
ok(scenDef.cohorts.every((c) => c.target && c.target.rr === 3.3), "RUN_DEFAULT resolves to global rr (3.3)");
ok(scenDef.meta.custom_target_count === 0, "run-default scenario has 0 custom targets");
ok(scen.meta.enabled_count === 12 && scen.meta.disabled_count === 12 && scen.meta.preset === PRESETS.FINAL_CANDIDATE,
    "scenario.meta stamps counts + preset (provenance)");

// ── 5. Run summary + PM warnings (custom targets never bypass PM) ───────────────
// PM actions mirroring the live policy for the 5 filtered enabled cohorts.
const policy = fakePolicy({
    "outside|choch_long": "STATE_ONLY",
    "newYork|choch_short": "DIRECTION_AWARE",
    "ny_pm|choch_short": "DIRECTION_AWARE",
    "outside|bos_long": "DIRECTION_AWARE",
    "outside|choch_short": "DIRECTION_AWARE",
    "london|bos_long": "DISABLE", // pretend PM disables one enabled-in-book cohort
});

// Custom targets: final candidate (so newYork|choch_short=2.0 custom vs global 1.0).
const cfgSummary = { cohortOverridesEnabled: true, portfolioEnabled: true, rr: 1.0,
    cohortTargetOverrides: finalC.overrides, cohortOverridesPreset: PRESETS.FINAL_CANDIDATE };
const summary = buildRunSummary(cfgSummary, policy, "EURUSD");
ok(summary.enabledCount === 12 && summary.disabledCount === 12, "summary counts: 12/12");
ok(summary.pmMode === "enforce" && summary.pmPolicyVersion === "test-v1.2", "summary reflects PM enforce + policy version");
ok(summary.stateFilteringActive === true, "STATE_ONLY/DIRECTION_AWARE filtering flagged active (not downgraded)");
ok(cohortPmAction(policy, COHORTS.find((c) => c.key === "outside|choch_long")) === "STATE_ONLY",
    "cohortPmAction reads STATE_ONLY for outside|choch_long");
ok(pmBlockCapable("STATE_ONLY") && pmBlockCapable("DIRECTION_AWARE") && !pmBlockCapable("LABEL"),
    "pmBlockCapable true for STATE_ONLY/DIRECTION_AWARE only");
ok(pmWouldDisable("DISABLE") && !pmWouldDisable("LABEL"), "pmWouldDisable true only for DISABLE");

const blockWarns = summary.warnings.filter((w) => w.type === "custom_target_pm_may_block");
ok(blockWarns.some((w) => w.cohort === "newYork|choch_short"),
    "warns: custom target on newYork|choch_short (DIRECTION_AWARE) may still be PM-blocked");
const disableWarns = summary.warnings.filter((w) => w.type === "enabled_but_pm_disables" || w.type === "enabled_over_pm_disable");
ok(disableWarns.some((w) => w.cohort === "london|bos_long"), "warns: enabled cohort london|bos_long that PM would DISABLE");

// include-disabled ON changes the warning type (informational, not error).
const cfgIncl = { ...cfgSummary, portfolioIncludeDisabledCohorts: true };
const summaryIncl = buildRunSummary(cfgIncl, policy, "EURUSD");
ok(summaryIncl.warnings.some((w) => w.type === "enabled_over_pm_disable" && w.cohort === "london|bos_long"),
    "include-disabled ON → enabled_over_pm_disable warning variant");

// Disabled cohort with a stale target must not appear as a custom-target warning.
ok(!summary.warnings.some((w) => w.type === "custom_target_pm_may_block" &&
    summary.rows.find((r) => r.key === w.cohort)?.enabled === false),
    "no custom-target warning fires for a disabled cohort");

// PM OFF → no PM warnings, no state filtering.
const summaryPmOff = buildRunSummary({ cohortOverridesEnabled: true, portfolioEnabled: false, rr: 1.0, cohortTargetOverrides: finalC.overrides }, policy, "EURUSD");
ok(summaryPmOff.warnings.length === 0 && summaryPmOff.stateFilteringActive === false,
    "PM OFF → no PM warnings, state filtering inactive");

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
