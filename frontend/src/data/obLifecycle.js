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

function normalizeText(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function obKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim().toLowerCase();
    const numeric = text.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : text;
}

function firstPresent(...values) {
    return values.find((value) => value != null && value !== "");
}

function firstTimestamp(...values) {
    for (const value of values) {
        const ts = normalizeTimestamp(value);
        if (ts != null) return ts;
    }
    return null;
}

function numeric(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

function statusLabel(status) {
    return {
        pending: "PENDING",
        filled_active: "FILLED",
        win: "WIN",
        loss: "LOSS",
        breakeven: "BE",
        protection_exit: "PROTECTION EXIT",
        invalidated: "INVALID",
        unfilled: "UNFILLED",
        session_cancel: "SESSION CANCEL",
        news_blackout: "NEWS BLACKOUT",
        paused: "PAUSED",
        reverse_touch_cancel: "REVERSE TOUCH",
        no_trade: "NO TRADE",
        unknown: "UNKNOWN",
    }[status] || "UNKNOWN";
}

function colorKeyForStatus(status) {
    return {
        pending: "pending",
        filled_active: "pending",
        win: "win",
        loss: "loss",
        breakeven: "be",
        protection_exit: "done",
        invalidated: "done",
        unfilled: "done",
        session_cancel: "sessionCancel",
        news_blackout: "paused",
        paused: "paused",
        reverse_touch_cancel: "reverseCancel",
        no_trade: null,
        unknown: null,
    }[status] ?? null;
}

function mapExportedStatus(status) {
    const normalized = normalizeText(status);
    const mapped = {
        pending: "pending",
        used: "filled_active",
        filled: "filled_active",
        win: "win",
        loss: "loss",
        be: "breakeven",
        breakeven: "breakeven",
        break_even: "breakeven",
        invalid: "invalidated",
        invalidated: "invalidated",
        invalid_paused: "invalidated",
        paused: "paused",
        session_cancel: "session_cancel",
        reverse_cancel: "reverse_touch_cancel",
        reverse_touch_cancel: "reverse_touch_cancel",
        filtered_origin: "no_trade",
        filtered_detection: "no_trade",
        protection_exit: "protection_exit",
        no_trade: "no_trade",
        unknown: "unknown",
    }[normalized] || "unknown";
    return mapped;
}

export function buildTradesByObId(trades = []) {
    const map = new Map();
    trades.forEach((trade) => {
        const key = obKey(trade?.obId || trade?.ob_id || trade?.order_block_id);
        if (!key) return;
        if (!map.has(key)) map.set(key, trade);
    });
    return map;
}

export function deriveOBStatus(trade, ob = null) {
    if (ob?.obFinalStatus) {
        const status = mapExportedStatus(ob.obFinalStatus);
        return {
            status,
            statusLabel: ob.obFinalStatusLabel || statusLabel(status),
            colorKey: colorKeyForStatus(status),
        };
    }
    if (!trade) {
        return { status: "no_trade", statusLabel: "NO TRADE", colorKey: null };
    }
    const outcome = normalizeText(trade.outcome || trade.result || trade.status);
    const reason = normalizeText(trade.missed_reason || trade.missedReason);

    if (trade.news_blackout === true || trade.newsBlackout === true || outcome === "news_blackout" || reason.includes("news_blackout")) {
        return { status: "news_blackout", statusLabel: "NEWS BLACKOUT", colorKey: "paused" };
    }
    if (trade.reverseConflict === true || trade.reverse_conflict === true || reason.includes("reverse")) {
        return { status: "reverse_touch_cancel", statusLabel: "REVERSE TOUCH", colorKey: "reverseCancel" };
    }
    if (reason.includes("session")) {
        return { status: "session_cancel", statusLabel: "SESSION CANCEL", colorKey: "sessionCancel" };
    }
    if (outcome.includes("win") || outcome === "tp" || outcome === "target") {
        return { status: "win", statusLabel: "WIN", colorKey: "win" };
    }
    if (outcome.includes("loss") || outcome === "sl" || outcome === "stop") {
        return { status: "loss", statusLabel: "LOSS", colorKey: "loss" };
    }
    if (outcome === "be" || outcome.includes("breakeven") || outcome === "break_even") {
        return { status: "breakeven", statusLabel: "BE", colorKey: "be" };
    }
    if (outcome === "protection_exit" || trade.protection_exit === true || trade.protectionExit === true || trade.protection_exit_reason || trade.protectionExitReason) {
        return { status: "protection_exit", statusLabel: "PROTECTION EXIT", colorKey: "done" };
    }
    if (trade.missed_trade === true && trade.entry_model_filled === false) {
        return { status: "unfilled", statusLabel: "UNFILLED", colorKey: "done" };
    }
    if (trade.missed_trade === true && reason) {
        return { status: "unfilled", statusLabel: "UNFILLED", colorKey: "done" };
    }
    if (trade.ob_fully_breached === true || trade.obFullyBreached === true || trade.close_confirmed_ob_breach === true || trade.closeConfirmedObBreach === true) {
        return { status: "invalidated", statusLabel: "INVALID", colorKey: "done" };
    }
    if (firstTimestamp(trade.entry, trade.fill_time, trade.fillTime) != null && firstTimestamp(trade.exit, trade.exit_time, trade.exitTime) == null) {
        return { status: "filled_active", statusLabel: "FILLED", colorKey: "pending" };
    }
    return { status: "unknown", statusLabel: "UNKNOWN", colorKey: null };
}

export function deriveOBRightTime(trade, ob, lastCandleTime) {
    const { status } = deriveOBStatus(trade, ob);
    const exportedRightTime = firstTimestamp(ob?.chartRightTime, ob?.chart_right_time);
    if (exportedRightTime != null) {
        return {
            rightTime: exportedRightTime,
            rightTimeSource: firstPresent(ob?.chartRightTimeSource, ob?.chart_right_time_source, "chart_right_time"),
        };
    }
    const detectionTime = firstTimestamp(ob?.endTime, ob?.detectionTime, ob?.detection_time, ob?.detected, ob?.time1, trade?.obDetectionTime, trade?.detected);
    const exitTime = firstTimestamp(trade?.exit, trade?.exit_time, trade?.exitTime);
    const fillTime = firstTimestamp(trade?.entry, trade?.fill_time, trade?.fillTime);

    if (status === "pending" || status === "filled_active") return { rightTime: normalizeTimestamp(lastCandleTime) ?? fillTime ?? detectionTime, rightTimeSource: "last_candle_time" };
    if (status === "win" || status === "loss" || status === "breakeven") return { rightTime: exitTime ?? fillTime ?? detectionTime, rightTimeSource: exitTime ? "exit_time" : fillTime ? "fill_time" : "detection_time" };
    if (status === "protection_exit") {
        const protectionTime = firstTimestamp(trade?.protection_trigger_time, trade?.protectionTriggerTime);
        return { rightTime: protectionTime ?? exitTime ?? fillTime ?? detectionTime, rightTimeSource: protectionTime ? "protection_trigger_time" : exitTime ? "exit_time" : fillTime ? "fill_time" : "detection_time" };
    }
    if (status === "invalidated") {
        const closeBreachTime = firstTimestamp(trade?.close_breach_time, trade?.closeBreachTime);
        return { rightTime: closeBreachTime ?? exitTime ?? fillTime ?? detectionTime, rightTimeSource: closeBreachTime ? "close_breach_time" : exitTime ? "exit_time" : fillTime ? "fill_time" : "detection_time" };
    }
    if (status === "unfilled") return { rightTime: detectionTime, rightTimeSource: "detection_time" };
    if (status === "session_cancel") return { rightTime: exitTime ?? detectionTime, rightTimeSource: exitTime ? "exit_time" : "detection_time" };
    if (status === "news_blackout") {
        const blackoutTrigger = firstTimestamp(trade?.news_blackout_trigger_time, trade?.newsBlackoutTriggerTime);
        const eventTime = firstTimestamp(trade?.news_blackout_event_time, trade?.newsBlackoutEventTime);
        return { rightTime: blackoutTrigger ?? eventTime ?? detectionTime, rightTimeSource: blackoutTrigger ? "news_blackout_trigger_time" : eventTime ? "news_blackout_event_time" : "detection_time" };
    }
    if (status === "reverse_touch_cancel") return { rightTime: exitTime ?? detectionTime, rightTimeSource: exitTime ? "exit_time" : "detection_time" };
    if (status === "no_trade") return { rightTime: detectionTime, rightTimeSource: "detection_time" };
    return { rightTime: exitTime ?? fillTime ?? detectionTime, rightTimeSource: exitTime ? "exit_time" : fillTime ? "fill_time" : "detection_time" };
}

export function deriveOBLifecycle(ob, trade, lastCandleTime) {
    const status = deriveOBStatus(trade, ob);
    const startTime = firstTimestamp(ob?.originTime, ob?.origin_time, ob?.startTime, ob?.start_time, ob?.time0);
    const { rightTime, rightTimeSource } = deriveOBRightTime(trade, ob, lastCandleTime);
    const direction = firstPresent(ob?.direction, ob?.side, ob?.obDirection, trade?.direction, trade?.obDirection);
    const obId = firstPresent(ob?.id, ob?.obId, trade?.obId, trade?.ob_id);
    const top = numeric(firstPresent(ob?.top, ob?.high, trade?.obTop, trade?.ob_top));
    const bot = numeric(firstPresent(ob?.bot, ob?.bottom, ob?.low, trade?.obBottom, trade?.ob_bottom));
    const linkedTradeId = firstPresent(ob?.linkedTradeId, ob?.linked_trade_id, trade?.id, trade?.trade_id, null);

    return {
        ...ob,
        obId,
        id: ob?.id || obId,
        direction,
        top,
        bot,
        bottom: bot,
        startTime,
        rightTime,
        rightTimeSource,
        status: status.status,
        statusLabel: status.statusLabel,
        colorKey: status.colorKey,
        linkedTradeId,
        fillTime: firstTimestamp(ob?.fillTime, ob?.fill_time, trade?.entry, trade?.fill_time, trade?.fillTime),
        exitTime: firstTimestamp(ob?.exitTime, ob?.exit_time, trade?.exit, trade?.exit_time, trade?.exitTime),
        cancelTime: firstTimestamp(ob?.cancelTime, ob?.cancel_time),
        invalidationTime: firstTimestamp(ob?.invalidationTime, ob?.invalidation_time),
        protectionTriggerTime: firstTimestamp(ob?.protectionTriggerTime, ob?.protection_trigger_time, trade?.protection_trigger_time, trade?.protectionTriggerTime),
        newsBlackoutTriggerTime: firstTimestamp(ob?.newsBlackoutTriggerTime, ob?.news_blackout_trigger_time, trade?.news_blackout_trigger_time, trade?.newsBlackoutTriggerTime),
        reverseTouchTime: firstTimestamp(ob?.reverseTouchTime, ob?.reverse_touch_time),
        sessionCancelTime: firstTimestamp(ob?.sessionCancelTime, ob?.session_cancel_time),
        lifecycleReason: firstPresent(ob?.lifecycleReason, ob?.lifecycle_reason, trade?.missed_reason, trade?.protection_exit_reason, null),
        entry: numeric(trade?.entryPrice ?? trade?.entry_price),
        stop: numeric(trade?.stop ?? trade?.stop_loss),
        tp: numeric(trade?.tp ?? trade?.take_profit),
        outcome: trade?.outcome || trade?.result || ob?.outcome || ob?.result,
        rResult: numeric(trade?.r ?? trade?.pnl_r ?? trade?.rResult),
        time0: startTime,
        time1: rightTime ?? startTime,
        // ── Ghost tracking (Phase 0 — observational only) ────────────────────
        // Trade fields take precedence over OB fields (trades carry more detail).
        // ...ob spread already passes through OB-level ghost_* — these explicit
        // assignments add trade-level fields and fill gaps if the OB omits them.
        ghost_candidate: trade?.ghost_candidate ?? ob?.ghost_candidate ?? null,
        ghostCandidate: trade?.ghost_candidate ?? ob?.ghost_candidate ?? null,
        ghost_trigger_reached: trade?.ghost_trigger_reached ?? ob?.ghost_trigger_reached ?? null,
        ghostTriggerReached: trade?.ghost_trigger_reached ?? ob?.ghost_trigger_reached ?? null,
        ghost_fill: trade?.ghost_fill ?? ob?.ghost_fill ?? null,
        ghostFill: trade?.ghost_fill ?? ob?.ghost_fill ?? null,
        ghost_outcome: trade?.ghost_outcome || ob?.ghost_outcome || "",
        ghostOutcome: trade?.ghost_outcome || ob?.ghost_outcome || "",
        ghost_r: numeric(trade?.ghost_r ?? ob?.ghost_r),
        ghostR: numeric(trade?.ghost_r ?? ob?.ghost_r),
        ghost_mae: numeric(trade?.ghost_mae ?? null),
        ghostMae: numeric(trade?.ghost_mae ?? null),
        ghost_mfe: numeric(trade?.ghost_mfe ?? null),
        ghostMfe: numeric(trade?.ghost_mfe ?? null),
        ghost_fill_delay_candles: numeric(trade?.ghost_fill_delay_candles ?? null),
        ghostFillDelayCandles: numeric(trade?.ghost_fill_delay_candles ?? null),
        ghost_fill_session: trade?.ghost_fill_session || ob?.ghost_fill_session || "",
        ghostFillSession: trade?.ghost_fill_session || ob?.ghost_fill_session || "",
    };
}
