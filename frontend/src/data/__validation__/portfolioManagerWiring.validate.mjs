// portfolioManagerWiring.validate.mjs — Strategy Builder V2 Portfolio Manager controls.
//
// Proves: PM toggle → config; PM OFF emits portfolio_policy_enabled:false; PM ON emits
// enforce mode + policy file; friendly labels map to the 4 canonical enums; the policy
// preview counts match the deployed mirror; the Global Market State gate section is
// advanced/legacy (collapsed + OFF by default for new configs) with a PM+MS warning; the
// recommended-stack diff works; and NO canonical enum was renamed / NO deployed policy or
// backend semantics changed. Pure — no React, no execution.
//
// Run from frontend/:  node src/data/__validation__/portfolioManagerWiring.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function load(p) {
    p = path.resolve(p.endsWith(".js") ? p : p + ".js");
    if (cache.has(p)) return cache.get(p);
    const { code } = babel.transformSync(fs.readFileSync(p, "utf8"), {
        filename: p, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
    });
    const mod = { exports: {} }; cache.set(p, mod.exports);
    const req = (s) => (s.startsWith(".") ? load(path.resolve(path.dirname(p), s)) : (s.endsWith(".json") ? JSON.parse(fs.readFileSync(path.resolve(path.dirname(p), s), "utf8")) : {}));
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(p, mod.exports); return mod.exports;
}

const ct = load("src/data/configTranslator.js");
const reg = load("src/data/configRegistry.js");
const rec = load("src/data/portfolioRecommendation.js");
const labels = load("src/data/portfolioLabels.js");
const pp = load("src/data/portfolioPolicy.js");
const mirror = JSON.parse(fs.readFileSync(path.resolve("src/data/deployedPolicy.v1.json"), "utf8"));
const SB = fs.readFileSync(path.resolve("src/pages/StrategyBuilderV2.jsx"), "utf8");
const PMC = fs.readFileSync(path.resolve("src/components/lab/portfolio/PortfolioManagerControls.jsx"), "utf8");

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

console.log("[1] registry defaults (portfolio group)");
const d = reg.defaultsForGroup("portfolio");
ok(d.portfolioEnabled === false, "registry default portfolioEnabled = false (safe/legacy)");
ok(d.portfolioMode === "enforce", "registry default portfolioMode = enforce");
ok(d.portfolioPolicyFile === "configs/policy/deployed_policy.v1.json", "registry default policy file = deployed_policy.v1.json");

console.log("\n[2] config emission — PM ON / OFF");
const on = ct.buildPortfolioConfig({ portfolioEnabled: true });
ok(on.portfolio_policy_enabled === true, "PM ON → portfolio_policy_enabled true");
ok(on.portfolio_policy_mode === "enforce", "PM ON → enforce mode");
ok(on.portfolio_policy_file === "configs/policy/deployed_policy.v1.json", "PM ON → policy file emitted");
const off = ct.buildPortfolioConfig({ portfolioEnabled: false });
ok(off.portfolio_policy_enabled === false, "PM OFF → portfolio_policy_enabled false");
ok(!("portfolio_policy_mode" in off), "PM OFF → no mode/file emitted (byte-minimal)");
const payOn = ct.buildBacktesterConfig({ ...d, portfolioEnabled: true, entryMode: "single", selectedEntryModel: "triggered_edge" });
ok(payOn.portfolio_policy_enabled === true && payOn.portfolio_policy_mode === "enforce", "full payload carries PM ON + enforce");
const payOff = ct.buildBacktesterConfig({ ...d, portfolioEnabled: false, entryMode: "single", selectedEntryModel: "triggered_edge" });
ok(payOff.portfolio_policy_enabled === false, "full payload PM OFF → false");

console.log("\n[2b] research override — include disabled cohorts");
// OFF (flag absent/false) must NOT emit the field → byte-identical to a normal PM run
const onNoOverride = ct.buildPortfolioConfig({ portfolioEnabled: true });
ok(!("portfolio_include_disabled_cohorts" in onNoOverride),
    "PM ON, override OFF → field absent (byte-identical)");
const onOverrideFalse = ct.buildPortfolioConfig({ portfolioEnabled: true, portfolioIncludeDisabledCohorts: false });
ok(!("portfolio_include_disabled_cohorts" in onOverrideFalse),
    "PM ON, override=false → field still absent");
// ON emits exactly the boolean true, PM stays enabled/enforce (nothing else changes)
const onOverride = ct.buildPortfolioConfig({ portfolioEnabled: true, portfolioIncludeDisabledCohorts: true });
ok(onOverride.portfolio_include_disabled_cohorts === true,
    "PM ON, override ON → portfolio_include_disabled_cohorts:true");
