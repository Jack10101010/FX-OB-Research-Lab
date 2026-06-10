/**
 * obRetest.logictest.cjs — OB Retest Analysis Phase 1 logic test.
 *
 * Loads the REAL ES module (src/data/obRetest.js) via Babel (same pattern as
 * frontend/wf3_test.cjs) and exercises deriveRetests on synthetic bull + bear
 * candle series covering: survived, failed, open (right-censored), and debounce.
 *
 * Run from the frontend/ directory:
 *   node src/data/__validation__/obRetest.logictest.cjs
 *
 * Exits non-zero if any assertion fails.
 */
const path = require("path");
const { transformFileSync } = require("@babel/core");
const Module = require("module");

const SRC = path.resolve(__dirname, "../obRetest.js");
const code = transformFileSync(SRC, { presets: ["@babel/preset-env"] }).code;
const m = new Module("obRetest");
m.paths = Module._nodeModulePaths(process.cwd());
m._compile(code, "obRetest.js");
const { deriveRetests, summarizeRetestEvents, medianOf } = m.exports;

// ── helpers ───────────────────────────────────────────────────────────────────
const T0 = 1_700_000_000; // epoch seconds
const mk = (i, o, h, l, c) => ({ i, t: String(T0 + i * 60), time: T0 + i * 60, o, h, l, c });

let failures = 0;
function check(name, cond, extra = "") {
    const ok = !!cond;
    if (!ok) failures += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
}
function run(scenario, ob, candles, config = {}) {
    const res = deriveRetests({ orderBlocks: [ob], tradesByObId: null, candles, config });
    const s = res.summary;
    // Universal invariants for every scenario (Phase 1 honest-taxonomy additions).
    check(
        `${scenario}: invariant survived+failed+open === totalRetests`,
        s.survived + s.failed + s.open === s.totalRetests,
        `(${s.survived}+${s.failed}+${s.open} vs ${s.totalRetests})`,
    );
    check(
        `${scenario}: invariant reactionSuccess+weakHold === survived`,
        s.reactionSuccessCount + s.weakHoldCount === s.survived,
        `(${s.reactionSuccessCount}+${s.weakHoldCount} vs ${s.survived})`,
    );
    check(
        `${scenario}: invariant windowHoldRate === survivalRate (alias)`,
        s.windowHoldRate === s.survivalRate,
    );
    const closed = s.survived + s.failed;
    if (closed > 0) {
        check(
            `${scenario}: invariant reactionSuccessRate+weakHoldRate+failureRate === 1`,
            Math.abs(s.reactionSuccessRate + s.weakHoldRate + s.failureRate - 1) < 1e-9,
            `(${s.reactionSuccessRate}+${s.weakHoldRate}+${s.failureRate})`,
        );
        check(
            `${scenario}: invariant windowHoldRate === reactionSuccessRate+weakHoldRate`,
            Math.abs(s.windowHoldRate - (s.reactionSuccessRate + s.weakHoldRate)) < 1e-9,
        );
    }
    return res;
}

// ── BULL OB: top=1.1000 bot=1.0990 (10 pip height) ──────────────────────────────
const bull = (extra = {}) => ({ id: "1", side: "bull", top: 1.1000, bot: 1.0990, endTime: T0, ...extra });

// SURVIVED: touch → leave → retest → 10-candle window completes, no breach, reaction ≥ 8 pips.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch (intersects)
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leaves (low > top) → armed
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest entry
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007), // reaction +9 pips above top
    ];
    for (let i = 4; i <= 12; i++) c.push(mk(i, 1.1010, 1.1013, 1.1006, 1.1011)); // stay above, no breach
    const r = run("BULL survived", bull(), c);
    const e = r.events[0];
    check("BULL survived: exactly 1 retest", r.summary.totalRetests === 1);
    check("BULL survived: outcome survived", e && e.outcome === "survived", e && e.outcome);
    check("BULL survived: reactionMet true", e && e.reactionMet === true, e && String(e.reactionMaxPips));
    check("BULL survived: survivalRate 1", r.summary.survivalRate === 1);
    check("BULL survived: windowHoldRate 1", r.summary.windowHoldRate === 1);
    check("BULL survived: reactionSuccessRate 1 (held + reaction)", r.summary.reactionSuccessRate === 1);
    check("BULL survived: weakHoldRate 0", r.summary.weakHoldRate === 0);
    check("BULL survived: medianCandlesToFailure null (no failures)", r.summary.medianCandlesToFailure === null);
}

