// beReplay.validate.mjs — validation suite for beReplay.js
//
// 18 assertions across all outcome states, the time-based candle lookup,
// same-candle ambiguity, summary metrics, equity curve, worst streak,
// and the coverage gate.
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/beReplay.validate.mjs
//
// Exits non-zero if any assertion fails.
// All fixtures are hand-built — no dependency on live CSV data.

import babel from "@babel/core";
import fs    from "fs";

// ── Load beReplay.js via Babel (handles ESM export syntax) ────────────────────
function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const {
    buildReplayCandleIndex,
    resolveTradeCandleWindow,
    replayBeTrade,
    replayBeScenario,
    buildBeScenarioSummary,
    buildBeEquityCurve,
    beReplayAvailability,
} = loadCjs("src/data/beReplay.js");

// ── Assertion helpers ─────────────────────────────────────────────────────────
let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 0.02) => Math.abs(Number(a) - Number(b)) <= eps;

// ── Fixture builders ──────────────────────────────────────────────────────────
//
// Candle interval: 3600 s (1 h) for simplicity.
// Times are ISO strings normalizeTimestamp can parse.
//
// Candle index i corresponds to base_epoch + i * 3600.
// T0 = 2025-01-01T00:00:00Z  (epoch 1735689600)

const BASE = 1735689600;        // 2025-01-01T00:00:00Z
const HR   = 3600;

function ts(i) {                 // epoch-seconds for candle i
    return BASE + i * HR;
}

function isoTs(i) {              // ISO string for trade times
    return new Date(ts(i) * 1000).toISOString();
}

/** Build a minimal candle array (20 bars). OHLC all flat at 1.1000 unless overridden. */
function mkCandles(overrides = {}) {
    return Array.from({ length: 20 }, (_, i) => {
        const base = { time: ts(i), o: 1.1000, h: 1.1000, l: 1.1000, c: 1.1000 };
        return { ...base, ...(overrides[i] || {}) };
    });
}

/**
 * Minimal trade object in importer.js shape.
 *   entry     = fill time string (NOT price — matches importer convention)
 *   entryPrice = entry price
 *   exit      = exit time string
 *   stop / tp / direction / r / id
 */
