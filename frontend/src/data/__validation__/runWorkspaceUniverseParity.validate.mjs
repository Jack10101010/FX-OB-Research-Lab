// runWorkspaceUniverseParity.validate.mjs — ONE canonical active trade universe
// for every Run Workspace results surface (headline / Session Results / Management /
// market-state lens). TRADE-UNIVERSE-DIVERGENCE-AUDIT-1 Phase 3.
//
//   A. headline and Session Results consume IDENTICAL rows (object identity — the
//      buckets buildSessionResults produces partition exactly universe.trades)
//   B. market-state buckets partition the executed rows of that same universe
//   C. PM-block + COHORT_DISABLED totals agree between raw universe rows,
//      buildSessionResults, and the lens/matrix inputs
//   D. switching TE threshold / delay resolves the matching file+rows dynamically
//   E. switching to penetration / baseline resolves its own file (no stale TE rows)
//   F. a missing requested scenario yields EMPTY trades + NO_TRADES_FOR_SCENARIO —
//      never a silent baseline substitution — and the UI renders an explicit
//      unavailable state naming the scenario + expected source file
//   G. lazy/sidecar runs hydrate through the same canonical resolver (wiring)
//   H. variant switching clears stale expansion/state selections (wiring)
//
// The REAL full-history run (when its folder is reachable) is used for A/B/C so the
// proof covers actual imported data, not just fixtures.
//
// Run from frontend/:  node src/data/__validation__/runWorkspaceUniverseParity.validate.mjs

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
        if (spec.startsWith("@/")) return loadCjs(path.resolve("src", spec.slice(2)));
        if (spec.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(resolved), spec), "utf8"));
        throw new Error("bare import: " + spec);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const { resolveTradeUniverse } = loadCjs("src/data/tradeUniverse.js");
const { buildSessionResults } = loadCjs("src/data/sessionResults.js");
const { groupRowsByMarketState, STATE_LENS_KEYS } = loadCjs("src/data/marketStateLens.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const V = "allow_multi_position";
const rows = (n, tag, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, r: 1, outcome: "WIN", ...extra }));

// ── D/E/F: dynamic variant resolution on a multi-variant bundle ────────────────
console.log("\n[D] TE threshold/delay switching resolves the matching file");
const multiBundle = {
    primaryVariant: V,
    tradesByVariant: { [V]: rows(5, "b", { entry_model_key: "baseline" }) },
    entryResults: {
        tradesByMode: {
            entry_baseline: rows(5, "b", { entry_model_key: "baseline" }),
            entry_triggered_edge_25p0_d3: rows(7, "t25d3", { entry_model_key: "entry_triggered_edge_25p0_d3" }),
            entry_triggered_edge_25p0_d4: rows(6, "t25d4", { entry_model_key: "entry_triggered_edge_25p0_d4" }),
            entry_triggered_edge_40p0_d3: rows(4, "t40d3", { entry_model_key: "entry_triggered_edge_40p0_d3" }),
            entry_penetration_25p0: rows(3, "p25", { entry_model_key: "entry_penetration_25p0" }),
        },
        sourceFiles: [
            `trades_${V}__entry_triggered_edge_25p0_d3.csv`,
            `trades_${V}__entry_triggered_edge_25p0_d4.csv`,
            `trades_${V}__entry_triggered_edge_40p0_d3.csv`,
            `trades_${V}__entry_penetration_25p0.csv`,
        ],
    },
};
const resolveFor = (scenario) => resolveTradeUniverse({ bundle: multiBundle, scenario: { positionVariant: V, ...scenario } });
{
    const d3 = resolveFor({ family: "triggered_edge", threshold: 25, fillMode: "d3" });
    const d4 = resolveFor({ family: "triggered_edge", threshold: 25, fillMode: "d4" });
    const t40 = resolveFor({ family: "triggered_edge", threshold: 40, fillMode: "d3" });
    ok(d3.sourceFile === `trades_${V}__entry_triggered_edge_25p0_d3.csv` && d3.trades.length === 7, "TE 25 d3 → its own file + 7 rows");
    ok(d4.sourceFile === `trades_${V}__entry_triggered_edge_25p0_d4.csv` && d4.trades.length === 6, "TE 25 d4 → different delay, different file + rows");
    ok(t40.sourceFile === `trades_${V}__entry_triggered_edge_40p0_d3.csv` && t40.trades.length === 4, "TE 40 d3 → different threshold, different file + rows");
    ok(d3.trades[0].id === "t25d30" && d4.trades[0].id === "t25d40", "rows are the variant's own (no cross-variant leakage)");
}

