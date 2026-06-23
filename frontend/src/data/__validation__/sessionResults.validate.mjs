// sessionResults.validate.mjs — Session Results / Scenario Impact (Phase 1).
//
// Validates buildSessionResults: full 6×4 grid, executed-vs-disabled split,
// disabled never counted in stats, enabled-empty cohorts present, disabled
// cohorts shown, no-scenario state, stats math, scenario-config mapping, and
// no-mutation of inputs.
//
// Run from frontend/:  node src/data/__validation__/sessionResults.validate.mjs

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

const { buildSessionResults, cohortFailureSummary, describeMissedReason, cohortOutcomeDistribution, cohortExcursionSnapshot, cohortTargetSuitability, cohortTargetEconomics, parseTargetLabel, normalizeBars, cohortBESuitability, cohortRiskReduction, cohortManagementRead, cohortResearchVerdict, cohortRegimeSnapshot, cohortFailureClusters, cohortHeaderCounts, TARGET_SUITABILITY_LEVELS } = loadCjs("src/data/sessionResults.js");
const { SESSION_KEYS, CELL_KEYS } = loadCjs("src/data/sessionProfiles.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// ── fixtures ─────────────────────────────────────────────────────────────────
// Trade rows mirror the importer's shape: fillSession, structure, direction,
// outcome/outcomeRaw, net_r/netR, missed_reason, planned prices.
const exec = (session, structure, direction, outcome, r) => ({
    fillSession: session, structure, direction,
    outcome, outcomeRaw: outcome, netR: r, net_r: r, pnl_r: r,
    entry: "2025-01-06T02:30:00", fillTime: "2025-01-06T02:30:00",
    entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 2,
});
const disabled = (session, structure, direction) => ({
    fillSession: session, structure, direction,
    outcome: "COHORT_DISABLED", outcomeRaw: "COHORT_DISABLED", missed_reason: "cohort_disabled",
    net_r: 0, netR: 0, planned_entry_price: 1.1, entryPrice: 1.1, stop: 1.099, tp: 1.102, rr_multiple: 3.3,
});

// Scenario: Asia CHoCH Long disabled; everything else enabled. Asia BOS Long 10R target.
const scenarioConfig = {
    version: 1, enabled: true, meta: { portfolio_name: "Test" },
    cohorts: [
        { session: "asia", structure: "CHoCH", direction: "Long", enabled: false, target: null, be: null },
        { session: "asia", structure: "BOS", direction: "Long", enabled: true, target: { type: "rr", rr: 10 }, be: { trigger: "wick", arm_r: 1 } },
    ],
};

// Trades: Asia BOS Long 2 wins + 1 loss; Asia CHoCH Long 2 disabled; London BOS Short 1 win.
const trades = [
    exec("Asia", "BOS", "Long", "WIN", 2), exec("Asia", "BOS", "Long", "WIN", 2), exec("Asia", "BOS", "Long", "LOSS", -1),
    disabled("Asia", "CHoCH", "Long"), disabled("Asia", "CHoCH", "Long"),
    exec("London", "BOS", "Short", "WIN", 2),
    // a non-executed, non-disabled excluded row (must be ignored by both buckets)
    { fillSession: "Asia", structure: "BOS", direction: "Short", outcome: "UNFILLED", outcomeRaw: "UNFILLED", missed_trade: true },
];

const res = buildSessionResults(trades, scenarioConfig);
const sess = (k) => res.sessions.find((s) => s.key === k);
const coh = (sk, ck) => sess(sk).cohorts.find((c) => c.key === ck);

// 1. full 6×4 grid ────────────────────────────────────────────────────────────
console.log("\n[1] grid completeness");
ok(res.sessions.length === SESSION_KEYS.length, `${SESSION_KEYS.length} sessions present`);
ok(res.sessions.every((s) => s.cohorts.length === CELL_KEYS.length), "every session has 4 cohorts");
ok(res.sessions.map((s) => s.key).join(",") === SESSION_KEYS.join(","), "sessions in canonical order (incl ny_pm)");
ok(res.hasScenario === true, "hasScenario true");

// 2. executed vs disabled split ───────────────────────────────────────────────
console.log("\n[2] split");
ok(coh("asia", "bos_long").executedCount === 3, "Asia BOS Long: 3 executed");
ok(coh("asia", "choch_long").disabledCount === 2, "Asia CHoCH Long: 2 disabled opportunities");
ok(coh("asia", "choch_long").executedCount === 0, "Asia CHoCH Long: 0 executed");
ok(coh("london", "bos_short").executedCount === 1, "London BOS Short: 1 executed");

// 3. disabled NOT counted in stats ────────────────────────────────────────────
console.log("\n[3] disabled excluded from stats");
const asia = sess("asia").summary;
ok(asia.executed === 3, "Asia executed = 3 (disabled NOT counted)");
ok(asia.wins === 2 && asia.losses === 1, "Asia W/L = 2/1");
ok(Math.abs(asia.netR - 3) < 1e-9, "Asia netR = +3 (2+2-1; disabled contribute 0)");
ok(asia.disabledOpportunities === 2, "Asia disabledOpportunities = 2");
ok(coh("asia", "choch_long").netR === 0, "disabled cohort netR = 0 (no executed)");

// 3b. PF in statsFor (Phase 1) — gross profit / gross loss, exact from executed R
console.log("\n[3b] statsFor profit factor");
// Asia BOS Long: +2, +2, −1 → sumPos 4 / |sumNeg| 1 → PF 4.0
ok(coh("asia", "bos_long").summary.pf === 4, "Asia BOS Long PF = 4.0 (4/1)");
// London BOS Short: single +2 winner, no loss → PF null (UI shows ∞)
ok(coh("london", "bos_short").summary.pf === null, "no-loss cohort → PF null (∞ in UI)");
// disabled/empty cohort → no executed R → PF null
ok(coh("asia", "choch_long").summary.pf === null, "empty cohort → PF null");

// 4. stats math ───────────────────────────────────────────────────────────────
console.log("\n[4] stats math");
ok(Math.abs(asia.avgR - 1) < 1e-9, "Asia avgR = 1.0 (3R / 3)");
ok(asia.winRate === Number(((2 / 3) * 100).toFixed(1)), "Asia winRate = 66.7% (2 of 3 decided)");

// 5. enabled-empty cohort present + 6. disabled cohort shown ───────────────────
console.log("\n[5/6] empty + disabled cohorts");
ok(coh("asia", "bos_short").status === "enabled" && coh("asia", "bos_short").executedCount === 0, "Asia BOS Short enabled with 0 trades still present");
ok(coh("asia", "choch_long").status === "disabled", "Asia CHoCH Long status = disabled (from config)");
ok(coh("asia", "bos_long").status === "enabled", "Asia BOS Long status = enabled");
ok(sess("asia").summary.disabledCohorts === 1 && sess("asia").summary.activeCohorts === 3, "Asia: 1 disabled / 3 active cohorts");

// 7. scenario config mapping (TP / BE labels) ─────────────────────────────────
console.log("\n[7] config mapping");
ok(coh("asia", "bos_long").tpLabel === "10R", "Asia BOS Long TP = 10R (from config target)");
ok(coh("asia", "bos_long").beLabel === "1R wick", "Asia BOS Long BE = 1R wick (from config)");
ok(coh("asia", "bos_short").tpLabel === "Run Default", "cohort without rule → Run Default TP");

// 8. no-scenario state ────────────────────────────────────────────────────────
console.log("\n[8] no-scenario");
{
    const ns = buildSessionResults(trades, null);
    ok(ns.hasScenario === false, "no scenario → hasScenario false");
    ok(ns.sessions.length === SESSION_KEYS.length, "no scenario → still full grid");
    ok(ns.sessions.every((s) => s.cohorts.every((c) => c.status === "enabled")), "no scenario → all cohorts enabled");
    ok(ns.sessions.find((s) => s.key === "asia").summary.executed === 3, "no scenario → executed stats still computed");
}

// 8b. cohort drilldown fields (Phase 1 drilldown) ─────────────────────────────
console.log("\n[8b] cohort drilldown data");
{
    const everyCohort = res.sessions.flatMap((s) => s.cohorts);
    ok(everyCohort.every((c) => Array.isArray(c.executedTrades)), "every cohort exposes executedTrades[]");
    ok(everyCohort.every((c) => Array.isArray(c.disabledOpportunities)), "every cohort exposes disabledOpportunities[]");
    ok(everyCohort.every((c) => Array.isArray(c.allRows)), "every cohort exposes allRows[]");
    ok(everyCohort.every((c) => c.summary && typeof c.summary.netR === "number"), "every cohort exposes summary stats");
    ok(everyCohort.every((c) => typeof c.entryLabel === "string"), "every cohort exposes entryLabel");
    // cohort-scoped: Asia BOS Long drilldown holds exactly its 3 executed rows, no disabled
    const abl = coh("asia", "bos_long");
    ok(abl.executedTrades.length === 3 && abl.disabledOpportunities.length === 0, "executed/disabled arrays are cohort-scoped");
    ok(abl.allRows.length === 3, "allRows = executed + disabled for the cohort");
    ok(abl.summary.netR === 3 && abl.summary.wins === 2 && abl.summary.losses === 1, "cohort summary excludes disabled (net +3, 2W/1L)");
    // empty enabled cohort still has (empty) drilldown arrays
    const abs = coh("asia", "bos_short");
    ok(abs.status === "enabled" && abs.executedTrades.length === 0 && abs.disabledOpportunities.length === 0, "empty enabled cohort has empty drilldown arrays");
    // disabled cohort with blocked rows exposes them and has zero executed
    const acl = coh("asia", "choch_long");
    ok(acl.status === "disabled" && acl.disabledOpportunities.length === 2 && acl.executedTrades.length === 0, "disabled cohort exposes its blocked rows, no executed");
    ok(acl.entryLabel === "Run Default", "disabled cohort entryLabel = Run Default (no entry rule)");
    // entry label maps from config (Asia BOS Long has no entry override here → Run Default)
    ok(abl.entryLabel === "Run Default", "cohort entryLabel reflects config (Run Default when no entry override)");
}

// 8c. cohortFailureSummary (Phase 2B) ─────────────────────────────────────────
console.log("\n[8c] cohort failure summary");
{
    // Asia BOS Long executed = 2 WIN(+2), 1 LOSS(-1); its disabled list is empty.
    const abl = coh("asia", "bos_long");
    const f = cohortFailureSummary(abl.executedTrades);
    ok(f.totalLosses === 1, "losses counted from executed only (1)");
    ok(f.lossR === -1, "loss R = -1");
    ok(f.avgLossR === -1, "avg loss R = -1");
    ok(f.largestLossR === -1, "largest loss R = -1");
    ok(f.lossRate === Number(((1 / 3) * 100).toFixed(1)), "loss rate = 33.3% (1 of 3 executed)");

    // Disabled opportunities must NEVER be treated as losses: feeding a disabled
    // cohort's executedTrades (empty) yields zero losses even though it has blocked rows.
    const acl = coh("asia", "choch_long");
    ok(acl.disabledOpportunities.length === 2, "disabled cohort has 2 blocked rows (sanity)");
    ok(cohortFailureSummary(acl.executedTrades).totalLosses === 0, "disabled opportunities never count as losses");

    // No-loss cohort: London BOS Short executed = 1 WIN.
    const nl = cohortFailureSummary(coh("london", "bos_short").executedTrades);
    ok(nl.totalLosses === 0 && nl.avgLossR === null && nl.largestLossR === null, "no-loss cohort handled (nulls)");

    // BE exits + explicit reason tally (crafted rows).
    const crafted = [
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, cancel_reason: "news_touch_cancel" },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -2, cancel_reason: "news_touch_cancel" },
        { outcome: "BE", outcomeRaw: "BE_EXIT", netR: 0 },
        { outcome: "WIN", outcomeRaw: "WIN", netR: 2 },
    ];
    const cf = cohortFailureSummary(crafted);
    ok(cf.totalLosses === 2 && cf.lossR === -3 && cf.largestLossR === -2, "crafted: 2 losses, -3R, largest -2R");
    ok(cf.beExits === 1, "BE exits counted from outcomeRaw BE_EXIT");
    ok(cf.topReasons.length === 1 && cf.topReasons[0].reason === "news_touch_cancel" && cf.topReasons[0].count === 2, "explicit reasons tallied");
    // no-mutation
    const snapCf = JSON.stringify(crafted);
    cohortFailureSummary(crafted);
    ok(JSON.stringify(crafted) === snapCf, "cohortFailureSummary does not mutate input");
}

