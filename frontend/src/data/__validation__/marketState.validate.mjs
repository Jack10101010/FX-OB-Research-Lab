// Node ESM validator for marketState.js — run: node marketState.validate.mjs
// Covers: date normalization, daily resample, EMA/px_vs_ema formula parity,
// the mandatory shift(1) LEAKAGE guarantees (truncation invariance + shift proof),
// the 6-state classifier, the long-vol gate, and the filter predicate.
import {
    utcDateKey, resampleDaily, classifyState, inGate,
    daily_regime_panel, stateForTrade, tradePassesRegime,
    BBW_THRESHOLD_BY_SYMBOL,
    ribbonSegmentsFromPanel, emaLinePointsFromPanel, shortStateLabel, tradeStateBadge,
} from "../marketState.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
    if (cond) { pass++; console.log("  PASS", name); }
    else { fail++; console.log("  FAIL", name, extra); }
};
const approx = (a, b, eps = 1e-9) => a != null && b != null && Math.abs(a - b) <= eps;

// ── 1) utcDateKey ────────────────────────────────────────────────────────────
ok("utcDateKey ISO string", utcDateKey("2024-03-14T09:30:00Z") === "2024-03-14");
ok("utcDateKey date-only", utcDateKey("2024-03-14") === "2024-03-14");
ok("utcDateKey epoch seconds", utcDateKey(Date.parse("2024-03-14T00:00:00Z") / 1000) === "2024-03-14");
ok("utcDateKey epoch millis", utcDateKey(Date.parse("2024-03-14T23:59:00Z")) === "2024-03-14");
ok("utcDateKey null", utcDateKey(null) === null);

// ── 2) resampleDaily aggregates intraday → UTC daily OHLC ────────────────────
const intraday = [
    { t: "2024-01-01T00:00:00Z", o: 1.10, h: 1.12, l: 1.09, c: 1.11 },
    { t: "2024-01-01T12:00:00Z", o: 1.11, h: 1.15, l: 1.10, c: 1.14 },
    { t: "2024-01-02T06:00:00Z", o: 1.14, h: 1.16, l: 1.08, c: 1.09 },
];
const rd = resampleDaily(intraday);
ok("resample: 2 daily rows", rd.length === 2, `got ${rd.length}`);
ok("resample: day1 open=first", rd[0].open === 1.10);
ok("resample: day1 high=max", rd[0].high === 1.15);
ok("resample: day1 low=min", rd[0].low === 1.09);
ok("resample: day1 close=last", rd[0].close === 1.14);

// ── 3) classifyState — 6 states + chop override ──────────────────────────────
const BBW = 2.342;
ok("Bull/Expand", classifyState({ pxVsEma: 1.0, bbw: 3.0, adx: 25 }, BBW, 18).marketState === "Bull/Expand");
ok("Bull/Compress", classifyState({ pxVsEma: 1.0, bbw: 1.0, adx: 25 }, BBW, 18).marketState === "Bull/Compress");
ok("Bear/Expand", classifyState({ pxVsEma: -1.0, bbw: 3.0, adx: 25 }, BBW, 18).marketState === "Bear/Expand");
ok("Bear/Compress", classifyState({ pxVsEma: -1.0, bbw: 1.0, adx: 25 }, BBW, 18).marketState === "Bear/Compress");
ok("Bull/Chop (adx<18 overrides)", classifyState({ pxVsEma: 1.0, bbw: 3.0, adx: 10 }, BBW, 18).marketState === "Bull/Chop");
ok("Bear/Chop (adx<18 overrides)", classifyState({ pxVsEma: -1.0, bbw: 3.0, adx: 10 }, BBW, 18).marketState === "Bear/Chop");
ok("px==0 → Bear (>0 is Bull)", classifyState({ pxVsEma: 0, bbw: 3.0, adx: 25 }, BBW, 18).trendState === "Bear");
ok("null on missing input", classifyState({ pxVsEma: null, bbw: 3.0, adx: 25 }, BBW, 18) === null);