console.log("\n[E] penetration / baseline resolve their own files (no stale TE)");
{
    const pen = resolveFor({ family: "penetration", threshold: 25, fillMode: null });
    ok(pen.universeType === "scenario" && pen.trades.length === 3 && /entry_penetration_25p0\.csv$/.test(pen.sourceFile || ""),
       `penetration 25 → ${pen.sourceFile} (3 rows)`);
    const base = resolveFor({ family: "baseline" });
    ok(base.universeType === "baseline" && base.trades.length === 5 && base.sourceFile === `trades_${V}.csv`,
       "baseline → trades_<variant>.csv (5 rows, not the previous TE set)");
    ok(base.trades[0].id === "b0" && !base.trades.some((t) => String(t.id).startsWith("t25")), "no TE rows retained in baseline universe");
}

console.log("\n[F] missing scenario output ⇒ empty + warning, never baseline substitution");
{
    const missing = resolveFor({ family: "triggered_edge", threshold: 60, fillMode: "d5" });
    ok(missing.universeType === "scenario", "missing variant still resolves as a SCENARIO universe");
    ok(Array.isArray(missing.trades) && missing.trades.length === 0, "missing variant ⇒ ZERO rows (no silent baseline fallback)");
    ok((missing.warnings || []).some((w) => w.code === "NO_TRADES_FOR_SCENARIO"), "NO_TRADES_FOR_SCENARIO warning emitted");
    ok(!!missing.sourceFile && /entry_triggered_edge_60p0_d5\.csv$/.test(missing.sourceFile), `expected source reported (${missing.sourceFile})`);
}

// ── A/B/C on the REAL full-history run (skipped gracefully when unmounted) ──────
const RUN = "/sessions/sleepy-funny-babbage/mnt/Lux-OB-Backtester/outputs/runs/2167dbe8bf5f44e1a52c0ca63218f8bc_20260711_093354_EURUSD_15min_RR2.0_SB1";
const TE = "trades_allow_multi_position__entry_triggered_edge_25p0_d3.csv";
if (fs.existsSync(path.join(RUN, TE))) {
    const imp = loadCjs("src/data/importer.js");
    const pp = loadCjs("src/data/portfolioPolicy.js");
    const policyDoc = JSON.parse(fs.readFileSync("src/data/deployedPolicy.v1.json", "utf8"));
    const cfg = JSON.parse(fs.readFileSync(path.join(RUN, "config.json"), "utf8"));
    const teRows = imp.enrichBeTradeRowsLazy(fs.readFileSync(path.join(RUN, TE), "utf8"), { orderBlocks: [], config: cfg, summary: {} });
    const baseRows = imp.enrichBeTradeRowsLazy(fs.readFileSync(path.join(RUN, "trades_allow_multi_position.csv"), "utf8"), { orderBlocks: [], config: cfg, summary: {} });
    const bundle = {
        primaryVariant: V,
        tradesByVariant: { [V]: baseRows },
        entryResults: { tradesByMode: { entry_triggered_edge_25p0_d3: teRows }, sourceFiles: [TE] },
        config: cfg,
    };
    const u = resolveTradeUniverse({ bundle, scenario: { family: "triggered_edge", threshold: 25, fillMode: "d3", positionVariant: V } });

    console.log("\n[A] headline rows === Session Results rows (real run)");
    ok(u.sourceFile === TE && u.trades.length === teRows.length, `active universe resolves ${TE} (${u.trades.length} rows)`);
    const portfolioCtx = { enabled: true, instrument: cfg.symbol, version: null, policyByKey: pp.loadPolicy(policyDoc).byKey };
    const built = buildSessionResults(u.trades, cfg.session_strategy_scenario || null, portfolioCtx);
    const bucketRows = new Set();
    let executed = 0, disabled = 0, pmBlocked = 0;
    for (const s of built.sessions) for (const c of s.cohorts) {
        for (const t of c.executedTrades) bucketRows.add(t);
        for (const t of c.disabledOpportunities) bucketRows.add(t);
        for (const t of c.cancelledOrMissedOpportunities) bucketRows.add(t);
        for (const t of c.portfolioBlockedOpportunities) bucketRows.add(t);
        executed += c.executedCount; disabled += c.disabledCount; pmBlocked += c.portfolioBlockedCount;
    }
    for (const t of built.unassigned) bucketRows.add(t);
    ok(bucketRows.size === u.trades.length && u.trades.every((t) => bucketRows.has(t)),
       `Session Results buckets partition EXACTLY the universe rows (${bucketRows.size} — object identity)`);

    console.log("\n[C] PM-block + COHORT_DISABLED parity across surfaces (real run)");
    const rawBlocked = u.trades.filter((t) => String(t.outcomeRaw || t.outcome).toUpperCase() === "REGIME_BLOCKED").length;
    const rawDisabled = u.trades.filter((t) => String(t.outcomeRaw || t.outcome).toUpperCase() === "COHORT_DISABLED").length;
    ok(pmBlocked === rawBlocked && built.portfolioSummary.total === rawBlocked,
       `PM-block parity: raw ${rawBlocked} = cohorts ${pmBlocked} = portfolioSummary ${built.portfolioSummary.total}`);
    ok(disabled === rawDisabled, `cohort-disabled parity: raw ${rawDisabled} = cohorts ${disabled}`);

    console.log("\n[B] state buckets partition the SAME universe's executed rows (real run)");
    const ny = built.sessions.find((s) => s.key === "newYork").cohorts.find((c) => c.key === "bos_short");
    const lens = groupRowsByMarketState(ny.executedTrades, null);
    const sum = [...lens.byState.values()].reduce((n, b) => n + b.length, 0);
    ok(sum === ny.executedTrades.length, `NY BOS Short lens partition Σ=${sum} === executed ${ny.executedTrades.length}`);
    ok(STATE_LENS_KEYS.every((k) => lens.byState.has(k)), "all 6 states + Unlabelled buckets present");
} else {
    console.log("\n[A/B/C] real run folder not reachable — fixture-only pass (mount the Lux repo for the full proof)");
}

