// timingAnalytics.js — Timing & Regime Lab, Phase A (pure, read-only).
//
// Foundations + guardrails for the merged Timing & Regime Lab (see
// TIMING-REGIME-LAB-DESIGN-AUDIT-1.md). This module turns the run's trades into
// honest, stability-aware timing buckets (month-of-year / session / hour /
// weekday / direction) with the standard KPI set plus a cross-year confidence
// layer. It is the guardrail the current Net-R-only heatmaps lack.
//
// PURE & SELF-CONTAINED: no React, no imports, no mutation of trade rows. The
// metric math is deliberately identical to filterSimulator.metricsOf (trades /
// winners / losers / posR / negR / netR / winRate / profitFactor) so timing KPIs
// reconcile with the rest of the app; it is re-implemented here (not imported) to
// keep the data layer decoupled from the Failures-Lab workstream and to keep the
// validator dependency-free.
//
// HONESTY: every figure here is in-sample, single-run. Timing cells are tiny and
// the search space is huge, so the confidence layer (sample + cross-year
// persistence) is the point — low-n / single-year buckets are hypotheses, not
// edges. Best/Worst selection refuses to crown a Low-confidence bucket unless
// every bucket is Low.

const round1 = (v) => Number(Number(v).toFixed(1));
const round2 = (v) => Number(Number(v).toFixed(2));

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Session order + UTC hour boundaries mirror entryFormatters.sessionOf so timing
// sessions match the rest of the app (Asia <7, London <10, London Lull <12,
// New York <17, else Outside). Kept local to avoid a cross-workstream import.
export const SESSION_ORDER = ["Asia", "London", "London Lull", "New York", "Outside"];

// ── Field readers (same conventions as the existing timing heatmaps) ──────────
function rOf(t) {
    const v = Number(t?.r ?? t?.pnl_r ?? t?.net_r ?? t?.netR);
    return Number.isFinite(v) ? v : 0;
}
function parseEntry(t) {
    const raw = t?.entry ?? t?.entryTime ?? t?.fill_time ?? t?.fillTime ?? t?.entry_time;
    if (raw == null || raw === "") return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
}
function monthOf(t)   { const d = parseEntry(t); return d ? d.getUTCMonth() : null; }            // 0 = Jan
function weekdayOf(t) { const d = parseEntry(t); return d ? (d.getUTCDay() + 6) % 7 : null; }    // 0 = Mon
function hourOf(t)    { const d = parseEntry(t); return d ? d.getUTCHours() : null; }            // 0–23
function yearOf(t)    { const d = parseEntry(t); return d ? d.getUTCFullYear() : null; }
function sessionOfTrade(t) {
    const d = parseEntry(t);
    // null (untimestamped) → excluded from session buckets, consistent with the
    // month / hour / weekday breakdowns (which can't place a timeless trade either).
    if (!d) return null;
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h < 7) return "Asia";
    if (h < 10) return "London";
    if (h < 12) return "London Lull";
    if (h < 17) return "New York";
    return "Outside";
}
function directionOfTrade(t) {
    const s = String(t?.direction ?? t?.side ?? t?.type ?? "").toLowerCase();
    if (s.startsWith("bull") || s === "long" || s === "buy") return "Bullish";
    if (s.startsWith("bear") || s === "short" || s === "sell") return "Bearish";
    return null;
}

// ── Population metrics — identical semantics to filterSimulator.metricsOf ──────
// winRate is winners / total (scratch r=0 counted in total, never a winner).
// pf is null when there is no losing R (render ∞ upstream when posR > 0).
// expectancy = netR / trades (per-trade average R).
export function timingBucketMetrics(trades) {
    const list = Array.isArray(trades) ? trades : [];
    let winners = 0, losers = 0, posR = 0, negR = 0;
    for (const t of list) {
        const r = rOf(t);
        if (r > 0) { winners += 1; posR += r; }
        else if (r < 0) { losers += 1; negR += -r; }
    }
    const count = list.length;
    const netR = round2(posR - negR);
    return {
        trades: count,
        winners,
        losers,
        posR: round2(posR),
        negR: round2(negR),
        netR,
        winRate: count ? round1((winners / count) * 100) : 0,
        pf: negR > 0 ? round2(posR / negR) : null,
        expectancy: count ? round2(netR / count) : null,
    };
}

