// Validation for modelFamily.js (MODEL-FAMILY-COMPARISON-2B, Commit 1).
//
// Confirms, without a test framework, that the single-run all-family adapter:
//   1.  Dedups the importer entry-model dual-key structure (no duplicate rows).
//   2.  Resolves the baseline collision (primary wins; entry baseline promoted only
//       when the primary has no performance trades).
//   3.  Builds protection variants with real labels (NOT "unknown_model").
//   4.  Builds directional variants (scenarioMeta label + storageKey fallback).
//   5.  Builds FFT control variants (syntheticCurve; Max DD from a rebuilt curve).
//   6.  Handles an empty bundle (no rows, families.present=false, no throw).
//   7.  Does not mutate its input bundle.
//   8.  Orders deterministically.
//   9.  Computes Profit Factor correctly (gross/gross; null when no losses).
//   10. Maps confidence levels (tiny sample → Very Low; large sample → not Very Low).
//   11. Emits comparability warnings (synthetic curve, low sample, mixed exec mode).
//   12. PARITY: entry-model rows equal buildVariantRows() for the shared metrics —
//       locks against canonicalEntryKey / metric drift.
//
// Run from the frontend/ directory (Node ≥ 22 ESM):
//   node src/data/__validation__/modelFamily.validate.mjs

import {
    MODEL_FAMILIES,
    collectModelVariants,
    buildModelFamilyComparison,
    evaluateComparability,
} from "../modelFamily.js";
import { buildVariantRows } from "../enabledVariantBreakdown.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, e = 1e-9) =>
    (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e);

// Trade factory — outcome + r, mirrors the enabledVariantBreakdown fixtures.
const T = (outcome, r) => ({ fill_time: "2026-01-01T08:00:00Z", outcome, r });
// Cumulative-R curve point list from raw r values.
const curve = (...rs) => { let c = 0; return rs.map((r, i) => ({ i, netR: Number((c += r).toFixed(2)) })); };

// ── Shared entry-model maps (used by both the bundle and the parity check) ───────
const teC2 = [T("Win", 2), T("Win", 2), T("Loss", -1), T("Breakeven", 0)]; // n4 wr2/3 net+3 avg+0.75
const teC0 = [T("Win", 1)];
const entryBaselineTrades = [T("Win", 1), T("Loss", -1)];                   // net 0 (collision loser in MAIN)
const entryUnfilledOnly = [{ outcome: "Unfilled" }, { outcome: "Unfilled" }]; // dropped

const ENTRY_TRADES_BY_MODE = {
    "entry_triggered_edge_25p0_d2":                 teC2,
    "single_position__entry_triggered_edge_25p0_d2": teC2,  // dual-key duplicate (same array)
    "entry_triggered_edge_25p0_same":               teC0,
    "single_position__entry_baseline":              entryBaselineTrades, // real importer baseline key
    "entry_unfilled_only":                          entryUnfilledOnly,
};
const ENTRY_CURVES_BY_MODE = {
    "entry_triggered_edge_25p0_d2": curve(2, 2, -1, 0), // peak 4 → 3 ⇒ maxDd -1
};

// ── Big protection variant (for confidence-level test) ──────────────────────────
const protTrades = [];
for (let i = 0; i < 30; i += 1) protTrades.push(T("Win", 1));
for (let i = 0; i < 20; i += 1) protTrades.push(T("Loss", -1)); // decided 50, wr .6, PF 1.5

// ── MAIN bundle ─────────────────────────────────────────────────────────────────
const MAIN = {
    primaryVariant: "single_position",
    trades: [T("Win", 3), T("Loss", -1), T("Win", 2)],   // baseline/primary: net4 wr2/3 PF5 maxDd-1
    equityCurve: curve(3, -1, 2),                         // 3,2,4 ⇒ peak3→2 ⇒ maxDd -1
    summary: { symbol: "EURUSD", detectionTf: "15m", dateRange: "2026-01 → 2026-03", rr: 2, stopBuffer: 1, executionMode: "single_position" },
    entryResults: { tradesByMode: ENTRY_TRADES_BY_MODE, equityCurveByMode: ENTRY_CURVES_BY_MODE },
    protectionResults: {
        tradesByMode: { "breakeven_after_1r": protTrades },
        equityCurveByMode: { "breakeven_after_1r": curve(5, 5, -7) }, // 5,10,3 ⇒ maxDd -7
    },
    directionalResults: {
        tradesByScenario: {
            "single_position__long_bull_short_bear": [T("Win", 2), T("Loss", -1)],
            "xmode__alpha_beta": [T("Win", 1), T("Loss", -1)], // NO meta → storageKey fallback
        },
        equityCurveByScenario: {}, // empty → synthetic rebuild
        scenarioMeta: {
            "single_position__long_bull_short_bear": { scenarioId: "long_bull_short_bear", executionMode: "single_position" },
        },
    },
    controlTradesByScenario: {
        "single_position:entry_triggered_edge_25p0_d2": [T("Win", 1), T("Loss", -1), T("Loss", -1)], // PF .5, maxDd -2
    },
};

