// sessionResultsPortfolio.validate.mjs — Portfolio-Manager-aware Session Results status.
//
// Proves the Run Workspace → Session Results cohort status is PM-aware WITHOUT breaking
// the legacy Session-Scenario behaviour:
//   • a PM NEVER-TRADE (DISABLE) cohort shows "Disabled by Portfolio Manager", NOT enabled;
//   • PM-blocked "would-have-been" rows are counted SEPARATELY from unfilled/missed rows;
//   • a zero-trade enabled cohort reads "Enabled · no setups" / "Enabled · no fills",
//     never "disabled";
//   • Session-Scenario disabled stays DISTINCT from Portfolio-Manager disabled;
//   • PM OFF (no portfolioCtx) preserves the exact legacy status;
//   • the cohort action can be resolved from the run rows OR the deployed policy fallback
//     (so a NEVER-TRADE cohort that produced zero rows is still labelled correctly).
//
// Run from frontend/:  node src/data/__validation__/sessionResultsPortfolio.validate.mjs

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

const { buildSessionResults, deriveCohortDisplay } = loadCjs("src/data/sessionResults.js");
const { POLICY_LABELS } = loadCjs("src/data/portfolioLabels.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const cohortIn = (res, sKey, cKey) => res.sessions.find((s) => s.key === sKey).cohorts.find((c) => c.key === cKey);

// ── fixtures (importer row shape) ──────────────────────────────────────────────
const execRow = (session, structure, direction, r, regime = null) => ({
    fillSession: session, structure, direction,
    outcome: r >= 0 ? "Win" : "Loss", outcomeRaw: r >= 0 ? "WIN" : "LOSS",
    netR: r, net_r: r, pnl_r: r, rr_multiple: 2,
    entry: "2025-01-06T02:30:00", fillTime: "2025-01-06T02:30:00", entryPrice: 1.1, stop: 1.099, tp: 1.102,
    ...(regime ? { portfolio_policy_regime: regime } : {}),
});
// PM removed this candidate from the portfolio (enforce): REGIME_BLOCKED + block reason.
const pmBlockedRow = (session, structure, direction, regime, reason) => ({
    fillSession: session, structure, direction,
    outcome: "REGIME_BLOCKED", outcomeRaw: "REGIME_BLOCKED",
    regime_block_reason: reason, portfolio_policy_regime: regime, portfolio_status: "BLOCKED",
    net_r: 0, netR: 0, planned_entry_price: 1.1, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2,
});
// Ordinary unfilled/missed — NOT a PM block, NOT executed, NOT scenario-disabled.
const missedRow = (session, structure, direction) => ({
    fillSession: session, structure, direction,
    outcome: "UNFILLED", outcomeRaw: "UNFILLED", missed_reason: "no_fill_in_window",
    net_r: 0, netR: 0, planned_entry_price: 1.1, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2,
});
// Session-Scenario disable (distinct from PM).
const scenarioDisabledRow = (session, structure, direction) => ({
    fillSession: session, structure, direction,
    outcome: "COHORT_DISABLED", outcomeRaw: "COHORT_DISABLED", missed_reason: "cohort_disabled",
    net_r: 0, netR: 0, planned_entry_price: 1.1, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2,
});

const pmCtx = (extra = {}) => ({ enabled: true, instrument: "EURUSD", version: "2026-07-07.te-v1.1", policyByKey: null, ...extra });

console.log("[1] friendly labels are the canonical four");
ok(POLICY_LABELS.LABEL === "ALWAYS ALLOW" && POLICY_LABELS.STATE_ONLY === "BLOCK CHOP"
    && POLICY_LABELS.DIRECTION_AWARE === "FOLLOW TREND" && POLICY_LABELS.DISABLE === "NEVER TRADE",
    "ALWAYS ALLOW / BLOCK CHOP / FOLLOW TREND / NEVER TRADE");

console.log("\n[2] PM NEVER TRADE cohort → NOT enabled, shows 'Disabled by Portfolio Manager'");
{
    // London CHoCH Long: only PM-blocked rows carrying DISABLE regime, zero kept trades.
    const trades = [pmBlockedRow("London", "CHoCH", "Long", "DISABLE", "portfolio_disabled")];
    const res = buildSessionResults(trades, null, pmCtx());
    const c = cohortIn(res, "london", "choch_long");
    ok(c.pmAction === "DISABLE", `pmAction = DISABLE (got ${c.pmAction})`);
    ok(c.pmActionLabel === "NEVER TRADE", `pmActionLabel = NEVER TRADE (got ${c.pmActionLabel})`);
    ok(c.display.state === "pm_disabled", `display.state = pm_disabled (got ${c.display.state})`);
    ok(c.display.label === "Disabled by Portfolio Manager", `label = ${c.display.label}`);
    ok(c.display.tone === "caution", "tone = caution (orange, not red)");
    ok(c.display.state !== "enabled" && c.display.label !== "Enabled", "never shows 'enabled'/'Enabled'");
}

console.log("\n[3] PM-blocked rows counted SEPARATELY from unfilled/missed");
{
    // London BOS Long: 1 kept win, 2 PM-blocked, 3 unfilled/missed.
    const trades = [
        execRow("London", "BOS", "Long", 2, "STATE_ONLY"),
        pmBlockedRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed"),
        pmBlockedRow("London", "BOS", "Long", "STATE_ONLY", "state_not_allowed"),
        missedRow("London", "BOS", "Long"), missedRow("London", "BOS", "Long"), missedRow("London", "BOS", "Long"),
    ];
    const res = buildSessionResults(trades, null, pmCtx());
    const c = cohortIn(res, "london", "bos_long");
    ok(c.executedCount === 1, `executedCount = 1 (got ${c.executedCount})`);
    ok(c.portfolioBlockedCount === 2, `portfolioBlockedCount = 2 (got ${c.portfolioBlockedCount})`);
    ok(c.cancelledMissedCount === 3, `cancelledMissedCount = 3 — missed NOT inflated by PM blocks (got ${c.cancelledMissedCount})`);
    ok(c.portfolioBlockedOpportunities.length === 2 && c.cancelledOrMissedOpportunities.length === 3, "buckets are disjoint arrays");
    ok(c.display.state === "active", `traded cohort → active (got ${c.display.state})`);
    ok(c.display.label === POLICY_LABELS.STATE_ONLY, `active label = friendly PM action (got ${c.display.label})`);
}

console.log("\n[4] zero-trade ENABLED cohort → no setups / no fills, never 'disabled'");
{
    // Asia BOS Short: nothing at all → enabled_no_setups. Asia CHoCH Short: only unfilled → enabled_no_fills.
    const trades = [missedRow("Asia", "CHoCH", "Short")];
    const res = buildSessionResults(trades, null, pmCtx({ policyByKey: new Map([
        ["EURUSD|asia|bos_short", { policy: "LABEL" }],
        ["EURUSD|asia|choch_short", { policy: "LABEL" }],
    ]) }));
    const noSetup = cohortIn(res, "asia", "bos_short");
    const noFill = cohortIn(res, "asia", "choch_short");
    ok(noSetup.display.state === "enabled_no_setups" && noSetup.display.label === "Enabled · no setups", `no-setup → ${noSetup.display.label}`);
    ok(noFill.display.state === "enabled_no_fills" && noFill.display.label === "Enabled · no fills", `no-fill → ${noFill.display.label}`);
    ok(noSetup.display.state !== "pm_disabled" && noFill.display.state !== "pm_disabled", "neither is mislabelled disabled");
}

console.log("\n[5] PM action resolved from the DEPLOYED POLICY fallback for a zero-row cohort");
{
    // NY PM CHoCH Short produced ZERO rows, but the policy says DISABLE → still 'pm_disabled'.
    const res = buildSessionResults([], null, pmCtx({ policyByKey: new Map([
        ["EURUSD|ny_pm|choch_short", { policy: "DISABLE" }],
    ]) }));
    const c = cohortIn(res, "ny_pm", "choch_short");
    ok(c.pmAction === "DISABLE" && c.pmActionSource === "policy", `action from policy fallback (got ${c.pmAction}/${c.pmActionSource})`);
    ok(c.display.state === "pm_disabled", `zero-row DISABLE cohort → pm_disabled (got ${c.display.state})`);
}

console.log("\n[6] Session-Scenario disabled stays DISTINCT from PM disabled");
{
    const scenario = { version: 1, enabled: true, cohorts: [
        { session: "lull", structure: "CHoCH", direction: "Long", enabled: false },
    ] };
    const trades = [scenarioDisabledRow("Lull", "CHoCH", "Long")];
    const res = buildSessionResults(trades, scenario, pmCtx({ policyByKey: new Map([
        ["EURUSD|lull|choch_long", { policy: "DIRECTION_AWARE" }],
    ]) }));
    const c = cohortIn(res, "lull", "choch_long");
    ok(c.status === "disabled", "scenario status = disabled (config layer)");
    ok(c.display.state === "scenario_disabled", `display.state = scenario_disabled (got ${c.display.state})`);
    ok(c.display.label === "Disabled by scenario", `label = ${c.display.label}`);
    ok(c.display.state !== "pm_disabled", "scenario-disabled is NOT reported as PM-disabled");
    ok(c.disabledCount === 1 && c.portfolioBlockedCount === 0, "scenario disable is not a PM block");
}

console.log("\n[7] PM OFF preserves legacy behaviour exactly");
{
    const trades = [execRow("London", "BOS", "Long", 2), pmBlockedRow("London", "CHoCH", "Long", "DISABLE", "portfolio_disabled")];
    const res = buildSessionResults(trades, null); // no portfolioCtx
    ok(res.portfolioEnabled === false, "portfolioEnabled = false");
    const traded = cohortIn(res, "london", "bos_long");
    const other = cohortIn(res, "london", "choch_long");
    ok(traded.pmEnabled === false && traded.pmAction === null, "no PM action attached when PM off");
    ok(traded.display.state === "active" && traded.display.label === "Enabled", "traded cohort → legacy 'Enabled'");
    ok(other.display.state !== "pm_disabled", "PM-DISABLE row does NOT force pm_disabled when PM off");
    // even the PM-blocked row still splits into its own bucket (data-faithful), but status stays legacy
    ok(other.portfolioBlockedCount === 1, "PM-blocked row still bucketed separately (faithful), status stays legacy");
}

console.log("\n[8] deriveCohortDisplay is a pure function of counts + ctx");
{
    const base = { status: "enabled", executedCount: 0, disabledCount: 0, cancelledMissedCount: 0, portfolioBlockedCount: 0, pmAction: null };
    ok(deriveCohortDisplay({ ...base }, null).state === "enabled_no_setups", "PM off + empty → enabled_no_setups");
    ok(deriveCohortDisplay({ ...base, pmAction: "DISABLE" }, { enabled: true }).state === "pm_disabled", "PM DISABLE → pm_disabled");
    ok(deriveCohortDisplay({ ...base, portfolioBlockedCount: 3, pmAction: "STATE_ONLY" }, { enabled: true }).state === "pm_blocked", "blocked>0 & exec0 → pm_blocked");
    ok(deriveCohortDisplay({ ...base, executedCount: 5, pmAction: "LABEL" }, { enabled: true }).label === "ALWAYS ALLOW", "active → friendly action label");
    ok(deriveCohortDisplay({ ...base, cancelledMissedCount: 4 }, { enabled: true }).state === "enabled_no_fills", "setups but no fills → enabled_no_fills");
    ok(deriveCohortDisplay({ ...base, status: "disabled" }, { enabled: true }).state === "scenario_disabled", "scenario disable wins");
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
