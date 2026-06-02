// Lightweight parity validation for the Results Basis foundation (Phase RB-1).
//
// NOT a unit-test-framework test — it's a standalone Node script so we can
// confirm, without wiring jest config, that:
//   1. Raw R summarizeTrades() === summarizeTradeSanity() for the metrics that
//      matter (byte/number parity guarantee).
//   2. isSequenceDependent / describeBasis behave.
//   3. summarizeBuckets (raw_r + current_equity contribution/isolated) runs and
//      reconciles (Σ contribution ≈ run net).
//   4. buildCurve runs in both bases.
//
// Run:  node frontend/src/data/__validation__/resultsBasis.validate.mjs
// Node ≥ 22 auto-detects ESM syntax in the imported .js source files.

import { summarizeTradeSanity } from "../tradeClassification.js";
import {
    summarizeTrades,
    summarizeBuckets,
    buildCurve,
    isSequenceDependent,
    describeBasis,
    normalizeBasis,
    toCanonicalBucketRow,
    formatBasisValue,
    bucketDisplaySchema,
} from "../resultsBasis.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 1e-9) =>
    (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps);

// ── Fixtures: a mix of wins/losses/flat + direction, with timestamps so the
// current_equity engine can order them. ───────────────────────────────────────
const trades = [
    { r: 1.8, direction: "long",  outcome: "Win",  structure: "BOS",   entry: "2026-01-01T08:00:00Z" },
    { r: -1,  direction: "short", outcome: "Loss", structure: "CHoCH", entry: "2026-01-02T08:00:00Z" },
    { r: 2.4, direction: "long",  outcome: "Win",  structure: "BOS",   entry: "2026-01-03T08:00:00Z" },
    { r: -1,  direction: "long",  outcome: "Loss", structure: "BOS",   entry: "2026-01-04T08:00:00Z" },
    { r: 0,   direction: "short", outcome: "Breakeven", structure: "CHoCH", entry: "2026-01-05T08:00:00Z" },
    { r: 3.1, direction: "short", outcome: "Win",  structure: "CHoCH", entry: "2026-01-06T08:00:00Z" },
];

console.log("\n[1] Raw R parity: summarizeTrades(raw_r) vs summarizeTradeSanity");
const sanity = summarizeTradeSanity(trades);
const raw = summarizeTrades(trades, { basis: "raw_r" });
for (const key of [
    "total", "wins", "losses", "flats", "performanceTrades",
    "winRate", "netR", "netRPerformance", "profitFactor",
    "expectancy", "maxDrawdownR", "grossWinR", "grossLossR",
    "longCount", "shortCount", "longNetR", "shortNetR",
]) {
    const a = sanity[key];
    const b = raw[key];
    const same = (typeof a === "number" && typeof b === "number") ? approx(a, b) : a === b;
    ok(same, `raw.${key} === sanity.${key} (${a} === ${b})`);
}
ok(raw.basis === "raw_r", "raw.basis === 'raw_r'");
ok(raw.count === sanity.total, `raw.count (${raw.count}) === sanity.total (${sanity.total})`);
ok(raw.sequenceUsed === false, "raw.sequenceUsed === false");

console.log("\n[2] Basis helpers");
ok(isSequenceDependent("raw_r") === false, "isSequenceDependent('raw_r') === false");
ok(isSequenceDependent("current_equity") === true, "isSequenceDependent('current_equity') === true");
ok(normalizeBasis("garbage") === "raw_r", "normalizeBasis('garbage') === 'raw_r'");
ok(describeBasis("raw_r") === "Raw R", "describeBasis('raw_r') === 'Raw R'");
ok(/Current Equity/.test(describeBasis("current_equity", { startingBalance: 10000, riskPct: 1, mode: "current_equity_pct", currency: "USD" })),
    "describeBasis(current_equity) mentions 'Current Equity'");

