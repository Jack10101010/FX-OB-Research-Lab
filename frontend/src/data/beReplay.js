// beReplay.js — Break-even Replay Engine (Phase 1 · REPLAY tier)
//
// Pure functions. No React. No imports from other project modules.
// Self-contained so validation and future server-side use require no shims.
//
// ── REPLAY confidence tier ──────────────────────────────────────────────────
// Candle-resolution replay using candles.csv OHLC.
// • Spread / slippage NOT modelled.
// • Tick-level precision NOT available — candle wicks detect level touches.
// • Same-candle ambiguity handled conservatively (BE stop assumed first).
// • Results are research-grade, not authoritative. Label all output accordingly.
//
// ── Architecture note ───────────────────────────────────────────────────────
// fill_candle_index / exit_candle_index on trade rows are ABSOLUTE global
// backtester indices and MUST NOT be used as positions into candles.csv.
// (Phase 0 audit: max fill_candle_index = 369 232; candles.csv = 24 909 rows.)
// Correct approach: time-based lookup via fill_time / exit_time → nearest-prior
// candle bar. buildReplayCandleIndex + resolveTradeCandleWindow implement this.
//
// ── Trade field contract ────────────────────────────────────────────────────
// Accepts standard importer.js trade objects:
//   trade.entry        — fill time string  (NOT the entry price)
//   trade.exit         — exit time string
//   trade.entryPrice   — entry price (number)
//   trade.stop         — stop-loss price (number)
//   trade.tp           — take-profit price (number; 0 or absent = TP not set)
//   trade.direction    — "bull"/"bullish"/"long" OR "bear"/"bearish"/"short"
//   trade.r            — realized R (number; used for equity curve + metrics)
//   trade.id           — trade identifier (string)
//   trade.fill_candle_open/high/low/close — optional fill candle OHLC override
//
// ── Candle field contract ───────────────────────────────────────────────────
// Accepts parseCandlesCSV output from importer.js:
//   { i, t, time (epoch sec), o, h, l, c }
// OR any array of { time (epoch sec | ISO string), o/open, h/high, l/low, c/close }.
//
// ── Outcome states ──────────────────────────────────────────────────────────
//   original_winner          — won; BE never armed OR armed but TP reached first
//   original_loser           — lost; BE never armed
//   be_stopped_loss_saved    — was a loser; BE armed + retrace to stop → saved
//   be_stopped_winner_cut    — was a winner; BE armed + retrace before TP → cut
//   be_armed_never_triggered — BE armed; original exit without retrace
//   unchanged_missing_path   — fill/exit time not resolvable; original R stands
//   unchanged_out_of_range   — candles don't cover the trade window; original R stands

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Utilities (inlined — no external deps)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse any reasonable timestamp to integer epoch-seconds (UTC). */
function normTs(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** Round to N decimal places (default 2). */
function rnd(v, n = 2) {
    const f = 10 ** n;
    return Math.round(v * f) / f;
}

/** True when direction string means "long" (bull). */
function isLong(direction) {
    const d = String(direction || "").toLowerCase();
    return d.startsWith("bull") || d.startsWith("long") || d === "buy";
}

/** Get candle O/H/L/C from either parseCandlesCSV format {o,h,l,c} or raw {open,high,low,close}. */
function ohlc(c) {
    return {
        o: c.o ?? c.open ?? 0,
        h: c.h ?? c.high ?? 0,
        l: c.l ?? c.low ?? 0,
        cc: c.c ?? c.close ?? 0,
    };
}

/** Candle time as epoch-seconds (handles parseCandlesCSV {time} or raw {time/t} strings). */
function candleTime(c) {
    return normTs(c.time ?? c.t ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Candle index (time-based lookup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a time-based lookup index from a candles array.
 * Returns { byTime: Map<epochSec→rowIndex>, ordered: [{time,i}], toleranceSec, intervalSec }.
 *
 * toleranceSec is 1.5× the median interval — the same generous window used
 * by importer.js's timeToCandleIndex so fill times that fall mid-bar still
 * resolve to the correct prior bar.
 */
export function buildReplayCandleIndex(candles) {
    if (!Array.isArray(candles) || !candles.length) {
        return { byTime: new Map(), ordered: [], toleranceSec: 3600, intervalSec: 0 };
    }
    const byTime = new Map();
    const ordered = [];
    for (let i = 0; i < candles.length; i++) {
        const t = candleTime(candles[i]);
        if (t == null) continue;
        byTime.set(t, i);
        ordered.push({ time: t, i });
    }
    ordered.sort((a, b) => a.time - b.time);
    const gaps = [];
    for (let j = 1; j < ordered.length; j++) {
        const g = ordered[j].time - ordered[j - 1].time;
        if (g > 0) gaps.push(g);
    }
    gaps.sort((a, b) => a - b);
    const intervalSec = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3600;
    const toleranceSec = Math.max(3600, Math.floor(intervalSec * 1.5));
    return { byTime, ordered, toleranceSec, intervalSec };
}

/**
 * Find the row index of the nearest-prior candle for a given epoch-seconds timestamp.
 * Returns -1 when no candle is within toleranceSec.
 */
function findNearestPrior(epochSec, candleIdx) {
    if (!candleIdx || epochSec == null) return -1;
    const { byTime, ordered, toleranceSec } = candleIdx;

    // Exact hit first (fill_time exactly on bar open)
    if (byTime.has(epochSec)) return byTime.get(epochSec);

    // Binary search for largest time ≤ epochSec
    let lo = 0, hi = ordered.length - 1, best = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ordered[mid].time <= epochSec) { best = ordered[mid]; lo = mid + 1; }
        else hi = mid - 1;
    }
    if (best && epochSec - best.time <= toleranceSec) return best.i;
    return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Trade candle window resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the candle slice for a single trade.
 *
 * Returns:
 *   { valid: true,  fillRow, exitRow, fillCandleOhlc }
 *   { valid: false, reason: 'missing_time' | 'unresolved_fill' | 'unresolved_exit' | 'out_of_range' | 'zero_length' }
 *
 * fillCandleOhlc: uses trade.fill_candle_open/h/l/c if all four are finite numbers
 * (the authoritative fill-bar OHLC from the backtester), otherwise falls back to
 * candles[fillRow]. The fill candle is included in the slice but not walked for
 * arm/exit signals — we start from the next bar.
 */
export function resolveTradeCandleWindow(trade, candles, candleIdx) {
    const fillTs = normTs(trade.entry);   // trade.entry = fill_time string
    const exitTs = normTs(trade.exit);    // trade.exit  = exit_time string

    if (fillTs == null || exitTs == null) return { valid: false, reason: "missing_time" };

    const fillRow = findNearestPrior(fillTs, candleIdx);
    if (fillRow < 0) return { valid: false, reason: "unresolved_fill" };

    // Exit candle: allow fill candle itself as exit (same-candle exits, bars_to_exit=0)
    const exitRow = findNearestPrior(exitTs, candleIdx);
    if (exitRow < 0) return { valid: false, reason: "unresolved_exit" };

    // Range guard: both rows must be within the candle array
    if (fillRow >= candles.length || exitRow >= candles.length) {
        return { valid: false, reason: "out_of_range" };
    }

    // Degenerate same-candle exit: fillRow === exitRow (bars_to_exit = 0)
    // The walk has no candles to check; treat as original outcome unchanged
    if (fillRow === exitRow) return { valid: false, reason: "zero_length" };

    // Prefer trade's fill candle OHLC when all four are finite (authoritative)
    const fo = Number(trade.fill_candle_open);
    const fh = Number(trade.fill_candle_high);
    const fl = Number(trade.fill_candle_low);
    const fc = Number(trade.fill_candle_close);
    const hasFillOhlc = isFinite(fo) && isFinite(fh) && isFinite(fl) && isFinite(fc)
        && (fh > 0 || fl > 0);   // guard against all-zero default
    const fillCandleOhlc = hasFillOhlc
        ? { o: fo, h: fh, l: fl, cc: fc }
        : null;  // will fall back to candles[fillRow] in caller

    return { valid: true, fillRow, exitRow, fillCandleOhlc };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Per-trade candle walk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay BE protection for a single trade.
 *
 * params: {
 *   armLevelR      number  — R above entry (long) / below entry (short). Default 0.5.
 *   stopMode       string  — 'entry' | 'entry_buffer_r'. Default 'entry'.
 *   bufferR        number  — BE stop buffer in R (stopMode=entry_buffer_r). Default 0.
 *   triggerBasis   string  — 'wick' | 'close' | 'next_candle'. Default 'wick'.
 *   delayCandles   number  — extra candles after trigger before BE is active. Default 0.
 * }
 *
 * Returns a TradeReplayResult:
 * {
 *   id, originalR, replayR, deltaR, outcome,
 *   armTriggered, beStopped,
 *   armCandleTime, beExitCandleTime,
 *   sameCandleAmbiguous,
 * }
 */
export function replayBeTrade(trade, candles, candleIdx, params = {}) {
    const {
        armLevelR    = 0.5,
        stopMode     = "entry",
        bufferR      = 0,
        triggerBasis = "wick",
        delayCandles = 0,
    } = params;

    const id        = trade.id ?? "";
    const originalR = Number(trade.r) || 0;
    const long      = isLong(trade.direction);

    const entryPx   = Number(trade.entryPrice) || 0;
    const slPx      = Number(trade.stop) || 0;
    const tpPx      = Number(trade.tp) || 0;
    const hasTp     = isFinite(tpPx) && tpPx > 0;
    const stopDist  = Math.abs(entryPx - slPx);

    // Degenerate: no valid price data — pass through
    if (!entryPx || !slPx || stopDist < 1e-10) {
        return _unchanged(id, originalR, "unchanged_missing_path");
    }

    // Arm price (where BE becomes armed)
    const armPrice = long
        ? entryPx + armLevelR * stopDist
        : entryPx - armLevelR * stopDist;

    // BE stop price (where BE stop order sits)
    const beBuf = stopMode === "entry_buffer_r" ? Number(bufferR) || 0 : 0;
    const beStopPx = long
        ? entryPx - beBuf * stopDist
        : entryPx + beBuf * stopDist;

    // Resolve candle window
    const win = resolveTradeCandleWindow(trade, candles, candleIdx);
    if (!win.valid) {
        const reason = win.reason === "out_of_range"
            ? "unchanged_out_of_range"
            : "unchanged_missing_path";
        return _unchanged(id, originalR, reason);
    }

    const { fillRow, exitRow, fillCandleOhlc } = win;

    // Build the slice; replace first element OHLC with trade's fill candle if available
    const slice = candles.slice(fillRow, exitRow + 1);
    if (fillCandleOhlc) {
        slice[0] = { ...slice[0], ...fillCandleOhlc,
            o: fillCandleOhlc.o, h: fillCandleOhlc.h, l: fillCandleOhlc.l,
            c: fillCandleOhlc.cc };
    }

    // Walk: start from index 1 (first candle AFTER fill)
    let state      = "watching";   // → "pending" → "armed"
    let pendingAt  = -1;           // slice index when BE becomes active
    let armSliceIdx = -1;          // slice index where arm was first detected
    let armCandleTime     = null;
    let beExitCandleTime  = null;
    let sameCandleAmbiguous = false;

    for (let i = 1; i < slice.length; i++) {
        const c = ohlc(slice[i]);
        const ct = candleTime(slice[i]);

        // ── 1. Check for arm level (only in watching state) ───────────────
        if (state === "watching") {
            const armHit = triggerBasis === "close"
                ? (long ? c.cc >= armPrice : c.cc <= armPrice)
                : (long ? c.h  >= armPrice : c.l  <= armPrice);  // wick (default) or next_candle detection

            if (armHit) {
                armCandleTime = ct;
                armSliceIdx = i;
                const activateOffset = triggerBasis === "next_candle" ? 1 : 0;
                pendingAt = i + activateOffset + (Number(delayCandles) || 0);
                state = "pending";
                // Fall through: if pendingAt === i, immediately transition to armed
            }
        }

        // ── 2. Pending → armed transition ─────────────────────────────────
        if (state === "pending" && i >= pendingAt) {
            state = "armed";
        }

        // ── 3. Armed: check TP / BE stop ──────────────────────────────────
        if (state === "armed") {
            const tpHit = hasTp && (long ? c.h >= tpPx : c.l <= tpPx);
            const beHit = long ? c.l <= beStopPx : c.h >= beStopPx;

            if (tpHit && beHit) {
                // Same-candle ambiguity: conservative → BE stop triggered first
                sameCandleAmbiguous = true;
                beExitCandleTime = ct;
                return _beTriggered(id, originalR, beExitCandleTime, armCandleTime,
                    sameCandleAmbiguous, "be_stopped_same_candle");
            }

            if (beHit) {
                // Arm + BE stop hit on the same candle → conservative (BE assumed first)
                if (armSliceIdx === i) sameCandleAmbiguous = true;
                beExitCandleTime = ct;
                return _beTriggered(id, originalR, beExitCandleTime, armCandleTime,
                    sameCandleAmbiguous, null);
            }

            if (tpHit) {
                // BE was armed but TP hit first — winner, unchanged
                return {
                    id, originalR, replayR: originalR, deltaR: 0,
                    outcome: "original_winner",
                    armTriggered: true, beStopped: false,
                    armCandleTime, beExitCandleTime: null,
                    sameCandleAmbiguous: false,
                };
            }
        }
    }

    // Exhausted slice without exit
    if (state === "armed" || state === "pending") {
        // BE armed but original exit occurred without retrace
        return {
            id, originalR, replayR: originalR, deltaR: 0,
            outcome: "be_armed_never_triggered",
            armTriggered: true, beStopped: false,
            armCandleTime, beExitCandleTime: null,
            sameCandleAmbiguous: false,
        };
    }

    // BE never armed — original outcome stands
    const outcome = originalR >= 0 ? "original_winner" : "original_loser";
    return { id, originalR, replayR: originalR, deltaR: 0,
        outcome, armTriggered: false, beStopped: false,
        armCandleTime: null, beExitCandleTime: null, sameCandleAmbiguous: false };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function _unchanged(id, originalR, outcome) {
    return { id, originalR, replayR: originalR, deltaR: 0, outcome,
        armTriggered: false, beStopped: false,
        armCandleTime: null, beExitCandleTime: null, sameCandleAmbiguous: false };
}

function _beTriggered(id, originalR, beExitCandleTime, armCandleTime, sameCandleAmbiguous, _hint) {
    // BE exit R ≈ 0 (entry-stop, no spread modelled)
    const replayR  = 0;
    const deltaR   = rnd(replayR - originalR);
    const outcome  = originalR >= 0
        ? "be_stopped_winner_cut"
        : "be_stopped_loss_saved";
    return { id, originalR, replayR, deltaR, outcome,
        armTriggered: true, beStopped: true,
        armCandleTime, beExitCandleTime, sameCandleAmbiguous };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Scenario runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay BE protection across an entire trade population.
 *
 * trades  — array of importer.js trade objects (run.trades or similar)
 * candles — array from parseCandlesCSV (run.candles)
 * params  — same params as replayBeTrade
 *
 * Returns an array of TradeReplayResult objects (one per trade), sorted by
 * fill-time chronologically so equity-curve / streak computation is correct.
 */
export function replayBeScenario(trades, candles, params = {}) {
    if (!Array.isArray(trades) || !trades.length) return [];
    if (!Array.isArray(candles) || !candles.length) {
        // No candle data — every trade is unchanged_missing_path
        return trades.map((t) => _unchanged(t.id ?? "", Number(t.r) || 0, "unchanged_missing_path"));
    }

    const candleIdx = buildReplayCandleIndex(candles);

    // Sort by fill-time so equity curve is chronological
    const sorted = [...trades].sort((a, b) => {
        const ta = normTs(a.entry) ?? 0;
        const tb = normTs(b.entry) ?? 0;
        return ta - tb;
    });

    return sorted.map((t) => replayBeTrade(t, candles, candleIdx, params));
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6  Equity curve
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an equity curve from scenario results (already chronologically sorted
 * by replayBeScenario).
 *
 * Returns array of { i, netR } matching the shape of importer.js computeEquityCurve.
 * i is the sequential index; netR is cumulative R rounded to 2dp.
 */
export function buildBeEquityCurve(results) {
    if (!Array.isArray(results) || !results.length) return [];
    let cum = 0;
    return results.map((res, i) => {
        cum += res.replayR;
        return { i, netR: rnd(cum) };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7  Max drawdown (inline — mirrors resultsBasis.maxDrawdownFromCurve)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute maximum drawdown from an equity curve array of { netR } points.
 * Returns ≤ 0, or null for an empty curve.
 * Positive delta vs baseline → improvement (drawdown reduced in magnitude).
 */
function maxDdFromCurve(curve) {
    if (!Array.isArray(curve) || !curve.length) return null;
    let peak = -Infinity, maxDd = 0;
    for (const p of curve) {
        const v = Number(p.netR);
        if (!isFinite(v)) continue;
        if (v > peak) peak = v;
        const dd = v - peak;
        if (dd < maxDd) maxDd = dd;
    }
    return maxDd;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8  Scenario summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute all required scenario metrics from replayBeScenario() results.
 *
 * results  — output of replayBeScenario() (chronologically sorted)
 * baseline — optional pre-computed baseline { netR, maxDrawdown, profitFactor,
 *            worstLossStreak } for delta calculations. When absent, deltas are null.
 *
 * Returns BeScenarioSummary:
 * {
 *   // coverage
 *   tradeCount, replayedCount, coveragePct,
 *   missingPathCount, outOfRangeCount, sameCandleAmbiguousCount,
 *
 *   // P&L
 *   netR, baselineNetR, deltaNetR,
 *   profitFactor, baselineProfitFactor, deltaProfitFactor,
 *
 *   // win / loss composition
 *   winCount, lossCount, beExitCount,
 *   winnersCut, lossesSaved,
 *   winnerRCost, loserRSaved, efficiencyRatio,
 *
 *   // drawdown (≤ 0; positive delta = improvement)
 *   maxDrawdown, baselineMaxDrawdown, deltaMaxDrawdown,
 *
 *   // streak
 *   worstLossStreak, baselineWorstLossStreak, deltaWorstLossStreak,
 *
 *   // raw equity curve for overlay
 *   equityCurve,
 * }
 */
export function buildBeScenarioSummary(results, baseline = null) {
    if (!Array.isArray(results)) results = [];

    const tradeCount = results.length;
    let replayedCount = 0;
    let missingPathCount = 0;
    let outOfRangeCount = 0;
    let sameCandleAmbiguousCount = 0;

    let netR = 0;
    let winCount = 0;
    let lossCount = 0;
    let beExitCount = 0;
    let winnersCut = 0;
    let lossesSaved = 0;
    let sumPos = 0;   // for profit factor
    let sumNeg = 0;

    for (const res of results) {
        if (res.outcome === "unchanged_missing_path") { missingPathCount++; }
        else if (res.outcome === "unchanged_out_of_range") { outOfRangeCount++; }
        else { replayedCount++; }

        if (res.sameCandleAmbiguous) sameCandleAmbiguousCount++;

        const r = res.replayR;
        netR += r;
        if (r > 0) { winCount++; sumPos += r; }
        else if (r < 0) { lossCount++; sumNeg += r; }

        if (res.beStopped) beExitCount++;
        if (res.outcome === "be_stopped_winner_cut")  winnersCut++;
        if (res.outcome === "be_stopped_loss_saved")  lossesSaved++;
    }

    const winnerRCost  = rnd(winnersCut > 0
        ? results.filter((r) => r.outcome === "be_stopped_winner_cut")
              .reduce((s, r) => s + (r.originalR - r.replayR), 0)
        : 0);
    const loserRSaved  = rnd(lossesSaved > 0
        ? results.filter((r) => r.outcome === "be_stopped_loss_saved")
              .reduce((s, r) => s + (r.replayR - r.originalR), 0)   // replayR(0) - originalR(neg) > 0
        : 0);
    const efficiencyRatio = winnerRCost > 0
        ? rnd(loserRSaved / winnerRCost)
        : (loserRSaved > 0 ? null : null);   // undefined when no BE triggered

    const profitFactor = sumNeg < 0 ? rnd(sumPos / Math.abs(sumNeg)) : (sumPos > 0 ? null : null);
    const coveragePct  = tradeCount > 0 ? rnd((replayedCount / tradeCount) * 100) : 0;

    const equityCurve  = buildBeEquityCurve(results);
    const maxDrawdown  = maxDdFromCurve(equityCurve);

    // Worst consecutive loss streak
    const worstLossStreak = _worstLossStreak(results);

    // Baseline deltas
    const baselineNetR          = baseline?.netR ?? null;
    const baselineMaxDrawdown   = baseline?.maxDrawdown ?? null;
    const baselineProfitFactor  = baseline?.profitFactor ?? null;
    const baselineWorstLossStreak = baseline?.worstLossStreak ?? null;

    const deltaNetR          = baselineNetR != null ? rnd(netR - baselineNetR) : null;
    const deltaMaxDrawdown   = (maxDrawdown != null && baselineMaxDrawdown != null)
        ? rnd(maxDrawdown - baselineMaxDrawdown)   // negative = worse; positive = better
        : null;
    const deltaProfitFactor  = (profitFactor != null && baselineProfitFactor != null)
        ? rnd(profitFactor - baselineProfitFactor)
        : null;
    const deltaWorstLossStreak = (baselineWorstLossStreak != null)
        ? worstLossStreak - baselineWorstLossStreak  // negative = fewer; positive = more
        : null;

    return {
        tradeCount, replayedCount, coveragePct,
        missingPathCount, outOfRangeCount, sameCandleAmbiguousCount,
        netR: rnd(netR), baselineNetR, deltaNetR,
        profitFactor, baselineProfitFactor, deltaProfitFactor,
        winCount, lossCount, beExitCount,
        winnersCut, lossesSaved,
        winnerRCost, loserRSaved, efficiencyRatio,
        maxDrawdown, baselineMaxDrawdown, deltaMaxDrawdown,
        worstLossStreak, baselineWorstLossStreak, deltaWorstLossStreak,
        equityCurve,
    };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Count the longest run of consecutive negative-R trades in results. */
function _worstLossStreak(results) {
    let worst = 0, cur = 0;
    for (const res of results) {
        if (res.replayR < 0) { cur++; if (cur > worst) worst = cur; }
        else cur = 0;
    }
    return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9  Data-availability gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether the BE Replay feature can run against a given run.
 *
 * Returns {
 *   available: boolean,
 *   reason: 'ok' | 'no_candles' | 'no_filled_trades' | 'low_coverage',
 *   coveragePct: number,   // % of filled trades with resolvable candle windows
 *   filledCount: number,
 *   resolvedCount: number,
 * }
 */
export function beReplayAvailability(trades, candles) {
    if (!Array.isArray(candles) || !candles.length) {
        return { available: false, reason: "no_candles", coveragePct: 0,
            filledCount: 0, resolvedCount: 0 };
    }

    const filled = (Array.isArray(trades) ? trades : []).filter(
        (t) => t.entry && t.exit   // has fill/exit time strings
    );
    if (!filled.length) {
        return { available: false, reason: "no_filled_trades", coveragePct: 0,
            filledCount: 0, resolvedCount: 0 };
    }

    const candleIdx = buildReplayCandleIndex(candles);
    let resolvedCount = 0;
    for (const t of filled) {
        const w = resolveTradeCandleWindow(t, candles, candleIdx);
        if (w.valid) resolvedCount++;
    }
    const coveragePct = rnd((resolvedCount / filled.length) * 100);
    const available   = coveragePct >= 50;   // phase 0 audit: anything below 50% = blocked
    const reason      = available ? "ok" : "low_coverage";

    return { available, reason, coveragePct, filledCount: filled.length, resolvedCount };
}
