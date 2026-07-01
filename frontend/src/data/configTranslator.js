// ── configTranslator.js ──────────────────────────────────────────────────────
// Single source of truth for translating frontend cfg state ↔ backend JSON config.
//
// Extracted from StrategyBuilder.jsx — Phase 3A.
// No React / JSX dependencies. Safe to import from any module.
//
// Exports (public API):
//   buildBacktesterConfig(cfg)          → backend POST body
//   buildRunConfigLoadReport(current, run) → { config, loadedFields, missingFields }
//   selectedAllowedSessions(cfg)        → string[]
//   resolveEntryExportMode(cfg)         → string
//   entryExportFullRangeWarning(cfg)    → boolean
//   buildAllowedStructureDirections(cfg) → string[]
//   mapConfigDirection(value)           → "Both" | "Long" | "Short"
//   mapConfigDetectionTf(value)         → e.g. "M15"
//   mapConfigExecutionTf(value)         → e.g. "1m"
//   mapConfigExecutionMode(value)       → string
//   mapBuilderExecutionMode(value)      → string
//   mapBuilderTradeDirection(value)     → string
//   toNumber(value)                     → number | null
//   toBool(value)                       → boolean
//   ensureArray(value)                  → any[]
//   normalizeDateValue(value)           → "YYYY-MM-DD" | null
//   clampNumber(value, min, max, fallback) → number
//   normalizeCandleFile(value)          → filename string
//   mapDetectionTf(value)               → backend TF string
//   mapExecutionTf(value)               → backend TF string
//   mapObFilter(value)                  → "Atr" | "Cmr"
//   mapConfigObFilter(value)            → "ATR" | "CMR"
//   mapConfigStructure(value)           → "BOS" | "CHoCH" | "Both"
//   mapConfigConflict(value)            → string
//   mapConfigCancelAction(value)        → string
//   mapConfigSession(value)             → string
//   mapConfigEntryResearchExports(value) → boolean
//   mapConfigTriggeredEdgeEntries(value) → boolean
//   mapConfigEntryResearchExportMode(value, source) → string
//   mapConfigEntryThresholds(value)     → string | null
//   mapConfigTriggeredEdgeSameCandleMode(value) → string | null
//   deriveLegacyStructureFilterFromAllowed(allowed) → string
//   normalizeEntryThresholds(value)     → number[]
//   triggeredEdgeSameCandleModes(value) → string[]
//   triggeredEdgeCandleDelays(modes)    → number[]
//   entryThresholdsForMode(mode, customValue) → number[]
//   applyFirstPresent(patch, source, targetKey, sourceKeys, mapper)
//   removeEmptyPatchValues(patch)       → object
//   LOAD_FIELD_LABELS                   → { [cfgKey]: string }
//   getDefaultBuilderConfig()           → default cfg object from registry defaultValues
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG_REGISTRY } from "@/data/configRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// §1  Core type utilities
// ─────────────────────────────────────────────────────────────────────────────

export function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function toBool(value) {
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(text)) return true;
    if (["false", "0", "no", "n"].includes(text)) return false;
    return Boolean(value);
}

export function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
    return [];
}

export function normalizeDateValue(value) {
    if (!value) return null;
    const text = String(value);
    return text.slice(0, 10);
}

export function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// §2  TF / file mappers — forward (frontend → backend)
// ─────────────────────────────────────────────────────────────────────────────

/** Strip path prefix; return bare filename. Falls back to EURUSD_1m.csv. */
export function normalizeCandleFile(value) {
    const raw = String(value || "").trim();
    if (!raw) return "EURUSD_1m.csv";
    if (raw.startsWith("data/candles/")) return raw.slice("data/candles/".length) || "EURUSD_1m.csv";
    const parts = raw.split(/[\\/]/).filter(Boolean);
    const file = parts[parts.length - 1] || "";
    return file.toLowerCase().endsWith(".csv") ? file : "EURUSD_1m.csv";
}

/** Frontend display TF (e.g. "M15") → backend string (e.g. "15min"). */
export function mapDetectionTf(value) {
    return {
        M5:  "5min",
        M15: "15min",
        M30: "30min",
        H1:  "1h",
        H4:  "4h",
    }[value] || "15min";
}

/** Frontend execution TF (e.g. "1m") → backend string (e.g. "1min"). */
export function mapExecutionTf(value) {
    return {
        "1m": "1min",
        M1:   "1min",
        "5m": "5min",
        M5:   "5min",
    }[value] || "1min";
}

/** Frontend OB filter → backend cased value. */
export function mapObFilter(value) {
    return String(value || "").toUpperCase() === "CMR" ? "Cmr" : "Atr";
}

// ─────────────────────────────────────────────────────────────────────────────
// §3  TF / file mappers — reverse (backend → frontend)
// ─────────────────────────────────────────────────────────────────────────────

/** Backend detection TF string → frontend display TF. */
export function mapConfigDetectionTf(value) {
    const text = String(value || "").toLowerCase();
    return {
        "5min":  "M5",
        "15min": "M15",
        "30min": "M30",
        "1h":    "H1",
        "4h":    "H4",
    }[text] || String(value || "M15").toUpperCase();
}

/** Backend execution TF string → frontend display TF. */
export function mapConfigExecutionTf(value) {
    const text = String(value || "").toLowerCase();
    return {
        "1min": "1m",
        "5min": "5m",
    }[text] || String(value || "1m");
}

/** Backend OB filter string → frontend uppercase value. */
export function mapConfigObFilter(value) {
    return String(value || "").toUpperCase() === "CMR" ? "CMR" : "ATR";
}

// ─────────────────────────────────────────────────────────────────────────────
// §4  Field mappers — forward
// ─────────────────────────────────────────────────────────────────────────────

export function mapBuilderExecutionMode(value) {
    const text = String(value || "").toLowerCase();
    if (text === "multi_position" || text.includes("multi")) return "allow_multi_position";
    if (text.includes("direction")) return "one_per_direction";
    return text || "single_position";
}

export function mapBuilderTradeDirection(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("short")) return "short";
    if (text.includes("long"))  return "long";
    return "both";
}

/** Build the allowed_structure_directions array from four boolean chips. */
export function buildAllowedStructureDirections(cfg) {
    const allowed = [];
    if (cfg.bosLong    && cfg.direction !== "Short") allowed.push("bos_long");
    if (cfg.bosShort   && cfg.direction !== "Long")  allowed.push("bos_short");
    if (cfg.chochLong  && cfg.direction !== "Short") allowed.push("choch_long");
    if (cfg.chochShort && cfg.direction !== "Long")  allowed.push("choch_short");
    return allowed;
}

/** Derive legacy structure_filter string from an allowed_structure_directions array. */
export function deriveLegacyStructureFilterFromAllowed(allowed) {
    const hasBos   = allowed.includes("bos_long")   || allowed.includes("bos_short");
    const hasChoch = allowed.includes("choch_long")  || allowed.includes("choch_short");
    if (hasBos && !hasChoch) return "bos";
    if (!hasBos && hasChoch) return "choch";
    return "both";
}

