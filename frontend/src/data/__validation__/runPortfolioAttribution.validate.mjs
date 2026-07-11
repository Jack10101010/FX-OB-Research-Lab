// runPortfolioAttribution.validate.mjs — RUN-SPECIFIC Portfolio Manager attribution.
//
// Proves buildRunPortfolioAttribution answers "what did PM do in THIS run?" honestly:
//   • PM OFF run → enabled:false, NO fabricated blocked counts;
//   • PM ON run → kept/blocked counts come from the actual run rows;
//   • PM-blocked rows are NEVER merged into missed/unfilled;
//   • a PM NEVER-TRADE (DISABLE) cohort is never labelled "enabled"/"active";
//   • zero-trade enabled cohorts read no-setups / no-fills;
//   • kept Net R / WR / PF / Max DD are computed from kept rows;
//   • would-have-been / net-effect are reported UNAVAILABLE when the backend emits none
//     (and computed when a would-have-been R IS present);
//   • the panel roll-up agrees with the cohort table.
//
// Run from frontend/:  node src/data/__validation__/runPortfolioAttribution.validate.mjs

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

const { buildRunPortfolioAttribution } = loadCjs("src/data/runPortfolioAttribution.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const findCohort = (a, session, cell) => a.cohorts.find((c) => c.session === session && c.cell === cell);

// ── fixtures (importer row shape) ──────────────────────────────────────────────
const execRow = (session, structure, direction, r, regime = null, t = "2025-03-01T08:00:00") => ({
    fillSession: session, structure, direction,
    outcome: r > 0 ? "Win" : r < 0 ? "Loss" : "BE", outcomeRaw: r > 0 ? "WIN" : r < 0 ? "LOSS" : "BE_EXIT",
    netR: r, net_r: r, pnl_r: r, rr_multiple: 2, fillTime: t, entry: t, entryPrice: 1.1, stop: 1.099, tp: 1.102,
    ...(regime ? { portfolio_policy_regime: regime } : {}),
});
const blockRow = (session, structure, direction, regime, reason, extra = {}) => ({
    fillSession: session, structure, direction,
    outcome: "REGIME_BLOCKED", outcomeRaw: "REGIME_BLOCKED",
    regime_block_reason: reason, portfolio_policy_regime: regime, portfolio_status: "BLOCKED",
    net_r: 0, netR: 0, planned_entry_price: 1.1, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2, ...extra,
});
const missRow = (session, structure, direction) => ({
    fillSession: session, structure, direction,
    outcome: "UNFILLED", outcomeRaw: "UNFILLED", missed_reason: "no_fill_in_window",
    net_r: 0, netR: 0, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2,
});

const PM_ON = { portfolio_policy_enabled: true, portfolio_policy_mode: "enforce", portfolio_policy_version: "2026-07-07.te-v1.1", symbol: "EURUSD" };

console.log("[1] PM OFF → enabled:false, no fabricated counts");
{
    const a = buildRunPortfolioAttribution([execRow("London", "BOS", "Long", 2)], { portfolio_policy_enabled: false, symbol: "EURUSD" });
    ok(a.enabled === false, "enabled = false");
    ok(a.summary === null && a.cohorts.length === 0, "no summary / no cohort rows when PM off");
}

console.log("\n[2] PM ON → kept/blocked counts from actual rows");
{
    const trades = [
        execRow("London", "BOS", "Long", 2, "STATE_ONLY"),
        execRow("London", "BOS", "Long", -1, "STATE_ONLY"),
        execRow("London", "BOS", "Long", 3, "STATE_ONLY"),
        blockRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed"),
        blockRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed"),
        missRow("London", "BOS", "Long"), missRow("London", "BOS", "Long"),
    ];
    const a = buildRunPortfolioAttribution(trades, PM_ON);
    ok(a.enabled === true && a.version === "2026-07-07.te-v1.1", "enabled + version echoed");
    ok(a.summary.keptCount === 3, `keptCount = 3 (got ${a.summary.keptCount})`);
    ok(a.summary.blockedCount === 2, `blockedCount = 2 (got ${a.summary.blockedCount})`);
    ok(a.summary.netRKept === 4, `kept Net R = 4 (got ${a.summary.netRKept})`);
    ok(a.summary.keptWins === 2 && a.summary.keptLosses === 1, `kept W/L = 2/1 (got ${a.summary.keptWins}/${a.summary.keptLosses})`);
    ok(a.summary.winRateKept === 66.7, `WR = 66.7 (got ${a.summary.winRateKept})`);
    ok(a.summary.pfKept === 5, `PF = (2+3)/1 = 5 (got ${a.summary.pfKept})`);
    ok(a.summary.maxDrawdownRKept === -1, `Max DD = -1 (got ${a.summary.maxDrawdownRKept})`);
    ok(a.summary.blockReasonCounts.state_not_allowed === 2, "2 blocked for state_not_allowed");
    const c = findCohort(a, "london", "bos_long");
    ok(c.keptCount === 3 && c.blockedCount === 2 && c.missedCount === 2, "cohort table matches (kept/blocked/missed)");
    ok(c.blockedCount === 2 && c.missedCount === 2, "PM-blocked NOT merged into missed");
}

console.log("\n[3] would-have-been / net-effect UNAVAILABLE when backend emits none");
{
    const a = buildRunPortfolioAttribution([execRow("London", "BOS", "Long", 2, "STATE_ONLY"), blockRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed")], PM_ON);
    ok(a.summary.blockedWouldBeAvailable === false, "blockedWouldBeAvailable = false (honest)");
    ok(a.summary.blockedWouldBeNetR === null, "blocked-book Net R = null (not fabricated)");
    ok(a.summary.netEffectAvailable === false && a.summary.controlNetR === null, "net effect vs control unavailable");
}

console.log("\n[4] would-have-been R computed WHEN present");
{
    const a = buildRunPortfolioAttribution([
        execRow("London", "BOS", "Long", 2, "STATE_ONLY"),
        blockRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed", { would_have_been_r: -1 }),
        blockRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed", { would_have_been_r: 2 }),
    ], PM_ON);
    ok(a.summary.blockedWouldBeAvailable === true, "flag flips true when a would-have-been R is present");
    ok(a.summary.blockedWouldBeNetR === 1, `blocked would-be Net R = -1+2 = 1 (got ${a.summary.blockedWouldBeNetR})`);
    ok(a.summary.controlNetR === 3, `control (kept+blocked) = 2+1 = 3 (got ${a.summary.controlNetR})`);
    const c = findCohort(a, "london", "bos_long");
    ok(c.blockedWouldBeNetR === 1, "per-cohort would-be Net R attributed");
}

console.log("\n[5] NEVER TRADE cohort (via policy fallback) is never 'active'/'enabled'");
{
    const a = buildRunPortfolioAttribution([], PM_ON, { policyByKey: new Map([["EURUSD|ny_pm|choch_short", { policy: "DISABLE" }]]) });
    const c = findCohort(a, "ny_pm", "choch_short");
    ok(c.pmActionLabel === "NEVER TRADE", `pmActionLabel = NEVER TRADE (got ${c.pmActionLabel})`);
    ok(c.state === "pm_disabled" && c.statusLabel === "Disabled by Portfolio Manager", `state = pm_disabled (got ${c.state})`);
    ok(c.state !== "active" && c.statusLabel !== "Enabled", "never active/enabled");
    ok(a.summary.cohortsPmDisabled >= 1, "roll-up counts a PM-disabled cohort");
}

console.log("\n[6] zero-trade enabled cohorts → no setups / no fills");
{
    const a = buildRunPortfolioAttribution([missRow("Asia", "CHoCH", "Short")], PM_ON, { policyByKey: new Map([
        ["EURUSD|asia|bos_long", { policy: "LABEL" }], ["EURUSD|asia|choch_short", { policy: "LABEL" }],
    ]) });
    ok(findCohort(a, "asia", "bos_long").state === "enabled_no_setups", "empty cohort → no setups");
    ok(findCohort(a, "asia", "choch_short").state === "enabled_no_fills", "unfilled-only cohort → no fills");
    ok(a.summary.cohortsNoSetup >= 1 && a.summary.cohortsNoFill >= 1, "roll-up counts no-setup + no-fill");
}

console.log("\n[7] roll-up agrees with cohort table (kept/blocked totals)");
{
    const trades = [
        execRow("London", "BOS", "Long", 1, "STATE_ONLY"),
        execRow("NewYork", "CHoCH", "Short", -1, "DIRECTION_AWARE"),
        blockRow("Lull", "BOS", "Short", "DISABLE", "portfolio_disabled"),
    ];
    const a = buildRunPortfolioAttribution(trades, PM_ON);
    const keptSum = a.cohorts.reduce((n, c) => n + c.keptCount, 0);
    const blkSum = a.cohorts.reduce((n, c) => n + c.blockedCount, 0);
    ok(keptSum === a.summary.keptCount, `Σ cohort kept === summary.keptCount (${keptSum})`);
    ok(blkSum === a.summary.blockedCount, `Σ cohort blocked === summary.blockedCount (${blkSum})`);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
