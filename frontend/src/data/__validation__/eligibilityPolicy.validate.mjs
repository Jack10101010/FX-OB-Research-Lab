// eligibilityPolicy.validate.mjs — Eligibility Policy model + serialization (SB-V2).
//
// Covers the consolidation validation items on the frontend side:
//   [7]  old include-disabled configs reload with their exact PM semantics
//   [8]  old and new configs round-trip (eligibility ⇄ scenario; legacy enabled-only
//        stays under the legacy model)
//   [9]  the standalone target panel could be removed without losing base targets
//        (base targets flow through cohortTargetOverrides into the merged panel)
//   [10] emitted configs are byte-identical when the new policies are OFF
//   [12] no ambiguous wording: eligibility summary reports explicit counts and what
//        the deployed PM disables — plus warnings for rescues PM would still block
//   plus: preset semantics (deployed_pm mirrors PM DISABLE; all_research allows all),
//   rescue/block no-op de-duplication, and the PM-mode (off/label/enforce) emission.
//
// Run from frontend/:  node src/data/__validation__/eligibilityPolicy.validate.mjs

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

const E = loadCjs("src/data/eligibilityPolicy.js");
const { buildSessionStrategyScenario } = loadCjs("src/data/cohortTargetOverrides.js");
const { loadPolicy } = loadCjs("src/data/portfolioPolicy.js");
const table = loadPolicy(JSON.parse(fs.readFileSync("src/data/deployedPolicy.v1.json", "utf8")));

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

console.log("\n[10] OFF ⇒ byte-identical (same reference)");
const cfgBase = { cohortOverridesEnabled: true, rr: 2, cohortTargetOverrides: {} };
const base = buildSessionStrategyScenario(cfgBase);
ok(E.mergeEligibilityIntoScenario(base, { ...cfgBase, eligibilityEnabled: false }) === base, "eligibility OFF ⇒ identical reference");
ok(E.mergeEligibilityIntoScenario(null, { eligibilityEnabled: true }) === null, "no base scenario ⇒ untouched");

console.log("\n[presets] deployed_pm mirrors PM; all_research allows all");
const dep = E.eligibilityForPreset("deployed_pm", table);
const depDisabled = Object.values(dep).filter((e) => e.base === "disable").length;
ok(depDisabled === 12, `deployed_pm disables exactly the 12 PM-DISABLE cohorts (${depDisabled})`);
const all = E.eligibilityForPreset("all_research", table);
ok(Object.values(all).every((e) => e.base === "allow"), "all_research: every base allowed (uncensored with PM off/label)");

console.log("\n[serialize] rescue + block + no-op dedupe");
const cfgOn = {
    ...cfgBase, eligibilityEnabled: true, eligibilityPreset: "custom",
    cohortEligibility: {
        "newYork|bos_long": { base: "disable", states: { "Bull/Expand": "allow", "Bear/Chop": "block" } }, // block inside disabled = no-op
        "london|bos_long": { base: "allow", states: { "Bear/Chop": "block", "Bull/Expand": "allow" } },     // allow inside allowed = no-op
    },
};
const merged = E.mergeEligibilityIntoScenario(buildSessionStrategyScenario(cfgOn), cfgOn, table);
const rowOf = (s, st, d) => merged.cohorts.find((c) => c.session === s && c.structure === st && c.direction === d);
const nyl = rowOf("newYork", "BOS", "Long");
ok(nyl.eligibility.base === "disable" && nyl.enabled === false, "disabled base serialized + legacy enabled mirrored");
ok(nyl.eligibility.states["Bull/Expand"] === "allow" && !("Bear/Chop" in nyl.eligibility.states), "rescue serialized; block-inside-disabled dropped as a no-op");
const ldn = rowOf("london", "BOS", "Long");
ok(ldn.eligibility.states["Bear/Chop"] === "block" && !("Bull/Expand" in ldn.eligibility.states), "state block serialized; allow-inside-allowed dropped as a no-op");
ok(merged.meta.eligibility_schema === 1 && merged.meta.eligibility_preset === "custom"
   && merged.meta.eligibility_state_rescues === 1 && merged.meta.eligibility_state_blocks === 1
   && merged.meta.eligibility_disabled_bases === 1, "provenance meta: schema/preset/counts");

console.log("\n[8] round-trip");
const rt = E.eligibilityFromScenario(merged);
ok(rt.enabled === true && rt.preset === "custom", "round-trip restores panel + preset");
ok(rt.eligibility["newYork|bos_long"].base === "disable" && rt.eligibility["newYork|bos_long"].states["Bull/Expand"] === "allow", "rescue survives round-trip");
ok(rt.eligibility["london|bos_long"].states["Bear/Chop"] === "block", "block survives round-trip");
const legacyOnly = E.eligibilityFromScenario(base);
ok(legacyOnly.enabled === false, "legacy enabled-only scenario ⇒ eligibility panel stays OFF (no silent meaning change)");

