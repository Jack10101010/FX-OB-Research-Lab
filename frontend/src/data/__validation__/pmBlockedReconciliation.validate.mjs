// pmBlockedReconciliation.validate.mjs — PM-blocked display correctness.
//
// Proves the fix for the "Blocked by PM shows zero" bug:
//   • classifyTrade hard-excludes REGIME_BLOCKED / COHORT_DISABLED (never a performance fill)
//   • buildSessionResults routes REGIME_BLOCKED rows to portfolioBlocked, NOT executed
//   • run-level portfolioSummary aggregates total + reason split (direction/state/disabled)
//   • executed and blocked populations stay disjoint (no blocked row as a fake 0R fill)
//   • RunDetail passes a run-derived portfolioCtx; SessionResults renders the PM Blocked metric
//   • real full-history all-cohorts run reconciles to 100 / 79 / 21 / 0 (when present)
import fs from "fs"; import path from "path"; import babel from "@babel/core";
const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, { filename: resolved, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false });
    const mod = { exports: {} }; cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); if (spec.startsWith("@/data/")) return loadCjs(path.resolve("src/data", spec.slice(7))); throw new Error(spec); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

const tc = loadCjs("src/data/tradeClassification.js");
const { buildSessionResults } = loadCjs("src/data/sessionResults.js");

console.log("\n[1] classifyTrade hard-excludes pre-fill rejections");
ok(tc.classifyTrade({ outcome: "REGIME_BLOCKED", net_r: "0.0" }) === "REGIME_BLOCKED", "REGIME_BLOCKED (net 0) → REGIME_BLOCKED, not BREAKEVEN");
ok(!tc.PERFORMANCE_CATEGORIES.has("REGIME_BLOCKED"), "REGIME_BLOCKED not a performance category");
ok(tc.EXCLUDED_CATEGORIES.has("REGIME_BLOCKED"), "REGIME_BLOCKED registered as excluded");
ok(tc.classifyTrade({ outcome: "COHORT_DISABLED", net_r: "0.0" }) === "COHORT_DISABLED", "COHORT_DISABLED excluded too");
// regression: real fills still classify as performance/executed categories.
ok(tc.PERFORMANCE_CATEGORIES.has(tc.classifyTrade({ outcome: "WIN", net_r: "2" })), "real WIN fill still executed");
ok(tc.classifyTrade({ outcome: "", net_r: "0.0", entry: "1.1", filled_on_trigger_candle: true }) === "BREAKEVEN", "genuine 0R fill (no outcome string) still BREAKEVEN (executed)");
ok(tc.classifyTrade({ outcome: "LOSS", net_r: "-1" }) === "LOSS", "real LOSS still LOSS");

console.log("\n[2] buildSessionResults: blocked routed separately, not executed");
const pm = { enabled: true, instrument: "EURUSD", version: "v1.2" };
const mk = (o, sess, struct, dir, reason) => ({ outcome: o, outcomeRaw: o, fill_session: sess, direction: dir, structure_tag: struct, net_r: o === "WIN" ? "2" : "0", entry: "1.1", regime_block_reason: reason || "" });
const trades = [
    mk("WIN", "New York", "BOS", "bearish"),          // executed
    mk("LOSS", "New York", "BOS", "bearish"),         // executed
    mk("REGIME_BLOCKED", "New York", "CHoCH", "bearish", "direction_mismatch"),
    mk("REGIME_BLOCKED", "New York", "CHoCH", "bearish", "direction_mismatch"),
    mk("REGIME_BLOCKED", "Outside", "CHoCH", "bullish", "state_not_allowed"),
    mk("REGIME_BLOCKED", "London", "BOS", "bearish", "policy_disabled"),
];
const res = buildSessionResults(trades, null, pm);
const sumBlocked = res.sessions.reduce((n, s) => n + s.cohorts.reduce((m, c) => m + (c.portfolioBlockedCount || 0), 0), 0);
const sumExec = res.sessions.reduce((n, s) => n + s.cohorts.reduce((m, c) => m + (Array.isArray(c.executedTrades) ? c.executedTrades.length : 0), 0), 0);
ok(sumBlocked === 4, `4 REGIME_BLOCKED → 4 PM-blocked (got ${sumBlocked})`);
ok(sumExec === 2, `2 real fills → 2 executed (got ${sumExec})`);
ok(res.portfolioSummary && res.portfolioSummary.total === 4, "portfolioSummary.total = 4");
ok(res.portfolioSummary.directionMismatch === 2, "reason split: direction 2");
ok(res.portfolioSummary.stateNotAllowed === 1, "reason split: state 1");
ok(res.portfolioSummary.policyDisabled === 1, "reason split: disabled 1");
// disjoint populations: no blocked row also in executed
const execRows = res.sessions.flatMap((s) => s.cohorts.flatMap((c) => c.executedTrades || []));
const blkRows = res.sessions.flatMap((s) => s.cohorts.flatMap((c) => c.portfolioBlockedOpportunities || []));
ok(execRows.every((t) => String(t.outcome).toUpperCase() !== "REGIME_BLOCKED"), "no REGIME_BLOCKED row in Executed");
ok(blkRows.every((t) => String(t.outcome).toUpperCase() === "REGIME_BLOCKED"), "every Blocked row is REGIME_BLOCKED");

