/**
 * useResolvedScenario — Phase 2 canonical scenario resolver
 *
 * Derives ALL Strategy Map data from one canonical `scenario` object.
 * Replaces the parallel useMemo forest in StrategyMap.jsx for:
 *   activeTrades, chartObBoxes, chartTradeMarkers, rrTools,
 *   triggeredEdgeOverlays, runStats
 *
 * Phase 2 bridge: when scenario.family/threshold/fillMode are null (no UI
 * yet), `legacyEntryModelHint` (the old dropdown value) drives resolution.
 */

import { useMemo } from "react";
import {
    isWinTrade,
    isLossTrade,
    summarizeTradeClassifications,
} from "@/data/tradeClassification";
// Phase 2A — scenario parsing + trade selection now live in @/data/tradeUniverse
// so the same logic powers Strategy Map (this hook) AND the store-level
// getTradeUniverse() selector. The local copies that used to live in this file
// were removed; behavior is identical (the imports below are the same
// functions, byte-for-byte).
import {
    numericOrNull,
    truthyFlag,
    familyFromKey,
    thresholdToKeyPart,
    extractThreshold,
    fillModeFromKey,
    normalizeEntryModelKey,
    entryTradesByMode,
    entrySummaryKeys,
    uniqueTrades,
    collectAllEntryKeys,
    buildAvailableOptions,
    buildCanonicalKey,
    resolveHierarchy,
    selectTrades,
} from "@/data/tradeUniverse";

// ---------------------------------------------------------------------------
// Low-level utilities (mirrors of private fns in StrategyMap.jsx)
// ---------------------------------------------------------------------------

function normalizeTimestampSeconds(value) {
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

function rrLookupKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    const numeric = text.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : text.toLowerCase();
}