// WEAK HOLD: window completes with no breach but reaction BELOW the 8-pip minimum →
// outcome is still "survived" (a window hold), but it is a weak hold, NOT a reaction
// success. This is the case the old "Survival Rate" silently counted as a win.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest entry
    ];
    // grind just above/inside; max favorable ≈ 4 pips above top (< 8 minimum), no breach
    for (let i = 3; i <= 12; i++) c.push(mk(i, 1.1001, 1.1004, 1.0997, 1.1000));
    const r = run("BULL weak hold", bull(), c);
    const e = r.events[0];
    check("BULL weak hold: outcome survived (window hold)", e && e.outcome === "survived", e && e.outcome);
    check("BULL weak hold: reactionMet false", e && e.reactionMet === false, e && String(e.reactionMaxPips));
    check("BULL weak hold: windowHoldRate 1", r.summary.windowHoldRate === 1);
    check("BULL weak hold: reactionSuccessRate 0", r.summary.reactionSuccessRate === 0);
    check("BULL weak hold: weakHoldRate 1", r.summary.weakHoldRate === 1);
    check("BULL weak hold: weakHoldCount 1", r.summary.weakHoldCount === 1);
}

// FAILED: retest then close below distal (bottom) within the window.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
        mk(3, 1.0995, 1.0998, 1.0980, 1.0985), // close 1.0985 < bot 1.0990 → breach
        mk(4, 1.0984, 1.0986, 1.0975, 1.0978),
        mk(5, 1.0978, 1.0980, 1.0970, 1.0974),
    ];
    const r = run("BULL failed", bull(), c);
    const e = r.events[0];
    check("BULL failed: exactly 1 retest", r.summary.totalRetests === 1);
    check("BULL failed: outcome failed", e && e.outcome === "failed", e && e.outcome);
    check("BULL failed: failureMode close_breach", e && e.failureMode === "close_breach");
    check("BULL failed: candlesToFailure 1", e && e.candlesToFailure === 1, e && String(e.candlesToFailure));
}

// OPEN: retest with reaction window extending beyond available candles (right-censored).
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest entry; window would need candle 12
        mk(3, 1.1000, 1.1003, 1.0996, 1.0998),
        mk(4, 1.0999, 1.1002, 1.0995, 1.0997),
        mk(5, 1.0998, 1.1001, 1.0994, 1.0996),
    ];
    const r = run("BULL open", bull(), c);
    const e = r.events[0];
    check("BULL open: exactly 1 retest", r.summary.totalRetests === 1);
    check("BULL open: outcome open", e && e.outcome === "open", e && e.outcome);
    check("BULL open: open excluded from rates (survivalRate 0, failureRate 0)",
        r.summary.survivalRate === 0 && r.summary.failureRate === 0);
}

// DEBOUNCE: after a survived retest, continuous presence INSIDE the zone must NOT
// generate additional retests (price must leave before a new retest counts).
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest entry (k=1)
        mk(3, 1.1001, 1.1003, 1.0997, 1.0999), // window (reactionWindowCandles=2)
        mk(4, 1.0999, 1.1002, 1.0996, 1.0998), // window end → survived
    ];
    // candles 5..9 grind INSIDE the zone (never leave, never breach)
    for (let i = 5; i <= 9; i++) c.push(mk(i, 1.0998, 1.1001, 1.0995, 1.0997));
    const r = run("BULL debounce", bull(), c, { reactionWindowCandles: 2 });
    check("BULL debounce: grind inside = exactly 1 retest", r.summary.totalRetests === 1, String(r.summary.totalRetests));
    check("BULL debounce: that retest survived", r.events[0] && r.events[0].outcome === "survived");
}

