// selectiveBeUniverse.validate.mjs — pure selective-BE universe builder.
//
// BE-SELECTIVE-APPLICATION P1. Verifies cohort matching, BE/original swap,
// ordering, no duplicates, delta math, classification counts, and safe fallbacks.
//
// Run from frontend/:  node src/data/__validation__/selectiveBeUniverse.validate.mjs

import babel from "@babel/core";
import fs    from "fs";

function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { buildSelectiveBeUniverse, matchesCohort, stableTradeId, cohortBreakdown } = loadCjs("src/data/selectiveBeUniverse.js");

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 0.001) => Math.abs(Number(a) - Number(b)) <= eps;

// ── Fixtures ─────────────────────────────────────────────────────────────────
// 4 originals across cohorts. BE result is 0R for each (BE-stopped), so for a
// loser BE improves R (loss saved), for a winner BE reduces it (winner cut).
const orig = (id, direction, structure, session, r) => ({ id, direction, structure, session, net_r: r });
const be = (id, r) => ({ id, net_r: r, be_triggered: true, be_exit_reason: "be_stop" });

const originalTrades = [
    orig("A", "Long",  "CHoCH", "London",   -2),   // CHoCH long loser
    orig("B", "Short", "BOS",   "New York",  3),   // BOS short winner
    orig("C", "Long",  "BOS",   "Asia",     -1),   // BOS long loser
    orig("D", "Short", "CHoCH", "London",    1),   // CHoCH short winner
];
const beTrades = [be("A", 0), be("B", 0), be("C", 0), be("D", 0)];
const scenario = { beScenarioKey: "be_wick_0p50R" };
const build = (filters) => buildSelectiveBeUniverse({ originalTrades, beTrades, filters, scenario });
const rOf = (u, id) => u.trades.find((t) => t.id === id);

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  apply BE to all (all directions selected)");
const all = build({ directions: ["Long", "Short"] }); // every trade is long or short → all 4
ok(all.applied === 4, "all 4 applied");
ok(all.trades.every((t) => t.protectionApplied), "every output row protectionApplied");
ok(approx(all.summary.originalNetR, -2 + 3 - 1 + 1), "originalNetR = +1");
ok(approx(all.summary.protectedNetR, 0), "protectedNetR = 0 (all BE 0R)");
ok(approx(all.summary.deltaNetR, -1), "deltaNetR = −1");
ok(all.summary.lossesSaved === 2 && all.summary.winnersCut === 2, "2 saved, 2 cut");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  CHoCH only");
const choch = build({ structures: ["CHoCH"] });
ok(choch.applied === 2 && choch.matched === 2, "2 CHoCH trades applied/matched");
ok(rOf(choch, "A").protectionApplied && rOf(choch, "D").protectionApplied, "A,D protected");
ok(!rOf(choch, "B").protectionApplied && !rOf(choch, "C").protectionApplied, "B,C original");
// protected = A:0 D:0 ; original B:3 C:-1 → net 2 ; original net +1 → delta +1
ok(approx(choch.summary.protectedNetR, 2) && approx(choch.summary.deltaNetR, 1), "CHoCH protected net +2, delta +1");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  BOS only");
const bos = build({ structures: ["BOS"] });
ok(bos.applied === 2, "2 BOS applied");
ok(rOf(bos, "B").protectionApplied && rOf(bos, "C").protectionApplied, "B,C protected");
ok(!rOf(bos, "A").protectionApplied, "A original");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  Long only");
const lng = build({ directions: ["Long"] });
ok(lng.applied === 2 && rOf(lng, "A").protectionApplied && rOf(lng, "C").protectionApplied, "A,C (longs) protected");
ok(!rOf(lng, "B").protectionApplied && !rOf(lng, "D").protectionApplied, "shorts original");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  Short only");
const sht = build({ directions: ["Short"] });
ok(sht.applied === 2 && rOf(sht, "B").protectionApplied && rOf(sht, "D").protectionApplied, "B,D (shorts) protected");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  Long + CHoCH (AND across dimensions)");
const lc = build({ directions: ["Long"], structures: ["CHoCH"] });
ok(lc.applied === 1 && rOf(lc, "A").protectionApplied, "only A (long+choch) protected");
ok(!rOf(lc, "C").protectionApplied && !rOf(lc, "D").protectionApplied, "C (long+bos) and D (short+choch) original");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  Session filter");
const ldn = build({ sessions: ["London"] });
ok(ldn.applied === 2 && rOf(ldn, "A").protectionApplied && rOf(ldn, "D").protectionApplied, "London trades A,D protected");
ok(!rOf(ldn, "B").protectionApplied, "New York B original");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§8  unmatched BE row keeps original");
const beMissingC = [be("A", 0), be("B", 0), be("D", 0)]; // no BE for C
const miss = buildSelectiveBeUniverse({ originalTrades, beTrades: beMissingC, filters: { directions: ["Long"] }, scenario });
ok(rOf(miss, "C").protectionApplied === false, "C (matched, no BE) kept original");
ok(rOf(miss, "C").net_r === -1, "C retains original R");
ok(miss.skippedMissingBe === 1 && miss.warnings.includes("unmatched_be"), "skippedMissingBe + warning");
ok(miss.applied === 1, "only A applied (C skipped)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§9  no duplicate trades + §10 ordering preserved");
ok(all.trades.length === 4, "output length == input length (no dupes)");
ok(new Set(all.trades.map((t) => t.id)).size === 4, "unique ids");
ok(all.trades.map((t) => t.id).join(",") === "A,B,C,D", "original order preserved");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§11  delta math + §12 metadata");
ok(rOf(all, "A").deltaR === 2 && rOf(all, "A").originalR === -2 && rOf(all, "A").protectedR === 0, "A delta +2 (−2→0)");
ok(rOf(all, "B").deltaR === -3, "B delta −3 (3→0)");
ok(rOf(all, "A").protectionScenarioKey === "be_wick_0p50R", "scenario key on protected row");
ok(rOf(choch, "B").deltaR === 0 && rOf(choch, "B").protectionType === null, "unprotected row delta 0, type null");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§13  NO chips selected = apply to NONE  ·  §14 empty input safe");
const none = build({ directions: [], structures: [], sessions: [] });
ok(none.applied === 0 && none.matched === 0, "no chips → 0 applied / 0 matched");
ok(none.isNoFilterSelected === true && none.selectedFilterLabel === "None", "isNoFilterSelected + label None");
ok(approx(none.summary.deltaNetR, 0), "no chips → deltaNetR 0");
ok(none.trades.every((t) => t.protectionApplied === false), "no chips → selective == original (no rows protected)");
ok(none.trades.map((t) => t.id).join(",") === "A,B,C,D", "no chips → trades unchanged + ordered");
const empty = buildSelectiveBeUniverse({ originalTrades: [], beTrades: [], filters: {}, scenario: {} });
ok(empty.trades.length === 0 && empty.applied === 0, "empty input → empty output");
ok(matchesCohort(originalTrades[0], {}) === false, "matchesCohort empty filters → false (apply to none)");
ok(matchesCohort(originalTrades[0], { directions: ["Long"] }) === true, "matchesCohort with a selection → applies");
ok(stableTradeId({ trade_id: "X-1" }) === "X-1", "stableTradeId by trade_id");

