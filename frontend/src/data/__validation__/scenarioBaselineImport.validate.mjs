// scenarioBaselineImport.validate.mjs — Fair Baseline frontend import (Session-First P2.5).
//
// Proves the backend Fair Baseline output (trades_<mode>__scenario_baseline.csv +
// run_summary.scenario_baseline) imports into a DEDICATED, parallel bundle shape and
// never mixes into the custom universe:
//   1. detectFileKind → "trades_scenario_baseline" (NOT "trades_protected")
//   2. ingest routes rows into scenarioBaselineResults.tradesByMode[<mode>]
//   3. rows absent from tradesByVariant / entryResults.tradesByMode / protectionResults.tradesByMode
//   4. old run (no baseline CSV) imports cleanly
//   5. custom universe from resolveTradeUniverse is byte-identical with/without the file
//   6. selectScenarioBaselineUniverse(bundle) (pure core of getScenarioBaselineUniverse)
//      returns baseline trades + provenance + warnings; empty-state for old runs
//   7. large/lazy import classification knows the new kind (detectFileKind + LAZY_EAGER parse)
//
// Run from frontend/:  node src/data/__validation__/scenarioBaselineImport.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

// Recursive CJS loader; stubs non-relative imports (matches largeRunImport harness).
function loadModule(absPath, cache = new Map()) {
    if (cache.has(absPath)) return cache.get(absPath);
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(absPath, mod.exports);
    const req = (spec) => {
        if (spec.startsWith(".")) {
            let p = path.resolve(path.dirname(absPath), spec);
            if (!p.endsWith(".js")) p += ".js";
            return loadModule(p, cache);
        }
        return {};
    };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(absPath, mod.exports);
    return mod.exports;
}

const importer = loadModule("src/data/importer.js");
const { detectFileKind, ingestRunBundle, assessBundleSize, selectScenarioBaselineUniverse } = importer;
const { resolveTradeUniverse } = loadModule("src/data/tradeUniverse.js");

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS ", name); } else { fail++; console.log("  FAIL ", name); } };

const mkFile = (name, content, size) => ({ name, size: size ?? (content ? content.length : 0), text: async () => content ?? "" });

const T_HEADER = "trade_id,direction,entry_time,entry,pnl_r,outcome,ob_id,structure_tag,fill_session";
const CONFIG = () => mkFile("config.json", JSON.stringify({ symbol: "EURUSD", pip_size: 0.0001, rr_multiple: 2, detection_tf: "15min", execution_tf: "1m" }));
const SUMMARY = (withProv) => mkFile("summary.json", JSON.stringify({
    id: "run1", symbol: "EURUSD", trades: 1, net_r: 2, order_blocks: 1, rr_multiple: 2,
    ...(withProv ? {
        scenario_baseline: {
            output_kind: "scenario_baseline", enabled: true, mode: "eligible",
            eligible_cohort_count: 1, baseline_target_rr: 3.3, baseline_be: "none",
            warnings: ["baseline_comparison.risk_reduction is present but unsupported; ignored (no risk-reduction engine yet)"],
        },
    } : {}),
}));
const OBS = () => mkFile("order_blocks.csv", "id,top,bottom\n1,1.2000,1.1000\n2,1.3100,1.3000");
const CUSTOM = () => mkFile("trades_single_position.csv", `${T_HEADER}\nT1,Long,2025-01-01T08:00:00Z,1.15,2,Win,1,BOS,London`);
const BASELINE = () => mkFile("trades_single_position__scenario_baseline.csv",
    `${T_HEADER}\nB1,Long,2025-01-01T08:00:00Z,1.15,3,Win,1,BOS,London\nB2,Short,2025-01-01T16:00:00Z,1.30,-1,Loss,2,CHoCH,NY PM`);

const idsOf = (arr) => (arr || []).map((t) => String(t.id || t.rawTradeId || ""));