// 8d. cancelled / missed bucket (Phase 2C) ────────────────────────────────────
console.log("\n[8d] cancelled / missed bucket");
{
    // Fixture has an Asia BOS Short UNFILLED row (fillSession "Asia") → maps to a
    // session cohort's cancelledOrMissedOpportunities, NOT executed/disabled.
    const abs = coh("asia", "bos_short");
    ok(Array.isArray(abs.cancelledOrMissedOpportunities), "cohort exposes cancelledOrMissedOpportunities[]");
    ok(abs.cancelledOrMissedOpportunities.length === 1 && abs.cancelledMissedCount === 1, "UNFILLED row bucketed as cancelled/missed (mapped to session)");
    ok(abs.executedTrades.length === 0 && abs.disabledOpportunities.length === 0, "UNFILLED not counted as executed or disabled");
    ok(abs.allRows.length === 1, "allRows includes the cancelled/missed row");

    // COHORT_DISABLED stays in disabled, never in cancelled/missed.
    const acl = coh("asia", "choch_long");
    ok(acl.disabledOpportunities.length === 2 && acl.cancelledOrMissedOpportunities.length === 0, "COHORT_DISABLED stays in disabledOpportunities, not cancelled/missed");

    // Executed stats unchanged by the new bucket (Asia still 3 executed, +3R, 2W/1L).
    ok(sess("asia").summary.executed === 3 && sess("asia").summary.netR === 3, "executed stats unchanged by cancelled/missed bucket");
    ok(sess("asia").summary.cancelledMissed === 1, "session summary surfaces cancelledMissed count");

    // cancelled/missed never affect netR/win/loss
    const before = sess("asia").summary;
    ok(before.wins === 2 && before.losses === 1, "cancelled/missed excluded from win/loss");

    // Blank-session cancelled/missed → unassigned, never mis-assigned to a session.
    const withBlank = buildSessionResults([
        ...trades,
        { structure: "BOS", direction: "Long", outcome: "NEWS_TOUCH_CANCEL", outcomeRaw: "NEWS_TOUCH_CANCEL", missed_trade: true }, // no fillSession
    ], scenarioConfig);
    ok(withBlank.unassignedCount === 1 && withBlank.unassigned.length === 1, "blank-session cancelled row → unassigned bucket");
    const stillMapped = withBlank.sessions.flatMap((s) => s.cohorts).reduce((n, c) => n + c.cancelledMissedCount, 0);
    ok(stillMapped === 1, "blank-session row NOT assigned to any session cohort (only the Asia UNFILLED maps)");

    // base fixture (all cancelled/missed have sessions) → no unassigned
    ok(res.unassignedCount === 0, "base fixture has no unassigned rows (all have fill sessions)");
}

// 8e. describeMissedReason — specific reason text ─────────────────────────────
console.log("\n[8e] describeMissedReason");
{
    // invalidated triggered-edge with explicit delay 6 → "Invalidated before entry - TrigE 25 Arm 6"
    ok(describeMissedReason({ outcomeRaw: "INVALIDATED", entry_model: "triggered_edge", entry_threshold_pct: 25, fill_delay_candles: 6 }) === "Invalidated before entry - TrigE 25 Arm 6", "invalidated + TrigE 25 Arm 6 (fill_delay_candles)");
    // arm parsed from entry_model_key suffix when fill_delay_candles absent
    ok(describeMissedReason({ outcome: "UNFILLED", entry_model: "triggered_edge", entry_model_key: "entry_triggered_edge_50p0_d2" }) === "Never filled - TrigE Arm 2", "never filled + arm parsed from entry_model_key (_d2)");
    // _next → Arm 1
    ok(describeMissedReason({ cancel_reason: "first_failed_tag_cancel", entry_model: "triggered_edge", entry_model_key: "entry_triggered_edge_25p0_next", entry_threshold_pct: 25 }) === "First failed tag - TrigE 25 Arm 1", "first failed tag + _next → Arm 1");
    // news touch cancel
    ok(describeMissedReason({ cancel_reason: "news_touch_cancel", entry_model: "triggered_edge", fill_delay_candles: 0, entry_threshold_pct: 25 }) === "News touch cancel - TrigE 25 Arm 0", "news touch cancel + Arm 0");
    // penetration context
    ok(describeMissedReason({ outcomeRaw: "INVALIDATED", entry_model: "penetration", entry_threshold_pct: 50 }) === "Invalidated before entry - Pen 50", "penetration context");
    // baseline / no entry model context → bare cause
    ok(describeMissedReason({ outcomeRaw: "UNFILLED", entry_model: "baseline" }) === "Never filled - Baseline", "baseline context");
    ok(describeMissedReason({ outcome: "SESSION_FILTERED" }) === "Session filtered", "no entry model → bare cause");
    // does not mutate / safe on junk
    ok(describeMissedReason(null) === "Cancelled", "null row → safe default");
}

