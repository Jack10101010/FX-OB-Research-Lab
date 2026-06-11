// beResolve.js — Break-even EXACT vs REPLAY source resolution.
//
// BE-FRONTEND-INTEGRATION Phase G. Pure functions, no React, no imports —
// self-contained so the validation harness can run it directly.
//
// Purpose
// -------
// The backend (Lux-OB-Backtester) now exports exact 1-minute break-even replay
// scenarios. The frontend BreakevenTab historically computed every scenario
// client-side via beReplay.js (candle-walk, REPLAY tier). This module decides,
// per (executionMode, triggerBasis, armLevelR) selection, whether a matching
// EXACT backend scenario exists. If so, callers use the backend numbers
// (EXACT tier); otherwise they fall back to the existing REPLAY pipeline.
//
// It NEVER runs the replay itself — BreakevenTab keeps that flow. It only:
//   • resolves a backend scenario by tolerant key matching, and
//   • shapes the backend summary into the same object BreakevenTab already
//     renders (so the table/hero/cards need no structural change).
//
// Scenario key forms handled
// --------------------------
//   backend:   be_wick_0p50R, be_close_1p00R   (2dp, dot→p, trailing R)
//   selection: { triggerBasis: "wick", armLevelR: 0.5 }
// Matching is tolerant: 0.5 ⇄ 0p50, 1 ⇄ 1p00, case-insensitive, optional R.

// ── key helpers ─────────────────────────────────────────────────────────────

/** Arm level number → backend token, e.g. 0.5 → "0p50", 1 → "1p00". */
export function formatArmToken(armLevelR) {
    const n = Number(armLevelR);
    if (!Number.isFinite(n)) return null;
    return n.toFixed(2).replace(".", "p");
}

/** Build the canonical backend scenario key for a selection. */
export function beScenarioKey(triggerBasis, armLevelR) {
    const token = formatArmToken(armLevelR);
    const trig = String(triggerBasis || "").toLowerCase();
    if (!token || (trig !== "wick" && trig !== "close")) return null;
    return `be_${trig}_${token}R`;
}

/** Parse any backend BE scenario key → { triggerBasis, armLevelR } or null. */
export function parseBeScenarioKey(key) {
    const m = String(key || "").match(/^be_(wick|close)_(\d+)p(\d+)r?$/i);
    if (!m) return null;
    const armLevelR = Number(`${parseInt(m[2], 10)}.${m[3]}`);
    return {
        triggerBasis: m[1].toLowerCase(),
        armLevelR: Number.isFinite(armLevelR) ? armLevelR : null,
    };
}

const ARM_EPS = 1e-6;

/**
 * Resolve which execution mode to read from a nested BE map. Prefers the
 * requested mode; otherwise, when exactly one mode exists, uses it; else null.
 */
function resolveExecutionMode(maps, requested) {
    const keys = new Set();
    for (const map of maps) {
        if (map && typeof map === "object") for (const k of Object.keys(map)) keys.add(k);
    }
    if (requested && keys.has(requested)) return requested;
    const list = [...keys];
    return list.length === 1 ? list[0] : (requested || null);
}

/**
 * Find the key in `keys` that matches the selection — first by exact (case-
 * insensitive) equality with the canonical wanted key, then by parsed
 * (triggerBasis, armLevelR) equivalence. The parse path makes matching tolerant
 * of decimal-form differences (0p5 ⇄ 0p50, 1p0 ⇄ 1p00).
 */
function matchKeyInList(keys, wantKey, triggerBasis, armLevelR) {
    const trig = String(triggerBasis || "").toLowerCase();
    const arm = Number(armLevelR);
    for (const k of keys) {
        if (wantKey && k.toLowerCase() === wantKey.toLowerCase()) return k;
    }
    for (const k of keys) {
        const parsed = parseBeScenarioKey(k);
        if (parsed && parsed.triggerBasis === trig
            && parsed.armLevelR != null && Math.abs(parsed.armLevelR - arm) < ARM_EPS) {
            return k;
        }
    }
    return null;
}