// ── 4) inGate — long-vol filter only on long side ────────────────────────────
ok("long in-gate: px>0 & bbw>thr", inGate("long", { pxVsEma: 1, bbw: 3 }, BBW) === true);
ok("long blocked: bbw<thr", inGate("long", { pxVsEma: 1, bbw: 1 }, BBW) === false);
ok("long blocked: px<0", inGate("long", { pxVsEma: -1, bbw: 3 }, BBW) === false);
ok("short in-gate: px<=0 (no vol cond)", inGate("short", { pxVsEma: -1, bbw: 0.1 }, BBW) === true);
ok("short blocked: px>0", inGate("short", { pxVsEma: 1, bbw: 3 }, BBW) === false);
ok("unknown row ⇒ keep (don't block)", inGate("long", { pxVsEma: null, bbw: null }, BBW) === true);

// ── 5) build a deterministic daily series (past warmup) ──────────────────────
const N = 300;
const dayISO = (i) => new Date(Date.parse("2023-01-01T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
const closeAt = (i) => 1.10 + 0.03 * Math.sin(i / 17) + 0.0006 * i; // trend + cycles → EMA crossovers
const candles = Array.from({ length: N }, (_, i) => {
    const c = closeAt(i);
    return { t: dayISO(i), o: i ? closeAt(i - 1) : c, h: c + 0.004, l: c - 0.004, c };
});
const panel = daily_regime_panel(candles, {}, "EURUSD");
ok("panel row count == days", panel.rows.length === N, `got ${panel.rows.length}`);
ok("panel row0 is null (no prior day)", panel.rows[0].marketState === null);
ok("default BBW threshold = EURUSD 2.342", approx(panel.bbwThreshold, BBW_THRESHOLD_BY_SYMBOL.EURUSD));
ok("fixed threshold not in-sample", panel.bbwThresholdInSample === false);
ok("late row has a state", panel.rows[N - 1].marketState != null);

// ── 6) EMA/px_vs_ema FORMULA PARITY + SHIFT PROOF ────────────────────────────
// Independently recompute ema(span=200, adjust=False) + px_vs_ema over closes.
const closes = candles.map((c) => c.c);
const a = 2 / (200 + 1);
const emaRef = []; let prev = null;
for (const x of closes) { prev = prev == null ? x : (1 - a) * prev + a * x; emaRef.push(prev); }
const pxRef = closes.map((c, i) => (c - emaRef[i]) / emaRef[i] * 100);
// The panel row FOR day k uses day (k-1)'s features (shift 1). So rows[k+1].pxVsEma
// must equal the UNSHIFTED reference at index k.
let parityOk = true, shiftProofOk = true;
for (let k = 5; k < N - 1; k++) {
    if (!approx(panel.rows[k + 1].pxVsEma, pxRef[k], 1e-6)) parityOk = false;
    // shift proof: the day-k row must NOT carry day-k's own feature (uses k-1)
    if (approx(panel.rows[k].pxVsEma, pxRef[k], 1e-12) && !approx(pxRef[k], pxRef[k - 1], 1e-12)) shiftProofOk = false;
}
ok("EMA/px_vs_ema parity (rows[k+1] == unshifted[k])", parityOk);
ok("shift(1) proof: day-k row uses day-(k-1) feature", shiftProofOk);

// ── 7) LEAKAGE — truncation invariance ───────────────────────────────────────
// Adding FUTURE candles must never change a past day's stamped state/values.
const K = 250;
const dateK = dayISO(K);
const rowFull = panel.byDate.get(dateK);
const truncated = candles.slice(0, K + 1);            // include day K, drop K+1..N-1
const panelTrunc = daily_regime_panel(truncated, {}, "EURUSD");
const rowTrunc = panelTrunc.byDate.get(dateK);
ok("truncation: same marketState", rowFull.marketState === rowTrunc.marketState,
    `${rowFull.marketState} vs ${rowTrunc.marketState}`);
ok("truncation: same pxVsEma", approx(rowFull.pxVsEma, rowTrunc.pxVsEma, 1e-9));
ok("truncation: same bbw", approx(rowFull.bbw, rowTrunc.bbw, 1e-9));
ok("truncation: same adx", approx(rowFull.adx, rowTrunc.adx, 1e-9));
ok("known_at = start of trade day (UTC)", rowFull.knownAt === `${dateK}T00:00:00Z`);
ok("shiftedDays == 1", rowFull.shiftedDays === 1);

// ── 7b) snapshot provenance: known_at + source + version present ─────────────
ok("row.source == 'client'", rowFull.source === "client");
ok("row.version present", typeof rowFull.version === "string" && rowFull.version.length > 0);
ok("row has knownAt", typeof rowFull.knownAt === "string");
ok("panel.source == 'client'", panel.source === "client");
ok("panel.version present", typeof panel.version === "string" && panel.version.length > 0);

// ── 8) stateForTrade + filter predicate ──────────────────────────────────────
const trade = { fill_time: `${dateK}T14:30:00Z`, direction: "short" };
const st = stateForTrade(trade, panel);
ok("stateForTrade resolves the trade day", st && st.date === dateK);
ok("stateForTrade state matches panel", st.marketState === rowFull.marketState);
ok("filter keeps when state ∈ allowed", tradePassesRegime(trade, panel, [rowFull.marketState]) === true);
ok("filter drops unmatched state", tradePassesRegime(trade, panel, ["___no_such_state___"]) === false);
ok("filter keeps when allowed empty (gate off)", tradePassesRegime(trade, panel, []) === true);
ok("filter keeps unknown trade day", tradePassesRegime({ fill_time: "1990-01-01T00:00:00Z" }, panel, ["Bear/Chop"]) === true);

// ── 9) FROZEN PARITY FIXTURE (spec v1) ───────────────────────────────────────
// Assert marketState.js reproduces the canonical frozen expected panel bit-for-bit
// (the same fixture the future Python src/regime.py must match). Regenerate via
// Lux-OB-Backtester/tests/regime/fixture_gen.py; see regime_spec.md §10.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
let fx = null;
try {
    fx = JSON.parse(readFileSync(join(__dir, "..", "__fixtures__", "marketState.fixture.json"), "utf8"));
} catch (e) { ok("fixture file present", false, String(e)); }
if (fx) {
    ok("fixture has candles + expected_panel", Array.isArray(fx.candles) && Array.isArray(fx.expected_panel) && fx.expected_panel.length > 0);
    const fp = daily_regime_panel(fx.candles, fx.config, fx.symbol);
    let numMax = 0, stateMiss = 0, confMiss = 0, knownMiss = 0, nullMiss = 0;
    const NF = ["ema", "pxVsEma", "bbw", "adx"];
    const rowsOk = fp.rows.length === fx.expected_panel.length;
    ok("fixture: row count matches", rowsOk, `${fp.rows.length} vs ${fx.expected_panel.length}`);
    if (rowsOk) {
        for (let i = 0; i < fx.expected_panel.length; i++) {
            const e = fx.expected_panel[i], g = fp.rows[i];
            if (e.date !== g.date) stateMiss++;
            for (const f of NF) {
                const en = e[f], gn = g[f];
                if (en == null || gn == null) { if ((en == null) !== (gn == null)) nullMiss++; }
                else numMax = Math.max(numMax, Math.abs(en - gn));
            }
            if ((e.marketState || null) !== (g.marketState || null)) stateMiss++;
            if (!!e.confirmed !== !!g.confirmed) confMiss++;
            if (e.knownAt !== g.knownAt) knownMiss++;
        }
        ok("fixture: numeric parity ≤ 1e-9 (EMA/px/BBW/ADX)", numMax <= 1e-9, `max |Δ| = ${numMax.toExponential(3)}`);
        ok("fixture: 0 state mismatches", stateMiss === 0, `${stateMiss}`);
        ok("fixture: 0 confirmed mismatches", confMiss === 0, `${confMiss}`);
        ok("fixture: 0 knownAt mismatches", knownMiss === 0, `${knownMiss}`);
        ok("fixture: 0 nullness mismatches", nullMiss === 0, `${nullMiss}`);
        const states = new Set(fx.expected_panel.map((r) => r.marketState).filter(Boolean));
        ok("fixture: all 6 states covered",
            ["Bull/Expand","Bull/Compress","Bull/Chop","Bear/Expand","Bear/Compress","Bear/Chop"].every((s) => states.has(s)),
            [...states].join(","));
        ok("fixture: panel source=client", fp.source === "client");
    }
}

// ── 10) PHASE-2 OVERLAY HELPERS (pure derivation from the panel) ─────────────
if (fx) {
    const fp = daily_regime_panel(fx.candles, fx.config, fx.symbol);
    const segs = ribbonSegmentsFromPanel(fp);
    ok("ribbon: segments non-empty", segs.length > 0);
    // contiguity: segments tile the panel days with no gap/overlap, in order
    let contig = segs.length > 0 && segs[0].startDate === fp.rows[0].date
        && segs[segs.length - 1].endDate === fp.rows[fp.rows.length - 1].date;
    for (let i = 1; i < segs.length; i++) {
        if (segs[i - 1].state === segs[i].state) contig = false;       // runs must be maximal
        if (segs[i].startMs <= segs[i - 1].startMs) contig = false;    // strictly increasing
    }
    ok("ribbon: contiguous, maximal, ordered runs", contig);
    // coverage: total days across segments == panel rows
    const covered = segs.reduce((acc, s) => {
        const d0 = Date.parse(`${s.startDate}T00:00:00Z`), d1 = Date.parse(`${s.endDate}T00:00:00Z`);
        return acc + Math.round((d1 - d0) / 86400000) + 1;
    }, 0);
    ok("ribbon: day coverage == panel rows", covered === fp.rows.length, `${covered} vs ${fp.rows.length}`);
    ok("ribbon: end exclusive of trade-day boundary (no look-ahead)",
        segs.every((s) => s.endMs > s.startMs && s.knownAt.endsWith("T00:00:00Z")));
    // ema line points: one per finite-ema day, ascending, warmup skipped
    const ema = emaLinePointsFromPanel(fp);
    const finiteEma = fp.rows.filter((r) => typeof r.ema === "number" && Number.isFinite(r.ema)).length;
    ok("ema: point count == finite-ema rows", ema.length === finiteEma, `${ema.length} vs ${finiteEma}`);
    ok("ema: warmup (row0 null) skipped", ema.length < fp.rows.length);
    ok("ema: strictly ascending time", ema.every((p, i) => i === 0 || Date.parse(p.time) > Date.parse(ema[i - 1].time)));
    // short labels
    ok("shortStateLabel Bull/Expand→Bull/Exp", shortStateLabel("Bull/Expand") === "Bull/Exp");
    ok("shortStateLabel Bear/Chop→Bear/Chp", shortStateLabel("Bear/Chop") === "Bear/Chp");
    ok("shortStateLabel null→''", shortStateLabel(null) === "");
    // per-trade badge matches stateForTrade
    const lastDated = fp.rows.filter((r) => r.marketState).slice(-1)[0];
    if (lastDated) {
        const b = tradeStateBadge({ fill_time: `${lastDated.date}T12:00:00Z` }, fp);
        ok("tradeStateBadge state matches panel", b && b.state === lastDated.marketState);
        ok("tradeStateBadge carries knownAt", b && typeof b.knownAt === "string");
    }
    ok("tradeStateBadge unknown day → null", tradeStateBadge({ fill_time: "1980-01-01T00:00:00Z" }, fp) === null);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\nmarketState.validate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
