// ── entryAnalytics.js ────────────────────────────────────────────────────────
// Pure analytics functions for the Entries Research Workspace.
// No React, no side-effects. Safe inside useMemo.
//
// Highlights are per-family (markHighlights), not cross-family global bests.
// isBestNetR / isBestExpectancy / isLowestDD / isBestPF are scoped per-family.
// isBestFillPct is intentionally NOT aliased globally — fill% semantics differ
// across families and must never be compared directly.
// Backward-compat aliases (isBestNetR = isBestNetRInFamily, etc.) remain for
// existing consumers.
//
// metricsProfile / requiresLifecycleFunnel registry fields are used for
// family-specific branching wherever possible. startsWith fallbacks are
// retained as defensive guards for old imported runs without metricsProfile.
//
// Notable correctness points:
//   • Toxicity grid uses only LOSING trades
//   • Session bucket fillPct no longer hardcoded to 100%
//   • bestByLowest() uses > — maxDD is stored as a negative R value; the
//     least-negative value (smallest absolute drawdown) is selected by >.
//   • cancelled_before_entry rows excluded from fills/performance metrics

import { PLANNED_ENTRY_MODES, sampleConfidence, MIN_DIRECTION_N } from "./entryRegistry";
import {
    isFiniteNumber, num, round1, normalizeMode, normalizePct,
    firstNumber, parseDate, sessionOf, dayIndex, SESSIONS,
} from "./entryFormatters";
import { familyFromKey, extractThreshold, fillModeFromKey, armCandleIndex } from "@/data/tradeUniverse";

// ── Primitive helpers ────────────────────────────────────────────────────────

export function rOf(trade) {
    return Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
}

export function canonicalEntryMode(value) {
    return normalizeMode(value).replace(/^entry_penetration_(\d+)$/, "entry_penetration_$1p0");
}

export function maxDrawdown(trades) {
    let equity = 0, peak = 0, dd = 0;
    (trades || []).forEach(t => {
        equity += rOf(t);
        peak    = Math.max(peak, equity);
        dd      = Math.min(dd, equity - peak);
    });
    return round1(dd);
}

// ── Baseline row ──────────────────────────────────────────────────────────────
// NOTE: baseline fill% is NOT a meaningful metric (always 100% by definition).
// The row shape deliberately omits fillPct from performance consideration.
// Components should check row.metricsProfile === PROFILE_KEYS.STANDARD to
// suppress fill rate display for baseline rows.

export function baselineEntryRow(trades) {
    const list  = Array.isArray(trades) ? trades : [];
    const wins   = list.filter(t => rOf(t) > 0).length;
    const losses = list.filter(t => rOf(t) < 0).length;
    const netR   = list.reduce((s, t) => s + rOf(t), 0);
    return {
        mode: "baseline", label: "Baseline · Edge Touch", threshold: "Edge",
        family: "Baseline",
        eligible: list.length, trades: list.length, fills: list.length,
        // fillPct intentionally 100 — not a useful metric, never compare cross-family.
        // Components should use row.metricsProfile to decide whether to show it.
        fillPct:    list.length ? 100 : 0,
        // RB-8c: canonical Summary WR = wins / (wins + losses) (frozen RB-3.2).
        winRate:    (wins + losses) ? (wins / (wins + losses)) * 100 : 0,
        winRateSource: "canonical",
        netR:       round1(netR),
        expectancy: list.length ? netR / list.length : 0,
        maxDD:      maxDrawdown(list),
        profitFactor: calcProfitFactor(list),
        wins, losses,
        avgMAE: null, avgMFE: null, avgTimeToTP: null, avgTimeToSL: null,
        deltaVsBaseline: 0,
        exact: true, isBaseline: true,
    };
}

// ── From-summary row ─────────────────────────────────────────────────────────

