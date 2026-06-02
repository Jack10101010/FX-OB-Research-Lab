// Real metric calculations derived from full trade/equity data.
// Returns null when input data is insufficient — DO NOT fabricate.
//
// @deprecated (Phase RB-8a) — superseded by data/resultsBasis.js
//   (summarizeTrades / toCanonicalSummaryRow). This is the last copy of the
//   legacy roll-up math and is retained ONLY because ComparisonLab still
//   imports computeProfitFactor / computeMaxDrawdown. Full retirement happens
//   in RB-8d when ComparisonLab migrates to resultsBasis. Do NOT add new
//   consumers — use resultsBasis.summarizeTrades instead.

export function computeProfitFactor(trades) {
    if (!Array.isArray(trades) || trades.length === 0) return null;
    let grossWin = 0;
    let grossLoss = 0;
    for (const t of trades) {
        const r = Number(t.r);
        if (!isFinite(r)) continue;
        if (r >= 0) grossWin += r;
        else grossLoss += r;
    }
    if (grossLoss === 0) return null; // undefined PF (no losses)
    return grossWin / Math.abs(grossLoss);
}

export function computeMaxDrawdown(equityCurve) {
    if (!Array.isArray(equityCurve) || equityCurve.length === 0) return null;
    let peak = -Infinity;
    let maxDd = 0;
    for (const p of equityCurve) {
        const v = Number(p.netR);
        if (!isFinite(v)) continue;
        if (v > peak) peak = v;
        const dd = v - peak; // negative or zero
        if (dd < maxDd) maxDd = dd;
    }
    return maxDd; // ≤ 0
}

export function computeExpectancy(trades) {
    if (!Array.isArray(trades) || trades.length === 0) return null;
    const total = trades.reduce((s, t) => s + (Number(t.r) || 0), 0);
    return total / trades.length;
}

export function computeAvgWinLoss(trades) {
    if (!Array.isArray(trades) || trades.length === 0) return { avgWin: null, avgLoss: null };
    let winSum = 0, winN = 0, lossSum = 0, lossN = 0;
    for (const t of trades) {
        const r = Number(t.r);
        if (!isFinite(r)) continue;
        if (r >= 0) { winSum += r; winN++; } else { lossSum += r; lossN++; }
    }
    return {
        avgWin: winN ? winSum / winN : null,
        avgLoss: lossN ? lossSum / lossN : null,
    };
}

// Convenience: bundle everything for an active run if we have both trades + curve.
export function computeRunHealth({ trades, equityCurve }) {
    return {
        profitFactor: computeProfitFactor(trades),
        maxDrawdown: computeMaxDrawdown(equityCurve),
        expectancy: computeExpectancy(trades),
        ...computeAvgWinLoss(trades),
    };
}
