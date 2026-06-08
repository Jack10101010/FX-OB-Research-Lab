/**
 * compareWinner.js — explainable cross-entity "winner" scoring (COCKPIT-2A).
 *
 * Extracted verbatim from ComparisonLab.jsx (MODEL-FAMILY-COMPARISON-2D) so the same
 * winner logic can be shared by Comparison Lab and the upcoming Model Family Comparison
 * without duplication. Pure: no React, no side effects, node-testable.
 *
 * Scores rows across directional metrics using values the caller already computes (no
 * new analytics). All five metrics use "higher wins" — for Max DD the values are ≤ 0 R,
 * so less-negative (higher) is the improvement. A metric is only awarded when there is a
 * single clear winner; null/undefined/non-finite values are skipped. Overall winner =
 * most metric wins, tie-broken by Net R; falls back to the pure Net R winner when no
 * metric produces a clear leader.
 */

export const WINNER_METRICS = [
    { key: "netR",       label: "Net R" },
    { key: "winRate",    label: "Win Rate" },
    { key: "pf",         label: "Profit Factor" },
    { key: "maxDd",      label: "Max DD" },
    { key: "validation", label: "Validation" },
];

function netROrNegInf(row) {
    const v = Number(row?.netR);
    return Number.isFinite(v) ? v : -Infinity;
}

export function computeExplainableWinner(metricRows) {
    const n = Array.isArray(metricRows) ? metricRows.length : 0;
    if (n === 0) {
        return { winnerIdx: 0, winnerLabels: [], winnerWinCount: 0, totalMetrics: WINNER_METRICS.length, otherLeads: [], smallSample: false, winnerTrades: null, maxTrades: 0 };
    }

    const winsCount = new Array(n).fill(0);
    const metricWinnerByKey = {};
    for (const m of WINNER_METRICS) {
        let bestIdx = -1, bestVal = -Infinity, tie = false;
        for (let i = 0; i < n; i += 1) {
            const v = Number(metricRows[i]?.[m.key]);
            if (!Number.isFinite(v)) continue;            // skip null/undefined/NaN
            if (v > bestVal) { bestVal = v; bestIdx = i; tie = false; }
            else if (v === bestVal) { tie = true; }       // shared best → no clear winner
        }
        if (bestIdx >= 0 && !tie) {
            winsCount[bestIdx] += 1;
            metricWinnerByKey[m.key] = bestIdx;
        }
    }

    const anyWins = winsCount.some((c) => c > 0);
    let winnerIdx = 0;
    if (anyWins) {
        let bestScore = -1, bestNetR = -Infinity;
        for (let i = 0; i < n; i += 1) {
            const score = winsCount[i];
            const netR = netROrNegInf(metricRows[i]);
            if (score > bestScore || (score === bestScore && netR > bestNetR)) {
                bestScore = score; bestNetR = netR; winnerIdx = i;
            }
        }
    } else {
        // Fallback: pure Net R winner (preserves prior behavior).
        winnerIdx = metricRows.reduce(
            (best, _r, i, all) => (netROrNegInf(all[i]) > netROrNegInf(all[best]) ? i : best),
            0,
        );
    }

    const winnerLabels = WINNER_METRICS.filter((m) => metricWinnerByKey[m.key] === winnerIdx).map((m) => m.label);
    const otherLeads = WINNER_METRICS
        .filter((m) => metricWinnerByKey[m.key] != null && metricWinnerByKey[m.key] !== winnerIdx)
        .map((m) => ({ idx: metricWinnerByKey[m.key], label: m.label }));

    const tradeCounts = metricRows.map((r) => Number(r?.trades)).filter(Number.isFinite);
    const maxTrades = tradeCounts.length ? Math.max(...tradeCounts) : 0;
    const winnerTrades = Number(metricRows[winnerIdx]?.trades);
    const smallSample = Number.isFinite(winnerTrades) && maxTrades > 0 && winnerTrades < 0.5 * maxTrades;

    return {
        winnerIdx,
        winnerLabels,
        winnerWinCount: winsCount[winnerIdx],
        totalMetrics: WINNER_METRICS.length,
        otherLeads,
        smallSample,
        winnerTrades: Number.isFinite(winnerTrades) ? winnerTrades : null,
        maxTrades,
    };
}