// low-sample warning
const lowOrig = [orig("Z", "Long", "CHoCH", "London", -1)];
const low = buildSelectiveBeUniverse({ originalTrades: lowOrig, beTrades: [be("Z", 0)], filters: { structures: ["CHoCH"] }, scenario });
ok(low.summary.lowSample === true && low.warnings.includes("low_sample"), "low_sample flagged under threshold");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§15  filtered cohort sets + breakdowns (UX-REFINE-2)");
const u = build({ structures: ["CHoCH"] });
// CHoCH cohort = A,D (order preserved from originals A,B,C,D → A,D).
ok(u.filteredOriginalTrades.map((t) => t.id).join(",") === "A,D", "filteredOriginalTrades = matched cohort in order");
ok(u.filteredOriginalTrades.every((t) => t.protectionApplied === undefined), "filteredOriginalTrades are raw originals (no protection meta)");
ok(u.filteredProtectedTrades.map((t) => t.id).join(",") === "A,D", "filteredProtectedTrades = same cohort, in order");
ok(u.filteredProtectedTrades.every((t) => t.protectionApplied === true), "filteredProtectedTrades carry BE result");
// Net R: original CHoCH cohort A(-2)+D(1) = -1 ; protected A(0)+D(0) = 0.
const sumR = (list) => list.reduce((s, t) => s + (Number(t.net_r ?? t.r ?? 0)), 0);
ok(sumR(u.filteredOriginalTrades) === -1, "filtered original cohort Net R = −1");
ok(sumR(u.filteredProtectedTrades) === 0, "filtered protected cohort Net R = 0");

