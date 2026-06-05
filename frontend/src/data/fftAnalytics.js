/**
 * fftAnalytics.js — First Failed Tag (FFT) cancel analytics.
 *
 * A pure-function module that derives FFT protection metrics from a trades
 * array. All three UI surfaces that need FFT stats (RunDetail KPI strip,
 * Entries Lab trigger-behavior tier, Strategy Map scenario summary) import
 * from here so the numbers are always consistent.
 *
 * Key fields consumed (all already parsed by importer.js):
 *
 *   cancel_reason / cancelReason  === "first_failed_tag"   → FFT cancel row
 *   outcome                       === "FIRST_FAILED_TAG_CANCEL" (alt detection)
 *   ghost_candidate               (bool)  → ghost tracking was run for this cancel
 *   ghost_outcome                 (string) WIN | LOSS | BREAKEVEN | UNFILLED |
 *                                          NEVER_TRIGGERED | PROTECTION_EXIT | …
 *   ghost_r                       (float) → ghost result in R
 *   ghost_fill                    (bool)  → ghost was actually filled
 *   ghost_trigger_reached         (bool)
 *   fft_move_away_pips_at_cancel / fftMoveAwayPipsAtCancel  (float) → pips
 *                                          price had moved past OB edge at cancel
 *
 * Ghost outcomes are tracked only on FFT-cancelled rows that had ghost
 * tracking enabled (`ghost_candidate === true`). Rows without ghost tracking
 * contribute to fftCancels but not to ghost* tallies.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(v) {
    return String(v ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, "_");
}

function isNumber(v) {
    return v != null && v !== "" && Number.isFinite(Number(v));
}

function asNum(v) {
    return Number(v);
}

/** Returns true for any outcome string that means "ghost did fill + won". */
function isGhostWin(outcome) {
    return outcome === "WIN";
}

/** Returns true for any outcome string that means "ghost did fill + lost". */
function isGhostLoss(outcome) {
    return outcome === "LOSS" || outcome === "PROTECTION_EXIT";
}

/**
 * Returns true when a ghost trade never reached a fill.
 * Covers: UNFILLED, NEVER_TRIGGERED, SESSION_FILTERED, INVALIDATED,
 *         and any other non-fill outcome.
 */
function isGhostUnfilled(outcome, ghostFill) {
    if (ghostFill === true) return false;
    // Explicit fill-less outcomes
    if (
        outcome === "UNFILLED" ||
        outcome === "NEVER_TRIGGERED" ||
        outcome === "SESSION_FILTERED" ||
        outcome === "INVALIDATED" ||
        outcome === "INVALID"
    )
        return true;
    // Anything that isn't WIN/LOSS/BREAKEVEN/PROTECTION_EXIT
    if (!isGhostWin(outcome) && !isGhostLoss(outcome) && outcome !== "BREAKEVEN") {
        return true;
    }
    return false;
}

// ── isFftCancel ──────────────────────────────────────────────────────────────

/**
 * Returns true when a trade row represents an FFT cancel.
 * Accepts both snake_case and camelCase field names.
 */
export function isFftCancel(trade) {
    if (!trade) return false;
    const cancelReason = norm(trade.cancel_reason ?? trade.cancelReason);
    if (cancelReason === "FIRST_FAILED_TAG") return true;
    const outcome = norm(trade.outcome ?? trade.result);
    if (outcome === "FIRST_FAILED_TAG_CANCEL") return true;
    return false;
}

// ── computeFftAnalytics ──────────────────────────────────────────────────────

/**
 * Compute FFT protection analytics from a raw trades array.
 *
 * @param {Array<object>} trades
 * @returns {{
 *   fftCancels:          number,   // total FFT-cancelled setups
 *   ghostTracked:        number,   // FFT cancels that had ghost tracking enabled
 *   ghostWins:           number,
 *   ghostLosses:         number,
 *   ghostUnfilled:       number,   // ghost never reached a fill
 *   ghostBreakevens:     number,
 *   ghostNetR:           number,
 *   ghostWinRate:        number | null,   // % wins of (wins + losses)
 *   avgMoveAwayAtCancel: number | null,   // avg pips moved past OB edge at cancel
 *   maxMoveAwayAtCancel: number | null,
 *   hasMoveAwayData:     boolean,         // any non-zero move-away values present
 *   hasGhostData:        boolean,         // any ghost-tracked FFT cancels present
 * }}
 */