// 8f. cohortOutcomeDistribution (Phase 3A) ────────────────────────────────────
console.log("\n[8f] cohort outcome distribution");
{
    // Asia BOS Long executed = 2 WIN(+2 each), 1 LOSS(-1).
    const d = cohortOutcomeDistribution(coh("asia", "bos_long").executedTrades);
    ok(d.total === 3, "total = executed count (3)");
    const win = d.buckets.find((b) => b.key === "win");
    const loss = d.buckets.find((b) => b.key === "loss");
    ok(win && win.count === 2 && win.netR === 4 && win.avgR === 2, "Wins: 2 · +4R · +2R avg");
    ok(win.percent === Number(((2 / 3) * 100).toFixed(1)), "Wins percent = 66.7%");
    ok(loss && loss.count === 1 && loss.netR === -1 && loss.avgR === -1, "Losses: 1 · -1R · -1R avg");
    ok(loss.percent === Number(((1 / 3) * 100).toFixed(1)), "Losses percent = 33.3%");
    ok(!d.buckets.some((b) => b.key === "be"), "empty BE bucket omitted");

    // BE + News-flatten buckets (crafted executed rows).
    const dx = cohortOutcomeDistribution([
        { outcome: "WIN", outcomeRaw: "WIN", netR: 2 },
        { outcome: "BE_EXIT", outcomeRaw: "BE_EXIT", be_exit_r: 0, netR: 0 },
        { outcome: "NEWS_FLATTEN", outcomeRaw: "NEWS_FLATTEN", netR: 0.3 },
    ]);
    ok(dx.total === 3, "crafted total 3");
    ok(dx.buckets.find((b) => b.key === "be")?.count === 1, "BE bucket counted (BE_EXIT @0)");
    ok(dx.buckets.find((b) => b.key === "news_flatten")?.count === 1, "News Flatten bucket counted");

    // disabled/cancelled excluded: feed only executedTrades → disabled cohort = empty
    ok(cohortOutcomeDistribution(coh("asia", "choch_long").executedTrades).total === 0, "disabled cohort has no executed outcomes");
    // no executed → empty
    const empty = cohortOutcomeDistribution([]);
    ok(empty.total === 0 && empty.buckets.length === 0, "no executed trades handled");
    // no mutation
    const arr = [{ outcome: "WIN", netR: 2 }];
    const snapD = JSON.stringify(arr);
    cohortOutcomeDistribution(arr);
    ok(JSON.stringify(arr) === snapD, "cohortOutcomeDistribution does not mutate input");
}

// 8g. cohortExcursionSnapshot (Phase 3B) ──────────────────────────────────────
console.log("\n[8g] cohort excursion snapshot");
{
    const rows = [
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 2.5, mae_r: -0.3 },
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 2.0, mae_r: -0.5 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.8, mae_r: -1.0 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.2, mae_r: -1.0 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 1.2, mae_r: -1.0 },
    ];
    const snap = cohortExcursionSnapshot(rows);
    ok(snap.all.count === 5 && snap.winners.count === 2 && snap.losers.count === 3, "groups isolated (5 all / 2 win / 3 loss)");
    ok(snap.winners.avgMFE === 2.25 && snap.winners.medianMFE === 2.25, "winners MFE avg/median 2.25");
    ok(snap.winners.avgMAE === -0.4 && snap.winners.medianMAE === -0.4, "winners MAE avg/median -0.4");
    ok(snap.losers.avgMFE === 0.73 && snap.losers.medianMFE === 0.8, "losers MFE avg 0.73 / median 0.8");
    ok(snap.losers.avgMAE === -1 && snap.losers.medianMAE === -1, "losers MAE avg/median -1");
    const th = (lvl) => snap.thresholds.find((t) => t.level === lvl).reachedBeforeLossPct;
    ok(th(0.5) === Number(((2 / 3) * 100).toFixed(1)), "0.5R reached-before-loss = 66.7% (2 of 3)");
    ok(th(1.0) === Number(((1 / 3) * 100).toFixed(1)), "1.0R = 33.3% (1 of 3)");
    ok(th(1.5) === 0 && th(2.0) === 0, "1.5R/2.0R = 0%");

    // no MFE/MAE data → null stats, count still present, thresholds 0 (no loser reached)
    const noData = cohortExcursionSnapshot([{ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 }]);
    ok(noData.all.count === 1 && noData.all.avgMFE === null && noData.all.avgMAE === null, "no excursion fields → null stats, count kept");
    ok(noData.thresholds.find((t) => t.level === 0.5).reachedBeforeLossPct === 0, "no MFE loser counts as not-reached (0%)");

    // empty input → null thresholds, zero counts
    const empty = cohortExcursionSnapshot([]);
    ok(empty.all.count === 0 && empty.losers.count === 0 && empty.thresholds.every((t) => t.reachedBeforeLossPct === null), "empty input handled (null pct)");

    // no mutation
    const snapRows = JSON.stringify(rows);
    cohortExcursionSnapshot(rows);
    ok(JSON.stringify(rows) === snapRows, "cohortExcursionSnapshot does not mutate input");
}

// 8h. cohortTargetSuitability (Phase 3C) ──────────────────────────────────────
console.log("\n[8h] cohort target suitability");
{
    const rows = [
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 2.5 },
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 1.2 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.8 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.2 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 1.5 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 }, // no MFE → excluded from coverage
    ];
    const ts = cohortTargetSuitability(rows);
    ok(ts.total === 6 && ts.coverage.withMFE === 5 && ts.coverage.pct === Number(((5 / 6) * 100).toFixed(1)), "coverage 5/6 (83.3%)");
    ok(ts.winnersWithMFE === 2 && ts.losersWithMFE === 3, "valid-MFE winners 2 / losers 3");
    const L = (lvl) => ts.levels.find((x) => x.level === lvl);
    // 0.5R: 2.5,1.2,0.8,1.5 reach (4 of 5 = 80%); winners 2/2=100%; losers 0.8,1.5 = 2/3 = 66.7%
    ok(L(0.5).reachedCount === 4 && L(0.5).reachedPct === 80, "0.5R all-reached 4/5 = 80% (denominator = valid MFE)");
    ok(L(0.5).winnersReachedPct === 100 && L(0.5).losersReachedPct === Number(((2 / 3) * 100).toFixed(1)), "0.5R winners 100% / losers 66.7%");
    // 1R: 2.5,1.2,1.5 = 3/5=60%; losers 1.5 = 1/3=33.3%
    ok(L(1).reachedPct === 60 && L(1).losersReachedPct === Number(((1 / 3) * 100).toFixed(1)), "1R 60% all / 33.3% losers");
    // 2R: 2.5 = 1/5=20%; winners 2.5=1/2=50%; losers 0
    ok(L(2).reachedPct === 20 && L(2).winnersReachedPct === 50 && L(2).losersReachedPct === 0, "2R 20% all / 50% win / 0% loss");
    ok(L(3).reachedPct === 0 && L(5).reachedPct === 0, "3R/5R = 0%");

    // expanded target ladder (UI polish): all new levels present, existing calcs unchanged
    const EXPECT_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 5.0];
    ok(JSON.stringify(TARGET_SUITABILITY_LEVELS) === JSON.stringify(EXPECT_LEVELS), "TARGET_SUITABILITY_LEVELS = 17-level fine ladder");
    ok(ts.levels.length === EXPECT_LEVELS.length, `table emits all ${EXPECT_LEVELS.length} levels (was 6)`);
    ok(EXPECT_LEVELS.every((lv) => L(lv) != null), "every new level (0.6/0.7/1.25/2.25/3.25 …) is computed");
    // new intermediate levels compute correctly on the same data (0.9R: 2.5,1.2,1.5 reach = 3/5 = 60%)
    ok(L(0.9).reachedCount === 3 && L(0.9).reachedPct === 60, "new 0.9R level computes (3/5 = 60%)");
    ok(L(1.25).reachedCount === 2 && L(1.25).reachedPct === 40, "new 1.25R level computes (2.5,1.5 = 2/5 = 40%)");
    // existing levels unchanged after expansion (regression guard)
    ok(L(1).reachedPct === 60 && L(2).reachedPct === 20, "existing 1R/2R values unchanged after ladder expansion");

    // zero denominator → null pct (winners-only set has no losers)
    const wOnly = cohortTargetSuitability([{ outcome: "WIN", outcomeRaw: "WIN", netR: 2, mfe_r: 2 }]);
    ok(wOnly.levels[0].losersReachedPct === null, "no losers → losersReachedPct null");

    // no MFE coverage at all → withMFE 0, reachedPct null
    const noMfe = cohortTargetSuitability([{ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 }]);
    ok(noMfe.coverage.withMFE === 0 && noMfe.coverage.pct === 0 && noMfe.levels[0].reachedPct === null, "no MFE coverage → null reachedPct");

    // no mutation
    const snapTs = JSON.stringify(rows);
    cohortTargetSuitability(rows);
    ok(JSON.stringify(rows) === snapTs, "cohortTargetSuitability does not mutate input");
}

