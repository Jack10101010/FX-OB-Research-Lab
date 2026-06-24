// Run bundle ingestion for FX-OB-Backtester output.
// A bundle = config.json + summary.json + order_blocks.csv + trades_*.csv (+ optional candles.csv).

import { summarizeTradeClassifications } from "./tradeClassification";

// ─────────────────────── CSV utilities ───────────────────────

export function parseCSV(text) {
    const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (!rows.length) return { headers: [], rows: [] };
    const split = (line) => {
        const out = []; let cur = ""; let q = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
            if (c === '"') { q = !q; continue; }
            if (c === "," && !q) { out.push(cur); cur = ""; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    };
    const headers = split(rows[0]).map((h) => h.trim().toLowerCase());
    const data = rows.slice(1).map((r) => {
        const cells = split(r);
        const obj = {};
        headers.forEach((h, i) => {
            const v = (cells[i] ?? "").trim();
            obj[h] = v === "" ? null : isFinite(Number(v)) ? Number(v) : v;
        });
        return obj;
    });
    return { headers, rows: data };
}

function pick(row, ...names) {
    for (const n of names) {
        const key = n.toLowerCase();
        if (row[key] != null) return row[key];
    }
    return null;
}

const cap = (s) => (s == null ? "" : String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase());

// Outcome display label. Title-cases free-text outcomes via cap() (preserving the
// legacy "Win"/"Loss" convention used across the app), but keeps canonical
// multi-token backend outcomes verbatim so they are not mangled — e.g.
// cap("BE_EXIT") === "Be_exit" would silently break === checks and the central
// classifier's raw-token matching. Only BE_EXIT is special-cased here; every
// other outcome continues through cap() exactly as before (no regression).
const CANONICAL_OUTCOME_LABELS = new Set(["BE_EXIT"]);
const outcomeLabel = (s) => {
    const norm = String(s ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return CANONICAL_OUTCOME_LABELS.has(norm) ? norm : cap(s);
};
const isNum = (v) => v != null && isFinite(Number(v));
const numOrNull = (v) => (isNum(v) ? Number(v) : null);

// ── Multi-RR target export axis (2B.1a) — importer mapping ────────────────────
// Backend (2B.0) emits per-trade flattened columns exit_r_rr_<token> and a
// run-level target_set. Token convention MUST match the backend rr_token exactly:
//   1.0 → "1", 2.0 → "2", 3.3 → "3p3", 0.5 → "0p5", 1.5 → "1p5".
export function rrToken(rr) {
    const v = Number(rr);
    if (!isFinite(v)) return null;
    return Number.isInteger(v) ? String(v) : String(v).replace(".", "p");
}

// Positive floats only, deduped, ascending, capped to `cap` (matches backend).
export function normalizeTargetSet(raw, cap = 6) {
    const out = [];
    const seen = new Set();
    for (const x of (Array.isArray(raw) ? raw : [])) {
        const v = Number(x);
        if (!isFinite(v) || v <= 0) continue;
        const key = Math.round(v * 1e6) / 1e6;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    out.sort((a, b) => a - b);
    return out.slice(0, cap);
}

// Map dynamic exit_r_rr_<token> columns on a parsed (lowercased-key) row into
// { token: number }. Only finite numeric values are included; {} when none. The
// column suffix is the key verbatim, so it always matches the backend token.
export function extractExitRByTarget(row) {
    const out = {};
    if (!row || typeof row !== "object") return out;
    for (const k of Object.keys(row)) {
        const m = /^exit_r_rr_(.+)$/.exec(k);
        if (!m) continue;
        const v = row[k];
        if (v == null || v === "" || !isFinite(Number(v))) continue;
        out[m[1]] = Number(v);
    }
    return out;
}
const boolOrNull = (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "boolean") return v;
    const text = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "t"].includes(text)) return true;
    if (["false", "0", "no", "n", "f"].includes(text)) return false;
    if (["none", "null", "nan"].includes(text)) return null;
    return null;
};

function pickFrom(obj, ...names) {
    if (!obj) return null;
    for (const n of names) {
        if (obj[n] != null) return obj[n];
    }
    return null;
}

function hasAny(headers, ...names) {
    return names.some((name) => headers.includes(name.toLowerCase()));
}

function hasAnyKey(obj, ...names) {
    return names.some((name) => obj?.[name] != null);
}

function pushHeaderIssues(target, severity, file, kind, headers, groups) {
    groups.forEach(({ label, aliases }) => {
        if (!hasAny(headers, ...aliases)) {
            target.push({ severity, file, kind, field: label, message: `${file} missing ${label}` });
        }
    });
}

function validateJsonObject(value, file, kind, errors) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push({ severity: "error", file, kind, field: kind, message: `${file} must contain a JSON object` });
    }
}

function validateJsonWarnings(value, file, kind, warnings) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (kind === "config") {
        [
            { label: "symbol", aliases: ["symbol"] },
            { label: "detection timeframe", aliases: ["detection_tf", "detectionTf"] },
            { label: "execution timeframe", aliases: ["execution_tf", "executionTf"] },
            { label: "date range", aliases: ["date_from", "dateFrom", "date_to", "dateTo"] },
            { label: "RR", aliases: ["rr_multiple", "rr", "risk_reward"] },
        ].forEach(({ label, aliases }) => {
            if (!hasAnyKey(value, ...aliases)) warnings.push({ severity: "warning", file, kind, field: label, message: `${file} missing ${label}` });
        });
    }
    if (kind === "summary") {
        [
            { label: "trade count", aliases: ["trades", "tradeCount", "trade_count", "total_trades", "n_trades"] },
            { label: "net R", aliases: ["net_r", "netR"] },
            { label: "OB count", aliases: ["obCount", "ob_count", "orderBlockCount", "order_block_count", "order_blocks_count", "order_blocks", "obs", "total_obs"] },
            { label: "symbol", aliases: ["symbol"] },
            { label: "date range", aliases: ["date_from", "dateFrom", "date_to", "dateTo"] },
            { label: "RR", aliases: ["rr_multiple", "rr", "risk_reward"] },
        ].forEach(({ label, aliases }) => {
            if (!hasAnyKey(value, ...aliases)) warnings.push({ severity: "warning", file, kind, field: label, message: `${file} missing ${label}` });
        });
    }
}

function validateCsvHeaders(kind, file, headers, errors, warnings) {
    if (kind === "order_blocks") {
        pushHeaderIssues(errors, "error", file, kind, headers, [
            { label: "id/ob_id", aliases: ["id", "ob_id"] },
            { label: "top/high", aliases: ["top", "high"] },
            { label: "bottom/bot/low", aliases: ["bottom", "bot", "low"] },
        ]);
        pushHeaderIssues(warnings, "warning", file, kind, headers, [
            { label: "origin_time", aliases: ["origin_time"] },
            { label: "detection_time/end_time", aliases: ["detection_time", "end_time"] },
            { label: "direction/side/type", aliases: ["direction", "side", "type"] },
        ]);
    }
    if (kind.startsWith("trades_")) {
        pushHeaderIssues(errors, "error", file, kind, headers, [
            { label: "trade_id/id", aliases: ["trade_id", "id"] },
            { label: "direction", aliases: ["direction"] },
            { label: "fill_time/entry_time", aliases: ["fill_time", "entry_time"] },
            { label: "entry", aliases: ["entry"] },
            { label: "pnl_r/r/r_result", aliases: ["pnl_r", "r", "r_result"] },
        ]);
        pushHeaderIssues(warnings, "warning", file, kind, headers, [
            { label: "ob_id", aliases: ["ob_id"] },
            { label: "exit_time", aliases: ["exit_time"] },
            { label: "stop", aliases: ["stop"] },
            { label: "tp", aliases: ["tp"] },
            { label: "rr_multiple", aliases: ["rr_multiple"] },
            { label: "structure_tag", aliases: ["structure_tag"] },
            { label: "outcome", aliases: ["outcome"] },
        ]);
    }
    if (kind === "candles") {
        pushHeaderIssues(errors, "error", file, kind, headers, [
            { label: "time/timestamp/datetime/date", aliases: ["time", "timestamp", "datetime", "date"] },
            { label: "open/o", aliases: ["open", "o"] },
            { label: "high/h", aliases: ["high", "h"] },
            { label: "low/l", aliases: ["low", "l"] },
            { label: "close/c", aliases: ["close", "c"] },
        ]);
    }
}

function normalizeTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function formatEntityId(prefix, value) {
    if (value == null || value === "") return "";
    const match = String(value).match(/\d+/);
    return match ? `${prefix}-${String(Number(match[0])).padStart(3, "0")}` : String(value);
}

// ─────────────────────── Parsers ───────────────────────

export function parseCandlesCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r, i) => {
        const t = String(pick(r, "time", "timestamp", "datetime", "date") || "");
        return {
            i,
            t,
            time: normalizeTimestamp(t),
            o: Number(pick(r, "open", "o") ?? 0),
            h: Number(pick(r, "high", "h") ?? 0),
            l: Number(pick(r, "low", "l") ?? 0),
            c: Number(pick(r, "close", "c") ?? 0),
        };
    });
}

export function parseOrderBlocksCSV(text) {
    const { headers, rows } = parseCSV(text);
    const hasNewsCreatedTagFields = headers.some((header) => header.startsWith("ob_origin_news_") || header.startsWith("ob_detection_news_"));
    return rows.map((r, i) => {
        const originNewsWindow = boolOrNull(pick(r, "ob_origin_news_window", "obOriginNewsWindow", "obCreatedDuringNews")) ?? false;
        const detectionNewsWindow = boolOrNull(pick(r, "ob_detection_news_window", "obDetectionNewsWindow", "obDetectedDuringNews")) ?? false;
        return {
            id: String(pick(r, "id", "ob_id") || `OB-${String(i + 1).padStart(3, "0")}`),
            originIndexRaw: pick(r, "i0", "start_index", "origin_index"),
            detectionIndexRaw: pick(r, "i1", "end_index", "detection_index"),
            originTime: pick(r, "origin_time", "start_time"),
            endTime:    pick(r, "end_time", "detection_time"),
            top:  Number(pick(r, "top", "high") ?? 0),
            bot:  Number(pick(r, "bot", "bottom", "low") ?? 0),
            side: String(pick(r, "side", "direction", "type") || "bull").toLowerCase().startsWith("b")
                ? (String(pick(r, "side", "direction", "type") || "").toLowerCase().includes("bear") ? "bear" : "bull")
                : "bear",
            // Origin candle OHLC + structure break level (Phase C2). Present in
            // order_blocks.csv but previously unmapped; powers origin body/wick/
            // impulse research dimensions. numOrNull → absent stays null (unknown).
            originOpen:  numOrNull(pick(r, "origin_open", "originOpen")),
            originHigh:  numOrNull(pick(r, "origin_high", "originHigh")),
            originLow:   numOrNull(pick(r, "origin_low", "originLow")),
            originClose: numOrNull(pick(r, "origin_close", "originClose")),
            breakLevel:  numOrNull(pick(r, "break_level", "breakLevel")),
            obFinalStatus: String(pick(r, "ob_final_status", "obFinalStatus") || ""),
            obFinalStatusLabel: String(pick(r, "ob_final_status_label", "obFinalStatusLabel") || ""),
            chartRightTime: pick(r, "chart_right_time"),
            chartRightTimeSource: String(pick(r, "chart_right_time_source") || ""),
            linkedTradeId: String(pick(r, "linked_trade_id", "linkedTradeId", "trade_id") || ""),
            fillTime: pick(r, "fill_time", "fillTime"),
            exitTime: pick(r, "exit_time", "exitTime"),
            cancelTime: pick(r, "cancel_time", "cancelTime"),
            invalidationTime: pick(r, "invalidation_time", "invalidationTime"),
            protectionTriggerTime: pick(r, "protection_trigger_time"),
            newsBlackoutTriggerTime: pick(r, "news_blackout_trigger_time", "newsBlackoutTriggerTime"),
            reverseTouchTime: pick(r, "reverse_touch_time", "reverseTouchTime"),
            sessionCancelTime: pick(r, "session_cancel_time", "sessionCancelTime"),
            lifecycleReason: String(pick(r, "lifecycle_reason", "lifecycleReason") || ""),
            obWidthPips: numOrNull(pick(r, "ob_width_pips", "obWidthPips", "width_pips")),
            maxObPenetrationPct: numOrNull(pick(r, "max_ob_penetration_pct", "maxObPenetrationPct")),
            max_ob_penetration_pct: numOrNull(pick(r, "max_ob_penetration_pct", "maxObPenetrationPct")),
            obOriginSession: String(pick(r, "ob_origin_session", "origin_session", "obOriginSession") || ""),
            obDetectionSession: String(pick(r, "ob_detection_session", "detection_session", "obDetectionSession") || ""),
            fillSession: String(pick(r, "fill_session", "fillSession") || ""),
            ob_origin_news_window: originNewsWindow,
            ob_detection_news_window: detectionNewsWindow,
            obOriginNewsWindow: originNewsWindow,
            obDetectionNewsWindow: detectionNewsWindow,
            obCreatedDuringNews: originNewsWindow,
            obDetectedDuringNews: detectionNewsWindow,
            ob_origin_news_event: String(pick(r, "ob_origin_news_event") || ""),
            ob_detection_news_event: String(pick(r, "ob_detection_news_event") || ""),
            obOriginNewsEvent: String(pick(r, "ob_origin_news_event", "obOriginNewsEvent") || ""),
            obDetectionNewsEvent: String(pick(r, "ob_detection_news_event", "obDetectionNewsEvent") || ""),
            ob_origin_news_currency: String(pick(r, "ob_origin_news_currency") || ""),
            ob_detection_news_currency: String(pick(r, "ob_detection_news_currency") || ""),
            obOriginNewsCurrency: String(pick(r, "ob_origin_news_currency", "obOriginNewsCurrency") || ""),
            obDetectionNewsCurrency: String(pick(r, "ob_detection_news_currency", "obDetectionNewsCurrency") || ""),
            ob_origin_news_impact: String(pick(r, "ob_origin_news_impact") || ""),
            ob_detection_news_impact: String(pick(r, "ob_detection_news_impact") || ""),
            obOriginNewsImpact: String(pick(r, "ob_origin_news_impact", "obOriginNewsImpact") || ""),
            obDetectionNewsImpact: String(pick(r, "ob_detection_news_impact", "obDetectionNewsImpact") || ""),
            ob_origin_news_event_time: String(pick(r, "ob_origin_news_event_time") || ""),
            ob_detection_news_event_time: String(pick(r, "ob_detection_news_event_time") || ""),
            obOriginNewsEventTime: String(pick(r, "ob_origin_news_event_time", "obOriginNewsEventTime") || ""),
            obDetectionNewsEventTime: String(pick(r, "ob_detection_news_event_time", "obDetectionNewsEventTime") || ""),
            ob_origin_news_window_start: String(pick(r, "ob_origin_news_window_start") || ""),
            ob_origin_news_window_end: String(pick(r, "ob_origin_news_window_end") || ""),
            ob_detection_news_window_start: String(pick(r, "ob_detection_news_window_start") || ""),
            ob_detection_news_window_end: String(pick(r, "ob_detection_news_window_end") || ""),
            obOriginNewsWindowStart: String(pick(r, "ob_origin_news_window_start", "obOriginNewsWindowStart") || ""),
            obOriginNewsWindowEnd: String(pick(r, "ob_origin_news_window_end", "obOriginNewsWindowEnd") || ""),
            obDetectionNewsWindowStart: String(pick(r, "ob_detection_news_window_start", "obDetectionNewsWindowStart") || ""),
            obDetectionNewsWindowEnd: String(pick(r, "ob_detection_news_window_end", "obDetectionNewsWindowEnd") || ""),
            ob_origin_minutes_from_news: numOrNull(pick(r, "ob_origin_minutes_from_news")),
            ob_detection_minutes_from_news: numOrNull(pick(r, "ob_detection_minutes_from_news")),
            obOriginMinutesFromNews: numOrNull(pick(r, "ob_origin_minutes_from_news", "obOriginMinutesFromNews")),
            obDetectionMinutesFromNews: numOrNull(pick(r, "ob_detection_minutes_from_news", "obDetectionMinutesFromNews")),
            hasNewsCreatedTagFields,
            // ── Ghost tracking (Phase 0 — observational only) ────────────────────
            ghost_candidate: boolOrNull(pick(r, "ghost_candidate", "ghostCandidate")),
            ghostCandidate: boolOrNull(pick(r, "ghost_candidate", "ghostCandidate")),
            ghost_trigger_reached: boolOrNull(pick(r, "ghost_trigger_reached", "ghostTriggerReached")),
            ghostTriggerReached: boolOrNull(pick(r, "ghost_trigger_reached", "ghostTriggerReached")),
            ghost_fill: boolOrNull(pick(r, "ghost_fill", "ghostFill")),
            ghostFill: boolOrNull(pick(r, "ghost_fill", "ghostFill")),
            ghost_outcome: String(pick(r, "ghost_outcome", "ghostOutcome") || ""),
            ghostOutcome: String(pick(r, "ghost_outcome", "ghostOutcome") || ""),
            ghost_r: numOrNull(pick(r, "ghost_r", "ghostR")),
            ghostR: numOrNull(pick(r, "ghost_r", "ghostR")),
            ghost_fill_session: String(pick(r, "ghost_fill_session", "ghostFillSession") || ""),
            ghostFillSession: String(pick(r, "ghost_fill_session", "ghostFillSession") || ""),
        };
    });
}

