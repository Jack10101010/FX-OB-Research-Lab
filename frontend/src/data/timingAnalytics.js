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

// Timestamped subset — the only trades the timing lab can place in time. All
// breakdowns already drop untimestamped trades (their key accessors return null);
// the discovery / what-if / matrix baselines must use the SAME universe so their
// "before" totals and the broad-filter threshold reconcile with the tables.
export function timestampedTrades(trades) {
    return (Array.isArray(trades) ? trades : []).filter((t) => parseEntry(t) != null);
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

// Year breakdown — buckets a trade subset (whole run, a month, a session, …) by
// calendar year, observed years only, ascending. Reuses bucketRow so each year
// row carries the same KPI set + win/loss + confidence as every other table.
// (Single-year rows always read Low confidence via the yearsPresent≤1 veto.)
// Year labels are plain ("2024"); a "(YTD)" partial-year tag is intentionally NOT
// added here — it would require an impure "today" lookup; see report follow-up.
export function buildYearBreakdown(trades) {
    const map = groupBy(trades, yearOf);
    return [...map.keys()].sort((a, b) => a - b).map((y) => bucketRow(y, String(y), map.get(y)));
}

// Deterministic one-line "is this one year or spread?" verdict over year rows.
export function monthSpreadVerdict(yearRows) {
    const rows = Array.isArray(yearRows) ? yearRows : [];
    const r = (v) => `${v >= 0 ? "+" : ""}${v}R`;
    if (!rows.length) return { tone: "muted", text: "No dated trades for this month." };
    if (rows.length === 1) return { tone: "neutral", text: `Single-year sample: all trades occurred in ${rows[0].label}.` };
    const yearsPresent = rows.length;
    const yearsPositive = rows.filter((x) => x.netR > 0).length;
    const best = rows.reduce((b, x) => (x.netR > b.netR ? x : b));
    const worst = rows.reduce((b, x) => (x.netR < b.netR ? x : b));
    const totalNetR = round2(rows.reduce((s, x) => s + x.netR, 0));
    // Concentration only when one year (same sign as the net result) carries ≥70%
    // of the TOTAL year-by-year movement (Σ|year net R|). Using gross movement, not
    // |net|, avoids over-claiming when large years offset to a small net.
    const sumAbs = rows.reduce((s, x) => s + Math.abs(x.netR), 0);
    const dom = Math.abs(best.netR) >= Math.abs(worst.netR) ? best : worst;
    const concentrated = sumAbs > 0 && Math.abs(dom.netR) >= 0.7 * sumAbs && (dom.netR >= 0) === (totalNetR >= 0);
    if (concentrated) {
        return { tone: dom.netR >= 0 ? "success" : "danger", text: `Concentration: most of the month result came from ${dom.label} (${r(dom.netR)}). Positive in ${yearsPositive}/${yearsPresent} years.` };
    }
    return { tone: "neutral", text: `Spread: positive in ${yearsPositive}/${yearsPresent} years. Best ${best.label} (${r(best.netR)}), worst ${worst.label} (${r(worst.netR)}).` };
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

// ════════════════════════════════════════════════════════════════════════════
// Phase B — What-If removal, discovery, month drilldown, month×session matrix.
//
// All EXACT, in-sample trade removal: a candidate's effect is the recomputed
// metrics over the trades that REMAIN after removing the matched ones — actual R,
// no estimate, no prediction. Re-implemented locally (semantics identical to
// filterSimulator.simulateRemoval / buildFilterDiscovery) to keep the data layer
// decoupled from the Failures-Lab workstream and the validator dependency-free.
// ════════════════════════════════════════════════════════════════════════════

// EXACT removal simulation: partition trades by `predicate`, recompute metrics
// from the kept set, and report both sides + stability/confidence of the removed
// cohort. deltaNetR ≡ afterNetR − beforeNetR ≡ removedLoserR − removedWinnerR.
export function simulateTimingRemoval(trades, predicate) {
    const list = Array.isArray(trades) ? trades : [];
    const removed = [], kept = [];
    for (const t of list) (predicate(t) ? removed : kept).push(t);
    const before = timingBucketMetrics(list);
    const after = timingBucketMetrics(kept);
    const rem = timingBucketMetrics(removed);
    const st = stabilityOf(removed);
    return {
        tradesRemoved: rem.trades,
        keptTrades: after.trades,
        removedNetR: rem.netR,
        removedWinnerR: rem.posR,   // winner R lost by removing
        removedLoserR: rem.negR,    // loss R saved by removing
        beforeNetR: before.netR, afterNetR: after.netR,
        deltaNetR: round2(after.netR - before.netR),
        beforePF: before.pf, afterPF: after.pf,
        deltaPF: (before.pf != null && after.pf != null) ? round2(after.pf - before.pf) : null,
        beforeWR: before.winRate, afterWR: after.winRate,
        deltaWR: round1(after.winRate - before.winRate),
        beforeExpectancy: before.expectancy, afterExpectancy: after.expectancy,
        deltaExpectancy: (before.expectancy != null && after.expectancy != null) ? round2(after.expectancy - before.expectancy) : null,
        yearsPresent: st.yearsPresent,
        yearsPositive: st.yearsPositive,
        confidence: confidenceForTimingBucket({ trades: rem.trades, yearsPresent: st.yearsPresent, yearsPositive: st.yearsPositive }),
    };
}

// Dimension registry for what-if candidate enumeration.
const TIMING_DIMS = {
    month:     { label: "Month",     acc: monthOf,         fmt: (k) => MONTH_LABELS[k] ?? `M${k}` },
    session:   { label: "Session",   acc: sessionOfTrade,  fmt: (k) => k },
    weekday:   { label: "Weekday",   acc: weekdayOf,       fmt: (k) => WEEKDAY_LABELS[k] ?? `D${k}` },
    hour:      { label: "Hour",      acc: hourOf,          fmt: (k) => `${String(k).padStart(2, "0")}:00` },
    direction: { label: "Direction", acc: directionOfTrade, fmt: (k) => k },
};
const TIMING_PAIRS = [
    ["month", "session"], ["month", "hour"], ["weekday", "hour"],
    ["session", "hour"], ["direction", "session"], ["direction", "month"],
];
const SAMPLE_FLOOR = 8;

function observedValues(trades, acc) {
    const seen = new Map();
    for (const t of trades) { const v = acc(t); if (v == null) continue; const k = String(v); if (!seen.has(k)) seen.set(k, v); }
    return [...seen.values()];
}
function observedPairs(trades, accA, accB) {
    const seen = new Map();
    for (const t of trades) {
        const a = accA(t), b = accB(t);
        if (a == null || b == null) continue;
        const k = `${a}${b}`;
        if (!seen.has(k)) seen.set(k, [a, b]);
    }
    return [...seen.values()];
}

// Deterministic signal. Strong needs a real edge, adequate sample, decent
// confidence, and that the winners removed aren't an excessive share of the
// losses saved. Watch captures positive-but-untrustworthy; Noise the rest.
export function timingSignal(c, sampleFloor = SAMPLE_FLOOR) {
    const medHigh = c.confidence === "High" || c.confidence === "Medium";
    const cheapWinners = c.removedLoserR > 0 ? (c.removedWinnerR <= c.removedLoserR * 0.5) : false;
    if (c.deltaNetR >= 3 && medHigh && c.tradesRemoved >= sampleFloor && cheapWinners) return "Strong";
    if (c.deltaNetR >= 1.5 && medHigh) return "Test";
    if (c.deltaNetR > 0) return "Watch";
    return "Noise";
}

function makeCandidate(meta, sim, totals, sampleFloor) {
    const broad = totals.trades > 0 && sim.tradesRemoved > 0.35 * totals.trades;
    return {
        ...meta, ...sim,
        broad,
        rankable: sim.tradesRemoved >= sampleFloor && sim.confidence !== "Low",
        signal: timingSignal(sim, sampleFloor),
    };
}

// Enumerate every single-dimension + curated-pair removal candidate and rank by
// adequate-sample first, then Δ Net R descending. Returns the full sorted list.
export function buildTimingWhatIfCandidates(trades, { sampleFloor = SAMPLE_FLOOR } = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const totals = timingBucketMetrics(list);
    const rows = [];
    if (list.length) {
        for (const dk of Object.keys(TIMING_DIMS)) {
            const D = TIMING_DIMS[dk];
            for (const v of observedValues(list, D.acc)) {
                const sim = simulateTimingRemoval(list, (t) => { const x = D.acc(t); return x != null && x === v; });
                if (!sim.tradesRemoved) continue;
                rows.push(makeCandidate({ type: D.label, label: D.fmt(v) }, sim, totals, sampleFloor));
            }
        }
        for (const [ak, bk] of TIMING_PAIRS) {
            const A = TIMING_DIMS[ak], B = TIMING_DIMS[bk];
            for (const [av, bv] of observedPairs(list, A.acc, B.acc)) {
                const sim = simulateTimingRemoval(list, (t) => { const x = A.acc(t), y = B.acc(t); return x != null && y != null && x === av && y === bv; });
                if (!sim.tradesRemoved) continue;
                rows.push(makeCandidate({ type: `${A.label} × ${B.label}`, label: `${A.fmt(av)} × ${B.fmt(bv)}` }, sim, totals, sampleFloor));
            }
        }
    }
    rows.sort((a, b) => (Number(b.rankable) - Number(a.rankable)) || (b.deltaNetR - a.deltaNetR));
    return rows;
}

function pickByDelta(rows, pred) {
    let best = null;
    for (const r of rows) { if (!pred(r)) continue; if (best == null || r.deltaNetR > best.deltaNetR) best = r; }
    return best;
}

// Full discovery payload: ranked candidates + a small "command center" of the
// headline picks. bestOverall is the conservative recommendation (Medium/High,
// adequate sample, not a too-broad >35% removal); the type-specific picks may be
// Low-confidence (UI flags them as high-risk curiosities).
export function buildTimingDiscovery(trades, { sampleFloor = SAMPLE_FLOOR } = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const totals = timingBucketMetrics(list);
    const candidates = buildTimingWhatIfCandidates(list, { sampleFloor });
    const positive = (r) => r.deltaNetR > 0;
    const medHigh = (r) => r.confidence !== "Low";
    return {
        totals,
        candidates,
        commandCenter: {
            bestOverall: pickByDelta(candidates, (r) => medHigh(r) && positive(r) && r.tradesRemoved >= sampleFloor && !r.broad),
            bestMonthSession: pickByDelta(candidates, (r) => r.type === "Month × Session" && positive(r)),
            bestSessionHour: pickByDelta(candidates, (r) => r.type === "Session × Hour" && positive(r)),
            bestHighConfidence: pickByDelta(candidates, (r) => r.confidence === "High" && positive(r)),
        },
    };
}

// Month drilldown — answers "is January bad, or only NY during January?". Breaks
// the selected month into session/hour/weekday/direction buckets AND runs the
// exact what-if for removing that month (whole + per session/hour/weekday) from
// the FULL run.
export function buildMonthDrilldown(trades, monthIndex) {
    const list = Array.isArray(trades) ? trades : [];
    if (monthIndex == null || monthIndex < 0 || monthIndex > 11) return null;
    const monthTrades = list.filter((t) => monthOf(t) === monthIndex);
    const label = MONTH_LABELS[monthIndex];
    const withSig = (cardLabel, sim) => ({ label: cardLabel, ...sim, signal: timingSignal(sim) });
    return {
        monthIndex, label, trades: monthTrades.length,
        breakdowns: {
            year: buildYearBreakdown(monthTrades),
            session: buildSessionBreakdown(monthTrades),
            hour: buildHourBreakdown(monthTrades),
            weekday: buildWeekdayBreakdown(monthTrades),
            direction: buildDirectionBreakdown(monthTrades),
        },
        whatIf: {
            removeMonth: withSig(`Remove ${label}`, simulateTimingRemoval(list, (t) => monthOf(t) === monthIndex)),
            bySession: SESSION_ORDER.map((s) => withSig(`${label} × ${s}`, simulateTimingRemoval(list, (t) => monthOf(t) === monthIndex && sessionOfTrade(t) === s))),
            byHour: observedValues(monthTrades, hourOf).sort((a, b) => a - b)
                .map((h) => withSig(`${label} × ${String(h).padStart(2, "0")}:00`, simulateTimingRemoval(list, (t) => monthOf(t) === monthIndex && hourOf(t) === h))),
            byWeekday: WEEKDAY_LABELS.map((w, i) => withSig(`${label} × ${w}`, simulateTimingRemoval(list, (t) => monthOf(t) === monthIndex && weekdayOf(t) === i))),
        },
    };
}

// Month × Session matrix — 12 month rows × canonical session columns, each cell
// carrying Net R + trade count + a thin-cell flag (trades < 8) for the UI to mute.
export function buildMonthSessionMatrix(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const rows = MONTH_LABELS.map((label, m) => {
        const cells = {};
        let monthTrades = 0;
        for (const s of SESSION_ORDER) {
            const sub = list.filter((t) => monthOf(t) === m && sessionOfTrade(t) === s);
            const mt = timingBucketMetrics(sub);
            cells[s] = { netR: mt.netR, trades: mt.trades, thin: mt.trades > 0 && mt.trades < 8 };
            monthTrades += mt.trades;
        }
        return { month: m, label, cells, trades: monthTrades };
    });
    let maxAbs = 0;
    for (const r of rows) for (const s of SESSION_ORDER) maxAbs = Math.max(maxAbs, Math.abs(r.cells[s].netR));
    return { rows, sessions: SESSION_ORDER, maxAbs: maxAbs || 1 };
}