async function run() {
    // ── 1 + 7a. classification ──────────────────────────────────────────────────
    const kind = detectFileKind("trades_single_position__scenario_baseline.csv");
    ok("1. detectFileKind → trades_scenario_baseline", kind === "trades_scenario_baseline");
    ok("1b. NOT classified as trades_protected", kind !== "trades_protected");
    ok("7a. allow_multi_position variant also detected",
        detectFileKind("trades_allow_multi_position__scenario_baseline.csv") === "trades_scenario_baseline");
    const sized = assessBundleSize([CONFIG(), SUMMARY(true), OBS(), CUSTOM(), BASELINE()]);
    ok("7b. assessBundleSize counts the file, not large, not a BE file", sized.isLarge === false && sized.fileCount === 5 && sized.beFileCount === 0);

    // ── ingest WITH the baseline file ───────────────────────────────────────────
    const withRes = await ingestRunBundle([CONFIG(), SUMMARY(true), OBS(), CUSTOM(), BASELINE()], { forceEager: true });
    ok("ingest (with baseline) ok", withRes.ok === true);
    const b = withRes.bundle;

    // ── 2. routed into scenarioBaselineResults.tradesByMode ─────────────────────
    const sbr = b.scenarioBaselineResults || {};
    const sbMode = sbr.tradesByMode?.single_position || [];
    ok("2. scenarioBaselineResults.tradesByMode.single_position has 2 rows", sbMode.length === 2);
    ok("2b. provenance summary carried through", sbr.summary?.baseline_target_rr === 3.3 && sbr.summary?.mode === "eligible");

    // ── 3. rows do NOT leak into the custom universe maps ───────────────────────
    const variantIds = Object.values(b.tradesByVariant || {}).flatMap(idsOf);
    const entryIds = Object.values(b.entryResults?.tradesByMode || {}).flatMap(idsOf);
    const protIds = Object.values(b.protectionResults?.tradesByMode || {}).flatMap(idsOf);
    const baselineIds = idsOf(sbMode);
    const noLeak = !["B1", "B2"].some((id) => variantIds.includes(id) || entryIds.includes(id) || protIds.includes(id));
    ok("3. baseline rows absent from variant/entry/protection maps", noLeak && baselineIds.includes("B1"));
    ok("3b. protectionResults.tradesByMode empty (not misfiled as protection)", Object.keys(b.protectionResults?.tradesByMode || {}).length === 0);
    ok("3c. tradesByVariant.single_position still has ONLY the 1 custom row", (b.tradesByVariant?.single_position || []).length === 1);

    // ── 4. old run WITHOUT the baseline file imports cleanly ────────────────────
    const withoutRes = await ingestRunBundle([CONFIG(), SUMMARY(false), OBS(), CUSTOM()], { forceEager: true });
    ok("4. old run (no baseline) imports ok", withoutRes.ok === true);
    const b0 = withoutRes.bundle;
    ok("4b. scenarioBaselineResults present + empty", b0.scenarioBaselineResults && Object.keys(b0.scenarioBaselineResults.tradesByMode || {}).length === 0);

    // ── 5. custom universe byte-identical with/without the baseline file ────────
    const uWith = resolveTradeUniverse({ bundle: b, scenario: null });
    const uWithout = resolveTradeUniverse({ bundle: b0, scenario: null });
    ok("5. resolveTradeUniverse trades identical with/without baseline", JSON.stringify(uWith.trades) === JSON.stringify(uWithout.trades));
    ok("5b. custom universe label + count unchanged", uWith.label === uWithout.label && uWith.stats.total === uWithout.stats.total && uWith.stats.total === 1);

    // ── 6. selectScenarioBaselineUniverse (pure core of getScenarioBaselineUniverse) ─
    const sel = selectScenarioBaselineUniverse(b);
    ok("6. available + executionMode + trades", sel.available === true && sel.executionMode === "single_position" && sel.trades.length === 2);
    ok("6b. provenance + warnings surfaced", sel.provenance.baseline_target_rr === 3.3 && sel.warnings.some((w) => /risk_reduction/i.test(w)));
    ok("6c. stats classify the baseline rows (1 win, 1 loss)", sel.stats.total === 2 && sel.stats.wins === 1 && sel.stats.losses === 1);
    const selEmpty = selectScenarioBaselineUniverse(b0);
    ok("6d. empty-state for old run", selEmpty.available === false && selEmpty.trades.length === 0 && selEmpty.executionMode === null);
    ok("6e. selector safe on null bundle", selectScenarioBaselineUniverse(null).available === false);

    // ── 7c. LAZY path still eager-parses the baseline (proves LAZY_EAGER_KINDS) ──
    const lazyRes = await ingestRunBundle([CONFIG(), SUMMARY(true), OBS(), CUSTOM(), BASELINE()], { forceLazy: true });
    ok("7c. lazy import still parses scenario_baseline rows", (lazyRes.bundle?.scenarioBaselineResults?.tradesByMode?.single_position || []).length === 2);

    console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`}  (${pass} passed)`);
    process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("VALIDATOR ERROR:", e); process.exit(1); });