// ── OB Retest backend artifacts (Phase 2.4) ─────────────────────────────────────
// Backend ob_retests.csv is authoritative when present. Parse its snake_case rows
// into the EXACT camelCase event shape obRetest.js emits, so every downstream view
// (cards / breakdowns / table) consumes backend and derived events identically.
// Normalizations: direction bullish/bearish → bull/bear; numeric & boolean coercion.
function obRetestDirection(v) {
    return String(v || "").toLowerCase().includes("bear") ? "bear" : "bull";
}

export function parseObRetestsCSV(text) {
    const { rows } = parseCSV(text);
    return rows.map((r) => ({
        obId: pick(r, "ob_id", "obId"),
        direction: obRetestDirection(pick(r, "direction")),
        structure: String(pick(r, "structure", "structure_tag") || ""),
        detectionTime: numOrNull(pick(r, "detection_time", "detectionTime")),
        firstTouchTime: numOrNull(pick(r, "first_touch_time", "firstTouchTime")),
        firstFillTime: numOrNull(pick(r, "first_fill_time", "firstFillTime")),
        firstTouchOutcome: String(pick(r, "first_touch_outcome", "firstTouchOutcome") || ""),
        firstTouchWasTraded: boolOrNull(pick(r, "first_touch_was_traded", "firstTouchWasTraded")) ?? false,
        retestIndex: numOrNull(pick(r, "retest_index", "retestIndex")),
        retestTime: numOrNull(pick(r, "retest_time", "retestTime")),
        retestCandleIndex: numOrNull(pick(r, "retest_candle_index", "retestCandleIndex")),
        retestType: String(pick(r, "retest_type", "retestType") || ""),
        entryPenetrationPct: numOrNull(pick(r, "entry_penetration_pct", "entryPenetrationPct")),
        maxPenetrationPct: numOrNull(pick(r, "max_penetration_pct", "maxPenetrationPct")),
        reactionMaxPips: numOrNull(pick(r, "reaction_max_pips", "reactionMaxPips")),
        reactionMet: boolOrNull(pick(r, "reaction_met", "reactionMet")) ?? false,
        outcome: String(pick(r, "outcome") || ""),
        failureMode: String(pick(r, "failure_mode", "failureMode") || "none"),
        candlesToFailure: numOrNull(pick(r, "candles_to_failure", "candlesToFailure")),
        session: String(pick(r, "session") || ""),
        minutesSinceFirstTouch: numOrNull(pick(r, "minutes_since_first_touch", "minutesSinceFirstTouch")),
    }));
}

// Per-OB aggregate sidecar → perOB shape consumed by summarizeRetestEvents
// (touchCount / retestCount drive obsWithFirstTouch / obsRetested).
//
// Artifact version sniffing (header fingerprints; values-only checks would be
// ambiguous because v1 also carries a final_outcome column with the OLD value
// domain — last event outcome — and mapping it as a terminal status would
// corrupt the OB-level stats):
//   no "invalidation_mode" header                         → v1   (window-only engine)
//   "invalidation_mode" but no "kill_margin_pips"         → v2   (continuous invalidation)
//   "kill_margin_pips" header                             → v2.1 (death-definition + MFE fields)
// Fields above a row's artifact version are explicit nulls — old artifacts stay
// loadable and downstream gating (summary.obLevel, monetization panels) hides
// what the artifact cannot honestly provide. Booleans parse via boolOrNull:
// "true"/"false" → boolean, empty (alive OBs) → null.
export function parseObRetestSummaryCSV(text) {
    const { headers, rows } = parseCSV(text);
    const hasHeader = (name) => (headers || []).some((h) => String(h).trim().toLowerCase() === name);
    const isV21 = hasHeader("kill_margin_pips");
    const isV2 = isV21 || hasHeader("invalidation_mode");
    const version = isV21 ? 2.1 : isV2 ? 2 : 1;
    return rows.map((r) => ({
        obId: pick(r, "ob_id", "obId"),
        direction: obRetestDirection(pick(r, "direction")),
        structure: String(pick(r, "structure", "structure_tag") || ""),
        touchCount: numOrNull(pick(r, "ob_touch_count", "touchCount")) ?? 0,
        retestCount: numOrNull(pick(r, "retest_count", "retestCount")) ?? 0,
        retestsSurvived: numOrNull(pick(r, "retests_survived", "retestsSurvived")) ?? 0,
        retestsFailed: numOrNull(pick(r, "retests_failed", "retestsFailed")) ?? 0,
        retestsOpen: numOrNull(pick(r, "retests_open", "retestsOpen")) ?? 0,
        retestArtifactVersion: version,
        // v2 terminal fields (continuous invalidation)
        finalOutcome: isV2 ? (String(pick(r, "final_outcome", "finalOutcome") || "") || null) : null,
        invalidatedAtTime: isV2 ? numOrNull(pick(r, "invalidated_at_time", "invalidatedAtTime")) : null,
        invalidatedAtCandleIndex: isV2 ? numOrNull(pick(r, "invalidated_at_candle_index", "invalidatedAtCandleIndex")) : null,
        invalidationMode: isV2 ? (String(pick(r, "invalidation_mode", "invalidationMode") || "") || null) : null,
        invalidatedAfterRetestIndex: isV2 ? numOrNull(pick(r, "invalidated_after_retest_index", "invalidatedAfterRetestIndex")) : null,
        timeToInvalidationMinutes: isV2 ? numOrNull(pick(r, "time_to_invalidation_minutes", "timeToInvalidationMinutes")) : null,
        // v2.1 death-definition + MFE fields (OB-RETEST-V2.1)
        killMarginPips: isV21 ? numOrNull(pick(r, "kill_margin_pips", "killMarginPips")) : null,
        killConfirmedTf: isV21 ? boolOrNull(pick(r, "kill_confirmed_tf", "killConfirmedTf")) : null,
        reheldAfterKill: isV21 ? boolOrNull(pick(r, "reheld_after_kill", "reheldAfterKill")) : null,
        mfeBeforeDeathPips: isV21 ? numOrNull(pick(r, "mfe_before_death_pips", "mfeBeforeDeathPips")) : null,
        mfeAfterR1Pips: isV21 ? numOrNull(pick(r, "mfe_after_r1_pips", "mfeAfterR1Pips")) : null,
        mfeAfterR2Pips: isV21 ? numOrNull(pick(r, "mfe_after_r2_pips", "mfeAfterR2Pips")) : null,
        mfeAfterR3Pips: isV21 ? numOrNull(pick(r, "mfe_after_r3_pips", "mfeAfterR3Pips")) : null,
    }));
}