// ── BEAR OB: top=1.1010 bot=1.1000 ─────────────────────────────────────────────
const bear = (extra = {}) => ({ id: "2", side: "bear", top: 1.1010, bot: 1.1000, endTime: T0, ...extra });

// SURVIVED (mirror): retest then drop away below bottom, no close above top.
{
    const c = [
        mk(0, 1.1005, 1.1005, 1.0998, 1.1002), // first touch (high into zone)
        mk(1, 1.0996, 1.0997, 1.0990, 1.0994), // leave (high < bot) → armed
        mk(2, 1.1001, 1.1004, 1.0999, 1.1001), // retest entry
        mk(3, 1.0996, 1.0999, 1.0991, 1.0993), // reaction -9 pips below bottom
    ];
    for (let i = 4; i <= 12; i++) c.push(mk(i, 1.0990, 1.0996, 1.0988, 1.0990));
    const r = run("BEAR survived", bear(), c);
    const e = r.events[0];
    check("BEAR survived: exactly 1 retest", r.summary.totalRetests === 1);
    check("BEAR survived: outcome survived", e && e.outcome === "survived", e && e.outcome);
    check("BEAR survived: direction bear", e && e.direction === "bear");
    check("BEAR survived: reactionMet true", e && e.reactionMet === true, e && String(e.reactionMaxPips));
}

// FAILED (mirror): close above distal (top) within window.
{
    const c = [
        mk(0, 1.1005, 1.1005, 1.0998, 1.1002),
        mk(1, 1.0996, 1.0997, 1.0990, 1.0994),
        mk(2, 1.1001, 1.1004, 1.0999, 1.1001),
        mk(3, 1.1012, 1.1020, 1.1008, 1.1015), // close 1.1015 > top 1.1010 → breach
        mk(4, 1.1016, 1.1025, 1.1012, 1.1020),
    ];
    const r = run("BEAR failed", bear(), c);
    const e = r.events[0];
    check("BEAR failed: outcome failed", e && e.outcome === "failed", e && e.outcome);
    check("BEAR failed: candlesToFailure 1", e && e.candlesToFailure === 1, e && String(e.candlesToFailure));
}

// OPEN (mirror)
{
    const c = [
        mk(0, 1.1005, 1.1005, 1.0998, 1.1002),
        mk(1, 1.0996, 1.0997, 1.0990, 1.0994),
        mk(2, 1.1001, 1.1004, 1.0999, 1.1001),
        mk(3, 1.1002, 1.1005, 1.0999, 1.1003),
        mk(4, 1.1003, 1.1006, 1.0999, 1.1004),
    ];
    const r = run("BEAR open", bear(), c);
    check("BEAR open: outcome open", r.events[0] && r.events[0].outcome === "open", r.events[0] && r.events[0].outcome);
}

// ════════════════════════════════════════════════════════════════════════════════
// ENGINE v2 — CONTINUOUS INVALIDATION (OB-RETEST-SURVIVAL-DEFINITION-AUDIT-2)
// ════════════════════════════════════════════════════════════════════════════════