function mkTrade(overrides) {
    return {
        id: "T-001",
        entry: isoTs(1),        // fill_time = candle 1
        exit:  isoTs(10),       // exit_time = candle 10
        entryPrice: 1.1000,
        stop:       1.0950,     // stop dist = 50 pips (0.0050)
        tp:         1.1200,     // TP at +4R for a 3.3RR example
        direction: "bull",
        r: -1.0,                // loser by default
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// § A  buildReplayCandleIndex
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nbuildReplayCandleIndex");
{
    const candles = mkCandles();
    const idx = buildReplayCandleIndex(candles);

    ok(idx.byTime instanceof Map,              "returns a Map byTime");
    ok(idx.byTime.size === 20,                 "indexes all 20 candles");
    ok(idx.byTime.get(ts(0)) === 0,            "candle 0 maps to row 0");
    ok(idx.byTime.get(ts(5)) === 5,            "candle 5 maps to row 5");
    ok(idx.intervalSec === HR,                 "detects 1-hour interval");
    ok(buildReplayCandleIndex([]).byTime.size === 0, "empty candles → empty index");
}

// ─────────────────────────────────────────────────────────────────────────────
// § B  resolveTradeCandleWindow
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nresolveTradeCandleWindow");
{
    const candles = mkCandles();
    const idx = buildReplayCandleIndex(candles);

    // Exact boundary match
    const t = mkTrade({ entry: isoTs(2), exit: isoTs(8) });
    const w = resolveTradeCandleWindow(t, candles, idx);
    ok(w.valid,              "resolves valid window");
    ok(w.fillRow === 2,      "fillRow = 2");
    ok(w.exitRow === 8,      "exitRow = 8");

    // Mid-bar fill time (entry at ts(3) + 300s = 5 minutes into bar 3)
    const tMid = mkTrade({ entry: new Date((ts(3) + 300) * 1000).toISOString(), exit: isoTs(9) });
    const wMid = resolveTradeCandleWindow(tMid, candles, idx);
    ok(wMid.valid && wMid.fillRow === 3, "mid-bar fill time resolves to nearest-prior (bar 3)");

    // Missing time → invalid
    const tBad = mkTrade({ entry: null, exit: isoTs(5) });
    ok(!resolveTradeCandleWindow(tBad, candles, idx).valid, "null fill_time → invalid");

    // Same-candle exit → zero_length
    const tSame = mkTrade({ entry: isoTs(4), exit: isoTs(4) });
    ok(!resolveTradeCandleWindow(tSame, candles, idx).valid &&
       resolveTradeCandleWindow(tSame, candles, idx).reason === "zero_length",
       "same-candle entry+exit → zero_length");

    // Out of range — exit time far beyond candles
    const tOOB = mkTrade({ exit: new Date((ts(25)) * 1000).toISOString() });
    ok(!resolveTradeCandleWindow(tOOB, candles, idx).valid &&
       resolveTradeCandleWindow(tOOB, candles, idx).reason === "unresolved_exit",
       "exit beyond candle array → unresolved_exit");
}

// ─────────────────────────────────────────────────────────────────────────────
// § C  replayBeTrade — LONG trade, loser saved
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: long loser saved");
{
    //   entry=1.1000  sl=1.0950  stop_dist=0.0050
    //   arm +0.5R = 1.1025
    //   be_stop = entry = 1.1000
    //   candle 3: high = 1.1030 → arms BE
    //   candle 5: low  = 0.9999 → BE stop hit → loss saved
    const candles = mkCandles({
        3: { h: 1.1030, l: 1.1001 },  // arm hit (l above beStopPx so no immediate trigger)
        4: { h: 1.1010, l: 1.1001 },  // safe intermediate
        5: { h: 1.1005, l: 0.9999 },  // retrace through entry
    });
    const idx  = buildReplayCandleIndex(candles);
    const t    = mkTrade({ entry: isoTs(1), exit: isoTs(8), r: -1.0, direction: "bull" });
    const res  = replayBeTrade(t, candles, idx, { armLevelR: 0.5, triggerBasis: "wick" });

    ok(res.outcome === "be_stopped_loss_saved", "outcome: be_stopped_loss_saved");
    ok(res.armTriggered,                        "armTriggered = true");
    ok(res.beStopped,                           "beStopped = true");
    ok(res.replayR === 0,                       "replayR = 0 (entry BE stop)");
    ok(approx(res.deltaR, 1.0),                 "deltaR ≈ +1.0 (saved the full loss)");
    ok(!res.sameCandleAmbiguous,                "no same-candle ambiguity");
}

// ─────────────────────────────────────────────────────────────────────────────
// § D  replayBeTrade — SHORT trade, loser saved
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: short loser saved");
{
    //   entry=1.1000  sl=1.1050  stop_dist=0.0050
    //   arm +0.5R short = 1.0975
    //   be_stop = entry = 1.1000
    //   candle 2: low = 1.0970 → arms
    //   candle 4: high = 1.1005 → BE stop hit
    const candles = mkCandles({
        2: { h: 1.1001, l: 1.0970 },
        4: { h: 1.1005, l: 1.0990 },
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({
        direction: "bear", stop: 1.1050, entryPrice: 1.1000, tp: 1.0800,
        entry: isoTs(1), exit: isoTs(8), r: -1.0,
    });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "be_stopped_loss_saved", "short: outcome be_stopped_loss_saved");
    ok(res.replayR === 0, "short: replayR = 0");
}

// ─────────────────────────────────────────────────────────────────────────────
// § E  replayBeTrade — winner cut
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: winner cut by BE");
{
    //   entry=1.1000  sl=1.0950  tp=1.1200  stop_dist=0.0050
    //   arm +0.5R = 1.1025
    //   candle 2: high = 1.1030 → arms
    //   candle 4: low  = 0.9999 → BE stop hit BEFORE tp
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.0995 },
        4: { h: 1.1010, l: 0.9999 },  // retrace — TP not yet hit
        8: { h: 1.1250, l: 1.1190 },  // TP would hit here, but trade already exited
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(10), r: 3.0, direction: "bull" });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "be_stopped_winner_cut", "outcome: be_stopped_winner_cut");
    ok(res.originalR === 3.0,                   "originalR = 3.0");
    ok(res.replayR   === 0,                     "replayR = 0");
    ok(approx(res.deltaR, -3.0),                "deltaR ≈ -3.0 (cost of cutting winner)");
}