console.log("\n§16  cohortBreakdown composition counts");
const fb = u.meta.fullBreakdown;
ok(fb.total === 4 && fb.longs === 2 && fb.shorts === 2 && fb.choch === 2 && fb.bos === 2, "fullBreakdown: 4 total, 2L/2S, 2CHoCH/2BOS");
const flb = u.meta.filteredBreakdown;
ok(flb.total === 2 && flb.choch === 2 && flb.bos === 0, "filteredBreakdown (CHoCH): 2 CHoCH, 0 BOS");
ok(flb.longs === 1 && flb.shorts === 1, "filteredBreakdown: A long, D short");
const cb = cohortBreakdown([orig("X", "Long", "BOS", "London", 1), orig("Y", "Long", "CHoCH", "London", 1)]);
ok(cb.longs === 2 && cb.choch === 1 && cb.bos === 1 && cb.sessions.London === 2, "cohortBreakdown standalone + session counts");

console.log("\n§17  no-filter → empty cohort; all-selected → full cohort");
const uNone = build({});
ok(uNone.filteredOriginalTrades.length === 0 && uNone.meta.filteredBreakdown.total === 0, "no filter → empty filtered cohort");
ok(uNone.meta.fullBreakdown.total === 4, "fullBreakdown still reflects the whole run");
ok(all.filteredOriginalTrades.length === 4 && all.applied === 4 && all.summary.deltaNetR === -1, "all-selected → full cohort applied (regression)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§18  REMODEL semantics: selection defines where BE applies");
ok(build({}).isNoFilterSelected === true, "no chips → isNoFilterSelected");
ok(build({ sessions: ["Asia"] }).selectedFilterLabel === "Asia", "label: Asia");
ok(build({ directions: ["Long"], sessions: ["Asia"] }).selectedFilterLabel === "Long + Asia", "label: Long + Asia");
// Asia only → only C (Asia) applied.
const asia = build({ sessions: ["Asia"] });
ok(asia.applied === 1 && rOf(asia, "C").protectionApplied, "Asia only → just C applied");
ok(!rOf(asia, "A").protectionApplied && !rOf(asia, "B").protectionApplied, "non-Asia kept original");
// Long + Asia (AND) → only long Asia trades = C.
const longAsia = build({ directions: ["Long"], sessions: ["Asia"] });
ok(longAsia.applied === 1 && rOf(longAsia, "C").protectionApplied, "Long+Asia → C only (AND)");
// CHoCH + New York (AND) → B is BOS/NY (no), D is CHoCH/London (no) → none match.
const chochNy = build({ structures: ["CHoCH"], sessions: ["New York"] });
ok(chochNy.applied === 0, "CHoCH+New York → none (no CHoCH trade in NY)");
// Sessions OR: Asia + New York → C (Asia) + B (NY).
const asiaNy = build({ sessions: ["Asia", "New York"] });
ok(asiaNy.applied === 2 && rOf(asiaNy, "B").protectionApplied && rOf(asiaNy, "C").protectionApplied, "Asia OR New York → B,C");
// Directions OR: Long + Short → all 4.
ok(build({ directions: ["Long", "Short"] }).applied === 4, "Long OR Short → all 4");
// Structures OR: CHoCH + BOS → all 4.
ok(build({ structures: ["CHoCH", "BOS"] }).applied === 4, "CHoCH OR BOS → all 4");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§19  ARM LEVEL REACHED filter (mfe_r cohort)");
// orig() helper signature: (id, direction, structure, session, r). Add mfe_r via spread.
const mOrig = (id, direction, structure, session, r, mfe) => ({ ...orig(id, direction, structure, session, r), mfe_r: mfe });
// A reached 2.5R, B reached 1.2R, C reached 0.6R, D reached 0.3R, E no mfe (unfilled).
const lOrig = [
    mOrig("A", "Long",  "CHoCH", "London",   -2, 2.5),
    mOrig("B", "Short", "BOS",   "New York",  3, 1.2),
    mOrig("C", "Long",  "BOS",   "Asia",     -1, 0.6),
    mOrig("D", "Short", "CHoCH", "London",    1, 0.3),
    { ...orig("E", "Long", "CHoCH", "London", -1) }, // no mfe_r
];
const lBe = [be("A", 0), be("B", 0), be("C", 0), be("D", 0), be("E", 0)];
const lBuild = (filters) => buildSelectiveBeUniverse({ originalTrades: lOrig, beTrades: lBe, filters, scenario });
const lRow = (u, id) => u.trades.find((t) => t.id === id);

