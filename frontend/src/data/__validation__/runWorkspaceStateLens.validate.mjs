// runWorkspaceStateLens.validate.mjs — Phase-1 Market-State lens UI wiring.
//
// Source-contract checks over SessionResults.jsx (same style as runWorkspacePmUi):
//   [1] Whole Cohort is the default and passes the ORIGINAL rows array through
//       untouched (identity, not a copy) — existing behaviour unchanged.
//   [2] Matrix deep-link opens the right session + cohort + Management tab +
//       selected state (focus prop gated to the exact session|cohort; nonce effect).
//   [3] State selection cannot leak between cohorts: stateKey is component-local
//       to CohortDrilldown and manual toggling clears a stale focus.
//   [4] Scope warning wired in BOTH the matrix and the Management lens block, and
//       renders nothing for unfiltered (label-mode) runs.
//   [5] Client candle fallback: engine-preferred guard, background IndexedDB
//       rehydration, honest loading/missing/unavailable notes, no invented labels.
//   [6] Evidence framing: state view is labelled MFE-rescore/provisional and the
//       recommendation status is hard-coded "Not researched" (no policy doc yet).
//
// Run from frontend/:  node src/data/__validation__/runWorkspaceStateLens.validate.mjs

import fs from "fs";

const SR = fs.readFileSync("src/components/lab/sessionProfiles/SessionResults.jsx", "utf8");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