// ─────────────────────────────────────────────────────────────────────────────
// § F  replayBeTrade — arm reached but never retraces
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: arm reached, never triggers");
{
    //   Price hits arm level but then TP is reached (no retrace through entry)
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.1001 },  // arms (l above beStopPx — no immediate trigger)
        3: { h: 1.1015, l: 1.1002 },  // safe — price holds above entry
        4: { h: 1.1020, l: 1.1001 },  // safe
        5: { h: 1.1025, l: 1.1001 },  // safe
        6: { h: 1.1250, l: 1.1050 },  // TP hit
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(7), r: 3.0, tp: 1.1200 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "original_winner",     "TP reached first → original_winner");
    ok(res.armTriggered,                      "armTriggered = true");
    ok(!res.beStopped,                        "beStopped = false");
    ok(res.replayR === res.originalR,         "replayR unchanged");
}

// ─────────────────────────────────────────────────────────────────────────────
// § G  replayBeTrade — arm armed but exit before retrace
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: arm armed, exits via original SL before retrace");
{
    //   Arms on candle 2, then price moves sideways and SL is hit.
    //   Neither TP nor BE stop hit after arming.
    //   "SL hit" is represented by exit_time landing on candle 7.
    //   The engine doesn't model original SL separately — it only tracks BE stop.
    //   All candles between arm and exit must have l > beStopPx (entry=1.1000)
    //   so BE is never triggered; slice exhaustion → be_armed_never_triggered.
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.1001 },   // arm hit
        3: { h: 1.1020, l: 1.1001 },   // safe
        4: { h: 1.1015, l: 1.1002 },   // safe
        5: { h: 1.1010, l: 1.1001 },   // safe
        6: { h: 1.1005, l: 1.1002 },   // safe
        7: { h: 1.1010, l: 1.1002 },   // exit candle — still above BE stop
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(7), r: -1.0 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "be_armed_never_triggered", "exits via SL after arming → be_armed_never_triggered");
    ok(res.replayR === -1.0,                       "replayR = originalR (unchanged)");
}

// ─────────────────────────────────────────────────────────────────────────────
// § H  replayBeTrade — missing candle path
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: missing candle path");
{
    const candles = mkCandles();
    const idx = buildReplayCandleIndex(candles);
    // Trade with no fill_time (entry = null)
    const t = mkTrade({ entry: null });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "unchanged_missing_path", "null fill_time → unchanged_missing_path");
    ok(res.replayR === res.originalR,            "originalR preserved");
}

// ─────────────────────────────────────────────────────────────────────────────
// § I  replayBeTrade — out of range
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: out-of-range candles");
{
    const candles = mkCandles();  // 20 candles, indices 0–19
    const idx = buildReplayCandleIndex(candles);
    const t = mkTrade({
        entry: isoTs(1),
        exit:  new Date((ts(25)) * 1000).toISOString(),  // beyond candle array
    });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.outcome === "unchanged_out_of_range" || res.outcome === "unchanged_missing_path",
       "exit beyond candles → unchanged (out_of_range or missing_path)");
    ok(res.replayR === res.originalR, "originalR preserved");
}

