// Lightweight validation for the Phase 2 glossary keys (Research Signals + Confidence).
//
// Confirms that:
//   1. research_signals / effect / confidence resolve to complete entries.
//   2. EVERY confidence level in researchSignals.CONFIDENCE_LEVELS has a matching
//      `confidence_<slug>` glossary entry — so ConfidenceChip tooltips always resolve.
//   3. Unknown keys return null (graceful degrade).
//
// Run from the frontend/ directory (Node ≥ 22 ESM):
//   node src/data/__validation__/researchGlossary.validate.mjs

import { getGlossary } from "../researchGlossary.js";
import { CONFIDENCE_LEVELS } from "../researchSignals.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const complete = (g) => !!(g && g.friendlyName && g.definition && g.whyItMatters);
const slug = (level) => `confidence_${String(level).toLowerCase().replace(/\s+/g, "_")}`;

console.log("Phase 2 glossary keys");
for (const k of ["research_signals", "effect", "confidence"]) {
    ok(complete(getGlossary(k)), `getGlossary("${k}") complete`);
}

console.log("confidence level coverage (matches researchSignals.CONFIDENCE_LEVELS)");
for (const level of CONFIDENCE_LEVELS) {
    const key = slug(level);
    ok(complete(getGlossary(key)), `level "${level}" → getGlossary("${key}") complete`);
}

ok(getGlossary("not_a_real_key") === null, "unknown key → null");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