ok(onOverride.portfolio_policy_enabled === true && onOverride.portfolio_policy_mode === "enforce",
    "override does not disable PM or change mode (still enforce)");
// PM OFF must never emit the override even if the flag is set (no PM = nothing to include)
const offWithFlag = ct.buildPortfolioConfig({ portfolioEnabled: false, portfolioIncludeDisabledCohorts: true });
ok(!("portfolio_include_disabled_cohorts" in offWithFlag),
    "PM OFF → override field never emitted");
// UI: toggle only shown when PM is ON; label + run-detail token present
const PMC2 = fs.readFileSync(new URL("../../components/lab/portfolio/PortfolioManagerControls.jsx", import.meta.url), "utf8");
// SB-V2 UX polish: the include-disabled control moved OUT of the normal workflow into
// Advanced Research / Legacy (IncludeDisabledOverride.jsx) — same cfg field + testids.
const IDO = fs.readFileSync(new URL("../../components/lab/portfolio/IncludeDisabledOverride.jsx", import.meta.url), "utf8");
ok(/data-testid="pm-include-disabled-toggle"/.test(IDO), "include-disabled toggle present (Advanced Research / Legacy)");
ok(/on &&[\s\S]*pm-include-disabled/.test(PMC2), "include-disabled card gated on PM ON");
ok(/portfolioIncludeDisabledCohorts/.test(PMC2), "toggle writes portfolioIncludeDisabledCohorts via onField");
const SP = fs.readFileSync(new URL("../runs/scenarioPresentation.js", import.meta.url), "utf8");
ok(/All cohorts/.test(SP) && /portfolio_include_disabled_cohorts/.test(SP),
    "run-detail label appends 'All cohorts' when override set");

console.log("\n[3] friendly labels map to the 4 canonical enums (no renames)");
ok(labels.POLICY_LABELS.LABEL === "ALWAYS ALLOW" && labels.POLICY_LABELS.STATE_ONLY === "BLOCK CHOP"
    && labels.POLICY_LABELS.DIRECTION_AWARE === "FOLLOW TREND" && labels.POLICY_LABELS.DISABLE === "NEVER TRADE",
    "labels: ALWAYS ALLOW / BLOCK CHOP / FOLLOW TREND / NEVER TRADE");
ok(Object.keys(labels.POLICY_LABELS).sort().join(",") === "DIRECTION_AWARE,DISABLE,LABEL,STATE_ONLY", "canonical enum keys unchanged");

console.log("\n[4] policy preview counts match the deployed mirror (EURUSD)");
const table = pp.loadPolicy(mirror);
const eur = table.cohorts.filter((c) => c.instrument === "EURUSD");
const by = { LABEL: 0, STATE_ONLY: 0, DIRECTION_AWARE: 0, DISABLE: 0 };
for (const c of eur) by[c.policy]++;
ok(eur.length === 24, `EURUSD cohorts = 24 (got ${eur.length})`);
// Re-derived from the deployed v1.2 mirror (2026-07-09.te-v1.2-surgical-disable):
// v1.1 was LABEL8/STATE2/DIR4/DISABLE10; the two surgical disables below moved
// newYork BOS Long (STATE_ONLY→DISABLE) and london BOS Short (LABEL→DISABLE),
// giving LABEL7/STATE1/DIR4/DISABLE12.
ok(by.LABEL === 7 && by.STATE_ONLY === 1 && by.DIRECTION_AWARE === 4 && by.DISABLE === 12,
    `deployed (PM v1.2) counts LABEL7/STATE1/DIR4/DISABLE12 (got ${JSON.stringify(by)})`);
ok(/counts\[c\.policy\]/.test(PMC) || /by\[c\.policy\]/.test(PMC), "preview derives counts from the mirror, not hard-coded");
// NY CHoCH Short remains DIRECTION_AWARE under v1.2 — the surgical disable targeted
// newYork BOS Long + london BOS Short only, NOT CHoCH Short.
const nyc = table.byKey.get("EURUSD|newYork|choch_short");
ok(nyc && nyc.policy === "DIRECTION_AWARE", "deployed mirror v1.2: NY CHoCH Short = DIRECTION_AWARE");
ok(labels.POLICY_LABELS.DIRECTION_AWARE === "FOLLOW TREND", "DIRECTION_AWARE still labelled FOLLOW TREND");
// v1.2 surgical disable (derived_from.change) — the two deployed-substrate losing cohorts.
ok(table.byKey.get("EURUSD|newYork|bos_long")?.policy === "DISABLE",
    "v1.2 surgical: EURUSD newYork BOS Long STATE_ONLY→DISABLE");
ok(table.byKey.get("EURUSD|london|bos_short")?.policy === "DISABLE",
    "v1.2 surgical: EURUSD london BOS Short LABEL→DISABLE");