// ─────────────────────────────────────────────────────────────────────────────
// § J  replayBeTrade — same-candle ambiguity (conservative)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeTrade: same-candle arm + retrace");
{
    //   Single candle has both high >= arm_price AND low <= entry (be_stop)
    //   Conservative rule: BE stop assumed first → be_stopped (loser or winner)
    const candles = mkCandles({
        2: { h: 1.1030, l: 0.9990 },   // arm=1.1025 hit AND entry=1.1000 retrace on same candle
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(6), r: -1.0 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    ok(res.sameCandleAmbiguous,   "same-candle ambiguity flagged");
    ok(res.beStopped,             "conservative: BE stop assumed triggered");
    ok(res.replayR === 0,         "replayR = 0 (conservative BE exit)");
}

// ─────────────────────────────────────────────────────────────────────────────
// § K  Time-based lookup correctness — absolute candle index is irrelevant
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTime-based lookup: absolute candle_index values are irrelevant");
{
    //   Trade has fill_candle_index = 999999 (huge absolute global index).
    //   Engine must IGNORE this value and use fill_time for lookup.
    //   fill_time = isoTs(3) → fill candle = row 3 (skipped by walk).
    //   Arm must be on row 4+ (first walked candle is slice[1] = row 4).
    const candles = mkCandles({
        4: { h: 1.1030, l: 1.1001 },  // arm hit — first candle walked after fill
        5: { h: 1.1005, l: 0.9990 },  // retrace through entry
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({
        entry: isoTs(3),               // fill_time → resolves to row 3 via time-based lookup
        exit:  isoTs(8),
        fill_candle_index: 999999,     // absolute global index — must NOT be used as array position
        r: -1.0,
    });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5 });

    // If the engine incorrectly used fill_candle_index=999999 as array position,
    // candles[999999] would be undefined and the walk would produce unchanged_missing_path.
    // The correct result (time-based, row 3 armed) should be a BE outcome.
    ok(res.outcome !== "unchanged_missing_path",
       "fill_candle_index=999999 not used as array position; time-based lookup used instead");
    ok(res.beStopped, "time-based lookup correctly resolves fill at row 3 → BE triggered");
}

// ─────────────────────────────────────────────────────────────────────────────
// § L  triggerBasis: 'close' (arm only on candle close)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\ntriggerBasis: close");
{
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.1001, c: 1.1020 },  // wick hits arm; close BELOW arm → not armed yet
        3: { h: 1.1035, l: 1.1001, c: 1.1028 },  // wick hits arm; close ABOVE arm → armed (l above beStopPx)
        4: { h: 1.1010, l: 1.1001 },              // safe intermediate
        5: { h: 1.1005, l: 0.9990 },              // retrace
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(9), r: -1.0 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5, triggerBasis: "close" });

    ok(res.armTriggered,                      "close basis: arm triggered on close >= arm_price");
    ok(res.beStopped,                         "close basis: BE stop triggered after arm");
    // arm on candle 3, retrace on candle 5 — not same-candle
    ok(!res.sameCandleAmbiguous,              "different candles — no ambiguity");
}

// ─────────────────────────────────────────────────────────────────────────────
// § M  triggerBasis: 'next_candle' (arm activates on bar AFTER detection)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\ntriggerBasis: next_candle");
{
    //   Arm wick hit on candle 2; BE activates on candle 3.
    //   Candle 3 itself has a retrace — this should trigger BE.
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.0998 },  // wick → arm detected; activates on candle 3
        3: { h: 1.1010, l: 0.9990 },  // BE now active; retrace hits entry → BE stopped
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(8), r: -1.0 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5, triggerBasis: "next_candle" });

    ok(res.beStopped, "next_candle: BE activates on bar after detection; retrace on same bar triggers");
}

// ─────────────────────────────────────────────────────────────────────────────
// § N  delayCandles
// ─────────────────────────────────────────────────────────────────────────────
console.log("\ndelayCandles: 2");
{
    //   Arm hit on candle 2; delay=2 → BE active on candle 4.
    //   Retrace on candle 3 must NOT trigger (delay not lapsed).
    //   Retrace on candle 5 MUST trigger.
    const candles = mkCandles({
        2: { h: 1.1030, l: 1.0998 },  // arm hit
        3: { h: 1.1005, l: 0.9990 },  // retrace — too early (delay not lapsed)
        5: { h: 1.1005, l: 0.9990 },  // retrace — delay lapsed → BE triggered
    });
    const idx = buildReplayCandleIndex(candles);
    const t   = mkTrade({ entry: isoTs(1), exit: isoTs(9), r: -1.0 });
    const res = replayBeTrade(t, candles, idx, { armLevelR: 0.5, delayCandles: 2 });

    ok(res.beStopped, "delayCandles=2: retrace on candle 5 (arm+3) triggers BE");
    ok(res.replayR === 0, "replayR = 0 after delay");
}

