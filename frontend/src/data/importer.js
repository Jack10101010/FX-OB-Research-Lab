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
const isNum = (v) => v != null && isFinite(Number(v));
const numOrNull = (v) => (isNum(v) ? Number(v) : null);
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

export function parseTradesCSV(text) {
    const { headers, rows } = parseCSV(text);
    const hasNewsCreatedTagFields = headers.some((header) => header.startsWith("ob_origin_news_") || header.startsWith("ob_detection_news_"));
    return rows.map((r, i) => {
        const directionRaw = pick(r, "direction", "side", "dir") || "Long";
        const directionText = String(directionRaw).toLowerCase();
        const direction = directionText.startsWith("bear") || directionText.startsWith("s") || directionText === "sell"
            ? "Short"
            : "Long";
        const outcomeRaw = pick(r, "outcome", "result");
        const grossR = numOrNull(pick(r, "gross_r", "grossR"));
        const netR = numOrNull(pick(r, "net_r", "netR"));
        const rVal = netR ?? Number(pick(r, "pnl_r", "r", "r_result", "rresult") ?? 0);
        const outcome = outcomeRaw ? cap(outcomeRaw) : (rVal >= 0 ? "Win" : "Loss");
        const structRaw = pick(r, "structure_tag", "structure", "structure_type", "type") || "BOS";
        const rawObId = pick(r, "ob_id", "order_block_id");
        const rawTradeId = pick(r, "trade_id", "id", "trade_index");
        const displayObId = formatEntityId("OB", rawObId);
        const derivedTradeId = rawObId != null && rawObId !== "" ? formatEntityId("T", rawObId) : "";
        const fillSession = String(pick(r, "fill_session", "fillSession", "trade_session", "tradeSession", "entry_session", "entrySession") || "");
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
            outcome,
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

function detectFileKind(name) {
    const n = name.toLowerCase();
    if (n.endsWith(".json")) {
        if (n.includes("config")) return "config";
        if (n.includes("summary")) return "summary";
        return "json_unknown";
    }
    if (n.endsWith(".csv")) {
        if (n.includes("candle"))                            return "candles";
        if (entryTradeFileInfo(name))                         return "trades_entry";
        if (protectedTradeFileInfo(name))                     return "trades_protected";
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

export async function ingestRunBundle(fileList) {
    const files = Array.from(fileList);
    const collected = {
        config: null, summary: null, orderBlocks: null, candles: null,
        tradesByVariant: {},
        entryTradesByMode: {},
        entrySourceFiles: [],
        protectionTradesByMode: {},
        protectionSourceFiles: [],
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
            primaryVariant: null,
            tradeMarkers: [],
            tradeMarkersByVariant: {},
            equityCurve: [],
            equityCurveByVariant: {},
            protectionResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: false },
            entryResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: false },
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
    const entryTradesByMode = Object.fromEntries(
        Object.entries(collected.entryTradesByMode).map(([mode, trades]) => [mode, enrichTradesWithOrderBlocks(trades, obLookup, pipSize)]),
    );
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

    const runSummary = {
        id,
        originalRunId,
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
        sourceFiles,
    };

    const bundle = {
        id,
        originalRunId,
        config: cfg,
        summary: runSummary,
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
        newsEvents: collected.newsEvents,
        newsSourceFiles: collected.newsSourceFiles,
        sourceFiles,
        orderBlocks: mappedOBs,
        candles: hasCandles ? collected.candles : null,
        hasCandles,
        integrity,
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