console.log("\n[3] Current Equity summarizeTrades delegates to accountEquity");
const ceAcct = { mode: "current_equity_pct", startingBalance: 10000, riskPct: 1, currency: "USD" };
const ce = summarizeTrades(trades, { basis: "current_equity", account: ceAcct });
ok(ce.basis === "current_equity", "ce.basis === 'current_equity'");
ok(ce.startingBalance === 10000, "ce.startingBalance === 10000");
ok(Number.isFinite(ce.endingBalance), `ce.endingBalance is finite (${ce.endingBalance})`);
ok(Number.isFinite(ce.netAmount), `ce.netAmount is finite (${ce.netAmount})`);
ok(ce.sequenceUsed === true, "ce.sequenceUsed === true (compounding mode)");
// Basis-invariant metrics still present & equal to Raw R view
ok(approx(ce.winRate, sanity.winRate), "ce.winRate === raw winRate (basis-invariant)");
ok(ce.total === sanity.total, "ce.total === raw total (basis-invariant)");

console.log("\n[4] summarizeBuckets — raw_r");
const keyOf = (t) => t.structure || "?";
const rawBuckets = summarizeBuckets(trades, { basis: "raw_r", keyOf });
ok(rawBuckets instanceof Map, "raw buckets returned as a Map");
const bos = rawBuckets.get("BOS");
const choch = rawBuckets.get("CHoCH");
// Reconcile: Σ bucket netR === total netR
const sumBucketNetR = [...rawBuckets.values()].reduce((s, b) => s + b.netR, 0);
ok(approx(sumBucketNetR, sanity.netR), `Σ bucket netR (${sumBucketNetR}) === total netR (${sanity.netR})`);
ok(bos.bucketMode === null && bos.basis === "raw_r", "raw bucket bucketMode null / basis raw_r");

console.log("\n[5] summarizeBuckets — current_equity contribution reconciles to run net");
const contribBuckets = summarizeBuckets(trades, { basis: "current_equity", account: ceAcct, bucketMode: "contribution", keyOf });
const sumContribution = [...contribBuckets.values()].reduce((s, b) => s + (b.contributionAmount || 0), 0);
ok(approx(sumContribution, ce.netAmount, 0.05),
    `Σ contribution (${sumContribution.toFixed(2)}) ≈ run netAmount (${Number(ce.netAmount).toFixed(2)})`);
ok([...contribBuckets.values()].every(b => b.bucketMode === "contribution"), "all contribution buckets tagged");

console.log("\n[6] summarizeBuckets — current_equity isolated runs");
const isoBuckets = summarizeBuckets(trades, { basis: "current_equity", account: ceAcct, bucketMode: "isolated", keyOf });
ok([...isoBuckets.values()].every(b => b.bucketMode === "isolated" && Number.isFinite(b.endingBalance)),
    "isolated buckets each have a finite endingBalance");

console.log("\n[7] buildCurve — both bases");
const rawCurve = buildCurve(trades, { basis: "raw_r" });
const ceCurve = buildCurve(trades, { basis: "current_equity", account: ceAcct });
ok(rawCurve.length === trades.length, `raw curve length ${rawCurve.length} === ${trades.length}`);
ok(approx(rawCurve[rawCurve.length - 1].netR, sanity.netR, 1e-6) || approx(rawCurve[rawCurve.length - 1].cumulativeR, sanity.netR, 1e-6),
    "raw curve final cumulative R === total netR");
ok(ceCurve.length === trades.length && Number.isFinite(ceCurve[ceCurve.length - 1].equityAfter),
    "ce curve produces finite ending equity");

