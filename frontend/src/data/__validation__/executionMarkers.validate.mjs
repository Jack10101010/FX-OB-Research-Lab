// Node ESM validator for executionMarkers.js — run: node executionMarkers.validate.mjs
import { buildExecutionMarkers, deriveExitPrice, normExecTime } from "../executionMarkers.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); } };

// 15-min candle grid (UNIX seconds)
const base = Date.parse("2025-09-25T00:00:00Z") / 1000;
const step = 900;
const times = Array.from({ length: 30 }, (_, i) => base + i * step);
const iso = (sec) => new Date(sec * 1000).toISOString();
const ENTRY_I = 10, EXIT_I = 14;

const baseTrade = {
    executionTradeNumber: 20, obId: "OB-024", direction: "short",
    entry: iso(times[ENTRY_I]), exit: iso(times[EXIT_I]),
    entryPrice: 1.17250, stop: 1.17400, tp: 1.16900,
};
const win = { ...baseTrade, outcomeRaw: "WIN" };
const loss = { ...baseTrade, outcomeRaw: "LOSS" };
const be = { ...baseTrade, outcomeRaw: "BE_EXIT", beExitPrice: 1.17260 };
const missing = { ...baseTrade, outcomeRaw: "WIN", tp: 0 };       // win but no tp → unknown
const explicit = { ...baseTrade, outcomeRaw: "WIN", exit_price: 1.16850 };

// 1) two marker segments for a normal trade
const rw = buildExecutionMarkers(win, times);
ok("ok=true", rw.ok === true);
ok("renders two marker segments", rw.markers.length === 2, `got ${rw.markers.length}`);
ok("segment kinds entry + exit", rw.markers[0].kind === "entry" && rw.markers[1].kind === "exit");

// 2) y-values equal EXACT entry/exit prices
ok("entry marker price = exact entryPrice", rw.markers[0].price === 1.17250, `got ${rw.markers[0].price}`);
ok("WIN exit derived from tp (exact)", rw.markers[1].price === 1.16900 && rw.markers[1].derivedFrom === "tp", `got ${rw.markers[1].price}/${rw.markers[1].derivedFrom}`);

// 3) x-position anchored to entry/exit candle
ok("entry anchored to fill candle index", rw.markers[0].anchorIndex === ENTRY_I, `got ${rw.markers[0].anchorIndex}`);
ok("exit anchored to exit candle index", rw.markers[1].anchorIndex === EXIT_I, `got ${rw.markers[1].anchorIndex}`);

// 4) span is short (~4–5 candles)
ok("entry span ≈ 5 candles", rw.markers[0].spanCandles === 5, `got ${rw.markers[0].spanCandles}`);
ok("exit span ≈ 5 candles", rw.markers[1].spanCandles >= 4 && rw.markers[1].spanCandles <= 5, `got ${rw.markers[1].spanCandles}`);
ok("span anchored around candle (start≤anchor≤end)", rw.markers[0].startIndex <= ENTRY_I && ENTRY_I <= rw.markers[0].endIndex);

// 5) WIN derives exit from tp / LOSS from stop / BE from managed price
ok("LOSS exit = stop", buildExecutionMarkers(loss, times).markers[1].price === 1.17400);
ok("LOSS derivedFrom=stop", buildExecutionMarkers(loss, times).markers[1].derivedFrom === "stop");
ok("BE exit = beExitPrice", buildExecutionMarkers(be, times).markers[1].price === 1.17260);
ok("BE derivedFrom=be", buildExecutionMarkers(be, times).markers[1].derivedFrom === "be");
ok("explicit exit_price wins over derivation", buildExecutionMarkers(explicit, times).markers[1].price === 1.16850 && buildExecutionMarkers(explicit, times).markers[1].derivedFrom === "exit_price");

// 6) missing exit price does NOT crash → unknown, no price line
const rm = buildExecutionMarkers(missing, times);
ok("missing exit → ok still true", rm.ok === true);
ok("missing exit → price null", rm.markers[1].price === null, `got ${rm.markers[1].price}`);
ok("missing exit → labelled unknown", /unknown/i.test(rm.markers[1].label) && rm.markers[1].known === false);
ok("missing exit → still anchored to exit candle", rm.markers[1].anchorIndex === EXIT_I);

// 7) tooltip carries Trade #, OB, kind, timestamp, price, outcome, direction
const tt = rw.markers[0].tooltipLines;
ok("tooltip has trade # + OB", tt[0] === "Trade #20 · OB OB-024", `got ${tt[0]}`);
ok("tooltip has Entry label", tt[1] === "Entry");
ok("tooltip has price string", tt[3] === "1.17250", `got ${tt[3]}`);
ok("tooltip has outcome · direction", tt[4] === "WIN · short", `got ${tt[4]}`);

// 8) robustness: no candle times → still returns markers (anchor null), no throw
const noC = buildExecutionMarkers(win, []);
ok("no candleTimes → ok true", noC.ok === true);
ok("no candleTimes → markers present with prices", noC.markers.length === 2 && noC.markers[0].price === 1.17250);
ok("no candleTimes → anchorIndex null (pixel fallback)", noC.markers[0].anchorIndex === null && noC.markers[0].startTime === null);

// 9) scoped/guarded: null/garbage trade → ok:false, no throw
ok("null trade → ok false", buildExecutionMarkers(null, times).ok === false);
ok("trade missing entry → ok false", buildExecutionMarkers({ outcomeRaw: "WIN" }, times).ok === false);

// 10) derive + time helpers sanity
ok("deriveExitPrice unknown when nothing available", deriveExitPrice({ outcomeRaw: "" }).price === null);
ok("normExecTime parses ISO to seconds", normExecTime("2025-09-25T02:30:00Z") === base + step * 10);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