export function parseTradesCSV(text) {
    const { headers, rows } = parseCSV(text);
    const hasNewsCreatedTagFields = headers.some((header) => header.startsWith("ob_origin_news_") || header.startsWith("ob_detection_news_"));
    return rows.map((r, i) => {
        const directionRaw = pick(r, "direction", "side", "dir") || "Long";
        const directionText = String(directionRaw).toLowerCase();
        const direction = directionText.startsWith("bear") || directionText.startsWith("s") || directionText === "sell"
            ? "Short"
            : "Long";
        const outcomeRawValue = pick(r, "outcome", "result");
        const grossR = numOrNull(pick(r, "gross_r", "grossR"));
        const netR = numOrNull(pick(r, "net_r", "netR"));
        const rVal = netR ?? Number(pick(r, "pnl_r", "r", "r_result", "rresult") ?? 0);
        // Display label. cap() Title-cases free-text outcomes (preserving the
        // legacy "Win"/"Loss" convention), but canonical multi-token backend
        // outcomes (e.g. BE_EXIT) must NOT be mangled into "Be_exit" — keep them
        // verbatim so direct === checks and the central classifier agree.
        const outcome = outcomeRawValue ? outcomeLabel(outcomeRawValue) : (rVal >= 0 ? "Win" : "Loss");
        // Raw backend outcome string, preserved untouched for the classifier and
        // any consumer that needs the authoritative value (e.g. "BE_EXIT").
        const outcomeRaw = outcomeRawValue == null ? "" : String(outcomeRawValue);
        const structRaw = pick(r, "structure_tag", "structure", "structure_type", "type") || "BOS";
        const rawObId = pick(r, "ob_id", "order_block_id");
        const rawTradeId = pick(r, "trade_id", "id", "trade_index");
        const displayObId = formatEntityId("OB", rawObId);
        const derivedTradeId = rawObId != null && rawObId !== "" ? formatEntityId("T", rawObId) : "";
        const fillSession = String(pick(r, "fill_session", "fillSession", "trade_session", "tradeSession", "entry_session", "entrySession") || "");
        const exitRByTarget = extractExitRByTarget(r); // 2B.1a — multi-RR target outcomes
        const rawSession = String(pick(r, "session") || "");
        const originNewsWindow = boolOrNull(pick(r, "ob_origin_news_window", "obOriginNewsWindow", "obCreatedDuringNews")) ?? false;
        const detectionNewsWindow = boolOrNull(pick(r, "ob_detection_news_window", "obDetectionNewsWindow", "obDetectedDuringNews")) ?? false;
        return {
            id: String(rawTradeId || derivedTradeId || `T-${String(i + 1).padStart(3, "0")}`),
            rawTradeId: rawTradeId == null ? "" : String(rawTradeId),
            displayTradeId: derivedTradeId || String(rawTradeId || `T-${String(i + 1).padStart(3, "0")}`),
            obId: rawObId,
            displayObId,
            num: i + 1,
            direction,
            structure: String(structRaw).toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS",
            session: rawSession || fillSession || "—",
            fillSession: fillSession || rawSession || "",
            fill_session: fillSession || rawSession || "",
            trade_session: String(pick(r, "trade_session") || ""),
            entry_session: String(pick(r, "entry_session") || ""),
            obOrigin:   String(pick(r, "ob_origin", "origin_time") || ""),
            detected:   String(pick(r, "detected", "detection_time") || ""),
            entry:      String(pick(r, "fill_time", "entry_time") || ""),
            exit:       String(pick(r, "exit_time", "exit") || ""),
            entryPrice: Number(pick(r, "entry", "entry_price", "entryprice") ?? 0),
            stop:       Number(pick(r, "stop", "stop_loss", "sl") ?? 0),
            tp:         Number(pick(r, "tp", "take_profit") ?? 0),
            r: rVal,
            grossR: grossR ?? rVal,
            gross_r: grossR ?? rVal,
            netR: netR ?? rVal,
            net_r: netR ?? rVal,
            spreadCostR: numOrNull(pick(r, "spread_cost_r", "spreadCostR")),
            spread_cost_r: numOrNull(pick(r, "spread_cost_r", "spreadCostR")),
            slippageCostR: numOrNull(pick(r, "slippage_cost_r", "slippageCostR")),
            slippage_cost_r: numOrNull(pick(r, "slippage_cost_r", "slippageCostR")),
            commissionR: numOrNull(pick(r, "commission_r", "commissionR")),
            commission_r: numOrNull(pick(r, "commission_r", "commissionR")),
            totalCostR: numOrNull(pick(r, "total_cost_r", "totalCostR")),
            total_cost_r: numOrNull(pick(r, "total_cost_r", "totalCostR")),
            // Stop-anchored post-entry excursion (backend Phase 11A). Powers the future
            // RR Preview Lens. Absent in old bundles → null (numeric) / "" (model); no throw.
            mfeR: numOrNull(pick(r, "mfe_r", "mfeR")),
            mfe_r: numOrNull(pick(r, "mfe_r", "mfeR")),
            maeR: numOrNull(pick(r, "mae_r", "maeR")),
            mae_r: numOrNull(pick(r, "mae_r", "maeR")),
            // To-original-exit adverse excursion (backend Phase 11A.2). Adverse R over the
            // trade's REAL life [fill, exit] — the correct field for winner stop-pressure
            // (stop-anchored mae_r above can go ≤ -1R for winners after the original exit).
            // Absent in old bundles → null; the Stop-Pressure panel falls back to mae_r.
            maeRToOriginalExit: numOrNull(pick(r, "mae_r_to_original_exit", "maeRToOriginalExit")),
            mae_r_to_original_exit: numOrNull(pick(r, "mae_r_to_original_exit", "maeRToOriginalExit")),
            rIfNoTarget: numOrNull(pick(r, "r_if_no_target", "rIfNoTarget")),
            r_if_no_target: numOrNull(pick(r, "r_if_no_target", "rIfNoTarget")),
            rIfNoTargetModel: String(pick(r, "r_if_no_target_model", "rIfNoTargetModel") || ""),
            r_if_no_target_model: String(pick(r, "r_if_no_target_model", "rIfNoTargetModel") || ""),
            // 2B.1a — exact multi-RR target outcomes: { token: exitR }. {} when the
            // backend emitted no exit_r_rr_* columns (pre-2B bundles unchanged).
            exit_r_by_target: exitRByTarget,
            // Post-stop continuation (backend V5 Phase 2; LOSS rows only). Max favorable R
            // AFTER the stop candle, measured from the ORIGINAL entry, over a finite horizon
            // (post_stop_lookahead_bars; default 50). Powers Confirmed False Loser detection.
            // A peak ("reached"), NOT a path — cannot prove a BE/trail would have held.
            // Absent on pre-V5 bundles → null/"" (no throw); non-LOSS rows blank by design.
            // Dual-keyed (camelCase + snake_case) + legacy planning alias post_stop_continuation_r.
            postStopMfeR:                 numOrNull(pick(r, "post_stop_mfe_r", "postStopMfeR", "post_stop_continuation_r")),
            post_stop_mfe_r:              numOrNull(pick(r, "post_stop_mfe_r", "postStopMfeR", "post_stop_continuation_r")),
            postStopReachedOriginalTp:    boolOrNull(pick(r, "post_stop_reached_original_tp", "postStopReachedOriginalTp")),
            post_stop_reached_original_tp: boolOrNull(pick(r, "post_stop_reached_original_tp", "postStopReachedOriginalTp")),
            postStopBarsTo1R:             numOrNull(pick(r, "post_stop_bars_to_1r", "postStopBarsTo1R")),
            post_stop_bars_to_1r:         numOrNull(pick(r, "post_stop_bars_to_1r", "postStopBarsTo1R")),
            postStopLookaheadBars:        numOrNull(pick(r, "post_stop_lookahead_bars", "postStopLookaheadBars")),
            post_stop_lookahead_bars:     numOrNull(pick(r, "post_stop_lookahead_bars", "postStopLookaheadBars")),
            postStopModel:                String(pick(r, "post_stop_model", "postStopModel") || ""),
            post_stop_model:              String(pick(r, "post_stop_model", "postStopModel") || ""),
            outcome,
            // Authoritative backend outcome string, never Title-cased. "BE_EXIT"
            // survives here so the central classifier and direct consumers agree.
            outcomeRaw,
            // ── Break-even (BE) Exact Replay fields (backend Phase 2) ──────────
            // Present only on trades_*__be_*.csv rows; null/"" on all other
            // bundles and rows (old bundles load unchanged). Dual-keyed
            // (snake_case + camelCase). Booleans via boolOrNull, numbers via
            // numOrNull so "True"/"1"/"" parse cleanly.
            be_scenario_key:       String(pick(r, "be_scenario_key", "beScenarioKey") || ""),
            beScenarioKey:         String(pick(r, "be_scenario_key", "beScenarioKey") || ""),
            be_arm_level_r:        numOrNull(pick(r, "be_arm_level_r", "beArmLevelR")),
            beArmLevelR:           numOrNull(pick(r, "be_arm_level_r", "beArmLevelR")),
            be_trigger_basis:      String(pick(r, "be_trigger_basis", "beTriggerBasis") || ""),
            beTriggerBasis:        String(pick(r, "be_trigger_basis", "beTriggerBasis") || ""),
            be_armed:              boolOrNull(pick(r, "be_armed", "beArmed")),
            beArmed:               boolOrNull(pick(r, "be_armed", "beArmed")),
            be_arm_candle_index:   numOrNull(pick(r, "be_arm_candle_index", "beArmCandleIndex")),
            beArmCandleIndex:      numOrNull(pick(r, "be_arm_candle_index", "beArmCandleIndex")),
            be_arm_time:           String(pick(r, "be_arm_time", "beArmTime") || ""),
            beArmTime:             String(pick(r, "be_arm_time", "beArmTime") || ""),
            be_triggered:          boolOrNull(pick(r, "be_triggered", "beTriggered")),
            beTriggered:           boolOrNull(pick(r, "be_triggered", "beTriggered")),
            be_exit_reason:        String(pick(r, "be_exit_reason", "beExitReason") || ""),
            beExitReason:          String(pick(r, "be_exit_reason", "beExitReason") || ""),
            be_exit_r:             numOrNull(pick(r, "be_exit_r", "beExitR")),
            beExitR:               numOrNull(pick(r, "be_exit_r", "beExitR")),
            be_exit_price:         numOrNull(pick(r, "be_exit_price", "beExitPrice")),
            beExitPrice:           numOrNull(pick(r, "be_exit_price", "beExitPrice")),
            be_exit_time:          String(pick(r, "be_exit_time", "beExitTime") || ""),
            beExitTime:            String(pick(r, "be_exit_time", "beExitTime") || ""),
            be_exit_candle_index:  numOrNull(pick(r, "be_exit_candle_index", "beExitCandleIndex")),
            beExitCandleIndex:     numOrNull(pick(r, "be_exit_candle_index", "beExitCandleIndex")),
            obWidth:        Number(pick(r, "ob_width", "obwidth") ?? 0),
            reverseConflict: Boolean(pick(r, "reverse_conflict", "reverse_cancel")),
            fill_candle_open: numOrNull(pick(r, "fill_candle_open")),
            fill_candle_high: numOrNull(pick(r, "fill_candle_high")),
            fill_candle_low: numOrNull(pick(r, "fill_candle_low")),
            fill_candle_close: numOrNull(pick(r, "fill_candle_close")),
            fill_candle_index: numOrNull(pick(r, "fill_candle_index")),
            exit_candle_index: numOrNull(pick(r, "exit_candle_index")),
            bars_to_exit: numOrNull(pick(r, "bars_to_exit")),
            minutes_to_exit: numOrNull(pick(r, "minutes_to_exit")),
            same_candle_exit: boolOrNull(pick(r, "same_candle_exit")),
            max_ob_penetration_price: numOrNull(pick(r, "max_ob_penetration_price")),
            max_ob_penetration_pct: numOrNull(pick(r, "max_ob_penetration_pct")),
            max_ob_penetration_pips: numOrNull(pick(r, "max_ob_penetration_pips")),
            ob_fully_breached: boolOrNull(pick(r, "ob_fully_breached")),
            fill_penetration_pct: numOrNull(pick(r, "fill_penetration_pct")),
            fill_penetration_pips: numOrNull(pick(r, "fill_penetration_pips")),
            entry_depth_pct: numOrNull(pick(r, "entry_depth_pct")),
            ob_entry_depth_pct: numOrNull(pick(r, "ob_entry_depth_pct")),
            obEntryDepthPct: numOrNull(pick(r, "ob_entry_depth_pct", "obEntryDepthPct")),
            original_edge_entry: numOrNull(pick(r, "original_edge_entry")),
            originalEdgeEntry: numOrNull(pick(r, "original_edge_entry", "originalEdgeEntry")),
            adjusted_entry: numOrNull(pick(r, "adjusted_entry")),
            adjustedEntry: numOrNull(pick(r, "adjusted_entry", "adjustedEntry")),
            max_distance_away_before_fill_price: numOrNull(pick(r, "max_distance_away_before_fill_price")),
            max_distance_away_before_fill_pips: numOrNull(pick(r, "max_distance_away_before_fill_pips")),
            max_distance_away_before_fill_r: numOrNull(pick(r, "max_distance_away_before_fill_r")),
            // Vacancy distance at arm (triggered-edge only; magnitude ≥ 0 where 0 = price still
            // inside the OB / occupied at arm). Blank → null = non-TE / never-triggered / unavailable.
            // Dual-keyed; powers the Classification "Distance at Arm" breakdown (validates F-004).
            priceDistanceFromObAtArmPips:        numOrNull(pick(r, "price_distance_from_ob_at_arm_pips", "priceDistanceFromObAtArmPips")),
            price_distance_from_ob_at_arm_pips:  numOrNull(pick(r, "price_distance_from_ob_at_arm_pips", "priceDistanceFromObAtArmPips")),
            stop_buffer: numOrNull(pick(r, "stop_buffer")),
            stop_buffer_pips: numOrNull(pick(r, "stop_buffer_pips")),
            rr_config: numOrNull(pick(r, "rr_config")),
            close_confirmed_ob_breach: boolOrNull(pick(r, "close_confirmed_ob_breach")),
            close_breach_time: String(pick(r, "close_breach_time") || ""),
            close_breach_price: numOrNull(pick(r, "close_breach_price")),
            close_breach_distance_pips: numOrNull(pick(r, "close_breach_distance_pips")),
            close_breach_distance_pct: numOrNull(pick(r, "close_breach_distance_pct")),
            close_breach_session: String(pick(r, "close_breach_session") || ""),
            close_breach_hour: numOrNull(pick(r, "close_breach_hour")),
            protection_mode: String(pick(r, "protection_mode") || ""),
            protection_threshold: numOrNull(pick(r, "protection_threshold")),
            protection_threshold_pct: numOrNull(pick(r, "protection_threshold_pct")),
            protection_exit_reason: String(pick(r, "protection_exit_reason") || ""),
            protection_exit_price: numOrNull(pick(r, "protection_exit_price")),
            protection_trigger_time: String(pick(r, "protection_trigger_time") || ""),
            protection_trigger_penetration_pct: numOrNull(pick(r, "protection_trigger_penetration_pct")),
            entry_model: String(pick(r, "entry_model") || ""),
            entry_model_key: String(pick(r, "entry_model_key", "entryModelKey") || ""),
            entryFamily: String(pick(r, "entry_family", "entryFamily") || ""),
            entry_family: String(pick(r, "entry_family", "entryFamily") || ""),
            entry_threshold_pct: numOrNull(pick(r, "entry_threshold_pct")),
            planned_entry_price: numOrNull(pick(r, "planned_entry_price")),
            actual_entry_price: numOrNull(pick(r, "actual_entry_price")),
            entry_model_filled: boolOrNull(pick(r, "entry_model_filled")),
            trigger_penetration_pct: numOrNull(pick(r, "trigger_penetration_pct", "triggerPenetrationPct")),
            triggerPenetrationPct: numOrNull(pick(r, "trigger_penetration_pct", "triggerPenetrationPct")),
            trigger_time: String(pick(r, "trigger_time", "triggerTime") || ""),
            triggerTime: String(pick(r, "trigger_time", "triggerTime") || ""),
            trigger_candle_index: numOrNull(pick(r, "trigger_candle_index", "triggerCandleIndex")),
            triggerCandleIndex: numOrNull(pick(r, "trigger_candle_index", "triggerCandleIndex")),
            armed_at: String(pick(r, "armed_at", "armedAt") || ""),
            armedAt: String(pick(r, "armed_at", "armedAt") || ""),
            armed_on_trigger_candle: boolOrNull(pick(r, "armed_on_trigger_candle", "armedOnTriggerCandle", "armed_same_candle", "armedSameCandle")),
            armedOnTriggerCandle: boolOrNull(pick(r, "armed_on_trigger_candle", "armedOnTriggerCandle", "armed_same_candle", "armedSameCandle")),
            armed_same_candle: boolOrNull(pick(r, "armed_same_candle", "armedSameCandle", "armed_on_trigger_candle", "armedOnTriggerCandle")),
            armedSameCandle: boolOrNull(pick(r, "armed_same_candle", "armedSameCandle", "armed_on_trigger_candle", "armedOnTriggerCandle")),
            filled_on_trigger_candle: boolOrNull(pick(r, "filled_on_trigger_candle", "filledOnTriggerCandle")),
            filledOnTriggerCandle: boolOrNull(pick(r, "filled_on_trigger_candle", "filledOnTriggerCandle")),
            same_candle_entry_allowed: boolOrNull(pick(r, "same_candle_entry_allowed", "sameCandleEntryAllowed")),
            sameCandleEntryAllowed: boolOrNull(pick(r, "same_candle_entry_allowed", "sameCandleEntryAllowed")),
            entry_level_pct: numOrNull(pick(r, "entry_level_pct", "entryLevelPct")),
            entryLevelPct: numOrNull(pick(r, "entry_level_pct", "entryLevelPct")),
            edge_revisit_time: String(pick(r, "edge_revisit_time", "edgeRevisitTime") || ""),
            edgeRevisitTime: String(pick(r, "edge_revisit_time", "edgeRevisitTime") || ""),
            trigger_to_entry_minutes: numOrNull(pick(r, "trigger_to_entry_minutes", "triggerToEntryMinutes")),
            triggerToEntryMinutes: numOrNull(pick(r, "trigger_to_entry_minutes", "triggerToEntryMinutes")),
            fill_delay_candles: numOrNull(pick(r, "fill_delay_candles", "fillDelayCandles")),
            fillDelayCandles: numOrNull(pick(r, "fill_delay_candles", "fillDelayCandles")),
            cancelled_before_entry: boolOrNull(pick(r, "cancelled_before_entry", "cancelledBeforeEntry")),
            cancelledBeforeEntry: boolOrNull(pick(r, "cancelled_before_entry", "cancelledBeforeEntry")),
            cancel_reason: String(pick(r, "cancel_reason", "cancelReason") || ""),
            cancelReason: String(pick(r, "cancel_reason", "cancelReason") || ""),
            tapped_before_trigger: boolOrNull(pick(r, "tapped_before_trigger", "tappedBeforeTrigger")),
            tappedBeforeTrigger: boolOrNull(pick(r, "tapped_before_trigger", "tappedBeforeTrigger")),
            tapped_time: String(pick(r, "tapped_time", "tappedTime") || ""),
            tappedTime: String(pick(r, "tapped_time", "tappedTime") || ""),
            tapped_candle_index: numOrNull(pick(r, "tapped_candle_index", "tappedCandleIndex")),
            tappedCandleIndex: numOrNull(pick(r, "tapped_candle_index", "tappedCandleIndex")),
            retrace_cancel_time: String(pick(r, "retrace_cancel_time", "retraceCancelTime") || ""),
            retraceCancelTime: String(pick(r, "retrace_cancel_time", "retraceCancelTime") || ""),
            retrace_cancel_distance_pips: numOrNull(pick(r, "retrace_cancel_distance_pips", "retraceCancelDistancePips")),
            retraceCancelDistancePips: numOrNull(pick(r, "retrace_cancel_distance_pips", "retraceCancelDistancePips")),
            fft_move_away_pips_at_cancel: numOrNull(pick(r, "fft_move_away_pips_at_cancel", "fftMoveAwayPipsAtCancel")),
            fftMoveAwayPipsAtCancel: numOrNull(pick(r, "fft_move_away_pips_at_cancel", "fftMoveAwayPipsAtCancel")),
            // TE delay-window fields (exported by backend, used by FFT Debug layer)
            arm_candle_index: numOrNull(pick(r, "arm_candle_index", "armCandleIndex")),
            armCandleIndex: numOrNull(pick(r, "arm_candle_index", "armCandleIndex")),
            exited_ob_before_arm: boolOrNull(pick(r, "exited_ob_before_arm", "exitedObBeforeArm")),
            exitedObBeforeArm: boolOrNull(pick(r, "exited_ob_before_arm", "exitedObBeforeArm")),
            ob_occupied_at_arm: boolOrNull(pick(r, "ob_occupied_at_arm", "obOccupiedAtArm")),
            obOccupiedAtArm: boolOrNull(pick(r, "ob_occupied_at_arm", "obOccupiedAtArm")),
            armed_after_ob_exit: boolOrNull(pick(r, "armed_after_ob_exit", "armedAfterObExit")),
            armedAfterObExit: boolOrNull(pick(r, "armed_after_ob_exit", "armedAfterObExit")),
            ob_exit_time: String(pick(r, "ob_exit_time", "obExitTime") || ""),
            obExitTime: String(pick(r, "ob_exit_time", "obExitTime") || ""),
            // Deep-delay audit support — explicit TE validity fields (Phase: deep-delay).
            // delay_candles_configured = the CONFIGURED arm (vs realized fill_delay_candles);
            // ob_exit_candle_index = when the OB became spent (pairs with ob_exit_time);
            // retraced_out_before_arm = price left the OB before the arm candle;
            // delay_window_min/max_price = price extent over the configured delay window.
            // All null in pre-instrumentation bundles → load unchanged.
            delay_candles_configured: numOrNull(pick(r, "delay_candles_configured", "delayCandlesConfigured")),
            delayCandlesConfigured: numOrNull(pick(r, "delay_candles_configured", "delayCandlesConfigured")),
            ob_exit_candle_index: numOrNull(pick(r, "ob_exit_candle_index", "obExitCandleIndex")),
            obExitCandleIndex: numOrNull(pick(r, "ob_exit_candle_index", "obExitCandleIndex")),
            retraced_out_before_arm: boolOrNull(pick(r, "retraced_out_before_arm", "retracedOutBeforeArm")),
            retracedOutBeforeArm: boolOrNull(pick(r, "retraced_out_before_arm", "retracedOutBeforeArm")),
            delay_window_min_price: numOrNull(pick(r, "delay_window_min_price", "delayWindowMinPrice")),
            delayWindowMinPrice: numOrNull(pick(r, "delay_window_min_price", "delayWindowMinPrice")),
            delay_window_max_price: numOrNull(pick(r, "delay_window_max_price", "delayWindowMaxPrice")),
            delayWindowMaxPrice: numOrNull(pick(r, "delay_window_max_price", "delayWindowMaxPrice")),
            missed_trade: boolOrNull(pick(r, "missed_trade")),
            missed_reason: String(pick(r, "missed_reason") || ""),
            missed_session: String(pick(r, "missed_session") || ""),
            blocked_session: String(pick(r, "blocked_session") || ""),
            session_filtered_session: String(pick(r, "session_filtered_session") || ""),
            bars_to_fill: numOrNull(pick(r, "bars_to_fill")),
            minutes_to_fill: numOrNull(pick(r, "minutes_to_fill")),
            ob_origin_news_window: originNewsWindow,
            ob_detection_news_window: detectionNewsWindow,
            obOriginNewsWindow: originNewsWindow,
            obDetectionNewsWindow: detectionNewsWindow,
            obCreatedDuringNews: originNewsWindow,
            obDetectedDuringNews: detectionNewsWindow,
            ob_origin_news_event: String(pick(r, "ob_origin_news_event") || ""),
            ob_detection_news_event: String(pick(r, "ob_detection_news_event") || ""),
            obOriginNewsEvent: String(pick(r, "ob_origin_news_event", "obOriginNewsEvent") || ""),
            obDetectionNewsEvent: String(pick(r, "ob_detection_news_event", "obDetectionNewsEvent") || ""),
            ob_origin_news_currency: String(pick(r, "ob_origin_news_currency") || ""),
            ob_detection_news_currency: String(pick(r, "ob_detection_news_currency") || ""),
            obOriginNewsCurrency: String(pick(r, "ob_origin_news_currency", "obOriginNewsCurrency") || ""),
            obDetectionNewsCurrency: String(pick(r, "ob_detection_news_currency", "obDetectionNewsCurrency") || ""),
            ob_origin_news_impact: String(pick(r, "ob_origin_news_impact") || ""),
            ob_detection_news_impact: String(pick(r, "ob_detection_news_impact") || ""),
            obOriginNewsImpact: String(pick(r, "ob_origin_news_impact", "obOriginNewsImpact") || ""),
            obDetectionNewsImpact: String(pick(r, "ob_detection_news_impact", "obDetectionNewsImpact") || ""),
            ob_origin_news_event_time: String(pick(r, "ob_origin_news_event_time") || ""),
            ob_detection_news_event_time: String(pick(r, "ob_detection_news_event_time") || ""),
            obOriginNewsEventTime: String(pick(r, "ob_origin_news_event_time", "obOriginNewsEventTime") || ""),
            obDetectionNewsEventTime: String(pick(r, "ob_detection_news_event_time", "obDetectionNewsEventTime") || ""),
            ob_origin_news_window_start: String(pick(r, "ob_origin_news_window_start") || ""),
            ob_origin_news_window_end: String(pick(r, "ob_origin_news_window_end") || ""),
            ob_detection_news_window_start: String(pick(r, "ob_detection_news_window_start") || ""),
            ob_detection_news_window_end: String(pick(r, "ob_detection_news_window_end") || ""),
            obOriginNewsWindowStart: String(pick(r, "ob_origin_news_window_start", "obOriginNewsWindowStart") || ""),
            obOriginNewsWindowEnd: String(pick(r, "ob_origin_news_window_end", "obOriginNewsWindowEnd") || ""),
            obDetectionNewsWindowStart: String(pick(r, "ob_detection_news_window_start", "obDetectionNewsWindowStart") || ""),
            obDetectionNewsWindowEnd: String(pick(r, "ob_detection_news_window_end", "obDetectionNewsWindowEnd") || ""),
            ob_origin_minutes_from_news: numOrNull(pick(r, "ob_origin_minutes_from_news")),
            ob_detection_minutes_from_news: numOrNull(pick(r, "ob_detection_minutes_from_news")),
            obOriginMinutesFromNews: numOrNull(pick(r, "ob_origin_minutes_from_news", "obOriginMinutesFromNews")),
            obDetectionMinutesFromNews: numOrNull(pick(r, "ob_detection_minutes_from_news", "obDetectionMinutesFromNews")),
            hasNewsCreatedTagFields,
            news_blackout: boolOrNull(pick(r, "news_blackout")),
            news_blackout_trigger_time: String(pick(r, "news_blackout_trigger_time") || ""),
            news_blackout_event_time: String(pick(r, "news_blackout_event_time") || ""),
            news_blackout_currency: String(pick(r, "news_blackout_currency") || ""),
            news_blackout_impact: String(pick(r, "news_blackout_impact") || ""),
            news_blackout_event: String(pick(r, "news_blackout_event") || ""),
            news_blackout_window_start: String(pick(r, "news_blackout_window_start") || ""),
            news_blackout_window_end: String(pick(r, "news_blackout_window_end") || ""),
            news_blackout_minutes_from_event: numOrNull(pick(r, "news_blackout_minutes_from_event")),
            news_action: String(pick(r, "news_action") || ""),
            news_flatten_time: String(pick(r, "news_flatten_time") || ""),
            news_flatten_price: numOrNull(pick(r, "news_flatten_price")),
            news_flatten_r: numOrNull(pick(r, "news_flatten_r")),
            news_flatten_target_time: String(pick(r, "news_flatten_target_time") || ""),
            news_flatten_late: boolOrNull(pick(r, "news_flatten_late")),
            news_flatten_minutes_before_blackout: numOrNull(pick(r, "news_flatten_minutes_before_blackout")),
            // ── Ghost tracking (Phase 0 — observational only) ────────────────────
            // All fields default to null when absent; old bundles load unchanged.
            ghost_candidate: boolOrNull(pick(r, "ghost_candidate", "ghostCandidate")),
            ghostCandidate: boolOrNull(pick(r, "ghost_candidate", "ghostCandidate")),
            ghost_trigger_reached: boolOrNull(pick(r, "ghost_trigger_reached", "ghostTriggerReached")),
            ghostTriggerReached: boolOrNull(pick(r, "ghost_trigger_reached", "ghostTriggerReached")),
            ghost_fill: boolOrNull(pick(r, "ghost_fill", "ghostFill")),
            ghostFill: boolOrNull(pick(r, "ghost_fill", "ghostFill")),
            ghost_outcome: String(pick(r, "ghost_outcome", "ghostOutcome") || ""),
            ghostOutcome: String(pick(r, "ghost_outcome", "ghostOutcome") || ""),
            ghost_r: numOrNull(pick(r, "ghost_r", "ghostR")),
            ghostR: numOrNull(pick(r, "ghost_r", "ghostR")),
            ghost_mae: numOrNull(pick(r, "ghost_mae", "ghostMae")),
            ghostMae: numOrNull(pick(r, "ghost_mae", "ghostMae")),
            ghost_mfe: numOrNull(pick(r, "ghost_mfe", "ghostMfe")),
            ghostMfe: numOrNull(pick(r, "ghost_mfe", "ghostMfe")),
            ghost_fill_delay_candles: numOrNull(pick(r, "ghost_fill_delay_candles", "ghostFillDelayCandles")),
            ghostFillDelayCandles: numOrNull(pick(r, "ghost_fill_delay_candles", "ghostFillDelayCandles")),
            ghost_fill_session: String(pick(r, "ghost_fill_session", "ghostFillSession") || ""),
            ghostFillSession: String(pick(r, "ghost_fill_session", "ghostFillSession") || ""),
        };
    });
}