// 8h2. cohortHeaderCounts — compact W/L/NF/INV for the Cohort Breakdown header ──
console.log("\n[8h2] cohort header counts");
{
    const cohort = {
        executedTrades: [
            { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2 },
            { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2 },
            { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 },
            { outcome: "NEWS_FLATTEN", outcomeRaw: "NEWS_FLATTEN", netR: 0.3 }, // NF — separate from W/L
        ],
        cancelledOrMissedOpportunities: [
            { outcome: "INVALID", outcomeRaw: "INVALID", missed_reason: "invalidated_before_fill", cancel_reason: "invalidated_before_edge_entry", missed_trade: true },
            { outcome: "UNFILLED", outcomeRaw: "UNFILLED", missed_trade: true }, // not invalidation → not counted
        ],
        disabledOpportunities: [
            { outcome: "COHORT_DISABLED", outcomeRaw: "COHORT_DISABLED", missed_reason: "cohort_disabled" },
        ],
    };
    const hc = cohortHeaderCounts(cohort);
    ok(hc.trades === 4, "trades = executed count (4)");
    ok(hc.won === 2, "won = WIN count (2)");
    ok(hc.lost === 1, "lost = LOSS count (1)");
    ok(hc.newsFlat === 1, "newsFlat counted separately from W/L (1)");
    ok(hc.invalidated === 1, "invalidated = INVALID_CANCELLED row only (1, UNFILLED excluded)");
    // disabled rows must NOT be counted as losses (they live in their own bucket)
    ok(hc.lost === 1 && hc.trades === 4, "disabled opportunity not counted as loss / not in trades");
    // older run with no cancelled/missed bucket → graceful 0 invalidated
    const legacy = cohortHeaderCounts({ executedTrades: [{ outcome: "WIN", outcomeRaw: "WIN", netR: 1 }] });
    ok(legacy.invalidated === 0 && legacy.trades === 1, "missing cancelled bucket → invalidated 0 (graceful)");
    // empty / null safety
    ok(cohortHeaderCounts(null).trades === 0, "null cohort → zeros, no throw");
    // no double-counting: W+L+NF <= trades (BE/other executed may remain)
    ok(hc.won + hc.lost + hc.newsFlat <= hc.trades, "no double-count (W+L+NF ≤ trades)");
}

// 8h3. parseTargetLabel — current-target parsing for Δ anchoring ───────────────
console.log("\n[8h3] parseTargetLabel");
{
    ok(parseTargetLabel("1.5R") === 1.5, "'1.5R' → 1.5");
    ok(parseTargetLabel("10R") === 10, "'10R' → 10");
    ok(parseTargetLabel("2.5 R") === 2.5, "'2.5 R' (space) → 2.5");
    ok(parseTargetLabel("Run Default") === null, "'Run Default' → null");
    ok(parseTargetLabel("0R") === null, "'0R' → null (must be > 0)");
    ok(parseTargetLabel("") === null && parseTargetLabel(null) === null, "'' / null → null");
}

// 8h4. cohortTargetEconomics — EXACT re-targeting net R / Δ / confidence / best ──
console.log("\n[8h4] cohort target economics");
{
    const tr = (o, r, m, c) => ({ outcome: o, outcomeRaw: o, netR: r, net_r: r, ...(m != null ? { mfe_r: m } : {}), ...(c != null ? { total_cost_r: c } : {}) });

    // Small fixture, exact hand-computed math. cost 0.1 each, current target 1R.
    //  WIN 2.5 · WIN 1.2 · LOSS 0.8 · LOSS 0.2 · LOSS 1.5    (decided = 5)
    const small = [tr("WIN", 2, 2.5, 0.1), tr("WIN", 2, 1.2, 0.1), tr("LOSS", -1, 0.8, 0.1), tr("LOSS", -1, 0.2, 0.1), tr("LOSS", -1, 1.5, 0.1)];
    const e = cohortTargetEconomics(small, "1R");
    const E = (lvl) => e.levels.find((x) => x.level === lvl);
    ok(e.decided === 5, "decided = 5 (WIN/LOSS with MFE)");
    ok(e.currentTarget === 1 && e.currentNetR === 0.5, "current 1R → netR 0.5 ((1+1−1−1+1) − 5·0.1)");
    // Est W / Est L
    ok(E(1).estW === 3 && E(1).estL === 2, "1R: Est W 3 / Est L 2 (mfe≥1: 2.5,1.2,1.5)");
    ok(E(0.5).estW === 4 && E(0.5).estL === 1, "0.5R: Est W 4 / Est L 1");
    ok(E(2).estW === 1 && E(2).estL === 4, "2R: Est W 1 / Est L 4");
    // Est Net R (exact)
    ok(E(0.5).estNetR === 0.5, "0.5R Est Net R = +0.5 (4·0.5 −1 − 0.5)");
    ok(E(2).estNetR === -2.5, "2R Est Net R = −2.5 (1·2 −4 − 0.5)");
    // Δ vs current (1R)
    ok(E(0.5).deltaCurrent === 0 && E(2).deltaCurrent === -3, "Δ Current: 0.5R 0 / 2R −3");
    // tiny sample → every reach count < ... forces Low; decided 5 < 8 → sample-too-small insight
    ok(e.levels.every((x) => x.confidence === "Low"), "all rows Low (reach count < 5 on 5 trades)");
    ok(e.bestLevel === null, "no Best Overall highlight when all rows Low");
    ok(e.insight.tone === "muted" && /too small/i.test(e.insight.text), "decided<8 → sample-too-small insight");
    // no mutation
    const snap = JSON.stringify(small);
    cohortTargetEconomics(small, "1R");
    ok(JSON.stringify(small) === snap, "cohortTargetEconomics does not mutate input");

    // Larger fixture: 12 winners mfe 3.0, 8 losers mfe 0.3, cost 0. decided 20.
    const big = [
        ...Array.from({ length: 12 }, () => tr("WIN", 3, 3.0, 0)),
        ...Array.from({ length: 8 }, () => tr("LOSS", -1, 0.3, 0)),
    ];
    const eb = cohortTargetEconomics(big, "1.0R");
    const B = (lvl) => eb.levels.find((x) => x.level === lvl);
    ok(eb.decided === 20, "big: decided 20");
    // cost 0 → netRAt(T) = Σ(T if mfe≥T else −1)
    ok(eb.currentNetR === 4, "current 1R netR = 4 (12·1 − 8)");
    ok(B(3.0).estNetR === 28 && B(2.0).estNetR === 16, "3R netR 28 / 2R netR 16 (exact)");
    // confidence: decided 20 (≥15, <40; winners 12 <20) → Medium where reach≥5, Low where reach<5
    ok(B(3.0).confidence === "Medium", "3R Medium (decided 20, reach 12)");
    ok(B(3.25).confidence === "Low", "3.25R Low (reach 0 < 5)");
    // best = highest Est Net R among Medium/High rows → 3.0R
    ok(eb.bestLevel === 3.0 && B(3.0).deltaCurrent === 24, "Best = 3R, Δ +24 vs current 1R");
    ok(eb.bestIsCurrent === false, "best (3R) ≠ current (1R)");
    ok(eb.insight.tone === "success" && /3R/.test(eb.insight.text) && /vs current/.test(eb.insight.text), "insight recommends 3R candidate");

    // best == current
    const ec = cohortTargetEconomics(big, "3.0R");
    ok(ec.bestIsCurrent === true && /strongest/i.test(ec.insight.text), "current = best → 'appears strongest' insight");

    // unknown current target → Δ unavailable, best still found
    const eu = cohortTargetEconomics(big, "Run Default");
    ok(eu.currentTarget === null && eu.currentNetR === null, "unknown current → currentNetR null");
    ok(eu.levels.every((x) => x.deltaCurrent === null), "unknown current → all Δ null (graceful)");
    ok(eu.bestLevel === 3.0 && /unknown/i.test(eu.insight.text), "unknown current → best 3R, insight notes Δ unavailable");

    // High confidence path: decided ≥ 40
    const huge = [
        ...Array.from({ length: 30 }, () => tr("WIN", 2, 2.5, 0)),
        ...Array.from({ length: 15 }, () => tr("LOSS", -1, 0.3, 0)),
    ];
    const eh = cohortTargetEconomics(huge, "1R");
    ok(eh.levels.find((x) => x.level === 1).confidence === "High", "decided 45 → High confidence");

    // cost fallback: no total_cost_r but gross_r/net_r present → cost = gross − net
    const costFb = cohortTargetEconomics([{ outcome: "WIN", outcomeRaw: "WIN", netR: 1.8, net_r: 1.8, gross_r: 2, mfe_r: 2.5 }], "Run Default");
    ok(costFb.levels.find((x) => x.level === 2).estNetR === 1.8, "cost fallback gross−net: 2R netR = +1.8 (2 − 0.2 cost)");

    // reach-rate columns preserved (additive) — base fields still present
    ok(B(1.0).reachedPct != null && B(1.0).winnersReachedPct != null, "base reach-rate columns preserved (additive upgrade)");
}

