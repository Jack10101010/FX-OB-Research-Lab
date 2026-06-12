// loserRunUp.js
//
// Pure aggregation for the Run Detail "Trade Outcome & Loser Run-Up" section.
// No React, no side effects; self-contained except for the canonical outcome
// predicates in tradeClassification.js (which is itself import-free and pure), so
// the validation harness can transpile + load both directly.
//
// What it answers, per cohort:
//   • How many trades hit target (wins / TP hits) vs lost.
//   • For LOSING trades, how much R they reached (max favourable excursion) before
//     eventually losing — median, average, and how many losers reached ≥0.5/1/1.5/2R.
//
// Outcome logic — REUSED, not re-derived. `isWinTrade` / `isLossTrade` /
// `isPerformanceTrade` from tradeClassification.js are the same normalized outcome
// predicates the rest of the lab uses (WIN incl. NEWS_FLATTEN_WIN; LOSS incl.
// NEWS_FLATTEN_LOSS; performance = real-entry P&L trades). "Trades", "Win %" and the
// R stats are computed over the performance universe so they agree with the KPI cards.
//
// Loser max R reached — the exported STOP-ANCHORED MFE field `mfe_r` (camelCase
// `mfeR`), i.e. max favourable excursion in R measured from entry over the trade's
// life. This is a peak ("reached"), NOT a path: it cannot prove a BE/trail would have
// held — see the importer comment on the field. NOTE: this is distinct from
// `post_stop_mfe_r` (continuation AFTER the stop candle), which is not used here.
//
// Availability — if NO losing trade in a cohort carries a numeric `mfe_r`, the loser
// MFE figures for that cohort are null (rendered as a clear unavailable state, never
// zeros). `available` (run-level) is true when ANY losing performance trade carries a
// numeric `mfe_r`.

import { isWinTrade, isLossTrade, isPerformanceTrade } from "./tradeClassification";

export const R_REACH_THRESHOLDS = [0.5, 1, 1.5, 2];

/** Stop-anchored max favourable excursion in R (camelCase or snake_case). null when absent. */
export function loserMaxROf(trade) {
    const raw = trade?.mfeR ?? trade?.mfe_r;
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/** Realized R via the shared field conventions (net_r → r → pnl_r → result_r). 0 if none. */
function readR(trade) {
    for (const k of ["net_r", "netR", "r", "pnl_r", "result_r"]) {
        const v = trade?.[k];
        if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return 0;
}

function median(values) {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compute the per-cohort stats block over a list of (already-filtered) trades.
 * Win/Loss/Trades are over the PERFORMANCE universe; loser MFE over losers that
 * carry a numeric mfe_r.
 */
export function cohortStats(trades) {
    const perf = (Array.isArray(trades) ? trades : []).filter((t) => isPerformanceTrade(t));
    const wins = perf.filter((t) => isWinTrade(t));
    const losses = perf.filter((t) => isLossTrade(t));
    const rValues = perf.map(readR);
    const decided = wins.length + losses.length;

    const loserMfe = losses.map(loserMaxROf).filter((v) => v != null);
    const loserMfeAvailable = loserMfe.length > 0;

    const reach = {};
    for (const t of R_REACH_THRESHOLDS) {
        reach[t] = loserMfeAvailable ? loserMfe.filter((v) => v >= t).length : null;
    }

    return {
        trades:          perf.length,
        wins:            wins.length,
        losses:          losses.length,
        winRate:         decided > 0 ? wins.length / decided : null,
        avgR:            perf.length ? rValues.reduce((a, b) => a + b, 0) / perf.length : null,
        medianR:         median(rValues),
        // Loser run-up (MFE) — null when no loser in the cohort carries mfe_r.
        loserCount:      losses.length,            // total losers (denominator context)
        loserMfeCount:   loserMfe.length,          // losers WITH usable mfe_r
        loserMfeAvailable,
        loserMedianMaxR: loserMfeAvailable ? median(loserMfe) : null,
        loserAvgMaxR:    loserMfeAvailable
            ? loserMfe.reduce((a, b) => a + b, 0) / loserMfe.length
            : null,
        loserReach:      reach,                    // { 0.5: n|null, 1: n|null, 1.5: n|null, 2: n|null }
    };
}

const dirOf  = (t) => (t?.direction === "Short" ? "Short" : t?.direction === "Long" ? "Long" : null);
const structOf = (t) => {
    const s = String(t?.structure ?? "").toUpperCase();
    if (s.includes("CHOCH")) return "CHoCH";
    if (s.includes("BOS")) return "BOS";
    return null;
};
const fillSessionOf = (t) => {
    const s = String(t?.fillSession ?? t?.fill_session ?? t?.session ?? "").trim();
    return s && s !== "—" ? s : null;
};
const originSessionOf = (t) => {
    const s = String(t?.obOriginSession ?? t?.ob_origin_session ?? t?.originSession ?? "").trim();
    return s ? s : null;
};

function sessionRows(perfTrades, keyFn) {
    const groups = new Map();
    for (const t of perfTrades) {
        const k = keyFn(t);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
    }
    return [...groups.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((label) => ({ label, stats: cohortStats(groups.get(label)) }));
}

/**
 * Build the full Trade Outcome & Loser Run-Up breakdown.
 *
 * @param {object[]} trades — imported trade objects
 * @returns {{
 *   available: boolean,            // any losing performance trade carries numeric mfe_r
 *   totalTrades: number,
 *   performanceTrades: number,
 *   rThresholds: number[],
 *   groups: { id: string, label: string, rows: { label: string, stats: object }[] }[],
 * }}
 */
export function buildLoserRunUp(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const perf = list.filter((t) => isPerformanceTrade(t));

    const dir = (d) => perf.filter((t) => dirOf(t) === d);
    const struct = (s) => perf.filter((t) => structOf(t) === s);
    const both = (s, d) => perf.filter((t) => structOf(t) === s && dirOf(t) === d);

    const groups = [
        { id: "all", label: "All trades", rows: [{ label: "All trades", stats: cohortStats(perf) }] },
        {
            id: "direction", label: "Direction", rows: [
                { label: "Long", stats: cohortStats(dir("Long")) },
                { label: "Short", stats: cohortStats(dir("Short")) },
            ],
        },
        {
            id: "structure", label: "Structure", rows: [
                { label: "BOS", stats: cohortStats(struct("BOS")) },
                { label: "CHoCH", stats: cohortStats(struct("CHoCH")) },
            ],
        },
        {
            id: "structure_direction", label: "Structure × Direction", rows: [
                { label: "BOS Long", stats: cohortStats(both("BOS", "Long")) },
                { label: "BOS Short", stats: cohortStats(both("BOS", "Short")) },
                { label: "CHoCH Long", stats: cohortStats(both("CHoCH", "Long")) },
                { label: "CHoCH Short", stats: cohortStats(both("CHoCH", "Short")) },
            ],
        },
    ];

    const fillRows = sessionRows(perf, fillSessionOf);
    if (fillRows.length) groups.push({ id: "fill_session", label: "Fill session", rows: fillRows });

    const originRows = sessionRows(perf, originSessionOf);
    if (originRows.length) groups.push({ id: "origin_session", label: "Origin session", rows: originRows });

    // Run-level availability: any losing performance trade with a numeric mfe_r.
    const available = perf.some((t) => isLossTrade(t) && loserMaxROf(t) != null);

    return {
        available,
        totalTrades: list.length,
        performanceTrades: perf.length,
        rThresholds: R_REACH_THRESHOLDS,
        groups,
    };
}

export default buildLoserRunUp;