/** Build the allowed_sessions array from individual session chip booleans. */
export function selectedAllowedSessions(cfg) {
    return [
        cfg.asia    ? "Asia"        : null,
        cfg.london  ? "London"      : null,
        cfg.lull    ? "London Lull" : null,
        cfg.newYork ? "New York"    : null,
        cfg.outside ? "Outside"     : null,
    ].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  Entry model helpers — forward
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a comma-string or array of thresholds; returns sorted deduped number[]. */
export function normalizeEntryThresholds(value) {
    const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
    return [...new Set(
        raw
            .map((item) => Number(String(item).trim()))
            .filter((item) => Number.isFinite(item) && item > 0 && item < 100)
            .map((item) => Number(item.toFixed(4)))
    )].sort((a, b) => a - b);
}

export function triggeredEdgeSameCandleModes(value) {
    if (value === "same") return ["same_candle"];
    if (value === "next") return ["next_candle"];
    return ["same_candle", "next_candle"];
}

export function triggeredEdgeCandleDelays(modes) {
    const delays = [];
    if (modes.includes("same_candle")) delays.push(0);
    if (modes.includes("next_candle")) delays.push(1);
    return delays;
}

export function entryThresholdsForMode(mode, customValue) {
    if (mode === "off")    return [];
    if (mode === "full")   return [10, 25, 50, 75];
    if (mode === "custom") return normalizeEntryThresholds(customValue);
    return [25, 50];
}

export function resolveEntryExportMode(cfg) {
    if (cfg?.entryResearchExportMode === "off"    || cfg?.entryResearchExports === false) return "off";
    if (cfg?.entryResearchExportMode === "custom") return "custom";
    if (cfg?.entryResearchExportMode === "full")   return "full";
    if (cfg?.entryResearchExportMode === "light")  return "light";
    const thresholds = normalizeEntryThresholds(cfg?.entryPenetrationThresholds);
    if (!thresholds.length) return "off";
    if (thresholds.length === 2 && thresholds.includes(25) && thresholds.includes(50)) return "light";
    if (thresholds.length === 4 && thresholds.includes(10) && thresholds.includes(25) && thresholds.includes(50) && thresholds.includes(75)) return "full";
    return "custom";
}

/** Returns true when export mode is "full" and the date range spans >= 12 months. */
export function entryExportFullRangeWarning(cfg) {
    if (resolveEntryExportMode(cfg) !== "full") return false;
    const start = Date.parse(cfg?.dateFrom);
    const end   = Date.parse(cfg?.dateTo);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    const months = (end - start) / (1000 * 60 * 60 * 24 * 30.44);
    return months >= 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  Field mappers — reverse (backend → frontend)
// ─────────────────────────────────────────────────────────────────────────────

export function mapConfigStructure(value) {
    const text = Array.isArray(value)
        ? value.join(",").toLowerCase()
        : String(value || "").toLowerCase();
    const hasBos   = text.includes("bos");
    const hasChoch = text.includes("choch") || text.includes("change");
    if (hasBos && hasChoch) return "Both";
    if (hasChoch)           return "CHoCH";
    if (hasBos)             return "BOS";
    return "Both";
}

export function mapConfigDirection(value) {
    const text = Array.isArray(value)
        ? value.join(",").toLowerCase()
        : String(value || "").toLowerCase();
    const hasLong  = text.includes("long")  || text.includes("bull") || text.includes("buy");
    const hasShort = text.includes("short") || text.includes("bear") || text.includes("sell");
    if (hasLong && hasShort) return "Both";
    if (hasShort)            return "Short";
    if (hasLong)             return "Long";
    return "Both";
}

export function mapConfigExecutionMode(value) {
    const raw  = Array.isArray(value) ? value[0] : value;
    const text = String(raw || "").toLowerCase();
    if (text.includes("multi"))     return "multi_position";
    if (text.includes("direction")) return "one_per_direction";
    return text || "single_position";
}

// NOTE: conflict / cancelAction are dropped fields (emitted:false in configRegistry).
// These mappers are retained for LOADING legacy bundles only — they are not emitted
// by buildBacktesterConfig.
export function mapConfigConflict(value) {
    if (typeof value === "boolean") return value ? "Allow Auto Reversal" : "Block Opposite";
    const text = String(value || "").toLowerCase();
    if (text.includes("auto") || text.includes("reverse") || text.includes("flip")) return "Allow Auto Reversal";
    return "Block Opposite";
}

export function mapConfigCancelAction(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("resume") || text.includes("pause")) return "Allow Resume";
    if (text.includes("touch"))                            return "Kill If Touched";
    return "Kill OB";
}

// NOTE: originSession / detectionSession are dropped fields (emitted:false).
// mapConfigSession is retained for loading legacy bundles only.
export function mapConfigSession(value) {
    const text = String(value || "").toLowerCase().replace(/[_-]+/g, " ");
    if (!text || text === "any" || text === "all") return "Any";
    if (text.includes("lull"))                              return "London Lull";
    if (text.includes("new york") || text === "ny")         return "New York";
    if (text.includes("london"))                            return "London";
    if (text.includes("asia"))                              return "Asia";
    return "Any";
}

export function mapConfigEntryResearchExports(value) {
    const models = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    return models.includes("entry_penetration");
}

export function mapConfigTriggeredEdgeEntries(value) {
    const models = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    return models.includes("triggered_edge");
}

export function mapConfigEntryResearchExportMode(value, source) {
    const models     = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    const thresholds = normalizeEntryThresholds(source?.entry_penetration_thresholds || source?.entryPenetrationThresholds);
    if (!models.includes("entry_penetration")) return "off";
    if (thresholds.length === 2 && thresholds.includes(25) && thresholds.includes(50)) return "light";
    if (thresholds.length === 4 && thresholds.includes(10) && thresholds.includes(25) && thresholds.includes(50) && thresholds.includes(75)) return "full";
    return thresholds.length ? "custom" : "light";
}

export function mapConfigEntryThresholds(value) {
    const thresholds = normalizeEntryThresholds(value);
    return thresholds.length ? thresholds.join(",") : null;
}

export function mapConfigTriggeredEdgeSameCandleMode(value) {
    const modes = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    if (modes.includes("both"))       return "both";
    if (modes.includes("same"))       return "same";
    if (modes.includes("next"))       return "next";
    const hasSame = modes.includes("same_candle");
    const hasNext = modes.includes("next_candle");
    if (hasSame && hasNext) return "both";
    if (hasSame)            return "same";
    if (hasNext)            return "next";
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  Load helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the first non-null/non-empty value found in `source` at any of `sourceKeys`
 * to `patch[targetKey]`, running it through `mapper` first.
 * No-op when no match or mapper returns null/empty.
 */
export function applyFirstPresent(patch, source, targetKey, sourceKeys, mapper = (value) => value) {
    for (const sourceKey of sourceKeys) {
        if (source?.[sourceKey] == null || source[sourceKey] === "") continue;
        const value = mapper(source[sourceKey]);
        if (value == null || value === "") continue;
        patch[targetKey] = value;
        return;
    }
}

/** Strip null/empty-string entries from a patch object before merging. */
export function removeEmptyPatchValues(patch) {
    return Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value != null && value !== "")
    );
}

