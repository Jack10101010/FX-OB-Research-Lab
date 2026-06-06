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

    // ── entry_context (canonical fill-state-at-arm leaves) ───────────────────
    // Single source of truth for the fill-state taxonomy (FILL-STATE-TAXONOMY-1).
    // deriveEntryContext() returns exactly one of these per trade.
    //
    // Hierarchy:
    //   occupied_at_arm                      (textbook fill — "clean")
    //   vacant_at_arm  ──┬── aae             (parent + signal subtypes)
    //                    └── vacant_no_aae
    //   unknown_at_arm                       (uninstrumented / baseline default)
    //
    // muteAsBadge: default/non-signal states (occupied_at_arm, unknown_at_arm)
    // are hidden by ClassificationBadge but still counted by analytics tables.
    // "Clean" is deprecated as a bucket — it resolves to occupied_at_arm via
    // TAG_ALIASES.

    occupied_at_arm: {
        dim: "entry_context",
        label: "Occupied At Arm",
        tone: "muted",
        muteAsBadge: true,
        description: "Price was still inside the OB range when the arm candle opened — the textbook ('clean') fill.",
        supportingFields: ["obOccupiedAtArm"],
    },
    vacant_at_arm: {
        dim: "entry_context",
        label: "OB Vacant At Arm",
        tone: "warning",
        description: "Price had already left the OB range when the order armed. Parent state: the superset of AAE and Vacant — No AAE.",
        supportingFields: ["obOccupiedAtArm", "armedAfterObExit"],
    },
    aae: {
        dim: "entry_context",
        label: "AAE",
        tone: "warning",
        description: "Armed After OB Exit: price exited the OB through the entry side during the delay window, then returned and filled. A subtype of OB Vacant.",
        supportingFields: [
            "armedAfterObExit",
            "obOccupiedAtArm",
            "armCandleIndex",
            "ob_exit_time",
        ],
    },
    vacant_no_aae: {
        dim: "entry_context",
        label: "Vacant — No AAE",
        tone: "warning",
        description: "OB was vacant at arm but the fill was not flagged AAE (vacant from origin, or no clean exit-and-return through the entry side).",
        supportingFields: ["obOccupiedAtArm", "armedAfterObExit"],
    },
    unknown_at_arm: {
        dim: "entry_context",
        label: "Unknown At Arm",
        tone: "muted",
        muteAsBadge: true,
        description: "OB occupancy at arm could not be determined (baseline / non-TE trades, or runs predating AAE instrumentation). Not 'clean'.",
        supportingFields: ["obOccupiedAtArm"],
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
// Aliases — legacy / deprecated tag keys mapped to canonical keys.
//
// Keeps old run bundles, persisted filter state, and serialized data resolving
// after the fill-state taxonomy rename (FILL-STATE-TAXONOMY-2):
//   - ob_not_occupied → vacant_no_aae  (old name described the parent, but the
//     derivation only ever produced the non-AAE leaf)
//   - clean           → occupied_at_arm ("clean" deprecated as a bucket)
// ─────────────────────────────────────────────────────────────────────────────

export const TAG_ALIASES = {
    ob_not_occupied: "vacant_no_aae",
    clean:           "occupied_at_arm",
};

/**
 * Map a possibly-legacy tag key to its canonical key.
 * Canonical and unknown keys pass through unchanged.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeContextTag(tag) {
    return TAG_ALIASES[tag] ?? tag;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe tag metadata lookup. Resolves legacy aliases first, then returns the
 * registry entry for the canonical tag, or a muted fallback for unknown tags so
 * callers never need to null-check.
 *
 * @param {string} tag
 * @returns {{ dim: string|null, label: string, tone: string, muteAsBadge?: boolean, description?: string, supportingFields?: string[] }}
 */
export function getTagMeta(tag) {
    const canonical = normalizeContextTag(tag);
    return CLASSIFICATION_TAGS[canonical] ?? { dim: null, label: String(tag), tone: "muted" };
}