// the component reports whichever state the mirror carries (v1.1-deployed vs not) — both branches present
ok(/includes the PM v1.1 New York CHoCH Short change/.test(PMC) && /not yet deployed/.test(PMC),
    "PM section reports deployed-vs-candidate state from the mirror (v1.1 message when deployed)");

console.log("\n[5] Market State gate = advanced/legacy, collapsed + all aspects OFF by default");
ok(/Global Market State Gate/.test(SB), "MS section relabelled 'Global Market State Gate'");
// SB-V2 UX polish: the gate now lives inside the collapsible "Advanced Research / Legacy"
// section (defaultOpen={false}) — the inner double-toggle was removed (one disclosure).
ok(/Advanced Research — Global Market State Gate/.test(SB), "MS section marked advanced/legacy");
ok(/collapsible defaultOpen=\{false\} n=\{6\} title="Advanced Research \/ Legacy"/.test(SB), "MS gate collapsed by default (inside the Advanced section)");
ok(/data-testid="advanced-ms-gate"/.test(SB), "MS gate block present in the Advanced section");
// all regime aspects off by default: master gate + the three indicator enables
const rd = reg.defaultsForGroup("regime");
ok(rd.regimeEnabled === false, "regime master gate OFF by default");
ok(rd.emaEnabled === false && rd.bbwEnabled === false && rd.adxEnabled === false,
    "EMA / BBW / ADX indicator toggles all OFF by default");
ok(rd.regimeMode === "label", "regime mode = label (not filter) by default");
// sub-indicator toggles VISUALLY reflect the master gate (off gate → all read off)
const MSC = fs.readFileSync(path.resolve("src/components/lab/marketState/MarketStateControls.jsx"), "utf8");
ok(/checked=\{gateOn && enabled\}/.test(MSC), "EMA/BBW/ADX enable toggles read OFF when the master gate is off");
ok(/opacity-50 pointer-events-none/.test(MSC) && /Enable the Market State gate above/.test(MSC), "sub-toggles non-interactive + hinted when gate off");
ok(d.portfolioEnabled === false, "registry keeps PM OFF as base default (persisted configs unchanged)");
ok(/if \(!persisted\?\.cfg\) base\.portfolioEnabled = true/.test(SB), "NEW config nudged PM ON; persisted configs preserved (no silent change)");
// builder draft always starts with EVERY Market State aspect OFF (even legacy on-drafts)
ok(/base\.regimeEnabled = false/.test(SB), "draft init forces regimeEnabled OFF");
ok(/base\.emaEnabled = false/.test(SB) && /base\.bbwEnabled = false/.test(SB) && /base\.adxEnabled = false/.test(SB), "draft init forces EMA/BBW/ADX enables OFF");
ok(/base\.regimeMode = "label"/.test(SB), "draft init resets regime mode to label (not filter)");

console.log("\n[6] warning when PM ON + global MS gate ON");
ok(/cfg\.portfolioEnabled && cfg\.regimeEnabled/.test(SB), "warning gated on PM ON && MS ON");
ok(/harmful\/redundant when PM is enabled/.test(SB) && /data-testid="pm-ms-warning"/.test(SB), "warning text + testid present");

console.log("\n[7] recommended-stack diff (guidance only)");
ok(rec.recommendedStackDiff({ portfolioEnabled: true, regimeEnabled: false, selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [25], triggeredEdgeDelays: [3, 4] }).length === 0, "recommended config → no diffs");
const diffs = rec.recommendedStackDiff({ portfolioEnabled: false, regimeEnabled: true, selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [10, 25], triggeredEdgeDelays: [0, 1] }).map((x) => x.field);
ok(diffs.includes("Portfolio Manager") && diffs.includes("Global Market State gate"), "diff flags PM OFF + MS ON");
const patch = rec.recommendedLayerPatch();
ok(patch.portfolioEnabled === true && patch.regimeEnabled === false, "apply patch = PM ON + MS OFF (layer only)");

console.log("\n[8] guardrails: no deployed policy edit / no backend semantics change");
ok(mirror.policy_version === "2026-07-09.te-v1.2-surgical-disable", "deployed mirror is PM v1.2 (2026-07-09.te-v1.2-surgical-disable)");
ok(mirror.policy_sha256 === "86ff709c6346dc5e0e695de5c550577d15877ebda0b4025e70da327bfb5c00a9", "deployed mirror canonical checksum = 86ff709c… (v1.2)");
ok(!/portfolio_policy_regime|decision_policy|regime_gate/.test(PMC), "PM controls do not touch execution/regime logic");

console.log(`\n${fail === 0 ? "ALL PASSED" : fail + " FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