export function computeFftAnalytics(trades) {
    const list = Array.isArray(trades) ? trades : [];

    let fftCancels = 0;
    let ghostTracked = 0;
    let ghostWins = 0;
    let ghostLosses = 0;
    let ghostUnfilled = 0;
    let ghostBreakevens = 0;
    let ghostNetR = 0;

    const moveAwayValues = [];

    for (const t of list) {
        if (!isFftCancel(t)) continue;
        fftCancels++;

        // Move-away distance at cancel
        const rawMoveAway =
            t.fft_move_away_pips_at_cancel ??
            t.fftMoveAwayPipsAtCancel ??
            null;
        if (isNumber(rawMoveAway)) {
            moveAwayValues.push(asNum(rawMoveAway));
        }

        // Ghost outcomes — only on ghost-tracked rows
        if (t.ghost_candidate !== true && t.ghostCandidate !== true) continue;
        ghostTracked++;

        const ghostOutcome = norm(t.ghost_outcome ?? t.ghostOutcome);
        const ghostFill = t.ghost_fill ?? t.ghostFill;
        const r = t.ghost_r ?? t.ghostR;

        if (isGhostWin(ghostOutcome)) {
            ghostWins++;
        } else if (isGhostLoss(ghostOutcome)) {
            ghostLosses++;
        } else if (ghostOutcome === "BREAKEVEN") {
            ghostBreakevens++;
        } else if (isGhostUnfilled(ghostOutcome, ghostFill)) {
            ghostUnfilled++;
        }

        if (isNumber(r)) {
            ghostNetR += asNum(r);
        }
    }

    const ghostWL = ghostWins + ghostLosses;
    const ghostWinRate = ghostWL > 0 ? (ghostWins / ghostWL) * 100 : null;

    const nonZeroMoveAway = moveAwayValues.filter((v) => v > 0);
    const avgMoveAwayAtCancel =
        nonZeroMoveAway.length > 0
            ? nonZeroMoveAway.reduce((s, v) => s + v, 0) / nonZeroMoveAway.length
            : null;
    const maxMoveAwayAtCancel =
        moveAwayValues.length > 0 ? Math.max(...moveAwayValues) : null;

    return {
        fftCancels,
        ghostTracked,
        ghostWins,
        ghostLosses,
        ghostUnfilled,
        ghostBreakevens,
        ghostNetR,
        ghostWinRate,
        avgMoveAwayAtCancel,
        maxMoveAwayAtCancel,
        hasMoveAwayData: nonZeroMoveAway.length > 0,
        hasGhostData: ghostTracked > 0,
    };
}

// ── compareFftToBaseline ─────────────────────────────────────────────────────

/**
 * Compute delta stats between an FFT-enabled run and a baseline (FFT-off) run.
 * Both arguments should be the output of computeFftAnalytics().
 *
 * Returns null when either argument is null/undefined or fftStats has no
 * cancels (nothing to compare).
 *
 * @param {ReturnType<computeFftAnalytics>} fftStats
 * @param {ReturnType<computeFftAnalytics>} baselineStats
 * @returns {{ deltaNetR: number, deltaWins: number, deltaLosses: number } | null}
 */
export function compareFftToBaseline(fftStats, baselineStats) {
    if (!fftStats || !baselineStats || fftStats.fftCancels === 0) return null;
    return {
        deltaNetR: fftStats.ghostNetR - baselineStats.ghostNetR,
        deltaWins: fftStats.ghostWins - baselineStats.ghostWins,
        deltaLosses: fftStats.ghostLosses - baselineStats.ghostLosses,
    };
}

// ── formatters ───────────────────────────────────────────────────────────────

export function fmtFftR(value, digits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}R`;
}

export function fmtFftPct(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return `${Number(value).toFixed(digits)}%`;
}

export function fmtFftPips(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return `${Number(value).toFixed(digits)}`;
}
