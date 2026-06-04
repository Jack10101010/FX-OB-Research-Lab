// ── entryRegistry.js ────────────────────────────────────────────────────────
// Single source of truth for all planned, in-development, and tested entry
// models. Extend this registry — never hard-code model lists in components.
//
// V2 ARCHITECTURE NOTE:
// Each entry model now carries full semantic metadata:
//   familyType       → machine-readable execution philosophy type
//   metricsProfile   → which analytics/KPI set applies to this model
//   fillDescription  → human-readable description of what "fill" means here
//   requiresLifecycleFunnel → whether funnel waterfall analytics are needed
//   supportedDimensions    → valid filter/split axes for this model
//
// Components MUST use metricsProfile / requiresLifecycleFunnel for branching,
// NOT string matching on mode names. String-match branching is fragile and
// will break as new families are added.
//
// TODO: triggered-edge entries could gain explicit triggerThreshold (numeric)
// and candleMode ("same"|"next") fields for sensitivity axis analysis. For
// now parse them from the mode key string when needed.

// ── Family type enum ─────────────────────────────────────────────────────────
// Used for machine-readable family classification. Add new types here before
// adding new model families — never invent type strings inline in components.

export const FAMILY_TYPES = {
    EDGE_TOUCH:          "edge_touch",          // Baseline: limit at OB edge
    LEVEL_ENTRY:         "level_entry",          // Penetration: enter at depth X%
    LIFECYCLE_TRIGGER:   "lifecycle_trigger",    // Triggered Edge: funnel-based entry
    CONFIRMATION_ENTRY:  "confirmation_entry",   // Confirmation: signal-gated entry
    // Future:
    // DISPLACEMENT_RETEST: "displacement_retest"
    // STRUCTURAL_RECLAIM:  "structural_reclaim"
};

// ── Metrics profile enum ──────────────────────────────────────────────────────
// Controls which KPI chips, table columns, and analytical panels are shown
// for a model. Add a new profile when a new family needs genuinely different
// analytics that don't map to any existing profile.

export const PROFILE_KEYS = {
    STANDARD:      "standard",      // Baseline: edge-touch semantics
    PENETRATION:   "penetration",   // Penetration: level-entry with delta-vs-baseline
    TRIGGERED_EDGE: "triggered_edge", // Lifecycle: funnel + trigger metrics
    CONFIRMATION:  "confirmation",  // Confirmation: signal-gated metrics
};

// ── Metrics profiles ──────────────────────────────────────────────────────────
// Describes the analytics behaviour for each profile type.
// Components read this to decide what to show — avoids per-model if-chains.

