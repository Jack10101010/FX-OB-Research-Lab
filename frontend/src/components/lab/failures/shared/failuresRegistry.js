// ── failuresRegistry.js ──────────────────────────────────────────────────────
// Single source of truth for the failure archetype taxonomy.
// No React. No side effects. Pure data + display tokens.
//
// Imports sampleConfidence from entryRegistry — never duplicates it.

export { sampleConfidence } from "@/components/lab/entries/analytics/entryRegistry";

// ── Tier 1 Archetypes (Tier 0 data — no exporter changes needed) ─────────────

export const ARCHETYPES = [
    {
        id:          "hard_invalidation",
        label:       "Hard Invalidation",
        description: "Price fully breached the order block (≥100% penetration). Structural failure.",
        tier:        1,
        colour:      "hsl(var(--danger))",
        tone:        "danger",
        iconName:    "XOctagon",
        criteria: [
            { field: "ob_fully_breached",       op: "eq",  value: true },
            { field: "max_ob_penetration_pct",  op: "gte", value: 100 },
        ],
        criteriaMode:       "any",   // any = OR logic; "all" = AND logic
        requiredFields:     ["ob_fully_breached"],
        severityWeight:     1.4,
        radarProfile: {
            timingRisk:      0.3,
            newsRisk:        0.2,
            directionalBias: 0.5,
            sessionRisk:     0.3,
            obQuality:       0.9,
            preEntryRisk:    0.7,
        },
        suggestedHypotheses: [
            "Test hard invalidation exit to reduce average loss on OB breach trades",
            "Investigate OB width of hard-invalidation losses vs winners",
            "Compare hard invalidation rate by session — London vs New York",
        ],
    },
    {
        id:          "close_confirmed",
        label:       "Close-Confirmed Invalidation",
        description: "Price closed beyond the OB edge confirming structural failure before stop was hit.",
        tier:        1,
        colour:      "hsl(var(--warning))",
        tone:        "warning",
        iconName:    "CandlestickChart",
        criteria: [
            { field: "close_confirmed_ob_breach", op: "eq", value: true },
        ],
        criteriaMode:   "all",
        requiredFields: ["close_confirmed_ob_breach"],
        severityWeight: 1.2,
        radarProfile: {
            timingRisk:      0.4,
            newsRisk:        0.2,
            directionalBias: 0.5,
            sessionRisk:     0.4,
            obQuality:       0.8,
            preEntryRisk:    0.6,
        },
        suggestedHypotheses: [
            "Test close-confirmed exit to limit damage from validated structural failures",
            "Compare close-confirmed rate by structure type (BOS vs CHoCH)",
        ],
    },
    {
        id:          "fast_stopout",
        label:       "Fast Stopout",
        description: "Trade stopped out quickly (< 30 min). May indicate entry timing issue or stop raid.",
        tier:        1,
        colour:      "hsl(var(--accent-primary))",
        tone:        "primary",
        iconName:    "Timer",
        criteria: [
            { field: "trade_duration_mins", op: "lt", value: 30 },
        ],
        criteriaMode:   "all",
        requiredFields: [], // derived from entry/exit timestamps — always available
        severityWeight: 1.1,
        radarProfile: {
            timingRisk:      0.8,
            newsRisk:        0.5,
            directionalBias: 0.4,
            sessionRisk:     0.6,
            obQuality:       0.4,
            preEntryRisk:    0.5,
        },
        suggestedHypotheses: [
            "Investigate fast stopout concentration by hour — possible news or liquidity event",
            "Check if fast stopouts cluster on specific sessions",
            "Test stop buffer increase to see if fast stopouts convert to winners",
        ],
    },
    {
        id:          "slow_bleed",
        label:       "Slow Bleed",
        description: "Trade was open for a long time (> 4 hrs) and gradually moved against. No sharp invalidation.",
        tier:        1,
        colour:      "hsl(var(--accent-secondary))",
        tone:        "secondary",
        iconName:    "TrendingDown",
        criteria: [
            { field: "trade_duration_mins", op: "gte", value: 240 },
        ],
        criteriaMode:   "all",
        requiredFields: [],
        severityWeight: 1.0,
        radarProfile: {
            timingRisk:      0.3,
            newsRisk:        0.4,
            directionalBias: 0.7,
            sessionRisk:     0.5,
            obQuality:       0.5,
            preEntryRisk:    0.6,
        },
        suggestedHypotheses: [
            "Test time-decay exit — cancel after 4 hours if no meaningful movement",
            "Investigate slow bleed by day of week and session",
        ],
    },
    {
        id:          "standard_loss",
        label:       "Standard Loss",
        description: "Loss that doesn't fit a specific archetype signature. Review for patterns.",
        tier:        1,
        colour:      "hsl(var(--text-2))",
        tone:        "muted",
        iconName:    "Minus",
        criteria:    [], // catch-all
        criteriaMode: "all",
        requiredFields: [],
        severityWeight: 1.0,
        radarProfile: {
            timingRisk:      0.3,
            newsRisk:        0.3,
            directionalBias: 0.3,
            sessionRisk:     0.3,
            obQuality:       0.3,
            preEntryRisk:    0.3,
        },
        suggestedHypotheses: [
            "Review standard losses in Replay Mode to identify uncatalogued patterns",
        ],
    },
];

export const ARCHETYPE_MAP = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]));

export const RADAR_AXES = [
    { key: "timingRisk",      label: "Timing Risk" },
    { key: "newsRisk",        label: "News Risk" },
    { key: "directionalBias", label: "Direction" },
    { key: "sessionRisk",     label: "Session Risk" },
    { key: "obQuality",       label: "OB Quality" },
    { key: "preEntryRisk",    label: "Pre-Entry" },
];

export function getArchetype(id) {
    return ARCHETYPE_MAP[id] || ARCHETYPES.find(a => a.id === "standard_loss");
}

export function archetypeLabel(id) {
    return ARCHETYPE_MAP[id]?.label ?? id ?? "Unknown";
}

export function archetypeTone(id) {
    return ARCHETYPE_MAP[id]?.tone ?? "muted";
}

export function archetypeColour(id) {
    return ARCHETYPE_MAP[id]?.colour ?? "hsl(var(--text-2))";
}

// Tier thresholds for fast-stopout — adjusted by execution TF
export function fastStopoutThresholdMins(executionTf) {
    const tf = String(executionTf || "").toLowerCase();
    if (tf.includes("h1") || tf === "1h" || tf === "60")   return 120;
    if (tf.includes("h4") || tf === "4h" || tf === "240")  return 240;
    if (tf.includes("m5") || tf === "5")                    return 10;
    if (tf.includes("m1") || tf === "1")                    return 5;
    return 30; // default: M15
}

// Slow-bleed threshold (mins)
export function slowBleedThresholdMins(executionTf) {
    const tf = String(executionTf || "").toLowerCase();
    if (tf.includes("h1") || tf === "1h" || tf === "60")   return 480;
    if (tf.includes("h4") || tf === "4h" || tf === "240")  return 960;
    if (tf.includes("m5") || tf === "5")                    return 60;
    return 240; // default: M15
}
