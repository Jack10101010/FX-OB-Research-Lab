// sbv2UxPolish.validate.mjs — SB-V2 UX simplification + workflow polish (Part 14).
//
//   [1] page structure: Setup → Global Strategy → Trade Policy → Trade Management →
//       Resolved Run Summary → Best Validated Configuration → Advanced Research/Legacy;
//       Setup + Global collapsible with summary chips; Advanced collapsed by default.
//   [2] Trade Policy tabs (Eligibility / Targets / Drafts / Summary).
//   [3] ONE Portfolio Manager control (Off/Label/Enforce in the Eligibility tab);
//       the old duplicate toggle + hard-coded "Mode: Enforce" chip are gone.
//   [4] redundancy relocated: Recommended Stack + include-disabled live ONLY in
//       Advanced Research / Legacy; presets labelled as templates.
//   [5] tables: no cryptic "B/Exp" abbreviations; arrow state headers shared.
//   [6] chips reflect the EFFECTIVE state (include-disabled ⇒ never a bare red
//       NEVER TRADE); ALWAYS ALLOW reads positive (success tone).
//   [7] single disclosure control per expandable section (accent chevron removed).
//   [8] Apply Best Configuration: applies EXACTLY the documented patch; the emitted
//       backtester config is a plain deployed-PM enforce run (no scenario).
//   [9] reload round-trip of the applied-best config; legacy include-disabled config
//       load unchanged.
//  [10] render smoke (react-dom/server) for the new presentational components.
//
// Run from frontend/:  node src/data/__validation__/sbv2UxPolish.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(/\.(js|jsx)$/.test(absPath) ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }],
                  ["@babel/preset-react", { runtime: "automatic" }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => {
        const withExt = (base) => (fs.existsSync(base) ? base : fs.existsSync(`${base}.js`) ? `${base}.js` : `${base}.jsx`);
        if (spec.startsWith(".")) return loadCjs(withExt(path.resolve(path.dirname(resolved), spec)));
        if (spec.startsWith("@/")) {
            const p = path.resolve("src", spec.slice(2));
            if (p.endsWith(".json")) return JSON.parse(fs.readFileSync(p, "utf8"));
            return loadCjs(withExt(p));
        }
        if (spec === "react" || spec.startsWith("react/") || spec.startsWith("react-dom")) return nodeRequire(spec);
        if (spec === "react-router-dom") return { Link: () => null };
        if (spec === "lucide-react") return new Proxy({}, { get: () => () => null });
        if (spec.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(resolved), spec), "utf8"));
        throw new Error("bare import: " + spec);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

import { createRequire } from "module";
const nodeRequire = createRequire(import.meta.url);
const requireReact = () => nodeRequire("react");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const SB = fs.readFileSync("src/pages/StrategyBuilderV2.jsx", "utf8");
const TE = fs.readFileSync("src/components/lab/portfolio/TradeEligibility.jsx", "utf8");
const MSTO = fs.readFileSync("src/components/lab/portfolio/MarketStateTargetOverrides.jsx", "utf8");
const PMC = fs.readFileSync("src/components/lab/portfolio/PortfolioManagerControls.jsx", "utf8");
const NP = fs.readFileSync("src/components/lab/NeonPanel.jsx", "utf8");