export const METRICS_PROFILES = {
    [PROFILE_KEYS.STANDARD]: {
        // Baseline — fill% is always 100%, never show it as a meaningful metric
        showFillRate:             false,
        fillRateIsCrossComparable: false,
        showDeltaVsBaseline:      false,
        fillLabel:                "Edge Touch",
        // Cross-family comparison: only these metrics are valid denominators
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    [PROFILE_KEYS.PENETRATION]: {
        showFillRate:             true,
        fillRateIsCrossComparable: false, // fill@ level ≠ baseline fill% ≠ triggered fill%
        showDeltaVsBaseline:      true,
        fillLabel:                "Fill @ Level",
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    [PROFILE_KEYS.TRIGGERED_EDGE]: {
        showFillRate:             true,   // shown as "end-to-end" funnel efficiency
        fillRateIsCrossComparable: false, // end-to-end fill% ≠ penetration fill%
        showDeltaVsBaseline:      true,
        fillLabel:                "End-to-End Fill",
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    [PROFILE_KEYS.CONFIRMATION]: {
        showFillRate:             true,
        fillRateIsCrossComparable: false,
        showDeltaVsBaseline:      true,
        fillLabel:                "Confirmed Fill",
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
};

// ── Entry families ────────────────────────────────────────────────────────────
// Authoritative list of all model families. Each entry now carries:
//   familyType              → FAMILY_TYPES enum value
//   metricsProfile          → PROFILE_KEYS enum value
//   fillLabel               → short label for "fill rate" in this family
//   fillDescription         → long human-readable fill denominator description
//   requiresLifecycleFunnel → whether to mount the lifecycle funnel panel for this family
//   validCrossCompareMetrics → which metrics are safe for cross-family comparison

export const ENTRY_FAMILIES = [
    {
        key:   "Baseline",
        label: "Baseline",
        color: "hsl(var(--accent-secondary))",
        familyType:              FAMILY_TYPES.EDGE_TOUCH,
        metricsProfile:          PROFILE_KEYS.STANDARD,
        fillLabel:               "Edge Touch",
        fillDescription:         "All eligible setups — edge-touch is assumed fill by definition",
        requiresLifecycleFunnel: false,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Penetration",
        label: "Penetration",
        color: "hsl(var(--accent-primary))",
        familyType:              FAMILY_TYPES.LEVEL_ENTRY,
        metricsProfile:          PROFILE_KEYS.PENETRATION,
        fillLabel:               "Fill @ Level",
        fillDescription:         "Setups where price reached the penetration depth",
        requiresLifecycleFunnel: false,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Triggered Edge",
        label: "Triggered Edge",
        color: "hsl(var(--success))",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillLabel:               "End-to-End Fill",
        fillDescription:         "Setups that triggered and then filled at OB edge",
        requiresLifecycleFunnel: true,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Confirmation",
        label: "Confirmation",
        color: "hsl(var(--warning))",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillLabel:               "Confirmed Fill",
        fillDescription:         "Setups with confirmation signal that filled",
        requiresLifecycleFunnel: false,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Reclaim",
        label: "Reclaim",
        color: "hsl(var(--success))",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillLabel:               "Reclaim Fill",
        fillDescription:         "Setups with wick/sweep reclaim confirmation that filled",
        requiresLifecycleFunnel: false,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Lifecycle",
        label: "Lifecycle",
        color: "hsl(var(--danger))",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillLabel:               "Lifecycle Fill",
        fillDescription:         "Fills after all lifecycle criteria were met",
        requiresLifecycleFunnel: true,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
    {
        key:   "Session",
        label: "Session",
        color: "hsl(var(--accent-glow))",
        familyType:              FAMILY_TYPES.EDGE_TOUCH,
        metricsProfile:          PROFILE_KEYS.STANDARD,
        fillLabel:               "Fill Rate",
        fillDescription:         "Session-filtered fills at OB edge",
        requiresLifecycleFunnel: false,
        validCrossCompareMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
    },
];

// Fast O(1) lookup map. Built once at module initialisation.
const _FAMILY_META_MAP = Object.fromEntries(ENTRY_FAMILIES.map(f => [f.key, f]));

// ── Family helper functions ───────────────────────────────────────────────────

/** Returns the full family metadata object for a family key, or null. */
export function getFamilyMeta(familyKey) {
    return _FAMILY_META_MAP[familyKey] || null;
}

/** Returns true for families that use lifecycle / funnel-based analytics. */
export function isLifecycleFamilyType(familyType) {
    return familyType === FAMILY_TYPES.LIFECYCLE_TRIGGER;
}

/** Returns the METRICS_PROFILES entry for a profile key, or standard as fallback. */
export function getMetricsProfile(profileKey) {
    return METRICS_PROFILES[profileKey] || METRICS_PROFILES[PROFILE_KEYS.STANDARD];
}

// ── Family tone (display) ─────────────────────────────────────────────────────

export const FAMILY_TONE = {
    Baseline:        "secondary",
    Penetration:     "primary",
    "Triggered Edge": "success",
    Confirmation:    "warning",
    Reclaim:         "success",
    Lifecycle:       "danger",
    Session:         "muted",
};

// ── Planned entry modes ───────────────────────────────────────────────────────
// Each entry carries full semantic metadata. The fields
// (familyType, metricsProfile, fillDescription, requiresLifecycleFunnel,
// supportedDimensions) flow automatically to row objects via entryAnalytics
// buildEntryResultRows → spread { ...planned, ... }.
//
// For triggered-edge entries, triggerThreshold and candleMode ("same"|"next")
// can be parsed from the mode key string when needed.

export const PLANNED_ENTRY_MODES = [
    {
        mode:      "baseline",
        label:     "Baseline · Edge Touch",
        family:    "Baseline",
        threshold: "Edge",
        status:    "live",
        // ── V2 semantic metadata ──
        familyType:              FAMILY_TYPES.EDGE_TOUCH,
        metricsProfile:          PROFILE_KEYS.STANDARD,
        fillDescription:         "All eligible setups — edge-touch is assumed fill by definition",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session"],
    },

    // ── Penetration family ────────────────────────────────────────────────────
    {
        mode:      "entry_penetration_10p0",
        label:     "Penetration 10%",
        family:    "Penetration",
        threshold: "10%",
        status:    "live",
        familyType:              FAMILY_TYPES.LEVEL_ENTRY,
        metricsProfile:          PROFILE_KEYS.PENETRATION,
        fillDescription:         "Setups where price reached 10% into the OB",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session", "threshold"],
    },
    {
        mode:      "entry_penetration_25p0",
        label:     "Penetration 25%",
        family:    "Penetration",
        threshold: "25%",
        status:    "live",
        familyType:              FAMILY_TYPES.LEVEL_ENTRY,
        metricsProfile:          PROFILE_KEYS.PENETRATION,
        fillDescription:         "Setups where price reached 25% into the OB",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session", "threshold"],
    },
    {
        mode:      "entry_penetration_50p0",
        label:     "Penetration 50%",
        family:    "Penetration",
        threshold: "50%",
        status:    "live",
        familyType:              FAMILY_TYPES.LEVEL_ENTRY,
        metricsProfile:          PROFILE_KEYS.PENETRATION,
        fillDescription:         "Setups where price reached 50% into the OB",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session", "threshold"],
    },
    {
        mode:      "entry_penetration_75p0",
        label:     "Penetration 75%",
        family:    "Penetration",
        threshold: "75%",
        status:    "live",
        familyType:              FAMILY_TYPES.LEVEL_ENTRY,
        metricsProfile:          PROFILE_KEYS.PENETRATION,
        fillDescription:         "Setups where price reached 75% into the OB",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session", "threshold"],
    },

    // ── Triggered Edge family ─────────────────────────────────────────────────
    {
        mode:      "entry_triggered_edge_25p0_same",
        label:     "Trigger 25% → Edge entry · same candle",
        family:    "Triggered Edge",
        threshold: "25% same",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 25% and filled at edge (same candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_25p0_next",
        label:     "Trigger 25% → Edge entry · next candle",
        family:    "Triggered Edge",
        threshold: "25% next",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 25% and filled at edge (next candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_10p0_same",
        label:     "Trigger 10% → Edge entry · same candle",
        family:    "Triggered Edge",
        threshold: "10% same",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 10% and filled at edge (same candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_10p0_next",
        label:     "Trigger 10% → Edge entry · next candle",
        family:    "Triggered Edge",
        threshold: "10% next",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 10% and filled at edge (next candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_50p0_same",
        label:     "Trigger 50% → Edge entry · same candle",
        family:    "Triggered Edge",
        threshold: "50% same",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 50% and filled at edge (same candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_50p0_next",
        label:     "Trigger 50% → Edge entry · next candle",
        family:    "Triggered Edge",
        threshold: "50% next",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 50% and filled at edge (next candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_75p0_same",
        label:     "Trigger 75% → Edge entry · same candle",
        family:    "Triggered Edge",
        threshold: "75% same",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 75% and filled at edge (same candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_75p0_next",
        label:     "Trigger 75% → Edge entry · next candle",
        family:    "Triggered Edge",
        threshold: "75% next",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 75% and filled at edge (next candle)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },

    // ── Triggered Edge — Delay +2 / +3 variants ───────────────────────────────
    {
        mode:      "entry_triggered_edge_10p0_d2",
        label:     "Trigger 10% → Edge entry · Delay +2",
        family:    "Triggered Edge",
        threshold: "10% d2",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 10% and filled at edge (Delay +2 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_10p0_d3",
        label:     "Trigger 10% → Edge entry · Delay +3",
        family:    "Triggered Edge",
        threshold: "10% d3",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 10% and filled at edge (Delay +3 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_25p0_d2",
        label:     "Trigger 25% → Edge entry · Delay +2",
        family:    "Triggered Edge",
        threshold: "25% d2",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 25% and filled at edge (Delay +2 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_25p0_d3",
        label:     "Trigger 25% → Edge entry · Delay +3",
        family:    "Triggered Edge",
        threshold: "25% d3",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 25% and filled at edge (Delay +3 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_50p0_d2",
        label:     "Trigger 50% → Edge entry · Delay +2",
        family:    "Triggered Edge",
        threshold: "50% d2",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 50% and filled at edge (Delay +2 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_50p0_d3",
        label:     "Trigger 50% → Edge entry · Delay +3",
        family:    "Triggered Edge",
        threshold: "50% d3",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 50% and filled at edge (Delay +3 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_75p0_d2",
        label:     "Trigger 75% → Edge entry · Delay +2",
        family:    "Triggered Edge",
        threshold: "75% d2",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 75% and filled at edge (Delay +2 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },
    {
        mode:      "entry_triggered_edge_75p0_d3",
        label:     "Trigger 75% → Edge entry · Delay +3",
        family:    "Triggered Edge",
        threshold: "75% d3",
        status:    "live",
        familyType:              FAMILY_TYPES.LIFECYCLE_TRIGGER,
        metricsProfile:          PROFILE_KEYS.TRIGGERED_EDGE,
        fillDescription:         "Setups that triggered at 75% and filled at edge (Delay +3 candles)",
        requiresLifecycleFunnel: true,
        supportedDimensions:     ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
    },

    // ── Confirmation family (planned) ─────────────────────────────────────────
    {
        mode:      "close_inside_edge",
        label:     "1m Close Inside → Edge Order",
        family:    "Confirmation",
        threshold: "Close inside",
        status:    "planned",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillDescription:         "Setups with 1m close inside OB that then filled at edge",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session"],
    },
    {
        mode:      "wick_reclaim",
        label:     "Wick Reclaim Confirmation",
        family:    "Confirmation",
        threshold: "Reclaim",
        status:    "planned",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillDescription:         "Setups with wick reclaim confirmation that filled",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session"],
    },
    {
        mode:      "sweep_reclaim",
        label:     "Sweep + Reclaim",
        family:    "Confirmation",
        threshold: "Sweep",
        status:    "planned",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillDescription:         "Setups with sweep + reclaim confirmation that filled",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session"],
    },
    {
        mode:      "delayed_confirmation",
        label:     "Delayed Confirmation Entry",
        family:    "Confirmation",
        threshold: "Delay",
        status:    "planned",
        familyType:              FAMILY_TYPES.CONFIRMATION_ENTRY,
        metricsProfile:          PROFILE_KEYS.CONFIRMATION,
        fillDescription:         "Setups with delayed confirmation signal that filled",
        requiresLifecycleFunnel: false,
        supportedDimensions:     ["direction", "session"],
    },
];

// ── Research backlog ──────────────────────────────────────────────────────────

export const ENTRY_BACKLOG = [
    { title: "Spread / Slippage Modelling",      status: "Future execution realism",   body: "Model realistic spread, slippage, and missed fills around reactive confirmation entries." },
    { title: "Stop-Entry Confirmation Models",    status: "Future exporter fields",     body: "Compare close-inside followed by stop/trigger entry instead of passive edge retest." },
    { title: "Liquidity Confirmation",            status: "Future derived feature",     body: "Require sweep/reclaim or liquidity event tags before activating an entry model." },
    { title: "HTF Confirmation",                  status: "Future context tagging",     body: "Split entry performance by higher-timeframe alignment and structure state." },
    { title: "News-Aware Entries",                status: "Future external data",       body: "Suppress or alter entries near high-impact news windows." },
    { title: "Session-Aware Entries",             status: "Research hook",              body: "Enable model selection by Asia, London, London Lull, New York, and Outside sessions." },
    { title: "Regime-Aware Entries",              status: "Future regime tagging",      body: "Compare entry models during trending, ranging, and volatility expansion regimes." },
    { title: "Broker Execution Realism",          status: "Future execution model",     body: "Account for order queueing, partial fills, latency, and broker-specific fill behavior." },
];

export const LIFECYCLE_IDEAS = [
    { title: "Cancel if structurally invalidated before fill",  status: "Pending lifecycle",    body: "Requires pending-order exporter state" },
    { title: "Cancel if excessive penetration pre-fill",         status: "Pending lifecycle",    body: "Requires pre-fill penetration trail" },
    { title: "Cancel after X time decay",                        status: "Pending lifecycle",    body: "Requires pending age / expiry simulation" },
    { title: "Reverse touch invalidation",                       status: "Invalidation",         body: "Requires reverse-side touch tracking" },
    { title: "Displacement-through cancel",                      status: "Invalidation",         body: "Requires candle displacement tags" },
];

// ── Sample confidence thresholds ──────────────────────────────────────────────

export const LOW_SAMPLE_N      = 10;
export const MODERATE_SAMPLE_N = 30;
export const ROBUST_SAMPLE_N   = 50;

// Minimum N per direction before directional analysis is considered meaningful.
// Exposed here so DirectionPanel and analytics can share the same threshold.
export const MIN_DIRECTION_N   = 15;

export function sampleConfidence(n) {
    if (!n || n < LOW_SAMPLE_N)     return { label: "INSUFFICIENT", tone: "danger" };
    if (n < MODERATE_SAMPLE_N)      return { label: "LOW N",        tone: "warning" };
    if (n < ROBUST_SAMPLE_N)        return { label: "MODERATE N",   tone: "secondary" };
    return                                  { label: "ROBUST",       tone: "success" };
}

// ── Model lookup helpers ──────────────────────────────────────────────────────

export function familyModels(family) {
    return PLANNED_ENTRY_MODES.filter(m => m.family === family);
}

export function modelByMode(mode) {
    const norm = String(mode || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    // Directional scenario IDs (dir_long_*__short_*) are not in PLANNED_ENTRY_MODES by design —
    // they are cross-scenario composites stored in bundle.directionalResults, not individual entry
    // families. Use formatDirectionalScenarioLabel() from entryFormatters.js to display them.
    if (norm.startsWith("dir_long_")) return null;
    return PLANNED_ENTRY_MODES.find(m => m.mode === norm) || null;
}