const snapshotMain = JSON.stringify(MAIN);
const result = buildModelFamilyComparison(MAIN);
const rows = result.rows;
const rowBy = (familyKey, variantKey) => rows.find((r) => r.familyKey === familyKey && r.variantKey === variantKey);

console.log("families present");
{
    const present = Object.fromEntries(result.families.map((f) => [f.familyKey, f.present]));
    for (const f of MODEL_FAMILIES) ok(present[f.key] === true, `family present: ${f.key}`);
    ok(result.families.length === 5, "exactly five families reported");
}

console.log("entry-model dual-key dedup + unfilled drop");
{
    const entryRows = rows.filter((r) => r.familyKey === "entry_model");
    const d2 = entryRows.filter((r) => r.variantKey === "entry_triggered_edge_25p0_d2");
    ok(d2.length === 1, "te_d2 appears exactly once despite the dual-key duplicate");
    ok(d2[0] && d2[0].count === 4 && d2[0].wins === 2 && d2[0].losses === 1, "te_d2 not double-counted (n4 incl. BE, 2W/1L)");
    ok(!entryRows.some((r) => r.variantKey === "entry_unfilled_only"), "unfilled-only variant dropped");
    ok(!entryRows.some((r) => r.variantKey === "baseline"), "baseline is NOT an entry-model row");
    ok(d2[0] && d2[0].label === "TE C2 (+2 Delay)", "te_d2 label resolves via registry");
}

console.log("baseline collision — primary wins in MAIN");
{
    const base = rowBy("baseline", "baseline");
    ok(!!base, "baseline row present");
    ok(base && approx(base.netR, 4), "baseline netR comes from primary (4), not entry baseline (0)");
    ok(base && base.count === 3, "baseline uses primary trades (n3)");
    ok(base && approx(base.maxDdR, -1), "baseline maxDd from primary equityCurve (-1)");
}

console.log("protection variant labels + no unknown_model");
{
    const prot = rowBy("protection", "breakeven_after_1r");
    ok(!!prot, "protection row present");
    ok(prot && prot.label === "Breakeven After 1r", "protection label prettified (not unknown_model)");
    ok(prot && prot.tag === null, "protection tag is null (not an entry-model tag)");
    ok(prot && approx(prot.maxDdR, -7), "protection maxDd from its equityCurveByMode (-7)");
}

console.log("directional variants — meta label + storageKey fallback");
{
    const dlong = rowBy("directional", "single_position__long_bull_short_bear");
    ok(!!dlong, "directional (meta) row present");
    ok(dlong && dlong.label === "Long Bull Short Bear", "directional label via scenarioMeta.scenarioId");
    ok(dlong && dlong.syntheticCurve === true, "directional curve rebuilt (no stored curve) → synthetic");
    ok(dlong && approx(dlong.maxDdR, -1), "directional maxDd from rebuilt curve (-1)");
    const dalpha = rowBy("directional", "xmode__alpha_beta");
    ok(!!dalpha, "directional (fallback) row present");
    ok(dalpha && dalpha.label === "Alpha Beta", "directional label via storageKey fallback regex");
}

console.log("FFT control rows");
{
    const fft = rowBy("fft_control", "single_position:entry_triggered_edge_25p0_d2");
    ok(!!fft, "fft_control row present");
    ok(fft && fft.label === "FFT OFF · entry_triggered_edge_25p0_d2", "fft label = FFT OFF · <scenario>");
    ok(fft && fft.syntheticCurve === true, "fft_control curve is synthetic (rebuilt)");
    ok(fft && approx(fft.maxDdR, -2), "fft_control maxDd from rebuilt curve (-2)");
}

console.log("profit factor correctness");
{
    const base = rowBy("baseline", "baseline");                 // gross 5 / loss 1 = 5
    ok(base && approx(base.profitFactor, 5), "baseline PF = grossProfit/grossLoss = 5");
    const fft = rowBy("fft_control", "single_position:entry_triggered_edge_25p0_d2"); // gross1 / loss2 = .5
    ok(fft && approx(fft.profitFactor, 0.5), "fft_control PF = 0.5");
    const c0 = rowBy("entry_model", "entry_triggered_edge_25p0_same"); // 1 win, 0 loss → null
    ok(c0 && c0.profitFactor === null, "no-loss variant → PF null (∞ display)");
}

console.log("confidence levels");
{
    const base = rowBy("baseline", "baseline");                 // decided 3 < 5 → Very Low
    ok(base && base.confidence.level === "Very Low", "tiny sample (decided 3) → Very Low");
    const prot = rowBy("protection", "breakeven_after_1r");     // decided 50 → not Very Low
    ok(prot && prot.confidence.level !== "Very Low", `large sample (decided 50) → not Very Low (got ${prot && prot.confidence.level})`);
    ok(base && base.confidence.parts && base.confidence.parts.decided === 3, "confidence.parts.decided exposed");
}

console.log("winRate is a fraction in [0,1]");
{
    const base = rowBy("baseline", "baseline");
    ok(base && approx(base.winRate, 2 / 3), "baseline winRate = 2/3 (fraction, not %)");
}

