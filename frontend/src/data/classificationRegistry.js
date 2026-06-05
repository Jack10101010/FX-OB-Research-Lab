/**
 * classificationRegistry.js
 *
 * Single source of truth for all Trade Classification metadata.
 * NO derivation logic lives here — only data.
 *
 * Consumers:
 *   - tradeClassificationDims.js  (derives tags using CLASSIFICATION_TAGS keys)
 *   - ClassificationBadge.jsx     (looks up tone + label via getTagMeta())
 *   - Phase 2: applyClassificationFilter.js
 *   - Phase 3: ClassificationSummaryPanel, ClassificationPerfTable
 *
 * NOTE: This is the DIMENSION REGISTRY, not the outcome classifier.
 *   The existing tradeClassification.js exports classifyTrade() for WIN/LOSS
 *   outcome strings. These are orthogonal systems.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions — ordered; used for display grouping and filter panel layout.
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFICATION_DIMENSIONS = [
    { key: "entry_model",     label: "Entry Model",     multi: false },
    { key: "entry_context",   label: "Entry Context",   multi: true  },
    { key: "exit_type",       label: "Exit Type",       multi: false },
    { key: "protection_mode", label: "Protection Mode", multi: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tags — keyed by tag string.
//
// tone: must be one of the Pill component's supported tones:
//   "muted" | "primary" | "secondary" | "info" | "success" | "danger" | "warning"
//
// supportingFields: camelCase field names on the trade object that are
//   relevant to understanding why this tag was applied. Used by Phase 3+
//   analytics panels.
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFICATION_TAGS = {
    // ── entry_model ──────────────────────────────────────────────────────────

    baseline: {
        dim: "entry_model",
        label: "Baseline",
        tone: "muted",
        description: "Standard OB limit order with no entry model variant.",
    },
    te_same: {
        dim: "entry_model",
        label: "TE Same",
        tone: "info",
        description: "Triggered-edge limit armed and filled on the same candle as trigger.",
    },
    te_next: {
        dim: "entry_model",
        label: "TE Next",
        tone: "info",
        description: "Triggered-edge limit armed on the candle immediately after trigger (delay=1).",
    },
    te_d2: {
        dim: "entry_model",
        label: "TE D2",
        tone: "info",
        description: "Triggered-edge limit armed after a 2-candle delay window.",
    },
    te_d3: {
        dim: "entry_model",
        label: "TE D3",
        tone: "info",
        description: "Triggered-edge limit armed after a 3-candle delay window.",
    },
    ep_25: {
        dim: "entry_model",
        label: "EP 25%",
        tone: "primary",
        description: "Entry penetration limit at 25% OB depth.",
    },
    ep_50: {
        dim: "entry_model",
        label: "EP 50%",
        tone: "primary",
        description: "Entry penetration limit at 50% OB depth.",
    },
    ep_75: {
        dim: "entry_model",
        label: "EP 75%",
        tone: "primary",
        description: "Entry penetration limit at 75% OB depth.",
    },
    ep_100: {
        dim: "entry_model",
        label: "EP 100%",
        tone: "primary",
        description: "Entry penetration limit at 100% OB depth (far edge).",
    },
    unknown_model: {
        dim: "entry_model",
        label: "Unknown Model",
        tone: "muted",
        description: "Entry model key present but not recognised by the current registry.",
    },

    // ── entry_context ────────────────────────────────────────────────────────
    // Multi-valued dimension: a trade may have more than one context tag.
    // "clean" is the default/empty state and is intentionally not rendered in
    // the detail panel (showing "Clean" on every baseline trade is noise).

    clean: {
        dim: "entry_context",
        label: "Clean",
        tone: "muted",
        description: "No special entry context. Default state.",
    },
    aae: {
        dim: "entry_context",
        label: "AAE",
        tone: "warning",
        description: "Armed After OB Exit: price exited the OB through the entry side during the delay window before the limit order armed.",
        supportingFields: [
            "armedAfterObExit",
            "obOccupiedAtArm",
            "priceDistanceFromObAtArmPips",
            "armCandleIndex",
            "ob_exit_time",
        ],
    },
    ob_not_occupied: {
        dim: "entry_context",
        label: "OB Not Occupied",
        tone: "warning",
        description: "Price was not inside the OB range when the arm candle opened.",
        supportingFields: [
            "obOccupiedAtArm",
            "priceDistanceFromObAtArmPips",
        ],
    },

    // ── exit_type ─────────────────────────────────────────────────────────────

    tp_hit: {
        dim: "exit_type",
        label: "TP Hit",
        tone: "success",
        description: "Trade closed at take profit.",
    },
    sl_hit: {
        dim: "exit_type",
        label: "SL Hit",
        tone: "danger",
        description: "Trade closed at stop loss.",
    },
    breakeven: {
        dim: "exit_type",
        label: "Breakeven",
        tone: "muted",
        description: "Trade closed at or very near breakeven.",
    },
    news_flatten: {
        dim: "exit_type",
        label: "News Flatten",
        tone: "warning",
        description: "Active trade closed early by news blackout flatten rule.",
    },
    news_cancel: {
        dim: "exit_type",
        label: "News Cancel",
        tone: "warning",
        description: "Pending order cancelled by news blackout rule.",
    },
    protection_exit: {
        dim: "exit_type",
        label: "Protection Exit",
        tone: "secondary",
        description: "Trade closed by a protection mode rule before TP or SL.",
    },
    session_cancel: {
        dim: "exit_type",
        label: "Session Cancel",
        tone: "muted",
        description: "Pending order cancelled at end of session.",
    },
    reverse_cancel: {
        dim: "exit_type",
        label: "Reverse Cancel",
        tone: "muted",
        description: "Pending order cancelled due to a reverse-direction touch.",
    },
    invalid: {
        dim: "exit_type",
        label: "Invalid",
        tone: "muted",
        description: "Trade invalidated before fill (OB breach, structure change, etc.).",
    },
    unfilled: {
        dim: "exit_type",
        label: "Unfilled",
        tone: "muted",
        description: "Trade setup was valid but the limit order was never filled.",
    },
    unknown_exit: {
        dim: "exit_type",
        label: "Unknown Exit",
        tone: "muted",
        description: "Exit type could not be determined from available trade data.",
    },

    // ── protection_mode ───────────────────────────────────────────────────────
    // Phase 1: stub only. Full tag set deferred to Phase 2.
    // "baseline" key is intentionally reused from entry_model — both represent
    // "no active variant in this dimension." The ClassificationBadge lookup
    // returns the entry_model baseline metadata, which is acceptable for Phase 1
    // since protection_mode rows are not rendered.

    // (No additional protection_mode tags defined in Phase 1.)
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe tag metadata lookup.
 * Returns the registry entry for a known tag, or a muted fallback for unknown
 * tags so callers never need to null-check.
 *
 * @param {string} tag
 * @returns {{ dim: string|null, label: string, tone: string, description?: string, supportingFields?: string[] }}
 */
export function getTagMeta(tag) {
    return CLASSIFICATION_TAGS[tag] ?? { dim: null, label: String(tag), tone: "muted" };
}