console.log("\n[8] RB-4 canonical helpers");
// toCanonicalBucketRow: canonical WR = wins/(wins+losses); preserves netR/exp/PF
const legacy = { label: "BOS", count: 72, wins: 23, losses: 42, netR: 33.9, expectancy: 0.471, profitFactor: 1.65, ciLo: 0.1, ciHi: 0.8, tradeRefs: [1, 2] };
const canon = toCanonicalBucketRow(legacy, { basis: "raw_r" });
ok(approx(canon.winRate, (23 / (23 + 42)) * 100), `canonical WR = wins/(wins+losses) = ${canon.winRate.toFixed(2)}%`);
ok(canon.netR === 33.9 && canon.expectancy === 0.471 && canon.profitFactor === 1.65, "netR/expectancy/PF preserved unchanged");
ok(canon.count === 72 && canon.rows === 72 && canon.wins === 23 && canon.losses === 42, "counts preserved (rows/count/wins/losses)");
ok(Array.isArray(canon.tradeRefs) && canon.tradeRefs.length === 2, "tradeRefs passed through for drill");
ok(canon.flats === Math.max(0, 72 - 23 - 42), `flats derived = ${canon.flats}`);
// formatBasisValue: Pure R renders money as R; real account renders $
ok(formatBasisValue("current_equity", { mode: "r_only", currency: "USD" }, 33.9, { kind: "money" }) === "+33.9R", "money + r_only → R");
ok(/\$/.test(formatBasisValue("current_equity", { mode: "current_equity_pct", startingBalance: 10000, riskPct: 1, currency: "USD" }, 3921.58, { kind: "money" })), "money + current_equity_pct → $");
ok(formatBasisValue("raw_r", null, 1.8, { kind: "r" }) === "+1.8R", "r kind → R");
ok(formatBasisValue("raw_r", null, 60, { kind: "pct" }) === "60.0%", "pct kind → %");
// bucketDisplaySchema: distinct column sets per basis
const rawSchema = bucketDisplaySchema("raw_r");
const ceSchema = bucketDisplaySchema("current_equity");
ok(rawSchema.some((c) => c.key === "netR") && rawSchema.some((c) => c.key === "profitFactor"), "raw schema has Net R + PF");
ok(ceSchema.some((c) => c.key === "contributionAmount") && !ceSchema.some((c) => c.key === "profitFactor"), "CE schema has Contribution, no PF column");
ok(rawSchema.find((c) => c.key === "winRate")?.invariant === true && ceSchema.find((c) => c.key === "winRate")?.invariant === true, "WR flagged invariant in both schemas");

console.log("\n[9] RB-8a summary + identity helpers");
const { toCanonicalSummaryRow, accountConfigHash, comparisonCellKey } = await import("../resultsBasis.js");
// trades-list summary → canonical WR
const ts = toCanonicalSummaryRow(trades, { basis: "raw_r", label: "Baseline" });
ok(ts.label === "Baseline" && ts.source === "trades", "summary(trades) label + source");
ok(ts.winRate === sanity.winRate && ts.winRateSource === "canonical", "summary(trades) WR === canonical sanity WR");
ok(ts.netR === sanity.netRPerformance, "summary(trades) netR === performance net");
// backend object summary → canonical WR recomputed from wins/losses
const be = toCanonicalSummaryRow({ mode: "entry_triggered_edge_25p0", wins: 23, losses: 42, net_r: 33.9, pf: 1.81, win_rate: 31.9 }, { basis: "raw_r" });
ok(Math.abs(be.winRate - (23 / 65) * 100) < 1e-9 && be.winRateSource === "canonical", `backend summary WR recomputed canonically (${be.winRate.toFixed(1)}%, ignores backend 31.9)`);
ok(be.netR === 33.9 && be.profitFactor === 1.81, "backend summary netR/PF read via fallbacks");
const noWL = toCanonicalSummaryRow({ mode: "x", win_rate: 44.4, trades: 10 }, { basis: "raw_r" });
ok(noWL.winRate === 44.4 && noWL.winRateSource === "backend", "backend WR fallback when wins/losses absent (flagged 'backend')");
// accountConfigHash: deterministic, mode-aware, order-independent
ok(accountConfigHash({ mode: "r_only", startingBalance: 999 }) === "r_only", "r_only hash ignores balance");
ok(accountConfigHash({ mode: "current_equity_pct", startingBalance: 10000, riskPct: 1, currency: "USD" })
   === accountConfigHash({ currency: "USD", riskPct: 1, startingBalance: 10000, mode: "current_equity_pct" }), "hash is key-order independent");