console.log("deterministic ordering");
{
    const second = buildModelFamilyComparison(MAIN);
    const seqA = rows.map((r) => r.rowId).join(",");
    const seqB = second.rows.map((r) => r.rowId).join(",");
    ok(seqA === seqB, "two runs produce identical row ordering");
    // Family order: baseline → entry_model → directional → protection → fft_control.
    const familySeq = rows.map((r) => r.familyKey);
    const firstIdx = (k) => familySeq.indexOf(k);
    ok(firstIdx("baseline") < firstIdx("entry_model"), "baseline before entry_model");
    ok(firstIdx("entry_model") < firstIdx("directional"), "entry_model before directional");
    ok(firstIdx("directional") < firstIdx("protection"), "directional before protection");
    ok(firstIdx("protection") < firstIdx("fft_control"), "protection before fft_control");
    // Within entry_model: C0 (te_same) before C2 (te_d2).
    const entryKeys = rows.filter((r) => r.familyKey === "entry_model").map((r) => r.variantKey);
    ok(entryKeys.indexOf("entry_triggered_edge_25p0_same") < entryKeys.indexOf("entry_triggered_edge_25p0_d2"),
        "entry order C0 before C2 (TAG_ORDER)");
}

console.log("no mutation of input bundle");
ok(JSON.stringify(MAIN) === snapshotMain, "buildModelFamilyComparison did not mutate the bundle");

console.log("comparability warnings (MAIN)");
{
    const codes = result.comparability.warnings.map((w) => w.code);
    ok(result.comparability.comparable === true, "single-run is comparable: true");
    ok(typeof result.comparability.key === "string" && result.comparability.key.includes("EURUSD"),
        "comparability key fingerprints the run (symbol present)");
    ok(codes.includes("SYNTHETIC_CURVE"), "SYNTHETIC_CURVE warning emitted (directional/fft rebuilt curves)");
    ok(codes.includes("LOW_SAMPLE"), "LOW_SAMPLE warning emitted (variants < 10 decided)");
    ok(!codes.includes("MIXED_EXECUTION_MODE"), "no MIXED_EXECUTION_MODE when control mode matches run");
}

console.log("comparability — MIXED_EXECUTION_MODE fires on a mode mismatch");
{
    const mixed = {
        summary: { executionMode: "single_position" },
        controlTradesByScenario: { "other_mode:scn_x": [T("Win", 1), T("Loss", -1)] },
    };
    const rep = evaluateComparability(buildModelFamilyComparison(mixed).rows, mixed);
    ok(rep.warnings.some((w) => w.code === "MIXED_EXECUTION_MODE"), "MIXED_EXECUTION_MODE emitted on prefix mismatch");
}

console.log("baseline collision — entry baseline promoted when primary is empty");
{
    const promote = {
        primaryVariant: "single_position",
        trades: [],
        equityCurve: [],
        entryResults: { tradesByMode: { "single_position__entry_baseline": [T("Win", 1), T("Loss", -1)] } },
    };
    const r = buildModelFamilyComparison(promote);
    const base = r.rows.find((x) => x.familyKey === "baseline");
    ok(!!base, "baseline promoted from entry silo when primary empty");
    ok(base && approx(base.netR, 0), "promoted baseline netR = 0 (1 win, 1 loss)");
    ok(!r.rows.some((x) => x.familyKey === "entry_model" && x.variantKey === "baseline"),
        "promoted baseline is not also an entry-model row");
}

console.log("empty bundle");
{
    const empty = buildModelFamilyComparison({});
    ok(Array.isArray(empty.rows) && empty.rows.length === 0, "empty bundle → no rows");
    ok(empty.families.every((f) => f.present === false && f.variantCount === 0), "all families present:false");
    ok(empty.comparability.comparable === true, "empty bundle still comparable:true (no throw)");
    ok(Array.isArray(collectModelVariants(null)) && collectModelVariants(null).length === 0, "collectModelVariants(null) → []");
}

console.log("PARITY — entry-model rows match buildVariantRows()");
{
    // Same maps the bundle used → the two builders must agree on shared metrics.
    const legacy = buildVariantRows(ENTRY_TRADES_BY_MODE, ENTRY_CURVES_BY_MODE);
    const legacyBy = new Map(legacy.map((r) => [r.key, r]));
    const FIELDS = ["count", "wins", "losses", "winRate", "netR", "avgR", "maxDdR"];
    let checked = 0;
    for (const row of rows.filter((r) => r.familyKey === "entry_model")) {
        const ref = legacyBy.get(row.variantKey);
        ok(!!ref, `buildVariantRows has a matching row for ${row.variantKey}`);
        if (!ref) continue;
        for (const f of FIELDS) {
            const a = row[f]; const b = ref[f];
            const same = (a === b) || approx(a, b) || (a === null && b === null);
            ok(same, `parity ${row.variantKey}.${f}: ${a} === ${b}`);
        }
        checked += 1;
    }
    ok(checked >= 2, `parity covered ≥2 entry-model variants (got ${checked})`);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