/** Human-readable labels for every cfg key — used in load reports. */
export const LOAD_FIELD_LABELS = {
    symbol:                            "symbol",
    detectionTf:                       "detection timeframe",
    executionTf:                       "execution timeframe",
    dateFrom:                          "date from",
    dateTo:                            "date to",
    dataFile:                          "data file",
    swing:                             "swing length",
    obFilter:                          "OB filter",
    minObSizePips:                     "Min OB size",
    maxObSizePips:                     "Max OB size",
    structure:                         "structure type",
    direction:                         "trade direction",
    rr:                                "RR multiple",
    obEntryDepthPct:                   "OB entry depth",
    entryBuffer:                       "entry buffer",
    stopBuffer:                        "stop buffer",
    verifyTicks:                       "verify limit ticks",
    executionMode:                     "execution mode",
    conflict:                          "position conflict",
    cancelAction:                      "cancelled by conflict",
    sessionFilter:                     "session filter",
    london:                            "London session",
    lull:                              "London Lull session",
    newYork:                           "New York session",
    asia:                              "Asia session",
    outside:                           "Outside session",
    originSession:                     "OB origin session",
    detectionSession:                  "OB detection session",
    newsBlackout:                      "news blackout",
    newsFile:                          "news file",
    newsBlackoutBefore:                "news blackout before",
    newsBlackoutAfter:                 "news blackout after",
    newsBlackoutImpacts:               "news blackout impacts",
    newsBlackoutCurrencies:            "news blackout currencies",
    newsPausePending:                  "news pause pending",
    newsBlockFills:                    "news block fills",
    newsCancelIfTouched:               "news cancel if touched",
    newsFlattenActiveTrades:           "news flatten active trades",
    newsFlattenMinutesBefore:          "news flatten minutes before",
    spread:                            "spread",
    slippage:                          "slippage",
    commission:                        "commission",
    entryResearchExportMode:           "entry research export mode",
    entryResearchExports:              "entry research exports",
    entryPenetrationThresholds:        "entry penetration thresholds",
    useBatchedEntryPenetration:        "batched entry penetration",
    triggeredEdgeEntries:              "triggered edge entries",
    triggeredEdgeThresholds:           "triggered edge trigger thresholds",
    triggeredEdgeEntryLevelPct:        "triggered edge entry level",
    triggeredEdgeSameCandleMode:       "triggered edge entry delay",
    triggeredEdgeDelays:               "triggered edge delays",
    triggeredEdgeCancelOnRetrace:      "triggered edge retrace cancel",
    triggeredEdgeCancelRetracePips:    "triggered edge retrace cancel pips",
    triggeredEdgeCancelRetraceObPct:   "triggered edge retrace cancel OB %",
    triggeredEdgeCancelOnFirstFailedTag: "triggered edge first-failed-tag cancel",
    triggeredEdgeFftMoveAwayPips:      "FFT move-away pips",
    triggeredEdgeFftMoveAwayObMultiple: "FFT move-away OB multiple",
    triggeredEdgeFftMinObWidthPips:    "FFT min OB width",
    entryMode:                         "entry mode",
    selectedEntryModel:                "selected entry model",
    singlePenetrationPct:              "single penetration threshold",
    singleTriggeredEdgeThreshold:      "single triggered-edge threshold",
    monteCarlo:                        "Monte Carlo",
    bosLong:                           "BOS Long",
    bosShort:                          "BOS Short",
    chochLong:                         "CHoCH Long",
    chochShort:                        "CHoCH Short",
    directionalEntryMode:              "directional entry mode",
    longEntryEnabled:                  "long entry enabled",
    longEntryModel:                    "long entry model",
    longPenetrationPct:                "long penetration threshold",
    longTriggeredEdgeThreshold:        "long triggered-edge threshold",
    longTriggeredEdgeDelays:           "long triggered-edge delays",
    shortEntryEnabled:                 "short entry enabled",
    shortEntryModel:                   "short entry model",
    shortPenetrationPct:               "short penetration threshold",
    shortTriggeredEdgeThreshold:       "short triggered-edge threshold",
    shortTriggeredEdgeDelays:          "short triggered-edge delays",
};

// ─────────────────────────────────────────────────────────────────────────────
// §8  buildBacktesterConfig(cfg)
//     Translates frontend cfg state → POST body for /runs.
// ─────────────────────────────────────────────────────────────────────────────

// ── Break-even Exact Replay config (BE-FRONTEND-INTEGRATION) ─────────────────
// Builds the backend BE fields from the frontend cfg state. When the toggle is
// OFF (or no valid arm levels remain after sanitising), it emits ONLY
// { be_enabled: false } so a normal run is byte-identical to pre-BE behavior.
// Invariant: never send be_enabled:true with empty be_arm_levels.
// Canonical supported BE arm levels (R). Single source of truth for the
// Strategy Builder chips/default, the Break-even panel scenario rows, and the
// selective arm filter. Extended with higher research arms (2.5/3/3.5R); the
// backend accepts any positive arm via be_arm_levels (no whitelist), so this is
// purely the UI choice set. selectiveBeUniverse.DEFAULT_ARM_LEVELS mirrors this
// (that module is import-free for its single-file validation harness).
export const BE_ARM_LEVEL_CHOICES = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
export const BE_TRIGGER_CHOICES = ["wick", "close"];
export const BE_DELAY_CHOICES = [0, 1, 2];

export function buildBeConfig(cfg) {
    if (!cfg || !cfg.beEnabled) return { be_enabled: false };

    const arms = [...new Set(
        (Array.isArray(cfg.beArmLevels) ? cfg.beArmLevels : [])
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0),
    )].sort((a, b) => a - b);

    // Guard: enabled toggle but no valid arm levels → do NOT send an invalid
    // payload; fall back to disabled so the backend skips BE entirely.
    if (!arms.length) return { be_enabled: false };

    const triggers = [...new Set(
        (Array.isArray(cfg.beTriggerBases) ? cfg.beTriggerBases : [])
            .map((t) => String(t).toLowerCase())
            .filter((t) => t === "wick" || t === "close"),
    )];

    const delay = BE_DELAY_CHOICES.includes(Number(cfg.beDelayCandles)) ? Number(cfg.beDelayCandles) : 0;
    // Variant selection (P2): only "baseline" (default) or "all" are exposed.
    // Anything else is coerced to "baseline" — we never silently send "all".
    const beVariants = cfg.beVariants === "all" ? "all" : "baseline";

    return {
        be_enabled: true,
        be_arm_levels: arms,
        be_trigger_bases: triggers.length ? triggers : ["wick"],
        be_stop_buffer_r: 0.0,
        be_delay_candles: delay,
        be_variants: beVariants,
    };
}

// Map a regime timeframe label to the backend token (mirrors mapDetectionTf style).
export function mapRegimeTimeframe(value) {
    return { Daily: "1D", "4H": "4h", "1H": "1h" }[value] ?? "1D";
}

// Market State / Regime Gate → backend fields. Emits nothing (byte-identical
// config) unless regimeEnabled is truthy, mirroring the buildBeConfig discipline.
// The gate is computed per-day from shifted daily candles (see data/marketState.js);
// in label mode it stamps state only, in filter mode the backend may block fills
// whose state ∉ regime_allowed_states.
export function buildRegimeConfig(cfg) {
    if (!cfg || !cfg.regimeEnabled) return {};
    const states = Array.isArray(cfg.regimeAllowedStates) && cfg.regimeAllowedStates.length
        ? cfg.regimeAllowedStates
        : ["Bull/Expand", "Bull/Compress", "Bull/Chop", "Bear/Expand", "Bear/Compress", "Bear/Chop"];
    return {
        regime_gate_enabled:   true,
        regime_gate_mode:      cfg.regimeMode === "filter" ? "filter" : "label",
        regime_ema_enabled:    Boolean(cfg.emaEnabled ?? true),
        regime_ema_tf:         mapRegimeTimeframe(cfg.emaTimeframe ?? "Daily"),
        regime_ema_length:     Number(cfg.emaLength ?? 200),
        regime_ema_long_cond:  "price_above",
        regime_ema_short_cond: "price_below",
        regime_ema_confirm:    Number(cfg.emaConfirmDays ?? 0),
        regime_bbw_enabled:    Boolean(cfg.bbwEnabled ?? true),
        regime_bbw_tf:         mapRegimeTimeframe(cfg.bbwTimeframe ?? "Daily"),
        regime_bbw_length:     Number(cfg.bbwLength ?? 20),
        regime_bbw_std:        Number(cfg.bbwStdDev ?? 2),
        regime_bbw_thr_mode:   cfg.bbwThresholdMode ?? "fixed",
        regime_bbw_thr_value:  Number(cfg.bbwThresholdValue ?? 2.342),
        regime_bbw_pctile:     Number(cfg.bbwPercentile ?? 50),
        regime_bbw_longvol:    Boolean(cfg.bbwLongVolFilter ?? true),
        regime_adx_enabled:    Boolean(cfg.adxEnabled ?? true),
        regime_adx_tf:         mapRegimeTimeframe(cfg.adxTimeframe ?? "Daily"),
        regime_adx_length:     Number(cfg.adxLength ?? 14),
        regime_adx_chop:       Number(cfg.adxChopThreshold ?? 18),
        regime_adx_use:        cfg.adxUseAs ?? "state_classifier",
        regime_allowed_states: states,
    };
}

