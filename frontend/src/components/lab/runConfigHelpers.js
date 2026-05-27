// ── runConfigHelpers.js ──────────────────────────────────────────────────────
// Pure helpers for extracting, formatting, and comparing run configuration.
// No JSX. No side effects. Safe to call with null / index-only runs.

// ─────────────────────────────────────────────────────────────────────────────
// Internal: safe multi-key read from a config/summary object.
// Returns the first non-null, non-empty, non-"?" value found.
// ─────────────────────────────────────────────────────────────────────────────
function readFirst(obj, ...keys) {
    if (!obj) return undefined;
    for (const key of keys) {
        const v = obj[key];
        if (v != null && v !== "" && v !== "?") return v;
    }
    return undefined;
}

// Safe numeric read — returns a Number if parseable, otherwise null.
// Critically: treats 0 as valid (not missing).
function readNum(obj, ...keys) {
    const raw = readFirst(obj, ...keys);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

// Safe boolean — handles "true"/"false" strings from JSON configs.
function readBool(obj, ...keys) {
    const raw = readFirst(obj, ...keys);
    if (raw == null) return null;
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractRunConfig(run)
// Pulls all high-signal config fields from a run bundle (full or index-only).
// Returns a plain object. All fields may be null/undefined — callers decide
// whether to show them. A value of 0 is kept; empty string / "?" is null.
// ─────────────────────────────────────────────────────────────────────────────
export function extractRunConfig(run) {
    if (!run) return {};

    const config  = run.config   || {};
    const summary = run.summary  || {};
    // configSummary is the index-only lite copy stored in localStorage
    const csumm   = summary.configSummary || run.configSummary || {};

    // Helper that tries config → summary → configSummary → top-level run
    const get  = (...keys) => readFirst(config, ...keys)  ?? readFirst(summary, ...keys)  ?? readFirst(csumm, ...keys) ?? readFirst(run, ...keys);
    const num  = (...keys) => readNum(config, ...keys)    ?? readNum(summary, ...keys)    ?? readNum(csumm, ...keys)   ?? readNum(run, ...keys);
    const bool = (...keys) => readBool(config, ...keys)   ?? readBool(summary, ...keys)   ?? readBool(csumm, ...keys)  ?? readBool(run, ...keys);

    // ── Core ────────────────────────────────────────────────────────────────
    const symbol          = get("symbol");
    const detectionTf     = get("detection_timeframe", "detection_tf", "detectionTf");
    const executionMode   = get("execution_mode", "executionMode", "executionTf", "execution_tf");
    const tradeDirection  = get("trade_direction", "tradeDirection", "direction");
    const rr              = num("rr_multiple", "rr", "risk_reward");
    const startDate       = get("start_date", "date_from", "dateFrom");
    const endDate         = get("end_date",   "date_to",   "dateTo");

    // Build date range string
    let dateRange = null;
    if (startDate && endDate) {
        dateRange = `${startDate} → ${endDate}`;
    } else {
        dateRange = get("dateRange", "date_range") || null;
        if (dateRange) dateRange = String(dateRange).replace(/→/g, "→").trim();
    }

    // ── Entry ────────────────────────────────────────────────────────────────
    const entryDepthPct   = num("ob_entry_depth_pct", "obEntryDepthPct", "entry_depth_pct", "entryDepthPct");
    const entryBuffer     = num("entry_buffer_pips",  "entry_buffer",    "entryBuffer");
    const stopBuffer      = num("stop_buffer_pips",   "stop_buffer",     "stopBuffer");
    const verifyTicks     = num("verify_limit_ticks", "verify_ticks",    "verifyTicks");
    const entryExportMode = get("entry_research_export_mode", "entryResearchExportMode", "entry_export_mode");
    const batchEntry      = bool("batched_entry_engine", "batch_entry_engine", "batchedEntryEngine", "batch_entry_enabled");

    // Penetration thresholds — may be an array or comma string
    const rawPen = get("batch_entry_penetration_thresholds", "entry_penetration_thresholds", "penetrationThresholds");
    let penetrationThresholds = null;
    if (rawPen != null) {
        if (Array.isArray(rawPen)) {
            penetrationThresholds = rawPen.map(Number).filter(Number.isFinite);
        } else {
            const parsed = String(rawPen).split(/[,;]/).map((s) => Number(s.trim())).filter(Number.isFinite);
            if (parsed.length) penetrationThresholds = parsed;
        }
    }

    // ── Filters ──────────────────────────────────────────────────────────────
    const structureFilter = get("structure_filter", "structureFilter", "structure_type");
    const sessions        = (() => {
        const raw = get("sessions", "allowed_sessions", "session_filter");
        if (!raw) return null;
        if (Array.isArray(raw)) return raw.length ? raw : null;
        // Comma-separated string
        const parts = String(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        return parts.length ? parts : null;
    })();
    const minObSize       = num("min_ob_size_pips", "minObSizePips", "min_ob_size");
    const maxObSize       = num("max_ob_size_pips", "maxObSizePips", "max_ob_size");

    // ── News ─────────────────────────────────────────────────────────────────
    const newsEnabled       = bool("news_filter_enabled", "newsEnabled",       "news_on",         "use_news_filter");
    const newsBlackoutBefore = num("news_blackout_before", "blackoutBefore",   "news_before_mins", "blackout_before_mins");
    const newsBlackoutAfter  = num("news_blackout_after",  "blackoutAfter",    "news_after_mins",  "blackout_after_mins");
    const flattenOnNews      = bool("flatten_on_news",     "flattenOnNews",    "flatten_active_trades", "news_flatten");

    return {
        // Core
        symbol,
        detectionTf,
        executionMode,
        tradeDirection,
        rr,
        dateRange,
        // Entry
        entryDepthPct,
        entryBuffer,
        stopBuffer,
        verifyTicks,
        entryExportMode,
        batchEntry,
        penetrationThresholds,
        // Filters
        structureFilter,
        sessions,
        minObSize,
        maxObSize,
        // News
        newsEnabled,
        newsBlackoutBefore,
        newsBlackoutAfter,
        flattenOnNews,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// formatRunConfigValue(field, value)
// Returns a human-readable display string. Treats 0 as valid.
// ─────────────────────────────────────────────────────────────────────────────
export function formatRunConfigValue(field, value) {
    if (value == null) return null;

    switch (field) {
        case "structureFilter": {
            const s = String(value).toLowerCase().trim();
            if (s === "bos")    return "BOS";
            if (s === "choch")  return "CHoCH";
            if (s === "both")   return "Both";
            return String(value);
        }
        case "rr":
            return `${Number(value).toFixed(1)}R`;
        case "entryDepthPct":
            return `${value}%`;
        case "entryBuffer":
        case "stopBuffer":
        case "minObSize":
        case "maxObSize":
            return `${value}pip${Number(value) === 1 ? "" : "s"}`;
        case "verifyTicks":
            return `${value}tk`;
        case "sessions":
            return Array.isArray(value) ? value.join(", ") : String(value);
        case "penetrationThresholds":
            return Array.isArray(value) ? value.map((v) => `${v}%`).join(" / ") : String(value);
        case "newsEnabled":
        case "batchEntry":
        case "flattenOnNews":
            return value ? "ON" : "OFF";
        case "newsBlackoutBefore":
            return `${value}m before`;
        case "newsBlackoutAfter":
            return `${value}m after`;
        case "detectionTf": {
            const TF_MAP = { "1min": "M1", "5min": "M5", "15min": "M15", "30min": "M30", "1h": "H1", "4h": "H4" };
            return TF_MAP[value] || String(value);
        }
        case "dateRange":
            return String(value);
        case "executionMode":
        case "entryExportMode":
        case "tradeDirection":
        case "symbol":
        default:
            return String(value);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// compareRunConfigs(runs[])
// Given an array of run bundles, returns { configs[], diffFields: Set<string> }
// diffFields contains every field where at least two runs disagree.
// ─────────────────────────────────────────────────────────────────────────────
export function compareRunConfigs(runs) {
    if (!Array.isArray(runs) || !runs.length) {
        return { configs: [], diffFields: new Set() };
    }
    const configs = runs.map((run) => extractRunConfig(run));
    const allFields = Object.keys(configs[0]);
    const diffFields = new Set();

    for (const field of allFields) {
        const values = configs.map((c) => c[field]);
        const serialized = values.map((v) => {
            if (v == null) return "null";
            if (Array.isArray(v)) return v.slice().sort().join(",");
            return String(v);
        });
        const unique = new Set(serialized);
        if (unique.size > 1) diffFields.add(field);
    }

    return { configs, diffFields };
}

// ─────────────────────────────────────────────────────────────────────────────
// isConfigDifferent(field, configs[], diffFields)
// Convenience: returns true when a field differs across the selected runs.
// ─────────────────────────────────────────────────────────────────────────────
export function isConfigDifferent(field, diffFields) {
    return diffFields instanceof Set ? diffFields.has(field) : false;
}
