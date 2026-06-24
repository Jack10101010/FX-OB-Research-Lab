// tradeUniverseConvergence.validate.mjs — TRADE-UNIVERSE-MATERIALIZATION-AUDIT-1.md
// Phase 0: Research Lab + Cockpit now resolve trades through the SAME canonical
// resolver as Run Workspace / Failures Lab — `resolveTradeUniverse` (via
// useRunVariant → useTradeUniverse). This validator locks the canonical resolver's
// behaviour so all four readers, which now share it, cannot disagree:
//
//   • same run + baseline      → baseline trades
//   • same run + entry variant → that variant's trades
//   • tradesByMode-only run    → the entry rows (resident only in entryResults.tradesByMode)
//   • no silent baseline fallback (entry selected but no rows → EMPTY + warning, not baseline)
//   • no mutation of the input bundle
//
// Run from frontend/:  node src/data/__validation__/tradeUniverseConvergence.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

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

const { resolveTradeUniverse } = loadModule("src/data/tradeUniverse.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const rows = (n, tag, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, r: 1, outcome: "WIN", ...extra }));

const V = "allow_multi_position";

// ── 1. baseline ────────────────────────────────────────────────────────────────
console.log("\n[1] same run + baseline → baseline trades");
{
    const bundle = {
        tradesByVariant: { [V]: rows(5, "b", { entry_model_key: "baseline" }) },
        primaryVariant: V,
        entryResults: { tradesByMode: { entry_baseline: rows(5, "b", { entry_model_key: "baseline" }) } },
    };
    const u = resolveTradeUniverse({ bundle, scenario: { family: "baseline", positionVariant: V } });
    ok(u.universeType === "baseline" && u.trades.length === 5 && u.variant === V, "baseline resolves 5 trades on the active variant");
}

// ── 2. entry variant (rows in tradesByMode + base present) ──────────────────────
console.log("\n[2] same run + entry variant → that variant's trades");
{
    const bundle = {
        tradesByVariant: { [V]: rows(5, "b", { entry_model_key: "baseline" }) },
        primaryVariant: V,
        entryResults: {
            tradesByMode: { entry_triggered_edge_25p0_d3: rows(7, "e", { entry_model_key: "entry_triggered_edge_25p0_d3" }) },
            summary: { [V]: { entry_triggered_edge_25p0_d3: {} } },
        },
    };
    const u = resolveTradeUniverse({ bundle, scenario: { family: "triggered_edge", threshold: 25, fillMode: "d3", positionVariant: V } });
    ok(u.universeType === "scenario" && u.trades.length === 7 && u.sourceKey === "entry_triggered_edge_25p0_d3",
        "entry variant resolves its own 7 trades (not the 5 baseline)");
    ok(u.variant === V, "entry universe carries the resolved variant (prefixed sourceFile is derivable)");
}

// ── 3. tradesByMode-only run (no resident tradesByVariant / base rows) ──────────
console.log("\n[3] tradesByMode-only run → the entry rows");
{
    const bundle = {
        tradesByVariant: {},                 // nothing resident here
        trades: [],                          // no base rows
        primaryVariant: V,
        entryResults: {
            tradesByMode: { entry_triggered_edge_25p0_d3: rows(9, "m", { entry_model_key: "entry_triggered_edge_25p0_d3" }) },
            summary: { [V]: { entry_triggered_edge_25p0_d3: {} } },
        },
    };
    const u = resolveTradeUniverse({ bundle, scenario: { family: "triggered_edge", threshold: 25, fillMode: "d3", positionVariant: V } });
    ok(u.trades.length === 9 && u.sourceKey === "entry_triggered_edge_25p0_d3",
        "rows resident only in entryResults.tradesByMode resolve to 9 (lazy entry-variant shape)");
}

// ── 4. NO silent baseline fallback ──────────────────────────────────────────────
console.log("\n[4] entry selected but no rows → EMPTY + warning, never baseline");
{
    const bundle = {
        tradesByVariant: { [V]: rows(5, "b", { entry_model_key: "baseline" }) },  // baseline IS resident
        primaryVariant: V,
        entryResults: {
            tradesByMode: {},                // the selected entry variant has NO rows
            summary: { [V]: { entry_triggered_edge_25p0_d3: {} } },
        },
    };
    const u = resolveTradeUniverse({ bundle, scenario: { family: "triggered_edge", threshold: 25, fillMode: "d3", positionVariant: V } });
    ok(u.universeType === "scenario" && u.trades.length === 0,
        "selected entry variant with no rows resolves EMPTY (not the 5 resident baseline trades)");
    ok(u.warnings.some((w) => w.code === "NO_TRADES_FOR_SCENARIO"),
        "emits NO_TRADES_FOR_SCENARIO so the caller can show a hard state, not fake-empty");
}

// ── 5. no mutation ───────────────────────────────────────────────────────────────
console.log("\n[5] no mutation of the input bundle");
{
    const bundle = {
        tradesByVariant: { [V]: rows(5, "b", { entry_model_key: "baseline" }) },
        primaryVariant: V,
        entryResults: {
            tradesByMode: { entry_triggered_edge_25p0_d3: rows(7, "e", { entry_model_key: "entry_triggered_edge_25p0_d3" }) },
            summary: { [V]: { entry_triggered_edge_25p0_d3: {} } },
        },
    };
    const snap = JSON.stringify(bundle);
    resolveTradeUniverse({ bundle, scenario: { family: "baseline", positionVariant: V } });
    resolveTradeUniverse({ bundle, scenario: { family: "triggered_edge", threshold: 25, fillMode: "d3", positionVariant: V } });
    ok(JSON.stringify(bundle) === snap, "resolveTradeUniverse does not mutate the input bundle");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
