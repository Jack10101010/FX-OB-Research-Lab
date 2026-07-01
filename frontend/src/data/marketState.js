// ── marketState.js ─────────────────────────────────────────────────────────
// Market State / Regime Gate — pure client-side computation (Phase 0 foundation).
//
// Faithful JS port of the validated Lux-OB-Backtester research engine
// (outputs/research/eurusd_market_state_engine/state_dynamics.py,
//  eurusd_richer_regime_gates/richer_gates.py, dynamic_risk_phase1_stopmove/
//  analyze_stopmove.py::daily_features/in_gate). Reference formulas:
//
//   daily resample (UTC) → open=first, high=max, low=min, close=last
//   ema200      = close.ewm(span=200, adjust=False).mean()
//   px_vs_200   = (close - ema200) / ema200 * 100
//   ma20 = close.rolling(20).mean(); sd20 = close.rolling(20).std()  (ddof=1)
//   bbw         = (4 * sd20) / ma20 * 100
//   tr          = max(high-low, |high-prevClose|, |low-prevClose|)
//   atr         = tr.ewm(alpha=1/14, adjust=False).mean()
//   +DM = where((up>dn)&(up>0), up, 0);  up = high.diff()
//   -DM = where((dn>up)&(dn>0), dn, 0);  dn = -low.diff()
//   +DI = 100 * ewm(+DM, 1/14).mean() / atr
//   -DI = 100 * ewm(-DM, 1/14).mean() / atr
//   dx  = 100 * |+DI - -DI| / (+DI + -DI)
//   adx = dx.ewm(alpha=1/14, adjust=False).mean()
//   → panel[[px_vs_200, bbw, adx]] = panel.shift(1)     (no look-ahead)
//
// State classifier (state_dynamics.py::env):
//   trend      = px_vs_200 > 0 ? "Bull" : "Bear"
//   if adx < 18                 → `${trend}/Chop`         (chop overrides vol)
//   else                        → `${trend}/${bbw > BBW ? "Expand" : "Compress"}`
//
// Gate (analyze_stopmove.py::in_gate) — long-vol filter only on the long side:
//   long  kept if px_vs_200 > 0  AND bbw > BBW
//   short kept if px_vs_200 <= 0
//
// LEAKAGE: the panel is shifted one day, so the state for a trade on day D is
// computed from completed daily candles strictly before D (through D-1 close).
// `known_at` = start of day D (UTC) = the D-1 close boundary; `shiftedDays` = 1.
//
// This module is dependency-free and side-effect-free. It NEVER changes fills or
// R — it is a label/overlay/filter helper only. All consumers are off by default.
// ─────────────────────────────────────────────────────────────────────────────

// Per-instrument locked Bollinger-width thresholds from the research
// (EURUSD median 2.342 locked in discovery; GBPUSD 2.67). Applied without refit.
export const BBW_THRESHOLD_BY_SYMBOL = Object.freeze({
    EURUSD: 2.342,
    GBPUSD: 2.67,
});
export const DEFAULT_BBW_THRESHOLD = 2.342;

// Provenance tag stamped on every panel/row. `source: "client"` marks these values
// as the CLIENT-SIDE port — a fast, leakage-audited approximation for label/overlay/
// filter UX, NOT the authoritative engine truth. When Lux-OB-Backtester later emits
// per-trade regime columns (Phase 3), those carry `source: "engine"` and consumers
// must prefer them. `version` bumps whenever the client formula/defaults change so a
// stamped value can always be traced to the exact logic that produced it.
export const MARKET_STATE_SOURCE = "client";
export const MARKET_STATE_ENGINE_VERSION = "client-0.1.0";

export const MARKET_STATES = Object.freeze([
    "Bull/Expand", "Bull/Compress", "Bull/Chop",
    "Bear/Expand", "Bear/Compress", "Bear/Chop",
]);

export const REGIME_DEFAULTS = Object.freeze({
    emaLength: 200,
    bbwLength: 20,
    bbwStdDev: 2,
    adxLength: 14,
    adxChop: 18,
    emaConfirmDays: 0,
    bbwThresholdMode: "fixed",   // "fixed" | "median" | "percentile"
    bbwPercentile: 50,
});

// ── small numeric helpers ────────────────────────────────────────────────────

function isNum(v) {
    return typeof v === "number" && Number.isFinite(v);
}