export function entryRowFromSummary(planned, src, baseline, trades) {
    // V2: use requiresLifecycleFunnel from registry rather than startsWith string match.
    // This correctly handles any future lifecycle family, not just triggered-edge.
    const isLifecycle = planned.requiresLifecycleFunnel === true;
    const stats   = trades?.length ? entryStatsFromTrades(trades) : {};
    const funnel  = isLifecycle && trades?.length ? buildTriggeredEdgeFunnel(trades) : null;
    const netR    = firstNumber(src, "net_r", "netR", "net", "net_r_total") ?? stats.netR;
    const eligible = firstNumber(src, "eligible_setups", "eligible", "setups", "trades", "trade_count", "total_trades") ?? stats.eligible;
    const fills   = firstNumber(src, "fills", "filled", "filled_trades", "fill_count") ?? stats.fills;
    const threshold = firstNumber(src, "threshold", "threshold_pct", "entry_threshold_pct", "entry_threshold") ?? planned.threshold;
    const wins    = firstNumber(src, "wins", "winning_trades") ?? stats.wins;
    const losses  = firstNumber(src, "losses", "losing_trades") ?? stats.losses;
    const fillPct = normalizePct(firstNumber(src, "fill_pct", "fill_rate", "fill_percent"))
        ?? (isFiniteNumber(eligible) && Number(eligible) > 0 && isFiniteNumber(fills)
            ? (Number(fills) / Number(eligible)) * 100 : stats.fillPct);
    // RB-8c: canonical Summary WR. Prefer wins/(wins+losses) (frozen RB-3.2)
    // whenever wins/losses are known; fall back to the backend win_rate only
    // when they are absent (honest backend-derived value).
    const decidedWL = Number(wins || 0) + Number(losses || 0);
    const winRate = decidedWL > 0
        ? (Number(wins || 0) / decidedWL) * 100
        : (normalizePct(firstNumber(src, "win_rate", "wr")) ?? stats.winRate);
    const winRateSource = decidedWL > 0 ? "canonical" : "backend";
    const expectancy = firstNumber(src, "expectancy", "avg_r", "expectancy_r")
        ?? (isFiniteNumber(netR) && isFiniteNumber(fills) && Number(fills) > 0
            ? Number(netR) / Number(fills) : stats.expectancy);
    const rawMaxDD = firstNumber(src, "max_dd", "max_drawdown", "max_drawdown_r") ?? stats.maxDD;
    const pf = trades?.length ? calcProfitFactor(trades) : null;

    return {
        // planned fields spread first — this brings familyType, metricsProfile,
        // fillDescription, requiresLifecycleFunnel, supportedDimensions to the row.
        ...planned,
        exact: true, isBaseline: false,
        threshold: isFiniteNumber(threshold)
            ? `${Number(threshold).toFixed(Number(threshold) % 1 ? 1 : 0)}%`
            : threshold,
        eligible, trades: eligible, fills, fillPct, wins, losses, winRate, winRateSource,
        netR, expectancy,
        maxDD: rawMaxDD,
        profitFactor: pf,
        avgMAE:      firstNumber(src, "avg_mae", "avg_mae_r"),
        avgMFE:      firstNumber(src, "avg_mfe", "avg_mfe_r"),
        avgTimeToTP: src.avg_time_to_tp || src.avgTimeToTP || null,
        avgTimeToSL: src.avg_time_to_sl || src.avgTimeToSL || null,
        deltaVsBaseline: isFiniteNumber(netR) ? round1(Number(netR) - baseline.netR) : null,
        // ── Lifecycle funnel (null for non-lifecycle families) ────────────────
        // Consumed by TriggeredEdgeFunnelPanel via row.requiresLifecycleFunnel.
        triggeredEdgeFunnel:  funnel,
        triggerRate:          funnel?.triggerRate          ?? null,
        fillAfterTriggerRate: funnel?.fillAfterTriggerRate ?? null,
        retraceCancelCount:   funnel?.retraceCancelCount   ?? null,
        sameCandleCount:      funnel?.sameCandle           ?? null,
        nextCandleCount:      funnel?.nextCandle           ?? null,
        avgTriggerToEntry:    funnel?.avgTriggerToEntry    ?? null,
    };
}

export function entryStatsFromTrades(trades) {
    const list   = Array.isArray(trades) ? trades : [];
    // cancelled_before_entry rows are excluded from performance metrics — they
    // represent setups that were never filled and must not affect win/loss/R stats.
    const filled = list.filter(t =>
        t.cancelled_before_entry !== true &&
        (t.entry_model_filled === true || (t.missed_trade !== true && !!t.entry))
    );
    const wins   = filled.filter(t => rOf(t) > 0).length;
    const losses = filled.filter(t => rOf(t) < 0).length;
    const netR   = filled.reduce((s, t) => s + rOf(t), 0);
    return {
        eligible: list.length,
        fills:    filled.length,
        fillPct:  list.length ? (filled.length / list.length) * 100 : 0,
        wins, losses,
        winRate:     wins + losses ? (wins / (wins + losses)) * 100 : 0,
        netR:        round1(netR),
        expectancy:  filled.length ? netR / filled.length : 0,
        maxDD:       maxDrawdown(list),
        profitFactor: calcProfitFactor(filled),
    };
}

// ── Triggered-edge lifecycle funnel ──────────────────────────────────────────
// Returns a funnel object describing each stage of the triggered-edge lifecycle.
// All funnel fields are purely additive/counting — performance metrics (R, WR)
// are intentionally excluded here and remain on the parent entry row.
// Returns null when trades list is empty.
//
// This function is the data source for TriggeredEdgeFunnelPanel.
// Keep all stage counts on the returned object.

