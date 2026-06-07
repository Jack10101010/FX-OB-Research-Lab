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

// ── Hardening: partial nested config override (deep merge) ──────────────────────
console.log("partial nested config override");

// Shallow-merging `{ weights: { sample } }` over defaults would drop
// `weights.stability` and yield a NaN score. Deep merge must preserve it.
const partialConf = computeConfidence(
    { count: 200, wins: 120, losses: 80, avgR: 0.5 },
    { weights: { sample: 0.7 } },          // omit weights.stability on purpose
);
ok(Number.isFinite(partialConf.score) && !Number.isNaN(partialConf.score),
   "computeConfidence: partial nested {weights:{sample}} → finite score (no NaN)");

const partialBuild = buildResearchSignals(
    fillState, sessions, entryModels,
    { levelWeight: { High: 0.9 } },        // omit other levelWeight keys on purpose
);
ok([...partialBuild.positives, ...partialBuild.negatives].every((s) => Number.isFinite(s.rankScore)),
   "buildResearchSignals: partial nested {levelWeight:{High}} → all rankScores finite");
ok(partialBuild.positives[0]?.key === "vacant_at_arm",
   "partial-config build still ranks Vacant top (merge preserved other levels)");

// ── Hardening: negative-side parent/child dedup ────────────────────────────────
console.log("negative parent/child dedup");

const fsNeg = {
    vacant_at_arm: { count: 200, wins: 40, losses: 150, avgR: -0.80 }, // eligible NEGATIVE parent
    vacant_no_aae: { count: 90,  wins: 25, losses: 60,  avgR: -0.70 }, // |Δ|=0.10 < 0.30 → deduped
    aae:           { count: 100, wins: 60, losses: 35,  avgR:  0.50 }, // diverges → kept (positive)
};
const negDedup = buildResearchSignals(fsNeg, [], []);
const negDedupNegKeys = negDedup.negatives.map((s) => s.key);
const negDedupPosKeys = negDedup.positives.map((s) => s.key);
ok(negDedupNegKeys.includes("vacant_at_arm"), "negative parent (Vacant) surfaced as a risk");
ok(!negDedupNegKeys.includes("vacant_no_aae"), "close negative child (Vacant-No-AAE) deduped on the negative side");
ok(negDedupPosKeys.includes("aae"), "diverging child (AAE) still emitted (opposite polarity)");

// ── Hardening: parent ineligible but child eligible → child kept ───────────────
console.log("parent ineligible, child eligible");

const fsParentIneligible = {
    vacant_at_arm: { count: 6,   wins: 4,  losses: 2,  avgR: 0.90 }, // decided 6 < 10 → ineligible
    aae:           { count: 120, wins: 80, losses: 30, avgR: 0.60 }, // eligible
    vacant_no_aae: { count: 90,  wins: 60, losses: 20, avgR: 0.95 }, // close to parent, but parent ineligible → NOT deduped
};
const parentOut = buildResearchSignals(fsParentIneligible, [], []);
const parentOutPosKeys = parentOut.positives.map((s) => s.key);
ok(!parentOutPosKeys.includes("vacant_at_arm"), "ineligible parent (low sample) is suppressed, not emitted");
ok(parentOutPosKeys.includes("aae") && parentOutPosKeys.includes("vacant_no_aae"),
   "both children kept when parent is ineligible (no dedup against an ineligible parent)");
ok(parentOut.suppressed === 1, "ineligible-but-qualified parent counted as suppressed (=1)");

// ── Hardening: maxNegative cap ─────────────────────────────────────────────────
console.log("maxNegative cap");

const fourNegSessions = [
    { session: "S1", glossaryKey: "session_s1", count: 100, wins: 30, losses: 65, avgR: -0.50 },
    { session: "S2", glossaryKey: "session_s2", count: 100, wins: 25, losses: 70, avgR: -0.60 },
    { session: "S3", glossaryKey: "session_s3", count: 100, wins: 20, losses: 75, avgR: -0.70 },
    { session: "S4", glossaryKey: "session_s4", count: 100, wins: 15, losses: 80, avgR: -0.80 },
];
const capped = buildResearchSignals({}, fourNegSessions, []);
const cappedNegKeys = capped.negatives.map((s) => s.key);
ok(capped.negatives.length === 3, "negatives capped at maxNegative (3) when 4 qualify");
ok(!cappedNegKeys.includes("session_s1"), "weakest negative (S1, -0.50) dropped by the cap");
ok(cappedNegKeys.includes("session_s4") && cappedNegKeys.includes("session_s3") && cappedNegKeys.includes("session_s2"),
   "the three strongest negatives are retained");

// ── Hardening: confidence Low / Medium boundaries (deterministic via rStdErr) ──
console.log("confidence Low/Medium boundaries");

// Medium band [0.5, 0.75): decided 200 → sample 0.8333 (*0.6 = 0.5); stab 0.25 (*0.4 = 0.1) → 0.60
const mediumConf = computeConfidence({ count: 210, wins: 120, losses: 80, avgR: 0.5, rStdErr: 1.0 });
ok(mediumConf.level === "Medium", "score ~0.60 → Medium");
// Low band [0.25, 0.5): decided 20 → sample 0.3333 (*0.6 = 0.2); stab 0.25 (*0.4 = 0.1) → 0.30
const lowConf = computeConfidence({ count: 25, wins: 12, losses: 8, avgR: 0.3, rStdErr: 0.6 });
ok(lowConf.level === "Low", "score ~0.30 → Low");
ok(CONFIDENCE_LEVELS.indexOf(lowConf.level) < CONFIDENCE_LEVELS.indexOf(mediumConf.level),
   "Low ranks strictly below Medium");

// ── Hardening: partial rStdErr path (stability strictly between 0 and 1) ───────
console.log("partial rStdErr path");

const partialSE = computeConfidence({ count: 50, wins: 25, losses: 25, avgR: 0.5, rStdErr: 1.0 });
ok(partialSE.parts.stabilityScore > 0 && partialSE.parts.stabilityScore < 1,
   "rStdErr path yields a partial stability (0 < s < 1)");
ok(Math.abs(partialSE.parts.stabilityScore - 0.25) < 1e-9,
   "rStdErr path: (|avgR|/rStdErr)/zRef = (0.5/1.0)/2 = 0.25");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