// ─────────────────────────────────────────────────────────────────────────────
// § O  replayBeScenario + buildBeScenarioSummary — portfolio metrics
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nreplayBeScenario + buildBeScenarioSummary");
{
    //   5-trade portfolio: 2 winners, 3 losers.
    //   Arm level +0.5R on each.
    //   candle 3: arm hit on loser trades (h>=1.1025)
    //   candle 5: retrace through entry (l<=1.1000) → losses saved
    //   Winners: arm armed but TP hit first → unchanged_winner

    const buildPortfolioCandles = (armHits, retraces, tpHits) => {
        const base = Array.from({ length: 15 }, (_, i) => ({
            time: ts(i), o: 1.1000, h: 1.1000, l: 1.1000, c: 1.1000,
        }));
        for (const [i, ov] of Object.entries(armHits))   base[i] = { ...base[i], ...ov };
        for (const [i, ov] of Object.entries(retraces))  base[i] = { ...base[i], ...ov };
        for (const [i, ov] of Object.entries(tpHits))    base[i] = { ...base[i], ...ov };
        return base;
    };

    const candles = buildPortfolioCandles(
        { 3: { h: 1.1030 } },
        { 6: { l: 0.9990 } },
        { 9: { h: 1.1210 } }    // TP hit candle for winners
    );
    const idx = buildReplayCandleIndex(candles);

    const mkT = (id, r, direction, exitCandle) => ({
        id,
        entry: isoTs(1),
        exit:  isoTs(exitCandle),
        entryPrice: 1.1000, stop: 1.0950, tp: 1.1200,
        direction,
        r,
    });

    // Losers: arm at 3, retrace at 6 → saved; exit_time = candle 8
    const loser1 = mkT("L1", -1.0, "bull", 8);
    const loser2 = mkT("L2", -1.0, "bull", 8);
    const loser3 = mkT("L3", -1.0, "bull", 8);
    // Winners: arm at 3 (h=1.1030), TP hit at 9 (h=1.1210 ≥ 1.1200) — exit_time = candle 10
    const win1   = mkT("W1",  3.3, "bull", 10);
    const win2   = mkT("W2",  3.3, "bull", 10);

    const trades  = [loser1, loser2, loser3, win1, win2];
    const results = replayBeScenario(trades, candles, { armLevelR: 0.5 });
    const saved   = results.filter((r) => r.outcome === "be_stopped_loss_saved").length;
    const cut     = results.filter((r) => r.outcome === "be_stopped_winner_cut").length;
    const winnerUnchanged = results.filter((r) => r.outcome === "original_winner").length;

    ok(saved === 3,          `3 losers saved (got ${saved})`);
    // Winners: tp at candle 9, retrace at candle 6 — but arm armed; TP candle must beat retrace
    // candle 6: l=0.9990 → retrace hits entry; candle 9: h=1.1210 → TP
    // arm on candle 3; candle 4 onward is active; candle 6 has retrace FIRST → winners are cut
    ok(saved + cut === 5,    "all 5 trades have a BE outcome (saved or cut)");

    const baseline = {
        netR: 5 * 1.0 * -1 + 2 * 3.3,  // = -5 + 6.6 = 1.6 ... but only 3 losers: -3 + 6.6 = 3.6
        // Actually: 3 losers (-1.0 each) + 2 winners (+3.3 each) = -3 + 6.6 = 3.6
        profitFactor: (2 * 3.3) / (3 * 1.0),
        maxDrawdown: null,
        worstLossStreak: null,
    };
    // Correct baseline
    const correctedBaseline = {
        netR: (3 * -1.0) + (2 * 3.3),   // = 3.6
        profitFactor: (2 * 3.3) / (3 * 1.0),
        maxDrawdown: null,
        worstLossStreak: null,
    };
    const summary = buildBeScenarioSummary(results, correctedBaseline);

    ok(summary.tradeCount === 5,           "tradeCount = 5");
    ok(summary.lossesSaved === saved,      `lossesSaved = ${saved}`);
    ok(summary.winnersCut  === cut,        `winnersCut = ${cut}`);
    ok(summary.beExitCount === saved + cut, "beExitCount = saved + cut");
    ok(summary.loserRSaved > 0,            "loserRSaved > 0");
    ok(approx(summary.baselineNetR, 3.6, 0.05), "baselineNetR ≈ 3.6");
}