// V2-A: INSIDE breach AFTER a held window (the zombie-retest bug). Retest 1 holds a
// 2-candle window; candle 5 then closes through the distal edge while still
// intersecting the zone (old engine: invisible). Candles 6-10 re-enter the dead
// zone — old engine would count a zombie retest 2.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest 1 entry
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007), // reaction up (window)
        mk(4, 1.1008, 1.1010, 1.1005, 1.1009), // window end → survived
        mk(5, 1.0992, 1.0993, 1.0980, 1.0985), // INSIDE state: intersects, close < bot → BREACH
        mk(6, 1.0986, 1.0995, 1.0984, 1.0993), // zombie bait: re-enters dead zone
        mk(7, 1.0994, 1.0999, 1.0992, 1.0996),
        mk(8, 1.0995, 1.0998, 1.0992, 1.0995),
        mk(9, 1.0996, 1.0999, 1.0993, 1.0997),
        mk(10, 1.0995, 1.0998, 1.0992, 1.0996),
    ];
    const r = run("V2-A between-window breach", bull(), c, { reactionWindowCandles: 2 });
    const p = r.perOB[0];
    check("V2-A: previous survived event preserved", r.events.length === 1 && r.events[0].outcome === "survived", JSON.stringify(r.events.map((e) => e.outcome)));
    check("V2-A: NO zombie retest counted (totalRetests 1)", r.summary.totalRetests === 1, String(r.summary.totalRetests));
    check("V2-A: finalOutcome invalidated_between_windows", p.finalOutcome === "invalidated_between_windows", p.finalOutcome);
    check("V2-A: invalidatedAfterRetestIndex 1", p.invalidatedAfterRetestIndex === 1, String(p.invalidatedAfterRetestIndex));
    check("V2-A: invalidatedAtCandleIndex 5", p.invalidatedAtCandleIndex === 5, String(p.invalidatedAtCandleIndex));
    check("V2-A: invalidatedAtTime = candle-5 time", p.invalidatedAtTime === T0 + 5 * 60);
    check("V2-A: invalidationMode close_breach", p.invalidationMode === "close_breach", p.invalidationMode);
    check("V2-A: timeToInvalidationMinutes 5 (first touch c0 → breach c5)", p.timeToInvalidationMinutes === 5, String(p.timeToInvalidationMinutes));
    check("V2-A: legacy invalidatedOnRetestIndex stays null (no in-window failure)", p.invalidatedOnRetestIndex === null);
    const ol = r.summary.obLevel;
    check("V2-A: obLevel present", !!ol);
    check("V2-A: obLevel eventualFailureRate 1, delayed count/share 1", ol && ol.eventualFailureRate === 1 && ol.delayedFailureCount === 1 && ol.delayedFailureShare === 1, JSON.stringify(ol));
    check("V2-A: obLevel medianTimeToInvalidationMinutes 5", ol && ol.medianTimeToInvalidationMinutes === 5);
    check("V2-A: meta engineVersion 2 + semantics", r.meta.engineVersion === 2 && r.meta.semantics === "continuous_invalidation");
}

// V2-B: INSIDE breach BEFORE the first retest (between first touch and any
// re-entry). Old engine: missed; later re-entry became retest 1 of a dead OB.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.0995, 1.0996, 1.0982, 1.0985), // INSIDE: intersects, close < bot → BREACH
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // zombie bait re-entry
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
    ];
    const r = run("V2-B breach before first retest", bull(), c);
    const p = r.perOB[0];
    check("V2-B: zero events", r.summary.totalRetests === 0, String(r.summary.totalRetests));
    check("V2-B: finalOutcome invalidated_between_windows", p.finalOutcome === "invalidated_between_windows", p.finalOutcome);
    check("V2-B: invalidatedAfterRetestIndex 0 (before any retest)", p.invalidatedAfterRetestIndex === 0);
    check("V2-B: timeToInvalidationMinutes 1", p.timeToInvalidationMinutes === 1, String(p.timeToInvalidationMinutes));
}

// V2-C: ARMED gap-breach — candle entirely beyond the zone (never intersects), so
// it is not a re-entry; it must still invalidate. Old engine: skipped silently.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.0985, 1.0989, 1.0980, 1.0982), // gap below zone (h < bot): no intersect, close < bot → BREACH
        mk(3, 1.1001, 1.1004, 1.0996, 1.1001), // zombie bait re-entry
    ];
    const r = run("V2-C armed gap-breach", bull(), c);
    const p = r.perOB[0];
    check("V2-C: zero events (gap breach is not a retest)", r.summary.totalRetests === 0, String(r.summary.totalRetests));
    check("V2-C: finalOutcome invalidated_between_windows", p.finalOutcome === "invalidated_between_windows", p.finalOutcome);
    check("V2-C: invalidatedAtCandleIndex 2", p.invalidatedAtCandleIndex === 2);
}

