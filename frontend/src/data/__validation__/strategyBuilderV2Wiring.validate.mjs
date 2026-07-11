// strategyBuilderV2Wiring.validate.mjs — Strategy Builder V2 entry/protection wiring.
//
// Static source checks on the V2 page (defaults, removed obsolete controls, no localStorage)
// + payload checks through the REAL configTranslator/attachSessionStrategy path:
//   A. default entry model = Triggered Edge; default variants = All; stop buffer = 1
//   B. Triggered Edge selection wires multi thresholds (singleTriggeredEdgeThresholds)
//      + multi arms (triggeredEdgeDelays); auto variant mode = all
//   C. Penetration selection → research sweep (multi entryPenetrationThresholds); auto all
//   D. Baseline hides TE/penetration variant controls (no per-model chips)
//   E. BE supports multiple arm levels (be_arm_levels) + trigger bases
//   F. obsolete Allow Auto Reversal / Block Opposite controls are NOT in the primary V2 UI
//   G. payload serialisable; no per-cohort entry; buildSidecarPayload reflects V2 cfg
//   H. no localStorage / old session-profile APIs
//
// Run from frontend/:  node src/data/__validation__/strategyBuilderV2Wiring.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

function load(p, cache = new Map()) {
    p = path.resolve(p.endsWith(".js") ? p : p + ".js");
    if (cache.has(p)) return cache.get(p);
    const { code } = babel.transformSync(fs.readFileSync(p, "utf8"), {
        filename: p, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
    });
    const mod = { exports: {} }; cache.set(p, mod.exports);
    const req = (s) => (s.startsWith(".") ? load(path.resolve(path.dirname(p), s), cache) : {});
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(p, mod.exports); return mod.exports;
}

const ct = load("src/data/configTranslator.js");
const ss = load("src/data/sessionScenarioConfig.js");
const se = load("src/data/sessionStrategyEdits.js");
const SRC = fs.readFileSync("src/pages/StrategyBuilderV2.jsx", "utf8");

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };
const J = (x) => JSON.stringify(x);

// base cfg shared by payload checks
const BASE = { symbol: "EURUSD", detectionTf: "M15", executionTf: "1m", dateFrom: "2020-01-02", dateTo: "2025-05-18", dataFile: "x", swing: 50, obFilter: "ATR", minObSizePips: 0, maxObSizePips: 100, structure: "Both", direction: "Both", bosLong: true, bosShort: true, chochLong: true, chochShort: true, rr: 2, obEntryDepthPct: 0, entryBuffer: 0, stopBuffer: 1, verifyTicks: 0, executionMode: "multi_position", conflict: "Allow Auto Reversal", cancelAction: "Kill OB", sessionFilter: false, london: true, lull: true, newYork: true, asia: true, outside: true, originSession: "Any", detectionSession: "Any", newsBlackout: true, newsFile: "x", newsBlackoutBefore: 60, newsBlackoutAfter: 60, newsBlackoutImpacts: ["high"], newsBlackoutCurrencies: [], newsPausePending: true, newsBlockFills: true, newsCancelIfTouched: true, newsFlattenActiveTrades: true, newsFlattenMinutesBefore: 5, spread: 0.2, slippage: 0.2, commission: 0, entryResearchExportMode: "light", entryResearchExports: false, entryPenetrationThresholds: "25", useBatchedEntryPenetration: true, triggeredEdgeEntries: false, triggeredEdgeThresholds: "25", triggeredEdgeEntryLevelPct: 0, triggeredEdgeSameCandleMode: "both", triggeredEdgeDelays: [0, 1], entryMode: "single", selectedEntryModel: "triggered_edge", singlePenetrationPct: 25, singleTriggeredEdgeThreshold: 25, singleTriggeredEdgeThresholds: [25], monteCarlo: false, parallelScenarios: true, maxWorkers: 0, beEnabled: true, beArmLevels: [0.5, 1], beTriggerBases: ["wick", "close"], beDelayCandles: 0, beVariants: "all", variantMode: "all" };
const payload = (cfg) => { const base = ct.buildBacktesterConfig(cfg); const stripped = Object.fromEntries(Object.entries(base).filter(([k]) => !String(k).startsWith("_"))); return ss.attachSessionStrategy(stripped, se.DEFAULT_SESSION_STRATEGY); };

console.log("\n[A] defaults: Triggered Edge · All variants · stop 1");
ok("DEFAULT_CFG selectedEntryModel = triggered_edge", /selectedEntryModel:\s*"triggered_edge"/.test(SRC));
ok("DEFAULT_CFG variantMode = all", /variantMode:\s*"all"/.test(SRC));
ok("DEFAULT_CFG stopBuffer = 1", /stopBuffer:\s*1\b/.test(SRC));

console.log("\n[B] Triggered Edge wires multi thresholds + arms; payload reflects it");
{
    const c = payload({ ...BASE, selectedEntryModel: "triggered_edge", entryMode: "single", singleTriggeredEdgeThresholds: [10, 25], triggeredEdgeDelays: [0, 10, 40] });
    ok("entry_models = [triggered_edge]", J(c.entry_models) === J(["triggered_edge"]));
    ok("TE trigger thresholds = [10,25]", J(c.triggered_edge_trigger_thresholds) === J([10, 25]));
    ok("TE arms (candle delays) = [0,10,40]", J(c.triggered_edge_candle_delays) === J([0, 10, 40]));
    ok("source: Trigger Thresholds + Arm Candles chips", /Trigger Thresholds/.test(SRC) && /Arm Candles/.test(SRC));
    ok("source: onEntryModel sets TE → variantMode all", /triggered_edge".*variantMode\s*=\s*"all"/s.test(SRC));
}

console.log("\n[C] Penetration → research sweep, multi thresholds; auto all");
{
    const c = payload({ ...BASE, selectedEntryModel: "entry_penetration", entryMode: "research", entryResearchExports: true, entryResearchExportMode: "custom", entryPenetrationThresholds: "10,25,50", triggeredEdgeEntries: false });
    ok("entry_models include entry_penetration", (c.entry_models || []).includes("entry_penetration"));
    ok("penetration thresholds = [10,25,50] (custom mode passes chips)", J(c.entry_penetration_thresholds) === J([10, 25, 50]));
    ok("baseline included in penetration sweep", (c.entry_models || []).includes("baseline"));
    ok("source: onEntryModel penetration → research + custom + all", (() => {
        const m = SRC.match(/model === "entry_penetration"\)\s*\{([^}]*)\}/);
        const b = m ? m[1] : "";
        return /entryMode\s*=\s*"research"/.test(b) && /entryResearchExportMode\s*=\s*"custom"/.test(b) && /variantMode\s*=\s*"all"/.test(b);
    })());
}