// ─────────────────────────────────────────────────────────────────────────────
// § P  buildBeEquityCurve — cumulative R and max drawdown
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nbuildBeEquityCurve + maxDrawdown");
{
    // Known sequence: +2, -1, +3, -2, +1 → cumulative: 2, 1, 4, 2, 3
    // Peak=4, trough=2 after peak → maxDD = 2-4 = -2
    const results = [
        { replayR:  2 }, { replayR: -1 }, { replayR:  3 },
        { replayR: -2 }, { replayR:  1 },
    ].map((r) => ({ ...r, id: "", originalR: 0, deltaR: 0,
        outcome: "original_winner", armTriggered: false, beStopped: false,
        armCandleTime: null, beExitCandleTime: null, sameCandleAmbiguous: false }));

    const curve = buildBeEquityCurve(results);
    ok(curve.length === 5,                 "equity curve length = 5");
    ok(curve[0].netR === 2,                "curve[0].netR = 2");
    ok(curve[2].netR === 4,                "curve[2].netR = 4  (peak)");
    ok(curve[3].netR === 2,                "curve[3].netR = 2  (post-peak trough)");

    const summary = buildBeScenarioSummary(results);
    ok(summary.maxDrawdown != null,        "maxDrawdown computed");
    ok(approx(summary.maxDrawdown, -2.0),  "maxDrawdown = -2 (peak=4, trough=2)");
}

// ─────────────────────────────────────────────────────────────────────────────
// § Q  worstLossStreak
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nworstLossStreak");
{
    // Sequence: win, loss, loss, loss, win, loss, loss → worst = 3
    const mkR = (replayR) => ({ id: "", originalR: replayR, replayR, deltaR: 0,
        outcome: replayR >= 0 ? "original_winner" : "original_loser",
        armTriggered: false, beStopped: false,
        armCandleTime: null, beExitCandleTime: null, sameCandleAmbiguous: false });

    const results = [1, -1, -1, -1, 1, -1, -1].map(mkR);
    const summary = buildBeScenarioSummary(results);

    ok(summary.worstLossStreak === 3,      "worstLossStreak = 3");
}

// ─────────────────────────────────────────────────────────────────────────────
// § R  coveragePct
// ─────────────────────────────────────────────────────────────────────────────
console.log("\ncoveragePct");
{
    // 4 replayed, 1 missing_path → 80% coverage
    const mkR = (outcome, replayR, originalR) => ({
        id: "", originalR, replayR, deltaR: replayR - originalR, outcome,
        armTriggered: false, beStopped: false,
        armCandleTime: null, beExitCandleTime: null, sameCandleAmbiguous: false,
    });
    const results = [
        mkR("original_winner",       1.0, 1.0),
        mkR("original_loser",       -1.0,-1.0),
        mkR("be_stopped_loss_saved", 0.0,-1.0),
        mkR("original_winner",       2.0, 2.0),
        mkR("unchanged_missing_path",-1.0,-1.0),
    ];
    const summary = buildBeScenarioSummary(results);
    ok(summary.coveragePct === 80, "coveragePct = 80 (4 replayed out of 5)");
    ok(summary.missingPathCount === 1, "missingPathCount = 1");
}

// ─────────────────────────────────────────────────────────────────────────────
// § S  beReplayAvailability gate
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nbeReplayAvailability");
{
    const candles = mkCandles();
    const filled  = [
        mkTrade({ entry: isoTs(1), exit: isoTs(5) }),
        mkTrade({ id: "T2", entry: isoTs(3), exit: isoTs(7) }),
    ];

    const avail = beReplayAvailability(filled, candles);
    ok(avail.available,              "available = true with candles + filled trades");
    ok(avail.coveragePct > 0,        "coveragePct > 0");

    const noCandles = beReplayAvailability(filled, []);
    ok(!noCandles.available,         "not available when candles empty");
    ok(noCandles.reason === "no_candles", "reason = no_candles");

    const noTrades = beReplayAvailability([], candles);
    ok(!noTrades.available,          "not available when no filled trades");
}

// ─────────────────────────────────────────────────────────────────────────────
// Final result
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(55)}`);
if (failures === 0) {
    console.log("  ✓ ALL ASSERTIONS PASSED");
} else {
    console.error(`  ✗ ${failures} ASSERTION(S) FAILED`);
    process.exit(1);
}