console.log("\n[1] page structure + collapsible sections with chips");
const idx = (re) => { const m = SB.search(re); ok(m >= 0, `section present: ${re}`); return m; };
const i1 = idx(/n=\{1\} title="Backtest Setup"/);
const i2 = idx(/n=\{2\} title="Global Strategy"/);
const i3 = idx(/n=\{3\} title="Trade Policy"/);
const i4 = idx(/n=\{4\} title="Trade Management"/);
const i5 = idx(/n=\{5\} title="Resolved Run Summary"/);
const iB = idx(/<BestValidatedConfig /);
const i6 = idx(/n=\{6\} title="Advanced Research \/ Legacy"/);
ok(i1 < i2 && i2 < i3 && i3 < i4 && i4 < i5 && i5 < i6, "order: 1→2→3→4→5→Advanced");
ok(i3 < iB && iB < i4, "Validated Configurations renders at the TOP of Trade Policy (visual fix #2)");
ok(/collapsible defaultOpen=\{false\} chips=\{setupChips\} n=\{1\}/.test(SB), "Setup collapsible + chips");
ok(/collapsible defaultOpen=\{false\} chips=\{globalChips\} n=\{2\}/.test(SB), "Global Strategy collapsible + chips");
ok(/Allow Multi Position/.test(SB) && /Triggered Edge \$\{thr \|\| "\?"\}%/.test(SB), "chips: entry model + position mode summary");
ok(/collapsible defaultOpen=\{false\} n=\{6\}/.test(SB), "Advanced collapsed by default");
ok(/section-chips-/.test(SB), "collapsed sections render summary chips");

