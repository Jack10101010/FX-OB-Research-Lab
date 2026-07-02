// portfolioDecision.validate.mjs — Portfolio Manager v1 (Phase 4) trade-decision adapter.
//
// Proves portfolioDecisionForTrade: null when absent; allowed LABEL/STATE_ONLY/
// DIRECTION_AWARE; blocked direction_mismatch / state_not_allowed / portfolio_disabled;
// disabled cohort; unknown_cohort + insufficient_data fail-safe; display labels; tones;
// snake_case + camelCase + spelling-variant tolerance. Pure — no React.
//
// Run from frontend/:  node src/data/__validation__/portfolioDecision.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const { code } = babel.transformSync(fs.readFileSync(resolved, "utf8"), {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(`unexpected non-relative import: ${spec}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const { portfolioDecisionForTrade } = loadCjs("src/data/portfolioDecision.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const allow = (regime, reason) => ({
    portfolio_policy_regime: regime, portfolio_decision_reason: reason,
    portfolio_status: "ENABLED", portfolio_confidence: "HIGH",
    portfolio_cohort_key: "EURUSD|asia|bos_short", portfolio_policy_version: "v1", outcome: "Loss",
});
const block = (regime, blockReason) => ({
    portfolio_policy_regime: regime, portfolio_decision_reason: `policy_${regime.toLowerCase()}`,
    portfolio_status: regime === "DISABLE" ? "DISABLED" : "ENABLED",
    portfolio_cohort_key: "EURUSD|london|bos_short", portfolio_policy_version: "v1",
    outcome: "REGIME_BLOCKED", regime_block_reason: blockReason,
});

console.log("\n[1] no portfolio fields → null");
ok(portfolioDecisionForTrade({}) === null, "empty row → null");
ok(portfolioDecisionForTrade({ direction: "bullish", r: 2 }) === null, "non-portfolio row → null");
ok(portfolioDecisionForTrade(null) === null, "null row → null");

console.log("\n[2] allowed policies");
const lab = portfolioDecisionForTrade(allow("LABEL", "policy_label"));
ok(lab.status === "allowed" && lab.policy === "LABEL", "LABEL allowed");
ok(lab.headline === "Allowed by Portfolio Manager", "LABEL headline");
ok(lab.tone === "muted", "LABEL tone muted");
const st = portfolioDecisionForTrade(allow("STATE_ONLY", "policy_state_only"));
ok(st.status === "allowed" && st.policy === "STATE_ONLY" && st.tone === "success", "STATE_ONLY allowed + success tone");
const da = portfolioDecisionForTrade(allow("DIRECTION_AWARE", "policy_direction_aware"));
ok(da.status === "allowed" && da.policy === "DIRECTION_AWARE", "DIRECTION_AWARE allowed");
ok(da.reasonLabel === "Direction-aware filter", "DIRECTION_AWARE reason label");
ok(da.confidence === "HIGH" && da.cohortKey === "EURUSD|asia|bos_short" && da.version === "v1", "carries confidence/cohort/version");

console.log("\n[3] blocked trades (enforce)");
const bd = portfolioDecisionForTrade(block("DIRECTION_AWARE", "direction_mismatch"));
ok(bd.status === "blocked" && bd.blocked === true, "direction_mismatch → blocked");
ok(bd.headline === "Blocked by Portfolio Manager", "blocked headline");
ok(bd.reasonLabel === "Direction mismatch" && bd.tone === "danger", "direction_mismatch label + danger tone");
const bs = portfolioDecisionForTrade(block("STATE_ONLY", "state_not_allowed"));
ok(bs.status === "blocked" && bs.reasonLabel === "State not allowed", "state_not_allowed → blocked");
const bp = portfolioDecisionForTrade(block("DISABLE", "portfolio_disabled"));
ok(bp.status === "blocked" && bp.reasonLabel === "Disabled cohort", "portfolio_disabled → blocked");

console.log("\n[4] disabled cohort (label mode, not blocked)");
const dis = portfolioDecisionForTrade(allow("DISABLE", "policy_disabled"));
ok(dis.status === "disabled" && dis.blocked === false, "DISABLE (label) → disabled, not blocked");
ok(dis.headline === "Disabled cohort" && dis.tone === "danger", "disabled headline + tone");

console.log("\n[5] fail-safe reasons");
const unk = portfolioDecisionForTrade(allow("LABEL", "unknown_cohort"));
ok(unk.status === "unknown" && unk.tone === "warning", "unknown_cohort → unknown + warning");
ok(unk.headline === "Allowed (fail-safe)", "unknown headline");
const ins = portfolioDecisionForTrade(allow("LABEL", "insufficient_data"));
ok(ins.status === "unknown" && ins.reasonLabel.startsWith("Insufficient data"), "insufficient_data → fail-safe");

console.log("\n[6] spelling + casing tolerance");
const camel = portfolioDecisionForTrade({
    portfolioPolicyRegime: "DIRECTION_AWARE", portfolioDecisionReason: "policy_direction_aware",
    portfolioStatus: "ENABLED", portfolioCohortKey: "GBPUSD|newYork|choch_long", portfolioPolicyVersion: "v9",
    outcome: "Win",
});
ok(camel && camel.policy === "DIRECTION_AWARE" && camel.version === "v9", "camelCase fields read");
const variant = portfolioDecisionForTrade({
    portfolio_policy_regime: "STATE_ONLY", outcome: "REGIME_BLOCKED", regime_block_reason: "State-Not-Allowed",
});
ok(variant.blocked && variant.reasonLabel === "State not allowed", "hyphen/caps block reason normalized");
const oddRegime = portfolioDecisionForTrade({ portfolio_policy_regime: "SOMETHING", portfolio_decision_reason: "policy_label", outcome: "Loss" });
ok(oddRegime.policy === "LABEL", "unknown regime value falls back to LABEL");

console.log("\n[7] display labels + tones enumerated");
ok(lab.policyLabel === "Label (no filter)", "policyLabel LABEL");
ok(st.policyLabel === "State-only", "policyLabel STATE_ONLY");
ok(da.policyLabel === "Direction-aware", "policyLabel DIRECTION_AWARE");
ok(["danger", "warning", "success", "muted"].includes(bd.tone) && ["danger", "warning", "success", "muted"].includes(lab.tone), "tones are within the allowed set");

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