const obj = (x) => (x && typeof x === "object" ? x : {});

/** Resolve the entry-variant key to look up. Null/empty ⇒ "baseline". */
function wantedEntryKey(entryVariantKey) {
    const k = String(entryVariantKey || "").trim();
    return k || "baseline";
}

/**
 * Find a backend scenario matching the selection — variant-aware.
 *
 * Storage is nested: beResults[mode][entryVariantKey][beKey] and
 * beTradesByMode[mode][entryVariantKey][beKey]. Resolution order:
 *   1. execution mode
 *   2. entry-variant key — EXACT match only. A requested variant NEVER falls
 *      back to baseline (integrity rule). Null/empty entryVariantKey ⇒ baseline.
 *   3. be-scenario key tolerance (0p5 ⇄ 0p50, etc.), summary + trades matched
 *      independently so a decimal-form mismatch can't drop the trades.
 *
 * @returns { executionMode, entryVariantKey, scenarioKey, summaryRaw, trades } | null
 */
export function findBeScenario(beResults, beTradesByMode, selection = {}) {
    const { executionMode, entryVariantKey, triggerBasis, armLevelR } = selection;
    const results = obj(beResults);
    const tradesMap = obj(beTradesByMode);

    const em = resolveExecutionMode([results, tradesMap], executionMode);
    if (!em) return null;

    const wantEntry = wantedEntryKey(entryVariantKey);
    // EXACT entry match only — no variant→baseline fallback.
    const resInner = obj(obj(results[em])[wantEntry]);
    const tradesInner = obj(obj(tradesMap[em])[wantEntry]);
    if (!Object.keys(resInner).length && !Object.keys(tradesInner).length) return null;

    const wantKey = beScenarioKey(triggerBasis, armLevelR);
    const summaryKey = matchKeyInList(Object.keys(resInner), wantKey, triggerBasis, armLevelR);
    const tradesKey  = matchKeyInList(Object.keys(tradesInner), wantKey, triggerBasis, armLevelR);

    const trades = tradesKey && Array.isArray(tradesInner[tradesKey]) ? tradesInner[tradesKey] : null;
    const summaryRaw = summaryKey ? (resInner[summaryKey] ?? null) : null;

    // Require at least one of trades / summary to consider EXACT available.
    if (!trades && !summaryRaw) return null;

    return { executionMode: em, entryVariantKey: wantEntry, scenarioKey: summaryKey || tradesKey, summaryRaw, trades };
}

// ── number helpers ──────────────────────────────────────────────────────────