// 8h5. Phase 3 — target extras (Est WR / Est PF / n), candidates, bars, recommendation
console.log("\n[8h5] target economics Phase 3 (WR/PF/n/candidates/bars/recommendation)");
{
    const tr = (o, r, m, c) => ({ outcome: o, outcomeRaw: o, netR: r, net_r: r, ...(m != null ? { mfe_r: m } : {}), ...(c != null ? { total_cost_r: c } : {}) });

    // normalizeBars
    ok(JSON.stringify(normalizeBars([-2, 0, 2])) === JSON.stringify([0, 50, 100]), "normalizeBars min→0/max→100 with negatives");
    ok(normalizeBars([5, 5, 5]).every((v) => v === 100), "normalizeBars all-equal → 100");
    ok(JSON.stringify(normalizeBars([])) === "[]" && normalizeBars([null, 1]).length === 2, "normalizeBars empty / null-safe");

    // big fixture: 12 winners mfe 3.0, 8 losers mfe 0.3, cost 0, current 1R
    const big = [
        ...Array.from({ length: 12 }, () => tr("WIN", 3, 3.0, 0)),
        ...Array.from({ length: 8 }, () => tr("LOSS", -1, 0.3, 0)),
    ];
    const e = cohortTargetEconomics(big, "1.0R");
    const B = (lvl) => e.levels.find((x) => x.level === lvl);
    // Est WR = Est W / decided
    ok(B(3.0).estWR === 60 && B(3.0).estW === 12 && B(3.0).estL === 8, "3R Est WR 60% (12/20)");
    ok(B(0.5).estWR === 60, "0.5R Est WR 60% (12/20; losers mfe .3 < .5)");
    // Est PF (cost 0): at 3R gross+ = 12·3 = 36, gross− = 8·1 = 8 → PF 4.5
    ok(B(3.0).estPF === 4.5, "3R Est PF = 4.5 (36 / 8)");
    // n = decided on every row
    ok(e.levels.every((x) => x.n === 20), "n = decided (20) on every row");
    // netRBar present and normalized (3R is the max → 100)
    ok(B(3.0).netRBar === 100, "3R netRBar = 100 (max Est Net R)");
    ok(e.levels.every((x) => x.netRBar >= 0 && x.netRBar <= 100), "netRBar within 0–100");
    // candidates
    ok(e.bestLevel === 3.0, "Best = 3R (max Est Net R among Med/High)");
    ok(e.aggressiveLevel === 3.0 && e.aggressiveIsLowConf === false, "Aggressive = 3R, not low-conf here");
    // conservative = strongest Est PF among Δ≥0 Med/High → 3R (PF 4.5 highest)
    ok(e.conservativeLevel === 3.0, "Conservative = highest Est PF among non-negative candidates (3R)");
    ok(e.balancedLevel != null, "Balanced selected (deterministic combined rank)");
    // recommendation (best beats current)
    ok(e.recommendation.kind === "recommend" && e.recommendation.level === 3.0 && e.recommendation.deltaCurrent === 24, "recommend 3R, Δ +24");
    ok(e.recommendation.estPF === 4.5 && e.recommendation.estWR === 60 && e.recommendation.n === 20, "recommendation carries PF/WR/n");

    // Est Net R unchanged from Phase 2 (regression)
    ok(B(2.0).estNetR === 16 && e.currentNetR === 4, "Est Net R unchanged (2R 16 / current 4)");

    // Aggressive can be Low-confidence and is flagged: a fixture where the max Est
    // Net R sits on a reach<5 (Low) row. 6 winners mfe 5.0, 6 losers mfe 0.2, cost 0.
    const lowAgg = [
        ...Array.from({ length: 6 }, () => tr("WIN", 1, 5.0, 0)),
        ...Array.from({ length: 6 }, () => tr("LOSS", -1, 0.2, 0)),
    ];
    const ea = cohortTargetEconomics(lowAgg, "1R");
    // 5R: only 6 winners reach (reach 6 ≥5 → not forced Low; decided 12 <15 → Low tier)
    ok(ea.levels.find((x) => x.level === 5).confidence === "Low", "decided 12 → Low confidence tier");
    ok(ea.aggressiveLevel != null && ea.aggressiveIsLowConf === true, "Aggressive flagged low-confidence when best row is Low");
    ok(ea.bestLevel === null, "no Best Overall when all rows Low (Aggressive ≠ recommendation)");

    // current_best recommendation
    const cb = cohortTargetEconomics(big, "3.0R");
    ok(cb.recommendation.kind === "current_best" && cb.recommendation.level === 3.0, "current = best → current_best recommendation");
    ok(cb.recommendation.estPF != null && cb.recommendation.n === 20, "current_best carries metrics");

    // too_small recommendation
    const tooSmall = cohortTargetEconomics([tr("WIN", 2, 2.5, 0), tr("LOSS", -1, 0.3, 0)], "1R");
    ok(tooSmall.recommendation.kind === "too_small" && tooSmall.recommendation.n === 2, "decided<8 → too_small recommendation");

    // held news-flatten contribution surfaces in heldNetR (display gated on != 0)
    const withNF = cohortTargetEconomics([
        tr("WIN", 2, 2.5, 0), tr("LOSS", -1, 0.3, 0),
        { outcome: "NEWS_FLATTEN", outcomeRaw: "NEWS_FLATTEN", netR: 1.42, net_r: 1.42, mfe_r: 1.5 },
    ], "1R");
    ok(withNF.heldNetR === 1.42, "heldNetR = +1.42 (news-flatten held at actual)");
    ok(cohortTargetEconomics(big, "1R").heldNetR === 0, "heldNetR 0 when no news-flatten (UI hides it)");

    // Best/Current coexist: current is a non-best Med/High level
    const coexist = cohortTargetEconomics(big, "2.0R");
    ok(coexist.bestLevel === 3.0 && coexist.currentTarget === 2.0, "Best (3R) and Current (2R) coexist distinctly");
}