// ── Cross-year stability ──────────────────────────────────────────────────────
// Groups a bucket's trades by calendar year and reports how many distinct years
// it spans and in how many of those years it was net-positive. This is the core
// overfit guard: a "January edge" that lives in one year is not an edge.
export function stabilityOf(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const byYear = new Map();
    for (const t of list) {
        const y = yearOf(t);
        if (y == null) continue;
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(t);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const byYearStats = years.map((y) => {
        const m = timingBucketMetrics(byYear.get(y));
        return { year: y, trades: m.trades, netR: m.netR };
    });
    const yearsPresent = years.length;
    const yearsPositive = byYearStats.filter((s) => s.netR > 0).length;
    return {
        yearsPresent,
        yearsPositive,
        positiveYearRatio: yearsPresent ? round2(yearsPositive / yearsPresent) : 0,
        byYear: byYearStats,
    };
}

// ── Confidence (deterministic; sample + cross-year persistence) ───────────────
// Low   — trades < 8  OR  yearsPresent <= 1   (tiny sample or single-year fluke)
// High  — trades >= 30 AND yearsPresent >= 4 AND yearsPositive/yearsPresent >= 0.6
// Medium— trades >= 15 AND yearsPresent >= 3
// else  — Low
export function confidenceForTimingBucket({ trades = 0, yearsPresent = 0, yearsPositive = 0 } = {}) {
    if (trades < 8 || yearsPresent <= 1) return "Low";
    if (trades >= 30 && yearsPresent >= 4 && (yearsPositive / yearsPresent) >= 0.6) return "High";
    if (trades >= 15 && yearsPresent >= 3) return "Medium";
    return "Low";
}

// ── Bucket row builder ────────────────────────────────────────────────────────
function bucketRow(key, label, trades) {
    const m = timingBucketMetrics(trades);
    const s = stabilityOf(trades);
    return {
        key, label,
        trades: m.trades, winners: m.winners, losers: m.losers,
        netR: m.netR, pf: m.pf, winRate: m.winRate, expectancy: m.expectancy,
        yearsPresent: s.yearsPresent,
        yearsPositive: s.yearsPositive,
        positiveYearRatio: s.positiveYearRatio,
        confidence: confidenceForTimingBucket({ trades: m.trades, yearsPresent: s.yearsPresent, yearsPositive: s.yearsPositive }),
    };
}

function groupBy(trades, keyFn) {
    const map = new Map();
    for (const t of (Array.isArray(trades) ? trades : [])) {
        const k = keyFn(t);
        if (k == null) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
    }
    return map;
}

// ── Breakdown builders (each returns an array of bucket rows) ──────────────────
// Month-of-year: always all 12 rows in calendar order (empty months → trades 0).
export function buildMonthBreakdown(trades) {
    const map = groupBy(trades, monthOf);
    return MONTH_LABELS.map((label, i) => bucketRow(i, label, map.get(i) || []));
}
// Weekday: always Mon→Sun (Sat/Sun usually empty in FX).
export function buildWeekdayBreakdown(trades) {
    const map = groupBy(trades, weekdayOf);
    return WEEKDAY_LABELS.map((label, i) => bucketRow(i, label, map.get(i) || []));
}
// Hour: observed hours only, ascending.
export function buildHourBreakdown(trades) {
    const map = groupBy(trades, hourOf);
    return [...map.keys()].sort((a, b) => a - b)
        .map((h) => bucketRow(h, `${String(h).padStart(2, "0")}:00`, map.get(h)));
}
// Session: canonical order always shown; any extra observed bucket (e.g. Unknown)
// appended only when present.
export function buildSessionBreakdown(trades) {
    const map = groupBy(trades, sessionOfTrade);
    const extras = [...map.keys()].filter((k) => !SESSION_ORDER.includes(k));
    const keys = [...SESSION_ORDER, ...extras];
    return keys.map((k) => bucketRow(k, k, map.get(k) || []));
}
// Direction proxy (NOT real market regime — see lab note). Bullish/Bearish always
// shown so the table reads consistently even when one side is empty.
export function buildDirectionBreakdown(trades) {
    const map = groupBy(trades, directionOfTrade);
    return ["Bullish", "Bearish"].map((k) => bucketRow(k, k, map.get(k) || []));
}

// ── Overview card selection ───────────────────────────────────────────────────
// Best/Worst/Most-Consistent prefer Medium/High rows and only fall back to Low
// when EVERY populated bucket is Low (then `lowConfidence: true`). Most-Active is
// purely descriptive (highest trade count), flagged low-confidence if the winner
// is Low. Returns null when no bucket has trades.
function pickBy(rows, better, { requireYears = false } = {}) {
    const eligible = rows.filter((r) => r.trades > 0 && (!requireYears || r.yearsPresent >= 2));
    if (!eligible.length) return null;
    const strong = eligible.filter((r) => r.confidence !== "Low");
    const pool = strong.length ? strong : eligible;
    let chosen = pool[0];
    for (const r of pool) if (better(r, chosen)) chosen = r;
    return { ...chosen, lowConfidence: strong.length === 0 };
}
function pickActive(rows) {
    const eligible = rows.filter((r) => r.trades > 0);
    if (!eligible.length) return null;
    let chosen = eligible[0];
    for (const r of eligible) if (r.trades > chosen.trades) chosen = r;
    return { ...chosen, lowConfidence: chosen.confidence === "Low" };
}
const byNetDesc = (a, b) => a.netR > b.netR;
const byNetAsc = (a, b) => a.netR < b.netR;
const byConsistency = (a, b) =>
    a.positiveYearRatio > b.positiveYearRatio
    || (a.positiveYearRatio === b.positiveYearRatio && a.yearsPresent > b.yearsPresent)
    || (a.positiveYearRatio === b.positiveYearRatio && a.yearsPresent === b.yearsPresent && a.netR > b.netR);

export function buildTimingOverview(trades) {
    const months = buildMonthBreakdown(trades);
    const sessions = buildSessionBreakdown(trades);
    const hours = buildHourBreakdown(trades);
    return {
        bestMonth: pickBy(months, byNetDesc),
        worstMonth: pickBy(months, byNetAsc),
        mostConsistentMonth: pickBy(months, byConsistency, { requireYears: true }),
        bestSession: pickBy(sessions, byNetDesc),
        worstSession: pickBy(sessions, byNetAsc),
        mostConsistentSession: pickBy(sessions, byConsistency, { requireYears: true }),
        mostActiveSession: pickActive(sessions),
        bestHour: pickBy(hours, byNetDesc),
        worstHour: pickBy(hours, byNetAsc),
        mostConsistentHour: pickBy(hours, byConsistency, { requireYears: true }),
        mostActiveHour: pickActive(hours),
    };
}
