// executionMarkers.js — AUDIT-ONLY Strategy Map execution overlay.
//
// PURE, client-side. Given ONE trade (the selected/inspected trade) and the
// chart's candle timestamps, returns the logical geometry for two short
// horizontal "execution markers": the EXACT entry price at the entry/fill
// candle, and the EXACT exit price at the exit candle. The component maps the
// returned {price → y} and {startTime/endTime → x} to pixels.
//
// HARD RULES (no backend / outcome changes):
//   • Never invents or mutates fills, R, outcomes, or import semantics.
//   • Uses the trade's stored prices only. When there is no explicit exit price
//     it DERIVES one from the settled outcome (WIN→tp, LOSS→stop, BE→managed
//     stop); if none is available it returns price=null and labels it "unknown"
//     rather than guessing.

const DEFAULT_SPAN = 5; // markers span ~4–5 candles, centred on the anchor candle

function fin(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function finNonZero(v) { const n = fin(v); return n != null && n !== 0 ? n : null; } // FX prices are never 0 → 0 means "missing"

// Parse a candle/trade time to UNIX seconds (matches importer.normalizeTimestamp).
export function normExecTime(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function fmtTs(sec) {
    if (sec == null) return "—";
    const dt = new Date(sec * 1000);
    return Number.isNaN(dt.getTime()) ? "—" : dt.toISOString().slice(0, 16).replace("T", " ");
}
function fmtPrice(price, pipSize) {
    if (price == null) return "unknown";
    const dp = pipSize == null ? (Math.abs(price) < 10 ? 5 : 2) : (pipSize <= 0.0001 ? 5 : pipSize <= 0.001 ? 4 : pipSize <= 0.01 ? 3 : 2);
    return Number(price).toFixed(dp);
}

// Derive the exit price + its provenance from the SETTLED trade. No guessing.
export function deriveExitPrice(trade) {
    const explicit = finNonZero(trade.exitPrice ?? trade.exit_price);
    if (explicit != null) return { price: explicit, from: "exit_price" };
    const oc = String(trade.outcomeRaw ?? trade.outcome ?? "").toLowerCase();
    const be = finNonZero(trade.beExitPrice ?? trade.be_exit_price);
    const prot = finNonZero(trade.protection_exit_price ?? trade.protectionExitPrice);
    const tp = finNonZero(trade.tp ?? trade.take_profit ?? trade.target_price ?? trade.tpPrice);
    const stop = finNonZero(trade.stop ?? trade.stop_price ?? trade.sl);
    const isBE = /\bbe\b|be_|break.?even/.test(oc);
    const isWin = /win|tp|target/.test(oc);
    const isLoss = /loss|stop|sl/.test(oc) && !isBE;
    if (isBE) {
        if (be != null) return { price: be, from: "be" };
        if (prot != null) return { price: prot, from: "protection" };
    }
    if (isWin && tp != null) return { price: tp, from: "tp" };
    if (isLoss && stop != null) return { price: stop, from: "stop" };
    // managed/protection exit even when outcome string is non-standard
    if (be != null) return { price: be, from: "be" };
    if (prot != null) return { price: prot, from: "protection" };
    return { price: null, from: null }; // unknown — do not guess
}

// Anchor = index of the candle that CONTAINS the marker time (largest time ≤ t);
// clamps to the ends; null when there are no candle times.
function anchorIndex(candleTimes, t) {
    if (!Array.isArray(candleTimes) || !candleTimes.length || t == null) return null;
    if (t <= candleTimes[0]) return 0;
    if (t >= candleTimes[candleTimes.length - 1]) return candleTimes.length - 1;
    let lo = 0, hi = candleTimes.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (candleTimes[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
}

function segment(kind, label, price, time, candleTimes, span, ctx, pipSize, derivedFrom) {
    const ai = anchorIndex(candleTimes, time);
    let startIndex = null, endIndex = null, startTime = null, endTime = null, spanCandles = null;
    if (ai != null) {
        const half = Math.floor((span - 1) / 2);
        startIndex = Math.max(0, ai - half);
        endIndex = Math.min(candleTimes.length - 1, ai + (span - 1 - half));
        startTime = candleTimes[startIndex];
        endTime = candleTimes[endIndex];
        spanCandles = endIndex - startIndex + 1;
    }
    const priceStr = fmtPrice(price, pipSize);
    const tsStr = fmtTs(time);
    const known = price != null;
    const tooltipLines = [
        `Trade #${ctx.tradeNo ?? "—"} · OB ${ctx.obId ?? "—"}`,
        known ? label : `${label} (unknown)`,
        tsStr,
        priceStr,
        `${ctx.outcome || "—"} · ${ctx.direction || "—"}`,
    ];
    return {
        kind, label: known ? label : `${label} (unknown)`,
        price, priceStr, time, anchorIndex: ai,
        startIndex, endIndex, startTime, endTime, spanCandles,
        derivedFrom, known,
        tooltipLines, tooltipText: tooltipLines.join("\n"),
    };
}

// Build the two execution markers for a single trade. Returns { ok:false } when
// there is nothing safe to draw (no trade / no entry price+time).
export function buildExecutionMarkers(trade, candleTimes = [], opts = {}) {
    if (!trade || typeof trade !== "object") return { ok: false, reason: "no trade" };
    const span = Number.isFinite(opts.spanCandles) ? Math.max(2, Math.round(opts.spanCandles)) : DEFAULT_SPAN;
    const pipSize = fin(opts.pipSize);

    const tradeNo = trade.executionTradeNumber ?? trade.execution_trade_number ?? trade.num ?? null;
    const obId = trade.displayObId || trade.obId || trade.ob_id || null;
    const direction = String(trade.direction ?? trade.dir ?? "").toLowerCase() || null;
    const outcome = String(trade.outcomeRaw ?? trade.outcome ?? "") || null;
    const ctx = { tradeNo, obId, direction, outcome };

    const entryPrice = finNonZero(trade.entryPrice ?? trade.entry_price ?? trade.entryprice);
    const entryTime = normExecTime(trade.entry ?? trade.fillTime ?? trade.fill_time ?? trade.entry_time ?? trade.entryTime);
    if (entryPrice == null || entryTime == null) return { ok: false, reason: "missing entry price/time", tradeNo, obId };

    const exitTime = normExecTime(trade.exit ?? trade.exitTime ?? trade.exit_time);
    const { price: exitPrice, from: exitFrom } = deriveExitPrice(trade);

    const markers = [segment("entry", "Entry", entryPrice, entryTime, candleTimes, span, ctx, pipSize, "entry_price")];
    // Draw an exit marker whenever we have a time to anchor it (price may be unknown).
    if (exitTime != null || exitPrice != null) {
        markers.push(segment("exit", "Exit", exitPrice, exitTime ?? entryTime, candleTimes, span, ctx, pipSize, exitFrom));
    }
    return { ok: true, tradeNo, obId, direction, outcome, markers };
}