export function buildTriggeredEdgeFunnel(trades) {
    const list = Array.isArray(trades) ? trades : [];
    if (!list.length) return null;

    const tapped = list.filter(t =>
        t.tapped_before_trigger === true ||
        (t.tapped_time && t.tapped_time !== "") ||
        (t.tappedTime && t.tappedTime !== "")
    );

    const triggered = list.filter(t =>
        (t.trigger_time && t.trigger_time !== "") ||
        (t.triggerTime && t.triggerTime !== "")
    );

    const armed = list.filter(t =>
        (t.armed_at && t.armed_at !== "") ||
        (t.armedAt && t.armedAt !== "")
    );

    const filled = list.filter(t =>
        t.cancelled_before_entry !== true &&
        (t.entry_model_filled === true || (t.missed_trade !== true && !!t.entry))
    );

    const cancelledAfterTrigger = list.filter(t =>
        t.cancelled_before_entry === true &&
        ((t.trigger_time && t.trigger_time !== "") || (t.triggerTime && t.triggerTime !== ""))
    );

    const retraceCancel = list.filter(t =>
        (t.retrace_cancel_time && t.retrace_cancel_time !== "") ||
        (t.retraceCancelTime && t.retraceCancelTime !== "")
    );

    const neverTriggered = list.filter(t =>
        (!t.trigger_time || t.trigger_time === "") &&
        (!t.triggerTime  || t.triggerTime  === "")
    );

    // First-failed-tag: pre-trigger cancel when OB was tapped but threshold not reached.
    const firstFailedTag = list.filter(t =>
        (t.cancel_reason || t.cancelReason) === "first_failed_tag"
    );

    // Same/next candle: prefer fill_delay_candles (actual measured delta) if present,
    // fall back to filled_on_trigger_candle boolean for older exports.
    const sameCandle = filled.filter(t => {
        const d = t.fill_delay_candles ?? t.fillDelayCandles;
        if (d != null && Number.isFinite(Number(d))) return Number(d) === 0;
        return t.filled_on_trigger_candle === true || t.filledOnTriggerCandle === true;
    });
    const nextCandle = filled.filter(t => {
        const d = t.fill_delay_candles ?? t.fillDelayCandles;
        if (d != null && Number.isFinite(Number(d))) return Number(d) >= 1;
        return t.filled_on_trigger_candle === false || t.filledOnTriggerCandle === false;
    });

    // Per-delay fill counts bucketed from fill_delay_candles.
    // Keys: "0", "1", "2", "3", "4+" — only keys with count > 0 present.
    const fillsByDelay = {};
    for (const t of filled) {
        const raw = t.fill_delay_candles ?? t.fillDelayCandles;
        if (raw == null || !Number.isFinite(Number(raw))) continue;
        const n = Number(raw);
        const key = n >= 4 ? "4+" : String(n);
        fillsByDelay[key] = (fillsByDelay[key] || 0) + 1;
    }

    const triggerToEntryValues = filled
        .map(t => {
            const v = t.trigger_to_entry_minutes ?? t.triggerToEntryMinutes;
            return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
        })
        .filter(v => v !== null);
    const avgTriggerToEntry = triggerToEntryValues.length
        ? round1(triggerToEntryValues.reduce((s, v) => s + v, 0) / triggerToEntryValues.length)
        : null;

    return {
        eligible:              list.length,
        tappedCount:           tapped.length,
        triggeredCount:        triggered.length,
        armedCount:            armed.length,
        filledCount:           filled.length,
        triggerRate:           list.length      ? (triggered.length / list.length)      * 100 : 0,
        fillAfterTriggerRate:  triggered.length ? (filled.length    / triggered.length) * 100 : 0,
        cancelledAfterTrigger: cancelledAfterTrigger.length,
        retraceCancelCount:    retraceCancel.length,
        neverTriggeredCount:   neverTriggered.length,
        firstFailedTagCount:   firstFailedTag.length,
        sameCandle:            sameCandle.length,
        nextCandle:            nextCandle.length,
        fillsByDelay,
        avgTriggerToEntry,
        // TODO: add neverTappedCount, invalidatedCount when the exporter exposes them.
    };
}

function calcProfitFactor(trades) {
    const list  = Array.isArray(trades) ? trades : [];
    const gross = list.reduce((s, t) => { const r = rOf(t); return r > 0 ? s + r : s; }, 0);
    const loss  = list.reduce((s, t) => { const r = rOf(t); return r < 0 ? s + Math.abs(r) : s; }, 0);
    return loss > 0 ? round1(gross / loss) : null;
}

// ── Flatten / normalise summary from Python output ───────────────────────────

export function flattenEntrySummary(summary, activeVariant = "single_position") {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap(item => flattenEntrySummary(item, activeVariant));
    if (summary.mode || summary.entry_mode || summary.entry_model) {
        return [{ ...summary, mode: normalizeMode(summary.mode || summary.entry_mode || summary.entry_model) }];
    }
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        if (["single_position", "allow_multi_position", "one_per_direction"].includes(key)) {
            if (key === activeVariant) rows.push(...flattenEntrySummary(value, activeVariant));
        } else {
            rows.push({ ...value, mode: canonicalEntryMode(value.mode || value.entry_mode || value.entry_model || key) });
        }
    });
    return rows;
}

// ── Build the full ordered row set ───────────────────────────────────────────

export function buildEntryResultRows(run, trades, selectedVariant) {
    const activeVariant = selectedVariant || run?.primaryVariant || run?.summary?.executionMode || "single_position";
    const entryResults  = run?.entryResults || {};
    const exact         = flattenEntrySummary(entryResults.summary || run?.summary?.entry_results || {}, activeVariant);
    const exactByMode   = new Map(exact.map(r => [canonicalEntryMode(r.mode), r]));
    const tradesByMode  = entryResults.tradesByMode || {};
    const baseline      = baselineEntryRow(trades);

    const rows = PLANNED_ENTRY_MODES.flatMap(planned => {
        const modeKey   = canonicalEntryMode(planned.mode);
        const src       = exactByMode.get(modeKey);
        const legacyModeKey = modeKey.replace(/^entry_penetration_(\d+)p0$/, "entry_penetration_$1");
        const modeTrades = tradesByMode[`${activeVariant}__${modeKey}`]
            || tradesByMode[modeKey]
            || tradesByMode[`${activeVariant}__${legacyModeKey}`]
            || tradesByMode[legacyModeKey];
        if (planned.mode === "baseline") return [{ ...planned, ...baseline }];
        if (src || modeTrades?.length)   return [entryRowFromSummary(planned, src || {}, baseline, modeTrades)];
        return [];
    });
    markHighlights(rows);
    return rows;
}

