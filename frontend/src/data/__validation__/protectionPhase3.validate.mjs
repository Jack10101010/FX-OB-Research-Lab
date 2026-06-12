// protectionPhase3.validate.mjs — PROTECTION-LAYER Phase 3 labs/guardrails.
//
// Proves: two-axis exit taxonomy (economic category UNCHANGED), exit-type
// counts, min-sample guardrail, and the protected-comparison fallback descriptor.
//
// Run from frontend/:  node src/data/__validation__/protectionPhase3.validate.mjs

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
    const req = (s) => { if (s.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), s)); throw new Error(`non-relative import ${s}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const tc = loadCjs("src/data/tradeClassification.js");
const sg = loadCjs("src/data/sampleGuardrail.js");
const pl = loadCjs("src/data/protectionLayers.js");
const { classifyTrade, tradeExitType, summarizeTradeClassifications, summarizeTradeSanity, EXIT_TYPES } = tc;
const { evaluateSampleGuardrail, shouldSuppressVerdict } = sg;
const { describeProtectedUniverse } = pl;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const approx = (a, b, e = 0.001) => Math.abs(Number(a) - Number(b)) <= e;

console.log("§1  Exit-type axis (provenance)");
ok(tradeExitType({ outcome: "BE_EXIT", be_exit_r: 0 }) === EXIT_TYPES.BE_EXIT, "BE_EXIT outcome → be_exit");
ok(tradeExitType({ protectionApplied: true, protectionType: "break_even" }) === EXIT_TYPES.BE_EXIT, "protectionApplied+break_even → be_exit");
ok(tradeExitType({ be_triggered: true }) === EXIT_TYPES.BE_EXIT, "be_triggered flag → be_exit");
ok(tradeExitType({ outcome: "WIN", net_r: 2 }) === EXIT_TYPES.NORMAL, "normal win → normal");
ok(tradeExitType({ outcome: "PARTIAL_PROFIT" }) === EXIT_TYPES.PARTIAL_PROFIT, "PARTIAL_PROFIT → partial_profit");
ok(tradeExitType({ outcome: "PARTIAL_LOSS" }) === EXIT_TYPES.PARTIAL_LOSS, "PARTIAL_LOSS → partial_loss");
ok(tradeExitType({ outcome: "FILTERED_OUT" }) === EXIT_TYPES.FILTERED_OUT, "FILTERED_OUT → filtered_out");

console.log("\n§2  Economic classifier UNCHANGED for BE_EXIT (two-axis)");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 0 }) === "BREAKEVEN", "BE stop ~0R → BREAKEVEN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: 0.6 }) === "WIN", "BE_EXIT +0.6R → WIN");
ok(classifyTrade({ outcome: "BE_EXIT", be_exit_r: -0.4 }) === "LOSS", "BE_EXIT -0.4R → LOSS");
ok(classifyTrade({ outcome: "WIN", net_r: 2 }) === "WIN", "normal WIN unchanged");

console.log("\n§3  Exit-type counts folded into rollup; netR/wins unaffected");
const mix = [
    { outcome: "WIN", net_r: 2 },
    { outcome: "LOSS", net_r: -1 },
    { outcome: "BE_EXIT", be_exit_r: 0, net_r: 0, protectionApplied: true, protectionType: "break_even" },
    { outcome: "BE_EXIT", be_exit_r: -0.2, net_r: -0.2, protectionApplied: true, protectionType: "break_even" },
];
const roll = summarizeTradeClassifications(mix);
ok(roll.byExitType.be_exit === 2 && roll.beExitCount === 2, "beExitCount = 2");
ok(roll.protectionAppliedCount === 2, "protectionAppliedCount = 2");
ok(roll.byExitType.normal === 2, "normal exit count = 2");
ok(roll.wins === 1 && roll.losses === 2, "wins/losses by economic R (1 win, 2 loss incl BE -0.2)");
ok(approx(roll.netR, 0.8), "netR sums all rows (2-1+0-0.2 = 0.8)");
const sanity = summarizeTradeSanity(mix);
ok(sanity.beExitCount === 2 && sanity.byExitType.be_exit === 2, "summarizeTradeSanity inherits exit-type axis");

console.log("\n§4  Min-sample guardrail (one source of truth)");
const g3 = evaluateSampleGuardrail({ sampleSize: 3 });
ok(g3.suppressVerdict && g3.lowSample && /too small/.test(g3.message), "n=3 → suppress verdict");
const g7 = evaluateSampleGuardrail({ sampleSize: 7 });
ok(!g7.suppressVerdict && g7.lowSample && /exploratory/.test(g7.message), "n=7 → low sample, not suppressed");
const g20 = evaluateSampleGuardrail({ sampleSize: 20 });
ok(!g20.lowSample && !g20.suppressVerdict && g20.message === null, "n=20 → clean");
ok(shouldSuppressVerdict(2) === true && shouldSuppressVerdict(50) === false, "shouldSuppressVerdict convenience");

console.log("\n§5  Comparison fallback descriptor (protected universe)");
const resolved = describeProtectedUniverse({ universeType: "protected_result", trades: [{}, {}], warnings: [], protection: { baseLabel: "Triggered Edge 25%", layers: [{ layerLabel: "BE 1R Wick · CHoCH", appliedCount: 2, deltaNetR: -0.5 }] } });
ok(resolved.isProtected && resolved.resolved && resolved.appliedCount === 2 && approx(resolved.deltaNetR, -0.5), "protected + applied → resolved with metadata");
const unresolved = describeProtectedUniverse({ universeType: "protected_result", trades: [{}, {}], warnings: [{ code: "NO_MATCHING_VARIANT" }], protection: { layers: [{}] } });
ok(unresolved.isProtected && unresolved.resolved === false && unresolved.unresolvedWarnings.length === 1, "protected but layer unresolved → resolved=false (excluded from comparison)");
const plain = describeProtectedUniverse({ universeType: "scenario", trades: [{}], warnings: [] });
ok(plain.isProtected === false && plain.resolved === false, "non-protected universe → isProtected false");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