console.log("\n[D] Baseline hides per-model variant controls");
ok("source: TE chips gated on selectedEntryModel === triggered_edge", /selectedEntryModel === "triggered_edge"/.test(SRC));
ok("source: penetration chips gated on entry_penetration", /selectedEntryModel === "entry_penetration"/.test(SRC));
ok("source: baseline shows 'no penetration threshold'", /no penetration threshold/.test(SRC));

console.log("\n[E] Break-even multiple arm R levels");
{
    const c = payload({ ...BASE, beEnabled: true, beArmLevels: [0.5, 1, 2], beTriggerBases: ["wick", "close"] });
    ok("be_arm_levels = [0.5,1,2] (multiple)", J(c.be_arm_levels) === J([0.5, 1, 2]));
    ok("be_trigger_bases = [wick,close]", J(c.be_trigger_bases) === J(["wick", "close"]));
    ok("source: BE arm chips use BE_ARM_LEVEL_CHOICES", /BE_ARM_LEVEL_CHOICES/.test(SRC));
}

console.log("\n[F] obsolete Allow Auto Reversal / Block Opposite removed from primary UI");
ok("no 'Allow Auto Reversal' Segment in V2", !/"Allow Auto Reversal", "Block Opposite"/.test(SRC) && !/options=\{\["Allow Auto Reversal"/.test(SRC));
ok("no Execution Mode segment in V2 primary UI", !/Execution Mode/.test(SRC));

console.log("\n[G] payload serialisable; no per-cohort entry; reflects cfg");
{
    const c = payload({ ...BASE, rr: 3.5 });
    ok("payload serialisable", J(JSON.parse(J(c))) === J(c));
    ok("rr change reflected (3.5)", c.rr_multiple === 3.5);
    ok("session_strategy_scenario attached, no cohort entry", c.session_strategy_scenario && c.session_strategy_scenario.cohorts.every((x) => !("entry" in x)));
    ok("buildSidecarPayload path = buildBacktesterConfig + attachSessionStrategy", /buildBacktesterConfig\(cfg\)/.test(SRC) && /attachSessionStrategy\(stripped, sessionStrategy\)/.test(SRC));
}

console.log("\n[H] no OLD session-profile APIs (new V2 persistence key is allowed)");
{
    const code = SRC.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("no old getSessionProfiles / applySessionProfiles / setSessionProfiles", !/getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(code));
    ok("no old fxob_session_profiles_v1 key in code", !/fxob_session_profiles_v1/.test(code));
    ok("any localStorage use targets the V2 key only", (() => {
        const calls = code.match(/localStorage\??\.\s*(getItem|setItem|removeItem)\([^)]*\)/g) || [];
        return calls.every((c) => /V2_STORAGE_KEY/.test(c));
    })());
}

// Transpile the V2 page (JSX) and grab the exported pure run-name helper, stubbing
// every import — so the unit test runs the SAME source the page ships.
function loadJsxExport(name) {
    const { code } = babel.transformSync(SRC, {
        filename: "src/pages/StrategyBuilderV2.jsx",
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }], "@babel/preset-react"],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    // Recursive callable stub: any property access or call returns the same stub,
    // so module-level calls (React.createContext, etc.) don't throw on import.
    const stub = new Proxy(function () { return stub; }, { get: () => stub, apply: () => stub });
    const req = () => stub;
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports[name];
}

console.log("\n[I] suggested run name: exact format + entry-model token + date range");
{
    const buildName = loadJsxExport("buildSuggestedRunName");
    ok("buildSuggestedRunName is exported + callable", typeof buildName === "function");
    ok("default-ish cfg → EURUSD_M15_TE_2R_2020-01-02_to_2025-05-18",
        buildName({ symbol: "EURUSD", detectionTf: "M15", selectedEntryModel: "triggered_edge", rr: 2, dateFrom: "2020-01-02", dateTo: "2025-05-18" })
        === "EURUSD_M15_TE_2R_2020-01-02_to_2025-05-18");
    ok("penetration → PEN token", /_PEN_/.test(buildName({ symbol: "GBPUSD", detectionTf: "H1", selectedEntryModel: "entry_penetration", rr: 3, dateFrom: "2021-01-01", dateTo: "2022-01-01" })));
    ok("baseline → BASE token", /_BASE_/.test(buildName({ symbol: "USDJPY", detectionTf: "M30", selectedEntryModel: "baseline", rr: 1.5, dateFrom: "2020-01-01", dateTo: "2020-06-01" })));
    ok("changing symbol changes suggested name",
        buildName({ symbol: "EURUSD", detectionTf: "M15", selectedEntryModel: "triggered_edge", rr: 2, dateFrom: "2020-01-02", dateTo: "2025-05-18" })
        !== buildName({ symbol: "AUDUSD", detectionTf: "M15", selectedEntryModel: "triggered_edge", rr: 2, dateFrom: "2020-01-02", dateTo: "2025-05-18" }));
}