// ── Selected dynamic variant row (Option A) ──────────────────────────────────
// PLANNED_ENTRY_MODES enumerates only a static subset, so a DISCOVERED deep/dynamic
// variant (e.g. entry_triggered_edge_25p0_d40 = "Triggered Edge 25% · Arm C40") never
// becomes a row in buildEntryResultRows. This builds ONE row for the SELECTED key from
// data already resident — summary metrics (flattenEntrySummary) and/or the lazily-loaded
// rows in tradesByMode — without touching PLANNED_ENTRY_MODES or loading any other
// variant. Returns null when nothing real exists yet (no fake 0R KPIs).

// A planned-mode template to inherit family metadata (familyType / metricsProfile /
// requiresLifecycleFunnel / supportedDimensions) so the synthetic row behaves like its
// siblings. Cloned from the first PLANNED entry of the same family; baseline as fallback.
function plannedTemplateForFamily(familyKey) {
    const prefix = familyKey === "triggered_edge" ? "entry_triggered_edge_"
        : familyKey === "penetration" ? "entry_penetration_"
        : null;
    if (prefix) {
        const t = PLANNED_ENTRY_MODES.find((p) => typeof p.mode === "string" && p.mode.startsWith(prefix));
        if (t) return t;
    }
    return PLANNED_ENTRY_MODES.find((p) => p.mode === "baseline") || {};
}

function summaryHasMetrics(src) {
    if (!src || typeof src !== "object") return false;
    return firstNumber(src, "net_r", "netR", "net", "net_r_total") != null
        || firstNumber(src, "fills", "filled", "filled_trades", "fill_count") != null
        || firstNumber(src, "eligible_setups", "eligible", "trades", "trade_count", "total_trades") != null
        || firstNumber(src, "wins", "winning_trades") != null;
}

export function entryRowForSelectedKey(run, key, baseline, activeVariant = "single_position") {
    if (!run || !key) return null;
    const canonical = canonicalEntryMode(key);
    if (canonical === "baseline") return null;

    const entryResults = run.entryResults || {};

    // Summary metrics for this exact mode (if the run exported them / they're resident).
    const summaryRows = flattenEntrySummary(entryResults.summary || run?.summary?.entry_results || {}, activeVariant);
    const src = summaryRows.find((r) => canonicalEntryMode(r.mode) === canonical) || null;

    // Resident rows merged by the lazy loader (ensureVariantTrades) — try both key forms.
    const tbm = entryResults.tradesByMode || {};
    const modeTrades = tbm[`${activeVariant}__${canonical}`] || tbm[canonical]
        || tbm[`${activeVariant}__${key}`] || tbm[key] || null;

    const hasSummary = summaryHasMetrics(src);
    const hasRows    = Array.isArray(modeTrades) && modeTrades.length > 0;

    // Descriptor derived from the key (family / threshold / arm), labelled like the
    // selector + RunDetail: "Triggered Edge 25% · Arm C40".
    const familyKey = familyFromKey(canonical);
    const threshold = extractThreshold(canonical);
    const fillMode  = fillModeFromKey(canonical);
    const template  = plannedTemplateForFamily(familyKey);
    const familyLabel = familyKey === "triggered_edge" ? "Triggered Edge"
        : familyKey === "penetration" ? "Penetration"
        : (template.family || String(familyKey || "").replace(/_/g, " "));
    const arm = armCandleIndex(fillMode);
    const threshStr = threshold != null ? ` ${threshold}%` : "";
    const armStr = (familyKey === "penetration" || !Number.isFinite(arm) || arm === Number.MAX_SAFE_INTEGER)
        ? "" : ` · Arm C${arm}`;
    const label = `${familyLabel}${threshStr}${armStr}`;
    const planned = { ...template, mode: canonical, label, family: familyLabel, threshold };

    if (hasSummary || hasRows) {
        // Real row — entryRowFromSummary computes deltaVsBaseline vs the edge-touch baseline.
        return entryRowFromSummary(planned, src || {}, baseline, hasRows ? modeTrades : null);
    }
    // Neither summary metrics nor resident rows yet → loading placeholder, NOT fake 0s.
    return {
        ...planned,
        exact: true, isBaseline: false, selectedPending: true,
        eligible: null, trades: null, fills: null, fillPct: null,
        wins: null, losses: null, winRate: null, netR: null, expectancy: null,
        maxDD: null, deltaVsBaseline: null,
    };
}

// ── Highlights ────────────────────────────────────────────────────────────────
// Highlights are per-family, not cross-family global bests. Flags set:
//
//   isBestNetRInFamily       — best Net R within the model's family
//   isBestExpectancyInFamily — best Expectancy within the model's family
//   isLowestDDInFamily       — lowest drawdown within the model's family
//   isBestFillPctInFamily    — best fill% within the model's family ONLY
//                              (fill% means different things per family —
//                               it is NEVER tagged globally)
//   isBestPFInFamily         — best Profit Factor within the model's family
//   isGlobalBestNetR         — single overall Net R winner across all families
//                              (used by the cross-family comparison card)
//
// Backward-compat aliases for existing consumers:
//   isBestNetR       = isBestNetRInFamily   (row highlighter in ExactResultsPanel)
//   isBestExpectancy = isBestExpectancyInFamily
//   isLowestDD       = isLowestDDInFamily
//   isBestPF         = isBestPFInFamily
//   isBestFillPct    — INTENTIONALLY NOT aliased. Cross-family fill% comparison
//                      is misleading. ExactResultsPanel uses isBestFillPctInFamily.
//
// Families with only 1 model (e.g., Baseline) do not receive best-in-family
// highlight tags — a winner of 1 is not a meaningful winner.