// 8i. cohortBESuitability (Phase 3D) ──────────────────────────────────────────
console.log("\n[8i] cohort BE suitability");
{
    const rows = [
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 2.5 },
        { outcome: "WIN",  outcomeRaw: "WIN",  netR: 2,  mfe_r: 1.2 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.8 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.2 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 1.5 },
        { outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 }, // no MFE → excluded from denominator
    ];
    const be = cohortBESuitability(rows);
    ok(be.totalLosers === 3 && be.totalWinners === 2, "valid-MFE denominators (losers 3 / winners 2; no-MFE loser excluded)");
    const L = (lvl) => be.levels.find((x) => x.level === lvl);
    ok(L(0.5).losersReachedPct === Number(((2 / 3) * 100).toFixed(1)) && L(0.5).winnersReachedPct === 100, "0.5R losers 66.7% / winners 100%");
    ok(L(0.5).signal === "Strong" && L(0.5).netBenefitScore === Number((66.7 - 0).toFixed(1)), "0.5R Strong (losers>=50 & winners>=80), netBenefit 66.7");
    ok(L(1).losersReachedPct === Number(((1 / 3) * 100).toFixed(1)) && L(1).signal === "Mixed", "1R losers 33.3% → Mixed");
    ok(L(1.5).signal === "Mixed" && L(1.5).netBenefitScore === Number((33.3 - 50).toFixed(1)), "1.5R Mixed, netBenefit -16.7");
    ok(L(2).losersReachedPct === 0 && L(2).signal === "Weak", "2R losers 0% → Weak");
    ok(be.levels.length === 4 && be.levels.map((x) => x.level).join(",") === "0.5,1,1.5,2", "default BE levels [0.5,1,1.5,2]");

    // no MFE at all → empty denominators, null pct, "—" signal
    const noMfe = cohortBESuitability([{ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1 }]);
    ok(noMfe.totalLosers === 0 && noMfe.levels[0].losersReachedPct === null && noMfe.levels[0].signal === "—", "no MFE → null pct, '—' signal");

    // no mutation
    const snapBe = JSON.stringify(rows);
    cohortBESuitability(rows);
    ok(JSON.stringify(rows) === snapBe, "cohortBESuitability does not mutate input");
}

// 8i2. BE bounds + Risk-Reduction (Phase 3 — BOUND only) ──────────────────────
console.log("\n[8i2] BE bounds + risk reduction");
{
    // rows with mae_r_to_original_exit so bounds are available.
    //  WIN 2.0 mfe 2.5 mae −0.2 (threatened: mae≤0)
    //  WIN 1.0 mfe 1.2 mae +0.3 (NOT threatened: mae>0)
    //  LOSS −1 mfe 0.8 · LOSS −1 mfe 0.2 · LOSS −1 mfe 1.5
    const W = (r, m, mae) => ({ outcome: "WIN", outcomeRaw: "WIN", netR: r, net_r: r, mfe_r: m, mae_r_to_original_exit: mae });
    const L = (m) => ({ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, net_r: -1, mfe_r: m });
    const rows = [W(2, 2.5, -0.2), W(1, 1.2, 0.3), L(0.8), L(0.2), L(1.5)];

    const be = cohortBESuitability(rows);
    ok(be.boundsAvailable === true, "BE boundsAvailable when winners carry mae-to-exit");
    const B = (lvl) => be.levels.find((x) => x.level === lvl);
    // Net Benefit Score still present (Part 6 column)
    ok(B(0.5).netBenefitScore != null, "BE Net Benefit Score present");
    // 0.5R: losers reaching = 0.8,1.5 → 2 → Saved bound +2R
    ok(B(0.5).savedRBound === 2, "BE 0.5R Saved bound = +2R (2 losers reach)");
    // threatened winners at 0.5R: WIN mfe≥0.5 & mae≤0 → only the −0.2 winner (realised +2)
    ok(B(0.5).threatenedWinners === 1 && B(0.5).lostRBound === 2, "BE 0.5R threatened winner 1, Lost bound 2R (its realised R)");
    ok(B(0.5).netImpactBound === 0, "BE 0.5R Net Impact bound = 0 (2 − 2)");
    // 1.5R: losers reaching = 1.5 only → 1 → Saved +1; winners mfe≥1.5 & mae≤0 → the 2.5/−0.2 winner
    ok(B(1.5).savedRBound === 1 && B(1.5).threatenedWinners === 1, "BE 1.5R Saved +1R / threatened 1");
    // no-mae run → bounds unavailable, saved still null? saved uses count only → still computed; lost null
    const beNoMae = cohortBESuitability([{ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.8 }, { outcome: "WIN", outcomeRaw: "WIN", netR: 2, mfe_r: 2.5 }]);
    ok(beNoMae.boundsAvailable === false && beNoMae.levels[0].lostRBound === null, "BE no mae → boundsAvailable false, Lost bound null");
    ok(beNoMae.levels.find((x) => x.level === 0.5).savedRBound === 1, "BE Saved bound still computed without mae (count-based)");
    // existing reach values unchanged
    ok(B(0.5).losersReachedCount === 2 && B(0.5).winnersReachedCount === 2, "BE reach counts unchanged");
    const snapBe = JSON.stringify(rows);
    cohortBESuitability(rows);
    ok(JSON.stringify(rows) === snapBe, "cohortBESuitability does not mutate input");

    // Risk-Reduction
    const rr = cohortRiskReduction(rows);
    ok(rr.boundsAvailable === true && rr.levels.length === 4, "RR 4 default rules, bounds available");
    const R = (trig) => rr.levels.find((x) => x.trigger === trig);
    ok(R(0.25).newStop === -0.75 && R(1.0).newStop === 0, "RR rule pairs (0.25→−0.75 … 1.0→0)");
    // 0.5R trigger → newStop −0.5. losers mfe≥0.5: 0.8,1.5 → 2 → saved 2·(−0.5+1)=1.0
    ok(R(0.5).losersReached === 2 && R(0.5).savedRBound === 1, "RR 0.5R: 2 losers reached, Saved bound +1R (2·0.5)");
    // threatened winners at 0.5R: WIN mfe≥0.5 & mae≤newStop(−0.5)? mae −0.2 > −0.5 → NOT threatened
    ok(R(0.5).threatenedWinners === 0 && R(0.5).lostRBound === 0, "RR 0.5R: no winner threatened (mae −0.2 > −0.5)");
    ok(R(0.5).netImpactBound === 1, "RR 0.5R Net Impact bound = +1 (1 − 0)");
    // 0.25R trigger → newStop −0.75. winner mae −0.2 > −0.75 → still not threatened; losers mfe≥0.25 = 0.8,1.5 → 2 → saved 2·0.25=0.5
    ok(R(0.25).savedRBound === 0.5 && R(0.25).threatenedWinners === 0, "RR 0.25R: Saved +0.5R, 0 threatened");
    // signal: Strong when net>0.5 & few threatened
    ok(R(0.5).signal === "Strong", "RR 0.5R signal Strong (net +1, 0 threatened)");
    // no-mae → threatened/lost/net null, saved still computed
    const rrNoMae = cohortRiskReduction([{ outcome: "LOSS", outcomeRaw: "LOSS", netR: -1, mfe_r: 0.8 }]);
    ok(rrNoMae.boundsAvailable === false && rrNoMae.levels[0].threatenedWinners === null && rrNoMae.levels[0].savedRBound != null, "RR no mae → threatened null, saved computed");
    const snapRr = JSON.stringify(rows);
    cohortRiskReduction(rows);
    ok(JSON.stringify(rows) === snapRr, "cohortRiskReduction does not mutate input");
}

// 8j. cohortManagementRead (Phase 3E) ─────────────────────────────────────────
console.log("\n[8j] cohort management read");
{
    const tr = (o, r, m) => ({ outcome: o, outcomeRaw: o, netR: r, ...(m != null ? { mfe_r: m } : {}) });
    const win = (r, m) => tr("WIN", r, m);
    const loss = (r, m) => tr("LOSS", r, m);
    const rep = (n, f) => Array.from({ length: n }, () => f());

    ok(cohortManagementRead([]).bias.key === "none", "no trades → bias 'none'");
    ok(cohortManagementRead(rep(3, () => win(2, 1.5))).bias.key === "too_little", "1–4 trades → 'too_little'");

    // Sample < 5 forces too-little even with a strong fast-target signal
    ok(cohortManagementRead(rep(4, () => loss(-1, 0.7))).bias.key === "too_little", "sample<5 forces too_little regardless of signals");

    // A. Fast target candidate
    const fast = cohortManagementRead(rep(5, () => loss(-1, 0.7)));
    ok(fast.bias.key === "fast_target", "A: fast_target (netR<=0, losers0.5>=50, target0.5>=60)");
    ok(fast.nextTests[0].priority === "high" && /0\.5R target/.test(fast.nextTests[0].label), "fast_target first next-test = High 0.5R target (stable order)");

    // B. BE candidate
    const beC = cohortManagementRead([...rep(5, () => win(2, 1.5)), ...rep(2, () => loss(-1, 1.2))]);
    ok(beC.bias.key === "be_candidate", "B: be_candidate (losers1>=50 & winners1>=80)");

    // C. Let winners breathe
    const breathe = cohortManagementRead(rep(5, () => win(3, 3.5)));
    ok(breathe.bias.key === "let_winners_breathe", "C: let_winners_breathe (netR>0, target3>=40, winners2>=70)");

    // D. Disable candidate
    const dis = cohortManagementRead([win(1, 0.2), ...rep(6, () => loss(-1, 0.1))]);
    ok(dis.bias.key === "disable_candidate", "D: disable_candidate (netR<0, winRate<35, target0.5<40)");

    // E. Fallback inconclusive
    const inc = cohortManagementRead(rep(5, () => win(2, 1.5)));
    ok(inc.bias.key === "inconclusive", "E: inconclusive fallback");

    // sample labels + caveats present
    ok(cohortManagementRead(rep(12, () => win(2, 1.5))).sample.label === "Usable sample", "10+ → Usable sample");
    ok(cohortManagementRead(rep(6, () => win(2, 1.5))).sample.label === "Small sample", "5–9 → Small sample");
    ok(fast.caveats.length >= 1, "caveats present (exploratory note)");

    // no mutation
    const rowsMr = [...rep(5, () => loss(-1, 0.7))];
    const snapMr = JSON.stringify(rowsMr);
    cohortManagementRead(rowsMr);
    ok(JSON.stringify(rowsMr) === snapMr, "cohortManagementRead does not mutate input");
}