console.log("\n[J] run-name: canonical auto name (deriveRunName) + optional nickname override");
ok("source: canonical auto name via deriveRunName", /deriveRunName\(autoNameConfig,/.test(SRC));
ok("source: auto name derived from the exact submitted config", /const autoNameConfig = useMemo\(\(\) => \{[\s\S]*buildBacktesterConfig\(cfg\)[\s\S]*attachSessionStrategy\(stripped, sessionStrategy\)/.test(SRC));
ok("source: PM version label from deployed mirror", /shortPolicyVersion\(deployedPolicyDoc\.policy_version\)/.test(SRC));
ok("source: effective name = nickname || auto name", /const effectiveRunName = \(runName \|\| ""\)\.trim\(\) \|\| autoName\.full/.test(SRC));
ok("source: nickname edit just sets runName (no dirty coupling)", /const onRunNameEdit = \(e\) => setRunName\(e\.target\.value\)/.test(SRC));
ok("source: reset-to-auto clears the nickname", /const resetToAutoName = \(\) => setRunName\(""\)/.test(SRC));
ok("source: live auto-name preview + nickname field present", /data-testid="run-autoname"/.test(SRC) && /data-testid="run-nickname"/.test(SRC) && /data-testid="run-reset-auto"/.test(SRC));
ok("source: 'Leave blank to use automatic name' hint", /Leave blank to use automatic name/.test(SRC));
ok("source: nickname input uses onRunNameEdit (not raw setRunName)", /onChange=\{onRunNameEdit\}/.test(SRC));

console.log("\n[K] news blackout default 5/5 + stop buffer 1 (defaults + payload)");
ok("DEFAULT_CFG newsBlackoutBefore = 5", /newsBlackoutBefore:\s*5\b/.test(SRC));
ok("DEFAULT_CFG newsBlackoutAfter = 5", /newsBlackoutAfter:\s*5\b/.test(SRC));
{
    const c = payload({ ...BASE, newsBlackout: true, newsBlackoutBefore: 5, newsBlackoutAfter: 5, stopBuffer: 1 });
    ok("payload news_blackout_minutes_before = 5", c.news_blackout_minutes_before === 5);
    ok("payload news_blackout_minutes_after = 5", c.news_blackout_minutes_after === 5);
    ok("payload stop_buffer_pips = 1", c.stop_buffer_pips === 1);
}

console.log("\n[L] date controls reuse the original NeonDatePicker + Max Range");
ok("source: imports NeonDatePicker", /import\s*\{\s*NeonDatePicker\s*\}\s*from\s*"@\/components\/lab\/NeonDatePicker"/.test(SRC));
ok("source: Start/End use NeonDatePicker, no native type=\"date\"", /NeonDatePicker[^>]*v2-date-from/.test(SRC) && /NeonDatePicker[^>]*v2-date-to/.test(SRC) && !/type="date"/.test(SRC));
ok("source: NeonDatePicker onChange updates cfg dateFrom (via setDateFrom) / dateTo", /onChange=\{\(v\)\s*=>\s*setDateFrom\(v\)\}/.test(SRC) && /endDateEdited\.current = true;\s*set\("dateTo"\)\(v\)/.test(SRC));
// Max Range = true Full History (earliest→latest of the widest dataset), NOT a hardcoded
// 2020 start. The old behaviour (dateFrom:"2020-01-02") produced 2020-start "Full history"
// runs; it is now resolved deterministically via resolveFullHistory().
{
    const mr = (SRC.match(/const onMaxRange\s*=\s*[^\n]*/) || [""])[0];
    ok("source: Max Range applies resolveFullHistory() (no hardcoded 2020 start)",
        /resolveFullHistory\(\)/.test(mr) && !/2020-01-02/.test(mr));
}

console.log("\n[L2] End date defaults to last available candle (market-data status)");
ok("source: imports getMarketDataStatus", /getMarketDataStatus\s*\}?.*from\s*"@\/data\/sidecarClient"|getMarketDataStatus,/.test(SRC) || /getMarketDataStatus/.test(SRC));
ok("source: fetches status on symbol change", /getMarketDataStatus\(cfg\.symbol\)/.test(SRC) && /\}, \[cfg\.symbol\]\);/.test(SRC));
ok("source: sets dateTo to last_candle unless manually edited", /endDateEdited\.current\) return;/.test(SRC) && /dateTo === last \? prev : \{ \.\.\.prev, dateTo: last \}/.test(SRC));
ok("source: pickers span the union range so pre-2020 dates are always selectable", /min=\{effectiveDateBounds\?\.min\} max=\{effectiveDateBounds\?\.max\}/.test(SRC) && /const effectiveDateBounds = unionBounds\(\)/.test(SRC));
ok("source: picking a pre-2020 start auto-switches the candle file (candleFileForStart)", /const setDateFrom = \(v\) => setCfg\(\(c\) => \(\{ \.\.\.c, dateFrom: v, dataFile: candleFileForStart\(v, c\.dataFile\) \}\)\);/.test(SRC));