// V2-D: ARMED ordering guard — a candle that RE-ENTERS and closes beyond stays a
// genuine retest event that instantly fails (NOT a between-window invalidation).
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.0995, 1.0998, 1.0985, 1.0985), // re-enters (h ≥ bot) AND closes < bot
        mk(3, 1.0984, 1.0986, 1.0975, 1.0978),
    ];
    const r = run("V2-D armed re-entry instant fail", bull(), c);
    const e = r.events[0];
    const p = r.perOB[0];
    check("V2-D: exactly 1 failed event", r.summary.totalRetests === 1 && e && e.outcome === "failed", e && e.outcome);
    check("V2-D: candlesToFailure 0 (entry candle)", e && e.candlesToFailure === 0, e && String(e.candlesToFailure));
    check("V2-D: finalOutcome invalidated_in_window (not between_windows)", p.finalOutcome === "invalidated_in_window", p.finalOutcome);
    check("V2-D: invalidatedAfterRetestIndex 1 (the failing k)", p.invalidatedAfterRetestIndex === 1);
    check("V2-D: legacy invalidatedOnRetestIndex 1", p.invalidatedOnRetestIndex === 1);
}

// V2-E: first-touch breach terminal status (+ legacy field).
{
    const c = [
        mk(0, 1.0995, 1.0998, 1.0985, 1.0985), // intersects AND closes < bot on first touch
        mk(1, 1.0984, 1.0986, 1.0975, 1.0978),
    ];
    const r = run("V2-E first-touch breach", bull(), c);
    const p = r.perOB[0];
    check("V2-E: zero events", r.summary.totalRetests === 0);
    check("V2-E: finalOutcome invalidated_on_first_touch", p.finalOutcome === "invalidated_on_first_touch", p.finalOutcome);
    check("V2-E: legacy invalidatedOnRetestIndex 0", p.invalidatedOnRetestIndex === 0);
    check("V2-E: timeToInvalidationMinutes 0", p.timeToInvalidationMinutes === 0);
}

// V2-F: never touched.
{
    const c = [mk(0, 1.1006, 1.1010, 1.1003, 1.1008), mk(1, 1.1007, 1.1011, 1.1004, 1.1009)];
    const r = run("V2-F never touched", bull(), c);
    check("V2-F: finalOutcome never_touched", r.perOB[0].finalOutcome === "never_touched", r.perOB[0].finalOutcome);
    check("V2-F: no invalidation fields set", r.perOB[0].invalidatedAtTime === null && r.perOB[0].invalidationMode === null);
}

// V2-G: alive at data end (survived to the end, no breach ever) — reuse the
// canonical survived shape.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
    ];
    for (let i = 4; i <= 12; i++) c.push(mk(i, 1.1010, 1.1013, 1.1006, 1.1011));
    const r = run("V2-G alive at data end", bull(), c);
    const p = r.perOB[0];
    check("V2-G: finalOutcome alive_at_data_end", p.finalOutcome === "alive_at_data_end", p.finalOutcome);
    check("V2-G: obLevel eventualFailureRate 0, censored 1", r.summary.obLevel && r.summary.obLevel.eventualFailureRate === 0 && r.summary.obLevel.obsAliveAtDataEnd === 1);
}

// V2-H: cap — maxRetestsPerOB 1; retest 1 survives, tracking stops at the cap.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002),
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008),
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001),
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007),
        mk(4, 1.1008, 1.1010, 1.1005, 1.1009), // window end (2) → survived
        mk(5, 1.1006, 1.1010, 1.1003, 1.1008), // leaves again
        mk(6, 1.1001, 1.1004, 1.0996, 1.1001), // would be retest 2 — capped
        mk(7, 1.1004, 1.1009, 1.1001, 1.1007),
    ];
    const r = run("V2-H capped", bull(), c, { reactionWindowCandles: 2, maxRetestsPerOB: 1 });
    check("V2-H: exactly 1 retest (cap respected)", r.summary.totalRetests === 1);
    check("V2-H: finalOutcome capped", r.perOB[0].finalOutcome === "capped", r.perOB[0].finalOutcome);
}

