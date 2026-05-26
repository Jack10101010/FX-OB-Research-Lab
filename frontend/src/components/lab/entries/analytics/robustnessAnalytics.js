// ── robustnessAnalytics.js ───────────────────────────────────────────────────
// Robustness, confidence, and stability metrics for entry models.
// No React. Safe inside useMemo.

import { rOf } from "./entryAnalytics";
import { round2, round1, isFiniteNumber, parseDate } from "./entryFormatters";
import { ROBUST_SAMPLE_N, MODERATE_SAMPLE_N, LOW_SAMPLE_N, sampleConfidence } from "./entryRegistry";

// ── Rolling window metrics ───────────────────────────────────────────────────

export function buildRollingMetrics(trades, window = 20) {
    const list = Array.isArray(trades) ? trades : [];
    if (list.length < window) return [];
    return list.slice(window - 1).map((_, i) => {
        const slice = list.slice(i, i + window);
        const wins  = slice.filter(t => rOf(t) > 0).length;
        const netR  = slice.reduce((s, t) => s + rOf(t), 0);
        const d     = parseDate(slice[slice.length - 1]?.entry);
        return {
            i:          i + window,
            date:       d ? d.toISOString().slice(0, 10) : String(i + window),
            winRate:    round1((wins / window) * 100),
            expectancy: round2(netR / window),
            netR:       round2(netR),
        };
    });
}

// ── Monthly stability ────────────────────────────────────────────────────────

export function buildMonthlyStability(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const map  = {};
    list.forEach(t => {
        const d = parseDate(t.entry);
        if (!d) return;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!map[key]) map[key] = { key, wins: 0, total: 0, netR: 0 };
        map[key].total += 1;
        map[key].netR  += rOf(t);
        if (rOf(t) > 0) map[key].wins += 1;
    });
    return Object.values(map)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(m => ({
            month:      m.key,
            winRate:    round1(m.total ? (m.wins / m.total) * 100 : 0),
            expectancy: round2(m.total ? m.netR / m.total : 0),
            netR:       round2(m.netR),
            count:      m.total,
            positive:   m.netR >= 0,
        }));
}

// ── Outlier dependency ───────────────────────────────────────────────────────

export function buildOutlierDependency(trades) {
    const list   = Array.isArray(trades) ? trades : [];
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => rOf(b) - rOf(a));
    const total  = list.reduce((s, t) => s + rOf(t), 0);
    const top5   = sorted.slice(0, 5).reduce((s, t) => s + rOf(t), 0);
    const top10  = sorted.slice(0, 10).reduce((s, t) => s + rOf(t), 0);
    const withoutBest = total - rOf(sorted[0]);
    return {
        totalNetR:        round2(total),
        top5NetR:         round2(top5),
        top10NetR:        round2(top10),
        top5Pct:          total ? round1((top5 / total) * 100) : 0,
        top10Pct:         total ? round1((top10 / total) * 100) : 0,
        withoutBestNetR:  round2(withoutBest),
        outlierRisk:      top5 / total > 0.5 ? "HIGH" : top5 / total > 0.3 ? "MODERATE" : "LOW",
    };
}

// ── Half-split consistency ───────────────────────────────────────────────────

export function buildHalfSplitConsistency(trades) {
    const list  = Array.isArray(trades) ? trades : [];
    if (list.length < 10) return null;
    const mid   = Math.floor(list.length / 2);
    const first = list.slice(0, mid);
    const last  = list.slice(mid);
    const stats = (arr) => {
        const wins  = arr.filter(t => rOf(t) > 0).length;
        const netR  = arr.reduce((s, t) => s + rOf(t), 0);
        return {
            n:          arr.length,
            winRate:    arr.length ? round1((wins / arr.length) * 100) : 0,
            expectancy: arr.length ? round2(netR / arr.length) : 0,
            netR:       round2(netR),
        };
    };
    const f = stats(first);
    const l = stats(last);
    const stable = Math.abs(f.winRate - l.winRate) < 15 && Math.abs(f.expectancy - l.expectancy) < 0.3;
    return { first: f, last: l, stable, wrDelta: round1(l.winRate - f.winRate), expDelta: round2(l.expectancy - f.expectancy) };
}

// ── Model robustness score (0–100) ───────────────────────────────────────────

export function calcRobustnessScore(row, tradeOffStats) {
    if (!row?.exact) return null;
    const n       = Number(row.fills || 0);
    const dd      = Math.abs(Number(row.maxDD || 0));
    const wr      = Number(row.winRate || 0);
    const fillPct = Number(row.fillPct || 0);
    const delta   = Number(row.deltaVsBaseline || 0);

    let score = 0;

    // Sample adequacy (30 pts)
    if      (n >= ROBUST_SAMPLE_N)   score += 30;
    else if (n >= MODERATE_SAMPLE_N) score += 20;
    else if (n >= LOW_SAMPLE_N)      score += 10;

    // Delta vs baseline (25 pts)
    if      (delta > 5)   score += 25;
    else if (delta > 2)   score += 18;
    else if (delta > 0)   score += 10;
    else if (delta > -2)  score += 5;

    // Drawdown control (20 pts)
    if      (dd < 3)  score += 20;
    else if (dd < 6)  score += 14;
    else if (dd < 10) score += 8;

    // Trade-off quality (15 pts)
    if (tradeOffStats) {
        const ratio = tradeOffStats.tradeOffRatio;
        if      (ratio != null && ratio >= 2)   score += 15;
        else if (ratio != null && ratio >= 1.2) score += 10;
        else if (ratio != null && ratio >= 0.8) score += 5;
    }

    // Fill rate (10 pts)
    if      (fillPct >= 80) score += 10;
    else if (fillPct >= 60) score += 7;
    else if (fillPct >= 40) score += 4;

    return Math.min(100, score);
}

export function robustnessLabel(score) {
    if (score == null) return { label: "N/A",      tone: "muted" };
    if (score >= 75)   return { label: "ROBUST",   tone: "success" };
    if (score >= 50)   return { label: "MODERATE", tone: "secondary" };
    if (score >= 25)   return { label: "WEAK",     tone: "warning" };
    return                    { label: "POOR",     tone: "danger" };
}