export function markHighlights(rows) {
    // Clear all highlight flags first to avoid stale state between re-renders
    rows.forEach(r => {
        delete r.isBestNetR;
        delete r.isBestExpectancy;
        delete r.isLowestDD;
        delete r.isBestFillPct;      // deprecated — do not re-set globally
        delete r.isBestPF;
        delete r.isBestNetRInFamily;
        delete r.isBestExpectancyInFamily;
        delete r.isLowestDDInFamily;
        delete r.isBestFillPctInFamily;
        delete r.isBestPFInFamily;
        delete r.isGlobalBestNetR;
    });

    // Tested rows (non-baseline) are the candidate set
    const tested = rows.filter(r => r.exact && !r.isBaseline);
    const exact  = tested.length ? tested : rows.filter(r => r.exact);

    // ── Global best Net R (single cross-family winner) ────────────────────────
    // Consumed by the cross-family comparison card. NOT shown in RowTags.
    const gNet = bestBy(exact, "netR");
    if (gNet) gNet.isGlobalBestNetR = true;

    // ── Per-family highlights ─────────────────────────────────────────────────
    const families = [...new Set(exact.map(r => r.family).filter(Boolean))];

    families.forEach(family => {
        const familyRows = exact.filter(r => r.family === family);

        // Only meaningful when there are ≥ 2 models in the family.
        // A single-model family is always the "winner" — that tag provides no signal.
        if (familyRows.length < 2) return;

        const bNet  = bestBy(familyRows, "netR");
        const bExp  = bestBy(familyRows, "expectancy");
        const loDD  = bestByLowest(familyRows, "maxDD");
        const bPF   = bestBy(familyRows, "profitFactor");
        // Fill rate is only compared within a family (same denominator semantics)
        const bFill = bestBy(familyRows, "fillPct");

        if (bNet)  bNet.isBestNetRInFamily        = true;
        if (bExp)  bExp.isBestExpectancyInFamily   = true;
        if (loDD)  loDD.isLowestDDInFamily         = true;
        if (bPF)   bPF.isBestPFInFamily            = true;
        if (bFill) bFill.isBestFillPctInFamily     = true;
    });

    // ── Backward compat aliases ───────────────────────────────────────────────
    // Consumers that read isBestNetR / isBestExpectancy / isLowestDD / isBestPF
    // will continue to work. isBestFillPct is intentionally NOT aliased.
    exact.forEach(r => {
        if (r.isBestNetRInFamily)        r.isBestNetR       = true;
        if (r.isBestExpectancyInFamily)  r.isBestExpectancy = true;
        if (r.isLowestDDInFamily)        r.isLowestDD       = true;
        if (r.isBestPFInFamily)          r.isBestPF         = true;
        // NOTE: isBestFillPct NOT aliased. See header comment above.
    });
}

export function bestBy(rows, key) {
    return rows.reduce((best, row) =>
        isFiniteNumber(row?.[key]) && (!best || Number(row[key]) > Number(best[key])) ? row : best
    , null);
}

export function bestByLowest(rows, key) {
    return rows.reduce((best, row) =>
        isFiniteNumber(row?.[key]) && (!best || Number(row[key]) > Number(best[key])) ? row : best
    , null);
}

// ── Summary ───────────────────────────────────────────────────────────────────
// V2 CHANGE: now returns perFamily in addition to global summary.
// Global bestFill is marked deprecated — use perFamily[familyKey].bestFillPct.

export function buildExactSummary(rows) {
    const tested     = rows.filter(r => r.exact && !r.isBaseline);
    const candidates = tested.length ? tested : rows.filter(r => r.exact);

    // ── Global (backward compat) ──────────────────────────────────────────────
    const global = {
        bestModel:  bestBy(candidates, "netR"),
        bestDelta:  bestBy(candidates, "deltaVsBaseline"),
        // DEPRECATED: bestFill is cross-family and misleading. Use perFamily[k].bestFillPct.
        bestFill:   null,
        lowestDD:   bestByLowest(candidates, "maxDD"),
        bestPF:     bestBy(candidates, "profitFactor"),
    };

    // ── Per-family ────────────────────────────────────────────────────────────
    const families = [...new Set(candidates.map(r => r.family).filter(Boolean))];
    const perFamily = {};
    families.forEach(family => {
        const fr = candidates.filter(r => r.family === family);
        perFamily[family] = {
            bestNetR:    bestBy(fr, "netR"),
            bestExp:     bestBy(fr, "expectancy"),
            lowestDD:    bestByLowest(fr, "maxDD"),
            bestFillPct: bestBy(fr, "fillPct"),   // within-family fill is meaningful
            bestPF:      bestBy(fr, "profitFactor"),
            modelCount:  fr.length,
        };
    });

    return { ...global, perFamily };
}

// ── Direction synthesis ───────────────────────────────────────────────────────
// Returns per-direction analysis across all models with trade data.
// Used by DirectionPanel for best-model cards and asymmetry warnings.
//
// bestModelByDirection feeds buildMixedDirectionSimulation (see below).
// Keep bestLongModel / bestShortModel on the returned object.

