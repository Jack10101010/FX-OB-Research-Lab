// Validation for the Protection Lab integrity prerequisites (Restructure Plan
// Steps 1–2): the honest data-quality coverage fix and the data-derived
// confidence layer. Pure module, no React — safe to import directly.
//
// Run from the frontend/ directory (Node ≥ 22 ESM):
//   node src/data/__validation__/protectionConfidence.validate.mjs

import {
    buildDataQuality,
    buildProtectionConfidence,
    classifyConfidence,
} from "../../components/lab/protection/protectionAnalytics.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};

// ── 1. Honest data-quality coverage ──────────────────────────────────────────
console.log("data-quality coverage (honest presence counting)");
const dqTrades = [
    { max_ob_penetration_pct: 55,    ob_fully_breached: true,  direction: "long" },
    { max_ob_penetration_pct: "abc", ob_fully_breached: false, direction: ""     }, // junk number, empty string
    { /* all missing */ },
];
const dq = buildDataQuality(dqTrades);
const fieldOf = (k) => dq.fields.find((f) => f.key === k);
ok(fieldOf("max_ob_penetration_pct").present === 1,
    `numeric field counts only finite numbers (got ${fieldOf("max_ob_penetration_pct").present}, expected 1)`);
ok(fieldOf("ob_fully_breached").present === 2,
    `bool field counts true/false (got ${fieldOf("ob_fully_breached").present}, expected 2)`);
ok(fieldOf("direction").present === 1,
    `string field counts non-empty only (got ${fieldOf("direction").present}, expected 1)`);

// ── 2. classifyConfidence (pure 3-state) ─────────────────────────────────────
console.log("classifyConfidence");
ok(classifyConfidence({ hasExact: true,  estimateAvailable: false }) === "exact",        "hasExact → exact");
ok(classifyConfidence({ hasExact: false, estimateAvailable: true  }) === "estimate",     "estimate available → estimate");
ok(classifyConfidence({ hasExact: false, estimateAvailable: false }) === "insufficient", "neither → insufficient");

// ── 3. buildProtectionConfidence ─────────────────────────────────────────────
console.log("buildProtectionConfidence");

// Exact: an exporter-backed (non-baseline) row exists.
const exactCase = buildProtectionConfidence({
    exactRows: [{ mode: "baseline", isBaseline: true }, { mode: "trades__break_even", isBaseline: false }],
    dataQuality: null,
});
ok(exactCase.pageBasis === "exact", "exact row → pageBasis exact");
ok(exactCase.exactModes.length === 1, "baseline excluded from exact modes");
ok(exactCase.exactModes[0].basis === "exact", "exact mode basis is exact");

// Estimate-only: no exact rows, but required fields are present.
const estimateCase = buildProtectionConfidence({
    exactRows: [],
    dataQuality: { fields: [
        { key: "ob_fully_breached", present: 5 },
        { key: "max_ob_penetration_pct", present: 5 },
    ] },
});
ok(estimateCase.pageBasis === "estimate", "no exact + fields present → pageBasis estimate");
ok(estimateCase.estimates.every((e) => e.basis === "estimate"), "all estimate approaches classify as estimate");
ok(estimateCase.exactModes.length === 0, "no exact modes in estimate case");

// Insufficient: no exact rows, required fields absent.
const insufficientCase = buildProtectionConfidence({
    exactRows: [],
    dataQuality: { fields: [
        { key: "ob_fully_breached", present: 0 },
        { key: "max_ob_penetration_pct", present: 0 },
    ] },
});
ok(insufficientCase.pageBasis === "insufficient", "no exact + no fields → pageBasis insufficient");
ok(insufficientCase.estimates.every((e) => e.basis === "insufficient"), "all estimate approaches classify as insufficient");
ok(insufficientCase.estimates.every((e) => e.missing.length > 0), "insufficient estimates report missing fields");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
