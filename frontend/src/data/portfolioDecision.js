// portfolioDecision.js — Portfolio Manager v1 (Phase 4): per-trade decision adapter.
//
// PURE. Reads the portfolio_* columns the Lux backend stamps on a trade row when a
// deployed policy is active (Phase 2) and produces a small display model for the
// PortfolioDecisionCard. NO React, NO mutation, NO execution. Returns null when the
// row carries no portfolio decision (⇒ the card is hidden).
//
// Backend columns (snake_case): portfolio_policy_version, portfolio_policy_regime,
// portfolio_decision_reason, portfolio_confidence, portfolio_status,
// portfolio_cohort_key. The actual BLOCK (enforce mode) is on the trade's outcome
// (REGIME_BLOCKED) + regime_block_reason (state_not_allowed | direction_mismatch |
// portfolio_disabled). Both snake_case and camelCase spellings are accepted.

const REGIMES = new Set(["LABEL", "STATE_ONLY", "DIRECTION_AWARE", "DISABLE"]);
const CONFIDENCES = new Set(["HIGH", "MEDIUM", "LOW", "MORE_DATA_REQUIRED"]);
const BLOCK_REASONS = new Set(["state_not_allowed", "direction_mismatch", "portfolio_disabled"]);

function get(row, ...keys) {
    if (!row) return null;
    for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
}

/** lower-case + collapse any non-alphanumeric run to "_" (maps "Direction-Mismatch",
 *  "direction mismatch", "DIRECTION_MISMATCH" → "direction_mismatch"). */
function normReason(v) {
    if (v == null) return null;
    return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const POLICY_LABEL = {
    LABEL: "Label (no filter)",
    STATE_ONLY: "State-only",
    DIRECTION_AWARE: "Direction-aware",
    DISABLE: "Disabled",
};

// Reason code → { label, tone }. Covers decision reasons + block reasons + safe synonyms.
const REASON_INFO = {
    policy_label: { label: "Label — no regime filter", tone: "muted" },
    policy_state_only: { label: "State-only filter", tone: "success" },
    policy_direction_aware: { label: "Direction-aware filter", tone: "success" },
    policy_disabled: { label: "Disabled cohort", tone: "danger" },
    insufficient_data: { label: "Insufficient data — fail-safe to Label", tone: "warning" },
    unknown_cohort: { label: "Unknown cohort — fail-safe to Label", tone: "warning" },
    state_not_allowed: { label: "State not allowed", tone: "danger" },
    direction_mismatch: { label: "Direction mismatch", tone: "danger" },
    portfolio_disabled: { label: "Disabled cohort", tone: "danger" },
    // tolerated synonyms
    disabled: { label: "Disabled cohort", tone: "danger" },
    unknown: { label: "Unknown cohort — fail-safe to Label", tone: "warning" },
};

function reasonInfo(code) {
    return REASON_INFO[code] || (code ? { label: code.replace(/_/g, " "), tone: "muted" } : null);
}

/**
 * Build the per-trade portfolio decision display model, or null when absent.
 * @param {object} trade raw/normalized trade row (raw snake_case columns preserved).
 * @returns {null | {
 *   present, policy, policyLabel, status, blocked, headline,
 *   reasonCode, reasonLabel, tone, confidence, cohortKey, version
 * }}
 */
export function portfolioDecisionForTrade(trade) {
    const rawRegime = get(trade, "portfolio_policy_regime", "portfolioPolicyRegime");
    const version = get(trade, "portfolio_policy_version", "portfolioPolicyVersion");
    const decisionReason = normReason(get(trade, "portfolio_decision_reason", "portfolioDecisionReason"));
    const statusRaw = get(trade, "portfolio_status", "portfolioStatus");
    const cohortKey = get(trade, "portfolio_cohort_key", "portfolioCohortKey");
    const confRaw = get(trade, "portfolio_confidence", "portfolioConfidence");

    // No portfolio instrumentation on this row → nothing to show.
    if (rawRegime == null && decisionReason == null && statusRaw == null && cohortKey == null) {
        return null;
    }

    const policy = REGIMES.has(rawRegime) ? rawRegime : "LABEL";
    const confidence = CONFIDENCES.has(confRaw) ? confRaw : null;

    // Block signal (enforce mode): outcome REGIME_BLOCKED and/or a portfolio block reason.
    const outcome = normReason(get(trade, "outcome", "raw_outcome"));
    const blockReason = normReason(
        get(trade, "regime_block_reason", "regimeBlockReason",
            "portfolio_block_reason", "portfolioBlockReason"));
    const blocked = (blockReason != null && BLOCK_REASONS.has(blockReason))
        || outcome === "regime_blocked";

    let status;      // "blocked" | "disabled" | "unknown" | "allowed"
    let headline;
    let effectiveReason;
    if (blocked) {
        status = "blocked";
        headline = "Blocked by Portfolio Manager";
        effectiveReason = blockReason || (policy === "DISABLE" ? "portfolio_disabled" : decisionReason);
    } else if (policy === "DISABLE" || String(statusRaw).toUpperCase() === "DISABLED") {
        status = "disabled";
        headline = "Disabled cohort";
        effectiveReason = "policy_disabled";
    } else if (decisionReason === "unknown_cohort" || decisionReason === "insufficient_data") {
        status = "unknown";
        headline = "Allowed (fail-safe)";
        effectiveReason = decisionReason;
    } else {
        status = "allowed";
        headline = "Allowed by Portfolio Manager";
        effectiveReason = decisionReason || `policy_${policy.toLowerCase()}`;
    }

    const info = reasonInfo(effectiveReason) || { label: "—", tone: "muted" };
    const tone = status === "blocked" || status === "disabled" ? "danger"
        : status === "unknown" ? "warning" : info.tone;

    return {
        present: true,
        policy,
        policyLabel: POLICY_LABEL[policy] || policy,
        status,
        blocked,
        headline,
        reasonCode: effectiveReason || null,
        reasonLabel: info.label,
        tone,
        confidence,
        cohortKey: cohortKey || null,
        version: version || null,
    };
}

export const _internals = { normReason, reasonInfo, POLICY_LABEL, REASON_INFO };
