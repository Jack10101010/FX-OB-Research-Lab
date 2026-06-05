// ── configRegistry.js ──────────────────────────────────────────────────────
// Canonical map of every frontend cfg key used in StrategyBuilder.jsx.
// This is the Phase 1 foundation for the Master Controls / Research Control Plane.
//
// Schema per entry:
//   key          — frontend cfg key (camelCase, matches StrategyBuilder useState)
//   label        — human label (sourced from LOAD_FIELD_LABELS in StrategyBuilder.jsx)
//   group        — "core"|"structure"|"execution"|"entry"|"protection"|"session"|"news"|"cost"
//   tier         — 1=frontend-only filter | 2=future rescore candidate | 3=full rerun required
//   emitted      — true if the field is included in the sidecarConfig produced by
//                  buildBacktesterConfig(). Fields marked false are either:
//                    (a) UI-only controls that shape other emitted fields (entryMode, etc.)
//                    (b) Silently dropped — importer expects them but buildBacktesterConfig
//                        never emits them (conflict, cancelAction, originSession,
//                        detectionSession, monteCarlo)
//   backendKey   — Primary snake_case key in the sidecarConfig JSON.
//                  Empty string if the field is not emitted OR if it contributes
//                  to a composite array (see notes below).
//                  NOTE for composite array contributors:
//                    allowed_structure_directions — bosLong, bosShort, chochLong, chochShort
//                    allowed_sessions             — london, lull, newYork, asia, outside
//                    entry_models                 — entryResearchExports, triggeredEdgeEntries
//                  These fields ARE emitted (emitted:true) but their individual values
//                  are folded into the parent array by buildBacktesterConfig().
//                  Master Controls must reconstruct the full array, not patch individual keys.
//   defaultValue — Default from cfg useState in StrategyBuilder.jsx.
//                  dateFrom / dateTo are null here because they are computed dynamically
//                  by getDefaultDates() at runtime; callers must supply live defaults.
//
// DROPPED FIELDS (emitted:false, backendKey:"", documented intent):
//   conflict       — intended backend key: position_conflict
//                    importer applyFirstPresent: ["position_conflict","conflict","conflict_mode","allow_auto_reversal"]
//                    NOT emitted by buildBacktesterConfig(). Backend support unconfirmed
//                    (sidecar not mounted). Do not emit until backend is verified.
//   cancelAction   — intended backend key: cancel_action
//                    importer applyFirstPresent: ["cancel_action","cancelled_by_conflict","canceled_by_conflict","conflict_cancel_action"]
//                    Same status as conflict.
//   originSession  — intended backend key: origin_session
//                    importer applyFirstPresent: ["origin_session","ob_origin_session","originSession"]
//                    Same status.
//   detectionSession — intended backend key: detection_session
//                    importer applyFirstPresent: ["detection_session","ob_detection_session","detectionSession"]
//                    Same status.
//   monteCarlo     — intended backend key: monte_carlo
//                    importer applyFirstPresent: ["monte_carlo","monteCarlo","monte_carlo_enabled"]
//                    Same status.
//
// UI-CONTROL FIELDS (emitted:false, no direct backend key):
//   entryMode            — selects single vs research-export branch in buildBacktesterConfig.
//                          Results flow into entry_models, entry_penetration_thresholds, etc.
//   selectedEntryModel   — within single mode, selects baseline / entry_penetration / triggered_edge.
//   entryResearchExportMode — shapes how entryPenetrationThresholds are resolved in research mode.
//                             No standalone backend key; influence expressed via entry_models.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_REGISTRY = [

    // ── Core ─────────────────────────────────────────────────────────────────
    { key: "symbol",          label: "symbol",                    group: "core",      tier: 3, emitted: true,  backendKey: "symbol",                  defaultValue: "EURUSD" },
    { key: "detectionTf",     label: "detection timeframe",       group: "core",      tier: 3, emitted: true,  backendKey: "detection_timeframe",     defaultValue: "M15" },
    { key: "executionTf",     label: "execution timeframe",       group: "core",      tier: 3, emitted: true,  backendKey: "execution_timeframe",     defaultValue: "1m" },
    { key: "dateFrom",        label: "date from",                 group: "core",      tier: 3, emitted: true,  backendKey: "start_date",              defaultValue: null },
    { key: "dateTo",          label: "date to",                   group: "core",      tier: 3, emitted: true,  backendKey: "end_date",                defaultValue: null },
    { key: "dataFile",        label: "data file",                 group: "core",      tier: 3, emitted: true,  backendKey: "candle_file",             defaultValue: "data/candles/EURUSD_1m.csv" },
    { key: "swing",           label: "swing length",              group: "core",      tier: 3, emitted: true,  backendKey: "swing_length",            defaultValue: 50 },
    { key: "obFilter",        label: "OB filter",                 group: "core",      tier: 3, emitted: true,  backendKey: "ob_filter",               defaultValue: "ATR" },
    { key: "minObSizePips",   label: "Min OB size",               group: "core",      tier: 3, emitted: true,  backendKey: "min_ob_size_pips",        defaultValue: 0 },
    { key: "maxObSizePips",   label: "Max OB size",               group: "core",      tier: 3, emitted: true,  backendKey: "max_ob_size_pips",        defaultValue: 100 },
    { key: "executionMode",   label: "execution mode",            group: "core",      tier: 3, emitted: true,  backendKey: "execution_modes",         defaultValue: "multi_position" },
    // Dropped — backend support unconfirmed. See file header for details.
    { key: "conflict",        label: "position conflict",         group: "core",      tier: 3, emitted: false, backendKey: "",                        defaultValue: "Allow Auto Reversal" },
    { key: "cancelAction",    label: "cancelled by conflict",     group: "core",      tier: 3, emitted: false, backendKey: "",                        defaultValue: "Kill OB" },
    { key: "monteCarlo",      label: "Monte Carlo",               group: "core",      tier: 3, emitted: false, backendKey: "",                        defaultValue: false },

    // ── Structure ─────────────────────────────────────────────────────────────
    // structure is emitted as structure_filter, derived via deriveLegacyStructureFilterFromAllowed(buildAllowedStructureDirections(cfg)).
    { key: "structure",       label: "structure type",            group: "structure", tier: 3, emitted: true,  backendKey: "structure_filter",        defaultValue: "Both" },
    // direction is emitted as trade_direction AND governs which chips appear in allowed_structure_directions.
    { key: "direction",       label: "trade direction",           group: "structure", tier: 1, emitted: true,  backendKey: "trade_direction",         defaultValue: "Both" },
    // The four structure-direction chips contribute to the allowed_structure_directions array.
    { key: "bosLong",         label: "BOS Long",                  group: "structure", tier: 1, emitted: true,  backendKey: "allowed_structure_directions", defaultValue: true },
    { key: "bosShort",        label: "BOS Short",                 group: "structure", tier: 1, emitted: true,  backendKey: "allowed_structure_directions", defaultValue: true },
    { key: "chochLong",       label: "CHoCH Long",                group: "structure", tier: 1, emitted: true,  backendKey: "allowed_structure_directions", defaultValue: true },
    { key: "chochShort",      label: "CHoCH Short",               group: "structure", tier: 1, emitted: true,  backendKey: "allowed_structure_directions", defaultValue: true },

    // ── Execution ─────────────────────────────────────────────────────────────
    { key: "rr",              label: "RR multiple",               group: "execution", tier: 2, emitted: true,  backendKey: "rr_multiple",             defaultValue: 3.3 },
    { key: "obEntryDepthPct", label: "OB entry depth",            group: "execution", tier: 2, emitted: true,  backendKey: "ob_entry_depth_pct",      defaultValue: 0 },
    { key: "entryBuffer",     label: "entry buffer",              group: "execution", tier: 2, emitted: true,  backendKey: "entry_buffer_pips",       defaultValue: 0.0 },
    { key: "stopBuffer",      label: "stop buffer",               group: "execution", tier: 2, emitted: true,  backendKey: "stop_buffer_pips",        defaultValue: 1.0 },
    { key: "verifyTicks",     label: "verify limit ticks",        group: "execution", tier: 2, emitted: true,  backendKey: "verify_limit_ticks",      defaultValue: 0 },

    // ── Entry ─────────────────────────────────────────────────────────────────
    //
    // UI control fields — not emitted as standalone keys.
    // entryMode selects single vs research-export branch; selectedEntryModel picks the
    // sub-model in single mode; entryResearchExportMode shapes threshold resolution.
    { key: "entryMode",              label: "entry mode",                     group: "entry", tier: 3, emitted: false, backendKey: "",                                    defaultValue: "single" },
    { key: "selectedEntryModel",     label: "selected entry model",           group: "entry", tier: 3, emitted: false, backendKey: "",                                    defaultValue: "baseline" },
    { key: "entryResearchExportMode",label: "entry research export mode",     group: "entry", tier: 3, emitted: false, backendKey: "",                                    defaultValue: "light" },
    //
    // Emitted fields — single-mode paths.
    // singlePenetrationPct is used as entry_penetration_thresholds when model=entry_penetration AND mode=single.
    // singleTriggeredEdgeThreshold → triggered_edge_trigger_thresholds when model=triggered_edge AND mode=single.
    { key: "singlePenetrationPct",         label: "single penetration threshold",         group: "entry", tier: 3, emitted: true,  backendKey: "entry_penetration_thresholds",      defaultValue: 25 },
    { key: "singleTriggeredEdgeThreshold", label: "single triggered-edge threshold",      group: "entry", tier: 3, emitted: true,  backendKey: "triggered_edge_trigger_thresholds", defaultValue: 25 },
    //
    // Research-export mode.
    // entryResearchExports folds "entry_penetration" into entry_models array; no standalone key.
    { key: "entryResearchExports",         label: "entry research exports",               group: "entry", tier: 3, emitted: true,  backendKey: "entry_models",                      defaultValue: true },
    { key: "entryPenetrationThresholds",   label: "entry penetration thresholds",         group: "entry", tier: 3, emitted: true,  backendKey: "entry_penetration_thresholds",      defaultValue: "25,50" },
    { key: "useBatchedEntryPenetration",   label: "batched entry penetration",            group: "entry", tier: 3, emitted: true,  backendKey: "batch_entry_penetration",           defaultValue: true },
    //
    // Triggered-edge model fields.
    // triggeredEdgeEntries folds "triggered_edge" into entry_models array; no standalone key.
    { key: "triggeredEdgeEntries",         label: "triggered edge entries",               group: "entry", tier: 3, emitted: true,  backendKey: "entry_models",                      defaultValue: false },
    { key: "triggeredEdgeThresholds",      label: "triggered edge trigger thresholds",    group: "entry", tier: 3, emitted: true,  backendKey: "triggered_edge_trigger_thresholds", defaultValue: "25" },
    { key: "triggeredEdgeEntryLevelPct",   label: "triggered edge entry level",           group: "entry", tier: 3, emitted: true,  backendKey: "triggered_edge_entry_level_pct",    defaultValue: 0 },
    { key: "triggeredEdgeSameCandleMode",  label: "triggered edge entry delay",           group: "entry", tier: 3, emitted: true,  backendKey: "triggered_edge_same_candle_modes",  defaultValue: "both" },
    { key: "triggeredEdgeDelays",          label: "triggered edge delays",                group: "entry", tier: 3, emitted: true,  backendKey: "triggered_edge_candle_delays",      defaultValue: [0, 1] },
    //
    // Directional entry (asymmetric mode).
    { key: "directionalEntryMode",         label: "directional entry mode",               group: "entry", tier: 3, emitted: true,  backendKey: "directional_entry_mode",            defaultValue: "symmetric" },
    { key: "longEntryEnabled",             label: "long entry enabled",                   group: "entry", tier: 3, emitted: true,  backendKey: "long_entry_enabled",                defaultValue: true },
    { key: "longEntryModel",               label: "long entry model",                     group: "entry", tier: 3, emitted: true,  backendKey: "long_entry_models",                 defaultValue: "triggered_edge" },
    { key: "longPenetrationPct",           label: "long penetration threshold",           group: "entry", tier: 3, emitted: true,  backendKey: "long_entry_penetration_thresholds", defaultValue: 25 },
    // longTriggeredEdgeThreshold is emitted only inside directional_entry_config.long.triggered_edge_threshold
    { key: "longTriggeredEdgeThreshold",   label: "long triggered-edge threshold",        group: "entry", tier: 3, emitted: true,  backendKey: "directional_entry_config",          defaultValue: 25 },
    { key: "longTriggeredEdgeDelays",      label: "long triggered-edge delays",           group: "entry", tier: 3, emitted: true,  backendKey: "long_triggered_edge_delays",        defaultValue: [0, 1] },
    { key: "shortEntryEnabled",            label: "short entry enabled",                  group: "entry", tier: 3, emitted: true,  backendKey: "short_entry_enabled",               defaultValue: true },
    { key: "shortEntryModel",              label: "short entry model",                    group: "entry", tier: 3, emitted: true,  backendKey: "short_entry_models",                defaultValue: "triggered_edge" },
    { key: "shortPenetrationPct",          label: "short penetration threshold",          group: "entry", tier: 3, emitted: true,  backendKey: "short_entry_penetration_thresholds", defaultValue: 25 },
    // shortTriggeredEdgeThreshold is emitted only inside directional_entry_config.short.triggered_edge_threshold
    { key: "shortTriggeredEdgeThreshold",  label: "short triggered-edge threshold",       group: "entry", tier: 3, emitted: true,  backendKey: "directional_entry_config",          defaultValue: 25 },
    { key: "shortTriggeredEdgeDelays",     label: "short triggered-edge delays",          group: "entry", tier: 3, emitted: true,  backendKey: "short_triggered_edge_delays",       defaultValue: [0, 1] },

    // ── Protection ────────────────────────────────────────────────────────────
    { key: "triggeredEdgeCancelOnRetrace",        label: "triggered edge retrace cancel",           group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_cancel_on_retrace",          defaultValue: false },
    { key: "triggeredEdgeCancelRetracePips",      label: "triggered edge retrace cancel pips",      group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_cancel_retrace_pips",        defaultValue: 0 },
    { key: "triggeredEdgeCancelRetraceObPct",     label: "triggered edge retrace cancel OB %",      group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_cancel_retrace_ob_pct",      defaultValue: 0 },
    { key: "triggeredEdgeCancelOnFirstFailedTag", label: "triggered edge first-failed-tag cancel",  group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_cancel_on_first_failed_tag", defaultValue: false },
    { key: "triggeredEdgeFftMoveAwayPips",        label: "FFT move-away pips",                      group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_fft_move_away_pips",         defaultValue: 0 },
    { key: "triggeredEdgeFftMoveAwayObMultiple",  label: "FFT move-away OB multiple",               group: "protection", tier: 3, emitted: true, backendKey: "triggered_edge_fft_move_away_ob_multiple",  defaultValue: 0 },

    // ── Session ───────────────────────────────────────────────────────────────
    { key: "sessionFilter", label: "session filter",       group: "session", tier: 3, emitted: true,  backendKey: "session_filter_enabled", defaultValue: true },
    // Session chips contribute to the allowed_sessions array (populated by selectedAllowedSessions(cfg) when sessionFilter=true).
    { key: "london",        label: "London session",       group: "session", tier: 1, emitted: true,  backendKey: "allowed_sessions",       defaultValue: true },
    { key: "lull",          label: "London Lull session",  group: "session", tier: 1, emitted: true,  backendKey: "allowed_sessions",       defaultValue: true },
    { key: "newYork",       label: "New York session",     group: "session", tier: 1, emitted: true,  backendKey: "allowed_sessions",       defaultValue: true },
    { key: "asia",          label: "Asia session",         group: "session", tier: 1, emitted: true,  backendKey: "allowed_sessions",       defaultValue: true },
    { key: "outside",       label: "Outside session",      group: "session", tier: 1, emitted: true,  backendKey: "allowed_sessions",       defaultValue: true },
    // Dropped — backend support unconfirmed. See file header for details.
    { key: "originSession",    label: "OB origin session",    group: "session", tier: 3, emitted: false, backendKey: "", defaultValue: "Any" },
    { key: "detectionSession", label: "OB detection session", group: "session", tier: 3, emitted: false, backendKey: "", defaultValue: "Any" },

    // ── News ──────────────────────────────────────────────────────────────────
    { key: "newsBlackout",           label: "news blackout",                  group: "news", tier: 3, emitted: true, backendKey: "news_blackout_enabled",                   defaultValue: true },
    { key: "newsFile",               label: "news file",                      group: "news", tier: 3, emitted: true, backendKey: "news_file",                               defaultValue: "data/news/master_economic_calendar_2020_present.csv" },
    { key: "newsBlackoutBefore",     label: "news blackout before",           group: "news", tier: 3, emitted: true, backendKey: "news_blackout_minutes_before",             defaultValue: 5 },
    { key: "newsBlackoutAfter",      label: "news blackout after",            group: "news", tier: 3, emitted: true, backendKey: "news_blackout_minutes_after",              defaultValue: 5 },
    { key: "newsBlackoutImpacts",    label: "news blackout impacts",          group: "news", tier: 3, emitted: true, backendKey: "news_blackout_impacts",                   defaultValue: ["high"] },
    { key: "newsBlackoutCurrencies", label: "news blackout currencies",       group: "news", tier: 3, emitted: true, backendKey: "news_blackout_currencies",                defaultValue: [] },
    { key: "newsPausePending",       label: "news pause pending",             group: "news", tier: 3, emitted: true, backendKey: "news_pause_pending_orders",                defaultValue: true },
    { key: "newsBlockFills",         label: "news block fills",               group: "news", tier: 3, emitted: true, backendKey: "news_block_new_fills",                    defaultValue: true },
    { key: "newsCancelIfTouched",    label: "news cancel if touched",         group: "news", tier: 3, emitted: true, backendKey: "news_cancel_if_touched_during_blackout",   defaultValue: true },
    { key: "newsFlattenActiveTrades",label: "news flatten active trades",     group: "news", tier: 3, emitted: true, backendKey: "news_flatten_active_trades",               defaultValue: true },
    { key: "newsFlattenMinutesBefore",label:"news flatten minutes before",    group: "news", tier: 3, emitted: true, backendKey: "news_flatten_minutes_before_blackout",     defaultValue: 5 },
    // newsDebugObIds is conditionally emitted only when non-empty; not in LOAD_FIELD_LABELS.
    { key: "newsDebugObIds",         label: "news debug OB IDs",              group: "news", tier: 3, emitted: true, backendKey: "news_debug_ob_ids",                       defaultValue: "" },

    // ── Cost ──────────────────────────────────────────────────────────────────
    { key: "spread",     label: "spread",     group: "cost", tier: 2, emitted: true, backendKey: "spread_pips",            defaultValue: 0.2 },
    { key: "slippage",   label: "slippage",   group: "cost", tier: 2, emitted: true, backendKey: "slippage_pips",          defaultValue: 0.2 },
    { key: "commission", label: "commission", group: "cost", tier: 2, emitted: true, backendKey: "commission_r_per_trade", defaultValue: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fast O(1) lookup by cfg key. */
export const REGISTRY_BY_KEY = Object.fromEntries(
    CONFIG_REGISTRY.map((entry) => [entry.key, entry])
);

/** All entries for a given group string. */
export function getRegistryByGroup(group) {
    return CONFIG_REGISTRY.filter((e) => e.group === group);
}

/** All entries for a given tier number (1, 2, or 3). */
export function getRegistryByTier(tier) {
    return CONFIG_REGISTRY.filter((e) => e.tier === tier);
}

/** Returns the registry entry for a cfg key, or undefined. */
export function getRegistryEntry(key) {
    return REGISTRY_BY_KEY[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-validation (runs once at module load, console warnings only)
// ─────────────────────────────────────────────────────────────────────────────
(function validateRegistry() {
    const seen = new Set();
    for (const entry of CONFIG_REGISTRY) {
        // 1. Duplicate key check
        if (seen.has(entry.key)) {
            console.warn(`[configRegistry] Duplicate key detected: "${entry.key}"`);
        }
        seen.add(entry.key);

        // 2. Missing label
        if (!entry.label) {
            console.warn(`[configRegistry] Entry "${entry.key}" is missing a label.`);
        }

        // 3. emitted:true must have a non-empty backendKey
        //    Exception: "composite array" contributors are allowed because their
        //    backendKey is the parent array key (e.g. "allowed_sessions"), not "".
        //    So this check only fires when backendKey is literally "".
        if (entry.emitted && entry.backendKey === "") {
            console.warn(
                `[configRegistry] Entry "${entry.key}" has emitted:true but backendKey is empty.`
            );
        }
    }
})();