export function buildBacktesterConfig(cfg) {
    const allowedSessions = Boolean(cfg.sessionFilter) ? selectedAllowedSessions(cfg) : [];

    // ── Entry model fields: Single vs Research Export ─────────────────────────
    let entryModels, obEntryDepthPct, entryPenetrationThresholds, batchEntryPenetration,
        teThresholds, teEntryLevelPct, teSameCandleModes, teCandleDelays,
        teCancelOnRetrace, teCancelRetracePips, teCancelRetraceObPct,
        teCancelOnFirstFailedTag,
        teFftMoveAwayPips, teFftMoveAwayObMultiple, teFftMinObWidthPips;

    const isSingle = cfg.entryMode === "single";

    if (isSingle) {
        const model = cfg.selectedEntryModel || "baseline";
        if (model === "entry_penetration") {
            const pct = Number(cfg.singlePenetrationPct ?? 25);
            entryModels                 = ["entry_penetration"];
            obEntryDepthPct             = 0;
            entryPenetrationThresholds  = Number.isFinite(pct) && pct > 0 && pct < 100 ? [pct] : [25];
            batchEntryPenetration       = false;
            teThresholds                = [];
            teEntryLevelPct             = 0;
            teSameCandleModes           = [];
            teCandleDelays              = [];
            teCancelOnRetrace           = false;
            teCancelRetracePips         = 0;
            teCancelRetraceObPct        = 0;
            teCancelOnFirstFailedTag    = false;
            teFftMoveAwayPips           = 0;
            teFftMoveAwayObMultiple     = 0;
            teFftMinObWidthPips         = 0;
        } else if (model === "triggered_edge") {
            // Threshold SET: prefer the multi-select array (preset chips + custom);
            // fall back to the legacy single value. Cleaned to numeric, >0, <100,
            // deduped, sorted. Empty/invalid → default [25].
            const thrSource = Array.isArray(cfg.singleTriggeredEdgeThresholds) && cfg.singleTriggeredEdgeThresholds.length
                ? cfg.singleTriggeredEdgeThresholds
                : [cfg.singleTriggeredEdgeThreshold ?? 25];
            const thrSet = [...new Set(
                thrSource.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 100),
            )].sort((a, b) => a - b);
            entryModels                 = ["triggered_edge"];
            obEntryDepthPct             = 0;
            entryPenetrationThresholds  = [];
            batchEntryPenetration       = false;
            teThresholds                = thrSet.length ? thrSet : [25];
            teEntryLevelPct             = clampNumber(cfg.triggeredEdgeEntryLevelPct, 0, 100, 0);
            teSameCandleModes           = triggeredEdgeSameCandleModes(cfg.triggeredEdgeSameCandleMode);
            teCandleDelays              = Array.isArray(cfg.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length
                ? [...cfg.triggeredEdgeDelays].sort((a, b) => a - b)
                : triggeredEdgeCandleDelays(teSameCandleModes);
            teCancelOnRetrace           = Boolean(cfg.triggeredEdgeCancelOnRetrace);
            teCancelRetracePips         = Math.max(0, Number(cfg.triggeredEdgeCancelRetracePips) || 0);
            teCancelRetraceObPct        = Math.max(0, Number(cfg.triggeredEdgeCancelRetraceObPct) || 0);
            teCancelOnFirstFailedTag    = Boolean(cfg.triggeredEdgeCancelOnFirstFailedTag);
            teFftMoveAwayPips           = teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMoveAwayPips) || 0) : 0;
            teFftMoveAwayObMultiple     = teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMoveAwayObMultiple) || 0) : 0;
            teFftMinObWidthPips         = teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMinObWidthPips) || 0) : 0;
        } else {
            // baseline
            entryModels                 = ["baseline"];
            obEntryDepthPct             = Number(cfg.obEntryDepthPct ?? 0);
            entryPenetrationThresholds  = [];
            batchEntryPenetration       = false;
            teThresholds                = [];
            teEntryLevelPct             = 0;
            teSameCandleModes           = [];
            teCandleDelays              = [];
            teCancelOnRetrace           = false;
            teCancelRetracePips         = 0;
            teCancelRetraceObPct        = 0;
            teCancelOnFirstFailedTag    = false;
            teFftMoveAwayPips           = 0;
            teFftMoveAwayObMultiple     = 0;
            teFftMinObWidthPips         = 0;
        }
    } else {
        // Research Export — multi-model behavior
        const exportMode       = resolveEntryExportMode(cfg);
        const exportThresholds = entryThresholdsForMode(exportMode, cfg.entryPenetrationThresholds);
        const exportEnabled    = exportMode !== "off" && exportThresholds.length > 0;
        const teEnabled        = Boolean(cfg.triggeredEdgeEntries);
        const teRawThresholds  = teEnabled ? normalizeEntryThresholds(cfg.triggeredEdgeThresholds || "25") : [];
        entryModels                = ["baseline"];
        if (exportEnabled)                       entryModels.push("entry_penetration");
        if (teEnabled && teRawThresholds.length) entryModels.push("triggered_edge");
        obEntryDepthPct            = Number(cfg.obEntryDepthPct ?? 0);
        entryPenetrationThresholds = exportEnabled ? exportThresholds : [];
        batchEntryPenetration      = exportEnabled ? Boolean(cfg.useBatchedEntryPenetration) : false;
        teThresholds               = teEnabled ? teRawThresholds : [];
        teEntryLevelPct            = teEnabled ? clampNumber(cfg.triggeredEdgeEntryLevelPct, 0, 100, 0) : 0;
        teSameCandleModes          = teEnabled ? triggeredEdgeSameCandleModes(cfg.triggeredEdgeSameCandleMode) : [];
        teCandleDelays             = teEnabled && Array.isArray(cfg.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length
            ? [...cfg.triggeredEdgeDelays].sort((a, b) => a - b)
            : triggeredEdgeCandleDelays(teSameCandleModes);
        teCancelOnRetrace          = teEnabled ? Boolean(cfg.triggeredEdgeCancelOnRetrace) : false;
        teCancelRetracePips        = teEnabled ? Math.max(0, Number(cfg.triggeredEdgeCancelRetracePips) || 0) : 0;
        teCancelRetraceObPct       = teEnabled ? Math.max(0, Number(cfg.triggeredEdgeCancelRetraceObPct) || 0) : 0;
        teCancelOnFirstFailedTag   = teEnabled ? Boolean(cfg.triggeredEdgeCancelOnFirstFailedTag) : false;
        teFftMoveAwayPips          = teEnabled && teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMoveAwayPips) || 0) : 0;
        teFftMoveAwayObMultiple    = teEnabled && teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMoveAwayObMultiple) || 0) : 0;
        teFftMinObWidthPips        = teEnabled && teCancelOnFirstFailedTag ? Math.max(0, Number(cfg.triggeredEdgeFftMinObWidthPips) || 0) : 0;
    }

    // ── Directional entry assignment ──────────────────────────────────────────
    const isAsymmetric  = cfg.directionalEntryMode === "asymmetric";
    const longDelays    = Array.isArray(cfg.longTriggeredEdgeDelays) && cfg.longTriggeredEdgeDelays.length
        ? [...cfg.longTriggeredEdgeDelays].sort((a, b) => a - b) : [0, 1];
    const shortDelays   = Array.isArray(cfg.shortTriggeredEdgeDelays) && cfg.shortTriggeredEdgeDelays.length
        ? [...cfg.shortTriggeredEdgeDelays].sort((a, b) => a - b) : [0, 1];
    const directionalEntryConfig = isAsymmetric ? {
        long: {
            enabled:                  Boolean(cfg.longEntryEnabled),
            entry_model:              cfg.longEntryModel || "triggered_edge",
            penetration_pct:          Number(cfg.longPenetrationPct ?? 25),
            triggered_edge_threshold: Number(cfg.longTriggeredEdgeThreshold ?? 25),
            triggered_edge_delays:    longDelays,
        },
        short: {
            enabled:                  Boolean(cfg.shortEntryEnabled),
            entry_model:              cfg.shortEntryModel || "triggered_edge",
            penetration_pct:          Number(cfg.shortPenetrationPct ?? 25),
            triggered_edge_threshold: Number(cfg.shortTriggeredEdgeThreshold ?? 25),
            triggered_edge_delays:    shortDelays,
        },
    } : null;

    const config = {
        symbol:                                     cfg.symbol || "EURUSD",
        candle_file:                                normalizeCandleFile(cfg.dataFile),
        detection_timeframe:                        mapDetectionTf(cfg.detectionTf),
        execution_timeframe:                        mapExecutionTf(cfg.executionTf),
        start_date:                                 cfg.dateFrom,
        end_date:                                   cfg.dateTo,
        swing_length:                               Number(cfg.swing) || 50,
        ob_filter:                                  mapObFilter(cfg.obFilter),
        min_ob_size_pips:                           Number(cfg.minObSizePips ?? 0),
        max_ob_size_pips:                           Number(cfg.maxObSizePips ?? 100),
        rr_multiple:                                Number(cfg.rr) || 3.3,
        ob_entry_depth_pct:                         obEntryDepthPct,
        entry_buffer_pips:                          Number(cfg.entryBuffer ?? 0),
        stop_buffer_pips:                           Number(cfg.stopBuffer ?? 0),
        spread_pips:                                Number(cfg.spread) || 0,
        slippage_pips:                              Number(cfg.slippage) || 0,
        commission_r_per_trade:                     Number(cfg.commission) || 0,
        verify_limit_ticks:                         Number(cfg.verifyTicks ?? 0),
        execution_modes:                            [mapBuilderExecutionMode(cfg.executionMode)],
        trade_direction:                            mapBuilderTradeDirection(cfg.direction),
        structure_filter:                           deriveLegacyStructureFilterFromAllowed(buildAllowedStructureDirections(cfg)),
        allowed_structure_directions:               buildAllowedStructureDirections(cfg),
        entry_models:                               entryModels,
        entry_penetration_thresholds:               entryPenetrationThresholds,
        batch_entry_penetration:                    batchEntryPenetration,
        triggered_edge_trigger_thresholds:          teThresholds,
        triggered_edge_entry_level_pct:             teEntryLevelPct,
        triggered_edge_same_candle_modes:           teSameCandleModes,
        triggered_edge_candle_delays:               teCandleDelays,
        triggered_edge_cancel_on_retrace:           teCancelOnRetrace,
        triggered_edge_cancel_retrace_pips:         teCancelRetracePips,
        triggered_edge_cancel_retrace_ob_pct:       teCancelRetraceObPct,
        triggered_edge_cancel_on_first_failed_tag:  teCancelOnFirstFailedTag,
        triggered_edge_fft_move_away_pips:          teFftMoveAwayPips,
        triggered_edge_fft_move_away_ob_multiple:   teFftMoveAwayObMultiple,
        triggered_edge_fft_min_ob_width_pips:       teFftMinObWidthPips,
        // ── Directional entry ─────────────────────────────────────────────────
        directional_entry_mode: cfg.directionalEntryMode || "symmetric",
        ...(directionalEntryConfig ? { directional_entry_config: directionalEntryConfig } : {}),
        ...(isAsymmetric ? {
            long_entry_models:                  cfg.longEntryEnabled  ? [cfg.longEntryModel  || "triggered_edge"] : [],
            short_entry_models:                 cfg.shortEntryEnabled ? [cfg.shortEntryModel || "triggered_edge"] : [],
            long_triggered_edge_delays:         longDelays,
            short_triggered_edge_delays:        shortDelays,
            long_entry_penetration_thresholds:  cfg.longEntryModel  === "entry_penetration" ? [Number(cfg.longPenetrationPct  ?? 25)] : [],
            short_entry_penetration_thresholds: cfg.shortEntryModel === "entry_penetration" ? [Number(cfg.shortPenetrationPct ?? 25)] : [],
        } : {}),
        protection_modes:           ["baseline"],
        // ── Break-even Exact Replay ────────────────────────────────────────────
        // Emits be_enabled:false when the toggle is off (normal run unchanged);
        // when on, adds be_arm_levels / be_trigger_bases / be_stop_buffer_r /
        // be_delay_candles so the backend generates trades_*__be_*.csv + be_results.
        ...buildBeConfig(cfg),
        // ── Market State / Regime Gate ─────────────────────────────────────────
        // Emits regime_* only when regimeEnabled (off by default → byte-identical).
        ...buildRegimeConfig(cfg),
        session_filter_enabled:     Boolean(cfg.sessionFilter),
        allowed_sessions:           allowedSessions,
        news_blackout_enabled:      Boolean(cfg.newsBlackout),
        // ── Performance: parallel scenario execution ───────────────────────────
        // Speed-only. When on, the backend runs independent scenario passes across
        // worker processes and auto-picks a conservative worker count (max(1,cpu-2));
        // outputs are byte-identical to serial. max_workers is only emitted when the
        // user explicitly overrides (>1) — never 0, which the backend rejects.
        parallel_scenarios:         Boolean(cfg.parallelScenarios),
        ...(Number(cfg.maxWorkers) > 1 ? { max_workers: Number(cfg.maxWorkers) } : {}),
        // Reverse-touch cancel is DEPRECATED — always emit false so new runs never
        // re-enable the reverse-conflict gate (which would block BE multiarm). This
        // is explicit rather than relying on the backend default. Old imported runs
        // keep their historical value; this only affects newly launched runs.
        reverse_touch_cancel_enabled: false,
        // BUG 2 FIX: persist entryMode so reloaded bundles round-trip correctly.
        // BUG 3 FIX: persist selectedEntryModel so single-mode selection survives reload.
        _entry_mode:                cfg.entryMode || "single",
        _selected_entry_model:      cfg.selectedEntryModel || "baseline",
    };

    if (cfg.newsBlackout) {
        return {
            ...config,
            news_file:                              cfg.newsFile || "data/news/master_economic_calendar_2020_present.csv",
            news_blackout_minutes_before:           Number(cfg.newsBlackoutBefore),
            news_blackout_minutes_after:            Number(cfg.newsBlackoutAfter),
            news_blackout_impacts:                  Array.isArray(cfg.newsBlackoutImpacts) && cfg.newsBlackoutImpacts.length ? cfg.newsBlackoutImpacts : ["high"],
            news_blackout_currencies:               Array.isArray(cfg.newsBlackoutCurrencies) ? cfg.newsBlackoutCurrencies : [],
            news_pause_pending_orders:              Boolean(cfg.newsPausePending),
            news_block_new_fills:                   Boolean(cfg.newsBlockFills),
            news_cancel_if_touched_during_blackout: Boolean(cfg.newsCancelIfTouched),
            news_flatten_active_trades:             Boolean(cfg.newsFlattenActiveTrades),
            news_flatten_minutes_before_blackout:   Number(cfg.newsFlattenMinutesBefore ?? 5),
            ...(cfg.newsDebugObIds?.trim()
                ? { news_debug_ob_ids: cfg.newsDebugObIds.split(",").map((s) => s.trim()).filter(Boolean) }
                : {}),
        };
    }
    return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  buildRunConfigLoadReport(current, run)
