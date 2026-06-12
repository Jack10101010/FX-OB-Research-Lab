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

const { buildSelectiveBeUniverse, matchesCohort, stableTradeId, cohortBreakdown, buildSessionAttribution, classifyBeAttributionRow } = loadCjs("src/data/selectiveBeUniverse.js");

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

// ── ARM-LEVEL-UX-FIX: single-select arm level (filters.armLevel) ──────────────
// 1. single arm level filters by mfe_r >= level
ok(lBuild({ armLevel: 1 }).applied === 2, "single armLevel 1 → reached ≥1R (A,B)");
// 2. selecting 1R excludes 0.5R-only trades (C reached 0.6)
ok(!lBuild({ armLevel: 1 }).trades.find((t) => t.id === "C")?.protectionApplied, "armLevel 1 excludes C (0.6R)");
ok(lBuild({ armLevel: 0.5 }).applied === 3, "single armLevel 0.5 → A,B,C");
ok(lBuild({ armLevel: 2 }).applied === 1, "single armLevel 2 → only A (2.5R)");
// 5. multiple old armLevels normalize safely → lowest (preserves prior OR semantics)
ok(lBuild({ armLevels: [1, 2] }).applied === 2, "legacy [1,2] normalizes to lowest (1) → A,B");
ok(lBuild({ armLevels: [0.5, 1, 2] }).meta.filters.armLevel === 0.5, "legacy [0.5,1,2] → effective armLevel 0.5");
ok(lBuild({ armLevel: 1 }).meta.filters.armLevel === 1, "meta.filters.armLevel reflects single value");

// 6. direction/structure/session behaviour unchanged with single arm
ok(lBuild({ directions: ["Long"] }).applied === 3, "no arm → unrestricted (Long: A,C,E)");
ok(lBuild({ structures: ["CHoCH"], armLevel: 1 }).applied === 1, "CHoCH + armLevel 1 → A");

// 7. no filters at all (no arm) still applies BE to zero trades
ok(lBuild({}).applied === 0 && lBuild({}).isNoFilterSelected === true, "no filters → 0 applied");
ok(matchesCohort(lOrig[4], { armLevel: 0.25 }) === false, "no mfe_r → arm level no match");
ok(matchesCohort(lOrig[0], { armLevel: 2 }) === true, "mfe 2.5 ≥ 2R → match");
ok(matchesCohort(lOrig[2], { armLevel: 1 }) === false, "mfe 0.6 < 1R → no match");

// Labels (single arm).
ok(lBuild({ structures: ["CHoCH"], sessions: ["New York"], armLevel: 2 }).selectedFilterLabel === "CHoCH + New York + 2R", "label: CHoCH + New York + 2R");
ok(lBuild({ armLevel: 0.5 }).selectedFilterLabel === "0.5R", "single arm label: 0.5R");
ok(lBuild({ armLevel: 1 }).isNoFilterSelected === false, "isNoFilterSelected tracks arm level");

console.log("\n§20  Session attribution (debug panels)");
// Fixture: Asia (loser, saved), London (winner, cut), New York (loser, saved).
const aOrig = [
    mOrig("A1", "Long", "CHoCH", "Asia", -1, 1.5),
    mOrig("L1", "Short", "BOS", "London", 3, 2.0),
    mOrig("N1", "Long", "BOS", "New York", -1, 1.2),
    mOrig("N2", "Short", "CHoCH", "New York", 2, 1.8),
];
const aBe = [be("A1", 0), be("L1", 0), be("N1", 0), be("N2", 0)];
const aBuild = (filters, applyToAll = false) => buildSelectiveBeUniverse({ originalTrades: aOrig, beTrades: aBe, filters, scenario, applyToAll });

// Global attribution: every session present, applied to all 4.
const globalU = aBuild({}, true);
const globalAttr = buildSessionAttribution(globalU.trades);
ok(globalAttr.totals.affected === 4, "global attribution → all 4 affected");
ok(globalAttr.rows.some((r) => r.session === "New York"), "global includes New York");
ok(globalAttr.totals.deltaR.toFixed(2) === globalU.summary.deltaNetR.toFixed(2), "global footer Δ == global summary deltaNetR");
ok(globalAttr.totals.saved === globalU.summary.lossesSaved && globalAttr.totals.cut === globalU.summary.winnersCut, "global saved/cut == summary");

// Cohort attribution with New York EXCLUDED (Asia + London only).
const cohortU = aBuild({ sessions: ["Asia", "London"] });
const cohortAttr = buildSessionAttribution(cohortU.trades);
ok(cohortAttr.rows.every((r) => r.session !== "New York"), "cohort attribution excludes deselected New York");
ok(cohortAttr.totals.affected === 2, "cohort → only Asia + London affected (2)");
ok(cohortAttr.totals.deltaR.toFixed(2) === cohortU.summary.deltaNetR.toFixed(2), "cohort footer Δ == selective summary deltaNetR");
ok(cohortAttr.totals.saved === cohortU.summary.lossesSaved && cohortAttr.totals.cut === cohortU.summary.winnersCut, "cohort saved/cut == summary");
// NY zeroed when rendered against the global session order (panel behavior).
const nyRow = cohortAttr.rows.find((r) => r.session === "New York") || { affected: 0, saved: 0, cut: 0, deltaR: 0 };
ok(nyRow.affected === 0 && nyRow.deltaR === 0, "NY row zeroed in cohort attribution");
// No duplicate counting: sum of per-session affected == total applied.
ok(cohortAttr.rows.reduce((s, r) => s + r.affected, 0) === cohortAttr.totals.affected, "no duplicate counting (rows sum to total)");

