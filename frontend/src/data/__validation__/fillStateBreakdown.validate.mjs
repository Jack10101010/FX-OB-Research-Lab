// Validation for fillStateBreakdown.js (CLASSIFICATION-TAB-V2 Phase 1).
//
// Confirms, without a test framework, that:
//   1. Leaves are mutually exclusive and counted once.
//   2. Parent vacant_at_arm === aae + vacant_no_aae (count AND netR).
//   3. WR excludes breakevens; Avg R includes them.
//   4. Non-performance trades (e.g. Unfilled) are excluded.
//   5. hasInstrumentation is false on an all-unknown set, true otherwise.
//   6. Session breakdown buckets + orders correctly; Outside is conditional.
//   7. Signal cards read the same aggregates; Outside card only when present.
//
// Run from the frontend/ directory (Node ≥ 22 auto-detects ESM in .js sources):
//   node src/data/__validation__/fillStateBreakdown.validate.mjs
//
// Exits non-zero if any assertion fails.

import {
    buildFillStateBreakdown,
    buildSessionBreakdown,
    buildSignalCards,
} from "../fillStateBreakdown.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;

// ── Fixtures ────────────────────────────────────────────────────────────────
// outcome drives classifyTrade: "Win"→WIN, "Loss"→LOSS, "Breakeven"+r≈0+entry→BREAKEVEN.
const T = (over) => ({ fill_time: "2026-01-01T08:00:00Z", ...over });

const trades = [
    // occupied_at_arm: 2 wins (+2,+2), 1 loss (-1)  → n3 wr 2/3 net +3 avg +1
    T({ outcome: "Win",  r: 2, obOccupiedAtArm: true }),
    T({ outcome: "Win",  r: 2, obOccupiedAtArm: true }),
    T({ outcome: "Loss", r: -1, obOccupiedAtArm: true }),
    // aae: 1 win (+3), 1 loss (-1)  → n2 wr 1/2 net +2 avg +1
    T({ outcome: "Win",  r: 3, obOccupiedAtArm: false, armedAfterObExit: true }),
    T({ outcome: "Loss", r: -1, obOccupiedAtArm: false, armedAfterObExit: true }),
    // vacant_no_aae: 1 win (+1), 1 breakeven (0)  → n2 wr 1/1=100% net +1 avg +0.5
    T({ outcome: "Win",      r: 1, obOccupiedAtArm: false, armedAfterObExit: false }),
    T({ outcome: "Breakeven", r: 0, obOccupiedAtArm: false, armedAfterObExit: false }),
    // unknown_at_arm: 1 win (+1)
    T({ outcome: "Win", r: 1 }),
    // excluded — must NOT be counted anywhere
    { outcome: "Unfilled", r: 0, obOccupiedAtArm: false },
];

console.log("buildFillStateBreakdown");
const fb = buildFillStateBreakdown(trades);

ok(fb.occupied_at_arm.count === 3, "occupied count = 3");
ok(approx(fb.occupied_at_arm.winRate, 2 / 3), "occupied WR = 2/3 (BE excluded n/a)");
ok(approx(fb.occupied_at_arm.netR, 3), "occupied netR = +3");
ok(approx(fb.occupied_at_arm.avgR, 1), "occupied avgR = +1");

ok(fb.aae.count === 2 && approx(fb.aae.netR, 2), "aae n2 netR +2");
ok(fb.vacant_no_aae.count === 2, "vacant_no_aae n2");
ok(approx(fb.vacant_no_aae.winRate, 1), "vacant_no_aae WR = 100% (breakeven excluded from denom)");
ok(approx(fb.vacant_no_aae.avgR, 0.5), "vacant_no_aae avgR = +0.5 (breakeven included in denom)");

// Parent = sum of children
ok(fb.vacant_at_arm.count === fb.aae.count + fb.vacant_no_aae.count, "parent count = aae + vacant_no_aae");
ok(approx(fb.vacant_at_arm.netR, fb.aae.netR + fb.vacant_no_aae.netR), "parent netR = children netR");
ok(fb.vacant_at_arm.count === 4 && approx(fb.vacant_at_arm.netR, 3), "parent n4 netR +3");

ok(fb.unknown_at_arm.count === 1, "unknown count = 1");
ok(fb.hasInstrumentation === true, "hasInstrumentation true (occupied/vacant present)");

// Excluded trade not counted anywhere
const total = fb.occupied_at_arm.count + fb.vacant_at_arm.count + fb.unknown_at_arm.count;
ok(total === 8, "Unfilled trade excluded (total performance = 8, not 9)");

console.log("hasInstrumentation guard");
const allUnknown = buildFillStateBreakdown([T({ outcome: "Win", r: 1 }), T({ outcome: "Loss", r: -1 })]);
ok(allUnknown.hasInstrumentation === false, "all-unknown set → hasInstrumentation false");
ok(allUnknown.unknown_at_arm.count === 2, "all-unknown set → unknown count 2");

console.log("buildSessionBreakdown");
const sessTrades = [
    T({ outcome: "Win",  r: 2, fillSession: "New York" }),
    T({ outcome: "Loss", r: -1, fillSession: "New York" }),
    T({ outcome: "Win",  r: 1, fillSession: "London" }),
    T({ outcome: "Loss", r: -1, fillSession: "Outside" }),
    T({ outcome: "Win",  r: 1 }), // no session → Unknown
];
const sess = buildSessionBreakdown(sessTrades);
const sLabels = sess.map((r) => r.session);
ok(sLabels[0] === "New York", "first row is New York (order)");
ok(sLabels.includes("London") && sLabels.includes("Outside"), "London + Outside present");
ok(sLabels[sLabels.length - 1] === "Unknown", "Unknown sorts last");
const ny = sess.find((r) => r.session === "New York");
ok(ny.count === 2 && approx(ny.netR, 1) && approx(ny.winRate, 0.5), "New York n2 net +1 wr 50%");
ok(sess.find((r) => r.session === "Outside").glossaryKey === "session_outside", "Outside glossaryKey wired");

console.log("buildSignalCards");
const cards = buildSignalCards(fb, sess);
const ids = cards.map((c) => c.id);
ok(ids.includes("vacant_at_arm") && ids.includes("aae") && ids.includes("occupied_at_arm"), "core 3 cards present");
ok(cards.find((c) => c.id === "vacant_at_arm").stats === fb.vacant_at_arm, "vacant card reuses same stats object");
const outsideCard = cards.find((c) => c.id === "session_outside");
ok(outsideCard && outsideCard.tone === "danger", "Outside card present + danger (avgR<0)");

const noOutsideCards = buildSignalCards(fb, sess.filter((r) => r.session !== "Outside"));
ok(!noOutsideCards.some((c) => c.id === "session_outside"), "no Outside card when session absent");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