function num(v) {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function rnd(v, n = 2) { const f = 10 ** n; return Math.round(Number(v) * f) / f; }
function rowR(t) {
    return num(t?.net_r) ?? num(t?.netR) ?? num(t?.r) ?? num(t?.pnl_r) ?? num(t?.be_exit_r) ?? num(t?.beExitR) ?? 0;
}

/** Read a backend summary field by snake_case or camelCase alias. */
function field(summaryRaw, ...names) {
    if (!summaryRaw || typeof summaryRaw !== "object") return null;
    for (const name of names) {
        if (summaryRaw[name] != null && summaryRaw[name] !== "") {
            const n = num(summaryRaw[name]);
            if (n != null) return n;
        }
    }
    return null;
}

/**
 * Build an EXACT summary in the SAME shape buildBeScenarioSummary (beReplay.js)
 * returns, so BreakevenTab's table/hero/cards render unchanged.
 *
 * Per-trade R metrics (netR, profitFactor, maxDrawdown, worstLossStreak) are
 * computed from the backend scenario trades. Comparison metrics that require the
 * backend's own baseline pairing (losses_saved, winners_cut, loser_r_saved,
 * winner_r_cost, efficiency_ratio, delta_net_r) are read from the backend
 * summary, with defensive fallbacks. EXACT runs are 1-minute, so there is no
 * candle-coverage gap and no same-candle ambiguity.
 */
export function buildExactBeSummary(beTrades, summaryRaw = null, baseline = null) {
    const trades = Array.isArray(beTrades) ? beTrades : [];

    let netR = 0, sumPos = 0, sumNeg = 0, winCount = 0, lossCount = 0;
    let cum = 0, peak = -Infinity, maxDrawdown = 0;
    let worstLossStreak = 0, curStreak = 0;
    let beExitCountComputed = 0;

    for (const t of trades) {
        const r = rowR(t);
        netR += r;
        if (r > 0) { winCount++; sumPos += r; }
        else if (r < 0) { lossCount++; sumNeg += r; }

        cum += r;
        if (cum > peak) peak = cum;
        const dd = cum - peak;
        if (dd < maxDrawdown) maxDrawdown = dd;

        if (r < 0) { curStreak++; if (curStreak > worstLossStreak) worstLossStreak = curStreak; }
        else curStreak = 0;

        const reason = String(t?.be_exit_reason ?? t?.beExitReason ?? "").toLowerCase();
        const triggered = t?.be_triggered === true || t?.beTriggered === true || reason === "be_stop";
        if (triggered) beExitCountComputed++;
    }

    const profitFactor = sumNeg < 0 ? rnd(sumPos / Math.abs(sumNeg)) : null;
    const tradeCount = trades.length;

    const baselineNetR = baseline?.netR ?? null;
    const deltaNetR = field(summaryRaw, "delta_net_r", "deltaNetR")
        ?? (baselineNetR != null ? rnd(netR - baselineNetR) : null);

    const beExitCount = field(summaryRaw, "be_exit_count", "beExitCount") ?? beExitCountComputed;
    const lossesSaved = field(summaryRaw, "losses_saved", "lossesSaved") ?? 0;
    const winnersCut  = field(summaryRaw, "winners_cut", "winnersCut") ?? 0;
    const loserRSaved = field(summaryRaw, "loser_r_saved", "loserRSaved") ?? 0;
    const winnerRCost = field(summaryRaw, "winner_r_cost", "winnerRCost") ?? 0;
    const efficiencyRatio = field(summaryRaw, "efficiency_ratio", "efficiencyRatio");
    const filledTrades = field(summaryRaw, "filled_trades", "filledTrades");

    return {
        // EXACT has full 1-minute coverage and no candle-resolution gaps.
        tradeCount,
        replayedCount: filledTrades != null ? filledTrades : tradeCount,
        coveragePct: 100,
        missingPathCount: 0,
        outOfRangeCount: 0,
        sameCandleAmbiguousCount: 0,
        netR: rnd(netR),
        baselineNetR,
        deltaNetR,
        profitFactor,
        baselineProfitFactor: baseline?.profitFactor ?? null,
        deltaProfitFactor: null,
        winCount,
        lossCount,
        beExitCount,
        winnersCut,
        lossesSaved,
        winnerRCost: rnd(winnerRCost),
        loserRSaved: rnd(loserRSaved),
        efficiencyRatio,
        maxDrawdown: rnd(maxDrawdown),
        baselineMaxDrawdown: baseline?.maxDrawdown ?? null,
        deltaMaxDrawdown: (baseline?.maxDrawdown != null) ? rnd(rnd(maxDrawdown) - baseline.maxDrawdown) : null,
        worstLossStreak,
        baselineWorstLossStreak: baseline?.worstLossStreak ?? null,
        deltaWorstLossStreak: (baseline?.worstLossStreak != null) ? worstLossStreak - baseline.worstLossStreak : null,
        equityCurve: [],
    };
}

/**
 * Resolve the source for a single BE scenario selection.
 *
 * @returns {{
 *   source: "EXACT" | "REPLAY",
 *   scenarioKey: string | null,
 *   executionMode: string | null,
 *   summary: object | null,   // EXACT summary (shape matches buildBeScenarioSummary); null for REPLAY
 *   trades: object[] | null,  // backend scenario trades for EXACT; null for REPLAY
 *   summaryRaw: object | null // untouched backend summary object for EXACT
 * }}
 *
 * REPLAY means no matching backend scenario exists — the caller should keep its
 * existing client-side beReplay computation for this selection.
 */
export function resolveBeScenarioSource({
    armLevelR,
    triggerBasis,
    executionMode,
    entryVariantKey,
    beResults,
    beTradesByMode,
    baseline = null,
} = {}) {
    const found = findBeScenario(beResults, beTradesByMode, { executionMode, entryVariantKey, triggerBasis, armLevelR });
    if (!found) {
        // Reason precedence: no BE data at all → variant not present (baseline
        // BE is NOT substituted) → variant present but arm/trigger missing.
        let reason;
        if (!hasAnyExactBe(beResults, beTradesByMode)) {
            reason = "no_be_data";
        } else if (!entryVariantHasExact(beResults, beTradesByMode, { executionMode, entryVariantKey })) {
            reason = "no_matching_variant";
        } else {
            reason = "no_matching_scenario";
        }
        return {
            source: "REPLAY", scenarioKey: null, executionMode: executionMode ?? null,
            entryVariantKey: wantedEntryKey(entryVariantKey),
            summary: null, trades: null, summaryRaw: null, reason,
        };
    }
    return {
        source: "EXACT",
        scenarioKey: found.scenarioKey,
        executionMode: found.executionMode,
        entryVariantKey: found.entryVariantKey,
        summary: buildExactBeSummary(found.trades, found.summaryRaw, baseline),
        trades: found.trades,
        summaryRaw: found.summaryRaw,
        reason: "matched",
    };
}

/** True when the given entry-variant key has at least one exact BE scenario. */
export function entryVariantHasExact(beResults, beTradesByMode, { executionMode, entryVariantKey } = {}) {
    const results = obj(beResults);
    const tradesMap = obj(beTradesByMode);
    const em = resolveExecutionMode([results, tradesMap], executionMode);
    if (!em) return false;
    const wantEntry = wantedEntryKey(entryVariantKey);
    return Object.keys(obj(obj(results[em])[wantEntry])).length > 0
        || Object.keys(obj(obj(tradesMap[em])[wantEntry])).length > 0;
}

/**
 * Diagnostic snapshot of the BE data available on a run + the keys a selection
 * would look for. Pure; used by the BreakevenTab console diagnostic and tests.
 */
export function describeBeAvailability(beResults, beTradesByMode, { executionMode, entryVariantKey, triggerBasis, armLevelR } = {}) {
    const results = obj(beResults);
    const tradesMap = obj(beTradesByMode);
    const em = resolveExecutionMode([results, tradesMap], executionMode);
    const wantEntry = wantedEntryKey(entryVariantKey);
    const resByEntry = em ? obj(results[em]) : {};
    const tradesByEntry = em ? obj(tradesMap[em]) : {};
    const entryHasExact = entryVariantHasExact(results, tradesMap, { executionMode, entryVariantKey });
    return {
        hasAnyExact: hasAnyExactBe(results, tradesMap),
        beResultsExecutionModes: Object.keys(results),
        beTradesExecutionModes: Object.keys(tradesMap),
        resolvedExecutionMode: em,
        requestedEntryVariantKey: wantEntry,
        entryHasExact,
        availableEntryVariantKeys: [...new Set([...Object.keys(resByEntry), ...Object.keys(tradesByEntry)])],
        beResultsScenarioKeys: Object.keys(obj(resByEntry[wantEntry])),
        beTradesScenarioKeys: Object.keys(obj(tradesByEntry[wantEntry])),
        requestedKey: beScenarioKey(triggerBasis, armLevelR),
    };
}

/** True when any EXACT BE scenario exists for the given run maps (3-level nesting). */
export function hasAnyExactBe(beResults, beTradesByMode) {
    const has = (m) => !!(m && typeof m === "object"
        && Object.values(m).some((byEntry) => byEntry && typeof byEntry === "object"
            && Object.values(byEntry).some((byBe) => byBe && typeof byBe === "object" && Object.keys(byBe).length)));
    return has(beResults) || has(beTradesByMode);
}