export function bestModelByDirection(exactRows, tradesByMode, activeVariant = "single_position") {
    const rows = (exactRows || []).filter(r => r.exact && !r.isBaseline);

    const results = rows.map(row => {
        const modeKey = String(row.mode || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        const modeTrades =
            tradesByMode?.[`${activeVariant}__${modeKey}`] ||
            tradesByMode?.[modeKey] ||
            null;
        if (!modeTrades?.length) return null;

        const split  = buildDirectionSplit(modeTrades);
        const longN  = split.longs.count;
        const shortN = split.shorts.count;
        const wrDelta = (isFiniteNumber(split.longs.winRate) && isFiniteNumber(split.shorts.winRate))
            ? split.longs.winRate - split.shorts.winRate
            : null;

        return {
            row,
            longNetR:         split.longs.netR,
            longExp:          split.longs.expectancy,
            longWR:           split.longs.winRate,
            longN,
            shortNetR:        split.shorts.netR,
            shortExp:         split.shorts.expectancy,
            shortWR:          split.shorts.winRate,
            shortN,
            wrDelta,
            longConfidence:   sampleConfidence(longN),
            shortConfidence:  sampleConfidence(shortN),
            isDirectionallyAsymmetric: wrDelta != null && Math.abs(wrDelta) > 20,
        };
    }).filter(Boolean);

    if (!results.length) {
        return { bestLongModel: null, bestShortModel: null, bestBalancedModel: null, rows: [], minDirN: MIN_DIRECTION_N };
    }

    // Best long: highest long expectancy among models with sufficient long-side N
    const longCandidates  = results.filter(r => r.longN  >= MIN_DIRECTION_N);
    const shortCandidates = results.filter(r => r.shortN >= MIN_DIRECTION_N);

    const bestLongModel  = longCandidates.reduce(
        (best, r) => !best || r.longExp  > best.longExp  ? r : best, null);
    const bestShortModel = shortCandidates.reduce(
        (best, r) => !best || r.shortExp > best.shortExp ? r : best, null);

    // Balanced: lowest abs(wrDelta) among models with sufficient N on both sides.
    // Useful when you want one model for both directions.
    const bothSideCandidates = results.filter(
        r => r.longN >= MIN_DIRECTION_N && r.shortN >= MIN_DIRECTION_N && r.wrDelta != null);
    const bestBalancedModel = bothSideCandidates.reduce(
        (best, r) => !best || Math.abs(r.wrDelta) < Math.abs(best.wrDelta) ? r : best, null);

    return {
        bestLongModel,
        bestShortModel,
        bestBalancedModel,
        rows: results,
        minDirN: MIN_DIRECTION_N,
    };
}

// ── Mixed-direction simulation ────────────────────────────────────────────────
//
// buildMixedDirectionSimulation — exploratory / in-sample research tool.
//
// Asks: "What would the combined performance look like if I routed long setups
// through Model A and short setups through Model B?"
//
// Mechanics:
//   1. Resolve tradesByMode for each model using the same key pattern as
//      bestModelByDirection (activeVariant__normalizedKey || normalizedKey).
//   2. Filter filled trades only (cancelled_before_entry excluded).
//   3. Isolate longs from longModel, shorts from shortModel.
//   4. Tag each trade with _simSide: "long" | "short" (spread copy, no mutation).
//   5. Merge + sort by entry/exit timestamp for a realistic equity curve.
//   6. Compute combined stats: winRate, netR, expectancy, maxDD, profitFactor.
//
// Returns null stats when totalN === 0 (nothing to show).
// Low-N warning threshold provided as lowN flag (< MIN_DIRECTION_N per side).
//
export function buildMixedDirectionSimulation({
    longModelKey,
    shortModelKey,
    tradesByMode,
    activeVariant = "single_position",
}) {
    // ── Helper: resolve trades for a model key ────────────────────────────────
    function resolveModelTrades(modeKey) {
        if (!modeKey || !tradesByMode) return [];
        const norm = String(modeKey)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        return (
            tradesByMode[`${activeVariant}__${norm}`] ||
            tradesByMode[norm] ||
            []
        );
    }

    // ── Helper: isFilled predicate (canonical) ────────────────────────────────
    function isFilled(t) {
        return (
            t.cancelled_before_entry !== true &&
            (t.entry_model_filled === true || (t.missed_trade !== true && !!t.entry))
        );
    }

    // ── Get raw trades per model ──────────────────────────────────────────────
    const longAllTrades  = resolveModelTrades(longModelKey);
    const shortAllTrades = resolveModelTrades(shortModelKey);

    // ── Filter to filled only ─────────────────────────────────────────────────
    const longFilled  = longAllTrades.filter(isFilled);
    const shortFilled = shortAllTrades.filter(isFilled);

    // ── Direction predicates (canonical) ─────────────────────────────────────
    const isLong  = t => (t.direction || t.bias || "").toLowerCase().includes("long")
                      || (t.direction || "").toLowerCase() === "buy";
    const isShort = t => (t.direction || t.bias || "").toLowerCase().includes("short")
                      || (t.direction || "").toLowerCase() === "sell";

    // ── Isolate direction-specific filled trades ──────────────────────────────
    const longTrades  = longFilled.filter(isLong).map(t => ({ ...t, _simSide: "long" }));
    const shortTrades = shortFilled.filter(isShort).map(t => ({ ...t, _simSide: "short" }));

    const longN  = longTrades.length;
    const shortN = shortTrades.length;

    // ── Compute per-side Net R ────────────────────────────────────────────────
    const longNetR  = round1(longTrades.reduce((s, t)  => s + rOf(t), 0));
    const shortNetR = round1(shortTrades.reduce((s, t) => s + rOf(t), 0));

    // ── Merge and sort by entry/exit timestamp ────────────────────────────────
    const merged = [...longTrades, ...shortTrades].sort((a, b) => {
        const da = parseDate(a.entry || a.exit || "");
        const db = parseDate(b.entry || b.exit || "");
        if (da && db) return da - db;
        if (da) return -1;
        if (db) return 1;
        return 0;
    });

    const totalN = merged.length;

    if (totalN === 0) {
        return {
            longModelKey,
            shortModelKey,
            longN: 0,
            shortN: 0,
            longNetR: 0,
            shortNetR: 0,
            totalN: 0,
            lowN: true,
            stats: null,
        };
    }

    // ── Combined stats ────────────────────────────────────────────────────────
    const wins   = merged.filter(t => rOf(t) > 0).length;
    const losses = merged.filter(t => rOf(t) < 0).length;
    const netR   = round1(merged.reduce((s, t) => s + rOf(t), 0));

    const stats = {
        wins,
        losses,
        winRate:      round1((wins / totalN) * 100),
        netR,
        expectancy:   totalN ? netR / totalN : 0,
        maxDD:        maxDrawdown(merged),
        profitFactor: calcProfitFactor(merged),
    };

    return {
        longModelKey,
        shortModelKey,
        longN,
        shortN,
        longNetR,
        shortNetR,
        totalN,
        lowN: longN < MIN_DIRECTION_N || shortN < MIN_DIRECTION_N,
        stats,
    };
}

// ── Bucket / session helpers ─────────────────────────────────────────────────

// BUG FIX retained: `fills` param — session buckets no longer hardcode fillPct=100
export function bucket(label, rows, fills = rows) {
    const wins = rows.filter(t => rOf(t) > 0).length;
    const netR = rows.reduce((s, t) => s + rOf(t), 0);
    return {
        label,
        count:    rows.length,
        fills:    fills.length,
        fillPct:  rows.length ? (fills.length / rows.length) * 100 : 0,
        winRate:  rows.length ? (wins / rows.length) * 100 : 0,
        netR:     round1(netR),
        expectancy: rows.length ? netR / rows.length : 0,
        exact: true,
    };
}

export function sessionRows(trades) {
    return SESSIONS.map(label =>
        bucket(label, trades.filter(t => sessionOf(t.entry) === label))
    );
}

export function sessionRowsForModel(allTrades, modelTrades) {
    return SESSIONS.map(label => {
        const eligible = allTrades.filter(t => sessionOf(t.entry) === label);
        const filled   = (modelTrades || []).filter(t => sessionOf(t.entry) === label);
        return bucket(label, eligible, filled);
    });
}

// ── Heatmap grids ────────────────────────────────────────────────────────────

export function buildHourGrid(trades) {
    const cells = {};
    let total = 0;
    (trades || []).forEach(trade => {
        const d = parseDate(trade.entry);
        if (!d) return;
        const key = `${dayIndex(d.getUTCDay())}-${d.getUTCHours()}`;
        if (!cells[key]) cells[key] = { count: 0, netR: 0 };
        cells[key].count += 1;
        cells[key].netR  += rOf(trade);
        total += 1;
    });
    Object.values(cells).forEach(cell => { cell.netR = round1(cell.netR); });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    return { cells, total, maxAbs };
}

// BUG FIX retained: toxicity grid takes only losing trades
export function buildToxicityGrid(trades) {
    return buildHourGrid((trades || []).filter(t => rOf(t) < 0));
}

// ── Trade-off analytics (missed winners / avoided losers) ────────────────────

export function buildTradeOffStats(baselineTrades, modelTrades) {
    const baselineList = Array.isArray(baselineTrades) ? baselineTrades : [];
    const modelList    = Array.isArray(modelTrades) ? modelTrades : [];

    if (!baselineList.length) return null;

    const modelIds = new Set(modelList.map(t => tradeKey(t)));

    const baselineWins   = baselineList.filter(t => rOf(t) > 0);
    const baselineLosses = baselineList.filter(t => rOf(t) < 0);

    const missedWinners   = baselineWins.filter(t => !modelIds.has(tradeKey(t)));
    const avoidedLosers   = baselineLosses.filter(t => !modelIds.has(tradeKey(t)));
    const capturedWinners = baselineWins.filter(t => modelIds.has(tradeKey(t)));
    const takenLosers     = baselineLosses.filter(t => modelIds.has(tradeKey(t)));

    const missedWinnerR   = missedWinners.reduce((s, t) => s + rOf(t), 0);
    const avoidedLoserR   = Math.abs(avoidedLosers.reduce((s, t) => s + rOf(t), 0));
    const capturedWinnerR = capturedWinners.reduce((s, t) => s + rOf(t), 0);
    const takenLoserR     = Math.abs(takenLosers.reduce((s, t) => s + rOf(t), 0));

    const missedWinnerPct  = baselineWins.length   ? (missedWinners.length / baselineWins.length)   * 100 : 0;
    const avoidedLoserPct  = baselineLosses.length ? (avoidedLosers.length / baselineLosses.length) * 100 : 0;
    const tradeOffRatio    = missedWinnerPct > 0 ? round1(avoidedLoserPct / missedWinnerPct) : null;

    return {
        baselineWins: baselineWins.length,
        baselineLosses: baselineLosses.length,
        missedWinners: missedWinners.length,
        missedWinnerPct: round1(missedWinnerPct),
        missedWinnerR: round1(missedWinnerR),
        avoidedLosers: avoidedLosers.length,
        avoidedLoserPct: round1(avoidedLoserPct),
        avoidedLoserR: round1(avoidedLoserR),
        capturedWinners: capturedWinners.length,
        capturedWinnerR: round1(capturedWinnerR),
        takenLosers: takenLosers.length,
        takenLoserR: round1(takenLoserR),
        tradeOffRatio,
        netRImpact: round1(avoidedLoserR - missedWinnerR),
    };
}

function tradeKey(t) {
    const primary =
        t?.base_trade_id
        ?? t?.baseTradeId
        ?? t?.trade_id
        ?? t?.id
        ?? (t?.obId || t?.ob_id
            ? `${t.obId || t.ob_id}:${t.direction || t.bias || ""}`
            : "");
    return String(primary || t?.entry || "");
}

// ── Direction split ──────────────────────────────────────────────────────────

export function buildDirectionSplit(trades) {
    const list   = Array.isArray(trades) ? trades : [];
    const longs  = list.filter(t => (t.direction || t.bias || "").toLowerCase().includes("long")  || (t.direction || "").toLowerCase() === "buy");
    const shorts = list.filter(t => (t.direction || t.bias || "").toLowerCase().includes("short") || (t.direction || "").toLowerCase() === "sell");
    return { longs: bucketDir("Long", longs), shorts: bucketDir("Short", shorts), total: list.length };
}

function bucketDir(label, rows) {
    const wins   = rows.filter(t => rOf(t) > 0).length;
    const losses = rows.filter(t => rOf(t) < 0).length;
    const netR   = rows.reduce((s, t) => s + rOf(t), 0);
    return {
        label, count: rows.length, wins, losses,
        winRate:    rows.length ? (wins / rows.length) * 100 : 0,
        netR:       round1(netR),
        expectancy: rows.length ? round1(netR / rows.length) : 0,
        profitFactor: calcProfitFactor(rows),
    };
}

// ── Analytics bundle ──────────────────────────────────────────────────────────
// Uses metricsProfile field lookups instead of mode-string matching.
// FunnelPanel data is attached directly on each entry row via buildTriggeredEdgeFunnel.

export function buildEntryAnalytics(trades, exactRows) {
    const list          = Array.isArray(trades) ? trades : [];
    const wins          = list.filter(t => rOf(t) > 0).length;
    const losses        = list.filter(t => rOf(t) < 0).length;
    const exactEntryRows = exactRows.filter(r => r.exact);

    // V2: use metricsProfile from the row (which comes from PLANNED_ENTRY_MODES spread)
    // instead of startsWith string matching. Falls back to string check for rows
    // without metricsProfile (legacy/malformed data).
    const penetrationExactRows = exactEntryRows.filter(r =>
        r.metricsProfile === "penetration" ||
        // Legacy fallback — rows pre-dating V2 registry fields
        (!r.metricsProfile && String(r.mode).startsWith("entry_penetration"))
    );

    return {
        wins, losses,
        fillRateRows:     exactEntryRows,
        penetrationRows:  penetrationExactRows,
        sessionRows:      sessionRows(list),
        hourGrid:         buildHourGrid(list),
        toxicityGrid:     buildToxicityGrid(list),   // BUG FIX retained
        matrixRows:       buildMatrixRows(exactRows, wins, losses),
        directionSplit:   buildDirectionSplit(list),
        // FunnelPanel data lives on each entry row (row.triggeredEdgeFunnel), not in this bundle.
    };
}

function buildMatrixRows(exactRows, wins, losses) {
    const baseline = exactRows.find(r => r.isBaseline) || {};

    // V2: use metricsProfile for family filtering — no startsWith string matching.
    // Includes legacy fallback for rows without the new registry fields.
    const penetration = exactRows.filter(r =>
        r.exact && (
            r.metricsProfile === "penetration" ||
            (!r.metricsProfile && String(r.mode).startsWith("entry_penetration"))
        )
    );
    const triggeredEdge = exactRows.filter(r =>
        r.exact && (
            r.requiresLifecycleFunnel === true ||
            (!r.metricsProfile && String(r.mode).startsWith("entry_triggered_edge"))
        )
    );

    return [
        { label: "Baseline", fills: baseline.fills, wins, losses, winRate: baseline.winRate, netR: baseline.netR, status: "Exact", exact: true },
        ...penetration.map(r => ({ label: r.label, fills: r.fills, wins: r.wins, losses: r.losses, winRate: r.winRate, netR: r.netR, status: "Exact", exact: true })),
        ...triggeredEdge.map(r => ({ label: r.label, fills: r.fills, wins: r.wins, losses: r.losses, winRate: r.winRate, netR: r.netR, status: "Exact", exact: true })),
        { label: "Confirmation", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Awaiting exporter", exact: false },
        { label: "Lifecycle Cancel", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Architecture only", exact: false },
    ];
}

// ── CSV export ────────────────────────────────────────────────────────────────

export function entryResultsToCsv(exactRows) {
    const fields = [
        "mode","label","family","threshold","eligible","fills","fillPct",
        "wins","losses","winRate","netR","expectancy","maxDD","profitFactor",
        "avgMAE","avgMFE","avgTimeToTP","avgTimeToSL","deltaVsBaseline",
        // triggered-edge funnel fields (empty for non-lifecycle models)
        "triggerRate","fillAfterTriggerRate","retraceCancelCount",
        "sameCandleCount","nextCandleCount","avgTriggerToEntry",
    ];
    const rows = exactRows.map(r => fields.map(f => r[f] ?? "").join(","));
    return [fields.join(","), ...rows].join("\n");
}

export function downloadCsv(filename, csvString) {
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