// pandas ewm(..., adjust=False).mean(): y0 = x0, yt = (1-a)*y(t-1) + a*xt.
// Leading nulls pass through until the first finite value seeds the recursion.
function ewmAdjustFalse(values, alpha) {
    const out = new Array(values.length).fill(null);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
        const x = values[i];
        if (!isNum(x)) { out[i] = prev; continue; }
        prev = prev == null ? x : (1 - alpha) * prev + alpha * x;
        out[i] = prev;
    }
    return out;
}

function rollingMean(values, window) {
    const out = new Array(values.length).fill(null);
    for (let i = window - 1; i < values.length; i++) {
        let sum = 0, ok = true;
        for (let j = i - window + 1; j <= i; j++) {
            if (!isNum(values[j])) { ok = false; break; }
            sum += values[j];
        }
        if (ok) out[i] = sum / window;
    }
    return out;
}

// sample std (ddof=1) to match pandas Series.rolling().std()
function rollingStd(values, window) {
    const out = new Array(values.length).fill(null);
    if (window < 2) return out;
    for (let i = window - 1; i < values.length; i++) {
        let sum = 0, ok = true;
        for (let j = i - window + 1; j <= i; j++) {
            if (!isNum(values[j])) { ok = false; break; }
            sum += values[j];
        }
        if (!ok) continue;
        const mean = sum / window;
        let sq = 0;
        for (let j = i - window + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
        out[i] = Math.sqrt(sq / (window - 1));
    }
    return out;
}

function quantile(sortedAsc, q) {
    if (!sortedAsc.length) return null;
    if (sortedAsc.length === 1) return sortedAsc[0];
    const pos = (sortedAsc.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sortedAsc[lo];
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

// ── time / candle normalization ──────────────────────────────────────────────

// Extract a UTC calendar-date key "YYYY-MM-DD" from a variety of time encodings:
// epoch seconds, epoch millis, ISO string, or an already-"YYYY-MM-DD" string.
export function utcDateKey(value) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000; // >1e12 ⇒ already ms
        return new Date(ms).toISOString().slice(0, 10);
    }
    if (typeof value === "string") {
        // Fast path: leading "YYYY-MM-DD".
        const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    return null;
}

function candleTime(c) {
    return c?.t ?? c?.time ?? c?.timestamp ?? c?.datetime ?? null;
}
function candleO(c) { return c?.o ?? c?.open; }
function candleH(c) { return c?.h ?? c?.high; }
function candleL(c) { return c?.l ?? c?.low; }
function candleC(c) { return c?.c ?? c?.close; }

function tradeTime(t) {
    return t?.fill_time ?? t?.fillTime ?? t?.entry_time ?? t?.entryTime
        ?? t?.entry ?? t?.time ?? t?.timestamp ?? null;
}

// Resample arbitrary-granularity candles to UTC daily OHLC, sorted by date.
export function resampleDaily(candles) {
    const byDate = new Map();
    for (const c of candles || []) {
        const key = utcDateKey(candleTime(c));
        const o = candleO(c), h = candleH(c), l = candleL(c), close = candleC(c);
        if (key == null || !isNum(o) || !isNum(h) || !isNum(l) || !isNum(close)) continue;
        const row = byDate.get(key);
        if (!row) {
            byDate.set(key, { date: key, open: o, high: h, low: l, close });
        } else {
            row.high = Math.max(row.high, h);
            row.low = Math.min(row.low, l);
            row.close = close; // last wins (candles assumed chronological within a day)
        }
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ── threshold resolution ─────────────────────────────────────────────────────

// Resolve the BBW Expand/Compress threshold. Default "fixed" uses the locked
// per-symbol research value (leakage-safe). "median"/"percentile" are computed
// over the supplied window and are flagged in-sample (mild look-ahead) — the
// caller records `bbwThresholdInSample` so consumers can surface the caveat.
export function resolveBbwThreshold(bbwSeries, cfg, symbol) {
    const mode = cfg?.bbwThresholdMode ?? REGIME_DEFAULTS.bbwThresholdMode;
    if (mode === "fixed") {
        const v = Number(cfg?.bbwThresholdValue);
        const fixed = Number.isFinite(v) && v > 0
            ? v
            : (BBW_THRESHOLD_BY_SYMBOL[symbol] ?? DEFAULT_BBW_THRESHOLD);
        return { threshold: fixed, inSample: false };
    }
    const finite = (bbwSeries || []).filter(isNum).sort((a, b) => a - b);
    if (!finite.length) {
        return { threshold: BBW_THRESHOLD_BY_SYMBOL[symbol] ?? DEFAULT_BBW_THRESHOLD, inSample: false };
    }
    if (mode === "percentile") {
        const pct = Number(cfg?.bbwPercentile ?? REGIME_DEFAULTS.bbwPercentile);
        const q = Math.min(1, Math.max(0, (Number.isFinite(pct) ? pct : 50) / 100));
        return { threshold: quantile(finite, q), inSample: true };
    }
    // median
    return { threshold: quantile(finite, 0.5), inSample: true };
}

// ── state classification ─────────────────────────────────────────────────────

export function classifyState({ pxVsEma, bbw, adx }, bbwThreshold, adxChop) {
    if (!isNum(pxVsEma) || !isNum(bbw) || !isNum(adx)) return null;
    const trend = pxVsEma > 0 ? "Bull" : "Bear";
    let volatility, chop;
    if (adx < adxChop) {
        chop = "Chop";
        volatility = bbw > bbwThreshold ? "Expand" : "Compress"; // retained for detail
        return {
            marketState: `${trend}/Chop`,
            trendState: trend,
            volatilityState: volatility,
            chopState: "Chop",
        };
    }
    chop = "Trend";
    volatility = bbw > bbwThreshold ? "Expand" : "Compress";
    return {
        marketState: `${trend}/${volatility}`,
        trendState: trend,
        volatilityState: volatility,
        chopState: "Trend",
    };
}

// Gate predicate (filter mode). `direction` is "long"|"short" (or bull*/bear*).
export function inGate(direction, row, bbwThreshold) {
    if (!row || !isNum(row.pxVsEma) || !isNum(row.bbw)) return true; // unknown ⇒ don't block
    const dir = String(direction || "").toLowerCase();
    const isLong = dir.startsWith("long") || dir.startsWith("bull") || dir === "buy";
    if (isLong) return row.pxVsEma > 0 && row.bbw > bbwThreshold;
    return row.pxVsEma <= 0;
}

// ── main panel builder ───────────────────────────────────────────────────────

/**
 * Build the leakage-safe daily regime panel from (any-granularity) candles.
 *
 * @param {Array} candles  [{ t|time, o|open, h|high, l|low, c|close }, ...]
 * @param {Object} cfg      regime config (see REGIME_DEFAULTS + market_state_config_design.md)
 * @param {string} symbol   e.g. "EURUSD" (drives the default BBW threshold)
 * @returns {{ rows, byDate, bbwThreshold, bbwThresholdInSample, shiftedDays }}
 *          rows[i] = { date, ema, pxVsEma, bbw, adx, ...state, confirmed, knownAt }
 *          — all indicator/state values are ALREADY shifted one day.
 */
export function daily_regime_panel(candles, cfg = {}, symbol = "EURUSD") {
    const daily = resampleDaily(candles);
    const n = daily.length;
    const emptyPanel = { rows: [], byDate: new Map(), bbwThreshold: null, bbwThresholdInSample: false, shiftedDays: 1, source: MARKET_STATE_SOURCE, version: MARKET_STATE_ENGINE_VERSION };
    if (!n) return emptyPanel;

    const emaLen = Number(cfg.emaLength) || REGIME_DEFAULTS.emaLength;
    const bbwLen = Number(cfg.bbwLength) || REGIME_DEFAULTS.bbwLength;
    const stdMult = Number(cfg.bbwStdDev) || REGIME_DEFAULTS.bbwStdDev;
    const adxLen = Number(cfg.adxLength) || REGIME_DEFAULTS.adxLength;
    const adxChop = Number(cfg.adxChop) || REGIME_DEFAULTS.adxChop;
    const confirmDays = Math.max(0, Number(cfg.emaConfirmDays) || 0);

    const close = daily.map((d) => d.close);
    const high = daily.map((d) => d.high);
    const low = daily.map((d) => d.low);

    // EMA + px_vs_ema
    const ema = ewmAdjustFalse(close, 2 / (emaLen + 1));
    const pxVsEma = close.map((cV, i) =>
        isNum(cV) && isNum(ema[i]) && ema[i] !== 0 ? (cV - ema[i]) / ema[i] * 100 : null);

    // BBW = (2 * stdMult * sd) / ma * 100   (research uses stdMult=2 → factor 4)
    const ma = rollingMean(close, bbwLen);
    const sd = rollingStd(close, bbwLen);
    const bbw = close.map((_, i) =>
        isNum(sd[i]) && isNum(ma[i]) && ma[i] !== 0 ? (2 * stdMult * sd[i]) / ma[i] * 100 : null);

    // ATR + ADX (Wilder via ewm alpha=1/adxLen)
    const tr = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
        const hl = high[i] - low[i];
        if (i === 0) { tr[i] = isNum(hl) ? hl : null; continue; }
        const pc = close[i - 1];
        tr[i] = Math.max(hl, Math.abs(high[i] - pc), Math.abs(low[i] - pc));
    }
    const alpha = 1 / adxLen;
    const atr = ewmAdjustFalse(tr, alpha);
    const plusDM = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const up = high[i] - high[i - 1];
        const dn = -(low[i] - low[i - 1]);
        plusDM[i] = up > dn && up > 0 ? up : 0;
        minusDM[i] = dn > up && dn > 0 ? dn : 0;
    }
    const plusSm = ewmAdjustFalse(plusDM, alpha);
    const minusSm = ewmAdjustFalse(minusDM, alpha);
    const pdi = plusSm.map((v, i) => isNum(v) && isNum(atr[i]) && atr[i] !== 0 ? 100 * v / atr[i] : null);
    const mdi = minusSm.map((v, i) => isNum(v) && isNum(atr[i]) && atr[i] !== 0 ? 100 * v / atr[i] : null);
    const dx = pdi.map((p, i) => {
        const m = mdi[i];
        if (!isNum(p) || !isNum(m) || (p + m) === 0) return null;
        return 100 * Math.abs(p - m) / (p + m);
    });
    const adx = ewmAdjustFalse(dx, alpha);

    // Assemble UNSHIFTED per-day features, then shift by one day (leakage guard).
    const feat = daily.map((d, i) => ({
        date: d.date,
        ema: ema[i],
        pxVsEma: pxVsEma[i],
        bbw: bbw[i],
        adx: adx[i],
    }));

    const { threshold: bbwThreshold, inSample: bbwThresholdInSample } =
        resolveBbwThreshold(bbw, cfg, symbol);

    const rows = [];
    const byDate = new Map();
    let sameSideRun = 0;
    let prevTrend = null;
    for (let i = 0; i < n; i++) {
        const date = daily[i].date;                 // the DAY this row is FOR
        const src = i > 0 ? feat[i - 1] : null;      // shifted: uses D-1 features
        const knownAt = `${date}T00:00:00Z`;         // start of D == D-1 close boundary
        if (!src) {
            const row = {
                date, ema: null, pxVsEma: null, bbw: null, adx: null,
                marketState: null, trendState: null, volatilityState: null, chopState: null,
                bbwThreshold, confirmed: false, knownAt, shiftedDays: 1,
                source: MARKET_STATE_SOURCE, version: MARKET_STATE_ENGINE_VERSION,
            };
            rows.push(row); byDate.set(date, row);
            continue;
        }
        const state = classifyState(
            { pxVsEma: src.pxVsEma, bbw: src.bbw, adx: src.adx }, bbwThreshold, adxChop);

        // Confirmation: N consecutive completed daily closes on the same trend side.
        const trend = state?.trendState ?? null;
        if (trend && trend === prevTrend) sameSideRun += 1;
        else sameSideRun = 1;
        prevTrend = trend;
        const confirmed = confirmDays <= 0 ? true : sameSideRun >= (confirmDays + 1);

        const row = {
            date,
            ema: src.ema,
            pxVsEma: src.pxVsEma,
            bbw: src.bbw,
            adx: src.adx,
            marketState: state?.marketState ?? null,
            trendState: state?.trendState ?? null,
            volatilityState: state?.volatilityState ?? null,
            chopState: state?.chopState ?? null,
            bbwThreshold,
            confirmed,
            knownAt,
            shiftedDays: 1,
            source: MARKET_STATE_SOURCE,
            version: MARKET_STATE_ENGINE_VERSION,
        };
        rows.push(row);
        byDate.set(date, row);
    }

    return {
        rows, byDate, bbwThreshold, bbwThresholdInSample, shiftedDays: 1,
        source: MARKET_STATE_SOURCE, version: MARKET_STATE_ENGINE_VERSION,
    };
}

/**
 * Look up the leakage-safe market state for a single trade.
 * @param {Object} trade  carries fill_time / entry_time / time
 * @param {Object} panel  result of daily_regime_panel()
 * @returns row (or null when the trade day is unknown / in the warmup window)
 */
export function stateForTrade(trade, panel) {
    if (!panel || !panel.byDate) return null;
    const key = utcDateKey(tradeTime(trade));
    if (key == null) return null;
    return panel.byDate.get(key) ?? null;
}

/**
 * Filter-mode predicate for a trade against an allowed-states set.
 * Returns true (KEEP) when the trade's state ∈ allowedStates, or when the state
 * is unknown (never silently drop uninstrumented trades). Empty/null allowed set
 * ⇒ keep everything (gate effectively off).
 */
export function tradePassesRegime(trade, panel, allowedStates) {
    const allowed = Array.isArray(allowedStates) ? allowedStates : null;
    if (!allowed || !allowed.length) return true;
    const row = stateForTrade(trade, panel);
    if (!row || !row.marketState) return true;
    return allowed.includes(row.marketState);
}

// ── Strategy Map overlay derivation (Phase 2) ────────────────────────────────
// PURE, side-effect-free helpers that turn an ALREADY-BUILT panel into chart
// overlay arrays. They NEVER recompute EMA/BBW/ADX — they only read panel rows,
// which are already leakage-safe (shifted 1 day; row FOR day D uses D-1 close).
// Colour mapping intentionally lives in lib/chartStyles.js (marketStateColor);
// this module stays dependency-free and returns state strings only.

const DAY_MS = 86400000;
function dayStartIso(date) { return `${date}T00:00:00Z`; }
function dayStartMs(date) { return Date.parse(dayStartIso(date)); }

/**
 * Contiguous same-state daily regions for the Market State ribbon.
 * The painted region for day D represents the value KNOWN AT THE START OF D
 * (panel rows are already shifted 1 day → no look-ahead). Warmup/unknown rows
 * (marketState==null) are emitted with state=null so the caller can render them
 * neutral or skip. @returns [{state,startDate,endDate,startTime,endTime,startMs,endMs,knownAt}]
 */
export function ribbonSegmentsFromPanel(panel) {
    const rows = panel?.rows || [];
    const segs = [];
    let cur = null;
    for (const r of rows) {
        const st = r.marketState ?? null;
        if (cur && cur.state === st) { cur.endDate = r.date; }
        else {
            if (cur) segs.push(cur);
            cur = { state: st, startDate: r.date, endDate: r.date, knownAt: r.knownAt ?? dayStartIso(r.date) };
        }
    }
    if (cur) segs.push(cur);
    return segs.map((s) => ({
        state: s.state, startDate: s.startDate, endDate: s.endDate, knownAt: s.knownAt,
        startTime: dayStartIso(s.startDate),                                   // inclusive
        endTime: new Date(dayStartMs(s.endDate) + DAY_MS).toISOString(),       // exclusive (covers last day)
        startMs: dayStartMs(s.startDate),
        endMs: dayStartMs(s.endDate) + DAY_MS,
    }));
}

/**
 * EMA line points ({time,value}) for a lightweight-charts line series. Reads
 * panel.row.ema (already shifted); skips warmup nulls. Stepped daily values.
 */
export function emaLinePointsFromPanel(panel) {
    const rows = panel?.rows || [];
    const out = [];
    for (const r of rows) {
        if (typeof r.ema === "number" && Number.isFinite(r.ema)) {
            out.push({ time: dayStartIso(r.date), value: r.ema, date: r.date });
        }
    }
    return out;
}

// Compact per-marker badge label, e.g. "Bull/Exp", "Bear/Chp".
const SHORT_VOL = { Expand: "Exp", Compress: "Cmp", Chop: "Chp" };
export function shortStateLabel(state) {
    if (!state || typeof state !== "string") return "";
    const [trend, vol] = state.split("/");
    return `${trend}/${SHORT_VOL[vol] ?? vol}`;
}

/** Per-trade badge descriptor {state,label,knownAt} for a chart marker; null if unknown. */
export function tradeStateBadge(trade, panel) {
    const row = stateForTrade(trade, panel);
    if (!row || !row.marketState) return null;
    return { state: row.marketState, label: shortStateLabel(row.marketState), knownAt: row.knownAt };
}