const r025 = lBuild({ armLevels: [0.25] });
ok(r025.applied === 4 && lRow(r025, "A").protectionApplied && lRow(r025, "D").protectionApplied, "0.25R → A,B,C,D (all that moved)");
ok(!lRow(r025, "E").protectionApplied, "E (no mfe) never matches an arm level");

const r05 = lBuild({ armLevels: [0.5] });
ok(r05.applied === 3 && !lRow(r05, "D").protectionApplied, "0.5R → A,B,C (D only reached 0.3R)");

const r1 = lBuild({ armLevels: [1] });
ok(r1.applied === 2 && lRow(r1, "A").protectionApplied && lRow(r1, "B").protectionApplied, "1R → A,B");
ok(!lRow(r1, "C").protectionApplied, "C (0.6R) excluded at 1R");

const r2 = lBuild({ armLevels: [2] });
ok(r2.applied === 1 && lRow(r2, "A").protectionApplied, "2R → only A (2.5R)");

// CHoCH + 1R (AND): CHoCH = A,D,E ; reached ≥1R = A,B → A.
ok(lBuild({ structures: ["CHoCH"], armLevels: [1] }).applied === 1 && lRow(lBuild({ structures: ["CHoCH"], armLevels: [1] }), "A").protectionApplied, "CHoCH + 1R → A");

// London + Long + 2R: London={A,D,E}, Long={A,C,E}, ≥2R={A} → A.
const lll = lBuild({ sessions: ["London"], directions: ["Long"], armLevels: [2] });
ok(lll.applied === 1 && lRow(lll, "A").protectionApplied, "London + Long + 2R → A");

// Multiple levels OR: [1,2] = reached ≥1 OR ≥2 = reached ≥1 → A,B.
ok(lBuild({ armLevels: [1, 2] }).applied === 2, "1R OR 2R → reached ≥1R (A,B)");

// No arm levels = unrestricted for that group (other groups drive); Long = A,C,E (all have BE).
ok(lBuild({ directions: ["Long"] }).applied === 3, "no arm levels → unrestricted for group (Long: A,C,E)");

// No filters anywhere = none.
ok(lBuild({}).applied === 0 && lBuild({}).isNoFilterSelected === true, "no filters → 0 applied");
ok(matchesCohort(lOrig[4], { armLevels: [0.25] }) === false, "no mfe_r → arm level no match");
ok(matchesCohort(lOrig[0], { armLevels: [2] }) === true, "mfe 2.5 ≥ 2R → match");
ok(matchesCohort(lOrig[2], { armLevels: [1] }) === false, "mfe 0.6 < 1R → no match");

// Labels.
ok(lBuild({ structures: ["CHoCH"], sessions: ["New York"], armLevels: [2] }).selectedFilterLabel === "CHoCH + New York + 2R", "label: CHoCH + New York + 2R");
ok(lBuild({ armLevels: [0.5, 1] }).selectedFilterLabel === "0.5R + 1R", "label: 0.5R + 1R");
ok(lBuild({ armLevels: [1] }).isNoFilterSelected === false, "isNoFilterSelected tracks arm-level group");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