// 8k. cohortResearchVerdict (Phase 4B) ────────────────────────────────────────
console.log("\n[8k] cohort research verdict");
{
    const tr = (o, r, m) => ({ outcome: o, outcomeRaw: o, netR: r, ...(m != null ? { mfe_r: m } : {}) });
    const win = (r, m) => tr("WIN", r, m);
    const loss = (r, m) => tr("LOSS", r, m);
    const rep = (n, f) => Array.from({ length: n }, () => f());

    // no trades
    const v0 = cohortResearchVerdict([]);
    ok(v0.sample.label === "No data" && v0.sample.tone === "neutral", "no trades → sample 'No data'");
    ok(v0.currentRead.label === "No data", "no trades → current read 'No data'");
    ok(v0.nextTest.label === "Run a wider sample", "no trades → nextTest fallback 'Run a wider sample'");
    ok(typeof v0.caveat === "string" && v0.caveat.length > 0, "caveat present");

    // low sample
    ok(cohortResearchVerdict(rep(3, () => win(2, 1.5))).sample.label === "Too little data", "1–4 trades → 'Too little data'");
    ok(cohortResearchVerdict(rep(7, () => win(2, 1.5))).sample.label === "Small sample", "5–9 → 'Small sample'");
    ok(cohortResearchVerdict(rep(12, () => win(2, 1.5))).sample.label === "Usable sample", "10+ → 'Usable sample'");

    // positive cohort: 7 wins(+2) + 3 losses(-1) → netR +11, winRate 70%
    ok(cohortResearchVerdict([...rep(7, () => win(2, 2.5)), ...rep(3, () => loss(-1, 0.5))]).currentRead.label === "Positive cohort", "positive cohort (netR>0, winRate>=35)");
    // positive tail-dependent: 3 wins(+5) + 7 losses(-1) → netR +8, winRate 30%
    ok(cohortResearchVerdict([...rep(3, () => win(5, 5.5)), ...rep(7, () => loss(-1, 0.5))]).currentRead.label === "Positive but tail-dependent", "positive tail-dependent (netR>0, winRate<35)");
    // losing cohort: 3 wins(+2) + 9 losses(-1) → netR -3, count 12
    ok(cohortResearchVerdict([...rep(3, () => win(2, 2.5)), ...rep(9, () => loss(-1, 0.5))]).currentRead.label === "Losing cohort", "losing cohort (netR<=0, count>=10)");

    // runner target read: 5 wins mfe 3.5 → 3R reached 100%
    ok(cohortResearchVerdict(rep(5, () => win(3, 3.5))).targetRead.label === "Runner behaviour detected", "runner target read (3R reach>=40)");
    // fast-target read: 5 losses mfe 0.7 → 0.5R 100%, 2R 0%
    ok(cohortResearchVerdict(rep(5, () => loss(-1, 0.7))).targetRead.label === "Fast-target candidate", "fast-target read (0.5R>=65 & 2R<35)");
    // no clear target bias: mfe reaches 2R (not fast-target) but under 3R (not runner)
    ok(cohortResearchVerdict(rep(5, () => win(2, 2.2))).targetRead.label === "No clear target bias", "no clear target bias");

    // BE candidate read: 5 wins mfe1.5 + 2 losses mfe1.2 → Strong at 0.5R
    ok(cohortResearchVerdict([...rep(5, () => win(2, 1.5)), ...rep(2, () => loss(-1, 1.2))]).beRead.label === "BE candidate", "BE candidate read (Strong @0.5R/1R)");
    // BE harmful read: 5 wins mfe1.5 + 3 losses mfe0.3 → winners1 100%, losers1 0%
    ok(cohortResearchVerdict([...rep(5, () => win(2, 1.5)), ...rep(3, () => loss(-1, 0.3))]).beRead.label === "BE likely harmful", "BE harmful read (winners1>=80 & losers1<35)");

    // loss-heavy failure read: 6 losses + 4 wins → lossRate 60%
    ok(cohortResearchVerdict([...rep(6, () => loss(-1, 0.5)), ...rep(4, () => win(2, 2.5))]).failureRead.label === "Loss-heavy", "loss-heavy failure read (lossRate>=50)");
    // full-stop losses: 8 wins(+2) + 2 losses(-1.5) → lossRate 20%, avgLossR -1.5
    ok(cohortResearchVerdict([...rep(8, () => win(2, 2.5)), ...rep(2, () => loss(-1.5, 0.5))]).failureRead.label === "Full-stop losses dominate", "full-stop losses read (avgLossR<=-1)");
    // no losses in sample
    ok(cohortResearchVerdict(rep(5, () => win(2, 2.5))).failureRead.label === "No losses in sample", "no losses read");

    // nextTest prefers management-read top suggestion when sample is usable
    const fastV = cohortResearchVerdict(rep(5, () => loss(-1, 0.7)));
    ok(fastV.nextTest.priority === "high" && /0\.5R target/.test(fastV.nextTest.label), "nextTest sourced from management read (High 0.5R target)");

    // no mutation
    const rowsV = [...rep(5, () => loss(-1, 0.7))];
    const snapV = JSON.stringify(rowsV);
    cohortResearchVerdict(rowsV);
    ok(JSON.stringify(rowsV) === snapV, "cohortResearchVerdict does not mutate input");
}