// Direction / structure filters attribute correctly.
const longAttr = buildSessionAttribution(aBuild({ directions: ["Long"] }).trades);
ok(longAttr.totals.affected === 2, "Long filter → A1 + N1 (2 affected)");
const chochAttr = buildSessionAttribution(aBuild({ structures: ["CHoCH"] }).trades);
ok(chochAttr.totals.affected === 2, "CHoCH filter → A1 + N2 (2 affected)");

console.log("\n§21  Nullable arm level — panel 'no BE' contract");
// The panel maps a null arm to EMPTY filters (no BE) so a null arm is never
// treated as unrestricted even when sessions/direction are selected.
const panelFilters = (c) => (c.armLevel == null ? {} : c);
const pBuild = (c) => buildSelectiveBeUniverse({ originalTrades: aOrig, beTrades: aBe, filters: panelFilters(c), scenario });
ok(pBuild({ armLevel: null, sessions: ["Asia", "London"] }).applied === 0, "null arm + sessions → 0 applied (panel gate)");
ok(pBuild({ armLevel: null, directions: ["Long"] }).applied === 0, "null arm + direction → 0 applied (panel gate)");
ok(pBuild({ armLevel: null }).applied === 0 && pBuild({ armLevel: null }).isNoFilterSelected === true, "null arm alone → no BE");
ok(pBuild({ armLevel: 0.5 }).applied === 4, "armLevel 0.5 selected → applies (A,B,N reached ≥0.5; all 4 here)");
ok(pBuild({ armLevel: 1.5, sessions: ["London"] }).applied === 1, "armLevel 1.5 + London → only L1 (2.0R) ");
// Direct builder callers are unchanged (null arm is simply 'no arm constraint').
ok(buildSelectiveBeUniverse({ originalTrades: aOrig, beTrades: aBe, filters: { sessions: ["Asia"] }, scenario }).applied === 1, "direct caller: sessions-only still applies (builder unchanged)");

console.log("\n§22  Explicit BE attribution classification");
const cls = (o, p) => classifyBeAttributionRow({ originalTrade: o, protectedTrade: p }).category;
ok(cls({ net_r: -1 }, { net_r: 0 }) === "loss_saved", "loser → BE 0 = loss_saved");
ok(cls({ net_r: 3 }, { net_r: 0 }) === "winner_cut", "winner → BE 0 = winner_cut");
ok(cls({ net_r: 2 }, { net_r: 2 }) === "tp_kept", "winner unchanged (Δ0) = tp_kept");
ok(cls({ net_r: -0.3, outcome: "NEWS_FLATTEN" }, { net_r: -0.3 }) === "news_flat", "news-flattened original (Δ0) = news_flat");
ok(cls({ net_r: -0.3 }, { net_r: -0.3, news_action: "flattened_active_trade" }) === "news_flat", "news_action on protected (Δ0) = news_flat");
ok(cls({ net_r: -1 }, { net_r: -1 }) === "same_loss", "loser unchanged (Δ0) = same_loss");
ok(cls({ net_r: 0 }, { net_r: 0 }) === "same_breakeven", "flat unchanged (Δ0) = same_breakeven");
ok(cls({ net_r: 1 }, { net_r: 2 }) === "other_changed", "Δ≠0 winner-improved = other_changed (not save/cut)");
ok(cls({ net_r: -1 }, { net_r: -2 }) === "other_changed", "Δ≠0 loser-worsened = other_changed");
// other_same is a defensive fallback (unreachable when protR == originalR exactly,
// since equal R always lands in tp_kept / same_loss / same_breakeven). Documented.

// Session attribution counts every category + composed "same"; footer == summary.
const cOrig = [
    mOrig("W1", "Long", "BOS", "London", 2, 2.0),   // winner kept (BE 2 → 2): tp_kept
    mOrig("S1", "Long", "CHoCH", "London", -1, 1.5), // loser saved
    { ...orig("F1", "Short", "BOS", "Asia", -0.3), mfe_r: 1.2, outcome: "NEWS_FLATTEN" }, // news flat
];
const cBe = [be("W1", 2), be("S1", 0), { id: "F1", net_r: -0.3 }];
const aU = buildSelectiveBeUniverse({ originalTrades: cOrig, beTrades: cBe, filters: {}, applyToAll: true, scenario });
const aA = buildSessionAttribution(aU.trades);
ok(aA.totals.applied === 3, "attribution applied counts all 3");
ok(aA.totals.saved === 1 && aA.totals.tpKept === 1 && aA.totals.newsFlat === 1, "categories: 1 saved, 1 tpKept, 1 newsFlat");
ok(aA.totals.same === (aA.totals.sameLoss + aA.totals.sameBreakeven + aA.totals.otherSame), "displayed 'same' = sameLoss+sameBreakeven+otherSame");
ok(aA.totals.deltaR.toFixed(2) === aU.summary.deltaNetR.toFixed(2), "attribution footer Δ == summary deltaNetR");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
