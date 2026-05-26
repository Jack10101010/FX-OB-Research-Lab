// ── archetypeClassifier.js ───────────────────────────────────────────────────
// Pure: classify a trade into a failure archetype with confidence score.
// No React. No side effects.
//
// When ML clustering is implemented (Phase 7), replace classify() and
// classifyAll() — the output schema must stay identical.

import {
    ARCHETYPES,
    fastStopoutThresholdMins,
    slowBleedThresholdMins,
} from "./failuresRegistry";
import { isFullBreach, isCloseBreach, durationMinutes } from "./failuresUtils";

// ── Confidence tiers ──────────────────────────────────────────────────────────

export const CONFIDENCE = {
    HIGH:         "HIGH",
    MEDIUM:       "MEDIUM",
    LOW:          "LOW",
    BORDERLINE:   "BORDERLINE",
    UNCLASSIFIED: "UNCLASSIFIED",
};

function matchRatio(matchCount, totalCriteria) {
    if (totalCriteria === 0) return 1; // catch-all archetype (standard_loss)
    return matchCount / totalCriteria;
}

function ratioToConfidence(ratio) {
    if (ratio >= 1.0)  return CONFIDENCE.HIGH;
    if (ratio >= 0.75) return CONFIDENCE.HIGH;
    if (ratio >= 0.5)  return CONFIDENCE.MEDIUM;
    if (ratio >= 0.33) return CONFIDENCE.LOW;
    if (ratio > 0)     return CONFIDENCE.BORDERLINE;
    return CONFIDENCE.UNCLASSIFIED;
}

// ── Criterion evaluation ──────────────────────────────────────────────────────

function evalCriterion(criterion, trade, config) {
    const { field, op, value } = criterion;

    // Special derived fields
    if (field === "trade_duration_mins") {
        const mins = durationMinutes(trade);
        if (mins == null) return false;
        if (op === "lt")  return mins < value;
        if (op === "gte") return mins >= value;
        if (op === "lte") return mins <= value;
        if (op === "gt")  return mins > value;
    }
    if (field === "ob_fully_breached")       return isFullBreach(trade);
    if (field === "max_ob_penetration_pct") {
        const pct = Number(trade?.max_ob_penetration_pct);
        if (!Number.isFinite(pct)) return false;
        if (op === "gte") return pct >= value;
        if (op === "lte") return pct <= value;
    }
    if (field === "close_confirmed_ob_breach") return isCloseBreach(trade);

    // Generic field evaluation
    const v = trade?.[field];
    if (v == null) return false;

    if (op === "eq")  return v === value;
    if (op === "neq") return v !== value;
    const num = Number(v);
    if (!Number.isFinite(num)) return false;
    if (op === "gte") return num >= value;
    if (op === "lte") return num <= value;
    if (op === "gt")  return num > value;
    if (op === "lt")  return num < value;
    return false;
}

// ── Main classifier ───────────────────────────────────────────────────────────

/**
 * classify(trade, config?) → ClassificationResult
 *
 * ClassificationResult = {
 *   archetype:       string,          // archetype id
 *   confidence:      string,          // CONFIDENCE enum
 *   matchedCriteria: string[],        // which criteria fields matched
 *   matchCount:      number,
 *   totalCriteria:   number,
 * }
 */
export function classify(trade, config) {
    // Build TF-adjusted thresholds
    const execTf = config?.executionTf ?? config?.execution_tf;
    const fastThreshold = fastStopoutThresholdMins(execTf);
    const slowThreshold = slowBleedThresholdMins(execTf);

    // Override the dynamic threshold values in the registry criteria
    const adjustedArchetypes = ARCHETYPES.map(a => {
        if (a.id === "fast_stopout") {
            return { ...a, criteria: [{ field: "trade_duration_mins", op: "lt", value: fastThreshold }] };
        }
        if (a.id === "slow_bleed") {
            return { ...a, criteria: [{ field: "trade_duration_mins", op: "gte", value: slowThreshold }] };
        }
        return a;
    });

    // Try archetypes in priority order (order in ARCHETYPES array = priority)
    for (const arch of adjustedArchetypes) {
        if (arch.id === "standard_loss") continue; // skip catch-all in main loop

        if (arch.criteria.length === 0) continue;

        const results = arch.criteria.map(c => ({
            field:   c.field,
            matched: evalCriterion(c, trade, config),
        }));

        const matched = results.filter(r => r.matched);
        const total   = arch.criteria.length;

        const shouldMatch = arch.criteriaMode === "any"
            ? matched.length > 0
            : matched.length === total;

        if (shouldMatch) {
            const ratio = matchRatio(matched.length, total);
            return {
                archetype:       arch.id,
                confidence:      ratioToConfidence(ratio),
                matchedCriteria: matched.map(r => r.field),
                matchCount:      matched.length,
                totalCriteria:   total,
            };
        }
    }

    // Catch-all
    return {
        archetype:       "standard_loss",
        confidence:      CONFIDENCE.LOW,
        matchedCriteria: [],
        matchCount:      0,
        totalCriteria:   0,
    };
}

/**
 * classifyAll(trades, config?) → trades with classification attached
 * Each trade gets: { ...trade, archetype, confidence, matchedCriteria, matchCount, totalCriteria }
 */
export function classifyAll(trades, config) {
    if (!Array.isArray(trades)) return [];
    return trades.map(t => ({ ...t, ...classify(t, config) }));
}