// 8l. cohortRegimeSnapshot (Phase 4C) ─────────────────────────────────────────
console.log("\n[8l] cohort regime snapshot");
{
    const rt = (o, r, ts) => ({ outcome: o, outcomeRaw: o, netR: r, net_r: r, fillTime: ts });
    // 2023: 2 wins(+2). 2024: 1 win(+2 Mar), 2 losses(-1 Dec). 2025: 1 loss(-1 Jun).
    const rows = [
        rt("WIN", 2, "2023-01-10T08:00:00"),
        rt("WIN", 2, "2023-01-20T08:00:00"),
        rt("WIN", 2, "2024-03-05T08:00:00"),
        rt("LOSS", -1, "2024-12-05T08:00:00"),
        rt("LOSS", -1, "2024-12-15T08:00:00"),
        rt("LOSS", -1, "2025-06-01T08:00:00"),
    ];
    const reg = cohortRegimeSnapshot(rows);

    // yearly grouping (ascending)
    ok(reg.years.length === 3 && reg.years.map((y) => y.year).join(",") === "2023,2024,2025", "years grouped ascending (2023,2024,2025)");
    const y23 = reg.years[0], y24 = reg.years[1], y25 = reg.years[2];
    ok(y23.trades === 2 && y23.wins === 2 && y23.losses === 0 && y23.netR === 4 && y23.avgR === 2, "2023: 2 trades, +4R, avg +2R");
    ok(y23.winRate === 100, "2023 win rate 100%");
    // netR + winRate calc
    ok(y24.trades === 3 && y24.netR === 0 && y24.winRate === Number(((1 / 3) * 100).toFixed(1)), "2024: 3 trades, netR 0, WR 33.3%");
    ok(y24.avgR === 0, "2024 avgR = netR/trades = 0");
    ok(y25.trades === 1 && y25.netR === -1 && y25.winRate === 0, "2025: 1 loss, -1R, WR 0%");

    // best / worst year
    ok(reg.bestYear.year === 2023 && reg.bestYear.netR === 4, "best year 2023 (+4R)");
    ok(reg.worstYear.year === 2025 && reg.worstYear.netR === -1, "worst year 2025 (-1R)");

    // monthly grouping (Jan→Dec), aggregated across years
    ok(reg.months.map((m) => m.month).join(",") === "1,3,6,12", "months ordered Jan→Dec (1,3,6,12)");
    ok(reg.months[0].label === "Jan" && reg.months[3].label === "Dec", "month labels mapped");
    const jan = reg.months.find((m) => m.month === 1);
    const dec = reg.months.find((m) => m.month === 12);
    ok(jan.trades === 2 && jan.netR === 4 && jan.winRate === 100, "Jan aggregates 2023 wins (+4R, WR100)");
    ok(dec.trades === 2 && dec.netR === -2 && dec.winRate === 0, "Dec aggregates 2024 losses (-2R, WR0)");

    // best / worst month
    ok(reg.bestMonth.month === 1 && reg.bestMonth.netR === 4, "best month Jan (+4R)");
    ok(reg.worstMonth.month === 12 && reg.worstMonth.netR === -2, "worst month Dec (-2R)");

    // timestamp fallback to `entry` + TZ-safe parse (no fillTime)
    const fb = cohortRegimeSnapshot([{ outcome: "WIN", outcomeRaw: "WIN", netR: 1, entry: "2022-07-15T01:00:00" }]);
    ok(fb.years.length === 1 && fb.years[0].year === 2022 && fb.months[0].month === 7, "falls back to `entry` timestamp; parses 2022-07");

    // undated executed rows are skipped (not grouped)
    const undated = cohortRegimeSnapshot([{ outcome: "WIN", outcomeRaw: "WIN", netR: 1 }]);
    ok(undated.years.length === 0 && undated.months.length === 0, "undated rows skipped");

    // empty input
    const empty = cohortRegimeSnapshot([]);
    ok(empty.years.length === 0 && empty.months.length === 0, "empty input → no years/months");
    ok(empty.bestYear === null && empty.worstYear === null && empty.bestMonth === null && empty.worstMonth === null, "empty input → null best/worst");

    // no mutation
    const snapReg = JSON.stringify(rows);
    cohortRegimeSnapshot(rows);
    ok(JSON.stringify(rows) === snapReg, "cohortRegimeSnapshot does not mutate input");
}

// 8m. cohortFailureClusters (Phase 4D) ────────────────────────────────────────
console.log("\n[8m] cohort failure clusters");
{
    const ls = (r, m) => ({ outcome: "LOSS", outcomeRaw: "LOSS", netR: r, net_r: r, ...(m != null ? { mfe_r: m } : {}) });
    const wn = (r, m) => ({ outcome: "WIN", outcomeRaw: "WIN", netR: r, net_r: r, ...(m != null ? { mfe_r: m } : {}) });
    const get = (fc, k) => fc.clusters.find((c) => c.key === k);

    const rows = [
        ls(-1, 0.0), ls(-1, 0.05), ls(-1, 0.1),  // immediate (3) — incl 0.1 boundary
        ls(-1, 0.3),                              // faded_05 (1)
        ls(-0.8, 0.7),                            // gaveback_1 (1)
        ls(-0.6, 1.5),                            // gaveback_2 (1)
        ls(-1, 2.5),                              // deep (1)
        ls(-1, null),                             // unknown (1)
        wn(2, 3.0),                               // WIN — must be ignored
    ];
    const fc = cohortFailureClusters(rows);

    // only losses counted (WIN excluded)
    ok(fc.totalLosses === 8, "totalLosses counts LOSS only (8; WIN ignored)");
    ok(fc.clusters.length === 6, "6 non-empty clusters present");

    // MFE ranges map correctly
    ok(get(fc, "immediate").count === 3, "immediate: MFE<=0.1 → 3 (incl 0.1 boundary)");
    ok(get(fc, "faded_05").count === 1, "faded_05: 0.1<MFE<0.5 → 1");
    ok(get(fc, "gaveback_1").count === 1, "gaveback_1: 0.5<=MFE<1 → 1");
    ok(get(fc, "gaveback_2").count === 1, "gaveback_2: 1<=MFE<2 → 1");
    ok(get(fc, "deep").count === 1, "deep: MFE>=2 → 1");
    ok(get(fc, "unknown").count === 1, "unknown: no MFE → 1");

    // percentages
    ok(get(fc, "immediate").pct === Number(((3 / 8) * 100).toFixed(1)), "immediate pct = 37.5%");
    ok(get(fc, "deep").pct === Number(((1 / 8) * 100).toFixed(1)), "deep pct = 12.5%");

    // avg MFE
    ok(get(fc, "immediate").avgMFE === Number(((0 + 0.05 + 0.1) / 3).toFixed(2)), "immediate avgMFE = 0.05");
    ok(get(fc, "gaveback_1").avgMFE === 0.7 && get(fc, "deep").avgMFE === 2.5, "avgMFE per cluster correct");
    ok(get(fc, "unknown").avgMFE === null, "unknown avgMFE = null (no MFE)");

    // avg loss R
    ok(get(fc, "immediate").avgLossR === -1, "immediate avgLossR = -1");
    ok(get(fc, "gaveback_1").avgLossR === -0.8 && get(fc, "gaveback_2").avgLossR === -0.6, "avgLossR per cluster correct");

    // dominant cluster + suggested focus
    ok(fc.dominantCluster.key === "immediate", "dominant cluster = immediate (highest count)");
    ok(fc.suggestedFocus === "Entry quality / timing", "suggestedFocus for immediate = Entry quality / timing");

    // boundary mapping (single-loss datasets)
    ok(cohortFailureClusters([ls(-1, 0.1)]).clusters[0].key === "immediate", "boundary 0.1R → immediate");
    ok(cohortFailureClusters([ls(-1, 0.5)]).clusters[0].key === "gaveback_1", "boundary 0.5R → gaveback_1");
    ok(cohortFailureClusters([ls(-1, 1)]).clusters[0].key === "gaveback_2", "boundary 1R → gaveback_2");
    ok(cohortFailureClusters([ls(-1, 2)]).clusters[0].key === "deep", "boundary 2R → deep");

    // suggestedFocus per dominant cluster
    ok(cohortFailureClusters([ls(-1, 0.3), ls(-1, 0.3), ls(-1, 0.3)]).suggestedFocus === "Entry quality / timing", "faded_05 dominant → Entry quality / timing");
    ok(cohortFailureClusters([ls(-1, 0.7), ls(-1, 0.7), ls(-1, 0.7)]).suggestedFocus === "Fast target or early protection", "gaveback_1 dominant → Fast target / early protection");
    ok(cohortFailureClusters([ls(-1, 1.5), ls(-1, 1.5), ls(-1, 1.5)]).suggestedFocus === "BE / partial management candidate", "gaveback_2 dominant → BE / partial management");
    ok(cohortFailureClusters([ls(-1, 2.5), ls(-1, 2.5), ls(-1, 2.5)]).suggestedFocus === "Trailing / exit management candidate", "deep dominant → Trailing / exit management");
    ok(cohortFailureClusters([ls(-1, null), ls(-1, null), ls(-1, null)]).suggestedFocus === "Need MFE coverage", "unknown dominant → Need MFE coverage");

    // no-loss case
    const noLoss = cohortFailureClusters([wn(2, 3), wn(1, 1.2)]);
    ok(noLoss.totalLosses === 0 && noLoss.clusters.length === 0, "no losses → empty clusters");
    ok(noLoss.dominantCluster === null && noLoss.suggestedFocus === null, "no losses → null dominant/focus");

    // empty input
    ok(cohortFailureClusters([]).totalLosses === 0, "empty input handled");

    // no mutation
    const snapFc = JSON.stringify(rows);
    cohortFailureClusters(rows);
    ok(JSON.stringify(rows) === snapFc, "cohortFailureClusters does not mutate input");
}

// 9. no mutation + empty input ────────────────────────────────────────────────
console.log("\n[9] no mutation + empty");
{
    const snap = JSON.stringify(trades);
    buildSessionResults(trades, scenarioConfig);
    ok(JSON.stringify(trades) === snap, "input trades not mutated");
    const empty = buildSessionResults([], null);
    ok(empty.sessions.length === SESSION_KEYS.length && empty.sessions.every((s) => s.summary.executed === 0), "empty trades → full grid, all zero");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