console.log("\n[1] Whole Cohort default + identity pass-through");
ok(/useState\(focus && focus\.state \? focus\.state : "all"\)/.test(SR), "stateKey defaults to \"all\" (Whole Cohort) unless deep-linked");
ok(/\(!stateSelected \? c\.executedTrades : \(\(lens && lens\.byState\.get\(stateKey\)\) \|\| \[\]\)\)/.test(SR), "Whole Cohort passes the ORIGINAL executedTrades reference (no copy/filter)");
// STATE-TARGET-POLICY: TargetSuitability's Δ anchor is now the EXECUTED target of
// the selected cell (state override / block / cohort base), with the cohort base
// threaded separately for the ◇ Base ladder tag.
ok(/<ManagementCallouts rows=\{stateRows\}/.test(SR) && /<ExcursionSnapshot rows=\{stateRows\}/.test(SR) && /<TargetSuitability rows=\{stateRows\} tpLabel=\{executedTargetLabel\} baseLabel=\{c\.tpLabel\}/.test(SR) && /<BESuitability rows=\{stateRows\}/.test(SR) && /<RiskReduction rows=\{stateRows\}/.test(SR), "every Management panel consumes stateRows (single lens, no per-panel filtering)");
ok(!/cohortTargetEconomics\(/.test(SR.slice(SR.indexOf("function StateLensBar"), SR.indexOf("const DRILL_TABS"))), "lens UI adds NO new target-analysis math");

console.log("\n[2] Matrix deep-link → session + cohort + Management + state");
ok(/const openCohortAtState = React\.useCallback\(\(sKey, cKey, stateKey\) => \{\s*setSessionKey\(sKey\);\s*setExpanded/.test(SR), "deep-link switches session tab and expands the cohort");
ok(/setDrillFocus\(\{ sessionKey: sKey, cohortKey: cKey, state: stateKey === "all" \? "all" : stateKey, nonce: Date\.now\(\) \}\)/.test(SR), "deep-link records cohort + state + nonce");
ok(/drillFocus && drillFocus\.sessionKey === active\.key && drillFocus\.cohortKey === c\.key \? drillFocus : null/.test(SR), "focus prop reaches ONLY the exact session|cohort drilldown");
ok(/if \(focus\) \{ setTab\("management"\); setStateKey\(focus\.state \|\| "all"\); \}/.test(SR), "focus opens the Management tab at the requested state");
ok(/\[focus && focus\.nonce\]/.test(SR), "re-clicking a cell for an already-open cohort refocuses (nonce-keyed effect)");
ok(/onOpen\(s\.key, c\.key, k\)/.test(SR) && /onOpen\(s\.key, c\.key, "all"\)/.test(SR), "matrix cells + cohort name wired to onOpen");

console.log("\n[3] No selection leak between cohorts");
{
    const drill = SR.slice(SR.indexOf("function CohortDrilldown"), SR.indexOf("// Props are the explicit per-run data"));
    ok(/const \[stateKey, setStateKey\] = useState\(/.test(drill), "stateKey is LOCAL CohortDrilldown state (one per open cohort, dies on collapse)");
    ok(!/setDrillFocus/.test(drill), "drilldown never writes the shared focus");
}
ok(/setDrillFocus\(\(f\) => \(f && f\.sessionKey === active\.key && f\.cohortKey === c\.key \? null : f\)\)/.test(SR), "manual header toggle clears a stale focus so re-expand opens at Overview");

console.log("\n[4] Scope warning: enforce/filter runs warn, label runs stay quiet");
ok(/if \(!scope \|\| !scope\.filtered\) return null/.test(SR), "PmScopeWarning renders NOTHING when the run is state-complete (label mode)");
ok(/const populationScope = React\.useMemo\(\s*\(\) => statePopulationScope\(cfg, \{ portfolioBlockedTotal: portfolioSummary \? portfolioSummary\.total : 0 \}\)/.test(SR), "scope derived from run config + observed REGIME_BLOCKED rows");
{
    const matrix = SR.slice(SR.indexOf("function TargetPolicyMatrix"), SR.indexOf("const DRILL_TABS"));
    ok(/<PmScopeWarning scope=\{scope\} compact \/>/.test(matrix), "warning wired into the matrix");
    const mgmt = SR.slice(SR.indexOf("state-lens-block"), SR.indexOf("Suitability panels FIRST"));
    ok(/<PmScopeWarning scope=\{scope\} compact \/>/.test(mgmt), "warning wired into the Management lens block");
}

console.log("\n[5] Client candle fallback (engine-preferred, background, honest)");
ok(/rehydrateRunCandles/.test(SR) && /candlesStorage === "indexeddb"/.test(SR), "IndexedDB rehydration reused (TradeInspector pattern)");
ok(/if \(!bundle\?\.id \|\| !anyMissingEngine \|\| !candlesInIndexedDb \|\| candleLoadState !== "idle"\) return undefined/.test(SR), "candles NEVER loaded when every executed row already has engine state");
ok(/executedRows\.some\(\(t\) => !\(t && t\.regimeEmit && t\.regimeEmit\.marketState\)\)/.test(SR), "need computed over EXECUTED rows only");
ok(/if \(!anyMissingEngine\) return null/.test(SR), "client panel never built when engine covers all rows");
ok(/data-testid=\{`client-panel-\$\{status\.key\}`\}/.test(SR) && /Unlabelled/.test(SR), "loading/missing/unavailable notes present; unresolved rows stay Unlabelled");
ok(/getRunData\(bundleProp\.id\) \|\| bundleProp/.test(SR), "post-rehydration bundle re-read (background load, no page block)");
ok(!/setTimeout|await rehydrate/.test(SR.slice(SR.indexOf("export default function SessionResults"))), "rehydration is fire-and-forget (non-blocking)");
// Sidecar 1D fallback — for result-bundle imports whose bundles NEVER carried candles.
ok(/loadDailyRegimeCandles/.test(SR) && /regimeDailyCandles/.test(SR), "sidecar daily-bucket fallback wired (regimeDailyCandles slot)");
ok(/if \(hasCandlesInMemory \|\| hasDailyCandles \|\| candlesInIndexedDb\) return undefined/.test(SR), "sidecar fetch only fires when NO better candle source exists");
{
    const ST = fs.readFileSync("src/data/store.js", "utf8");
    const fn = ST.slice(ST.indexOf("export async function loadDailyRegimeCandles"), ST.indexOf("const INSPECTOR_WINDOW_INFLIGHT"));
    ok(/aggregate: "ohlc", bucket: "1D"/.test(fn), "store fetches epoch-aligned 1D buckets (tiny payload, panel-equivalent)");
    ok(/regimeDailyCandles: candles/.test(fn) && !/displayCandles:/.test(fn) && !/[^A-Za-z]candles:\s*candles/.test(fn) && !/hasCandles:/.test(fn), "store caches ONLY regimeDailyCandles — never run.candles / Strategy-Map displayCandles");
    ok(/REGIME_DAILY_INFLIGHT/.test(fn), "in-flight de-dupe (one sidecar fetch per run)");
}

console.log("\n[6] Evidence vs recommendation semantics");
ok(/MFE rescore evidence · provisional/.test(SR), "state view framed as MFE-rescore evidence (provisional)");
ok(/State recommendation: Not researched/.test(SR), "state recommendation hard-labelled Not researched");
ok(/Not researched/.test(SR.slice(SR.indexOf("function TargetPolicyMatrix"), SR.indexOf("const DRILL_TABS"))), "matrix status column reads Not researched");
ok(/state source: \{s\.label\}/.test(SR), "state-source provenance badge rendered");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