//     Reverse-translates a run bundle config.json → frontend cfg patch.
//     Returns { config, loadedFields, missingFields }.
// ─────────────────────────────────────────────────────────────────────────────

export function buildRunConfigLoadReport(current, run) {
    const source = { ...(run?.summary || {}), ...(run?.config || {}) };
    const patch  = {};
    const loaded = new Set();

    applyFirstPresent(patch, source, "symbol",      ["symbol"]);
    applyFirstPresent(patch, source, "dataFile",    ["candle_file", "dataFile", "data_file"],
        (value) => `data/candles/${normalizeCandleFile(value)}`);
    applyFirstPresent(patch, source, "detectionTf", ["detection_timeframe", "detection_tf", "detectionTf"], mapConfigDetectionTf);
    applyFirstPresent(patch, source, "executionTf", ["execution_timeframe", "execution_tf", "executionTf"], mapConfigExecutionTf);
    applyFirstPresent(patch, source, "dateFrom",    ["start_date", "date_from", "dateFrom"],  normalizeDateValue);
    applyFirstPresent(patch, source, "dateTo",      ["end_date",   "date_to",   "dateTo"],    normalizeDateValue);
    applyFirstPresent(patch, source, "swing",       ["swing_length", "swing"],                toNumber);
    applyFirstPresent(patch, source, "obFilter",    ["ob_filter", "obFilter"],                mapConfigObFilter);
    applyFirstPresent(patch, source, "minObSizePips", ["min_ob_size_pips", "minObSizePips"],  toNumber);
    applyFirstPresent(patch, source, "maxObSizePips", ["max_ob_size_pips", "maxObSizePips"],  toNumber);
    applyFirstPresent(patch, source, "structure",   ["structure", "structure_type", "structure_filter", "allowed_structures"], mapConfigStructure);
    applyFirstPresent(patch, source, "direction",   ["direction", "trade_direction", "direction_filter", "allowed_directions"], mapConfigDirection);

    // ── Structure-direction chip round-trip ──────────────────────────────────
    // Prefer the fine-grained allowed_structure_directions array; fall back to
    // deriving chips from the coarse structure + direction fields.
    {
        const asd = source.allowed_structure_directions;
        if (Array.isArray(asd) && asd.length) {
            patch.bosLong    = asd.includes("bos_long");
            patch.bosShort   = asd.includes("bos_short");
            patch.chochLong  = asd.includes("choch_long");
            patch.chochShort = asd.includes("choch_short");
        } else {
            const sf  = String(patch.structure  || "Both").toLowerCase();
            const dir = String(patch.direction  || "Both").toLowerCase();
            const hasBos   = sf  === "bos"   || sf  === "both" || sf  === "bos+choch";
            const hasChoch = sf  === "choch"  || sf  === "both" || sf  === "bos+choch";
            const hasLong  = dir === "long"   || dir === "both" || dir === "long+short";
            const hasShort = dir === "short"  || dir === "both" || dir === "long+short";
            patch.bosLong    = hasBos   && hasLong;
            patch.bosShort   = hasBos   && hasShort;
            patch.chochLong  = hasChoch && hasLong;
            patch.chochShort = hasChoch && hasShort;
        }
    }

    applyFirstPresent(patch, source, "rr",               ["rr_multiple", "rr", "risk_reward"],          toNumber);
    applyFirstPresent(patch, source, "obEntryDepthPct",  ["ob_entry_depth_pct", "obEntryDepthPct"],      toNumber);
    applyFirstPresent(patch, source, "entryBuffer",      ["entry_buffer_pips", "entry_buffer", "entryBuffer"], toNumber);
    applyFirstPresent(patch, source, "stopBuffer",       ["stop_buffer_pips",  "stop_buffer",  "stopBuffer"],  toNumber);
    applyFirstPresent(patch, source, "verifyTicks",      ["verify_limit_ticks", "verify_ticks", "verifyTicks"], toNumber);
    applyFirstPresent(patch, source, "executionMode",    ["execution_modes", "executionMode", "execution_mode"], mapConfigExecutionMode);
    applyFirstPresent(patch, source, "conflict",         ["position_conflict", "conflict", "conflict_mode", "allow_auto_reversal"], mapConfigConflict);
    applyFirstPresent(patch, source, "cancelAction",     ["cancel_action", "cancelled_by_conflict", "canceled_by_conflict", "conflict_cancel_action"], mapConfigCancelAction);
    applyFirstPresent(patch, source, "sessionFilter",    ["session_filter", "session_filter_enabled", "use_session_filter"], toBool);

    // Individual session chip recall — applyFirstPresent from individual keys
    applyFirstPresent(patch, source, "london",   ["london",   "session_london",   "include_london"],                       toBool);
    applyFirstPresent(patch, source, "lull",     ["lull",     "london_lull",      "session_lull",  "include_london_lull"], toBool);
    applyFirstPresent(patch, source, "newYork",  ["new_york", "newYork",          "ny",            "session_new_york",  "include_new_york"], toBool);
    applyFirstPresent(patch, source, "asia",     ["asia",     "session_asia",     "include_asia"],                        toBool);
    applyFirstPresent(patch, source, "outside",  ["outside",  "session_outside",  "include_outside"],                     toBool);

    // BUG 1 FIX: Reconstruct individual session chips from the allowed_sessions array.
    // buildBacktesterConfig emits allowed_sessions (e.g. ["London", "New York"]) but
    // does NOT emit individual keys (london: true etc.), so the applyFirstPresent calls
    // above find nothing in backend-generated config.json bundles.
    // Only overwrite when allowed_sessions is present in the source.
    if (Array.isArray(source.allowed_sessions)) {
        const sess    = source.allowed_sessions.map((s) => String(s).toLowerCase().trim());
        patch.london  = sess.some((s) => s === "london");
        patch.lull    = sess.some((s) => s === "london lull" || s === "london_lull" || s === "lull");
        patch.newYork = sess.some((s) => s === "new york"    || s === "new_york"    || s === "ny");
        patch.asia    = sess.some((s) => s === "asia");
        patch.outside = sess.some((s) => s === "outside");
    }

    applyFirstPresent(patch, source, "originSession",    ["origin_session",    "ob_origin_session",    "originSession"],    mapConfigSession);
    applyFirstPresent(patch, source, "detectionSession", ["detection_session", "ob_detection_session", "detectionSession"], mapConfigSession);

    applyFirstPresent(patch, source, "newsBlackout",           ["news_blackout_enabled", "newsBlackout"],                         toBool);
    applyFirstPresent(patch, source, "newsFile",               ["news_file", "newsFile"]);
    applyFirstPresent(patch, source, "newsBlackoutBefore",     ["news_blackout_minutes_before", "newsBlackoutBefore"],            toNumber);
    applyFirstPresent(patch, source, "newsBlackoutAfter",      ["news_blackout_minutes_after",  "newsBlackoutAfter"],             toNumber);
    applyFirstPresent(patch, source, "newsBlackoutImpacts",    ["news_blackout_impacts",    "newsBlackoutImpacts"],               ensureArray);
    applyFirstPresent(patch, source, "newsBlackoutCurrencies", ["news_blackout_currencies", "newsBlackoutCurrencies"],            ensureArray);
    applyFirstPresent(patch, source, "newsPausePending",       ["news_pause_pending_orders",    "newsPausePending"],              toBool);
    applyFirstPresent(patch, source, "newsBlockFills",         ["news_block_new_fills",         "newsBlockFills"],                toBool);
    applyFirstPresent(patch, source, "newsCancelIfTouched",    ["news_cancel_if_touched_during_blackout", "newsCancelIfTouched"], toBool);
    applyFirstPresent(patch, source, "newsFlattenActiveTrades",   ["news_flatten_active_trades",          "newsFlattenActiveTrades"],    toBool);
    applyFirstPresent(patch, source, "newsFlattenMinutesBefore",  ["news_flatten_minutes_before_blackout", "newsFlattenMinutesBefore"],  toNumber);

    applyFirstPresent(patch, source, "spread",     ["spread", "spread_pips",    "spreadPips"],   toNumber);
    applyFirstPresent(patch, source, "slippage",   ["slippage", "slippage_pips", "slippagePips"], toNumber);
    applyFirstPresent(patch, source, "commission", ["commission_r_per_trade", "commission", "commission_per_trade"], toNumber);

    // ── Break-even Exact Replay round-trip ────────────────────────────────────
    // Reloading a BE run restores the Strategy Builder toggles so a re-run
    // regenerates the same scenarios.
    applyFirstPresent(patch, source, "beEnabled",       ["be_enabled", "beEnabled"], toBool);
    applyFirstPresent(patch, source, "beArmLevels",     ["be_arm_levels", "beArmLevels"],
        (v) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : null));
    applyFirstPresent(patch, source, "beTriggerBases",  ["be_trigger_bases", "beTriggerBases"],
        (v) => (Array.isArray(v) ? v.map((t) => String(t).toLowerCase()).filter((t) => t === "wick" || t === "close") : null));
    applyFirstPresent(patch, source, "beDelayCandles",  ["be_delay_candles", "beDelayCandles"], toNumber);
    applyFirstPresent(patch, source, "beVariants",      ["be_variants", "beVariants"],
        (v) => (v === "all" || (Array.isArray(v) && v.some((k) => k && k !== "baseline")) ? "all" : "baseline"));

    applyFirstPresent(patch, source, "entryResearchExports",       ["entry_models", "entryModels"],                                                   mapConfigEntryResearchExports);
    applyFirstPresent(patch, source, "entryPenetrationThresholds", ["entry_penetration_thresholds", "entryPenetrationThresholds"],                    mapConfigEntryThresholds);
    applyFirstPresent(patch, source, "useBatchedEntryPenetration", ["batch_entry_penetration", "batchEntryPenetration"],                             toBool);
    applyFirstPresent(patch, source, "parallelScenarios",          ["parallel_scenarios", "parallelScenarios"],                                       toBool);
    applyFirstPresent(patch, source, "maxWorkers",                 ["max_workers", "maxWorkers"],                                                     toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeEntries",       ["entry_models", "entryModels"],                                                   mapConfigTriggeredEdgeEntries);
    applyFirstPresent(patch, source, "triggeredEdgeThresholds",    ["triggered_edge_trigger_thresholds", "triggeredEdgeTriggerThresholds"],           mapConfigEntryThresholds);
    applyFirstPresent(patch, source, "triggeredEdgeEntryLevelPct", ["triggered_edge_entry_level_pct", "triggeredEdgeEntryLevelPct"],                 toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeSameCandleMode", ["triggered_edge_same_candle_modes", "triggeredEdgeSameCandleModes"],             mapConfigTriggeredEdgeSameCandleMode);
    applyFirstPresent(patch, source, "triggeredEdgeDelays",        ["triggered_edge_candle_delays", "triggeredEdgeDelays"],
        (v) => (Array.isArray(v) && v.length ? v.map(Number).filter((n) => Number.isFinite(n)) : null));

    // Derive triggeredEdgeDelays from legacy mode field when new array field is absent
    if (!patch.triggeredEdgeDelays?.length) {
        const mode = patch.triggeredEdgeSameCandleMode;
        patch.triggeredEdgeDelays = mode === "same" ? [0] : mode === "next" ? [1] : [0, 1];
    }

    applyFirstPresent(patch, source, "triggeredEdgeCancelOnRetrace",        ["triggered_edge_cancel_on_retrace",           "triggeredEdgeCancelOnRetrace"],        toBool);
    applyFirstPresent(patch, source, "triggeredEdgeCancelRetracePips",      ["triggered_edge_cancel_retrace_pips",         "triggeredEdgeCancelRetracePips"],       toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeCancelRetraceObPct",     ["triggered_edge_cancel_retrace_ob_pct",       "triggeredEdgeCancelRetraceObPct"],      toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeCancelOnFirstFailedTag", ["triggered_edge_cancel_on_first_failed_tag",  "triggeredEdgeCancelOnFirstFailedTag"],  toBool);
    applyFirstPresent(patch, source, "triggeredEdgeFftMoveAwayPips",        ["triggered_edge_fft_move_away_pips",          "triggeredEdgeFftMoveAwayPips"],         toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeFftMoveAwayObMultiple",  ["triggered_edge_fft_move_away_ob_multiple",   "triggeredEdgeFftMoveAwayObMultiple"],   toNumber);
    applyFirstPresent(patch, source, "triggeredEdgeFftMinObWidthPips",      ["triggered_edge_fft_min_ob_width_pips",       "triggeredEdgeFftMinObWidthPips"],       toNumber);

    if ("entryResearchExports" in patch || "entryPenetrationThresholds" in patch) {
        patch.entryResearchExportMode = mapConfigEntryResearchExportMode(source.entry_models || source.entryModels, source);
    }

    // BUG 2 FIX: read _entry_mode first (new bundles that used buildBacktesterConfig),
    // then fallback to entryMode / entry_mode for hand-crafted configs.
    applyFirstPresent(patch, source, "entryMode", ["_entry_mode", "entryMode", "entry_mode"],
        (value) => ["single", "research"].includes(value) ? value : null);
    // Backward compat: infer entryMode / selectedEntryModel from entry_models
    // when _entry_mode is absent (old bundles or cross-session imports after dd44c84).
    // >1 model  → research mode (selectedEntryModel not applicable).
    // exactly 1 → single mode; infer selectedEntryModel from the model name so that
    //             baseline/entry_penetration/triggered_edge runs load correctly
    //             without requiring the _entry_mode/_selected_entry_model round-trip keys.
    if (!("entryMode" in patch)) {
        const srcModels = ensureArray(source.entry_models || source.entryModels || []);
        if (srcModels.length > 1) {
            patch.entryMode = "research";
        } else if (srcModels.length === 1) {
            const INFER_MODELS = ["baseline", "entry_penetration", "triggered_edge"];
            patch.entryMode = "single";
            if (!("selectedEntryModel" in patch) && INFER_MODELS.includes(srcModels[0])) {
                patch.selectedEntryModel = srcModels[0];
            }
        }
    }

    // BUG 3 FIX: restore selectedEntryModel — previously never loaded, always reset to "baseline".
    applyFirstPresent(patch, source, "selectedEntryModel", ["_selected_entry_model", "selectedEntryModel", "selected_entry_model"],
        (value) => ["baseline", "entry_penetration", "triggered_edge"].includes(value) ? value : null);

    // BUG 4 FIX: populate singlePenetrationPct from single-element entry_penetration_thresholds array.
    // BUG 5 FIX: populate singleTriggeredEdgeThreshold from single-element triggered_edge_trigger_thresholds array.
    if (patch.entryMode === "single") {
        if (patch.selectedEntryModel === "entry_penetration" &&
            Array.isArray(source.entry_penetration_thresholds) &&
            source.entry_penetration_thresholds.length === 1) {
            const v = toNumber(source.entry_penetration_thresholds[0]);
            if (v != null) patch.singlePenetrationPct = v;
        }
        if (patch.selectedEntryModel === "triggered_edge" &&
            Array.isArray(source.triggered_edge_trigger_thresholds) &&
            source.triggered_edge_trigger_thresholds.length) {
            const set = [...new Set(
                source.triggered_edge_trigger_thresholds.map(toNumber).filter((n) => n != null && n > 0 && n < 100),
            )].sort((a, b) => a - b);
            if (set.length) {
                // Restore the multi-select set; keep the single value (first) for the custom input.
                patch.singleTriggeredEdgeThresholds = set;
                patch.singleTriggeredEdgeThreshold = set[0];
            }
        }
    }

    applyFirstPresent(patch, source, "monteCarlo", ["monte_carlo", "monteCarlo", "monte_carlo_enabled"], toBool);

    // ── Directional entry recall ──────────────────────────────────────────────
    applyFirstPresent(patch, source, "directionalEntryMode", ["directional_entry_mode", "directionalEntryMode"],
        (v) => ["symmetric", "asymmetric"].includes(v) ? v : null);

    const longDirCfg = source?.directional_entry_config?.long;
    if (longDirCfg) {
        if (longDirCfg.enabled != null)                          patch.longEntryEnabled          = toBool(longDirCfg.enabled);
        if (longDirCfg.entry_model)                              patch.longEntryModel            = longDirCfg.entry_model;
        if (longDirCfg.penetration_pct != null)                  { const v = toNumber(longDirCfg.penetration_pct);          if (v != null) patch.longPenetrationPct          = v; }
        if (longDirCfg.triggered_edge_threshold != null)         { const v = toNumber(longDirCfg.triggered_edge_threshold); if (v != null) patch.longTriggeredEdgeThreshold  = v; }
        if (Array.isArray(longDirCfg.triggered_edge_delays) && longDirCfg.triggered_edge_delays.length)
            patch.longTriggeredEdgeDelays = longDirCfg.triggered_edge_delays.map(Number).filter(Number.isFinite);
    }

    const shortDirCfg = source?.directional_entry_config?.short;
    if (shortDirCfg) {
        if (shortDirCfg.enabled != null)                         patch.shortEntryEnabled         = toBool(shortDirCfg.enabled);
        if (shortDirCfg.entry_model)                             patch.shortEntryModel           = shortDirCfg.entry_model;
        if (shortDirCfg.penetration_pct != null)                 { const v = toNumber(shortDirCfg.penetration_pct);         if (v != null) patch.shortPenetrationPct         = v; }
        if (shortDirCfg.triggered_edge_threshold != null)        { const v = toNumber(shortDirCfg.triggered_edge_threshold); if (v != null) patch.shortTriggeredEdgeThreshold = v; }
        if (Array.isArray(shortDirCfg.triggered_edge_delays) && shortDirCfg.triggered_edge_delays.length)
            patch.shortTriggeredEdgeDelays = shortDirCfg.triggered_edge_delays.map(Number).filter(Number.isFinite);
    }

    // Flat recall overrides nested (newer configs may only carry flat fields)
    applyFirstPresent(patch, source, "longEntryEnabled",          ["long_entry_enabled",                  "longEntryEnabled"],         toBool);
    applyFirstPresent(patch, source, "longEntryModel",            ["long_entry_model",                    "longEntryModel"]);
    applyFirstPresent(patch, source, "longPenetrationPct",        ["long_entry_penetration_thresholds",   "longPenetrationPct"],
        (v) => Array.isArray(v) && v.length ? toNumber(v[0]) : toNumber(v));
    applyFirstPresent(patch, source, "longTriggeredEdgeThreshold", ["long_triggered_edge_threshold",      "longTriggeredEdgeThreshold"], toNumber);
    applyFirstPresent(patch, source, "longTriggeredEdgeDelays",   ["long_triggered_edge_delays",          "longTriggeredEdgeDelays"],
        (v) => Array.isArray(v) && v.length ? v.map(Number).filter(Number.isFinite) : null);
    applyFirstPresent(patch, source, "shortEntryEnabled",         ["short_entry_enabled",                 "shortEntryEnabled"],         toBool);
    applyFirstPresent(patch, source, "shortEntryModel",           ["short_entry_model",                   "shortEntryModel"]);
    applyFirstPresent(patch, source, "shortPenetrationPct",       ["short_entry_penetration_thresholds",  "shortPenetrationPct"],
        (v) => Array.isArray(v) && v.length ? toNumber(v[0]) : toNumber(v));
    applyFirstPresent(patch, source, "shortTriggeredEdgeThreshold", ["short_triggered_edge_threshold",    "shortTriggeredEdgeThreshold"], toNumber);
    applyFirstPresent(patch, source, "shortTriggeredEdgeDelays",  ["short_triggered_edge_delays",         "shortTriggeredEdgeDelays"],
        (v) => Array.isArray(v) && v.length ? v.map(Number).filter(Number.isFinite) : null);

    // ── Build report ──────────────────────────────────────────────────────────
    Object.keys(patch).forEach((field) => loaded.add(field));
    const missingFields = Object.keys(LOAD_FIELD_LABELS)
        .filter((field) => !loaded.has(field))
        .map((field) => LOAD_FIELD_LABELS[field]);

    return {
        config:        { ...current, ...removeEmptyPatchValues(patch) },
        loadedFields:  [...loaded].map((field) => LOAD_FIELD_LABELS[field] || field),
        missingFields,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// §10  Default config builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a default frontend cfg object by pulling defaultValue from every
 * CONFIG_REGISTRY entry.  Arrays are shallow-cloned so callers can mutate
 * without affecting the registry.
 */
export function getDefaultBuilderConfig() {
    const cfg = {};
    for (const entry of CONFIG_REGISTRY) {
        cfg[entry.key] = Array.isArray(entry.defaultValue)
            ? [...entry.defaultValue]
            : entry.defaultValue;
    }
    return cfg;
}