// V2-I: BEAR mirror of V2-A — between-window close-breach above the top.
{
    const c = [
        mk(0, 1.1005, 1.1005, 1.0998, 1.1002), // first touch
        mk(1, 1.0996, 1.0997, 1.0990, 1.0994), // leave (below) → armed
        mk(2, 1.1001, 1.1004, 1.0999, 1.1001), // retest 1 entry
        mk(3, 1.0996, 1.0999, 1.0991, 1.0993), // reaction down (window)
        mk(4, 1.0994, 1.0998, 1.0990, 1.0992), // window end (2) → survived
        mk(5, 1.1008, 1.1020, 1.1005, 1.1015), // INSIDE: close 1.1015 > top 1.1010 → BREACH
        mk(6, 1.1009, 1.1012, 1.1002, 1.1005), // zombie bait
    ];
    const r = run("V2-I bear between-window breach", bear(), c, { reactionWindowCandles: 2 });
    const p = r.perOB[0];
    check("V2-I: 1 survived event, no zombie", r.summary.totalRetests === 1 && r.events[0].outcome === "survived");
    check("V2-I: finalOutcome invalidated_between_windows", p.finalOutcome === "invalidated_between_windows", p.finalOutcome);
    check("V2-I: invalidatedAtCandleIndex 5", p.invalidatedAtCandleIndex === 5);
}

// V2-J: wick-threshold variant — wick pierces the distal edge between windows
// (close back inside). close_beyond_ob ignores it; wick_beyond_ob must invalidate.
{
    const c = [
        mk(0, 1.1000, 1.1005, 1.0995, 1.1002), // first touch
        mk(1, 1.1006, 1.1010, 1.1003, 1.1008), // leave → armed
        mk(2, 1.1001, 1.1004, 1.0996, 1.1001), // retest 1 entry
        mk(3, 1.1004, 1.1009, 1.1001, 1.1007), // window
        mk(4, 1.1008, 1.1010, 1.1005, 1.1009), // window end (2) → survived
        mk(5, 1.0998, 1.0999, 1.0985, 1.0995), // INSIDE: wick 1.0985 < bot, close back inside
        mk(6, 1.0996, 1.0999, 1.0993, 1.0997),
    ];
    const rClose = run("V2-J close-mode ignores wick", bull(), c, { reactionWindowCandles: 2 });
    check("V2-J close-mode: OB still alive at data end", rClose.perOB[0].finalOutcome === "alive_at_data_end", rClose.perOB[0].finalOutcome);
    const rWick = run("V2-J wick-mode invalidates", bull(), c, { reactionWindowCandles: 2, failureThreshold: "wick_beyond_ob" });
    const pw = rWick.perOB[0];
    check("V2-J wick-mode: finalOutcome invalidated_between_windows", pw.finalOutcome === "invalidated_between_windows", pw.finalOutcome);
    check("V2-J wick-mode: invalidationMode wick_breach", pw.invalidationMode === "wick_breach", pw.invalidationMode);
}