console.log("\n[7] include-disabled + PM mode reload mapping (translator source)");
const CT = fs.readFileSync("src/data/configTranslator.js", "utf8");
ok(/portfolio_include_disabled_cohorts !== undefined/.test(CT) && /patch\.portfolioIncludeDisabledCohorts/.test(CT), "old include-disabled configs restore the internal flag");
ok(/patch\.portfolioMode = String\(source\.portfolio_policy_mode\) === "label" \? "label" : "enforce"/.test(CT), "old PM mode restores exactly");
ok(/portfolio_policy_mode: cfg\.portfolioMode === "label" \? "label" : "enforce"/.test(CT), "PM mode is now user-selectable (label serializes; default enforce unchanged)");

console.log("\n[9] base targets survive the standalone panel removal");
const V2 = fs.readFileSync("src/pages/StrategyBuilderV2.jsx", "utf8");
const PANEL = fs.readFileSync("src/components/lab/portfolio/MarketStateTargetOverrides.jsx", "utf8");
ok(!/<CohortTargetOverrides /.test(V2), "standalone Cohort Target Overrides panel removed from the page");
ok(/buildSessionStrategyScenario/.test(CT), "…but its serializer (base targets + legacy enabled) still emits the scenario");
ok(/ms-base-select-/.test(PANEL) && /cohortTargetOverrides/.test(PANEL), "the merged Target Policy panel EDITS the same cohort base targets (same cfg field — nothing lost)");
ok(/<TradeEligibility /.test(V2) && /<ResolvedRunSummary /.test(V2), "Trade Eligibility + Resolved Run Summary sections wired");
ok(/Advanced \/ Legacy — Session Strategy/.test(V2) && /SUPERSEDES/.test(V2), "Session Strategy moved to Advanced/Legacy with an explicit supersedes warning");
ok(/Advanced Research — Global Market State Gate/.test(V2), "Global MS Gate moved to Advanced Research");

console.log("\n[12] no ambiguous wording; PM decisions visible");
const sum = E.summarizeEligibility({ eligibilityEnabled: true, eligibilityPreset: "deployed_pm", portfolioEnabled: true, portfolioMode: "enforce" }, table);
ok(sum.enabledBases === 12 && sum.disabledBases === 12, `resolved summary: ${sum.enabledBases} enabled / ${sum.disabledBases} disabled bases (explicit counts, no "all cohorts ON")`);
ok(sum.pmDisabledCohorts.length === 12 && sum.stateFilteredCohorts.length === 5, "summary names what the deployed PM disables (12) and state-filters (5) — nobody has to remember");
const rescueCfg = { eligibilityEnabled: true, eligibilityPreset: "custom", portfolioEnabled: true, portfolioMode: "enforce",
    cohortEligibility: { "newYork|choch_short": { base: "disable", states: { "Bull/Expand": "allow" } } } };
const sum2 = E.summarizeEligibility(rescueCfg, table);
ok(sum2.warnings.some((w) => w.type === "pm_blocks_rescued_state" && /PM ENFORCE still blocks/.test(w.message)),
   "rescued state that PM ENFORCE still blocks ⇒ explicit warning (rescue never silently bypasses PM)");
const TE_SRC = fs.readFileSync("src/components/lab/portfolio/TradeEligibility.jsx", "utf8");
ok(/PM decision<\/span> \(runs first, never bypassed\) ≠/.test(TE_SRC) || /PM decision/.test(TE_SRC) && /≠/.test(TE_SRC), "panel states PM decision ≠ scenario override");
ok(/data-testid=\{`pm-mode-\$\{m\}`\}/.test(TE_SRC) && /\["off", "label", "enforce"\]\.map/.test(TE_SRC), "PM Off / Label / Enforce as one explicit control");

console.log("\n[11] Session Results distinguishes the four populations (wiring)");
const SR = fs.readFileSync("src/components/lab/sessionProfiles/SessionResults.jsx", "utf8");
ok(/PM-blocked/.test(SR) && /State-blocked/.test(SR) && /State-rescued/.test(SR) && /Blocked by scenario|COHORT_DISABLED|Disabled by scenario/.test(SR),
   "PM-blocked / cohort-disabled / state-blocked / state-rescued all separately visible");
const IMP = fs.readFileSync("src/data/importer.js", "utf8");
ok(/state_eligibility: String\(pick\(r, "state_eligibility"/.test(IMP), "importer maps the rescued-provenance column");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