function normalizeOutcome(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Derive the correct OB_PALETTE colorKey from a scenario trade's outcome.
 * Returns null when no mapping is found (caller should fall back to ob.colorKey).
 *
 * This is needed because OB_BOXES_ENRICHED (from the store) sets colorKey based
 * on ob.obFinalStatus (the baseline model result). When a scenario trade has a
 * *different* outcome (e.g. INVALID vs LOSS), we must override that stale key.
 */
function colorKeyForTradeOutcome(trade) {
    if (!trade) return null;
    const o = normalizeOutcome(trade.outcome ?? trade.result ?? "");
    const cancelledBefore = truthyFlag(trade.cancelled_before_entry) || truthyFlag(trade.cancelledBeforeEntry);
    const cancelNorm = normalizeOutcome(trade.cancel_reason ?? trade.cancelReason ?? "");
    // INVALID / cancelled-before-entry → violet "done" key
    if (cancelledBefore || o === "invalid" || cancelNorm.includes("inval") || cancelNorm.includes("before_entry")) return "done";
    if (o.includes("win") || o === "tp") return "win";
    if (o.includes("loss") || o === "sl") return "loss";
    if (o === "be" || o.includes("breakeven")) return "be";
    if (o.includes("news_flatten") || o.includes("news")) return "paused";
    if (o.includes("session")) return "sessionCancel";
    if (o.includes("reverse")) return "reverseCancel";
    if (o.includes("protection")) return "done";
    return null;
}

function firstAvailable(...values) {
    return values.find((v) => v !== undefined && v !== null && v !== "");
}

// Scenario-key parsing, normalization, entry-result accessors and
// `uniqueTrades` now come from @/data/tradeUniverse (see imports at top of
// file). The pure helpers used to live here, were copy/pasted into the
// shared module verbatim in Phase 2A, and removed from this file to keep
// one implementation of each.

// ---------------------------------------------------------------------------
// OB enrichment and RR tools (mirrors of StrategyMap.jsx private fns)
// ---------------------------------------------------------------------------

function resolveTradeEntryPrice(trade = {}, ob = {}) {
    const candidates = [
        ["actual_entry_price", trade.actual_entry_price ?? trade.actualEntryPrice],
        ["planned_entry_price", trade.planned_entry_price ?? trade.plannedEntryPrice],
        ["entry", trade.entryPrice ?? trade.entry_price ?? trade.entry],
        ["ob_actual_entry_price", ob.actual_entry_price ?? ob.actualEntryPrice],
        ["ob_planned_entry_price", ob.planned_entry_price ?? ob.plannedEntryPrice],
        ["ob_entry", ob.entryPrice ?? ob.entry_price ?? ob.entry],
    ];
    for (const [source, value] of candidates) {
        const n = numericOrNull(value);
        if (n != null) return { value: n, source };
    }
    return { value: null, source: "" };
}

function enrichObsWithTradeLabels(obs = [], trades = []) {
    const tradesByOb = new Map();
    const tradesById = new Map();
    (trades || []).forEach((trade) => {
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const tradeKey = rrLookupKey(trade.id ?? trade.tradeId ?? trade.trade_id ?? trade.rawTradeId ?? trade.displayTradeId);
        if (obKey) tradesByOb.set(obKey, trade);
        if (tradeKey) tradesById.set(tradeKey, trade);
    });
    return (obs || []).map((ob) => {
        const trade = tradesById.get(rrLookupKey(ob.linkedTradeId || ob.tradeId || ob.trade_id))
            || tradesByOb.get(rrLookupKey(ob.obId || ob.ob_id || ob.id));
        if (!trade) return ob;
        const outcome = trade.outcome || ob.outcome;
        const flattenKey = normalizeOutcome(outcome || trade.news_action || ob.status || ob.obFinalStatus);
        const isNewsFlatten = flattenKey.includes("news_flatten") || flattenKey.includes("flattened_active_trade");
        const resultR = isNewsFlatten
            ? numericOrNull(trade.news_flatten_r ?? trade.newsFlattenR ?? trade.r ?? ob.newsFlattenR ?? ob.news_flatten_r ?? ob.r)
            : null;
        // Override the stale colorKey that store enrichment set from obFinalStatus.
        // The scenario trade's outcome takes priority — e.g. INVALID must not show as red LOSS.
        const scenarioColorKey = colorKeyForTradeOutcome(trade);

        // ── Scenario-correct OB right edge (time1) ─────────────────────────
        // ob.time1 / ob.chart_right_time are set at store-enrichment time from
        // the BASELINE linked trade (e.g. S_16). When a different scenario is
        // viewed, the scenario trade has a completely different exit time. We
        // must recalculate time1 from the scenario trade so the box extends to
        // the correct point.
        //
        // Priority: scenarioExit → scenarioFill → existing ob.time1 (unchanged).
        // trade.exit = exit_time from CSV (set for all completed trades, including
        // cancelled-before-entry outcomes where _apply_exit_metrics records the
        // cancel candle).
        let time1 = ob.time1; // default: keep store-enriched value
        const scenarioExitSec = normalizeTimestampSeconds(trade.exit || trade.exit_time || trade.exitTime || "");
        const scenarioFillSec = normalizeTimestampSeconds(trade.entry || trade.fill_time || trade.fillTime || "");
        if (scenarioExitSec != null) {
            time1 = scenarioExitSec;
        } else if (scenarioFillSec != null) {
            time1 = scenarioFillSec;
        }
        // If neither is available (truly pending / unfilled), keep ob.time1 unchanged.

        return {
            ...ob,
            tradeId: trade.displayTradeId || trade.id || ob.linkedTradeId || ob.tradeId,
            displayTradeId: trade.displayTradeId || trade.id || ob.displayTradeId,
            rawTradeId: trade.rawTradeId || trade.id,
            obId: trade.obId || ob.obId || ob.ob_id || ob.id,
            resultR,
            outcome,
            isNewsFlatten,
            colorKey: scenarioColorKey ?? ob.colorKey,
            statusLabel: isNewsFlatten ? "NEWS FLATTEN" : (ob.statusLabel || ob.obFinalStatusLabel),
            time1,
        };
    });
}

function buildRrToolsFromObs(obs = [], trades = []) {
    const tradesByOb = new Map();
    const tradesById = new Map();
    (trades || []).forEach((trade) => {
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const tradeKey = rrLookupKey(trade.id ?? trade.tradeId ?? trade.trade_id ?? trade.rawTradeId ?? trade.displayTradeId);
        if (obKey) tradesByOb.set(obKey, trade);
        if (tradeKey) tradesById.set(tradeKey, trade);
    });
    return (obs || []).map((ob, index) => {
        const trade = tradesById.get(rrLookupKey(ob.linkedTradeId || ob.tradeId || ob.trade_id))
            || tradesByOb.get(rrLookupKey(ob.obId || ob.ob_id || ob.id))
            || {};
        const fillTime = trade.entry ?? trade.fillTime ?? ob.fillTime ?? ob.fill_time ?? ob.entryTime ?? ob.entry_time ?? ob.entry_time_utc ?? ob.entry;
        const outcome = trade.outcome ?? ob.outcome ?? ob.result ?? ob.status ?? ob.obFinalStatus ?? ob.statusLabel ?? ob.obFinalStatusLabel;
        const normalizedOutcome = normalizeOutcome(outcome);
        const newsAction = normalizeOutcome(trade.news_action ?? trade.newsAction ?? ob.news_action ?? ob.newsAction);
        const isNewsFlatten = normalizedOutcome.includes("news_flatten") || newsAction.includes("flattened_active_trade");
        const entryResolved = resolveTradeEntryPrice(trade, ob);
        const entry = entryResolved.value;
        const stop = numericOrNull(trade.stop ?? ob.stop ?? ob.sl ?? ob.stopLoss ?? ob.stop_loss);
        const tp = numericOrNull(trade.tp ?? ob.tp ?? ob.takeProfit ?? ob.take_profit);
        const exitTime = isNewsFlatten
            ? (trade.news_flatten_time ?? trade.newsFlattenTime ?? trade.exit ?? ob.newsFlattenTime ?? ob.news_flatten_time ?? ob.exitTime ?? ob.exit_time)
            : (trade.exit ?? ob.exitTime ?? ob.exit_time);
        const exitPrice = isNewsFlatten
            ? numericOrNull(trade.news_flatten_price ?? trade.newsFlattenPrice ?? trade.protection_exit_price ?? ob.newsFlattenPrice ?? ob.news_flatten_price ?? ob.protectionExitPrice ?? ob.protection_exit_price)
            : numericOrNull(trade.exitPrice ?? ob.exitPrice ?? ob.exit_price ?? ob.protectionExitPrice ?? ob.protection_exit_price);
        const resultR = numericOrNull(trade.news_flatten_r ?? trade.newsFlattenR ?? trade.r ?? ob.newsFlattenR ?? ob.news_flatten_r ?? ob.pnlR ?? ob.pnl_r ?? ob.r ?? ob.rResult);
        const displayTradeId = trade.displayTradeId || ob.displayTradeId || trade.id || ob.linkedTradeId || ob.tradeId || ob.trade_id;
        const rawTradeId = trade.rawTradeId || trade.id || ob.rawTradeId || "";
        const tradeId = displayTradeId;
        const obId = ob.obId || ob.ob_id || ob.id;
        if (!fillTime || entry == null || stop == null || tp == null) return null;
        return {
            id: tradeId || obId || `rr-${index}`,
            tradeId,
            displayTradeId,
            rawTradeId,
            obId,
            fillTime,
            exitTime,
            exitPrice,
            resultR,
            outcome,
            status: ob.status || ob.obFinalStatus,
            statusLabel: ob.statusLabel || ob.obFinalStatusLabel,
            isNewsFlatten,
            entry,
            entrySource: entryResolved.source,
            stop,
            tp,
            direction: ob.direction || ob.side,
        };
    }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Triggered-edge overlay builder (mirror of StrategyMap.jsx private fn)
// ---------------------------------------------------------------------------

function buildTriggeredEdgeOverlays(trades = [], obs = []) {
    if (!trades.length) return [];
    const obMap = new Map();
    (obs || []).forEach((ob) => {
        const key = rrLookupKey(ob.obId || ob.ob_id || ob.id);
        if (key) obMap.set(key, ob);
    });
    const out = [];
    for (const trade of trades) {
        const entryModelKey = String(trade.entry_model_key || trade.entryModelKey || "");
        if (!entryModelKey.startsWith("entry_triggered_edge")) continue;
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const ob = obKey ? obMap.get(obKey) : null;
        const top = ob ? numericOrNull(ob.top) : null;
        const bot = ob ? numericOrNull(ob.bot ?? ob.bottom) : null;
        const obStartTime = ob ? (ob.time0 ?? ob.startTime ?? ob.start_time ?? null) : null;
        const obEndTime = ob ? (ob.time1 ?? ob.endTime ?? ob.end_time ?? null) : null;
        const detectionTime = firstAvailable(
            trade.detection_time,
            trade.detectionTime,
            trade.ob_detection_time,
            trade.obDetectionTime,
            ob?.detection_time,
            ob?.detectionTime,
            ob?.ob_detection_time,
            ob?.obDetectionTime,
            obStartTime,
        );
        const rawSide = normalizeOutcome(ob?.direction || ob?.side || ob?.obDirection || trade.direction || trade.side || "");
        const isBull = rawSide.includes("bull") || rawSide.includes("long");
        const depth = (top != null && bot != null) ? Math.abs(top - bot) : null;
        const trigPct = numericOrNull(trade.trigger_penetration_pct ?? trade.triggerPenetrationPct);
        const entryPct = numericOrNull(trade.entry_level_pct ?? trade.entryLevelPct) ?? 0;
        let triggerPrice = null;
        let entryPrice = null;
        if (depth != null && top != null && bot != null) {
            triggerPrice = trigPct != null
                ? (isBull ? top - depth * trigPct / 100 : bot + depth * trigPct / 100)
                : null;
            entryPrice = isBull ? top - depth * entryPct / 100 : bot + depth * entryPct / 100;
        }
        const triggerTime = trade.trigger_time || trade.triggerTime || null;
        const tappedTime = trade.tapped_time || trade.tappedTime || null;
        const armedAt = trade.armed_at || trade.armedAt || null;
        const edgeRevisitTime = trade.edge_revisit_time || trade.edgeRevisitTime || null;
        const retraceCancelTime = trade.retrace_cancel_time || trade.retraceCancelTime || null;
        const exitTime = firstAvailable(trade.exit, trade.exit_time, trade.exitTime, ob?.exitTime, ob?.exit_time);
        const lineStartTime = firstAvailable(detectionTime, obStartTime);
        const lineEndTime = firstAvailable(
            ob?.chartRightTime,
            ob?.chart_right_time,
            ob?.time1,
            ob?.endTime,
            ob?.end_time,
            edgeRevisitTime,
            exitTime,
            retraceCancelTime,
            triggerTime,
            obEndTime,
        );
        const cancelReason = trade.cancel_reason || trade.cancelReason || "";
        const cancelledBeforeEntry = truthyFlag(trade.cancelled_before_entry) || truthyFlag(trade.cancelledBeforeEntry);
        const filledOnTriggerCandle = truthyFlag(trade.filled_on_trigger_candle) || truthyFlag(trade.filledOnTriggerCandle);
        const filledOnNextCandle = trade.filled_on_trigger_candle === false
            || trade.filledOnTriggerCandle === false
            || String(trade.filled_on_trigger_candle).toLowerCase() === "false"
            || String(trade.filledOnTriggerCandle).toLowerCase() === "false";
        const hasTrigger = !!(triggerTime && String(triggerTime).trim());
        const cancelNorm = normalizeOutcome(cancelReason);
        const isFftCancel = cancelNorm.includes("first_failed");
        const fftCancelTime = isFftCancel
            ? firstAvailable(trade.exit_time, trade.exitTime, trade.exit)
            : null;
        const wasCancelled = Boolean(
            cancelledBeforeEntry
            || (retraceCancelTime && String(retraceCancelTime).trim())
            || cancelNorm.includes("cancel")
            || cancelNorm.includes("inval")
            || cancelNorm.includes("breach")
            || cancelNorm.includes("broken"),
        );
        const triggerLineState = wasCancelled ? "cancelled" : hasTrigger ? "tagged" : "not_tagged";
        let badgeState = null;
        if (!hasTrigger) {
            badgeState = "never_trig";
        } else if ((retraceCancelTime && String(retraceCancelTime).trim()) || cancelNorm.includes("retrace")) {
            badgeState = "used_ob";
        } else if (cancelledBeforeEntry && cancelNorm.includes("first_failed")) {
            badgeState = "first_failed";
        } else if (cancelledBeforeEntry && (cancelNorm.includes("inval") || cancelNorm.includes("breach") || cancelNorm.includes("broken"))) {
            badgeState = "inval";
        } else if (!cancelledBeforeEntry && filledOnTriggerCandle) {
            badgeState = "same";
        } else if (!cancelledBeforeEntry && filledOnNextCandle) {
            badgeState = "next";
        }
        out.push({
            tradeId: trade.displayTradeId || trade.id || null,
            obId: trade.obId ?? trade.ob_id ?? null,
            direction: isBull ? "bull" : "bear",
            entryModelKey,
            triggerPenetrationPct: trigPct,
            entryLevelPct: entryPct,
            triggerTime,
            detectionTime,
            lineStartTime,
            lineEndTime,
            wasTriggered: hasTrigger,
            wasCancelled,
            triggerLineState,
            tappedTime,
            armedAt,
            edgeRevisitTime,
            retraceCancelTime,
            triggerToEntryMinutes: numericOrNull(trade.trigger_to_entry_minutes ?? trade.triggerToEntryMinutes),
            cancelReason,
            cancelledBeforeEntry,
            tappedBeforeTrigger: truthyFlag(trade.tapped_before_trigger) || truthyFlag(trade.tappedBeforeTrigger),
            sameCandleEntryAllowed: truthyFlag(trade.same_candle_entry_allowed) || truthyFlag(trade.sameCandleEntryAllowed),
            armedOnTriggerCandle: truthyFlag(trade.armed_on_trigger_candle) || truthyFlag(trade.armedOnTriggerCandle),
            filledOnTriggerCandle,
            obTop: top,
            obBot: bot,
            obStartTime,
            obEndTime,
            triggerPrice,
            entryPrice,
            badgeState,
            // ── Ghost tracking (Phase 0 — observational only) ─────────────────
            // All default to null; absent on old bundles.
            ghost_candidate: truthyFlag(trade.ghost_candidate) || truthyFlag(trade.ghostCandidate) || false,
            ghost_outcome: String(trade.ghost_outcome || trade.ghostOutcome || ""),
            ghost_r: numericOrNull(trade.ghost_r ?? trade.ghostR),
            ghost_fill_session: String(trade.ghost_fill_session || trade.ghostFillSession || ""),
            ghost_fill_delay_candles: numericOrNull(trade.ghost_fill_delay_candles ?? trade.ghostFillDelayCandles),
            // ── FFT debug fields ─────────────────────────────────────────────
            isFftCancel,
            fftCancelTime,
            tappedCandleIndex:       numericOrNull(trade.tapped_candle_index ?? trade.tappedCandleIndex),
            triggerCandleIndex:      numericOrNull(trade.trigger_candle_index ?? trade.triggerCandleIndex),
            armCandleIndex:          numericOrNull(trade.arm_candle_index ?? trade.armCandleIndex),
            exitedObBeforeArm:       trade.exited_ob_before_arm ?? trade.exitedObBeforeArm ?? null,
            obOccupiedAtArm:         trade.ob_occupied_at_arm ?? trade.obOccupiedAtArm ?? null,
            armedAfterObExit:        trade.armed_after_ob_exit ?? trade.armedAfterObExit ?? null,
            obExitTime:              firstAvailable(trade.ob_exit_time, trade.obExitTime) || null,
            ghostCandidate:          trade.ghost_candidate ?? trade.ghostCandidate ?? null,
            fftMoveAwayPipsAtCancel: numericOrNull(trade.fft_move_away_pips_at_cancel ?? trade.fftMoveAwayPipsAtCancel),
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Stats builder (mirror of StrategyMap.jsx private fn)
// ---------------------------------------------------------------------------

function tradeR(trade) {
    return numericOrNull(trade?.r ?? trade?.pnl_r ?? trade?.rResult) ?? 0;
}

// Mirror of StrategyMap.jsx — delegates to the canonical classifier so the
// hook's stats match the page's pill colors and Run Detail's KPI strip.
function isWin(trade) {
    return isWinTrade(trade);
}

function isLoss(trade) {
    return isLossTrade(trade);
}

function buildRunStats(trades = [], summary = {}, bundle = {}, activeVariant = null) {
    // Always derive stats from the scenario's actual trade list. Trusting
    // summary.wins here was the bug behind "Strategy Map shows 8 wins / Run
    // Detail KPI shows 10" — that summary comes from the baseline primary
    // variant, not from the scenario currently selected on the page.
    const rollup = summarizeTradeClassifications(trades);
    const total = trades.length;
    const wins = rollup.wins;
    const losses = rollup.losses;
    const netR = numericOrNull(summary.netR ?? summary.net_r) ?? rollup.netR;
    const winRate = rollup.winRate ?? 0;
    const performanceTrades = rollup.performanceTrades;
    const avgR = performanceTrades ? netR / performanceTrades : 0;
    return {
        symbol: summary.symbol || bundle?.summary?.symbol || bundle?.config?.symbol || "—",
        detectionTf: summary.detectionTf || summary.detection_tf || bundle?.config?.detection_timeframe || "—",
        executionTf: summary.executionTf || summary.execution_tf || bundle?.config?.execution_timeframe || "—",
        variant: activeVariant || summary.selectedTradeVariant || summary.executionMode || "—",
        total,
        wins,
        losses,
        winRate,
        netR,
        avgR,
        expectancy: numericOrNull(summary.expectancyR ?? summary.expectancy_r) ?? avgR,
        maxDd: numericOrNull(summary.maxDrawdownR ?? summary.max_drawdown_r ?? summary.maxDD ?? summary.max_dd),
        flats: rollup.flats,
        performanceTrades,
        invalidCancelled: rollup.invalidCancelled,
        unfilled: rollup.unfilled,
        sessionFiltered: rollup.sessionFiltered,
        newsCancelled: rollup.newsCancelled,
        newsFlattenWins: rollup.newsFlattenWins,
        newsFlattenLosses: rollup.newsFlattenLosses,
        newsFlattenFlats: rollup.newsFlattenFlats,
    };
}

// ---------------------------------------------------------------------------
// Resolution helpers — moved to @/data/tradeUniverse in Phase 2A.
//
// The functions `collectAllEntryKeys`, `buildAvailableOptions`,
// `safeFillModeWhenNoCombined`, `buildCanonicalKey`, `resolveHierarchy`,
// and `selectTrades` are now imported at the top of this file. The shared
// module is the single source of truth for scenario hierarchy and trade
// selection so the same logic powers both this hook (Strategy Map) and the
// store-level `getTradeUniverse()` selector that future pages will consume.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/**
 * useResolvedScenario(scenario, bundle, fallbackState)
 *
 * @param {object} scenario  - SCENARIO from store (may have null family/threshold/fillMode in Phase 2)
 * @param {object|null} bundle - full run bundle from getRunData(runId)
 * @param {object} fallbackState - {
 *   activeTradeVariant,   // ACTIVE_TRADE_VARIANT from store
 *   tradeMarkers,         // TRADE_MARKERS from store (live/streaming markers)
 *   obBoxes,              // raw OB boxes: OB_BOXES_ENRICHED || OB_BOXES || bundle.orderBlocks
 *   isViewedActiveRun,    // whether the viewed run === the store's activeRunId
 *   summary,              // bundle.summary || activeRunMeta
 *   legacyEntryModelHint, // old selectedEntryModel dropdown value (Phase 2 bridge)
 *   showRrTools,          // boolean layer toggle
 * }
 *
 * @returns {object} resolvedScenario
 */
export function useResolvedScenario(scenario, bundle, fallbackState = {}) {
    const {
        activeTradeVariant,
        tradeMarkers: storeTradeMarkers,
        obBoxes: rawObBoxes,
        isViewedActiveRun,
        summary = {},
        legacyEntryModelHint,
        showRrTools = false,
    } = fallbackState;

    // ------------------------------------------------------------------
    // 1. Resolve position variant (positionVariant in scenario, or store's ACTIVE_TRADE_VARIANT)
    // ------------------------------------------------------------------
    const resolvedPositionVariant = useMemo(() => {
        if (scenario?.positionVariant) return scenario.positionVariant;
        if (activeTradeVariant && bundle?.tradesByVariant?.[activeTradeVariant]) return activeTradeVariant;
        return bundle?.primaryVariant ?? null;
    }, [scenario, activeTradeVariant, bundle]);

    // ------------------------------------------------------------------
    // 2. Base trades for the resolved position variant
    // ------------------------------------------------------------------
    const baseVariantTrades = useMemo(() => {
        if (resolvedPositionVariant && bundle?.tradesByVariant?.[resolvedPositionVariant]) {
            return bundle.tradesByVariant[resolvedPositionVariant];
        }
        return bundle?.trades || [];
    }, [bundle, resolvedPositionVariant]);

    // ------------------------------------------------------------------
    // 3. Collect all available entry keys → build option tree
    // ------------------------------------------------------------------
    const allEntryKeys = useMemo(() => collectAllEntryKeys(bundle, baseVariantTrades), [bundle, baseVariantTrades]);

    const availableOptions = useMemo(() => buildAvailableOptions(allEntryKeys), [allEntryKeys]);

    // ------------------------------------------------------------------
    // 4. Resolve hierarchy (family → threshold → fillMode)
    //    Phase 2 bridge: uses legacyEntryModelHint when scenario fields are null
    //    Phase 1 (this commit): coerces away from fake "Both" when the bundle
    //    has separate same/next CSVs but no real combined CSV.
    // ------------------------------------------------------------------
    const { resolvedFamily, resolvedThreshold, resolvedFillMode } = useMemo(() => (
        resolveHierarchy(scenario, legacyEntryModelHint, allEntryKeys, availableOptions)
    ), [scenario, legacyEntryModelHint, allEntryKeys, availableOptions]);

    // Did the user explicitly request "Both" (fillMode === null with a
    // non-baseline family)? Track this so the UI can show "Both unavailable —
    // showing Next" when the hook coerced.
    const requestedFillMode = useMemo(() => {
        // Explicit scenario.fillMode wins (could be null = both)
        if (scenario?.fillMode !== undefined) return scenario.fillMode ?? null;
        // Otherwise the legacy hint key's suffix
        const hint = legacyEntryModelHint
            ? normalizeEntryModelKey(legacyEntryModelHint)
            : null;
        if (hint && hint !== "baseline" && hint !== "__all__") return fillModeFromKey(hint);
        return undefined; // "no preference"
    }, [scenario, legacyEntryModelHint]);

    // ------------------------------------------------------------------
    // 5. Build canonical key from resolved hierarchy
    // ------------------------------------------------------------------
    const canonicalKey = useMemo(() => (
        buildCanonicalKey(resolvedFamily, resolvedThreshold, resolvedFillMode)
    ), [resolvedFamily, resolvedThreshold, resolvedFillMode]);

    // ------------------------------------------------------------------
    // 6. Select trades using canonical key + fill-mode aware filtering
    // ------------------------------------------------------------------
    const rawTrades = useMemo(() => (
        selectTrades(canonicalKey, resolvedFillMode, bundle, baseVariantTrades)
    ), [canonicalKey, resolvedFillMode, bundle, baseVariantTrades]);

    // trades === rawTrades (alias; future phases may add additional trade-level filters here)
    const trades = rawTrades;

    // ------------------------------------------------------------------
    // 7. OB enrichment
    // ------------------------------------------------------------------
    const orderBlocks = useMemo(() => (
        enrichObsWithTradeLabels(rawObBoxes || [], trades)
    ), [rawObBoxes, trades]);

    // ------------------------------------------------------------------
    // 8. Trade markers (respects the same logic as StrategyMap.jsx)
    // ------------------------------------------------------------------
    const tradeMarkers = useMemo(() => {
        const isBaseline = !canonicalKey || canonicalKey === "baseline";
        if (!isBaseline) return trades;
        if (isViewedActiveRun && storeTradeMarkers?.length) return storeTradeMarkers;
        if (resolvedPositionVariant && bundle?.tradeMarkersByVariant?.[resolvedPositionVariant]?.length) {
            return bundle.tradeMarkersByVariant[resolvedPositionVariant];
        }
        return bundle?.tradeMarkers || [];
    }, [
        canonicalKey,
        trades,
        isViewedActiveRun,
        storeTradeMarkers,
        resolvedPositionVariant,
        bundle,
    ]);

    // ------------------------------------------------------------------
    // 9. RR tools
    // ------------------------------------------------------------------
    const rrTools = useMemo(() => (
        showRrTools ? buildRrToolsFromObs(orderBlocks, trades) : []
    ), [showRrTools, orderBlocks, trades]);

    // ------------------------------------------------------------------
    // 10. Triggered-edge overlays
    // ------------------------------------------------------------------
    const triggeredEdgeOverlays = useMemo(() => (
        buildTriggeredEdgeOverlays(trades, orderBlocks)
    ), [trades, orderBlocks]);

    // ------------------------------------------------------------------
    // 11. Stats
    // ------------------------------------------------------------------
    const stats = useMemo(() => (
        buildRunStats(trades, summary, bundle, resolvedPositionVariant)
    ), [trades, summary, bundle, resolvedPositionVariant]);

    // ------------------------------------------------------------------
    // 12. Available dimension lists for future UI controls
    // ------------------------------------------------------------------
    const availableFamilies = availableOptions.availableFamilies;

    const availableThresholds = useMemo(() => {
        if (!resolvedFamily) return [];
        return availableOptions.thresholdsByFamily[resolvedFamily] || [];
    }, [availableOptions, resolvedFamily]);

    const availableFillModes = useMemo(() => {
        if (!resolvedFamily || resolvedThreshold == null) return [];
        const ftKey = `${resolvedFamily}::${resolvedThreshold}`;
        return availableOptions.fillModesByFamilyThreshold[ftKey] || [];
    }, [availableOptions, resolvedFamily, resolvedThreshold]);

    // True iff a real combined/bare CSV exists for the current (family,
    // threshold). When false, the UI must NOT offer a "Both" pill.
    const hasCombinedFillMode = useMemo(() => {
        if (!resolvedFamily || resolvedThreshold == null) return false;
        const ftKey = `${resolvedFamily}::${resolvedThreshold}`;
        return Boolean(availableOptions.hasCombinedByFamilyThreshold?.[ftKey]);
    }, [availableOptions, resolvedFamily, resolvedThreshold]);

    // Human-readable reason when Both is unavailable. Null when Both is
    // either available, or moot (baseline / no entry-model scenarios).
    const bothUnavailableReason = useMemo(() => {
        if (!resolvedFamily || resolvedFamily === "baseline") return null;
        if (hasCombinedFillMode) return null;
        const modes = availableFillModes;
        if (modes.includes("same") && modes.includes("next")) {
            return "This run exported Same and Next as separate CSVs — pick one.";
        }
        if (modes.length === 1) {
            return `Only "${modes[0]}" fill mode is available for this scenario.`;
        }
        return "No combined fill-mode CSV available for this scenario.";
    }, [resolvedFamily, hasCombinedFillMode, availableFillModes]);

    // Was the user's requested fill mode silently coerced? (e.g. they clicked
    // Both but the hook fell back to Next because no combined CSV exists.)
    const fillModeCoerced = useMemo(() => {
        if (requestedFillMode === undefined) return false; // no preference expressed
        const wanted = requestedFillMode ?? "both";
        const got = resolvedFillMode ?? "both";
        return wanted !== got;
    }, [requestedFillMode, resolvedFillMode]);

    const availablePositionVariants = useMemo(() => (
        Object.keys(bundle?.tradesByVariant || {})
    ), [bundle]);

    // Source identifier for the trade universe currently rendered. Best-effort
    // CSV filename based on importer's filename convention:
    //   trades_<positionVariant>__<canonicalKey>.csv
    // For baseline universe we fall back to the bare variant CSV name.
    // If sourceFiles can be matched against the canonical key we prefer the
    // exact filename from the importer.
    const universeSource = useMemo(() => {
        const variant = resolvedPositionVariant || "";
        const baseFromVariant = variant ? `trades_${variant}.csv` : null;
        // canonicalKey === "baseline" → baseline universe
        if (!canonicalKey || canonicalKey === "baseline") {
            return {
                universe: "baseline",
                filename: baseFromVariant,
                modelKey: "baseline",
            };
        }
        // Scenario universe — derive filename from canonical key.
        const filenameGuess = variant
            ? `trades_${variant}__${canonicalKey}.csv`
            : `${canonicalKey}.csv`;
        // If importer surfaced an exact match in entryResults.sourceFiles use it.
        const sourceFiles =
            bundle?.entryResults?.sourceFiles
            || bundle?.entryResults?.source_files
            || [];
        const matched = sourceFiles.find((name) => {
            const lower = String(name).toLowerCase();
            return lower.endsWith(`__${canonicalKey}.csv`)
                || lower.endsWith(`${canonicalKey}.csv`);
        });
        return {
            universe: "scenario",
            filename: matched || filenameGuess,
            modelKey: canonicalKey,
        };
    }, [canonicalKey, resolvedPositionVariant, bundle]);

    // ------------------------------------------------------------------
    // 13. resolvedContext — human-readable chip labels (mirrors entryModelContext)
    // ------------------------------------------------------------------
    const resolvedContext = useMemo(() => {
        if (!resolvedFamily || resolvedFamily === "baseline") {
            return { label: "Baseline", tone: "muted" };
        }
        const fmtThreshold = resolvedThreshold != null
            ? (Number.isInteger(resolvedThreshold)
                ? `${resolvedThreshold}%`
                : `${resolvedThreshold}%`)
            : "";
        const dmFill = typeof resolvedFillMode === "string" ? resolvedFillMode.match(/^d(\d+)$/) : null;
        const fmtFill = resolvedFillMode === "same"
            ? " · Same"
            : resolvedFillMode === "next"
                ? " · Next"
                : dmFill
                    ? ` · Delay +${dmFill[1]}`
                    : "";
        if (resolvedFamily === "triggered_edge") {
            return {
                label: `Triggered Edge${fmtThreshold ? ` ${fmtThreshold}` : ""}${fmtFill}`,
                tone: "success",
            };
        }
        if (resolvedFamily === "penetration") {
            return {
                label: `Penetration${fmtThreshold ? ` ${fmtThreshold}` : ""}${fmtFill}`,
                tone: "muted",
            };
        }
        return { label: resolvedFamily, tone: "muted" };
    }, [resolvedFamily, resolvedThreshold, resolvedFillMode]);

    // ------------------------------------------------------------------
    // 14. Assemble and return
    // ------------------------------------------------------------------
    return {
        // Canonical resolved scenario fields
        scenario,
        resolvedFamily,
        resolvedPositionVariant,
        resolvedThreshold,
        resolvedFillMode,
        canonicalKey,

        // Data arrays (drop-in replacements for StrategyMap useMemo values)
        rawTrades,
        trades,           // = activeTrades in StrategyMap.jsx
        orderBlocks,      // = chartObBoxes in StrategyMap.jsx (already enriched)
        tradeMarkers,     // = chartTradeMarkers in StrategyMap.jsx
        rrTools,
        triggeredEdgeOverlays,
        stats,            // = runStats in StrategyMap.jsx

        // Available options for future UI pickers
        availableFamilies,
        availableThresholds,
        availableFillModes,
        availablePositionVariants,

        // Phase 1 "stop fake Both" outputs ─ ScenarioSelector reads these to
        // hide the Both pill / show an explanatory note when the run lacks a
        // real combined CSV.
        hasCombinedFillMode,
        bothUnavailableReason,
        requestedFillMode,
        fillModeCoerced,

        // Universe identification — used by the Strategy Map source badge so
        // the user can always see which CSV powers the current chart/list.
        universeSource,

        // Human-readable context chip
        resolvedContext,
    };
}
