/**
 * fftPairingAnalytics.js — Paired FFT-OFF run analytics.
 *
 * Ghost tracking can be inaccurate when the cancelled setup uses the
 * `armed_after_ob_exit` path (ghost enters at a different candle than the
 * real simulation would). This module provides an authoritative alternative:
 * match each FFT-cancelled trade against the same OB in a paired FFT-OFF run
 * to get the actual outcome that would have occurred without FFT.
 *
 * Matching key:  ob_id  +  direction  +  entry_model_key  (all normalised)
 *
 * Confidence classification:
 *   HIGH  — paired OFF row exists AND OFF row represents a genuine fill attempt
 *            (outcome not INVALID / UNFILLED / NEVER_TRIGGERED) AND the ghost
 *            fill-delay is consistent with the OFF fill-delay (within ±5c).
 *   LOW   — any of:
 *              • no matching OFF row found
 *              • OFF row was INVALID / UNFILLED / cancelled for another reason
 *                (the counterfactual path was blocked by something else anyway)
 *              • ghost_fill_delay_candles diverges from OFF fill_delay_candles
 *                by >5 candles (signals `armed_after_ob_exit` path divergence)
 *
 * Derived aggregate metrics (across all HIGH-confidence pairs):
 *   confirmed_losses_avoided  — paired OFF outcome was LOSS / NEWS_FLATTEN
 *   confirmed_wins_removed    — paired OFF outcome was WIN
 *   confirmed_neutral         — paired OFF outcome was BREAKEVEN / INVALID / etc
 *   confirmed_net_r_impact    — sum(-pairedOffR) for losses avoided
 *                               + sum(-pairedOffR) for wins removed
 *                               = total R cost/benefit of the cancels
 *
 * All functions are pure — no React, no side effects.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function normStr(v) {
    return String(v ?? "").trim().toUpperCase();
}

function strId(v) {
    // Normalise ob_id: strip prefix, return numeric string or raw string
    if (v == null || v === "") return "";
    const s = String(v).trim();
    // "OB-006" → "6", "6" → "6", "ob_6" → "6"
    const m = s.match(/\d+/);
    return m ? String(Number(m[0])) : s.toLowerCase();
}

function numOrNull(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// ── OFF row classification ────────────────────────────────────────────────────

const FILL_OUTCOMES = new Set(["WIN", "LOSS", "NEWS_FLATTEN", "BREAKEVEN", "PROTECTION_EXIT"]);
const UNFILL_OUTCOMES = new Set(["INVALID", "UNFILLED", "NEVER_TRIGGERED", "INVALIDATED",
    "SESSION_FILTERED", "FIRST_FAILED_TAG_CANCEL"]);

/**
 * Returns "filled" | "unfilled" | "cancelled" for an OFF row outcome.
 * "unfilled" = trade never reached entry (INVALID, UNFILLED, etc.)
 * "cancelled" = stopped by a protective cancel (other than FFT)
 */
function offTradeStatus(offRow) {
    if (!offRow) return "no_match";
    const oc = normStr(offRow.outcome ?? offRow.result);
    if (FILL_OUTCOMES.has(oc)) return "filled";
    if (UNFILL_OUTCOMES.has(oc)) return "unfilled_or_cancelled";
    if (offRow.cancelled_before_entry === true || normStr(offRow.cancelled_before_entry) === "TRUE") {
        return "unfilled_or_cancelled";
    }
    return "unknown";
}

// ── confidence classification ────────────────────────────────────────────────

/**
 * Returns "HIGH" | "LOW" confidence for a (cancel, offRow) pair.
 *
 * HIGH requires all of:
 *   1. offRow exists
 *   2. offRow.outcome is a fill outcome (WIN/LOSS/NEWS_FLATTEN/BREAKEVEN)
 *   3. ghost_fill_delay_candles and OFF fill_delay_candles are within ±5c
 *      (or both absent — no delay mismatch detectable)
 */
function classifyConfidence(cancelTrade, offRow) {
    if (!offRow) return "LOW";

    const status = offTradeStatus(offRow);
    if (status !== "filled") return "LOW";   // OFF row was invalidated/unfilled

    // Check ghost-delay divergence (signals armed_after_ob_exit mismatch)
    const ghostDelay = numOrNull(cancelTrade.ghost_fill_delay_candles ?? cancelTrade.ghostFillDelayCandles);
    const offDelay   = numOrNull(offRow.fill_delay_candles ?? offRow.fillDelayCandles);

    if (ghostDelay != null && offDelay != null) {
        if (Math.abs(ghostDelay - offDelay) > 5) return "LOW";
    }

    return "HIGH";
}

// ── buildOffLookup ────────────────────────────────────────────────────────────