console.log("\n[M] BE trigger basis is single-select (Wick default) in V2 Global Strategy");
ok("DEFAULT_CFG beTriggerBases = ['wick'] (single)", /beTriggerBases:\s*\["wick"\]/.test(SRC));
ok("Global BE trigger uses single-select Segment (not multi Chips)", /options=\{\[\{ value: "wick", label: "Wick" \}, \{ value: "close", label: "Close" \}\]\}/.test(SRC) && !/Chips choices=\{BE_TRIGGERS\}/.test(SRC));
ok("Segment value falls back to 'wick' (never empty)", /\|\| "wick"/.test(SRC));
ok("onChange writes a one-element array (keeps backend array contract)", /set\("beTriggerBases"\)\(\[v\]\)/.test(SRC));
{
    // wick default compiles to be_trigger_bases = ["wick"]
    const cw = payload({ ...BASE, beEnabled: true, beTriggerBases: ["wick"], beArmLevels: [1] });
    ok("wick default → payload be_trigger_bases = ['wick']", J(cw.be_trigger_bases) === J(["wick"]));
    const cc = payload({ ...BASE, beEnabled: true, beTriggerBases: ["close"], beArmLevels: [1] });
    ok("close → payload be_trigger_bases = ['close']", J(cc.be_trigger_bases) === J(["close"]));
    // BE on never yields an empty/null trigger basis
    ok("BE on → be_trigger_bases is non-empty", Array.isArray(cw.be_trigger_bases) && cw.be_trigger_bases.length >= 1);
}

console.log("\n[N] versioned V2 persistence (new key) — roundtrip, reset, old key untouched");
{
    const mod = loadV2Exports();
    const KEY = mod.V2_STORAGE_KEY;
    ok("persistence key = fxob_strategy_builder_v2_state", KEY === "fxob_strategy_builder_v2_state");
    ok("does NOT use old session-profile key", KEY !== "fxob_session_profiles_v1" && !/fxob_session_profiles_v1/.test(SRC));
    // localStorage shim
    const store = new Map();
    global.window = { localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, val) => store.set(k, String(val)),
        removeItem: (k) => store.delete(k),
    } };
    // save/load roundtrip
    const saved = { version: mod.V2_STORAGE_VERSION, cfg: { symbol: "GBPUSD", rr: 3 }, sessionStrategy: { enabled: true }, runName: "MY_RUN", runNameDirty: true, gridUi: { defaultsOpen: true } };
    store.set(KEY, JSON.stringify(saved));
    const loaded = mod.loadPersistedV2();
    ok("roundtrip: loadPersistedV2 returns saved cfg/runName", loaded && loaded.cfg.symbol === "GBPUSD" && loaded.runName === "MY_RUN" && loaded.runNameDirty === true);
    // invalid → null (fail safe)
    store.set(KEY, "{not json");
    ok("invalid JSON → null (fail safe to defaults)", mod.loadPersistedV2() === null);
    store.set(KEY, JSON.stringify({ version: 999, cfg: {}, sessionStrategy: {} }));
    ok("wrong version → null (fail safe)", mod.loadPersistedV2() === null);
    // reset clears the key, and never touches the old profiles key
    store.set(KEY, JSON.stringify(saved));
    store.set("fxob_session_profiles_v1", "SENTINEL");
    mod.clearPersistedV2();
    ok("clearPersistedV2 removes the V2 key", !store.has(KEY));
    ok("clearPersistedV2 leaves old fxob_session_profiles_v1 untouched", store.get("fxob_session_profiles_v1") === "SENTINEL");
    delete global.window;
}