export function parseNewsEventsCSV(text) {
    const { rows } = parseCSV(text);
    return rows
        .map((r, i) => ({
            id: `NEWS-${String(i + 1).padStart(5, "0")}`,
            time: String(pick(r, "time", "timestamp", "datetime", "date") || ""),
            currency: String(pick(r, "currency", "ccy") || "").toUpperCase(),
            impact: String(pick(r, "impact", "importance") || "").toLowerCase(),
            event: String(pick(r, "event", "name", "title") || ""),
            window_start: String(pick(r, "window_start", "blackout_start", "news_blackout_window_start") || ""),
            window_end: String(pick(r, "window_end", "blackout_end", "news_blackout_window_end") || ""),
            source: String(pick(r, "source") || ""),
            country: String(pick(r, "country") || ""),
        }))
        .filter((event) => event.time && event.currency && event.event);
}

// ─────────────────────── Helpers ───────────────────────

function orderBlockLookupKey(value) {
    if (value == null || value === "") return null;
    const s = String(value).trim();
    if (!s) return null;
    const numeric = s.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : s.toLowerCase();
}

function buildOrderBlockLookup(orderBlocks) {
    const map = new Map();
    orderBlocks.forEach((ob) => {
        const keys = new Set([String(ob.id || "").toLowerCase(), orderBlockLookupKey(ob.id)]);
        keys.forEach((key) => {
            if (key) map.set(key, ob);
        });
    });
    return map;
}

function readPipSize(config, summary) {
    const explicit = pickFrom(config, "pip_size", "pipSize", "pip", "pip_value", "pipValue")
        ?? pickFrom(summary, "pip_size", "pipSize", "pip", "pip_value", "pipValue");
    return isNum(explicit) && Number(explicit) > 0 ? Number(explicit) : null;
}

function enrichTradesWithOrderBlocks(trades, obLookup, pipSize) {
    return trades.map((trade) => {
        const ob = obLookup.get(String(trade.obId || "").toLowerCase()) || obLookup.get(orderBlockLookupKey(trade.obId));
        const explicitWidth = isNum(trade.obWidth) && Number(trade.obWidth) > 0 ? Number(trade.obWidth) : null;
        const computedWidth = ob && pipSize && isNum(ob.top) && isNum(ob.bot)
            ? Number((Math.abs(Number(ob.top) - Number(ob.bot)) / pipSize).toFixed(1))
            : null;
        return {
            ...trade,
            obId: trade.obId ?? ob?.id ?? null,
            obOriginTime: ob?.originTime ?? trade.obOrigin ?? null,
            obDetectionTime: ob?.endTime ?? trade.detected ?? null,
            obOriginIndexRaw: ob?.originIndexRaw ?? null,
            obDetectionIndexRaw: ob?.detectionIndexRaw ?? null,
            obTop: ob && isNum(ob.top) ? Number(ob.top) : null,
            obBottom: ob && isNum(ob.bot) ? Number(ob.bot) : null,
            obWidthPips: explicitWidth ?? computedWidth,
            obDirection: ob?.side === "bear" ? "Bearish" : ob?.side === "bull" ? "Bullish" : null,
            ob_origin_news_window: trade.ob_origin_news_window || ob?.ob_origin_news_window || false,
            ob_detection_news_window: trade.ob_detection_news_window || ob?.ob_detection_news_window || false,
            obOriginNewsWindow: trade.obOriginNewsWindow || ob?.obOriginNewsWindow || false,
            obDetectionNewsWindow: trade.obDetectionNewsWindow || ob?.obDetectionNewsWindow || false,
            obOriginSession: ob?.obOriginSession || trade.obOriginSession || "",
            obDetectionSession: ob?.obDetectionSession || trade.obDetectionSession || "",
            obCreatedDuringNews: trade.obCreatedDuringNews || ob?.obCreatedDuringNews || false,
            obDetectedDuringNews: trade.obDetectedDuringNews || ob?.obDetectedDuringNews || false,
            ob_origin_news_event: trade.ob_origin_news_event || ob?.ob_origin_news_event || "",
            ob_detection_news_event: trade.ob_detection_news_event || ob?.ob_detection_news_event || "",
            obOriginNewsEvent: trade.obOriginNewsEvent || ob?.obOriginNewsEvent || "",
            obDetectionNewsEvent: trade.obDetectionNewsEvent || ob?.obDetectionNewsEvent || "",
            ob_origin_news_currency: trade.ob_origin_news_currency || ob?.ob_origin_news_currency || "",
            ob_detection_news_currency: trade.ob_detection_news_currency || ob?.ob_detection_news_currency || "",
            obOriginNewsCurrency: trade.obOriginNewsCurrency || ob?.obOriginNewsCurrency || "",
            obDetectionNewsCurrency: trade.obDetectionNewsCurrency || ob?.obDetectionNewsCurrency || "",
            ob_origin_news_impact: trade.ob_origin_news_impact || ob?.ob_origin_news_impact || "",
            ob_detection_news_impact: trade.ob_detection_news_impact || ob?.ob_detection_news_impact || "",
            obOriginNewsImpact: trade.obOriginNewsImpact || ob?.obOriginNewsImpact || "",
            obDetectionNewsImpact: trade.obDetectionNewsImpact || ob?.obDetectionNewsImpact || "",
            ob_origin_news_event_time: trade.ob_origin_news_event_time || ob?.ob_origin_news_event_time || "",
            ob_detection_news_event_time: trade.ob_detection_news_event_time || ob?.ob_detection_news_event_time || "",
            obOriginNewsEventTime: trade.obOriginNewsEventTime || ob?.obOriginNewsEventTime || "",
            obDetectionNewsEventTime: trade.obDetectionNewsEventTime || ob?.obDetectionNewsEventTime || "",
            ob_origin_news_window_start: trade.ob_origin_news_window_start || ob?.ob_origin_news_window_start || "",
            ob_origin_news_window_end: trade.ob_origin_news_window_end || ob?.ob_origin_news_window_end || "",
            ob_detection_news_window_start: trade.ob_detection_news_window_start || ob?.ob_detection_news_window_start || "",
            ob_detection_news_window_end: trade.ob_detection_news_window_end || ob?.ob_detection_news_window_end || "",
            obOriginNewsWindowStart: trade.obOriginNewsWindowStart || ob?.obOriginNewsWindowStart || "",
            obOriginNewsWindowEnd: trade.obOriginNewsWindowEnd || ob?.obOriginNewsWindowEnd || "",
            obDetectionNewsWindowStart: trade.obDetectionNewsWindowStart || ob?.obDetectionNewsWindowStart || "",
            obDetectionNewsWindowEnd: trade.obDetectionNewsWindowEnd || ob?.obDetectionNewsWindowEnd || "",
            ob_origin_minutes_from_news: trade.ob_origin_minutes_from_news ?? ob?.ob_origin_minutes_from_news ?? null,
            ob_detection_minutes_from_news: trade.ob_detection_minutes_from_news ?? ob?.ob_detection_minutes_from_news ?? null,
            obOriginMinutesFromNews: trade.obOriginMinutesFromNews ?? ob?.obOriginMinutesFromNews ?? null,
            obDetectionMinutesFromNews: trade.obDetectionMinutesFromNews ?? ob?.obDetectionMinutesFromNews ?? null,
            hasNewsCreatedTagFields: trade.hasNewsCreatedTagFields || ob?.hasNewsCreatedTagFields || false,
        };
    });
}