console.log("\n[2] Trade Policy tabs");
ok(/data-testid=\{`policy-tab-\$\{k\}`\}/.test(SB), "tabs render policy-tab-<k> testids");
for (const t of ["eligibility", "targets", "drafts", "summary"]) ok(new RegExp(`\\["${t}", "`).test(SB), `tab: ${t}`);
ok(/<DraftsPanel /.test(SB), "Drafts tab renders DraftsPanel");
ok(/policyTab === "summary" && \(\s*<PortfolioManagerControls/.test(SB), "Summary tab hosts the Deployed Policy Reference");

console.log("\n[3] ONE Portfolio Manager control");
ok(!/data-testid="pm-toggle"/.test(PMC), "old PM toggle removed from PortfolioManagerControls");
ok(!/Mode: Enforce/.test(PMC), "hard-coded 'Mode: Enforce' chip removed");
ok(/data-testid=\{`pm-mode-\$\{m\}`\}/.test(TE) && /\["off", "label", "enforce"\]\.map/.test(TE), "the single PM control (Off/Label/Enforce) lives in Eligibility");
ok((SB.match(/pm-mode-/g) || []).length === 0, "the page adds no second PM control");

console.log("\n[4] redundancy relocated + preset = template");
const advBlock = SB.slice(i6);
ok(!SB.slice(0, i6).includes("<RecommendedStackStrip") && advBlock.includes("<RecommendedStackStrip"), "Recommended Stack only in Advanced");
ok(!SB.slice(0, i6).includes("<IncludeDisabledOverride") && advBlock.includes("<IncludeDisabledOverride"), "include-disabled only in Advanced");
ok(!/pm-include-disabled-toggle/.test(PMC) && !/onField\("portfolioIncludeDisabledCohorts"/.test(PMC), "include-disabled CONTROL fully out of the PM docs panel (informational note only)");
ok(/Eligibility preset <span className="normal-case text-muted-lab">\(template\)<\/span>/.test(TE), "presets labelled as templates");
ok(/Advanced \/ Legacy — Session Strategy/.test(SB) && /SUPERSEDES/.test(SB), "legacy Session Strategy block + SUPERSEDES warning kept");
ok(/Legacy Session Strategy owns the emitted scenario for this run/.test(SB), "exact supersede message kept");

console.log("\n[5] table headers: arrows, no cryptic abbreviations");
ok(!/B\/Exp|Be\/Com|Be\/Chp|B\/Com|B\/Chp|Be\/Exp/.test(TE + MSTO), "no B/Exp-style abbreviations remain");
ok(/<StateHeader state=\{st\} \/>/.test(TE) && /<StateHeader state=\{st\} \/>/.test(MSTO), "shared StateHeader in both tables");
const SD = fs.readFileSync("src/components/lab/portfolio/stateDisplay.jsx", "utf8");
ok(/"Bull\/Expand":\s*\{ arrow: "↑", tone: "success"/.test(SD) && /"Bear\/Expand":\s*\{ arrow: "↓", tone: "danger"/.test(SD), "↑ green / ↓ red arrows");

console.log("\n[6] effective-state chips");
const SDmod = loadCjs("src/components/lab/portfolio/stateDisplay.jsx");
const eff = SDmod.effectivePolicyDisplay("DISABLE", { includeDisabled: true });
ok(eff.label === "Never Trade → Label" && eff.tone === "warning" && eff.overridden === true, "DISABLE + include-disabled ⇒ 'Never Trade → Label' (warning, not red)");
const effOff = SDmod.effectivePolicyDisplay("DISABLE", { includeDisabled: false });
ok(effOff.label === "NEVER TRADE" && effOff.tone === "danger", "DISABLE without override stays red NEVER TRADE");
const L = loadCjs("src/data/portfolioLabels.js");
ok(L.POLICY_TONE.LABEL === "success", "ALWAYS ALLOW reads positive (success tone)");
ok(/resolveCohortEligibility\(\{/.test(TE) && /<ResolvedEligibilityCell resolved=\{resolved\} \/>/.test(TE),
   "eligibility table uses the resolved three-layer display (PM · scenario · effective)");

console.log("\n[7] single disclosure per expandable section");
ok(!/msGateOpen/.test(SB) && !/ms-gate-expand/.test(SB), "inner MS-gate double toggle removed");
const CSS = fs.readFileSync("src/index.css", "utf8");
const selRule = CSS.slice(CSS.indexOf('[data-theme="terminal"] select {'), CSS.indexOf('[data-theme="terminal"] input {'));
ok(/appearance:\s*none/.test(selRule) && /background-image/.test(selRule) && /padding-right/.test(selRule),
   "SINGLE select chevron: the global terminal rule paints the custom arrow AND removes the native one (visual fix #1)");
ok(/ONE disclosure control/.test(NP) && !NP.includes('collapsible && (\n                            collapsed\n                                ? <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]'), "NeonPanel accent chevron removed (single right-aligned control)");

console.log("\n[8] Apply — both validated configurations (visual fix #3)");
const VC = JSON.parse(fs.readFileSync("src/data/validatedConfigs.v1.json", "utf8"));
const CT = loadCjs("src/data/configTranslator.js");
const BVC = loadCjs("src/components/lab/portfolio/BestValidatedConfig.jsx");
const byId = Object.fromEntries(VC.configs.map((c) => [c.id, c]));
ok(VC.configs.length === 2 && byId.highest_native && byId.stable_deployed, "two configs: highest_native + stable_deployed");
ok(byId.highest_native.name === "Highest Full-History Native Return" && byId.stable_deployed.name === "Stable Deployed PM Baseline",
   "honest naming — neither is called simply 'Best Validated Configuration'");
ok(/2025\+/.test(VC.caveat) && /highest HISTORICAL/i.test(VC.caveat), "regime caveat present (RR2 outperformed custom targets in 2025+)");
const hn = byId.highest_native.stats;
ok(hn.native_net_r === 131.25 && hn.max_drawdown_r === -13.69 && hn.wins === 302 && hn.losses === 205
   && hn.news_flattened === 11 && hn.win_rate_pct === 59.6 && hn.profit_factor === 1.59 && hn.max_losing_streak === 8,
   "highest-native stats match the run artifact (3fd23fa4…: +131.25R / −13.69R / 302-205-11 / 59.6% / 1.59 / streak 8)");
ok(byId.stable_deployed.stats.native_net_r === 93.21 && byId.stable_deployed.stats.trades_executed === 518,
   "stable-deployed stats unchanged (f4dc44a2…: +93.21R / 518T)");

// Apply B (stable deployed) ⇒ plain enforce run, no scenario
const appliedB = { ...CT.getDefaultBuilderConfig(), ...BVC.applyPatchFor(byId.stable_deployed) };
const emittedB = CT.buildBacktesterConfig(appliedB);
ok(emittedB.portfolio_policy_enabled === true && emittedB.portfolio_policy_mode === "enforce"
   && !("portfolio_include_disabled_cohorts" in emittedB) && !emittedB.session_strategy_scenario,
   "Apply B ⇒ deployed-PM enforce, no scenario, no override");

// Apply A (highest native) ⇒ EXACT reproduction of the artifact's scenario
const appliedA = { ...CT.getDefaultBuilderConfig(), ...BVC.applyPatchFor(byId.highest_native) };
const emittedA = CT.buildBacktesterConfig(appliedA);
ok(emittedA.portfolio_policy_enabled === true && emittedA.portfolio_policy_mode === "enforce"
   && emittedA.portfolio_include_disabled_cohorts === true, "Apply A ⇒ PM enforce + include-disabled override (as in the run)");
const scenA = emittedA.session_strategy_scenario;
ok(scenA && scenA.enabled === true && (scenA.cohorts || []).length === 24, "Apply A ⇒ 24-cohort scenario emitted");
// verify EVERY cohort against the artifact's targets (mirror = FINAL_CANDIDATE_TARGETS)
const { FINAL_CANDIDATE_TARGETS } = loadCjs("src/data/cohortTargetOverrides.js");
const CELL = { BOS: "bos", CHoCH: "choch" };
let matchA = 0, wrongA = [];
for (const r of scenA.cohorts) {
    const key = `${r.session}|${CELL[r.structure] || r.structure.toLowerCase()}_${r.direction.toLowerCase()}`;
    const want = FINAL_CANDIDATE_TARGETS[key];
    if (want != null) {
        if (r.enabled !== false && Number((r.target || {}).rr) === Number(want)) matchA++;
        else wrongA.push(`${key}: got ${JSON.stringify({ enabled: r.enabled, rr: (r.target || {}).rr })}, want ${want}R`);
    } else {
        if (r.enabled === false) matchA++;
        else wrongA.push(`${key}: should be disabled`);
    }
}
ok(matchA === 24 && wrongA.length === 0, `Apply A reproduces all 24 cohorts of the +131.25R run exactly${wrongA.length ? " — " + wrongA[0] : ""}`);
ok(scenA.meta && scenA.meta.enabled_count === 12 && scenA.meta.disabled_count === 12,
   "Apply A meta: 12 enabled / 12 disabled (matches run meta)");

// "No hidden mutations": every patch key is either a registry field or one of the
// page/panel-managed cfg fields that appear verbatim in the page source.
const PANEL_FIELDS = ["singleTriggeredEdgeThresholds", "portfolioIncludeDisabledCohorts",
    "eligibilityEnabled", "stateOverridesEnabled", "cohortOverridesEnabled", "cohortOverridesPreset", "cohortTargetOverrides"];
const RRS = fs.readFileSync("src/components/lab/portfolio/ResolvedRunSummary.jsx", "utf8");
for (const [id, entry] of Object.entries(byId)) {
    const patch = BVC.applyPatchFor(entry);
    ok(Object.keys(patch).every((k) => k in CT.getDefaultBuilderConfig() || PANEL_FIELDS.includes(k)),
       `${id}: apply patch touches only known builder fields (no hidden mutations)`);
}

console.log("\n[9] reload + legacy config load");
const rp = CT.buildRunConfigLoadReport(CT.getDefaultBuilderConfig(), { config: emittedB }).config || {};
ok(rp.portfolioEnabled === true && rp.portfolioMode === "enforce", "applied-best reloads with PM enforce");
ok(rp.eligibilityEnabled !== true && rp.stateOverridesEnabled !== true, "applied-B reloads with no scenario panels on");
const rpA = CT.buildRunConfigLoadReport(CT.getDefaultBuilderConfig(), { config: emittedA }).config || {};
ok(rpA.cohortOverridesEnabled === true && rpA.portfolioIncludeDisabledCohorts === true
   && Number((rpA.cohortTargetOverrides || {})["lull|bos_short"]?.target) === 3.25
   && (rpA.cohortTargetOverrides || {})["london|bos_short"]?.enabled === false,
   "applied-A reloads with the exact cohort targets + disables");
const legacy = CT.buildRunConfigLoadReport(CT.getDefaultBuilderConfig(),
    { config: { portfolio_policy_enabled: true, portfolio_include_disabled_cohorts: true } }).config || {};
ok(legacy.portfolioEnabled === true && legacy.portfolioIncludeDisabledCohorts === true && legacy.portfolioMode === "enforce",
   "legacy include-disabled config loads with exact semantics (visible in Advanced)");

console.log("\n[10] render smoke (react-dom/server)");
try {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { StateHeader, PolicyChip } = SDmod;
    const html1 = renderToStaticMarkup(React.createElement(StateHeader, { state: "Bear/Compress" }));
    ok(html1.includes("↓") && html1.includes("Compress"), "StateHeader renders ↓ Compress");
    const html2 = renderToStaticMarkup(React.createElement(PolicyChip, { action: "DISABLE", includeDisabled: true }));
    ok(html2.includes("Never Trade → Label"), "PolicyChip renders effective override state");
    const PGS = loadCjs("src/components/lab/portfolio/PolicyGroupsSummary.jsx").default;
    const { loadPolicy } = loadCjs("src/data/portfolioPolicy.js");
    const table = loadPolicy(JSON.parse(fs.readFileSync("src/data/deployedPolicy.v1.json", "utf8")));
    const html3 = renderToStaticMarkup(React.createElement(PGS, { table, instrument: "EURUSD", policyVersion: table.policyVersion, defaultOpen: true }));
    ok(html3.includes("FOLLOW TREND") && html3.includes("BLOCK CHOP") && html3.includes("ALWAYS ALLOW") && html3.includes("NEVER TRADE"),
       "PolicyGroupsSummary renders all four groups");
    ok((html3.match(/<li>/g) || []).length === 24, "…with all 24 cohorts listed");
    // PM-disabled but scenario-rescued row — the three-layer resolved display (visual fix #4)
    const resLabel = SDmod.resolveCohortEligibility({ pmAction: "DISABLE", pmMode: "label", scenarioBase: "disable", rescuedCount: 1 });
    ok(resLabel.effective.label === "RESCUED (1 state)" && resLabel.effective.tone === "success" && !resLabel.warning,
       "PM label + rescue ⇒ effective RESCUED (green), no warning — the rescue can execute");
    const resEnforce = SDmod.resolveCohortEligibility({ pmAction: "DISABLE", pmMode: "enforce", scenarioBase: "disable", rescuedCount: 1 });
    ok(resEnforce.effective.label === "PM BLOCKS" && /PM ENFORCE still blocks/.test(resEnforce.warning || ""),
       "PM enforce + rescue ⇒ effective PM BLOCKS + explicit warning");
    const cellHtml = renderToStaticMarkup(React.createElement(SDmod.ResolvedEligibilityCell, { resolved: resLabel }));
    ok(cellHtml.includes("PM: NEVER TRADE") && cellHtml.includes("RESCUED (1 state)"),
       "rendered cell shows PM decision AND effective state together (no contradictory lone red badge)");
    ok(/ms-resolved-/.test(MSTO) && /elig-resolved-/.test(TE) && /ResolvedEligibilityCell/.test(MSTO) && /ResolvedEligibilityCell/.test(TE),
       "SAME resolved-state component used by Eligibility and Targets");
    const BVCdef = loadCjs("src/components/lab/portfolio/BestValidatedConfig.jsx").default;
    const html4 = renderToStaticMarkup(React.createElement(BVCdef, { instrument: "EURUSD", onApply: () => {} }));
    ok(html4.includes("Validated Configurations") && html4.includes("+131.25R") && html4.includes("+93.21R"),
       "both configuration cards render with their headline stats");
    ok(html4.includes("Highest Full-History Native Return") && html4.includes("Stable Deployed PM Baseline")
       && html4.includes("2025+"), "honest naming + regime caveat rendered");
} catch (e) {
    ok(false, `render smoke failed: ${e.message}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
