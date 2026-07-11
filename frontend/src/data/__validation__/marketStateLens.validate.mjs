// marketStateLens.validate.mjs — Market-State lens (Phase 1).
//
// Proves:
//   [1] buckets PARTITION the input (Σ bucket sizes === rows.length; every key present)
//   [2] engine-preferred resolution + provenance counts; unknown state → Unlabelled
//   [3] client-panel fallback resolves legacy rows; no panel ⇒ Unlabelled
//   [4] "Whole Cohort" contract: the lens NEVER touches the original array — state
//       analysis of the whole set is byte-identical to calling the existing helpers
//       directly (cohortTargetEconomics equality, same object)
//   [5] per-state target economics === economics of the manually-filtered subset
//       (proves the UI reuses the existing engine rather than re-deriving anything)
//   [6] stateCellStatus glyph gates mirror the too_small (<8 decided) rule
//   [7] statePopulationScope flags enforce/filter runs, passes label-mode runs
//   [8] input rows are never mutated
//
// Run from frontend/:  node src/data/__validation__/marketStateLens.validate.mjs

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

const {
    STATE_LENS_KEYS, STATE_LENS_STATES, UNLABELLED_KEY, MIN_DECIDED_FOR_READ,
    groupRowsByMarketState, decidedWithMfeCount, stateCellStatus, stateSourceSummary,
    statePopulationScope, rowStateKey,
} = loadCjs("src/data/marketStateLens.js");
const { cohortTargetEconomics, TARGET_SUITABILITY_LEVELS } = loadCjs("src/data/sessionResults.js");
const { daily_regime_panel, MARKET_STATES } = loadCjs("src/data/marketState.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// ── fixtures ─────────────────────────────────────────────────────────────────
// Engine-instrumented executed rows (importer stamps `regimeEmit`).
const eng = (state, outcome, r, mfe) => ({
    fillSession: "London", structure: "BOS", direction: "Long",
    outcome, outcomeRaw: outcome, netR: r, net_r: r, pnl_r: r, mfe_r: mfe, mfeR: mfe,
    entry: "2025-03-10T09:30:00", fillTime: "2025-03-10T09:30:00",
    regimeEmit: state ? { marketState: state, source: "engine", version: "regime-1.0.0" } : null,
});

const rows = [
    eng("Bull/Expand", "WIN", 2, 2.4), eng("Bull/Expand", "WIN", 2, 3.1), eng("Bull/Expand", "LOSS", -1, 0.4),
    eng("Bull/Compress", "WIN", 1, 1.2),
    eng("Bear/Compress", "LOSS", -1, 0.2), eng("Bear/Compress", "LOSS", -1, 0.7),
    eng("Bear/Chop", "WIN", 2, 2.2),
    eng(null, "WIN", 2, 2.0),                       // no engine state, no panel → Unlabelled
    eng("Weird/State", "LOSS", -1, 0.1),            // non-canonical → Unlabelled
];
const snapshotBefore = JSON.stringify(rows);

// ── [1] partition ─────────────────────────────────────────────────────────────
console.log("\n[1] buckets partition the input");
const lens = groupRowsByMarketState(rows, null);
ok(STATE_LENS_KEYS.length === 7 && STATE_LENS_KEYS[6] === UNLABELLED_KEY, "7 lens keys (6 states + Unlabelled)");
ok(STATE_LENS_STATES.join(",") === MARKET_STATES.join(","), "state order matches canonical MARKET_STATES");
ok([...lens.byState.keys()].join(",") === STATE_LENS_KEYS.join(","), "every key present in byState (even empty)");
const sum = [...lens.byState.values()].reduce((n, b) => n + b.length, 0);
ok(sum === rows.length && lens.total === rows.length, `Σ buckets (${sum}) === rows (${rows.length})`);

// ── [2] engine-preferred + provenance ────────────────────────────────────────
console.log("\n[2] engine resolution + provenance");
ok(lens.byState.get("Bull/Expand").length === 3, "Bull/Expand bucket 3");
ok(lens.byState.get("Bear/Compress").length === 2, "Bear/Compress bucket 2");
ok(lens.byState.get("Bull/Chop").length === 0, "Bull/Chop empty");
ok(lens.byState.get(UNLABELLED_KEY).length === 2, "Unlabelled catches null + non-canonical");
ok(lens.sources.engine === 7 && lens.sources.unlabelled === 2 && lens.sources.client === 0, "sources engine=7 unlabelled=2 client=0");
ok(stateSourceSummary(lens.sources).key === "engine", "summary: engine");
ok(rowStateKey(rows[8], null).key === UNLABELLED_KEY, "non-canonical state string → Unlabelled");

// ── [3] client-panel fallback ────────────────────────────────────────────────
console.log("\n[3] client fallback via daily panel");
// Long synthetic daily history so EMA/BBW/ADX warm up (same trick as marketState tests):
const candles = [];
const start = Date.UTC(2023, 0, 1);
for (let i = 0; i < 400; i++) {
    const t = new Date(start + i * 86400000).toISOString();
    const drift = i * 0.0004, wave = 0.003 * Math.sin(i / 9);
    const o = 1.05 + drift + wave, c = o + 0.0018;
    candles.push({ time: t, open: o, high: c + 0.0012, low: o - 0.0012, close: c });
}
const panel = daily_regime_panel(candles, {}, "EURUSD");
const legacyDay = new Date(start + 380 * 86400000).toISOString().slice(0, 10);
const legacyRow = { ...eng(null, "WIN", 2, 2.0), entry: `${legacyDay}T09:30:00`, fillTime: `${legacyDay}T09:30:00` };
const kWith = rowStateKey(legacyRow, panel);
const kWithout = rowStateKey(legacyRow, null);
ok(kWithout.key === UNLABELLED_KEY && kWithout.source === null, "no panel ⇒ Unlabelled");
ok(kWith.key !== UNLABELLED_KEY && kWith.source === "client", `panel resolves legacy row (→ ${kWith.key}, source client)`);
const mixed = groupRowsByMarketState([rows[0], legacyRow], panel);
ok(mixed.sources.engine === 1 && mixed.sources.client === 1, "mixed provenance counted");
ok(stateSourceSummary(mixed.sources).key === "mixed", "summary: mixed");

// ── [4] Whole-Cohort contract (no interference with existing analysis) ───────
console.log("\n[4] whole-cohort behaviour unchanged");
const econDirect = cohortTargetEconomics(rows, "1R");
groupRowsByMarketState(rows, null); // lens pass in between
const econAfter = cohortTargetEconomics(rows, "1R");
ok(JSON.stringify(econDirect) === JSON.stringify(econAfter), "cohortTargetEconomics identical before/after lens pass");
ok(econDirect.levels.length === TARGET_SUITABILITY_LEVELS.length, `ladder unchanged (${TARGET_SUITABILITY_LEVELS.length} levels, 0.5→5.0)`);
ok(TARGET_SUITABILITY_LEVELS[0] === 0.5 && TARGET_SUITABILITY_LEVELS.includes(0.6) && TARGET_SUITABILITY_LEVELS.includes(1.25) && TARGET_SUITABILITY_LEVELS[TARGET_SUITABILITY_LEVELS.length - 1] === 5.0, "canonical ladder keeps finer sub-1R steps");

// ── [5] per-state economics === existing engine on the filtered subset ───────
console.log("\n[5] state economics = existing engine on subset");
const be = lens.byState.get("Bull/Expand");
const econState = cohortTargetEconomics(be, "1R");
const econManual = cohortTargetEconomics(rows.filter((t) => t.regimeEmit && t.regimeEmit.marketState === "Bull/Expand"), "1R");
ok(JSON.stringify(econState) === JSON.stringify(econManual), "bucket economics identical to manual filter");
ok(econState.decided === 3 && econState.recommendation.kind === "too_small", "state n=3 ⇒ too_small gate fires (same rule as whole cohort)");
ok(decidedWithMfeCount(be) === 3, "decidedWithMfeCount matches economics decided");

// ── [6] glyph gates mirror too_small ─────────────────────────────────────────
console.log("\n[6] stateCellStatus gates");
ok(MIN_DECIDED_FOR_READ === 8, "MIN_DECIDED_FOR_READ mirrors economics too_small (<8)");
ok(stateCellStatus(undefined).kind === "none" && stateCellStatus(undefined).glyph === "—", "missing counts → none —");
ok(stateCellStatus({ executed: 0, decided: 0 }).kind === "none", "0 executed → none");
ok(stateCellStatus({ executed: 5, decided: 4 }).kind === "insufficient" && stateCellStatus({ executed: 5, decided: 4 }).glyph === "•", "decided<8 → insufficient •");
ok(stateCellStatus({ executed: 12, decided: 9 }).kind === "evidence" && stateCellStatus({ executed: 12, decided: 9 }).glyph === "9", "decided≥8 → evidence (decided count)");
ok(["none", "insufficient", "evidence"].every((k) => stateCellStatus({ executed: k === "none" ? 0 : 9, decided: k === "evidence" ? 9 : 0 }).recommendation === "not_researched"), "recommendation ALWAYS not_researched (no policy doc)");

// ── [7] population scope ─────────────────────────────────────────────────────
console.log("\n[7] statePopulationScope");
ok(statePopulationScope({ portfolio_policy_enabled: true, portfolio_policy_mode: "enforce" }).filtered === true, "PM enforce ⇒ filtered");
ok(statePopulationScope({ portfolio_policy_enabled: true, portfolio_policy_mode: "label" }).filtered === false, "PM label ⇒ complete");
ok(statePopulationScope({ regime_gate_enabled: true, regime_gate_mode: "filter" }).filtered === true, "regime filter ⇒ filtered");
ok(statePopulationScope({ regime_gate_enabled: true, regime_gate_mode: "label" }).filtered === false, "regime label ⇒ complete");
ok(statePopulationScope({}, { portfolioBlockedTotal: 3 }).filtered === true, "observed REGIME_BLOCKED rows ⇒ filtered (belt & braces)");
ok(statePopulationScope({}).filtered === false, "plain run ⇒ complete");
ok(statePopulationScope({ portfolio_policy_enabled: "true", portfolio_policy_mode: "enforce" }).filtered === true, "string 'true' coercion");
// Omitted-mode fields: the "label" fallback mirrors the Lux BacktestConfig defaults
// (each mode field shipped in the SAME commit as its enable flag and config.json is a
// full asdict() dump, so enabled=true with a missing mode only arises on hand-edited
// configs — which the backend itself runs as "label").
ok(statePopulationScope({ portfolio_policy_enabled: true }).filtered === false, "PM enabled + mode OMITTED ⇒ label (backend default) ⇒ complete");
ok(statePopulationScope({ regime_gate_enabled: true }).filtered === false, "gate enabled + mode OMITTED ⇒ label (backend default) ⇒ complete");
ok(statePopulationScope({ symbol: "EURUSD", rr_multiple: 3.3 }).filtered === false, "pre-feature run (neither flag) ⇒ complete");
ok(statePopulationScope({ portfolio_policy_enabled: true }, { portfolioBlockedTotal: 2 }).filtered === true, "omitted mode BUT observed REGIME_BLOCKED rows ⇒ filtered (evidence beats config)");
ok(statePopulationScope({ portfolio_policy_enabled: false, portfolio_policy_mode: "enforce" }).filtered === false, "PM disabled ⇒ enforce mode string is inert");

// ── [8] no mutation ──────────────────────────────────────────────────────────
console.log("\n[8] input not mutated");
ok(JSON.stringify(rows) === snapshotBefore, "rows byte-identical after all passes");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