function computeEquityCurve(trades) {
    let cum = 0;
    return trades.map((t, i) => {
        cum += Number(t.r) || 0;
        const ref = t.entry ? new Date(t.entry) : new Date(Date.now() - (trades.length - i) * 86400000);
        return {
            i,
            date: isFinite(ref.getTime()) ? ref.toISOString().slice(0, 10) : "",
            label: isFinite(ref.getTime()) ? ref.toLocaleString("en", { month: "short", year: "2-digit" }) : "",
            netR: Number(cum.toFixed(2)),
        };
    });
}

function computeTradeMarkers(trades, candleIdx) {
    return trades.map((t, idx) => {
        const mapped = candleIdx ? timeToCandleIndex(t.entry, candleIdx) : { i: -1, quality: "missing", time: null };
        return {
            i: mapped.i >= 0 ? mapped.i : idx * Math.max(1, Math.floor(220 / Math.max(1, trades.length))),
            time: mapped.time,
            mappingQuality: mapped.quality,
            price: t.entryPrice,
            direction: t.direction,
            win: t.outcome === "Win",
            id: t.id,
        };
    });
}

// Build a fast index lookup from a candle array.
function buildCandleIndex(candles) {
    const byTime = new Map();
    const ordered = [];
    candles.forEach((c, i) => {
        const time = c.time ?? normalizeTimestamp(c.t);
        if (time == null) return;
        byTime.set(time, i);
        ordered.push({ time, i });
    });
    ordered.sort((a, b) => a.time - b.time);
    const gaps = [];
    for (let i = 1; i < ordered.length; i++) {
        const gap = ordered[i].time - ordered[i - 1].time;
        if (gap > 0) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3600;
    return { byTime, ordered, toleranceSec: Math.max(3600, Math.floor(medianGap * 1.5)) };
}

function timeToCandleIndex(time, idx) {
    const target = normalizeTimestamp(time);
    if (target == null || !idx) return { i: -1, quality: "missing", time: null };
    if (idx.byTime.has(target)) {
        const i = idx.byTime.get(target);
        return { i, quality: "exact", time: idx.ordered.find((c) => c.i === i)?.time ?? target };
    }
    let lo = 0;
    let hi = idx.ordered.length - 1;
    let best = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (idx.ordered[mid].time <= target) {
            best = idx.ordered[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (best && target - best.time <= idx.toleranceSec) {
        return { i: best.i, quality: "nearest_prior", time: best.time };
    }
    return { i: -1, quality: "missing", time: null };
}

function protectedTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(/^trades_(single_position|allow_multi_position|one_per_direction)__(.+)\.csv$/);
    if (!m) return null;
    return {
        baseVariant: m[1],
        mode: normalizeProtectionModeKey(m[2]),
    };
}

function entryTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(/^trades_(single_position|allow_multi_position|one_per_direction)__(entry_.+)\.csv$/);
    if (!m) return null;
    return {
        baseVariant: m[1],
        mode: normalizeEntryModeKey(m[2]),
    };
}

// ── Fair Baseline comparison output (Session-First P2 → P2.5) ────────────────────
// Backend emits ONE sibling CSV per execution mode:
//   trades_{execution_mode}__scenario_baseline.csv
// It is the fair-baseline trade output for the SAME eligible cohort universe as the
// custom session-first scenario (baseline entry + uniform baseline TP/BE). It MUST
// be detected BEFORE the generic protectedTradeFileInfo catch-all — its "__scenario
// _baseline" suffix matches the protected `(.+)` group and would otherwise be folded
// into protectionTradesByMode and pollute the custom universe (P2.5 audit risk #1).
function scenarioBaselineTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(/^trades_(single_position|allow_multi_position|one_per_direction)__scenario_baseline\.csv$/);
    if (!m) return null;
    return { executionMode: m[1] };
}

// ─────────────────────── Break-even (BE) Exact Replay file parser ───────────────────────
// Matches backend BE Exact Replay output (BE-FRONTEND-INTEGRATION Phase B):
//   trades_{execution_mode}__be_{trigger}_{arm}R.csv
// Examples:
//   trades_single_position__be_wick_0p50R.csv  → wick trigger, arm 0.5R
//   trades_single_position__be_close_1p00R.csv → close trigger, arm 1.0R
//   trades_allow_multi_position__be_wick_0p75R.csv
// The scenario key (e.g. "be_wick_0p50R") is preserved in the backend's canonical
// form so it matches the summary.json `be_results[execution_mode]` keys 1:1.
// MUST be detected BEFORE protectedTradeFileInfo, whose `(.+)` suffix would
// otherwise swallow BE files into protectionTradesByMode (Phase 0 audit risk #1).
export function beTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop();
    // Variant-aware (P2): an optional entry-variant key may sit between the
    // execution mode and the be_ segment:
    //   trades_{mode}__be_wick_0p50R.csv                         → baseline
    //   trades_{mode}__{entry_variant_key}__be_wick_0p50R.csv    → variant
    // The be_ segment never starts an entry key, so the non-greedy optional
    // group can't swallow it.
    const m = file.match(
        /^trades_(single_position|allow_multi_position|one_per_direction)__(?:(.+?)__)?(be_(wick|close)_(\d+)p(\d+)R?)\.csv$/i
    );
    if (!m) return null;
    const armLevelR = Number(`${parseInt(m[5], 10)}.${m[6]}`);
    return {
        executionMode: m[1].toLowerCase(),
        entryVariantKey: m[2] ? m[2].toLowerCase() : "baseline",  // old shape ⇒ baseline
        scenarioKey: m[3],                 // canonical backend form, e.g. "be_wick_0p50R"
        triggerBasis: m[4].toLowerCase(),  // "wick" | "close"
        armLevelR: Number.isFinite(armLevelR) ? armLevelR : null,
    };
}

// Normalise summary.json `be_results` into the canonical nested shape
//   beResults[executionMode][entryVariantKey][beScenarioKey] = summary
// Accepts BOTH backend shapes (BE-FRONTEND-INTEGRATION P2):
//   • old flat  : be_results[mode][beKey]            → nested under "baseline"
//   • new nested: be_results[mode][entryKey][beKey]  → kept as-is
// A be-scenario key (be_wick_…/be_close_…) at the entry level marks the flat
// shape; anything else is treated as an entry-variant key. Raw summary objects
// are preserved untouched. Old bundles therefore keep working unchanged.
export function normalizeBeResults(raw) {
    if (!raw || typeof raw !== "object") return {};
    const isBeKey = (k) => /^be_(wick|close)_/i.test(k);
    const out = {};
    for (const [mode, byKey] of Object.entries(raw)) {
        if (!byKey || typeof byKey !== "object") continue;
        out[mode] = out[mode] || {};
        for (const [k, v] of Object.entries(byKey)) {
            if (isBeKey(k)) {
                // Flat (legacy) baseline summary → nest under "baseline".
                out[mode].baseline = out[mode].baseline || {};
                out[mode].baseline[k] = v;
            } else {
                // Already nested: k is an entry-variant key, v is {beKey: summary}.
                out[mode][k] = v;
            }
        }
    }
    return out;
}

// ─────────────────────── Control file parser ───────────────────────
// Matches auto-paired FFT-OFF control output (AUTO-PAIR-CONTROL-RUNS):
//   trades_{execution_mode}__{scenario_key}__control.csv
// Example:
//   trades_single_position__entry_triggered_edge_25p0_d3__control.csv
//     → executionMode: "single_position"
//     → scenarioKey:   "entry_triggered_edge_25p0_d3"
// The scenario_key is the PARENT entry key (the "__control" suffix lives only in
// the filename, never in the trade rows), so it is normalized with the same
// canonicaliser as entry keys to stay matchable by the pairing analytics.
function controlTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(
        /^trades_(single_position|allow_multi_position|one_per_direction)__(.+)__control\.csv$/
    );
    if (!m) return null;
    return {
        executionMode: m[1],
        scenarioKey: normalizeEntryModeKey(m[2]),
    };
}

// ─────────────────────── Directional file parser ───────────────────────
// Matches Phase 3C output: trades_{variant}__dir_long_{longKey}__short_{shortKey}.csv
// Examples:
//   trades_one_per_direction__dir_long_te25_d2__short_te25_next.csv
//   trades_allow_multi_position__dir_long_baseline__short_baseline.csv

export function directionalTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(
        /^trades_(single_position|allow_multi_position|one_per_direction)__(dir_long_(.+?)__short_(.+?))\.csv$/
    );
    if (!m) return null;
    return {
        isDirectional: true,
        executionMode: m[1],
        scenarioId: m[2],       // "dir_long_te25_d2__short_te25_next"
        longKey: m[3],          // "te25_d2"
        shortKey: m[4],         // "te25_next"
    };
}

function normalizeProtectionModeKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^trades_(single_position|allow_multi_position|one_per_direction)__/, "")
        .replace(/\.csv$/, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function normalizeEntryModeKey(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^trades_(single_position|allow_multi_position|one_per_direction)__/, "")
        .replace(/\.csv$/, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized
        // Penetration: integer threshold → canonical p-form (e.g. 25 → 25p0).
        .replace(/^entry_penetration_(\d+)$/, "entry_penetration_$1p0")
        // Triggered Edge: integer threshold → canonical p-form, preserving the
        // optional _same/_next/_d2/_d3 fill-mode suffix so the resolver's canonical
        // keys (entry_triggered_edge_25p0[_same|_next|_d2|_d3]) match. Already-p-form
        // keys (e.g. 25p0, 25p0_next, 25p0_d2) don't match \d+ here and pass through.
        .replace(/^entry_triggered_edge_(\d+)(_same|_next|_d\d+)?$/, "entry_triggered_edge_$1p0$2");
}

function newsDateRange(events) {
    const sorted = (events || [])
        .map((event) => normalizeTimestamp(event.time))
        .filter((time) => time != null)
        .sort((a, b) => a - b);
    if (!sorted.length) return "News calendar";
    return `${new Date(sorted[0] * 1000).toISOString().slice(0, 10)} → ${new Date(sorted[sorted.length - 1] * 1000).toISOString().slice(0, 10)}`;
}

export function detectFileKind(name) {
    const n = name.toLowerCase();
    if (n.endsWith(".json")) {
        if (n.includes("config")) return "config";
        if (n.includes("summary")) return "summary";
        return "json_unknown";
    }
    if (n.endsWith(".csv")) {
        // Auto-paired FFT-OFF control trades MUST be matched before the generic
        // entry / protected / variant trade checks below. Their filenames contain
        // "entry_..." and "trades_single_position", so without this guard they
        // would be misclassified (trades_entry / trades_single_position) and
        // silently overwrite the real entry/variant trades for that key.
        if (controlTradeFileInfo(name))                      return "trades_control";
        if (n.includes("candle"))                            return "candles";
        // BE Exact Replay files MUST be matched before the generic protected
        // catch-all below — their suffix (be_wick_0p50R) would otherwise be
        // swallowed into protectionTradesByMode (Phase 0 audit risk #1).
        if (beTradeFileInfo(name))                            return "trades_be";
        if (entryTradeFileInfo(name))                         return "trades_entry";
        if (directionalTradeFileInfo(name))                   return "trades_directional";
        // Fair Baseline (P2.5) MUST precede the generic protected catch-all below —
        // "trades_<mode>__scenario_baseline.csv" matches protectedTradeFileInfo's
        // `(.+)` group and would otherwise be swallowed into protectionTradesByMode.
        if (scenarioBaselineTradeFileInfo(name))              return "trades_scenario_baseline";
        if (protectedTradeFileInfo(name))                     return "trades_protected";
        // OB Retest backend artifacts (Phase 2.4). MUST precede the order_blocks
        // catch below — "ob_retests.csv" / "ob_retest_summary.csv" both match the
        // generic `ob_` test and would otherwise be misclassified as order_blocks.
        if (n.includes("ob_retest_summary"))                  return "ob_retest_summary";
        if (n.includes("ob_retests"))                         return "ob_retest";
        // Aggregate / sample / sanity OB artifacts (Phase-0 namespacing now writes
        // these into the run folder). They are NOT per-order-block tables and
        // legitimately have no id/ob_id column (e.g. ob_by_year.csv = yearly counts).
        // MUST precede the generic `ob_` catch below, otherwise they're classified
        // as order_blocks and rejected with "missing id/ob_id" on import. They are
        // informational only → benign kind that falls through to `unrecognized`.
        if (n.includes("ob_by_year") || n.includes("ob_sample")
            || n.includes("ob_sanity") || n.includes("ob_width"))  return "ob_aux";
        if (n.includes("order_block") || n.includes("ob_"))  return "order_blocks";
        if (n.includes("trades_single_position"))            return "trades_single_position";
        if (n.includes("trades_allow_multi_position"))       return "trades_allow_multi_position";
        if (n.includes("trades_one_per_direction"))          return "trades_one_per_direction";
        if (n.includes("trade"))                             return "trades_unknown";
        if (isNewsCalendarFile(n))                           return "news_events";
        if (n.includes("mismatch") || n.includes("parity"))  return "mismatches";
        if (n.includes("rr_sweep"))                          return "rr_sweep";
    }
    return "unknown";
}

// ── Fair Baseline comparison universe selector (Session-First P2.5) ─────────────
// PURE: derive the read-only Fair Baseline universe from a bundle's
// scenarioBaselineResults. Lives here (not store.js) so it stays importable by the
// validation harness and reuses the canonical classifier. store.js's
// getScenarioBaselineUniverse(runId) is a thin wrapper that resolves the bundle then
// calls this. Never reads/affects the custom universe. Old runs → available:false.
export function selectScenarioBaselineUniverse(bundle) {
    const results = bundle?.scenarioBaselineResults || null;
    const byMode = results?.tradesByMode || {};
    const provenance = (results?.summary && typeof results.summary === "object") ? results.summary : {};
    const warnings = Array.isArray(provenance.warnings) ? provenance.warnings : [];
    // Prefer the run's primary variant's mode; else the first emitted mode.
    const modes = Object.keys(byMode);
    const preferred = bundle?.primaryVariant && Array.isArray(byMode[bundle.primaryVariant])
        ? bundle.primaryVariant
        : (modes[0] || null);
    const trades = preferred && Array.isArray(byMode[preferred]) ? byMode[preferred] : [];
    const available = trades.length > 0;
    const sourceFile = (results?.sourceFiles || []).find((sf) => sf.mode === preferred)?.name
        || (results?.sourceFiles || [])[0]?.name
        || null;
    return {
        available,
        executionMode: preferred,
        trades,
        // Same canonical classifier the custom universe uses → apples-to-apples KPIs.
        stats: summarizeTradeClassifications(trades),
        provenance,
        warnings,
        sourceFile,
    };
}

// ─────────────────────── Large-run guardrail (LARGE-RUN-IMPORT Phase 1) ──────
// Cube-scale bundles (100s of CSVs, multi-million-row candles, 100s of BE files)
// cannot be eagerly parsed in the browser without OOM. assessBundleSize() flags
// such bundles from the file list ALONE (sizes, no reads); ingestRunBundle() then
// indexes metadata only and defers candles/BE/variant rows to lazy on-demand
// loads. Small bundles are untouched.
export const LARGE_BUNDLE_THRESHOLDS = {
    fileCount: 50,
    totalBytes: 150 * 1024 * 1024,   // 150 MB
    beFileCount: 50,
    candlesBytes: 25 * 1024 * 1024,  // 25 MB
};

// LAZY-DISABLE — the automatic large-bundle → lazy/index-only import path is OFF by
// default. Cube-scale lazy imports caused repeated run/data-identity regressions and
// the user is no longer on the cube workflow, so normal imports must be eager and
// deterministic. assessBundleSize() still reports `isLarge` (banner/diagnostics keep
// working) but it NO LONGER triggers a lazy import unless this flag is true. The lazy
// machinery stays dormant behind this flag + the explicit `forceLazy` caller option,
// so a future cube-only mode can opt back in without a rewrite.
export const ENABLE_LAZY_IMPORT = false;

const baseName = (name) => String(name || "").split(/[\\/]/).pop();

// LARGE-RUN-IMPORT Phase 1B — recover the SOURCE run-folder name from a folder
// picker. webkitdirectory sets webkitRelativePath = "<runFolder>/config.json",
// whose first segment is the real sidecar/output folder id (e.g.
// 20260613_162437_EURUSD_15min_RR3.3_SB1). Browsers never expose an absolute
// path, so we keep only the folder NAME — the sidecar resolves it under
// outputs/runs. Returns "" for drag-drop of loose files (no relative path).
export function extractSourceRunFolderName(fileList) {
    for (const f of Array.from(fileList || [])) {
        const rel = String(f?.webkitRelativePath || f?.relativePath || "").replace(/\\/g, "/");
        if (rel.includes("/")) {
            const first = rel.split("/").filter(Boolean)[0];
            if (first) return first;
        }
    }
    return "";
}

export function assessBundleSize(fileList, thresholds = LARGE_BUNDLE_THRESHOLDS) {
    const files = Array.from(fileList || []);
    let totalBytes = 0;
    let beFileCount = 0;
    let candlesBytes = 0;
    let candlesPresent = false;
    for (const f of files) {
        const size = Number(f?.size) || 0;  // sidecar pseudo-files have no size → 0
        totalBytes += size;
        const name = baseName(f?.name);
        const kind = detectFileKind(name);
        if (kind === "trades_be") beFileCount += 1;
        if (kind === "candles") { candlesPresent = true; candlesBytes += size; }
    }
    const reasons = [];
    if (files.length > thresholds.fileCount) reasons.push(`file count ${files.length} > ${thresholds.fileCount}`);
    if (totalBytes > thresholds.totalBytes) reasons.push(`total ${(totalBytes / 1048576).toFixed(0)}MB > ${(thresholds.totalBytes / 1048576).toFixed(0)}MB`);
    if (beFileCount > thresholds.beFileCount) reasons.push(`BE files ${beFileCount} > ${thresholds.beFileCount}`);
    if (candlesBytes > thresholds.candlesBytes) reasons.push(`candles ${(candlesBytes / 1048576).toFixed(0)}MB > ${(thresholds.candlesBytes / 1048576).toFixed(0)}MB`);
    return { isLarge: reasons.length > 0, fileCount: files.length, totalBytes, beFileCount, candlesPresent, candlesBytes, reasons };
}

// Kinds parsed eagerly even on the large-run path (small, required for a usable
// run shell + BE summaries). Everything else is indexed and lazy-loaded.
const LAZY_EAGER_KINDS = new Set([
    "config", "summary", "order_blocks",
    "trades_single_position", "trades_allow_multi_position", "trades_one_per_direction", "trades_unknown",
    // Fair Baseline is one tiny CSV per mode — parse it eagerly even on the lazy path
    // so the Run Workspace comparison is available without an on-demand fetch.
    "trades_scenario_baseline",
]);

function isNewsCalendarFile(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    return file === "master_economic_calendar_2020_present.csv"
        || file === "economic_calendar.csv"
        || file === "news.csv"
        || (file.includes("calendar") && file.endsWith(".csv"))
        || (file.includes("news") && file.endsWith(".csv"));
}

function checkStatus(ok, missingValue = false) {
    if (missingValue) return "WARNING";
    return ok ? "PASS" : "FAIL";
}

function buildIntegrity({ collected, primaryTrades, netR, primaryVariant }) {
    const sm = collected.summary || {};
    const cfg = collected.config || {};
    const summaryTradeCount = numOrNull(pickFrom(sm, "trades", "tradeCount", "trade_count", "total_trades", "n_trades"));
    const summaryNetR = numOrNull(pickFrom(sm, "net_r", "netR"));
    const summaryObCount = numOrNull(pickFrom(sm, "obCount", "ob_count", "orderBlockCount", "order_block_count", "order_blocks_count", "order_blocks", "obs", "total_obs"));
    const parityValue = numOrNull(pickFrom(sm, "parity", "parity_score", "validation", "validation_score") ?? pickFrom(cfg, "parity", "parity_score", "validation", "validation_score"));
    const missingRequired = [];
    if (!collected.config) missingRequired.push("config.json");
    if (!collected.summary) missingRequired.push("summary.json");
    if (!collected.orderBlocks) missingRequired.push("order_blocks.csv");
    if (!Object.keys(collected.tradesByVariant).length) missingRequired.push("trades_*.csv");

    const netRTolerance = 0.01;
    const checks = {
        tradeCount: {
            status: checkStatus(summaryTradeCount === primaryTrades.length, summaryTradeCount == null),
            summary: summaryTradeCount,
            parsed: primaryTrades.length,
            variant: primaryVariant,
        },
        netR: {
            status: checkStatus(summaryNetR != null && Math.abs(summaryNetR - netR) <= netRTolerance, summaryNetR == null),
            summary: summaryNetR,
            computed: Number(netR.toFixed(4)),
            tolerance: netRTolerance,
        },
        obCount: {
            status: checkStatus(summaryObCount === collected.orderBlocks.length, summaryObCount == null),
            summary: summaryObCount,
            parsed: collected.orderBlocks.length,
        },
        requiredFiles: {
            status: missingRequired.length ? "FAIL" : "PASS",
            missing: missingRequired,
            present: collected.recognized.map((f) => f.name),
        },
        candles: {
            status: collected.candles?.length ? "PASS" : "WARNING",
            imported: !!collected.candles?.length,
            count: collected.candles?.length || 0,
            droppedForStorage: false,
        },
        parity: {
            status: parityValue == null ? "WARNING" : "PASS",
            available: parityValue != null,
            value: parityValue,
        },
    };
    const statuses = Object.values(checks).map((c) => c.status);
    return {
        status: statuses.includes("FAIL") ? "FAIL" : statuses.includes("WARNING") ? "WARNING" : "PASS",
        checks,
    };
}

// ─────────────────────── Bundle ingestion ───────────────────────

// LARGE-RUN-IMPORT Phase 1 — parse + enrich ONE BE scenario CSV on demand, using
// the same parseTradesCSV + OB enrichment as the eager path so lazily-loaded BE
// rows are byte-shape-identical to eagerly-loaded ones. Pure; no store/React.
export function enrichBeTradeRowsLazy(csvText, { orderBlocks, config, summary } = {}) {
    const trades = parseTradesCSV(String(csvText || ""));
    const obLookup = buildOrderBlockLookup(orderBlocks || []);
    const pipSize = readPipSize(config || {}, summary || {});
    return enrichTradesWithOrderBlocks(trades, obLookup, pipSize);
}

// LARGE-RUN-IMPORT Phase 2B — parse an ENTRY-variant CSV name into a UI-listable
// scenario descriptor (threshold + delay/fill-mode + label + sourceFile), so a
// lazy run can expose the FULL triggered-edge universe before rows load. Returns
// null for base/BE/candles. Pure.
export function parseEntryFilename(fileName) {
    const info = entryTradeFileInfo(fileName);
    if (!info) return null;
    const mode = info.mode; // e.g. entry_triggered_edge_25p0_d3
    const m = /^entry_triggered_edge_(\d+)p(\d+)(?:_(same|next|d\d+))?$/i.exec(mode);
    const threshold = m ? Number(`${parseInt(m[1], 10)}.${m[2]}`) : null;
    const fillMode = m ? (m[3] || "both").toLowerCase() : null;
    const fillLabel = fillMode === "same" ? "C0 (same)"
        : fillMode === "next" ? "C1 (next)"
        : (typeof fillMode === "string" && fillMode.startsWith("d")) ? fillMode.toUpperCase()
        : "both";
    return {
        name: baseName(fileName),
        type: "entry",
        executionMode: info.baseVariant,
        entryVariantKey: mode,
        sourceFile: baseName(fileName),
        threshold,
        fillMode,
        label: threshold != null ? `TE ${Math.round(threshold)}% ${fillLabel}` : mode,
    };
}

// LARGE-RUN-IMPORT Phase 2 — storage keys for a lazily-loaded ENTRY variant CSV,
// mirroring the eager handler so lazy rows land under the SAME keys the resolver
// reads (`entryResults.tradesByMode[mode]` and `[baseVariant__mode]`). Returns
// null for non-entry files (base/BE/candles). Pure; testable in isolation.
export function entryVariantStorageKeys(fileName) {
    const info = entryTradeFileInfo(fileName);
    if (!info) return null;
    const mode = info.mode;
    return { baseVariant: info.baseVariant, mode, keys: [`${info.baseVariant}__${mode}`, mode] };
}

export async function ingestRunBundle(fileList, options = {}) {
    const files = Array.from(fileList);
    // LARGE-RUN-IMPORT Phase 1 — detect cube-scale bundles from sizes alone and
    // switch to a metadata-only ("lazy") import that never eager-parses candles
    // or BE/variant rows. `forceLazy`/`forceEager` allow tests + callers to pin it.
    const sizeInfo = assessBundleSize(files);
    // LAZY-DISABLE — auto-lazy (size threshold) is gated behind ENABLE_LAZY_IMPORT
    // (default false). `forceLazy` remains an EXPLICIT opt-in for a future cube-only
    // path; `forceEager` always wins. With the flag off, no normal run imports lazy.
    const autoLazy = ENABLE_LAZY_IMPORT && sizeInfo.isLarge;
    const lazy = options.forceEager ? false : (options.forceLazy || autoLazy);
    // Phase 1B — source run-folder identity (for sidecar reload of lazy runs).
    const sourceRunFolderName = options.sourceRunFolderName || extractSourceRunFolderName(files);
    const collected = {
        lazy,
        sizeInfo,
        manifest: null,
        sourceRunFolderName,
        // Lazy index (no rows): BE scenario files + raw File handles for on-demand reads.
        beScenarioIndex: [],
        entryScenarioIndex: [],
        candlesMeta: null,
        deferredFiles: [],          // { name, kind, size } recorded but not parsed
        lazyFileHandles: new Map(), // name → File/pseudo-file for lazy reads (NOT persisted)
        config: null, summary: null, orderBlocks: null, candles: null,
        obRetests: null, obRetestSummary: null,
        tradesByVariant: {},
        entryTradesByMode: {},
        entrySourceFiles: [],
        controlTradesByScenario: {},
        controlSourceFiles: [],
        protectionTradesByMode: {},
        protectionSourceFiles: [],
        // Fair Baseline comparison (P2.5). Keyed by execution mode, kept ENTIRELY
        // separate from the custom universe (tradesByVariant / entry / protection).
        scenarioBaselineTradesByMode: {},
        scenarioBaselineSourceFiles: [],
        // BE Exact Replay (BE-FRONTEND-INTEGRATION). Nested by execution mode →
        // scenario key, kept entirely separate from protection.
        beTradesByMode: {},
        beSourceFiles: [],
        directionalTradesByScenario: {},
        directionalScenarioMeta: {},
        directionalSourceFiles: [],
        newsEvents: [],
        newsSourceFiles: [],
        readErrors: [],
        validationErrors: [],
        validationWarnings: [],
        recognized: [],
        unrecognized: [],
    };

    for (const f of files) {
        const kind = detectFileKind(f.name);
        // Phase 1B — manifest.json (tiny) carries the backend run_id; parse it on
        // BOTH paths so reload identity survives even when summary lacks an id.
        if (baseName(f.name).toLowerCase() === "manifest.json") {
            try {
                collected.manifest = JSON.parse(await f.text());
                collected.recognized.push({ name: f.name, kind: "manifest" });
            } catch (e) {
                collected.readErrors.push({ name: f.name, error: String(e.message || e) });
            }
            continue;
        }
        // ── Large-run path: index heavy artifacts, never read their bytes ──────
        // candles.csv (millions of rows) + 100s of BE/variant CSVs are the OOM
        // source. On the lazy path we record only filename metadata + a File
        // handle for later on-demand parsing, and skip the eager read entirely.
        if (collected.lazy && !LAZY_EAGER_KINDS.has(kind)) {
            const size = Number(f?.size) || null;
            collected.lazyFileHandles.set(f.name, f);
            if (kind === "candles") {
                collected.candlesMeta = { name: f.name, size };
            } else if (kind === "trades_be") {
                const info = beTradeFileInfo(f.name) || {};
                collected.beScenarioIndex.push({
                    name: f.name,
                    executionMode: info.executionMode ?? null,
                    entryVariantKey: info.entryVariantKey ?? null,
                    scenarioKey: info.scenarioKey ?? null,
                    triggerBasis: info.triggerBasis ?? null,
                    armLevelR: info.armLevelR ?? null,
                    size,
                });
            } else {
                collected.deferredFiles.push({ name: f.name, kind, size });
                // Phase 2B — index entry-variant files so the full TE universe is
                // listable + lazily selectable before any rows are parsed.
                if (kind === "trades_entry") {
                    const desc = parseEntryFilename(f.name);
                    if (desc) collected.entryScenarioIndex.push({ ...desc, size });
                }
            }
            collected.recognized.push({ name: f.name, kind, deferred: true, size });
            continue;
        }
        let text;
        try { text = await f.text(); } catch (e) {
            collected.readErrors.push({ name: f.name, error: String(e.message || e) });
            continue;
        }
        try {
            switch (kind) {
                case "config":
                    collected.config = JSON.parse(text);
                    validateJsonObject(collected.config, f.name, kind, collected.validationErrors);
                    validateJsonWarnings(collected.config, f.name, kind, collected.validationWarnings);
                    collected.recognized.push({ name: f.name, kind });
                    break;
                case "summary":
                    collected.summary = JSON.parse(text);
                    validateJsonObject(collected.summary, f.name, kind, collected.validationErrors);
                    validateJsonWarnings(collected.summary, f.name, kind, collected.validationWarnings);
                    collected.recognized.push({ name: f.name, kind });
                    break;
                case "candles": {
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    collected.candles = parseCandlesCSV(text);
                    collected.recognized.push({ name: f.name, kind, rows: collected.candles.length });
                    break;
                }
                case "order_blocks": {
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    collected.orderBlocks = parseOrderBlocksCSV(text);
                    collected.recognized.push({ name: f.name, kind, rows: collected.orderBlocks.length });
                    break;
                }
                case "ob_retest": {
                    // Backend-verified retest events (Phase 2.4). Optional artifact;
                    // absence simply leaves the frontend derivation in charge.
                    collected.obRetests = parseObRetestsCSV(text);
                    collected.recognized.push({ name: f.name, kind, rows: collected.obRetests.length });
                    break;
                }
                case "ob_retest_summary": {
                    collected.obRetestSummary = parseObRetestSummaryCSV(text);
                    collected.recognized.push({ name: f.name, kind, rows: collected.obRetestSummary.length });
                    break;
                }
                case "news_events": {
                    const events = parseNewsEventsCSV(text);
                    collected.newsEvents = [...collected.newsEvents, ...events];
                    collected.newsSourceFiles.push({ name: f.name, kind, rows: events.length });
                    collected.recognized.push({ name: f.name, kind, rows: events.length });
                    break;
                }
                case "trades_single_position":
                case "trades_allow_multi_position":
                case "trades_one_per_direction":
                case "trades_unknown": {
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const variantKey = kind.replace(/^trades_/, "");
                    collected.tradesByVariant[variantKey] = t;
                    collected.recognized.push({ name: f.name, kind, rows: t.length });
                    break;
                }
                case "trades_protected": {
                    const info = protectedTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const mode = normalizeProtectionModeKey(info.mode || t[0]?.protection_mode);
                    collected.protectionTradesByMode[mode] = t;
                    collected.protectionSourceFiles.push({ name: f.name, kind, mode, baseVariant: info.baseVariant, rows: t.length });
                    collected.recognized.push({ name: f.name, kind, mode, baseVariant: info.baseVariant, rows: t.length });
                    break;
                }
                case "trades_scenario_baseline": {
                    // Fair Baseline comparison rows (P2.5). Routed into a DEDICATED
                    // scenarioBaselineTradesByMode[executionMode] map — NEVER into
                    // tradesByVariant / entryTradesByMode / protectionTradesByMode, so
                    // the custom universe stays byte-identical.
                    const info = scenarioBaselineTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const mode = info.executionMode;
                    collected.scenarioBaselineTradesByMode[mode] = t;
                    collected.scenarioBaselineSourceFiles.push({ name: f.name, kind, mode, rows: t.length });
                    collected.recognized.push({ name: f.name, kind, mode, rows: t.length });
                    break;
                }
                case "trades_be": {
                    // BE Exact Replay scenario trades. Routed into a nested
                    // beTradesByMode[executionMode][entryVariantKey][scenarioKey]
                    // map — NEVER into primary trades or protectionTradesByMode.
                    // Old-shape files (no entry token) land under "baseline".
                    const info = beTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const em = info.executionMode;
                    const evk = info.entryVariantKey;
                    if (!collected.beTradesByMode[em]) collected.beTradesByMode[em] = {};
                    if (!collected.beTradesByMode[em][evk]) collected.beTradesByMode[em][evk] = {};
                    collected.beTradesByMode[em][evk][info.scenarioKey] = t;
                    collected.beSourceFiles.push({
                        name: f.name, kind, executionMode: em, entryVariantKey: evk, scenarioKey: info.scenarioKey,
                        triggerBasis: info.triggerBasis, armLevelR: info.armLevelR, rows: t.length,
                    });
                    collected.recognized.push({
                        name: f.name, kind, executionMode: em, entryVariantKey: evk, scenarioKey: info.scenarioKey, rows: t.length,
                    });
                    break;
                }
                case "trades_entry": {
                    const info = entryTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const mode = normalizeEntryModeKey(info.mode || t[0]?.entry_model);
                    collected.entryTradesByMode[`${info.baseVariant}__${mode}`] = t;
                    if (!collected.entryTradesByMode[mode] || info.baseVariant === "single_position") {
                        collected.entryTradesByMode[mode] = t;
                    }
                    collected.entrySourceFiles.push({ name: f.name, kind, mode, baseVariant: info.baseVariant, rows: t.length });
                    collected.recognized.push({ name: f.name, kind, mode, baseVariant: info.baseVariant, rows: t.length });
                    break;
                }
                case "trades_directional": {
                    const info = directionalTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const { scenarioId, longKey, shortKey, executionMode } = info;
                    const storageKey = `${executionMode}__${scenarioId}`;
                    // Annotate each trade row with directional metadata
                    const annotated = t.map((trade) => ({
                        ...trade,
                        isDirectional: true,
                        directionalScenarioId: scenarioId,
                        directionalLongKey: longKey,
                        directionalShortKey: shortKey,
                        directionalExecutionMode: executionMode,
                    }));
                    collected.directionalTradesByScenario[storageKey] = annotated;
                    collected.directionalScenarioMeta[storageKey] = { scenarioId, longKey, shortKey, executionMode, isDirectional: true };
                    collected.directionalSourceFiles.push({ name: f.name, kind, scenarioId, executionMode, longKey, shortKey, rows: t.length });
                    collected.recognized.push({ name: f.name, kind, scenarioId, executionMode, rows: t.length });
                    console.log(`[importer] Directional scenario detected: ${scenarioId} (${executionMode}) — ${t.length} rows`);
                    break;
                }
                case "trades_control": {
                    const info = controlTradeFileInfo(f.name);
                    const parsed = parseCSV(text);
                    validateCsvHeaders(kind, f.name, parsed.headers, collected.validationErrors, collected.validationWarnings);
                    const t = parseTradesCSV(text);
                    const { executionMode, scenarioKey } = info;
                    // Keyed by "{execution_mode}:{scenario_key}" so the pairing
                    // resolver can look up the FFT-OFF counterpart for the active
                    // variant + scenario without any manual run selection.
                    const storageKey = `${executionMode}:${scenarioKey}`;
                    collected.controlTradesByScenario[storageKey] = t;
                    collected.controlSourceFiles.push({ name: f.name, kind, executionMode, scenarioKey, rows: t.length });
                    collected.recognized.push({ name: f.name, kind, executionMode, scenarioKey, rows: t.length });
                    console.log(`[importer] FFT control scenario detected: ${storageKey} — ${t.length} rows`);
                    break;
                }
                default:
                    collected.unrecognized.push({ name: f.name, kind });
            }
        } catch (e) {
            collected.readErrors.push({ name: f.name, error: String(e.message || e) });
            collected.validationErrors.push({ severity: "error", file: f.name, kind, field: "parse", message: `${f.name} could not be parsed: ${e.message || e}` });
        }
    }

    // Validate required artifacts
    const missing = [];
    if (!collected.config)                            missing.push("config.json");
    if (!collected.summary)                           missing.push("summary.json");
    if (!collected.orderBlocks)                       missing.push("order_blocks.csv");
    if (!Object.keys(collected.tradesByVariant).length) missing.push("trades_*.csv");
    const newsOnlyImport = collected.newsEvents.length
        && !collected.config
        && !collected.summary
        && !collected.orderBlocks
        && !Object.keys(collected.tradesByVariant).length;
    if (!newsOnlyImport) {
        missing.forEach((artifact) => {
            collected.validationErrors.push({ severity: "error", file: artifact, kind: "required", field: artifact, message: `Missing required artifact: ${artifact}` });
        });
    }

    if (newsOnlyImport) {
        const id = `news_calendar_${Date.now()}`;
        const sourceFiles = collected.recognized.map((file) => file.name);
        const bundle = {
            id,
            config: {},
            summary: {
                id,
                symbol: "Economic Calendar",
                detectionTf: "News",
                executionTf: "UTC",
                dateRange: newsDateRange(collected.newsEvents),
                rr: 0,
                stopBuffer: 0,
                verifyTicks: 0,
                entryBuffer: 0,
                trades: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                netR: 0,
                validation: 100,
                executionMode: "news_calendar",
                date: new Date().toISOString().slice(0, 10),
                sourceFiles,
            },
            trades: [],
            tradesByVariant: {},
            controlTradesByScenario: {},
            controlPairs: null,
            primaryVariant: null,
            tradeMarkers: [],
            tradeMarkersByVariant: {},
            equityCurve: [],
            equityCurveByVariant: {},
            protectionResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: false },
            entryResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: false },
            scenarioBaselineResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: false },
            beResults: {},
            beTradesByMode: {},
            beSourceFiles: [],
            newsEvents: collected.newsEvents,
            newsSourceFiles: collected.newsSourceFiles,
            sourceFiles,
            orderBlocks: [],
            candles: null,
            hasCandles: false,
            validationErrors: collected.validationErrors,
            validationWarnings: collected.validationWarnings,
            importedAt: new Date().toISOString(),
        };
        return {
            ok: true,
            bundle,
            recognized: collected.recognized,
            unrecognized: collected.unrecognized,
            validationErrors: collected.validationErrors,
            validationWarnings: collected.validationWarnings,
            readErrors: collected.readErrors,
        };
    }

    if (missing.length || collected.validationErrors.length) {
        return {
            ok: false,
            missing,
            errors: collected.readErrors,
            validationErrors: collected.validationErrors,
            validationWarnings: collected.validationWarnings,
            recognized: collected.recognized,
            unrecognized: collected.unrecognized,
        };
    }

    // Pick primary trades variant
    const variantPriority = ["single_position", "one_per_direction", "allow_multi_position", "unknown"];
    const primaryVariant = variantPriority.find((v) => collected.tradesByVariant[v]) || Object.keys(collected.tradesByVariant)[0];

    // Map order blocks and trades onto candle indices when possible
    const hasCandles = !!collected.candles?.length;
    const candleIdx = hasCandles ? buildCandleIndex(collected.candles) : null;
    const mappedOBs = collected.orderBlocks.map((b, idx) => {
        const mapped0 = candleIdx ? timeToCandleIndex(b.originTime, candleIdx) : { i: -1, quality: "missing", time: null };
        const mapped1 = candleIdx ? timeToCandleIndex(b.endTime, candleIdx) : { i: -1, quality: "missing", time: null };
        // Fallback synthetic spacing if neither indices nor candle mapping worked
        const fallbackI0 = idx * 24;
        const fallbackI1 = idx * 24 + 18;
        const mappingQuality = mapped0.quality === "missing" || mapped1.quality === "missing"
            ? "missing"
            : (mapped0.quality === "nearest_prior" || mapped1.quality === "nearest_prior" ? "nearest_prior" : "exact");
        return {
            ...b,
            id: b.id,
            originTime: b.originTime,
            endTime: b.endTime,
            i0: mapped0.i >= 0 ? mapped0.i : fallbackI0,
            i1: mapped1.i >= 0 ? mapped1.i : fallbackI1,
            time0: mapped0.time,
            time1: mapped1.time,
            originIndexRaw: b.originIndexRaw,
            detectionIndexRaw: b.detectionIndexRaw,
            mappingQuality,
            top: b.top,
            bot: b.bot,
            side: b.side,
        };
    });

    const obLookup = buildOrderBlockLookup(mappedOBs);
    const pipSize = readPipSize(collected.config, collected.summary);
    const tradesByVariant = Object.fromEntries(
        Object.entries(collected.tradesByVariant).map(([variant, trades]) => [variant, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    const protectionTradesByMode = Object.fromEntries(
        Object.entries(collected.protectionTradesByMode).map(([mode, trades]) => [mode, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    // BE Exact Replay trades — nested executionMode → entryVariantKey →
    // scenarioKey, enriched identically to protection/entry trades. Kept
    // entirely separate from protectionTradesByMode.
    const beTradesByMode = Object.fromEntries(
        Object.entries(collected.beTradesByMode).map(([executionMode, byEntry]) => [
            executionMode,
            Object.fromEntries(
                Object.entries(byEntry).map(([entryVariantKey, byScenario]) => [
                    entryVariantKey,
                    Object.fromEntries(
                        Object.entries(byScenario).map(([scenarioKey, trades]) => [
                            scenarioKey,
                            enrichTradesWithOrderBlocks(trades, obLookup, pipSize),
                        ]),
                    ),
                ]),
            ),
        ]),
    );
    const entryTradesByMode = Object.fromEntries(
        Object.entries(collected.entryTradesByMode).map(([mode, trades]) => [mode, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    // Fair Baseline comparison trades (P2.5) — enriched identically, kept separate.
    const scenarioBaselineTradesByMode = Object.fromEntries(
        Object.entries(collected.scenarioBaselineTradesByMode).map(([mode, trades]) => [mode, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    const scenarioBaselineEquityCurveByMode = Object.fromEntries(
        Object.entries(scenarioBaselineTradesByMode).map(([mode, trades]) => [mode, computeEquityCurve(trades)]),
    );
    // Auto-paired FFT-OFF control trades — enriched identically to entry/variant
    // trades so downstream pairing analytics have the same OB-derived fields.
    const controlTradesByScenario = Object.fromEntries(
        Object.entries(collected.controlTradesByScenario).map(([key, trades]) => [key, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    const controlScenarioCount = Object.keys(controlTradesByScenario).length;
    if (controlScenarioCount > 0) {
        console.log(`[importer] FFT control scenarios imported: ${controlScenarioCount}`);
    }
    const directionalTradesByScenario = Object.fromEntries(
        Object.entries(collected.directionalTradesByScenario).map(([key, trades]) => [key, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
    const directionalEquityCurveByScenario = Object.fromEntries(
        Object.entries(directionalTradesByScenario).map(([key, trades]) => [key, computeEquityCurve(trades)]),
    );
    const directionalCount = Object.keys(directionalTradesByScenario).length;
    if (directionalCount > 0) {
        console.log(`[importer] Directional scenarios imported: ${directionalCount}`);
        Object.values(collected.directionalScenarioMeta).forEach((meta) => {
            const rows = directionalTradesByScenario[`${meta.executionMode}__${meta.scenarioId}`]?.length ?? 0;
            console.log(`  ${meta.scenarioId} (${meta.executionMode}): ${rows} trades`);
        });
    }
    const primaryTrades = tradesByVariant[primaryVariant] || [];
    const equityCurveByVariant = Object.fromEntries(
        Object.entries(tradesByVariant).map(([variant, trades]) => [variant, computeEquityCurve(trades)]),
    );
    const protectionEquityCurveByMode = Object.fromEntries(
        Object.entries(protectionTradesByMode).map(([mode, trades]) => [mode, computeEquityCurve(trades)]),
    );
    const entryEquityCurveByMode = Object.fromEntries(
        Object.entries(entryTradesByMode).map(([mode, trades]) => [mode, computeEquityCurve(trades)]),
    );
    const tradeMarkersByVariant = Object.fromEntries(
        Object.entries(tradesByVariant).map(([variant, trades]) => [variant, computeTradeMarkers(trades, candleIdx)]),
    );
    const equityCurve = equityCurveByVariant[primaryVariant] || [];
    const tradeMarkers = tradeMarkersByVariant[primaryVariant] || [];

    // Build run id and summary
    const cfg = collected.config;
    const sm  = collected.summary;
    const entryResultsSummary = sm.entry_results || sm.entryResults || {};
    // Lightweight auto-control metadata written by the backend into summary.json.
    // Preserved verbatim; null on older bundles that predate control generation.
    const controlPairs = sm.control_pairs ?? sm.controlPairs ?? null;
    const id = String(sm.id || cfg.id || sm.run_id || cfg.run_id || `imported_${Date.now()}`);
    const originalRunId = id;
    // Canonical roll-up: never count INVALID / UNFILLED / SESSION_FILTERED /
    // NEWS_TOUCH_CANCEL / NEWS_BLACKOUT rows as losses. The old code was
    // `losses = primaryTrades.length - wins`, which silently bucketed every
    // non-Win outcome (including all the excluded setups above) into losses
    // and produced summary.losses values like 26 on a baseline with only
    // 18 real losses. That summary then leaked into every page that read
    // summary.losses / run.losses as a fallback.
    const primaryRollup = summarizeTradeClassifications(primaryTrades);
    const wins = primaryRollup.wins;
    const losses = primaryRollup.losses;
    const netR = primaryTrades.reduce((s, t) => s + (Number(t.r) || 0), 0);
    const integrity = buildIntegrity({ collected, primaryTrades, netR, primaryVariant });
    const sourceFiles = collected.recognized.map((file) => file.name);

    // Phase 1B — source run identity for sidecar reload. Folder name (from the
    // picker) is the most reliable id (the sidecar resolves it under
    // outputs/runs); manifest/summary run_id is a secondary identifier. All
    // empty when files were drag-dropped loose → reload falls back to the
    // frontend id (old behaviour preserved).
    // `sourceRunFolderName` is already in scope (declared at the top of
    // ingestRunBundle from the picker's webkitRelativePath).
    const sourceRunId = [
        collected.manifest?.run_id, collected.manifest?.runId,
        sm.run_id, sm.runId, sm.sidecar_run_id, cfg.run_id,
    ].map((v) => String(v ?? "").trim()).find(Boolean) || "";
    // Bare folder name only — never an absolute path (browser can't supply one,
    // and the sidecar only accepts folder ids inside its outputs/runs root).
    const reloadFolder = sourceRunFolderName || "";

    // Human-friendly run name set from the Strategy Builder (RUN-NAME feature).
    // manifest.json/progress.json carry display_name; surface it so manual and
    // cross-session imports render the chosen name. Empty for older bundles.
    const runDisplayName = [
        collected.manifest?.display_name, collected.manifest?.displayName,
        sm.display_name, sm.displayName,
    ].map((v) => String(v ?? "").trim()).find(Boolean) || "";

    const runSummary = {
        id,
        originalRunId,
        ...(runDisplayName ? { displayName: runDisplayName, name: runDisplayName } : {}),
        // Reload identity (Phase 1B) — consumed by reloadMetadataForRun.
        sourceRunFolderName,
        sourceRunId,
        sidecarRunId: sourceRunId || sourceRunFolderName || "",
        folderName: sourceRunFolderName,
        outputFolder: reloadFolder,
        sourceOutputFolder: reloadFolder,
        symbol:       sm.symbol || cfg.symbol,
        detectionTf:  sm.detection_tf || cfg.detection_tf,
        executionTf:  sm.execution_tf || cfg.execution_tf || "1m",
        dateRange:    `${sm.date_from || cfg.date_from || "?"} → ${sm.date_to || cfg.date_to || "?"}`,
        rr:           Number(sm.rr_multiple ?? cfg.rr_multiple ?? sm.rr ?? cfg.rr ?? sm.risk_reward ?? cfg.risk_reward ?? 0),
        stopBuffer:   Number(sm.stop_buffer ?? cfg.stop_buffer ?? 0),
        verifyTicks:  Number(sm.verify_ticks ?? cfg.verify_ticks ?? 0),
        entryBuffer:  Number(sm.entry_buffer ?? cfg.entry_buffer ?? 0),
        trades:       primaryTrades.length,
        wins,
        losses,
        // Prefer backend summary.win_rate (= wins / (wins+losses+protection_exits)),
        // which is already canonical. Fallback uses the canonical roll-up
        // denominator (wins+losses) instead of primaryTrades.length, which
        // would dilute the rate with UNFILLED / INVALID rows.
        winRate:      Number((sm.win_rate ?? sm.winRate ?? primaryRollup.winRate ?? 0).toFixed(1)),
        netR:         Number((sm.net_r ?? sm.netR ?? netR).toFixed(1)),
        validation:   Number(sm.validation ?? 100),
        integrity,
        protection_results: sm.protection_results || {},
        entry_results: entryResultsSummary,
        entryResults: entryResultsSummary,
        directional_results: sm.directional_results || sm.directionalResults || {},
        directionalResults: sm.directional_results || sm.directionalResults || {},
        control_pairs: controlPairs,
        controlPairs,
        executionMode:sm.execution_mode || cfg.execution_mode || primaryVariant,
        reverseCancels: Number(sm.reverse_cancels ?? sm.reverseCancels ?? 0),
        date:         (sm.completed_at || new Date().toISOString()).slice(0, 10),
        // ── News blackout reporting ──────────────────────────────────────────
        news_blackout_enabled: sm.news_blackout_enabled ?? cfg.news_blackout_enabled ?? false,
        news_events_matched: sm.news_events_matched ?? null,
        news_windows_created: sm.news_windows_created ?? null,
        news_blackout_skipped: sm.news_blackout_skipped ?? null,
        news_pending_paused: sm.news_pending_paused ?? null,
        news_pending_rearmed: sm.news_pending_rearmed ?? null,
        news_touch_cancelled: sm.news_touch_cancelled ?? null,
        news_fills_blocked: sm.news_fills_blocked ?? null,
        news_active_trades_flattened: sm.news_active_trades_flattened ?? null,
        news_flattened_r: sm.news_flattened_r ?? null,
        news_flatten_late_count: sm.news_flatten_late_count ?? null,
        news_debug: sm.news_debug ?? null,
        // ── Ghost tracking aggregates (Phase 0 — observational only) ─────────
        // All default to null so old bundles load without change.
        ghost_candidates_total: sm.ghost_candidates_total ?? sm.ghostCandidatesTotal ?? null,
        ghost_wins: sm.ghost_wins ?? sm.ghostWins ?? null,
        ghost_losses: sm.ghost_losses ?? sm.ghostLosses ?? null,
        ghost_breakevens: sm.ghost_breakevens ?? sm.ghostBreakevens ?? null,
        ghost_protection_exits: sm.ghost_protection_exits ?? sm.ghostProtectionExits ?? null,
        ghost_unfilled: sm.ghost_unfilled ?? sm.ghostUnfilled ?? null,
        ghost_never_triggered: sm.ghost_never_triggered ?? sm.ghostNeverTriggered ?? null,
        ghost_net_r: sm.ghost_net_r ?? sm.ghostNetR ?? null,
        ghost_avg_r: sm.ghost_avg_r ?? sm.ghostAvgR ?? null,
        // ── Structure-direction filter skip counts (Phase 1) ─────────────────
        // Null when backend doesn't yet support the filter; old bundles load unchanged.
        structure_direction_filter_skipped:
            sm.structure_direction_filter_skipped
            ?? cfg.structure_direction_filter_skipped
            ?? null,
        sourceFiles,
    };

    const bundle = {
        id,
        originalRunId,
        config: cfg,
        summary: runSummary,
        // 2B.1a — run-level RR target axis (normalized). [] when absent → no-op.
        targetSet: normalizeTargetSet(sm.target_set ?? cfg.target_set ?? collected.manifest?.target_set ?? []),
        trades: primaryTrades,
        tradesByVariant,
        primaryVariant,
        tradeMarkers,
        tradeMarkersByVariant,
        equityCurve,
        equityCurveByVariant,
        protectionResults: {
            summary: sm.protection_results || {},
            tradesByMode: protectionTradesByMode,
            equityCurveByMode: protectionEquityCurveByMode,
            sourceFiles: collected.protectionSourceFiles,
            tradesOmittedForStorage: false,
        },
        entryResults: {
            summary: entryResultsSummary,
            tradesByMode: entryTradesByMode,
            equityCurveByMode: entryEquityCurveByMode,
            sourceFiles: collected.entrySourceFiles,
            tradesOmittedForStorage: false,
        },
        // ── Fair Baseline comparison (Session-First P2.5) ─────────────────────
        // Mirrors the protectionResults/entryResults shape but is a PARALLEL
        // universe, never a slice of the custom one. `summary` carries the backend
        // run_summary.scenario_baseline provenance verbatim (output_kind, mode,
        // eligible_cohort_count, baseline_target_rr, baseline_be, warnings). Old
        // bundles (no CSV, no provenance) → {} summary + empty maps.
        scenarioBaselineResults: {
            summary: sm.scenario_baseline || sm.scenarioBaseline || {},
            tradesByMode: scenarioBaselineTradesByMode,
            equityCurveByMode: scenarioBaselineEquityCurveByMode,
            sourceFiles: collected.scenarioBaselineSourceFiles,
            tradesOmittedForStorage: false,
        },
        // ── BE Exact Replay (BE-FRONTEND-INTEGRATION) ─────────────────────────
        // Two top-level keys mirroring protectionResults/protectionTradesByMode
        // but kept SEPARATE from protection. Both nested by executionMode →
        // scenarioKey. beResults carries the backend summary.json `be_results`
        // verbatim (raw fields preserved); beTradesByMode carries the per-scenario
        // enriched trade rows. Old bundles → {} for both.
        beResults: normalizeBeResults(sm.be_results),
        beTradesByMode,
        beSourceFiles: collected.beSourceFiles,
        directionalResults: {
            tradesByScenario: directionalTradesByScenario,
            equityCurveByScenario: directionalEquityCurveByScenario,
            sourceFiles: collected.directionalSourceFiles,
            scenarioMeta: collected.directionalScenarioMeta,
            tradesOmittedForStorage: false,
        },
        // Auto-paired FFT-OFF control outputs (AUTO-PAIR-CONTROL-RUNS Phase 2).
        // controlTradesByScenario: keyed "{execution_mode}:{scenario_key}".
        // controlPairs: lightweight metadata mirrored from summary.control_pairs.
        controlTradesByScenario,
        controlPairs,
        controlSourceFiles: collected.controlSourceFiles,
        newsEvents: collected.newsEvents,
        newsSourceFiles: collected.newsSourceFiles,
        sourceFiles,
        orderBlocks: mappedOBs,
        candles: hasCandles ? collected.candles : null,
        hasCandles,
        // ── LARGE-RUN-IMPORT Phase 1 — lazy/metadata-only import flags ─────────
        // On a large bundle, candles + BE/variant rows are NOT parsed; only
        // metadata is indexed here and rows load on demand. beResults (summaries
        // from summary.json) ARE present, so BE summary cards still resolve EXACT.
        // Small bundles keep lazy:false and every field below is inert/empty.
        lazy: collected.lazy,
        largeRunMeta: collected.lazy ? {
            reasons: collected.sizeInfo.reasons,
            fileCount: collected.sizeInfo.fileCount,
            totalBytes: collected.sizeInfo.totalBytes,
            beFileCount: collected.sizeInfo.beFileCount,
            beScenarioCount: collected.beScenarioIndex.length,
            deferredVariantCount: collected.deferredFiles.length,
            candlesDeferred: !!collected.candlesMeta,
        } : null,
        beScenarioIndex: collected.beScenarioIndex,
        entryScenarioIndex: collected.entryScenarioIndex,
        deferredFiles: collected.deferredFiles,
        candlesMeta: collected.candlesMeta,
        candlesLazy: collected.lazy && !!collected.candlesMeta,
        // Provenance flags surfaced for quick UI/diagnostics (also in config).
        provenance: {
            beMultiarmEnabled: cfg?.be_multiarm_enabled ?? null,
            reverseTouchCancelEnabled: cfg?.reverse_touch_cancel_enabled ?? null,
            executionModes: cfg?.execution_modes ?? null,
        },
        // Phase 1B — source run identity (top-level mirror of runSummary fields)
        // so reloadMetadataForRun resolves the real folder id, not the frontend id.
        sourceRunFolderName,
        sourceRunId,
        sidecarRunId: sourceRunId || sourceRunFolderName || "",
        folderName: sourceRunFolderName,
        outputFolder: reloadFolder,
        sourceOutputFolder: reloadFolder,
        // Backend-verified OB retest artifacts (Phase 2.4). null when the run was
        // exported without them → Retest Lab falls back to frontend derivation.
        obRetests: collected.obRetests,
        obRetestSummary: collected.obRetestSummary,
        integrity,
        validationErrors: collected.validationErrors,
        validationWarnings: collected.validationWarnings,
        importedAt: new Date().toISOString(),
    };

    return {
        ok: true,
        bundle,
        large: collected.lazy,
        largeRunMeta: bundle.largeRunMeta,
        // File handles for lazy on-demand reads (NOT persisted; session-scoped).
        // Caller (ImportZone) registers these with the store keyed by bundle.id.
        lazyFileHandles: collected.lazyFileHandles,
        recognized: collected.recognized,
        unrecognized: collected.unrecognized,
        validationErrors: collected.validationErrors,
        validationWarnings: collected.validationWarnings,
        readErrors: collected.readErrors,
    };
}
