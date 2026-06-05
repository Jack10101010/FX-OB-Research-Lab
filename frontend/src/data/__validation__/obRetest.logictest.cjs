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
const { deriveRetests } = m.exports;

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
    // Universal invariant for every scenario.
    check(
        `${scenario}: invariant survived+failed+open === totalRetests`,
        s.survived + s.failed + s.open === s.totalRetests,
        `(${s.survived}+${s.failed}+${s.open} vs ${s.totalRetests})`,
    );
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

// ── result ──────────────────────────────────────────────────────────────────────
console.log("");
if (failures > 0) {
    console.log(`RESULT: ${failures} assertion(s) FAILED`);
    process.exit(1);
} else {
    console.log("RESULT: all assertions PASSED");
}