/**
 * Index an array of OFF-run trades for fast lookup by the matching key.
 *
 * Key format:  `${obId}|${direction}|${modelKey}`
 *
 * Multiple OFF rows for the same key are collected so callers can detect
 * ambiguous matches (should be rare but possible when the same OB produces
 * trades under two different execution modes).
 *
 * @param {Array<object>} offTrades
 * @returns {Map<string, object[]>}
 */
export function buildOffLookup(offTrades) {
    const map = new Map();
    if (!Array.isArray(offTrades)) return map;

    for (const row of offTrades) {
        const obId     = strId(row.ob_id ?? row.obId);
        const dir      = normStr(row.direction);
        const modelKey = normStr(row.entry_model_key ?? row.entryModelKey ?? row.entry_model ?? row.entryModel ?? "");

        if (!obId) continue;

        const key = `${obId}|${dir}|${modelKey}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    }

    return map;
}

// ── pairFftCancel ─────────────────────────────────────────────────────────────

/**
 * Match one FFT-cancelled trade row against the OFF lookup.
 *
 * Returns a structured pairing result containing:
 *   - all raw OFF fields needed for comparison
 *   - confidence classification
 *   - whether ghost prediction agreed with the paired OFF outcome
 *
 * @param {object} cancelTrade   — one FFT-cancelled row from the FFT run
 * @param {Map<string, object[]>} offLookup  — from buildOffLookup()
 * @returns {PairingResult}
 */
export function pairFftCancel(cancelTrade, offLookup) {
    const obId     = strId(cancelTrade.ob_id ?? cancelTrade.obId);
    const dir      = normStr(cancelTrade.direction);
    const modelKey = normStr(
        cancelTrade.entry_model_key ?? cancelTrade.entryModelKey ??
        cancelTrade.entry_model     ?? cancelTrade.entryModel ?? ""
    );

    const key     = `${obId}|${dir}|${modelKey}`;
    const matches = offLookup.get(key) ?? [];
    const offRow  = matches[0] ?? null;    // take first; multiple = ambiguous

    const confidence  = classifyConfidence(cancelTrade, offRow);
    const tradeStatus = offTradeStatus(offRow);

    // Paired OFF fields
    const pairedOffOutcome      = offRow ? normStr(offRow.outcome ?? offRow.result) : null;
    const pairedOffR            = offRow ? numOrNull(offRow.net_r ?? offRow.netR ?? offRow.pnl_r ?? offRow.pnlR) : null;
    const pairedOffFillTime     = offRow ? (offRow.fill_time ?? offRow.fillTime ?? null) : null;
    const pairedOffCancelReason = offRow ? normStr(offRow.cancel_reason ?? offRow.cancelReason ?? "") : null;
    const pairedOffFillDelay    = offRow ? numOrNull(offRow.fill_delay_candles ?? offRow.fillDelayCandles) : null;

    // Ghost fields for comparison
    const ghostOutcome   = normStr(cancelTrade.ghost_outcome   ?? cancelTrade.ghostOutcome   ?? "");
    const ghostR         = numOrNull(cancelTrade.ghost_r       ?? cancelTrade.ghostR);
    const ghostFillDelay = numOrNull(cancelTrade.ghost_fill_delay_candles ?? cancelTrade.ghostFillDelayCandles);

    // Did ghost prediction agree with paired OFF?
    const ghostMatchesOff = pairedOffOutcome != null && ghostOutcome === pairedOffOutcome;

    return {
        // Identity
        obId,
        direction: dir,
        modelKey,
        confidence,

        // OFF-paired fields
        hasPairedRow:           offRow != null,
        pairedOffOutcome,
        pairedOffR,
        pairedOffFillTime,
        pairedOffCancelReason,
        pairedOffFillDelay,
        pairedOffTradeStatus:   tradeStatus,
        isAmbiguous:            matches.length > 1,

        // Ghost fields (for side-by-side display)
        ghostOutcome:           ghostOutcome || null,
        ghostR,
        ghostFillDelay,
        ghostMatchesOff,

        // Move-away
        moveAwayPips: numOrNull(
            cancelTrade.fft_move_away_pips_at_cancel ??
            cancelTrade.fftMoveAwayPipsAtCancel
        ),

        // Raw rows for drill-down
        cancelTrade,
        offRow,
    };
}

// ── computePairedFftAnalytics ─────────────────────────────────────────────────

/**
 * Full paired FFT analytics from an FFT run's trades + a paired OFF run's trades.
 *
 * @param {Array<object>} fftTrades   — all trades from the FFT-enabled run
 * @param {Array<object>} offTrades   — all trades from the matched FFT-OFF run
 *                                      (same scenario, FFT disabled)
 * @returns {PairedFftResult}
 */
export function computePairedFftAnalytics(fftTrades, offTrades) {
    const fftList = Array.isArray(fftTrades) ? fftTrades : [];
    const offList = Array.isArray(offTrades)  ? offTrades  : [];

    const lookup = buildOffLookup(offList);

    // Identify FFT-cancelled rows
    const cancelRows = fftList.filter(isFftCancel);

    // Build per-cancel pairing results
    const pairs = cancelRows.map(t => pairFftCancel(t, lookup));

    // ── High-confidence aggregates ─────────────────────────────────────────
    const highConf = pairs.filter(p => p.confidence === "HIGH");

    let confirmedLossesAvoided = 0;
    let confirmedWinsRemoved   = 0;
    let confirmedNeutral       = 0;
    let confirmedNetRImpact    = 0;     // positive = net benefit to actual run

    for (const p of highConf) {
        const oc = p.pairedOffOutcome ?? "";

        if (oc === "WIN") {
            confirmedWinsRemoved++;
            // A removed win costs us that R
            if (p.pairedOffR != null) confirmedNetRImpact -= p.pairedOffR;
        } else if (oc === "LOSS" || oc === "NEWS_FLATTEN" || oc === "PROTECTION_EXIT") {
            confirmedLossesAvoided++;
            // Avoiding a loss saves us that |R| (pairedOffR is negative, so negate)
            if (p.pairedOffR != null) confirmedNetRImpact -= p.pairedOffR;
        } else {
            confirmedNeutral++;
        }
    }

    // ── Ghost agreement rate ───────────────────────────────────────────────
    const highPairedWithGhost = highConf.filter(p => p.ghostOutcome != null);
    const ghostCorrect        = highPairedWithGhost.filter(p => p.ghostMatchesOff).length;
    const ghostAccuracyRate   = highPairedWithGhost.length > 0
        ? (ghostCorrect / highPairedWithGhost.length) * 100
        : null;

    // ── Summary flags ──────────────────────────────────────────────────────
    const hasPairedData    = offList.length > 0;
    const pairsFound       = pairs.filter(p => p.hasPairedRow).length;
    const highConfCount    = highConf.length;
    const lowConfCount     = pairs.length - highConf.length;

    return {
        // Per-cancel detail rows — use for table display
        pairs,

        // Counts
        fftCancels:             cancelRows.length,
        pairsFound,
        highConfCount,
        lowConfCount,

        // Primary derived metrics (HIGH confidence only)
        confirmedLossesAvoided,
        confirmedWinsRemoved,
        confirmedNeutral,
        confirmedNetRImpact,    // positive = net R saved; negative = net R lost

        // Ghost agreement
        ghostAccuracyRate,      // null if no comparable ghost data

        // Flags
        hasPairedData,
        hasHighConfPairs: highConfCount > 0,
    };
}

// ── isFftCancel (re-export for consumers that only import this module) ─────────

/**
 * Returns true when a trade row represents an FFT cancel.
 * Mirrors isFftCancel from fftAnalytics.js — kept local to avoid a
 * circular dependency.
 */
export function isFftCancel(trade) {
    if (!trade) return false;
    const cancelReason = normStr(trade.cancel_reason ?? trade.cancelReason);
    if (cancelReason === "FIRST_FAILED_TAG") return true;
    const outcome = normStr(trade.outcome ?? trade.result);
    if (outcome === "FIRST_FAILED_TAG_CANCEL") return true;
    return false;
}

// ── Outcome label helpers ────────────────────────────────────────────────────

/** Human-readable label for a paired OFF outcome. */
export function pairedOffOutcomeLabel(outcome) {
    if (!outcome) return "—";
    switch (outcome) {
        case "WIN":                       return "Win";
        case "LOSS":                      return "Loss";
        case "NEWS_FLATTEN":              return "News flat";
        case "BREAKEVEN":                 return "Breakeven";
        case "PROTECTION_EXIT":           return "Prot exit";
        case "INVALID":
        case "INVALIDATED":               return "Invalid";
        case "UNFILLED":
        case "NEVER_TRIGGERED":           return "Unfilled";
        case "FIRST_FAILED_TAG_CANCEL":   return "FFT cancel";
        default:                          return outcome;
    }
}

/** Tone string for pairedOffOutcome — maps to CSS variable names used in the UI. */
export function pairedOffOutcomeTone(outcome) {
    if (!outcome) return "muted";
    switch (outcome) {
        case "WIN":             return "success";
        case "LOSS":
        case "PROTECTION_EXIT": return "danger";
        case "NEWS_FLATTEN":    return "warning";
        case "BREAKEVEN":       return "muted";
        default:                return "muted";
    }
}
