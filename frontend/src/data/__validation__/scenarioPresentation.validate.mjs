// scenarioPresentation.validate.mjs — validates the pure Run Batch / Scenario Card presentation helper.
//
// Run from frontend/:  node src/data/__validation__/scenarioPresentation.validate.mjs

import babel from "@babel/core";
import fs from "fs";

function loadCjs(absPath, requireShim = () => ({})) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    return module.exports;
}

const P = loadCjs("src/data/runs/scenarioPresentation.js");

let failed = 0;
const ok = (name, cond) => { if (cond) console.log(`  ok  ${name}`); else { failed++; console.error(`FAIL  ${name}`); } };
const throwsOrSafe = (name, fn) => { try { const r = fn(); ok(name, r !== undefined); } catch { ok(name, true); } };

// Representative run (mirrors summary.json entry_results shape for ffe24fdb…).
const run = {
    id: "ffe24fdbabc123", displayName: "EURUSD | TrigE MS ON | ALL | 2R | From 01 Apr 2021 to 18 Jun 21",
    status: "completed", createdAt: "2026-07-04T20:45:09Z", config_hash: "24dc7de82e81",
    config: {
        symbol: "EURUSD", date_from: "2021-04-01", date_to: "2021-06-18", rr_multiple: 2,
        entry_models: ["triggered_edge"], triggered_edge_trigger_thresholds: [10, 25],
        triggered_edge_candle_delays: [2, 3, 4, 5], regime_gate_enabled: true,
        regime_direction_policy: "direction_aware", portfolio_policy_enabled: false,
        session_filter_enabled: false, spread_pips: 0.2, slippage_pips: 0.2, stop_buffer_pips: 1,
        news_blackout_impacts: ["high"], news_blackout_minutes_before: 3, news_blackout_minutes_after: 3,
        trade_direction: "both",
    },
    executionMode: "allow_multi_position", primaryVariant: "allow_multi_position",
    entryResults: { summary: { allow_multi_position: {
        baseline:                     { net_r: 4.18, max_drawdown_r: -5.10, win_rate: 0.407, wins: 11, losses: 16, filled_trades: 28, missed_trades: 11, total_obs: 39, gross_net_r: 6.53, total_loss_r: -17.28 },
        entry_triggered_edge_10p0_d3: { net_r: -1.35, max_drawdown_r: -7.73, win_rate: 0.333, wins: 5, losses: 10, filled_trades: 15, missed_trades: 13, total_obs: 39, gross_net_r: 1.0, total_loss_r: -12.0 },
        entry_triggered_edge_25p0_d5: { net_r: -3.01, max_drawdown_r: -8.68, win_rate: 0.273, wins: 3, losses: 8, filled_trades: 11, missed_trades: 17, total_obs: 39, gross_net_r: -1.0, total_loss_r: -9.0 },
        entry_triggered_edge_10p0_d2: { net_r: -1.35, max_drawdown_r: -7.73, win_rate: 0.333, wins: 5, losses: 10, filled_trades: 15, missed_trades: 13, total_obs: 39 },
        some_unknown_scenario_key:    { net_r: 0.5, max_drawdown_r: -1.0, win_rate: 0.5, filled_trades: 2 },
    } } },
};

const batch = P.buildRunBatch(run);
const byKey = Object.fromEntries(batch.scenarios.map((s) => [s.scenarioKey, s]));

ok("1 builds run batch", batch && Array.isArray(batch.scenarios) && batch.scenarios.length === 5);
ok("2 parses baseline", byKey.baseline && byKey.baseline.family === "baseline" && byKey.baseline.label === "Baseline");
const c3 = P.parseScenarioKey("entry_triggered_edge_10p0_d3");
ok("3 parses TE 10% C3", c3.triggerThreshold === 10 && c3.armLabel === "C3" && c3.family === "triggered_edge");
const c5 = P.parseScenarioKey("entry_triggered_edge_25p0_d5");
ok("4 parses TE 25% C5", c5.triggerThreshold === 25 && c5.armLabel === "C5");
const unk = P.parseScenarioKey("weird_key_123");
ok("5 unknown key safe", unk.known === false && unk.label === "weird_key_123");
ok("6 title from config not display_name", batch.title.includes("EURUSD") && batch.title.includes("2021-04-01") && !batch.title.includes("From 01 Apr"));
ok("7 scenario count correct", batch.scenarioCount === 5);
ok("8 derives Net/DD", Math.abs(byKey.baseline.netDd - (4.18 / 5.10)) < 0.02);
ok("9 PF derived or null", typeof byKey.baseline.profitFactor === "number" && byKey.entry_triggered_edge_10p0_d2.profitFactor === null);
ok("10 delta vs baseline", byKey.entry_triggered_edge_10p0_d3.deltaVsBaseline && Math.abs(byKey.entry_triggered_edge_10p0_d3.deltaVsBaseline.netR - (-1.35 - 4.18)) < 0.02);
ok("11 flags best Net R", byKey.baseline.isBestNetR === true);
ok("12 flags best Net/DD", batch.scenarios.some((s) => s.isBestNetDd));
ok("13 context UNKNOWN when ambiguous", P.inferContextMode({ date_from: "2022-01-01", date_to: "2024-06-01" }).mode === P.CONTEXT_MODES.UNKNOWN);
ok("14 context COLD for short window", batch.contextMode === P.CONTEXT_MODES.COLD);
ok("15 warm-up warning present for cold/unknown", batch.contextWarning.some((w) => /warm-up/i.test(w)));
ok("16 blocked counts null when absent", byKey.baseline.blockedRegime === null && byKey.baseline.portfolioBlocked === null);
ok("17 no fabricated 0 blocked", batch.scenarios.every((s) => s.blockedRegime === null));
const order = batch.scenarios.map((s) => s.scenarioKey);
ok("18 deterministic ordering (baseline first, then trigger↑ arm↑, unknown last)",
    order[0] === "baseline" && order[order.length - 1] === "some_unknown_scenario_key"
    && order.indexOf("entry_triggered_edge_10p0_d2") < order.indexOf("entry_triggered_edge_10p0_d3")
    && order.indexOf("entry_triggered_edge_10p0_d3") < order.indexOf("entry_triggered_edge_25p0_d5"));
throwsOrSafe("19 malformed input safe", () => P.buildRunBatch(null) || P.buildRunBatch({}));
const before = JSON.stringify(run);
P.buildRunBatch(run);
ok("20 pure / does not mutate input", JSON.stringify(run) === before);

// bonus: empty run yields safe empty model with a warning
const empty = P.buildRunBatch({ id: "x", config: {} });
ok("21 empty run safe (no scenarios, has warning)", empty.scenarioCount === 0 && empty.warnings.length > 0);

console.log(failed === 0 ? "\nALL SCENARIO-PRESENTATION CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