// V2-K: obLevel aggregation math via the shared summarizer (multi-OB, mixed
// terminals incl. v1-style rows → null gating).
{
    const perOBv2 = [
        { touchCount: 1, retestCount: 1, finalOutcome: "invalidated_between_windows", timeToInvalidationMinutes: 10 },
        { touchCount: 1, retestCount: 2, finalOutcome: "invalidated_in_window", timeToInvalidationMinutes: 30 },
        { touchCount: 1, retestCount: 0, finalOutcome: "invalidated_on_first_touch", timeToInvalidationMinutes: 0 },
        { touchCount: 1, retestCount: 1, finalOutcome: "alive_at_data_end", timeToInvalidationMinutes: null },
        { touchCount: 1, retestCount: 1, finalOutcome: "capped", timeToInvalidationMinutes: null },
        { touchCount: 0, retestCount: 0, finalOutcome: "never_touched", timeToInvalidationMinutes: null },
    ];
    const s = summarizeRetestEvents([], perOBv2, 6);
    const ol = s.obLevel;
    check("V2-K: obLevel counts (3 invalidated: 1 FT, 1 in-window, 1 between)",
        ol && ol.obsInvalidated === 3 && ol.obsInvalidatedOnFirstTouch === 1 && ol.obsInvalidatedInWindow === 1 && ol.obsInvalidatedBetweenWindows === 1, JSON.stringify(ol));
    check("V2-K: eventualFailureRate 3/5 (never_touched excluded; censored in denom)",
        ol && Math.abs(ol.eventualFailureRate - 3 / 5) < 1e-9, ol && String(ol.eventualFailureRate));
    check("V2-K: delayedFailureShare 1/3", ol && Math.abs(ol.delayedFailureShare - 1 / 3) < 1e-9);
    check("V2-K: medianTimeToInvalidationMinutes 10 (0,10,30)", ol && ol.medianTimeToInvalidationMinutes === 10);
    check("V2-K: censored counts reported (alive 1, capped 1)", ol && ol.obsAliveAtDataEnd === 1 && ol.obsCapped === 1);

    // v1-style rows (no finalOutcome) → obLevel must be null, never fake zeros.
    const sV1 = summarizeRetestEvents([], [{ touchCount: 1, retestCount: 1 }], 1);
    check("V2-K: v1 perOB rows (no finalOutcome) → obLevel null", sV1.obLevel === null);
}

// ── MEDIAN: medianOf + summarizer medianCandlesToFailure ───────────────────────────
{
    check("medianOf([]) === null", medianOf([]) === null);
    check("medianOf([7]) === 7", medianOf([7]) === 7);
    check("medianOf([1,3,7]) === 3 (odd count)", medianOf([1, 3, 7]) === 3);
    check("medianOf([1,3]) === 2 (even count averages)", medianOf([1, 3]) === 2);
    check("medianOf unsorted [7,1,3] === 3", medianOf([7, 1, 3]) === 3);

    // Synthetic events through the shared summarizer: failures at 1, 9, 2 candles →
    // median 2 (mean would be 4 — the rename away from "Avg" matters).
    const evs = [
        { outcome: "failed", candlesToFailure: 1, reactionMaxPips: 0, reactionMet: false },
        { outcome: "failed", candlesToFailure: 9, reactionMaxPips: 0, reactionMet: false },
        { outcome: "failed", candlesToFailure: 2, reactionMaxPips: 0, reactionMet: false },
        { outcome: "survived", candlesToFailure: null, reactionMaxPips: 10, reactionMet: true },
        { outcome: "survived", candlesToFailure: null, reactionMaxPips: 2, reactionMet: false },
        { outcome: "open", candlesToFailure: null, reactionMaxPips: 1, reactionMet: false },
    ];
    const s = summarizeRetestEvents(evs, [], 0);
    check("summarizer: medianCandlesToFailure 2 (1,2,9)", s.medianCandlesToFailure === 2, String(s.medianCandlesToFailure));
    check("summarizer: avgCandlesToFailure 4 (kept for compat)", s.avgCandlesToFailure === 4, String(s.avgCandlesToFailure));
    check("summarizer: closed 5, reactionSuccess 1, weakHold 1, failed 3",
        s.reactionSuccessCount === 1 && s.weakHoldCount === 1 && s.failed === 3);
    check("summarizer: reactionSuccessRate 0.2", Math.abs(s.reactionSuccessRate - 0.2) < 1e-9, String(s.reactionSuccessRate));
    check("summarizer: weakHoldRate 0.2", Math.abs(s.weakHoldRate - 0.2) < 1e-9);
    check("summarizer: windowHoldRate 0.4 === survivalRate", s.windowHoldRate === s.survivalRate && Math.abs(s.windowHoldRate - 0.4) < 1e-9);
    check("summarizer: open excluded (failureRate 0.6)", Math.abs(s.failureRate - 0.6) < 1e-9);
}

// ── result ──────────────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
    console.log(`RESULT: ${failures} assertion(s) FAILED`);
    process.exit(1);
} else {
    console.log("RESULT: all assertions PASSED");
}
