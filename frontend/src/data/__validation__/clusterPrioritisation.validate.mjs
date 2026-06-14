// Validation for clusterPrioritisation.js (CLUSTER-2B research-triage layer).
//
// Confirms the opportunity score ranks sensibly, RECURRENCE IS EXCLUDED FROM THE SCORE,
// Recurring Themes surface from predicates, label thresholds hold, and nothing overclaims.
//
// Run from frontend/:  node src/data/__validation__/clusterPrioritisation.validate.mjs

import {
    scoreNearMisses,
    SCORE_WEIGHTS,
    INTEREST_LABELS,
    THEME_MIN_COUNT,
} from "../clusterPrioritisation.js";

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); } };
const BANNED = /\b(validated|proven|significant|likely|guaranteed|optimal|confirmed)\b/i;

const nm = (label, predicate, n, lift, confidence, stability, reason = "effect_too_small") =>
    ({ predicate, label, parent: "—", n, rate: 0.7, lift, confidence, stability, reason });

// ── 1. weights sum to 1 and recurrence is absent ───────────────────────────────
console.log("weights");
ok(Math.abs((SCORE_WEIGHTS.lift + SCORE_WEIGHTS.sample + SCORE_WEIGHTS.confidence + SCORE_WEIGHTS.stability) - 1) < 1e-9,
   "score weights sum to 1.0");
ok(SCORE_WEIGHTS.recurrence === undefined, "recurrence is NOT a score weight (excluded by design)");

// ── 2. ranking sense: well-sampled medium-lift beats tiny high-lift fluke ───────
console.log("ranking");
const fluke = nm("FlukeX", [{ dim: "session", label: "Session", value: "X" }], 8, 1.45, "Very Low", "unstable");
const solid = nm("CHoCH", [{ dim: "structure", label: "Structure", value: "CHoCH" }], 80, 1.20, "Medium", "stable");
const r1 = scoreNearMisses([fluke, solid]);
ok(r1.scored[0].label === "CHoCH", "well-sampled medium-lift cohort outranks a tiny high-lift fluke");
ok(r1.scored.find((x) => x.label === "FlukeX").opportunityScore < r1.scored.find((x) => x.label === "CHoCH").opportunityScore,
   "tiny fluke scores below the solid cohort");

// ── 3. label thresholds ────────────────────────────────────────────────────────
console.log("interest labels");
const strong = nm("Strong", [{ dim: "structure", label: "S", value: "CHoCH" }], 120, 1.5, "High", "stable");
const weak = nm("Weak", [{ dim: "session", label: "S", value: "Z" }], 16, 1.02, "Low", "unstable");
const rs = scoreNearMisses([strong, weak]);
ok(rs.scored.find((x) => x.label === "Strong").interest === "high", "high lift + sample + conf + stable → High Interest");
ok(rs.scored.find((x) => x.label === "Weak").interest === "weak", "low everything → Weak Signal");
ok(Object.values(INTEREST_LABELS).every((l) => !BANNED.test(l.label)), "interest labels never overclaim");

// ── 4. RECURRENCE EXCLUDED FROM SCORE (the CLUSTER-2B decision) ─────────────────
console.log("recurrence excluded from score");
// Two cohorts with IDENTICAL stats; one's factor recurs across many cohorts, the
// other's appears once. Their opportunityScore must be identical.
const recurring = [
    nm("A1", [{ dim: "structure", label: "Structure", value: "CHoCH" }], 50, 1.2, "Medium", "stable"),
    nm("A2", [{ dim: "structure", label: "Structure", value: "CHoCH" }, { dim: "direction", label: "Direction", value: "Short" }], 30, 1.2, "Medium", "stable"),
    nm("A3", [{ dim: "structure", label: "Structure", value: "CHoCH" }, { dim: "direction", label: "Direction", value: "Long" }], 30, 1.2, "Medium", "stable"),
    nm("A4", [{ dim: "structure", label: "Structure", value: "CHoCH" }, { dim: "session", label: "Session", value: "NY" }], 30, 1.2, "Medium", "stable"),
    nm("Lonely", [{ dim: "session", label: "Session", value: "Asia" }], 50, 1.2, "Medium", "stable"), // same stats, unique factor
];
const rr = scoreNearMisses(recurring);
const a1Score = rr.scored.find((x) => x.label === "A1").opportunityScore;
const lonelyScore = rr.scored.find((x) => x.label === "Lonely").opportunityScore;
ok(a1Score === lonelyScore, "a heavily-recurring cohort and a unique cohort with identical stats get the SAME score (recurrence ≠ score)");

// ── 5. Recurring Themes surface from predicates ────────────────────────────────
console.log("recurring themes");
const choch = rr.themes.find((t) => t.factor === "CHoCH");
ok(!!choch && choch.count === 4, `CHoCH theme aggregates its 4 appearances (got ${choch?.count})`);
ok(choch.avgN > 0 && choch.avgLift > 0, "theme carries avg lift and avg sample");
ok(rr.themes.every((t) => t.count >= THEME_MIN_COUNT), `themes require ≥ ${THEME_MIN_COUNT} appearances`);
ok(!rr.themes.some((t) => t.factor === "Asia"), "a once-only factor is NOT promoted to a theme");
ok(rr.themes.every((t) => !BANNED.test(t.status)), "theme status descriptors never overclaim");

// ── 6. empty / malformed safety ────────────────────────────────────────────────
console.log("safety");
ok(JSON.stringify(scoreNearMisses([])) === JSON.stringify({ scored: [], themes: [] }), "empty input → empty result");
ok(Array.isArray(scoreNearMisses().scored) && Array.isArray(scoreNearMisses().themes), "no-arg → safe shape");
ok(scoreNearMisses([{ predicate: [], n: 0, lift: 0 }]).scored.length === 1, "degenerate near-miss does not throw");

if (failures) { console.error(`\n${failures} assertion(s) FAILED.`); process.exit(1); }
console.log("\nAll clusterPrioritisation assertions passed.");
