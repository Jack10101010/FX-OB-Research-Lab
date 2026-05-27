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
 * Attaches _scoreIdx to each trade so streakMap lookups are index-based (always reliable).
 */
export function precomputeContext(trades) {
    if (!Array.isArray(trades) || trades.length === 0) {
        return { streakMap: new Map(), maxDrawdownR: 1 };
    }

    // Tag each trade with its positional index — this is the canonical streak-map key.
    // We mutate a _scoreIdx property on the trade object (non-enumerable-style, won't
    // appear in CSV exports or interfere with existing fields).
    trades.forEach((t, i) => { t._scoreIdx = i; });

    const streakMap    = buildStreakMap(trades);
    const maxDrawdownR = computeMaxDrawdownR(trades);

    return { streakMap, maxDrawdownR: Math.abs(maxDrawdownR) || 1 };
}

/**
 * buildStreakMap(trades) → Map<key, streakLength>
 * Identifies consecutive loss runs and records which streak length each trade
 * belongs to. Requires trades to be in chronological order.
 *
 * KEY STRATEGY: uses trade index as primary key (always unique), falls back to
 * id/trade_id only for backward compatibility. Index is stored on each trade as
 * _streakIdx during scoring so the scorer can look it up reliably.
 */
export function buildStreakMap(trades) {
    const map = new Map();
    let streak = 0;
    const buffer = []; // buffer of {key} objects in current streak

    for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        const r = rOf(t);
        // Use array index as the canonical key — always unique regardless of CSV fields.
        // Also write the explicit ID so callers using id-based lookups still work.
        const key = i;
        if (r < 0) {
            streak++;
            buffer.push(key);
        } else {
            if (streak > 0) {
                buffer.forEach(k => map.set(k, streak));
            }
            streak = 0;
            buffer.length = 0;
        }
    }
    if (streak > 0) buffer.forEach(k => map.set(k, streak));
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
    // Use _scoreIdx (set by precomputeContext) for reliable index-based lookup.
    // Falls back to id-based lookup for any trade scored outside the normal pipeline.
    const scoreIdx  = trade?._scoreIdx ?? trade?.id ?? trade?.trade_id;
    const streakLen = streakMap.get(scoreIdx) ?? 0;
    const streak    = streakLen >= 5 ? 2 : streakLen >= 3 ? 1 : 0;

    // 3. Drawdown contribution: 0, 1, or 2 pts
    const ddContrib = maxDrawdownR > 0 ? r / maxDrawdownR : 0;
    const drawdown  = ddContrib >= 0.25 ? 2 : ddContrib >= 0.1 ? 1 : 0;

    // 4. Structural damage: 0, 1, or 2 pts
    // Maps archetype severity weights to pts without Math.round killing the deltas:
    //   standard_loss / slow_bleed (1.0) → 0 pts
    //   fast_stopout (1.1)               → 0.5 → floor 0 + isStructural bonus
    //   close_confirmed (1.2)            → 1 pt  (+ isStructural = 2 pts max)
    //   hard_invalidation (1.4)          → 2 pts
    const archWeight   = ARCHETYPE_MAP[trade?.archetype]?.severityWeight ?? 1.0;
    const isStructural = (trade?.archetype === "hard_invalidation" || trade?.archetype === "close_confirmed") ? 1 : 0;
    const highConf     = trade?.confidence === CONFIDENCE.HIGH ? 0.5 : 0;
    // Use continuous mapping: (weight-1)*5 gives 0→0, 0.1→0.5, 0.2→1, 0.4→2
    const structural   = Math.min(2, parseFloat(((archWeight - 1) * 5 + isStructural * 0.5 + highConf).toFixed(1)));

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
