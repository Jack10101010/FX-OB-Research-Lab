// Validation for resolveDisplayTrades.js — the active-trade-variant resolver.
//
// Confirms the resolution order matches RunDetail's variant path and the labels/
// source flags are correct, including the fallback chain and edge cases.
//
// Run from frontend/:  node src/data/__validation__/resolveDisplayTrades.validate.mjs

import { resolveDisplayTrades } from "../resolveDisplayTrades.js";

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); } };

const t = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const bundle = {
    trades: t(99),
    tradesByVariant: { baseline: t(99), "TrigE +2": t(72) },
    primaryVariant: "baseline",
};

console.log("active variant selected");
const a = resolveDisplayTrades(bundle, "TrigE +2");
ok(a.trades.length === 72, "active variant 'TrigE +2' → its trades (72)");
ok(a.selectedVariantKey === "TrigE +2" && a.source === "active_variant", "reports active_variant + key");
ok(a.selectedVariantLabel === "TrigE +2", "label = variant key");

console.log("no active variant → primary");
const b = resolveDisplayTrades(bundle, null);
ok(b.trades.length === 99 && b.selectedVariantKey === "baseline" && b.source === "primary_variant",
   "null active → primary variant 'baseline' (99)");

console.log("active variant absent → primary");
const c = resolveDisplayTrades(bundle, "does_not_exist");
ok(c.source === "primary_variant" && c.selectedVariantKey === "baseline", "unknown active variant falls through to primary");

console.log("no variant map → base trades");
const d = resolveDisplayTrades({ trades: t(40) }, "TrigE +2");
ok(d.trades.length === 40 && d.source === "base_trades" && d.selectedVariantLabel === "Baseline",
   "no tradesByVariant → base runData.trades, label 'Baseline'");

console.log("primary missing from map → base trades");
const e = resolveDisplayTrades({ trades: t(10), tradesByVariant: { other: t(5) }, primaryVariant: "ghost" }, null);
ok(e.source === "base_trades" && e.trades.length === 10, "primary key not in map → base trades");

console.log("empty / malformed safety");
ok(resolveDisplayTrades(null).source === "empty" && resolveDisplayTrades(null).trades.length === 0, "null runData → empty, no throw");
ok(resolveDisplayTrades({}).source === "empty", "no trades + no variants → empty");
ok(Array.isArray(resolveDisplayTrades(undefined, undefined).trades), "undefined args → safe array");

// active variant present but EMPTY array still counts as 'exists' (matches RunDetail
// truthiness on the array reference); surface shows its (empty) state honestly.
console.log("present-but-empty active variant");
const f = resolveDisplayTrades({ trades: t(50), tradesByVariant: { v: [] }, primaryVariant: null }, "v");
ok(f.source === "active_variant" && f.trades.length === 0, "present-but-empty variant is selected (length 0)");

if (failures) { console.error(`\n${failures} assertion(s) FAILED.`); process.exit(1); }
console.log("\nAll resolveDisplayTrades assertions passed.");
