// resolveRunDisplayUniverse.validate.mjs — shared run-universe bridge resolver.
//
// Verifies the tradesByMode fallback that fixes Research Lab / Cockpit empty states
// for lazy entry-variant runs (RUN-DATA-PATH-AUDIT-1.md): resolution order, the
// needsHydration flag, no-mutation, and that a tradesByMode-only bundle resolves to
// a usable universe.
//
// Run from frontend/:  node src/data/__validation__/resolveRunDisplayUniverse.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const { code } = babel.transformSync(fs.readFileSync(resolved, "utf8"), {
        filename: resolved, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
    });
    const mod = { exports: {} }; cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(spec); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const { resolveRunDisplayUniverse } = loadCjs("src/data/resolveDisplayTrades.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, r: 1 }));

// 1. base / variant precedence ─────────────────────────────────────────────────
console.log("\n[1] tradesByVariant / base precedence");
{
    const r1 = resolveRunDisplayUniverse({ tradesByVariant: { single_position: rows(3, "a") }, primaryVariant: "single_position" }, "single_position");
    ok(r1.source === "active_variant" && r1.trades.length === 3 && r1.variantKey === "single_position", "active variant wins");
    const r2 = resolveRunDisplayUniverse({ tradesByVariant: { single_position: rows(4, "p") }, primaryVariant: "single_position" }, "other");
    ok(r2.source === "primary_variant" && r2.trades.length === 4, "primary variant fallback");
    const r3 = resolveRunDisplayUniverse({ trades: rows(5, "t") }, null);
    ok(r3.source === "base_trades" && r3.trades.length === 5, "base trades fallback");
    // empty active variant array must NOT win — falls through
    const r4 = resolveRunDisplayUniverse({ tradesByVariant: { single_position: [] }, trades: rows(2, "t") }, "single_position");
    ok(r4.source === "base_trades" && r4.trades.length === 2, "empty active variant skipped → base");
}

// 2. entryResults.tradesByMode fallback (the bridge) ───────────────────────────
console.log("\n[2] tradesByMode fallback");
{
    const byMode = (obj) => ({ entryResults: { tradesByMode: obj }, lazy: true });
    // active key present in tradesByMode (everything else empty)
    const a = resolveRunDisplayUniverse({ ...byMode({ te25_d40: rows(6, "m") }), tradesByVariant: {}, primaryVariant: "te25_d40" }, "te25_d40");
    ok(a.source === "entry_mode_active" && a.trades.length === 6, "tradesByMode[active] resolves");
    // primary key fallback
    const b = resolveRunDisplayUniverse(byMode({ te25_d40: rows(7, "m") }), null);
    // no primary/active match → best populated
    ok(b.source === "entry_mode_fallback" && b.trades.length === 7, "tradesByMode best populated resolves");
    // prefers a key prefixed by the active variant, else the largest
    const c = resolveRunDisplayUniverse(byMode({ single_position__te25_d40: rows(8, "x"), allow_multi__pen50: rows(2, "y") }), "single_position");
    ok(c.source === "entry_mode_fallback" && c.variantKey === "single_position__te25_d40" && c.trades.length === 8, "prefers active-variant-prefixed mode key");
    const d = resolveRunDisplayUniverse(byMode({ a__x: rows(3, "a"), b__y: rows(9, "b") }), "zzz");
    ok(d.trades.length === 9, "no prefix match → largest populated mode");
    // tradesByVariant rows still take precedence over tradesByMode
    const e = resolveRunDisplayUniverse({ tradesByVariant: { single_position: rows(2, "v") }, entryResults: { tradesByMode: { single_position: rows(10, "m") } }, primaryVariant: "single_position" }, "single_position");
    ok(e.source === "active_variant" && e.trades.length === 2, "resident tradesByVariant beats tradesByMode");
}

// 3. empty + needsHydration ────────────────────────────────────────────────────
console.log("\n[3] empty / needsHydration");
{
    const lazyEmpty = resolveRunDisplayUniverse({ lazy: true, tradesByVariant: {}, entryResults: { tradesByMode: {} } }, null);
    ok(lazyEmpty.trades.length === 0 && lazyEmpty.source === "empty" && lazyEmpty.needsHydration === true && lazyEmpty.reason === "needs_hydration", "lazy + no rows → needsHydration true");
    const reloadEmpty = resolveRunDisplayUniverse({ lazy: false, reloadAvailable: true, trades: [] }, null);
    ok(reloadEmpty.needsHydration === true, "index-only + reloadAvailable + no rows → needsHydration true");
    const eagerEmpty = resolveRunDisplayUniverse({ lazy: false, reloadAvailable: false, trades: [] }, null);
    ok(eagerEmpty.needsHydration === false && eagerEmpty.reason === "no_trades", "eager + no rows + no reload → needsHydration false");
    ok(resolveRunDisplayUniverse(null).trades.length === 0 && resolveRunDisplayUniverse(undefined).source === "empty", "null/undefined safe");
    // populated rows are never flagged needsHydration
    ok(resolveRunDisplayUniverse({ trades: rows(1, "t"), lazy: true }, null).needsHydration === false, "resident rows → needsHydration false even if lazy");
}

// 4. no mutation ───────────────────────────────────────────────────────────────
console.log("\n[4] no mutation");
{
    const bundle = { tradesByVariant: { v: rows(2, "v") }, entryResults: { tradesByMode: { m: rows(3, "m") } }, trades: rows(1, "t"), primaryVariant: "v", lazy: true };
    const snap = JSON.stringify(bundle);
    resolveRunDisplayUniverse(bundle, "v"); resolveRunDisplayUniverse(bundle, "m"); resolveRunDisplayUniverse(bundle, null);
    ok(JSON.stringify(bundle) === snap, "resolveRunDisplayUniverse does not mutate input bundle");
    // returns a reference to the resident array (no copy) but never writes it
    const r = resolveRunDisplayUniverse(bundle, "v");
    ok(r.trades === bundle.tradesByVariant.v, "returns the resident array by reference (read-only)");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