// ── G/H + wiring contracts (source patterns) ────────────────────────────────────
console.log("\n[G/H] wiring contracts");
const SR = fs.readFileSync("src/components/lab/sessionProfiles/SessionResults.jsx", "utf8");
const RD = fs.readFileSync("src/pages/RunDetail.jsx", "utf8");
const URV = fs.readFileSync("src/data/useRunVariant.js", "utf8");
ok(/const displayTrades = tradesForRun;/.test(RD) && /const tradesForRun = selectedUniverseTrades;/.test(RD),
   "headline analytics pinned to the canonical resolved universe (no legacy fallback)");
ok(/<SessionResults\s[\s\S]*?trades=\{displayTrades\}[\s\S]*?universe=\{universeProvenance\}[\s\S]*?universeStatus=\{universeStatus\}/.test(RD),
   "Session Results receives the SAME rows + universe provenance + status as the headline");
ok(!/resolveTradeUniverse|useRunVariant/.test(SR), "Session Results has NO separate variant-selection logic (consumes props / canonical store universe)");
ok(/getTradeUniverse\(\)\?\.trades/.test(SR), "standalone fallback goes through the canonical store getTradeUniverse (scenario-aware)");
ok(/useLazyEntryVariant\(runId, universe, runData\)/.test(URV), "lazy sidecar hydration wired through the same canonical resolver (G)");
ok(/data-testid="universe-provenance"/.test(SR) && /data-testid="universe-source-file"/.test(SR),
   "provenance line present (scenario label + resolved source file + counts)");
ok(/data-testid="universe-unavailable"/.test(SR) && /NOT substituted with the baseline file/.test(SR),
   "explicit unavailable/loading state names the scenario + expected source (F, UI)");
ok(/const universeKey = `\$\{bundle\?\.id \|\| "active"\}\|\$\{universe \? \(universe\.sourceKey/.test(SR)
   && /setExpanded\(\{\}\);\s*setDrillFocus\(null\);/.test(SR),
   "variant switch clears stale expansion + matrix focus (drilldown state dies with unmount) (H)");
ok(/provenance=\{provenanceLine\}/.test(SR) && /\{provenance\}/.test(SR.slice(SR.indexOf("state-lens-block") - 400, SR.indexOf("Suitability panels FIRST"))),
   "market-state lens block + matrix carry the provenance line");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