console.log("\n[3] wiring: RunDetail passes portfolioCtx; SessionResults renders metric + summary");
const RD = fs.readFileSync("src/pages/RunDetail.jsx", "utf8");
ok(/portfolioCtxForRun/.test(RD) && /buildSessionResults\(displayTrades, sessionScenarioConfig, portfolioCtxForRun\)/.test(RD), "RunDetail passes run-derived portfolioCtx to buildSessionResults");
ok(/portfolio_policy_enabled === true/.test(RD), "portfolioCtx derives enabled from the run config (not hardcoded)");
const SR = fs.readFileSync("src/components/lab/sessionProfiles/SessionResults.jsx", "utf8");
ok(/data-testid=\{`cohort-pm-blocked-\$\{c\.key\}`\}/.test(SR), "cohort card renders PM Blocked metric");
ok(/Candidate trades rejected by Portfolio Manager before execution\./.test(SR), "PM Blocked tooltip present");
ok(/pm-blocked-run-summary/.test(SR) && /portfolioSummary/.test(SR), "run-level PM-blocked summary wired to portfolioSummary");

console.log("\n[4] real full-history all-cohorts run reconciles (if present)");
const RUN = "/sessions/youthful-vibrant-curie/mnt/Lux-OB-Backtester/outputs/runs/a6347829da394ac48f599f481675e9fb_20260709_215058_EURUSD_15min_RR2_SB1/trades_allow_multi_position__entry_triggered_edge_25p0_d3.csv";
if (fs.existsSync(RUN)) {
    const lines = fs.readFileSync(RUN, "utf8").split(/\r?\n/).filter(Boolean);
    const hdr = lines[0].split(","); const idx = Object.fromEntries(hdr.map((h, i) => [h, i])); const V = (c, n) => idx[n] != null ? c[idx[n]] : "";
    const rows = [];
    for (let i = 1; i < lines.length; i++) { const cols = []; let cur = "", q = false; for (const ch of lines[i]) { if (ch === '"') q = !q; else if (ch === "," && !q) { cols.push(cur); cur = ""; } else cur += ch; } cols.push(cur);
        const o = V(cols, "outcome");
        rows.push({ outcome: o, outcomeRaw: o, fill_session: V(cols, "fill_session"), direction: V(cols, "direction"), structure_tag: V(cols, "structure_tag"), net_r: V(cols, "net_r"), entry: V(cols, "entry"), portfolio_cohort_key: V(cols, "portfolio_cohort_key"), regime_block_reason: V(cols, "regime_block_reason"), portfolio_decision_reason: V(cols, "portfolio_decision_reason") }); }
    const r = buildSessionResults(rows, null, pm);
    const sB = r.sessions.reduce((n, s) => n + s.cohorts.reduce((m, c) => m + (c.portfolioBlockedCount || 0), 0), 0);
    ok(r.portfolioSummary.total === 100 && sB === 100, `aggregate + cohort sum = 100 (got ${r.portfolioSummary.total}/${sB})`);
    ok(r.portfolioSummary.directionMismatch === 79, `direction mismatch = 79 (got ${r.portfolioSummary.directionMismatch})`);
    ok(r.portfolioSummary.stateNotAllowed === 21, `state not allowed = 21 (got ${r.portfolioSummary.stateNotAllowed})`);
    ok(r.portfolioSummary.policyDisabled === 0, `policy disabled = 0 (runtime-LABEL cohorts execute) (got ${r.portfolioSummary.policyDisabled})`);
    const execRows2 = r.sessions.flatMap((s) => s.cohorts.flatMap((c) => c.executedTrades || []));
    ok(execRows2.length === 1107, `executed = 1107 (got ${execRows2.length})`);
    ok(execRows2.every((t) => String(t.outcome).toUpperCase() !== "REGIME_BLOCKED"), "no blocked row leaked into executed");
} else {
    console.log("  (real run CSV not present — skipped)");
}

console.log(`\n${fail ? fail + " FAILED" : "ALL PASSED"} (${pass} checks)`);
process.exit(fail ? 1 : 0);