console.log("\n[O] V2 page wires persistence + grid collapse UI");
ok("source: writes versioned payload to V2_STORAGE_KEY", /window\.localStorage\?\.setItem\(V2_STORAGE_KEY,\s*JSON\.stringify\(\{\s*version: V2_STORAGE_VERSION/.test(SRC));
ok("source: seeds state from loadPersistedV2()", /useMemo\(loadPersistedV2/.test(SRC));
ok("source: Reset All calls clearPersistedV2()", /clearPersistedV2\(\)/.test(SRC));
ok("source: grid receives ui + onUiChange (persisted collapse)", /<SessionStrategyGrid[^>]*ui=\{gridUi\}[^>]*onUiChange=\{setGridUi\}/.test(SRC));

// Load the V2 page's exported persistence helpers (JSX transpile + stubbed imports).
function loadV2Exports() {
    const { code } = babel.transformSync(SRC, {
        filename: "src/pages/StrategyBuilderV2.jsx",
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }], "@babel/preset-react"],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    const stub = new Proxy(function () { return stub; }, { get: () => stub, apply: () => stub });
    // Resolve the REAL data modules (so summary helpers that call summarizeEnabledCohorts /
    // SESSIONS / CELLS run for real); stub everything else (react, controls, clients…).
    const realData = {
        "@/data/sessionStrategyEdits": "src/data/sessionStrategyEdits.js",
        "@/data/cohortKeys": "src/data/cohortKeys.js",
        "@/data/sessionScenarioConfig": "src/data/sessionScenarioConfig.js",
        "@/data/configTranslator": "src/data/configTranslator.js",
    };
    const req = (spec) => (realData[spec] ? load(realData[spec]) : stub);
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

console.log("\n[P] live run: poll start/stop + terminal status helpers");
{
    const mod = loadV2Exports();
    ok("isTerminalStatus true for completed/failed/cancelled", mod.isTerminalStatus("completed") && mod.isTerminalStatus("failed") && mod.isTerminalStatus("cancelled") && mod.isTerminalStatus("succeeded"));
    ok("isTerminalStatus false for queued/running", !mod.isTerminalStatus("queued") && !mod.isTerminalStatus("running") && !mod.isTerminalStatus("starting"));
    ok("isSuccessStatus only for completed/succeeded", mod.isSuccessStatus("completed") && mod.isSuccessStatus("succeeded") && !mod.isSuccessStatus("failed"));
    ok("isFailureStatus only for failed/cancelled", mod.isFailureStatus("failed") && mod.isFailureStatus("cancelled") && !mod.isFailureStatus("completed"));
    // honest progress derivation
    ok("deriveProgress: index/total → percent + stage", (() => {
        const p = mod.deriveProgress({ current_index: 3, total_passes: 6, current_label: "London" });
        return p && p.pct === 50 && p.idx === 3 && p.total === 6 && p.stage === "London";
    })());
    ok("deriveProgress: stage only when no counts", (() => {
        const p = mod.deriveProgress({ current_kind: "baseline" });
        return p && p.pct === null && p.stage === "baseline";
    })());
    ok("deriveProgress: null when nothing countable (→ unavailable message)", mod.deriveProgress({}) === null);
    ok("formatSidecarError maps 413 → import-too-large guidance", /too large/i.test(mod.formatSidecarError({ status: 413 })));
}

console.log("\n[Q] live run: source wiring (poll, import, nav, cleanup, isolation)");
ok("polls getSidecarRun on an interval", /window\.setInterval\(async\s*\(\)\s*=>\s*\{[^]*getSidecarRun\(jid\)/.test(SRC));
ok("poll gated on runInProgress (stops at terminal)", /const runInProgress = !!runJob\?\.job_id && !isTerminalStatus\(runJob\?\.status\)/.test(SRC) && /if \(!runJob\?\.job_id \|\| !runInProgress\) return undefined;/.test(SRC));
ok("poll cleans up interval (unmount / new run / terminal)", /return \(\) => window\.clearInterval\(timer\)/.test(SRC));
ok("poll interval is 2–5s", /\},\s*2500\)/.test(SRC));
ok("auto-import only on success, once (importTriggeredRef guard)", /if \(isSuccessStatus\(runJob\.status\) && !importTriggeredRef\.current\)/.test(SRC) && /importTriggeredRef\.current = true;\s*importCompletedRun\(runJob\)/.test(SRC));
ok("failure never imports (auto-import effect is success-gated only)", (() => {
    // Isolate the auto-import effect and assert its trigger guard uses isSuccessStatus
    // and never isFailureStatus.
    const m = SRC.match(/Auto-import exactly once[^]*?\}, \[runJob\?\.status, runJob\?\.job_id, importCompletedRun\]\);/);
    const block = m ? m[0] : "";
    return block && /isSuccessStatus\(runJob\.status\)/.test(block) && !/isFailureStatus/.test(block) && /importCompletedRun\(runJob\)/.test(block);
})());
ok("import uses SHARED ingestRunBundle + addRunBundle (no manual trade parse)", /ingestRunBundle\(files\)/.test(SRC) && /addRunBundle\(result\.bundle\)/.test(SRC) && /fetchAndIngest\(job, getSidecarRunBundle\)/.test(SRC));
ok("new submit resets import + poll tracking", /importTriggeredRef\.current = false;/.test(SRC) && /setImportedRunId\(""\);/.test(SRC));
ok("navigation: Open Run Workspace → /runs/<importedRunId>", /to=\{`\/runs\/\$\{encodeURIComponent\(importedRunId\)\}`\}/.test(SRC) && /Open Run Workspace/.test(SRC));
ok("navigation: fallback link to Runs page", /to="\/runs"/.test(SRC));
ok("honest missing-progress copy present", /Working… \(progress details not reported yet\)\./.test(SRC));
ok("ETA is REAL (from sidecar eta_seconds), never synthesised", /p\.eta_seconds \?\? job\.eta_seconds/.test(SRC) && /Number\.isFinite\(etaS\) && etaS > 0 \? formatSeconds\(etaS\)/.test(SRC));
ok("failure state shows error + does not import", /data-testid="run-failed"/.test(SRC));
ok("Run buttons disabled while in progress (no double submit)", /disabled=\{running \|\| runInProgress\}/.test(SRC));

console.log("\n[R] no payload change + old-system isolation still hold");
{
    // identical payload path as before the live-run feature
    const c = payload({ ...BASE });
    ok("payload still = buildBacktesterConfig + attachSessionStrategy", /buildBacktesterConfig\(cfg\)/.test(SRC) && /attachSessionStrategy\(stripped, sessionStrategy\)/.test(SRC));
    ok("payload still attaches session_strategy_scenario + baseline_comparison", "session_strategy_scenario" in c && "baseline_comparison" in c);
    ok("no old session-profile APIs introduced", !/getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(SRC) && !/fxob_session_profiles_v1/.test(SRC.split("\n").filter((l)=>!l.trim().startsWith("//")).join("\n")));
}

console.log("\n[S] Run-complete summary helpers (pure, snapshot-driven)");
{
    const mod = loadV2Exports();
    // computeVariantLines — TE thresholds × arms
    const te = mod.computeVariantLines({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [10, 25], triggeredEdgeDelays: [10, 40] });
    ok("computeVariantLines TE = thresholds × arms (4 lines)", te.length === 4 && te[0] === "Triggered Edge 10% · C10" && te[3] === "Triggered Edge 25% · C40");
    const pen = mod.computeVariantLines({ selectedEntryModel: "entry_penetration", entryPenetrationThresholds: "10,25,50" });
    ok("computeVariantLines penetration = baseline + thresholds", pen[0].includes("Baseline") && pen.includes("Penetration 25%"));
    ok("computeVariantLines baseline = single line", mod.computeVariantLines({ selectedEntryModel: "baseline" }).length === 1);
    // globalStrategyLines — friendly run-plan rows from the SUBMITTED cfg
    const g = mod.globalStrategyLines({ selectedEntryModel: "triggered_edge", direction: "Both", rr: 2, beEnabled: true, beTriggerBases: ["wick"], beArmLevels: [0.5, 1], stopBuffer: 1, newsBlackout: true, newsBlackoutBefore: 5, newsBlackoutAfter: 5, spread: 0.2, slippage: 0.2, commission: 0 });
    const gget = (k) => (g.find(([kk]) => kk === k) || [])[1];
    ok("globalStrategyLines entry model label = Triggered Edge", gget("Entry model") === "Triggered Edge");
    ok("globalStrategyLines BE = 'Wick at 0.5R / 1R'", gget("Break-even") === "Wick at 0.5R / 1R");
    ok("globalStrategyLines news = '5m before / 5m after'", gget("News blackout") === "5m before / 5m after");
    ok("globalStrategyLines target = 2R, stop buffer 1 pip", gget("Target") === "2R" && gget("Stop buffer") === "1 pip");
    // formatElapsed — honest runtime
    ok("formatElapsed: 261s → '4m 21s'", mod.formatElapsed("2026-01-01T00:00:00Z", "2026-01-01T00:04:21Z") === "4m 21s");
    ok("formatElapsed: missing → null", mod.formatElapsed(null, "2026-01-01T00:01:00Z") === null);
}

console.log("\n[T] What-was-run uses the SUBMITTED snapshot + run-complete UI wiring");
ok("source: onRun snapshots cfg/sessionStrategy/payload at submit (effective name)", /const submitName = effectiveRunName;/.test(SRC) && /setRunSnapshot\(\{ cfg, sessionStrategy, runName: submitName, payload \}\)/.test(SRC));
ok("source: What-was-run reads runSnapshot (not live cfg)", /globalStrategyLines\(runSnapshot\.cfg\)/.test(SRC) && /<VariantGroupView cfg=\{runSnapshot\.cfg\}/.test(SRC) && /sessionPlanDetailed\(runSnapshot\.sessionStrategy\)/.test(SRC));
ok("source: sessionPlan excludes disabled sessions via summarizeEnabledCohorts + off flag", /summarizeEnabledCohorts\(sessionStrategy\)/.test(SRC) && /enabled: \{ \.\.\. \}|sessionsCfg\[s\.key\]\?\.enabled === false/.test(SRC));
ok("source: Fair Baseline block reads payload.baseline_comparison", /runSnapshot\.payload\.baseline_comparison/.test(SRC));
ok("source: importStats derived from imported bundle counts", /orderBlocks: Array\.isArray\(b\.orderBlocks\)/.test(SRC) && /variants: variantCount/.test(SRC) && /fairBaselineImported/.test(SRC));
ok("source: metric chips render 'not reported' when null (no faking)", /not reported/.test(SRC) && /data-testid="run-complete-summary"/.test(SRC));
ok("source: empty-run message on 0 OBs/trades", /data-testid="run-empty"/.test(SRC) && /produced no \{statsForEmpty\.orderBlocks === 0 \? "order blocks" : "trades"\}/.test(SRC));
ok("source: new submit clears prior summary (snapshot/stats reset)", /setImportStats\(null\); setImportTooLarge\(false\); setCompletionStats\(null\); importTriggeredRef\.current = false;/.test(SRC));

console.log("\n[U] UX polish: grouped variants, counts, hash, override-split, copy-config");
{
    const mod = loadV2Exports();
    // computeVariantGroups — arms grouped UNDER threshold
    const g = mod.computeVariantGroups({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [25, 10], triggeredEdgeDelays: [20, 10, 30] });
    ok("computeVariantGroups TE: sorted thresholds, arms grouped under each", g.kind === "triggered_edge" && g.groups.length === 2 && g.groups[0].threshold === 10 && J(g.groups[0].arms) === J([10, 20, 30]));
    const gp = mod.computeVariantGroups({ selectedEntryModel: "entry_penetration", entryPenetrationThresholds: "50,10" });
    ok("computeVariantGroups penetration: sorted, baseline flag", gp.kind === "entry_penetration" && gp.baseline === true && J(gp.groups.map((x) => x.threshold)) === J([10, 50]));
    // countEntryVariants — baseline + entry
    ok("countEntryVariants TE = 1 + thresholds×arms", mod.countEntryVariants({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [10, 25], triggeredEdgeDelays: [10, 20, 30] }) === 1 + 6);
    ok("countEntryVariants baseline = 1", mod.countEntryVariants({ selectedEntryModel: "baseline" }) === 1);
    // expectedVariants — entry + session, flags
    const ev = mod.expectedVariants({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [10, 25, 50], triggeredEdgeDelays: [10, 20, 30] }, se.DEFAULT_SESSION_STRATEGY);
    ok("expectedVariants entryCount = thr×arms (9)", ev.entryCount === 9 && ev.total === 9 + ev.sessionCount);
    // payloadHash — deterministic + key-order independent
    const h1 = mod.payloadHash({ a: 1, b: [2, 3], c: { x: 1, y: 2 } });
    const h2 = mod.payloadHash({ c: { y: 2, x: 1 }, b: [2, 3], a: 1 });
    ok("payloadHash is 6-hex uppercase + key-order independent", /^[0-9A-F]{6}$/.test(h1) && h1 === h2);
    ok("payloadHash changes when payload changes", mod.payloadHash({ a: 1 }) !== mod.payloadHash({ a: 2 }));
    // cohortOverrideInherited — explicit dims vs inherited
    const split = mod.cohortOverrideInherited({ enabled: true, target: { value: 3 }, be: { trigger: "wick", armR: 2 } });
    ok("cohortOverrideInherited: set dims → overrides, rest → inherited", J(split.overrides) === J(["Target RR", "Break-even"]) && J(split.inherited) === J(["Reduce Risk", "Risk Amount"]));
    const allInh = mod.cohortOverrideInherited({ enabled: true });
    ok("cohortOverrideInherited: nothing set → all inherited", allInh.overrides.length === 0 && allInh.inherited.length === 4);
    // copyRunConfigText — readable, sectioned, includes hash + grouped variants
    const txt = mod.copyRunConfigText({ cfg: { selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [10], triggeredEdgeDelays: [10, 20], direction: "Both", rr: 2, beEnabled: true, beTriggerBases: ["wick"], beArmLevels: [1], stopBuffer: 1, newsBlackout: true, newsBlackoutBefore: 5, newsBlackoutAfter: 5, spread: 0.2, slippage: 0.2, commission: 0 }, sessionStrategy: se.DEFAULT_SESSION_STRATEGY, runName: "MY_RUN", payload: { baseline_comparison: { target: { rr: 2 }, be: null } } });
    ok("copyRunConfigText has sections + hash + grouped TE line", /GLOBAL STRATEGY/.test(txt) && /FAIR BASELINE/.test(txt) && /SESSION STRATEGY/.test(txt) && /config [0-9A-F]{6}/.test(txt) && /TE 10% → C10, C20/.test(txt));
}

console.log("\n[V] UX polish: source wiring (Add popover, expected variants, generated, copy)");
ok("ThresholdChips replaces multi-Chips for TE + penetration thresholds", /<ThresholdChips testId="te-thresholds"/.test(SRC) && /<ThresholdChips testId="pen-thresholds"/.test(SRC));
ok("ThresholdChips has '+ Add…' custom popover with integer [min,max] validation", /\+ Add…/.test(SRC) && /Number\.isInteger\(n\) && n >= min && n <= max/.test(SRC));
ok("Arm Candles use ThresholdChips with custom delays (prefix C, min 0)", /<ThresholdChips testId="te-arms"[^]*?min=\{0\}[^]*?prefix="C"/.test(SRC) && /onChange=\{\(arr\) => set\("triggeredEdgeDelays"\)\(arr\)\}/.test(SRC));
ok("thresholds keep 1..99 bounds (reject 0/100)", /min=\{1\} max=\{99\} unit="%"/.test(SRC));
ok("does NOT render 21 preset chips (presets stay the small fixed set)", /TE_THRESHOLDS = \[10, 25, 50, 75\]/.test(SRC) && /PEN_THRESHOLDS = \[10, 25, 50, 75\]/.test(SRC));
ok("grouped VariantGroupView used in Entry preview + What-was-run", (SRC.match(/<VariantGroupView /g) || []).length >= 2);
ok("Expected variants breakdown present", /data-testid="expected-variants"/.test(SRC) && /Estimated total variants/.test(SRC) && /This run will generate/.test(SRC));
ok("Run Complete shows Configuration hash + Generated N/N", /\["Configuration", runSnapshot\?\.payload \? payloadHash\(runSnapshot\.payload\)/.test(SRC) && /\$\{importStats\.variants\}\$\{runSnapshot \? ` \/ \$\{countEntryVariants\(runSnapshot\.cfg\)\}`/.test(SRC));
ok("What-was-run shows Overrides vs Inherited per cohort", /Overrides:<\/span> <span[^>]*>\{c\.overrides/.test(SRC) && /Inherited:<\/span> <span[^>]*>\{c\.inherited/.test(SRC));
ok("Copy Run Configuration button writes copyRunConfigText", /data-testid="copy-run-config"/.test(SRC) && /writeText\(copyRunConfigText\(runSnapshot\)\)/.test(SRC));
ok("completed summary stays compact (max-h cap on What-was-run body)", /max-h-\[280px\] overflow-auto/.test(SRC));

console.log("\n[W2] custom arm delays + thresholds run properly (payload passthrough)");
{
    const c = payload({ ...BASE, selectedEntryModel: "triggered_edge", entryMode: "single", singleTriggeredEdgeThresholds: [33], triggeredEdgeDelays: [7, 15, 100] });
    ok("custom arm delays flow to payload triggered_edge_candle_delays (sorted)", J(c.triggered_edge_candle_delays) === J([7, 15, 100]));
    ok("custom delay C0 is preserved (0 is valid)", J(payload({ ...BASE, selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [33], triggeredEdgeDelays: [0, 7] }).triggered_edge_candle_delays) === J([0, 7]));
    ok("custom threshold flows to payload triggered_edge_trigger_thresholds", J(c.triggered_edge_trigger_thresholds) === J([33]));
    // grouped view + counts handle arbitrary custom arms
    const mod = loadV2Exports();
    const g = mod.computeVariantGroups({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [33], triggeredEdgeDelays: [7, 100, 15] });
    ok("computeVariantGroups groups custom arms under threshold (sorted)", J(g.groups[0].arms) === J([7, 15, 100]));
    ok("countEntryVariants counts custom arms", mod.countEntryVariants({ selectedEntryModel: "triggered_edge", singleTriggeredEdgeThresholds: [33, 66], triggeredEdgeDelays: [7, 15, 100] }) === 1 + 6);
}

console.log("\n[X] last-run persistence + safe import + folder fallback (no lazy result import)");
{
    const mod = loadV2Exports();
    // slimJob keeps only persistable identity/status (no stdout/progress payloads).
    const slim = mod.slimJob ? mod.slimJob({ job_id: "J1", run_id: "R1", status: "completed", output_folder: "/o", started_at: "t0", finished_at: "t1", display_name: "n", name: "n", startedAt: "s", stdout_tail: "X".repeat(9999), progress: { huge: true } }) : null;
    ok("slimJob drops stdout/progress, keeps identity+status", slim && slim.job_id === "J1" && slim.status === "completed" && slim.output_folder === "/o" && !("stdout_tail" in slim) && !("progress" in slim));
    ok("slimJob returns null without a job_id", mod.slimJob && mod.slimJob({ status: "completed" }) === null);
    ok("413 maps to a folder-import (not 'go elsewhere') message", /too large for browser one-click import/i.test(mod.formatSidecarError({ status: 413 })) && /folder/i.test(mod.formatSidecarError({ status: 413 })));
}

console.log("\n[Y] source: persistence + import wiring");
ok("persists lastRun (slim job + snapshot + import status) to the V2 key", /lastRun: lr/.test(SRC) && /job: slimJob\(runJob\), snapshot: runSnapshot, importedRunId, importError, importTooLarge, importStats/.test(SRC));
ok("seeds run state from persisted lastRun on load", /lastRun = persisted\?\.lastRun \|\| null/.test(SRC) && /useState\(\(\) => lastRun\?\.job \|\| null\)/.test(SRC) && /useState\(\(\) => lastRun\?\.importedRunId \|\| ""\)/.test(SRC));
ok("restored already-imported run does NOT re-import (importTriggeredRef seeded)", /useRef\(!!lastRun\?\.importedRunId\)/.test(SRC));
ok("poll resumes for a restored non-terminal run (runInProgress gate unchanged)", /const runInProgress = !!runJob\?\.job_id && !isTerminalStatus\(runJob\?\.status\)/.test(SRC));
ok("auto-import is EAGER result import via getSidecarRunBundle + ingestRunBundle", /fetchAndIngest\(job, getSidecarRunBundle\)/.test(SRC) && /ingestRunBundle\(files\)/.test(SRC));
ok("NO lazy run-result import introduced (no reloadLazyRunFromManifest / registerLazyRunFiles)", !/reloadLazyRunFromManifest|registerLazyRunFiles|lazy: true/.test(SRC));
ok("413 sets importTooLarge → size fallback path", /if \(e\?\.status === 413\) setImportTooLarge\(true\)/.test(SRC));
ok("folder import uses the SHARED parser (ingestRunBundle), no duplicate parsing", /const importFromFiles = useCallback\(async \(fileList\)/.test(SRC) && /ingestRunBundle\(fileList\)/.test(SRC));
ok("folder picker is webkitdirectory (reads disk, bypasses HTTP cap)", /webkitdirectory="" directory=""[^]*data-testid="v2-folder-input"/.test(SRC));
ok("too-large panel: direct sidecar import + finder + manual folder + copy path", /data-testid="import-too-large"/.test(SRC) && /Import Directly from Sidecar/.test(SRC) && /Show in Finder/.test(SRC) && /Choose Folder Manually/.test(SRC) && /Copy Output Path/.test(SRC));
ok("imported run shows Open Run Workspace", /Open Run Workspace/.test(SRC));
ok("Reset All keeps last run (no clearPersistedV2, no run-state wipe)", /Builder reset — last run kept/.test(SRC) && !/clearPersistedV2\(\); setCfg/.test(SRC));
ok("Clear current run action removes the panel + persisted lastRun", /data-testid="clear-current-run"/.test(SRC) && /const clearCurrentRun = \(\)/.test(SRC));
ok("old session-profile system stays isolated", !/getSessionProfiles\s*\(|applySessionProfiles\s*\(|setSessionProfiles\s*\(/.test(SRC) && !/fxob_session_profiles_v1/.test(SRC.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));

console.log("\n[Z] progress = completed passes (parallel-correct) + cancel + direct import + finder");
{
    const mod = loadV2Exports();
    // deriveProgress must use completed_passes, NOT current_index (which is pinned in parallel).
    const p = mod.deriveProgress({ progress: { total_passes: 25, completed_passes: 10, current_index: 1, running: 3, queued: 12, workers: [{}, {}, {}], elapsed_seconds: 120, eta_seconds: 60, stage_label: "Running simulations" } });
    ok("deriveProgress %: completed_passes/total (10/25=40%), NOT current_index", p && p.idx === 10 && p.total === 25 && p.pct === 40);
    ok("deriveProgress surfaces worker status + elapsed + eta", p.running === 3 && p.queued === 12 && p.workers.length === 3 && p.elapsed === "2m 0s" && p.eta === "1m 0s");
    ok("deriveProgress falls back to current_index only when completed_passes absent", (() => { const q = mod.deriveProgress({ total_passes: 25, current_index: 5 }); return q && q.idx === 5 && q.pct === 20; })());
    ok("formatSeconds: 125 → '2m 5s', 30 → '30s'", mod.formatSeconds(125) === "2m 5s" && mod.formatSeconds(30) === "30s");
}
ok("source: Cancel Run wired to cancelSidecarRun + stops at terminal", /const cancelRun = useCallback\(async/.test(SRC) && /cancelSidecarRun\(runJob\.job_id\)/.test(SRC) && /icon=\{Ban\} onClick=\{cancelRun\}/.test(SRC));
ok("source: large run AUTO-imports directly from sidecar on 413 (result-bundle)", /if \(e\?\.status === 413\)/.test(SRC) && /fetchAndIngest\(job, getResultBundleByRunId\)/.test(SRC));
ok("source: 'Import Directly from Sidecar' uses result-bundle (eager, complete)", /Import Directly from Sidecar/.test(SRC) && /importDirectFromSidecar/.test(SRC) && /getResultBundleByRunId/.test(SRC));
ok("source: Show in Finder calls reveal endpoint, falls back to Copy Path", /const revealFolder = useCallback/.test(SRC) && /revealSidecarRun\(runJob\.job_id\)/.test(SRC) && /Show in Finder/.test(SRC) && /writeText\(runJob\.output_folder/.test(SRC));
ok("source: pre-import completion stats fetched from summary.json (no full import needed)", /getRunFileByRunId\(runJob\.job_id, "summary\.json"\)/.test(SRC) && /setCompletionStats/.test(SRC));
ok("source: completion chips fall back to pre-import completionStats", /completionStats\?\.trades != null \? completionStats\.trades/.test(SRC));
ok("source: STILL no lazy run-result import (eager only)", !/reloadLazyRunFromManifest|registerLazyRunFiles|lazy: true/.test(SRC));
ok("source: result-bundle/reveal imported from sidecarClient (not duplicated)", /getResultBundleByRunId, revealSidecarRun, cancelSidecarRun, getRunFileByRunId/.test(SRC));
ok("source: payload path unchanged (buildBacktesterConfig + attachSessionStrategy)", /buildBacktesterConfig\(cfg\)/.test(SRC) && /attachSessionStrategy\(stripped, sessionStrategy\)/.test(SRC));

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
