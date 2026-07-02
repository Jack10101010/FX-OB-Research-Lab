// ── configRegistry.js ──────────────────────────────────────────────────────
// Canonical map of every frontend cfg key used in StrategyBuilder.jsx.
// Phase 1: Foundation (key, label, group, tier, emitted, backendKey, defaultValue).
// Phase 3B: UI metadata (editable, masterControlsVisible, advancedMode,
//           inputType, options, validation, subgroup).
//
// Schema per entry:
//   key                  — frontend cfg key (camelCase, matches StrategyBuilder useState)
//   label                — human label (sourced from LOAD_FIELD_LABELS in configTranslator.js)
//   group                — "core"|"structure"|"execution"|"entry"|"protection"|"session"|"news"|"cost"
//   tier                 — 1=frontend-only filter | 2=future rescore candidate | 3=full rerun required
//   emitted              — true if the field is included in the sidecarConfig produced by
//                          buildBacktesterConfig(). Fields marked false are either:
//                            (a) UI-only controls that shape other emitted fields (entryMode, etc.)
//                            (b) Silently dropped — importer expects them but buildBacktesterConfig
//                                never emits them (conflict, cancelAction, originSession,
//                                detectionSession, monteCarlo)
//   backendKey           — Primary snake_case key in the sidecarConfig JSON.
//                          Empty string if the field is not emitted OR if it contributes
//                          to a composite array (see notes below).
//                          NOTE for composite array contributors:
//                            allowed_structure_directions — bosLong, bosShort, chochLong, chochShort
//                            allowed_sessions             — london, lull, newYork, asia, outside
//                            entry_models                 — entryResearchExports, triggeredEdgeEntries
//                          These fields ARE emitted (emitted:true) but their individual values
//                          are folded into the parent array by buildBacktesterConfig().
//                          Master Controls must reconstruct the full array, not patch individual keys.
//   defaultValue         — Default from cfg useState in StrategyBuilder.jsx.
//                          dateFrom / dateTo are null here because they are computed dynamically
//                          by getDefaultDates() at runtime; callers must supply live defaults.
//
//   ── Phase 3B metadata ──────────────────────────────────────────────────────
//   editable             — true if Master Controls may write this field into draftConfig.
//   masterControlsVisible— true if the field should appear anywhere in the Master Controls UI.
//   advancedMode         — true if the field is hidden behind the Advanced Mode toggle.
//   inputType            — "number"|"boolean"|"select"|"multiselect"|"comma_array"|"date"
//                          |"text"|"readonly"
//   options              — array of valid values for select/multiselect, or null.
//   validation           — { min, max, step } for numeric fields, or null.
//   subgroup             — display subgroup within the group panel, or null.
//
// DROPPED FIELDS (emitted:false, backendKey:"", documented intent):
//   conflict       — intended backend key: position_conflict
//                    NOT emitted by buildBacktesterConfig(). Backend support unconfirmed.
//   cancelAction   — intended backend key: cancel_action. Same status.
//   originSession  — intended backend key: origin_session. Same status.
//   detectionSession — intended backend key: detection_session. Same status.
//   monteCarlo     — intended backend key: monte_carlo. Same status.
//
// UI-CONTROL FIELDS (emitted:false, no direct backend key):
//   entryMode            — selects single vs research-export branch in buildBacktesterConfig.
//   selectedEntryModel   — within single mode, selects baseline / entry_penetration / triggered_edge.
//   entryResearchExportMode — shapes how entryPenetrationThresholds are resolved in research mode.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_REGISTRY = [

    // ── Core ─────────────────────────────────────────────────────────────────
    {
        key: "symbol", label: "symbol", group: "core", tier: 3,
        emitted: true, backendKey: "symbol", defaultValue: "EURUSD",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["EURUSD"], validation: null, subgroup: "Market",
    },
    {
        key: "detectionTf", label: "detection timeframe", group: "core", tier: 3,
        emitted: true, backendKey: "detection_timeframe", defaultValue: "M15",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["M5", "M15", "M30", "H1", "H4"], validation: null, subgroup: "Detection",
    },
    {
        key: "executionTf", label: "execution timeframe", group: "core", tier: 3,
        emitted: true, backendKey: "execution_timeframe", defaultValue: "1m",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["1m", "5m"], validation: null, subgroup: "Detection",
    },
    {
        key: "dateFrom", label: "date from", group: "core", tier: 3,
        emitted: true, backendKey: "start_date", defaultValue: null,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "date", options: null, validation: null, subgroup: "Data",
    },
    {
        key: "dateTo", label: "date to", group: "core", tier: 3,
        emitted: true, backendKey: "end_date", defaultValue: null,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "date", options: null, validation: null, subgroup: "Data",
    },
    {
        key: "dataFile", label: "data file", group: "core", tier: 3,
        emitted: true, backendKey: "candle_file", defaultValue: "data/candles/EURUSD_1m.csv",
        // Path field — visible for reference but not editable in Master Controls.
        editable: false, masterControlsVisible: true, advancedMode: false,
        inputType: "readonly", options: null, validation: null, subgroup: "Data",
    },
    {
        key: "swing", label: "swing length", group: "core", tier: 3,
        emitted: true, backendKey: "swing_length", defaultValue: 50,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 1, max: 500, step: 1 }, subgroup: "Detection",
    },
    {
        key: "obFilter", label: "OB filter", group: "core", tier: 3,
        emitted: true, backendKey: "ob_filter", defaultValue: "ATR",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["ATR", "CMR"], validation: null, subgroup: "Detection",
    },
    {
        key: "minObSizePips", label: "Min OB size", group: "core", tier: 3,
        emitted: true, backendKey: "min_ob_size_pips", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "Detection",
    },
    {
        key: "maxObSizePips", label: "Max OB size", group: "core", tier: 3,
        emitted: true, backendKey: "max_ob_size_pips", defaultValue: 100,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "Detection",
    },
    {
        key: "executionMode", label: "execution mode", group: "core", tier: 3,
        emitted: true, backendKey: "execution_modes", defaultValue: "multi_position",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["single_position", "directional_single", "multi_position"], validation: null, subgroup: "Market",
    },
    // Dropped — backend support unconfirmed. Not editable or visible in Master Controls.
    {
        key: "conflict", label: "position conflict", group: "core", tier: 3,
        emitted: false, backendKey: "", defaultValue: "Allow Auto Reversal",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "Market",
    },
    {
        key: "cancelAction", label: "cancelled by conflict", group: "core", tier: 3,
        emitted: false, backendKey: "", defaultValue: "Kill OB",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "Market",
    },
    {
        key: "monteCarlo", label: "Monte Carlo", group: "core", tier: 3,
        emitted: false, backendKey: "", defaultValue: false,
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "Market",
    },

    // ── Structure ─────────────────────────────────────────────────────────────
    // structure is emitted as structure_filter, derived via deriveLegacyStructureFilterFromAllowed(buildAllowedStructureDirections(cfg)).
    {
        key: "structure", label: "structure type", group: "structure", tier: 3,
        emitted: true, backendKey: "structure_filter", defaultValue: "Both",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["Both", "BOS", "CHoCH"], validation: null, subgroup: "Structure Direction",
    },
    // direction is emitted as trade_direction AND governs which chips appear in allowed_structure_directions.
    {
        key: "direction", label: "trade direction", group: "structure", tier: 1,
        emitted: true, backendKey: "trade_direction", defaultValue: "Both",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["Both", "Long", "Short"], validation: null, subgroup: "Structure Direction",
    },
    // The four structure-direction chips contribute to the allowed_structure_directions array.
    {
        key: "bosLong", label: "BOS Long", group: "structure", tier: 1,
        emitted: true, backendKey: "allowed_structure_directions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Structure Direction",
    },
    {
        key: "bosShort", label: "BOS Short", group: "structure", tier: 1,
        emitted: true, backendKey: "allowed_structure_directions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Structure Direction",
    },
    {
        key: "chochLong", label: "CHoCH Long", group: "structure", tier: 1,
        emitted: true, backendKey: "allowed_structure_directions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Structure Direction",
    },
    {
        key: "chochShort", label: "CHoCH Short", group: "structure", tier: 1,
        emitted: true, backendKey: "allowed_structure_directions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Structure Direction",
    },

    // ── Execution ─────────────────────────────────────────────────────────────
    {
        key: "rr", label: "RR multiple", group: "execution", tier: 2,
        emitted: true, backendKey: "rr_multiple", defaultValue: 3.3,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0.5, max: 20, step: 0.1 }, subgroup: "Risk",
    },
    {
        key: "obEntryDepthPct", label: "OB entry depth", group: "execution", tier: 2,
        emitted: true, backendKey: "ob_entry_depth_pct", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Fill Rules",
    },
    {
        key: "entryBuffer", label: "entry buffer", group: "execution", tier: 2,
        emitted: true, backendKey: "entry_buffer_pips", defaultValue: 0.0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "Fill Rules",
    },
    {
        key: "stopBuffer", label: "stop buffer", group: "execution", tier: 2,
        emitted: true, backendKey: "stop_buffer_pips", defaultValue: 1.0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "Fill Rules",
    },
    {
        key: "verifyTicks", label: "verify limit ticks", group: "execution", tier: 2,
        emitted: true, backendKey: "verify_limit_ticks", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 20, step: 1 }, subgroup: "Fill Rules",
    },

    // ── Entry ─────────────────────────────────────────────────────────────────
    //
    // UI control fields — not emitted as standalone keys.
    // entryMode selects single vs research-export branch; selectedEntryModel picks the
    // sub-model in single mode; entryResearchExportMode shapes threshold resolution.
    {
        key: "entryMode", label: "entry mode", group: "entry", tier: 3,
        emitted: false, backendKey: "", defaultValue: "single",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["single", "research"], validation: null, subgroup: "Entry Basics",
    },
    {
        key: "selectedEntryModel", label: "selected entry model", group: "entry", tier: 3,
        emitted: false, backendKey: "", defaultValue: "baseline",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["baseline", "entry_penetration", "triggered_edge"], validation: null, subgroup: "Entry Basics",
    },
    {
        key: "entryResearchExportMode", label: "entry research export mode", group: "entry", tier: 3,
        emitted: false, backendKey: "", defaultValue: "light",
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "select", options: ["light", "full", "custom"], validation: null, subgroup: "Research Export",
    },
    //
    // Emitted fields — single-mode paths.
    // singlePenetrationPct is used as entry_penetration_thresholds when model=entry_penetration AND mode=single.
    // singleTriggeredEdgeThreshold → triggered_edge_trigger_thresholds when model=triggered_edge AND mode=single.
    {
        key: "singlePenetrationPct", label: "single penetration threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "entry_penetration_thresholds", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Entry Basics",
    },
    {
        key: "singleTriggeredEdgeThreshold", label: "single triggered-edge threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "triggered_edge_trigger_thresholds", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Entry Basics",
    },
    //
    // Research-export mode.
    // entryResearchExports folds "entry_penetration" into entry_models array; no standalone key.
    {
        key: "entryResearchExports", label: "entry research exports", group: "entry", tier: 3,
        emitted: true, backendKey: "entry_models", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "Research Export",
    },
    {
        key: "entryPenetrationThresholds", label: "entry penetration thresholds", group: "entry", tier: 3,
        emitted: true, backendKey: "entry_penetration_thresholds", defaultValue: "25,50",
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "comma_array", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Research Export",
    },
    {
        key: "useBatchedEntryPenetration", label: "batched entry penetration", group: "entry", tier: 3,
        emitted: true, backendKey: "batch_entry_penetration", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "Research Export",
    },
    //
    // Performance: parallel scenario execution (speed-only; outputs byte-identical
    // to serial). When on, the backend auto-picks a conservative worker count.
    {
        key: "parallelScenarios", label: "parallel scenarios", group: "advanced", tier: 3,
        emitted: true, backendKey: "parallel_scenarios", defaultValue: false,
        editable: true, masterControlsVisible: false, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "Performance",
    },
    {
        key: "maxWorkers", label: "max worker processes", group: "advanced", tier: 3,
        emitted: false, backendKey: "max_workers", defaultValue: 0,
        editable: true, masterControlsVisible: false, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 8, step: 1 }, subgroup: "Performance",
    },
    //
    // Triggered-edge model fields.
    // triggeredEdgeEntries folds "triggered_edge" into entry_models array; no standalone key.
    {
        key: "triggeredEdgeEntries", label: "triggered edge entries", group: "entry", tier: 3,
        emitted: true, backendKey: "entry_models", defaultValue: false,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Triggered Edge",
    },
    {
        key: "triggeredEdgeThresholds", label: "triggered edge trigger thresholds", group: "entry", tier: 3,
        emitted: true, backendKey: "triggered_edge_trigger_thresholds", defaultValue: "25",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "comma_array", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Triggered Edge",
    },
    {
        key: "triggeredEdgeEntryLevelPct", label: "triggered edge entry level", group: "entry", tier: 3,
        emitted: true, backendKey: "triggered_edge_entry_level_pct", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Triggered Edge",
    },
    {
        key: "triggeredEdgeSameCandleMode", label: "triggered edge entry delay", group: "entry", tier: 3,
        emitted: true, backendKey: "triggered_edge_same_candle_modes", defaultValue: "both",
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "select", options: ["same", "next", "both"], validation: null, subgroup: "Triggered Edge",
    },
    {
        key: "triggeredEdgeDelays", label: "triggered edge delays", group: "entry", tier: 3,
        emitted: true, backendKey: "triggered_edge_candle_delays", defaultValue: [0, 1],
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "multiselect", options: [0, 1, 2, 3], validation: null, subgroup: "Triggered Edge",
    },
    //
    // Directional entry (asymmetric mode).
    {
        key: "directionalEntryMode", label: "directional entry mode", group: "entry", tier: 3,
        emitted: true, backendKey: "directional_entry_mode", defaultValue: "symmetric",
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "select", options: ["symmetric", "asymmetric"], validation: null, subgroup: "Directional",
    },
    {
        key: "longEntryEnabled", label: "long entry enabled", group: "entry", tier: 3,
        emitted: true, backendKey: "long_entry_enabled", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "Directional",
    },
    {
        key: "longEntryModel", label: "long entry model", group: "entry", tier: 3,
        emitted: true, backendKey: "long_entry_models", defaultValue: "triggered_edge",
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "select", options: ["baseline", "entry_penetration", "triggered_edge"], validation: null, subgroup: "Directional",
    },
    {
        key: "longPenetrationPct", label: "long penetration threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "long_entry_penetration_thresholds", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Directional",
    },
    // longTriggeredEdgeThreshold is emitted only inside directional_entry_config.long.triggered_edge_threshold
    {
        key: "longTriggeredEdgeThreshold", label: "long triggered-edge threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "directional_entry_config", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Directional",
    },
    {
        key: "longTriggeredEdgeDelays", label: "long triggered-edge delays", group: "entry", tier: 3,
        emitted: true, backendKey: "long_triggered_edge_delays", defaultValue: [0, 1],
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "multiselect", options: [0, 1, 2, 3], validation: null, subgroup: "Directional",
    },
    {
        key: "shortEntryEnabled", label: "short entry enabled", group: "entry", tier: 3,
        emitted: true, backendKey: "short_entry_enabled", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "Directional",
    },
    {
        key: "shortEntryModel", label: "short entry model", group: "entry", tier: 3,
        emitted: true, backendKey: "short_entry_models", defaultValue: "triggered_edge",
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "select", options: ["baseline", "entry_penetration", "triggered_edge"], validation: null, subgroup: "Directional",
    },
    {
        key: "shortPenetrationPct", label: "short penetration threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "short_entry_penetration_thresholds", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Directional",
    },
    // shortTriggeredEdgeThreshold is emitted only inside directional_entry_config.short.triggered_edge_threshold
    {
        key: "shortTriggeredEdgeThreshold", label: "short triggered-edge threshold", group: "entry", tier: 3,
        emitted: true, backendKey: "directional_entry_config", defaultValue: 25,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Directional",
    },
    {
        key: "shortTriggeredEdgeDelays", label: "short triggered-edge delays", group: "entry", tier: 3,
        emitted: true, backendKey: "short_triggered_edge_delays", defaultValue: [0, 1],
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "multiselect", options: [0, 1, 2, 3], validation: null, subgroup: "Directional",
    },

    // ── Protection ────────────────────────────────────────────────────────────
    // All protection fields are advanced-mode only (triggered-edge cancel / FFT behaviour).
    {
        key: "triggeredEdgeCancelOnRetrace", label: "triggered edge retrace cancel", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_cancel_on_retrace", defaultValue: false,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "TE Protection",
    },
    {
        key: "triggeredEdgeCancelRetracePips", label: "triggered edge retrace cancel pips", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_cancel_retrace_pips", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "TE Protection",
    },
    {
        key: "triggeredEdgeCancelRetraceObPct", label: "triggered edge retrace cancel OB %", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_cancel_retrace_ob_pct", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "TE Protection",
    },
    {
        key: "triggeredEdgeCancelOnFirstFailedTag", label: "triggered edge first-failed-tag cancel", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_cancel_on_first_failed_tag", defaultValue: false,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "boolean", options: null, validation: null, subgroup: "TE Protection",
    },
    {
        key: "triggeredEdgeFftMoveAwayPips", label: "FFT move-away pips", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_fft_move_away_pips", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "TE Protection",
    },
    {
        key: "triggeredEdgeFftMinObWidthPips", label: "FFT Min OB Width", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_fft_min_ob_width_pips", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 50, step: 0.1 }, subgroup: "TE Protection",
        description: "Only apply First Failed Tag cancel when OB width is at least this many pips. 0 = apply to all OB widths.",
    },
    {
        key: "triggeredEdgeFftMoveAwayObMultiple", label: "FFT move-away OB multiple", group: "protection", tier: 3,
        emitted: true, backendKey: "triggered_edge_fft_move_away_ob_multiple", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 10, step: 0.1 }, subgroup: "TE Protection",
    },

    // ── Session ───────────────────────────────────────────────────────────────
    {
        key: "sessionFilter", label: "session filter", group: "session", tier: 3,
        emitted: true, backendKey: "session_filter_enabled", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    // Session chips contribute to the allowed_sessions array (populated by selectedAllowedSessions(cfg) when sessionFilter=true).
    {
        key: "london", label: "London session", group: "session", tier: 1,
        emitted: true, backendKey: "allowed_sessions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    {
        key: "lull", label: "London Lull session", group: "session", tier: 1,
        emitted: true, backendKey: "allowed_sessions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    {
        key: "newYork", label: "New York session", group: "session", tier: 1,
        emitted: true, backendKey: "allowed_sessions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    {
        key: "asia", label: "Asia session", group: "session", tier: 1,
        emitted: true, backendKey: "allowed_sessions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    {
        key: "outside", label: "Outside session", group: "session", tier: 1,
        emitted: true, backendKey: "allowed_sessions", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Session Filter",
    },
    // Dropped — backend support unconfirmed. Not editable or visible in Master Controls.
    {
        key: "originSession", label: "OB origin session", group: "session", tier: 3,
        emitted: false, backendKey: "", defaultValue: "Any",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "Session Filter",
    },
    {
        key: "detectionSession", label: "OB detection session", group: "session", tier: 3,
        emitted: false, backendKey: "", defaultValue: "Any",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "Session Filter",
    },

    // ── News ──────────────────────────────────────────────────────────────────
    {
        key: "newsBlackout", label: "news blackout", group: "news", tier: 3,
        emitted: true, backendKey: "news_blackout_enabled", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "News Blackout",
    },
    {
        key: "newsFile", label: "news file", group: "news", tier: 3,
        emitted: true, backendKey: "news_file", defaultValue: "data/news/master_economic_calendar_2020_present.csv",
        // Path field — visible for reference but not editable in Master Controls.
        editable: false, masterControlsVisible: true, advancedMode: false,
        inputType: "readonly", options: null, validation: null, subgroup: "News Blackout",
    },
    {
        key: "newsBlackoutBefore", label: "news blackout before", group: "news", tier: 3,
        emitted: true, backendKey: "news_blackout_minutes_before", defaultValue: 5,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 240, step: 1 }, subgroup: "News Blackout",
    },
    {
        key: "newsBlackoutAfter", label: "news blackout after", group: "news", tier: 3,
        emitted: true, backendKey: "news_blackout_minutes_after", defaultValue: 5,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 240, step: 1 }, subgroup: "News Blackout",
    },
    {
        key: "newsBlackoutImpacts", label: "news blackout impacts", group: "news", tier: 3,
        emitted: true, backendKey: "news_blackout_impacts", defaultValue: ["high"],
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "multiselect", options: ["low", "medium", "high"], validation: null, subgroup: "News Blackout",
    },
    {
        key: "newsBlackoutCurrencies", label: "news blackout currencies", group: "news", tier: 3,
        emitted: true, backendKey: "news_blackout_currencies", defaultValue: [],
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "multiselect", options: ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"], validation: null, subgroup: "News Blackout",
    },
    {
        key: "newsPausePending", label: "news pause pending", group: "news", tier: 3,
        emitted: true, backendKey: "news_pause_pending_orders", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "News Behaviour",
    },
    {
        key: "newsBlockFills", label: "news block fills", group: "news", tier: 3,
        emitted: true, backendKey: "news_block_new_fills", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "News Behaviour",
    },
    {
        key: "newsCancelIfTouched", label: "news cancel if touched", group: "news", tier: 3,
        emitted: true, backendKey: "news_cancel_if_touched_during_blackout", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "News Behaviour",
    },
    {
        key: "newsFlattenActiveTrades", label: "news flatten active trades", group: "news", tier: 3,
        emitted: true, backendKey: "news_flatten_active_trades", defaultValue: true,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "News Behaviour",
    },
    {
        key: "newsFlattenMinutesBefore", label: "news flatten minutes before", group: "news", tier: 3,
        emitted: true, backendKey: "news_flatten_minutes_before_blackout", defaultValue: 5,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 240, step: 1 }, subgroup: "News Behaviour",
    },
    // newsDebugObIds — debug / development field; hidden in all non-dev contexts.
    {
        key: "newsDebugObIds", label: "news debug OB IDs", group: "news", tier: 3,
        emitted: true, backendKey: "news_debug_ob_ids", defaultValue: "",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "News Blackout",
    },

    // ── Cost ──────────────────────────────────────────────────────────────────
    {
        key: "spread", label: "spread", group: "cost", tier: 2,
        emitted: true, backendKey: "spread_pips", defaultValue: 0.2,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 20, step: 0.1 }, subgroup: "Costs",
    },
    {
        key: "slippage", label: "slippage", group: "cost", tier: 2,
        emitted: true, backendKey: "slippage_pips", defaultValue: 0.2,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 20, step: 0.1 }, subgroup: "Costs",
    },
    {
        key: "commission", label: "commission", group: "cost", tier: 2,
        emitted: true, backendKey: "commission_r_per_trade", defaultValue: 0,
        editable: true, masterControlsVisible: true, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 5, step: 0.01 }, subgroup: "Costs",
    },

    // ── Market State / Regime Gate ─────────────────────────────────────────────
    // EMA(200) trend + Bollinger-width volatility + ADX chop → 6 market states.
    // Client-computed (data/marketState.js); off by default so existing runs are
    // byte-identical. Backend emission of regime_* is gated on regimeEnabled in
    // configTranslator.buildRegimeConfig(). tier:1 = frontend-only (instant filter).
    {
        key: "regimeEnabled", label: "market state gate", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_gate_enabled", defaultValue: false,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Market State",
    },
    {
        key: "regimeMode", label: "regime mode", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_gate_mode", defaultValue: "label",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["label", "filter"], validation: null, subgroup: "Market State",
    },
    // EMA (Trend axis)
    {
        key: "emaEnabled", label: "EMA trend enabled", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_enabled", defaultValue: true,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "EMA (Trend)",
    },
    {
        key: "emaTimeframe", label: "EMA timeframe", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_tf", defaultValue: "Daily",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["Daily", "4H", "1H"], validation: null, subgroup: "EMA (Trend)",
    },
    {
        key: "emaLength", label: "EMA length", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_length", defaultValue: 200,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 1, max: 500, step: 1 }, subgroup: "EMA (Trend)",
    },
    {
        key: "emaLongCond", label: "long condition", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_long_cond", defaultValue: "price_above",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "EMA (Trend)",
    },
    {
        key: "emaShortCond", label: "short condition", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_short_cond", defaultValue: "price_below",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "readonly", options: null, validation: null, subgroup: "EMA (Trend)",
    },
    {
        key: "emaConfirmDays", label: "confirmation days", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_ema_confirm", defaultValue: 0,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: [0, 1, 2, 3], validation: null, subgroup: "EMA (Trend)",
    },
    // Bollinger width (Volatility axis)
    {
        key: "bbwEnabled", label: "Bollinger volatility enabled", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_enabled", defaultValue: true,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwTimeframe", label: "Bollinger timeframe", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_tf", defaultValue: "Daily",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "select", options: ["Daily"], validation: null, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwLength", label: "Bollinger length", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_length", defaultValue: 20,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 2, max: 200, step: 1 }, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwStdDev", label: "Bollinger std dev", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_std", defaultValue: 2,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0.5, max: 5, step: 0.1 }, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwThresholdMode", label: "width threshold mode", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_thr_mode", defaultValue: "fixed",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["median", "percentile", "fixed"], validation: null, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwThresholdValue", label: "width threshold", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_thr_value", defaultValue: 2.342,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 20, step: 0.001 }, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwPercentile", label: "width percentile", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_pctile", defaultValue: 50,
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "number", options: null, validation: { min: 0, max: 100, step: 1 }, subgroup: "Bollinger (Volatility)",
    },
    {
        key: "bbwLongVolFilter", label: "long volatility filter", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bbw_longvol", defaultValue: true,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "Bollinger (Volatility)",
    },
    // ADX (Chop axis)
    {
        key: "adxEnabled", label: "ADX chop enabled", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_adx_enabled", defaultValue: true,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "boolean", options: null, validation: null, subgroup: "ADX (Chop)",
    },
    {
        key: "adxTimeframe", label: "ADX timeframe", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_adx_tf", defaultValue: "Daily",
        editable: false, masterControlsVisible: false, advancedMode: true,
        inputType: "select", options: ["Daily"], validation: null, subgroup: "ADX (Chop)",
    },
    {
        key: "adxLength", label: "ADX length", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_adx_length", defaultValue: 14,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 2, max: 100, step: 1 }, subgroup: "ADX (Chop)",
    },
    {
        key: "adxChopThreshold", label: "ADX chop threshold", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_adx_chop", defaultValue: 18,
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "number", options: null, validation: { min: 0, max: 60, step: 1 }, subgroup: "ADX (Chop)",
    },
    {
        key: "adxUseAs", label: "ADX use as", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_adx_use", defaultValue: "state_classifier",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["label", "filter", "state_classifier"], validation: null, subgroup: "ADX (Chop)",
    },
    // Allowed-states (filter mode) + computed output
    {
        key: "regimeAllowedStates", label: "allowed market states", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_allowed_states", defaultValue: [
            "Bull/Expand", "Bull/Compress", "Bull/Chop",
            "Bear/Expand", "Bear/Compress", "Bear/Chop",
        ],
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "multiselect", options: [
            "Bull/Expand", "Bull/Compress", "Bull/Chop",
            "Bear/Expand", "Bear/Compress", "Bear/Chop",
        ], validation: null, subgroup: "Market State",
    },
    // ── Direction-aware filter policy (Phase 4b) — orthogonal to regimeMode ──────
    {
        key: "regimeDirectionPolicy", label: "direction policy", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_direction_policy", defaultValue: "state_only",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["state_only", "direction_aware"], validation: null, subgroup: "Market State",
    },
    {
        key: "regimeBullAllows", label: "bull states allow", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bull_allows", defaultValue: "long",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["long", "both", "none"], validation: null, subgroup: "Market State",
    },
    {
        key: "regimeBearAllows", label: "bear states allow", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_bear_allows", defaultValue: "short",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["short", "both", "none"], validation: null, subgroup: "Market State",
    },
    {
        key: "regimeChopAllows", label: "chop states allow", group: "regime", tier: 1,
        emitted: true, backendKey: "regime_chop_allows", defaultValue: "both",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "select", options: ["both", "long", "short", "none"], validation: null, subgroup: "Market State",
    },
    {
        key: "marketState", label: "market state (computed)", group: "regime", tier: 1,
        emitted: false, backendKey: "", defaultValue: "",
        editable: false, masterControlsVisible: false, advancedMode: false,
        inputType: "readonly", options: null, validation: null, subgroup: "Output",
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Rerun-tier classification — Phase 6 (classification only, no recompute)
// ─────────────────────────────────────────────────────────────────────────────
// `rerunTier` answers "how expensive is it to see this change reflected?":
//   instant_filter   — re-derivable from the already-loaded run (subset / relabel),
//                      no rerun needed (e.g. session + structure-direction filters).
//   frontend_rescore — recomputable locally from the loaded trade data once fast
//                      rescore is wired (e.g. spread / slippage / commission costs).
//   backend_rescore  — needs execution simulation; uses the sidecar preview today
//                      (e.g. RR / stop / entry buffer / entry models / protection).
//   full_backtest    — changes the OB or candle universe; needs a full backend rerun
//                      (e.g. symbol / timeframe / date range / detection settings).
//
// Phase 6 ONLY classifies + signals — nothing recomputes yet. Guiding rules:
//   • When uncertain, prefer "backend_rescore" (safe: never claims local accuracy).
//   • Anything that clearly changes the OB/candle universe → "full_backtest".
// rerunTier is derived from a single classifier (no per-entry literals to drift).

export const RERUN_TIERS = Object.freeze([
    "instant_filter",
    "frontend_rescore",
    "backend_rescore",
    "full_backtest",
]);

// Cost ranking, cheap → expensive. Used to pick the dirtiest field's tier.
export const RERUN_TIER_PRECEDENCE = Object.freeze({
    instant_filter:   0,
    frontend_rescore: 1,
    backend_rescore:  2,
    full_backtest:    3,
});

export const RERUN_TIER_META = Object.freeze({
    instant_filter: {
        label: "Instant filter",
        buttonLabel: "Apply Filter",
        blurb: "Can update from the loaded run without rerunning the backtest.",
        needsBackend: false,
    },
    frontend_rescore: {
        label: "Fast rescore",
        buttonLabel: "Rescore Preview",
        blurb: "Can be recalculated locally from the loaded run data once fast rescore is wired.",
        needsBackend: false,
    },
    backend_rescore: {
        label: "Backend preview",
        buttonLabel: "Run Preview",
        blurb: "Needs execution simulation; currently uses the sidecar preview run.",
        needsBackend: true,
    },
    full_backtest: {
        label: "Full backtest",
        buttonLabel: "Run Full Backtest",
        blurb: "Changes the candle/OB universe and needs a full backend rerun.",
        needsBackend: true,
    },
});

// Per-key overrides (highest priority). Mirrors the Phase 6 mapping exactly.
const RERUN_TIER_KEY_OVERRIDES = {
    // instant_filter — session + structure-direction filters (trades carry these tags)
    london: "instant_filter", lull: "instant_filter", newYork: "instant_filter",
    asia: "instant_filter", outside: "instant_filter", sessionFilter: "instant_filter",
    bosLong: "instant_filter", bosShort: "instant_filter",
    chochLong: "instant_filter", chochShort: "instant_filter",
    direction: "instant_filter",
    // frontend_rescore — cost params recomputable from gross R + cost breakdown
    spread: "frontend_rescore", slippage: "frontend_rescore", commission: "frontend_rescore",
    // full_backtest — changes the OB/candle/event universe or run methodology
    symbol: "full_backtest", detectionTf: "full_backtest", executionTf: "full_backtest",
    dateFrom: "full_backtest", dateTo: "full_backtest", dataFile: "full_backtest",
    swing: "full_backtest", obFilter: "full_backtest",
    minObSizePips: "full_backtest", maxObSizePips: "full_backtest",
    structure: "full_backtest", newsFile: "full_backtest", monteCarlo: "full_backtest",
    // backend_rescore — execution-level core fields (position model / conflict handling)
    executionMode: "backend_rescore", conflict: "backend_rescore", cancelAction: "backend_rescore",
};

// Group-level defaults for everything not explicitly overridden above.
const RERUN_TIER_GROUP_DEFAULTS = {
    cost:       "frontend_rescore",
    session:    "instant_filter",
    regime:     "instant_filter",   // client-computed label/filter; no rerun (Phase 0-2)
    execution:  "backend_rescore",  // rr, stopBuffer, entryBuffer, obEntryDepthPct, verifyTicks
    entry:      "backend_rescore",  // entry models / penetration / triggered-edge fields
    protection: "backend_rescore",  // TE cancel / FFT — depend on execution path
    news:       "backend_rescore",  // blackout/flatten behaviour (newsFile → full_backtest above)
    structure:  "full_backtest",    // structure type drives OB generation
    core:       "full_backtest",    // detection / universe fields
};

/**
 * Classify a registry entry into a rerunTier. Single source of truth:
 * per-key override → group default → "backend_rescore" (safe fallback).
 */
export function classifyRerunTier(entry) {
    if (!entry) return "backend_rescore";
    return RERUN_TIER_KEY_OVERRIDES[entry.key]
        ?? RERUN_TIER_GROUP_DEFAULTS[entry.group]
        ?? "backend_rescore";
}

// Attach rerunTier to every entry (so every CONFIG_REGISTRY entry carries it).
for (const entry of CONFIG_REGISTRY) {
    entry.rerunTier = classifyRerunTier(entry);
}

/**
 * Highest-cost rerunTier among the given cfg keys, or null when none resolve.
 * Precedence: full_backtest > backend_rescore > frontend_rescore > instant_filter.
 */
export function highestRerunTierForKeys(keys) {
    let best = null;
    let bestRank = -1;
    for (const key of keys || []) {
        const tier = REGISTRY_BY_KEY[key]?.rerunTier;
        if (!tier) continue;
        const rank = RERUN_TIER_PRECEDENCE[tier] ?? -1;
        if (rank > bestRank) { bestRank = rank; best = tier; }
    }
    return best;
}

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

/**
 * Default cfg values for a group as a flat { key: defaultValue } object — the
 * single source of truth for a group's builder defaults. Consumers spread this
 * into their cfg seed instead of re-declaring literals (e.g. StrategyBuilder's
 * DEFAULT_CFG for the `regime` group). Arrays/objects are shallow-cloned so a
 * caller can't mutate the registry default in place.
 */
export function defaultsForGroup(group) {
    const out = {};
    for (const e of CONFIG_REGISTRY) {
        if (e.group !== group) continue;
        out[e.key] = Array.isArray(e.defaultValue) ? [...e.defaultValue] : e.defaultValue;
    }
    return out;
}

/** All entries for a given tier number (1, 2, or 3). */
export function getRegistryByTier(tier) {
    return CONFIG_REGISTRY.filter((e) => e.tier === tier);
}

/** Returns the registry entry for a cfg key, or undefined. */
export function getRegistryEntry(key) {
    return REGISTRY_BY_KEY[key];
}

/** All entries that are visible in Master Controls (respects advancedMode toggle). */
export function getVisibleEntries(showAdvanced = false) {
    return CONFIG_REGISTRY.filter(
        (e) => e.masterControlsVisible && (showAdvanced || !e.advancedMode)
    );
}

/** All entries that are editable in Master Controls. */
export function getEditableEntries() {
    return CONFIG_REGISTRY.filter((e) => e.editable);
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-validation (runs once at module load, console warnings only)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_INPUT_TYPES = new Set([
    "number", "boolean", "select", "multiselect",
    "comma_array", "date", "text", "readonly",
]);

(function validateRegistry() {
    const seen = new Set();
    for (const entry of CONFIG_REGISTRY) {
        const id = `"${entry.key}"`;

        // 1. Duplicate key check
        if (seen.has(entry.key)) {
            console.warn(`[configRegistry] Duplicate key detected: ${id}`);
        }
        seen.add(entry.key);

        // 2. Missing label
        if (!entry.label) {
            console.warn(`[configRegistry] Entry ${id} is missing a label.`);
        }

        // 3. emitted:true must have a non-empty backendKey
        if (entry.emitted && entry.backendKey === "") {
            console.warn(
                `[configRegistry] Entry ${id} has emitted:true but backendKey is empty.`
            );
        }

        // ── Phase 3B metadata checks ─────────────────────────────────────────

        // 4. editable must be boolean
        if (typeof entry.editable !== "boolean") {
            console.warn(`[configRegistry] Entry ${id} — editable is not boolean (got ${typeof entry.editable}).`);
        }

        // 5. masterControlsVisible must be boolean
        if (typeof entry.masterControlsVisible !== "boolean") {
            console.warn(`[configRegistry] Entry ${id} — masterControlsVisible is not boolean (got ${typeof entry.masterControlsVisible}).`);
        }

        // 6. advancedMode must be boolean
        if (typeof entry.advancedMode !== "boolean") {
            console.warn(`[configRegistry] Entry ${id} — advancedMode is not boolean (got ${typeof entry.advancedMode}).`);
        }

        // 7. inputType must be present and valid
        if (!entry.inputType || !VALID_INPUT_TYPES.has(entry.inputType)) {
            console.warn(`[configRegistry] Entry ${id} — inputType "${entry.inputType}" is missing or invalid.`);
        }

        // 8. select/multiselect must have an options array
        if ((entry.inputType === "select" || entry.inputType === "multiselect") && !Array.isArray(entry.options)) {
            console.warn(`[configRegistry] Entry ${id} — inputType "${entry.inputType}" requires an options array.`);
        }

        // 9. validation, if present, must be an object
        if (entry.validation != null && (typeof entry.validation !== "object" || Array.isArray(entry.validation))) {
            console.warn(`[configRegistry] Entry ${id} — validation is present but is not a plain object.`);
        }

        // 10. subgroup must be present (string or null is fine; undefined is not)
        if (!("subgroup" in entry)) {
            console.warn(`[configRegistry] Entry ${id} — subgroup field is missing entirely.`);
        }

        // 11. rerunTier (Phase 6) must be present and one of the allowed values
        if (!RERUN_TIERS.includes(entry.rerunTier)) {
            console.warn(`[configRegistry] Entry ${id} — rerunTier "${entry.rerunTier}" is missing or invalid.`);
        }
    }
})();
