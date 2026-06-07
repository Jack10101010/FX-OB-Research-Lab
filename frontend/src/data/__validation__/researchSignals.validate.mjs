// Validation for researchSignals.js (CLASSIFICATION-TAB-V2 Phase 2).
//
// Confirms, without a test framework, that:
//   1. computeConfidence: hard floor at tiny samples, High at large+stable, monotonic in
//      sample size, and uses the rStdErr (effect-SE) path when provided.
//   2. buildResearchSignals: ranks Vacant as the top positive, surfaces Outside as the top
//      negative, suppresses low-sample flukes, dedups parent/child fill-state signals,
//      caps output, and returns positives/negatives separately with no duplicate ids.
//
// Run from the frontend/ directory (Node ≥ 22 auto-detects ESM in .js sources):
//   node src/data/__validation__/researchSignals.validate.mjs
//
// Exits non-zero if any assertion fails.

import { computeConfidence, buildResearchSignals, CONFIDENCE_LEVELS } from "../researchSignals.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};

// ── computeConfidence ─────────────────────────────────────────────────────────
console.log("computeConfidence");

ok(CONFIDENCE_LEVELS.length === 4, "four confidence levels defined");

const tiny = computeConfidence({ count: 2, wins: 2, losses: 0, avgR: 5 });
ok(tiny.level === "Very Low", "tiny sample (decided<5) → Very Low (hard floor)");

const strong = computeConfidence({ count: 220, wins: 130, losses: 80, avgR: 0.89 });
ok(strong.level === "High", "large + stable → High");

const small = computeConfidence({ count: 20, wins: 12, losses: 8, avgR: 0.5 });
const big = computeConfidence({ count: 200, wins: 120, losses: 80, avgR: 0.5 });
ok(big.score > small.score, "monotonic: more decided → higher score (same proportion)");
ok(big.level === "High" && CONFIDENCE_LEVELS.indexOf(small.level) < CONFIDENCE_LEVELS.indexOf(big.level),
   "n=200 ranks strictly above n=20");

const viaSE = computeConfidence({ count: 50, wins: 25, losses: 25, avgR: 1.0, rStdErr: 0.25 });
ok(viaSE.parts.stabilityScore === 1, "rStdErr path: |avgR|/rStdErr >= zRef → stability 1 (effect-SE)");

// ── buildResearchSignals ──────────────────────────────────────────────────────
console.log("buildResearchSignals");

const fillState = {
    occupied_at_arm: { count: 200, wins: 90,  losses: 100, avgR: 0.08 }, // weak → not a signal
    vacant_at_arm:   { count: 220, wins: 130, losses: 80,  avgR: 0.89 }, // PRIMARY (parent)
    aae:             { count: 150, wins: 85,  losses: 55,  avgR: 0.59 }, // diverges 0.30 → kept
    vacant_no_aae:   { count: 70,  wins: 50,  losses: 18,  avgR: 0.85 }, // close to parent → deduped
    unknown_at_arm:  { count: 300, wins: 140, losses: 150, avgR: 0.00 }, // excluded entirely
};
const sessions = [
    { session: "New York", glossaryKey: "session_new_york", count: 100, wins: 55, losses: 40, avgR: 0.30 },
    { session: "Outside",  glossaryKey: "session_outside",  count: 40,  wins: 5,  losses: 33, avgR: -1.0 }, // top risk
    { session: "FlukeWin", glossaryKey: null,               count: 2,   wins: 2,  losses: 0,  avgR: 5.0 },  // low-sample → suppressed
    { session: "Unknown",  glossaryKey: null,               count: 10,  wins: 5,  losses: 5,  avgR: 0.0 },  // excluded
];
const entryModels = [
    { tag: "te_d3",    count: 80,  wins: 50,  losses: 25,  avgR: 0.40 },
    { tag: "baseline", count: 300, wins: 140, losses: 150, avgR: -0.02 }, // near zero → not a signal
];

const res = buildResearchSignals(fillState, sessions, entryModels);
const posKeys = res.positives.map((s) => s.key);
const negKeys = res.negatives.map((s) => s.key);

ok(res.positives[0].key === "vacant_at_arm", "top positive is OB Vacant At Arm");
ok(posKeys.includes("aae"), "AAE kept as a separate positive (diverges from parent)");
ok(!posKeys.includes("vacant_no_aae"), "Vacant-No-AAE deduped (folded into parent)");
ok(!posKeys.includes("occupied_at_arm"), "Occupied (below effect threshold) not a positive");
ok(res.positives.length <= 3, "positives capped at maxPositive (3)");

ok(res.negatives[0].key === "session_outside", "top negative is Outside session");
ok(!negKeys.includes("entry_model:baseline") && !negKeys.includes("baseline"), "near-zero baseline not a negative");

ok(res.suppressed === 1, "exactly one low-sample finding suppressed (FlukeWin)");
ok(res.evaluated === 9, "evaluated 9 candidates (4 fill + 3 session + 2 model; Unknown/unknown excluded)");

const allIds = [...res.positives, ...res.negatives].map((s) => s.id);
ok(new Set(allIds).size === allIds.length, "no duplicate signal ids across positives + negatives");

ok(Array.isArray(res.positives) && Array.isArray(res.negatives), "positives and negatives returned separately");
ok(res.positives.every((s) => s.polarity === "positive") && res.negatives.every((s) => s.polarity === "negative"),
   "polarity tagged correctly");
ok(res.positives.every((s) => s.confidence && CONFIDENCE_LEVELS.includes(s.confidence.level)),
   "every signal carries a confidence level");

// Empty / degenerate inputs must not throw.
const empty = buildResearchSignals({}, [], []);
ok(empty.positives.length === 0 && empty.negatives.length === 0 && empty.evaluated === 0,
   "empty inputs → empty result, no throw");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
