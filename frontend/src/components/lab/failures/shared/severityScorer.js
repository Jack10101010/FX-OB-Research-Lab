// ── severityScorer.js ────────────────────────────────────────────────────────
// Pure: compute a 0–10 severity score for each losing trade.
// No React. No side effects.

import { rOf } from "./failuresUtils";
import { ARCHETYPE_MAP } from "./failuresRegistry";
import { CONFIDENCE } from "./archetypeClassifier";

// ── Context pre-computation ───────────────────────────────────────────────────

/**
 * precomputeContext(trades) → context object
 * Call once on the full losers array before scoring each trade.
 */
export function precomputeContext(trades) {
    if (!Array.isArray(trades) || trades.length === 0) {
        return { streakMap: new Map(), maxDrawdownR: 1 };
    }

    const streakMap     = buildStreakMap(trades);
    const maxDrawdownR  = computeMaxDrawdownR(trades);

    return { streakMap, maxDrawdownR: Math.abs(maxDrawdownR) || 1 };
}

/**
 * buildStreakMap(trades) → Map<tradeId, streakLength>
 * Identifies consecutive loss runs and records which streak length each trade
 * belongs to. Requires trades to be in chronological order.
 */
export function buildStreakMap(trades) {
    const map = new Map();
    let streak = 0;
    const buffer = []; // buffer of loss trade IDs in current streak

    for (const t of trades) {
        const r = rOf(t);
        const isLoss = r < 0;
        if (isLoss) {
            streak++;
            buffer.push(t?.id ?? t?.trade_id);
        } else {
            // Flush streak
            if (streak > 0) {
                buffer.forEach(id => map.set(id, streak));
            }
            streak = 0;
            buffer.length = 0;
        }
    }
    if (streak > 0) buffer.forEach(id => map.set(id, streak));
    return map;
}

function computeMaxDrawdownR(trades) {
    let equity = 0, peak = 0, dd = 0;
    for (const t of trades) {
        equity += rOf(t);
        if (equity > peak) peak = equity;
        const drawdown = equity - peak;
        if (drawdown < dd) dd = drawdown;
    }
    return dd; // negative number (or 0)
}

// ── Single trade scorer ───────────────────────────────────────────────────────

/**
 * scoreSeverity(trade, context) → { score, components }
 * trade must already have been classified (has .archetype, .confidence).
 */
export function scoreSeverity(trade, context) {
    const { streakMap, maxDrawdownR } = context;
    const r = Math.abs(rOf(trade));

    // 1. Magnitude: log-scaled 0–4 pts
    const magnitude = Math.min(4, Math.log1p(r) * 2.5);

    // 2. Streak: 0, 1, or 2 pts
    const tradeId     = trade?.id ?? trade?.trade_id;
    const streakLen   = streakMap.get(tradeId) ?? 0;
    const streak      = streakLen >= 5 ? 2 : streakLen >= 3 ? 1 : 0;

    // 3. Drawdown contribution: 0, 1, or 2 pts
    const ddContrib   = maxDrawdownR > 0 ? r / maxDrawdownR : 0;
    const drawdown    = ddContrib >= 0.25 ? 2 : ddContrib >= 0.1 ? 1 : 0;

    // 4. Structural damage: 0, 1, or 2 pts
    const archWeight  = ARCHETYPE_MAP[trade?.archetype]?.severityWeight ?? 1.0;
    const highConf    = trade?.confidence === CONFIDENCE.HIGH ? 1 : 0;
    const isStructural = (trade?.archetype === "hard_invalidation" || trade?.archetype === "close_confirmed") ? 1 : 0;
    const structural  = Math.min(2, Math.round((archWeight - 1) * 2 + isStructural + highConf * 0.5));

    const raw   = magnitude + streak + drawdown + structural;
    const score = Math.min(10, Math.max(0, parseFloat(raw.toFixed(1))));

    return {
        score,
        components: { magnitude: parseFloat(magnitude.toFixed(1)), streak, drawdown, structural },
    };
}

/**
 * scoreAll(classifiedTrades) → trades with { severity, severityComponents } attached
 * Requires trades to be in chronological order for accurate streak detection.
 */
export function scoreAll(classifiedTrades) {
    if (!Array.isArray(classifiedTrades)) return [];
    const context = precomputeContext(classifiedTrades);
    return classifiedTrades.map(t => {
        const { score, components } = scoreSeverity(t, context);
        return { ...t, severity: score, severityComponents: components };
    });
}