ok(accountConfigHash(null) === "r_only", "hash(null) → safe default");
ok(accountConfigHash({ mode: "current_equity_pct", startingBalance: 10000, riskPct: 1 })
   !== accountConfigHash({ mode: "current_equity_pct", startingBalance: 25000, riskPct: 1 }), "different balance → different hash");
// comparisonCellKey
const cell = comparisonCellKey({ runId: "R1", universeKey: "baseline", basis: "current_equity", accountSettings: { mode: "current_equity_pct", startingBalance: 10000, riskPct: 1 } });
ok(cell === "R1::baseline::current_equity::current_equity_pct|10000|1|USD", `cell key well-formed (${cell})`);

console.log("\n[10] RB-8a drill contract");
const { createDrillPayload, normalizeDrillPayload, EMPTY_DRILL_PAYLOAD, isDrillable } = await import("../drillContract.js");
const dp = createDrillPayload({ runId: "R1", sourceKey: "entry_triggered_edge_25p0", basis: "current_equity", account: { mode: "current_equity_pct", startingBalance: 10000, riskPct: 1 }, bucketKey: "BOS", tradeRefs: [1, 2, 3] });
ok(dp.universeKey === "entry_triggered_edge_25p0" && dp.basis === "current_equity" && dp.tradeRefs.length === 3, "createDrillPayload maps sourceKey→universeKey, normalizes basis, keeps tradeRefs");
ok(isDrillable(dp) === true && isDrillable(EMPTY_DRILL_PAYLOAD) === false, "isDrillable reflects tradeRefs presence");
ok(normalizeDrillPayload(null).tradeRefs.length === 0 && normalizeDrillPayload(null).basis === "raw_r", "normalizeDrillPayload(null) → safe empty");

console.log("\n[11] RB-8a compare guard");
const { evaluateCompare } = await import("../useCompareGuard.js");
const g1 = evaluateCompare({ basis: "raw_r" }, { basis: "current_equity" });
ok(g1.canCompare === false && g1.warnings[0].code === "MISMATCHED_BASIS", "mismatched basis → cannot compare");
const acct = { mode: "current_equity_pct", startingBalance: 10000, riskPct: 1, currency: "USD" };
const g2 = evaluateCompare({ basis: "current_equity", accountSettings: acct }, { basis: "current_equity", accountSettings: acct });
ok(g2.canCompare === true && g2.suppressions.length === 0 && g2.warnings.some(w => w.code === "SEQUENCE_DEPENDENT"), "CE same config → compare ok, sequence caveat");
const g3 = evaluateCompare({ basis: "current_equity", accountSettings: acct }, { basis: "current_equity", accountSettings: { ...acct, riskPct: 2 } });
ok(g3.suppressions.includes("currency") && g3.warnings.some(w => w.code === "CONFIG_DIFFERS"), "CE differing config → suppress currency deltas");
const g4 = evaluateCompare({ basis: "current_equity", accountSettings: acct }, { basis: "current_equity", accountSettings: { ...acct, startingBalance: 25000 } });
ok(g4.suppressions.includes("currency_absolute"), "CE balance-only diff → suppress absolute currency (% allowed)");
const g5 = evaluateCompare({ basis: "raw_r", summary: { profitFactor: Infinity } }, { basis: "raw_r", summary: { profitFactor: 1.5 } });
ok(g5.suppressions.includes("profitFactor"), "PF ∞ on a side → suppress Δ PF");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✓" : `${failures} CHECK(S) FAILED ✗`}\n`);
process.exit(failures === 0 ? 0 : 1);
