/**
 * tradeClassification.js — canonical trade classification.
 *
 * Source of truth for "is this a win/loss/flat/invalid/etc." across every
 * surface that counts trades (Run Detail KPI + ledger, Strategy Map list +
 * stats, Entries Lab analytics, Failures Lab, Sweep Lab, etc.).
 *
 * Why it exists
 * -------------
 * Before this module, every page computed wins/losses differently:
 *   • importer.js              wins = outcome === "Win", losses = total - wins
 *                              → silently counts INVALID / NEWS_FLATTEN / UNFILLED as losses
 *   • RunDetail.tradeResultSign  outcome=="WIN"/"LOSS" first, r-sign fallback
 *   • RunDetail.isValidExecutedTrade excludes UNFILLED/SESSION_FILTERED/NEWS_TOUCH_CANCEL/
 *                              NEWS_BLACKOUT/INVALIDATED — but does NOT exclude outcome="INVALID"
 *                              because it substring-matches "INVALIDATED" (which is longer)
 *   • StrategyMap.isWin/isLoss  outcome.includes("win"/"loss") OR r-sign
 *   • entryAnalytics            pure r-sign on filled trades, excludes cancelled_before_entry
 *   • backend summarize_trades  win_rate = wins / (wins + losses + protection_exits)
 *
 * Result: KPI shows 10/20 wins/losses, Strategy Map shows 8 wins / 10 invalid
 * for what the user thinks should be "the same trades". Sometimes that's a real
 * scope mismatch (different scenario CSVs); sometimes it's a classification bug.
 *
 * This module fixes the classification half — pages that pass the same trade
 * list through these helpers will get the same numbers back, every time.
 *
 * Canonical categories
 * --------------------
 * Each trade belongs to exactly ONE category. Categories are stable strings so
 * they can be used as dictionary keys, in filters, in URL query params, etc.
 *
 *   Performance categories (had a real fill, contribute to P&L):
 *     WIN                 normal close at TP, R > +eps
 *     LOSS                normal close at SL or partial close, R < -eps
 *     BREAKEVEN           closed at flat, |R| <= eps
 *     NEWS_FLATTEN_WIN    flattened by news with positive R
 *     NEWS_FLATTEN_LOSS   flattened by news with negative R
 *     NEWS_FLATTEN_FLAT   flattened by news with ~0 R
 *
 *   Excluded-setup categories (never produced a fill / shouldn't move equity):
 *     INVALID_CANCELLED   OB invalidated before edge entry / cancelled_before_entry
 *     UNFILLED            triggered but never filled / never triggered
 *     SESSION_FILTERED    blocked by session filter
 *     NEWS_CANCELLED      cancelled by news (touch-cancel / blackout)
 *     OPEN                still active at end of backtest
 *     UNKNOWN             anything else (defensive fallback)
 *
 * Win-rate denominator
 * --------------------
 * Two valid choices, both legitimate; we default to the conservative one:
 *   "wins_plus_losses"  (default)  → flats neither help nor hurt
 *   "performance"                  → flats sit in the denominator (more pessimistic)
 *
 * Backwards-compat note
 * ---------------------
 * importer.js writes trade.outcome as `cap("NEWS_FLATTEN") === "News_flatten"` (only the
 * first character is capitalized). normalizeOutcome below uppercases + strips
 * non-alphanumerics, so it accepts every form the codebase produces (raw
 * backend strings, cap'd importer strings, lowercased misc).
 */

// Default breakeven epsilon. Matches the value already used by
// RunDetail.outcomeSummary and its R-distribution bucketing.
export const FLAT_EPSILON_R = 0.005;

// Performance categories — counted toward wins/losses/flats and netR/equity.
export const PERFORMANCE_CATEGORIES = new Set([
    "WIN",
    "LOSS",
    "BREAKEVEN",
    "NEWS_FLATTEN_WIN",
    "NEWS_FLATTEN_LOSS",
    "NEWS_FLATTEN_FLAT",
]);

// Excluded-setup categories — shown for diagnostics but never counted in
// win/loss/netR.
export const EXCLUDED_CATEGORIES = new Set([
    "INVALID_CANCELLED",
    "UNFILLED",
    "SESSION_FILTERED",
    "NEWS_CANCELLED",
    "OPEN",
    "UNKNOWN",
]);

// ────────────────────────────────────────────────────────────────────────────
// Exit-type / provenance axis (PROTECTION-LAYER Phase 3)
// ────────────────────────────────────────────────────────────────────────────
// This axis is ORTHOGONAL to the economic category above. The economic category
// (WIN/LOSS/BREAKEVEN) stays the single source of truth for netR / win-rate /
// PF / equity — a break-even exit is a real fill that moves equity, so it must
// remain in those buckets by its realized R. The exit-type axis records HOW the
// trade ended (provenance) for display, counts, filtering, and banners, and is
// future-proof for partial-risk / trailing / gate layers. A gate layer that
// EXCLUDES a trade removes it from universe.trades entirely; "filtered_out" is
// reserved for surfacing such an excluded set separately, never as P&L.
export const EXIT_TYPES = Object.freeze({
    NORMAL: "normal",
    BE_EXIT: "be_exit",
    PARTIAL_PROFIT: "partial_profit",
    PARTIAL_LOSS: "partial_loss",
    FILTERED_OUT: "filtered_out",
});

// ────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ────────────────────────────────────────────────────────────────────────────

function normalizeOutcome(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_");
}

function asTruthyFlag(value) {
    if (value === true) return true;
    if (value === false || value == null || value === "") return false;
    return ["true", "1", "yes", "y"].includes(String(value).trim().toLowerCase());
}

function numericR(trade) {
    if (!trade) return null;
    const candidates = [
        trade.r,
        trade.net_r,
        trade.netR,
        trade.pnl_r,
        trade.pnlR,
        trade.resultR,
        trade.news_flatten_r,
        trade.newsFlattenR,
    ];
    for (const candidate of candidates) {
        if (candidate == null || candidate === "") continue;
        const n = typeof candidate === "number" ? candidate : Number(candidate);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Break-even exit R for a BE_EXIT row (be_exit_r / beExitR). null when absent. */
function beExitR(trade) {
    if (!trade) return null;
    const candidate = trade.be_exit_r ?? trade.beExitR;
    if (candidate == null || candidate === "") return null;
    const n = typeof candidate === "number" ? candidate : Number(candidate);
    return Number.isFinite(n) ? n : null;
}

function hasRealEntry(trade) {
    return Boolean(
        trade?.entry
        || trade?.fill_time
        || trade?.fillTime
        || trade?.entry_time
        || trade?.entryTime,
    );
}

function isNewsFlattenOutcome(normOutcome, trade) {
    if (normOutcome === "NEWS_FLATTEN") return true;
    // Some pipelines emit a separate news_action flag.
    const action = normalizeOutcome(trade?.news_action ?? trade?.newsAction);
    return action === "FLATTENED_ACTIVE_TRADE" || action === "NEWS_FLATTEN";
}

// ────────────────────────────────────────────────────────────────────────────
// Public classifier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assign exactly one canonical category to a trade.
 *
 * Decision order (first match wins):
 *   1. Excluded-setup outcomes (UNFILLED / SESSION_FILTERED / NEWS_TOUCH_CANCEL /
 *      NEWS_BLACKOUT / INVALID / OPEN) take precedence — these never produced
 *      a real fill regardless of any r value, and counting them as performance
 *      trades is the source of most KPI discrepancies.
 *   2. Trades flagged cancelled_before_entry / missed_trade with no real entry
 *      time fall into INVALID_CANCELLED.
 *   3. NEWS_FLATTEN with a real fill is bucketed into NEWS_FLATTEN_WIN/LOSS/FLAT
 *      by R sign — these are real exits, just early.
 *   4. Remaining trades use outcome string when explicit (WIN/LOSS), then r-sign,
 *      with FLAT_EPSILON_R defining breakeven.
 *
 * @param {object} trade
 * @param {object} [options]
 * @param {number} [options.epsilon=FLAT_EPSILON_R]  Threshold for flat/breakeven.
 * @returns {string}  one of the canonical category constants.
 */
export function classifyTrade(trade, options = {}) {
    if (!trade) return "UNKNOWN";
    const epsilon = Number.isFinite(options.epsilon) ? Math.abs(options.epsilon) : FLAT_EPSILON_R;

    const normOutcome = normalizeOutcome(trade.outcome ?? trade.result);
    const r = numericR(trade);
    const cancelledBeforeEntry = asTruthyFlag(trade.cancelled_before_entry)
        || asTruthyFlag(trade.cancelledBeforeEntry);
    const missedTrade = asTruthyFlag(trade.missed_trade) || asTruthyFlag(trade.missedTrade);

    // 1. Hard-excluded outcome strings — backend speaks first.
    if (normOutcome === "SESSION_FILTERED") return "SESSION_FILTERED";
    if (normOutcome === "UNFILLED") return "UNFILLED";
    if (normOutcome === "NEWS_TOUCH_CANCEL" || normOutcome === "NEWS_CANCEL") return "NEWS_CANCELLED";
    if (normOutcome === "NEWS_BLACKOUT") return "NEWS_CANCELLED";
    if (normOutcome === "INVALID" || normOutcome === "INVALIDATED") return "INVALID_CANCELLED";
    if (normOutcome === "OPEN") return "OPEN";
    if (normOutcome === "REVERSE_TOUCH_CANCEL") return "INVALID_CANCELLED";

    // 2. cancelled_before_entry flag without a real entry → invalid.
    //    We check this AFTER outcome-strings so explicit backend outcomes win,
    //    but BEFORE r-sign so a cancelled setup with stale r=0 doesn't leak in.
    if ((cancelledBeforeEntry || missedTrade) && !hasRealEntry(trade)) {
        return "INVALID_CANCELLED";
    }

    // 3. News-flatten: real fill, early exit. Sub-categorize by R sign so a
    //    +0.31R flatten reads as a win, a -0.05R flatten as a loss, and a
    //    breakeven flatten as flat.
    if (isNewsFlattenOutcome(normOutcome, trade)) {
        if (r == null || Math.abs(r) <= epsilon) return "NEWS_FLATTEN_FLAT";
        return r > 0 ? "NEWS_FLATTEN_WIN" : "NEWS_FLATTEN_LOSS";
    }

    // 4. Explicit WIN / LOSS — trust the backend.
    if (normOutcome === "WIN") return "WIN";
    if (normOutcome === "LOSS") return "LOSS";

    // PROTECTION_EXIT is a real fill that closed for protection reasons. Treat
    // it as a normal performance trade categorized by R sign.
    if (normOutcome === "PROTECTION_EXIT") {
        if (r == null || Math.abs(r) <= epsilon) return "BREAKEVEN";
        return r > 0 ? "WIN" : "LOSS";
    }

    // BE_EXIT is a real fill from a Break-even Exact Replay scenario pass. It is
    // categorized by its realized R: positive → WIN, negative → LOSS, flat →
    // BREAKEVEN. The break-even exit R lives in be_exit_r; fall back to the
    // row's generic R. This is the single, central place BE_EXIT is handled —
    // every win/loss/flat surface inherits it via classifyTrade. (With the
    // default zero buffer a BE stop exits at ~0R, so most BE_EXIT rows are
    // BREAKEVEN; a buffer or armed-not-triggered winner can land WIN/LOSS.)
    if (normOutcome === "BE_EXIT") {
        const beR = beExitR(trade) ?? r;
        if (beR == null || Math.abs(beR) <= epsilon) return "BREAKEVEN";
        return beR > 0 ? "WIN" : "LOSS";
    }

    // 5. No explicit outcome — fall back to R sign if we have a real entry.
    if (hasRealEntry(trade)) {
        if (r == null) return "UNKNOWN";
        if (Math.abs(r) <= epsilon) return "BREAKEVEN";
        return r > 0 ? "WIN" : "LOSS";
    }

    // No outcome string AND no real entry. Most likely an unrecognized row.
    if (r == null || Math.abs(r) <= epsilon) return "UNKNOWN";
    // If we somehow have R but no entry, treat as performance trade so we don't
    // silently drop equity. Caller can override via custom epsilon.
    return r > 0 ? "WIN" : "LOSS";
}

/**
 * Provenance / exit-type for a trade — orthogonal to classifyTrade's economic
 * category. Does NOT affect win/loss/netR. First match wins:
 *   • outcome PARTIAL_* → partial_profit / partial_loss (reserved for future layers)
 *   • BE_EXIT outcome, or a protection-layer row (protectionApplied + break_even),
 *     or any be_* exit field present → be_exit
 *   • outcome FILTERED_OUT → filtered_out (reserved; excluded sets only)
 *   • otherwise → normal
 */
export function tradeExitType(trade) {
    if (!trade) return EXIT_TYPES.NORMAL;
    const norm = normalizeOutcome(trade.outcome ?? trade.result);
    if (norm === "PARTIAL_PROFIT") return EXIT_TYPES.PARTIAL_PROFIT;
    if (norm === "PARTIAL_LOSS") return EXIT_TYPES.PARTIAL_LOSS;
    if (norm === "PARTIAL_CLOSE" || norm === "PARTIAL") {
        const r = numericR(trade);
        return (r != null && r < 0) ? EXIT_TYPES.PARTIAL_LOSS : EXIT_TYPES.PARTIAL_PROFIT;
    }
    const isBeProtection = asTruthyFlag(trade.protectionApplied)
        && String(trade.protectionType ?? "").toLowerCase() === "break_even";
    const hasBeFields = trade.be_exit_r != null || trade.beExitR != null
        || asTruthyFlag(trade.be_triggered) || asTruthyFlag(trade.beTriggered);
    if (norm === "BE_EXIT" || isBeProtection || hasBeFields) return EXIT_TYPES.BE_EXIT;
    if (norm === "FILTERED_OUT") return EXIT_TYPES.FILTERED_OUT;
    return EXIT_TYPES.NORMAL;
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience predicates
// ────────────────────────────────────────────────────────────────────────────

/** Real-entry trade that should affect P&L and KPI counts. */
export function isPerformanceTrade(trade, options) {
    return PERFORMANCE_CATEGORIES.has(classifyTrade(trade, options));
}

/** Wins include NEWS_FLATTEN_WIN — a positive-R early exit is still a winner. */
export function isWinTrade(trade, options) {
    const category = classifyTrade(trade, options);
    return category === "WIN" || category === "NEWS_FLATTEN_WIN";
}

/** Losses include NEWS_FLATTEN_LOSS — a negative-R early exit is still a loser. */
export function isLossTrade(trade, options) {
    const category = classifyTrade(trade, options);
    return category === "LOSS" || category === "NEWS_FLATTEN_LOSS";
}

/** Breakeven / flat — real entry, ~0 R. */
export function isFlatTrade(trade, options) {
    const category = classifyTrade(trade, options);
    return category === "BREAKEVEN" || category === "NEWS_FLATTEN_FLAT";
}

/** Setup that was cancelled before entry / invalidated. */
export function isInvalidCancelledTrade(trade, options) {
    return classifyTrade(trade, options) === "INVALID_CANCELLED";
}

/** Not a real performance trade — never reached fill or shouldn't move equity. */
export function isExcludedSetup(trade, options) {
    return EXCLUDED_CATEGORIES.has(classifyTrade(trade, options));
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregate summary
// ────────────────────────────────────────────────────────────────────────────

const ZERO_COUNTS = Object.freeze({
    WIN: 0,
    LOSS: 0,
    BREAKEVEN: 0,
    NEWS_FLATTEN_WIN: 0,
    NEWS_FLATTEN_LOSS: 0,
    NEWS_FLATTEN_FLAT: 0,
    INVALID_CANCELLED: 0,
    UNFILLED: 0,
    SESSION_FILTERED: 0,
    NEWS_CANCELLED: 0,
    OPEN: 0,
    UNKNOWN: 0,
});

/**
 * Compute the canonical roll-up over a trade list.
 *
 * @param {Array<object>} trades
 * @param {object} [options]
 * @param {number}   [options.epsilon=FLAT_EPSILON_R]
 * @param {"wins_plus_losses"|"performance"} [options.winRateDenominator="wins_plus_losses"]
 * @returns {{
 *   total: number,
 *   byCategory: Record<string, number>,
 *   wins: number,
 *   losses: number,
 *   flats: number,
 *   newsFlattenTotal: number,
 *   newsFlattenWins: number,
 *   newsFlattenLosses: number,
 *   newsFlattenFlats: number,
 *   invalidCancelled: number,
 *   unfilled: number,
 *   sessionFiltered: number,
 *   newsCancelled: number,
 *   open: number,
 *   unknown: number,
 *   performanceTrades: number,
 *   excludedSetups: number,
 *   winRateDenominator: number,
 *   winRate: number | null,
 *   netR: number,
 *   netRPerformance: number,
 * }}
 */
export function summarizeTradeClassifications(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const denominatorMode = options.winRateDenominator === "performance"
        ? "performance"
        : "wins_plus_losses";

    const byCategory = { ...ZERO_COUNTS };
    // Orthogonal exit-type axis (provenance). Counts only; never affects netR.
    const byExitType = { normal: 0, be_exit: 0, partial_profit: 0, partial_loss: 0, filtered_out: 0 };
    let protectionAppliedCount = 0;
    let netR = 0;
    let netRPerformance = 0;
    for (const trade of list) {
        const category = classifyTrade(trade, options);
        byCategory[category] = (byCategory[category] || 0) + 1;
        const exitType = tradeExitType(trade);
        byExitType[exitType] = (byExitType[exitType] || 0) + 1;
        if (asTruthyFlag(trade?.protectionApplied)) protectionAppliedCount += 1;
        const r = numericR(trade);
        if (r != null) {
            netR += r;
            if (PERFORMANCE_CATEGORIES.has(category)) {
                netRPerformance += r;
            }
        }
    }

    const wins   = byCategory.WIN   + byCategory.NEWS_FLATTEN_WIN;
    const losses = byCategory.LOSS  + byCategory.NEWS_FLATTEN_LOSS;
    const flats  = byCategory.BREAKEVEN + byCategory.NEWS_FLATTEN_FLAT;
    const performanceTrades = wins + losses + flats;
    const excludedSetups = byCategory.INVALID_CANCELLED
        + byCategory.UNFILLED
        + byCategory.SESSION_FILTERED
        + byCategory.NEWS_CANCELLED
        + byCategory.OPEN
        + byCategory.UNKNOWN;

    const winRateDenominator = denominatorMode === "performance"
        ? performanceTrades
        : wins + losses;
    const winRate = winRateDenominator > 0 ? (wins / winRateDenominator) * 100 : null;

    return {
        total: list.length,
        byCategory,
        // Provenance axis — orthogonal to win/loss; for display / counts / banners.
        byExitType,
        beExitCount: byExitType.be_exit,
        protectionAppliedCount,
        wins,
        losses,
        flats,
        newsFlattenTotal:  byCategory.NEWS_FLATTEN_WIN + byCategory.NEWS_FLATTEN_LOSS + byCategory.NEWS_FLATTEN_FLAT,
        newsFlattenWins:   byCategory.NEWS_FLATTEN_WIN,
        newsFlattenLosses: byCategory.NEWS_FLATTEN_LOSS,
        newsFlattenFlats:  byCategory.NEWS_FLATTEN_FLAT,
        invalidCancelled:  byCategory.INVALID_CANCELLED,
        unfilled:          byCategory.UNFILLED,
        sessionFiltered:   byCategory.SESSION_FILTERED,
        newsCancelled:     byCategory.NEWS_CANCELLED,
        open:              byCategory.OPEN,
        unknown:           byCategory.UNKNOWN,
        performanceTrades,
        excludedSetups,
        winRateDenominator,
        winRate,
        netR,
        netRPerformance,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Direction-aware sanity summary (consumed by TradeSanityStrip)
// ────────────────────────────────────────────────────────────────────────────

function directionBucket(trade) {
    const raw = String(trade?.direction ?? trade?.side ?? trade?.bias ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (raw === "long" || raw === "buy" || raw.startsWith("bull")) return "long";
    if (raw === "short" || raw === "sell" || raw.startsWith("bear")) return "short";
    return null;
}

/**
 * One-shot sanity roll-up suitable for KPI strips and ledger summaries.
 *
 * Built on top of summarizeTradeClassifications + classifyTrade so every
 * surface that calls this agrees with every other surface. Adds:
 *   • direction-aware long/short counts and net-R splits
 *   • gross win R and gross loss R (loss R reported as a negative number)
 *   • profit factor = grossWinR / |grossLossR|
 *   • expectancy   = netRPerformance / performanceTrades
 *   • max drawdown over the performance series, in R (negative number)
 *
 * @param {Array<object>} trades
 * @param {object} [options]
 * @param {number} [options.epsilon=FLAT_EPSILON_R]   Flat / breakeven threshold.
 * @param {"wins_plus_losses"|"performance"} [options.winRateDenominator="wins_plus_losses"]
 * @param {boolean} [options.includeDrawdown=true]   Set false to skip the DD pass.
 * @returns {object}  rich sanity stats — see TradeSanityStrip for usage.
 */
export function summarizeTradeSanity(trades, options = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const rollup = summarizeTradeClassifications(list, options);

    let grossWinR = 0;
    let grossLossR = 0;
    let longCount = 0;
    let shortCount = 0;
    let longNetR = 0;
    let shortNetR = 0;
    let unknownDirection = 0;

    // Equity series for drawdown — only performance trades contribute.
    const includeDrawdown = options.includeDrawdown !== false;
    let cumR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let performanceR = 0; // Σ R across performance trades, used for expectancy

    for (const trade of list) {
        const category = classifyTrade(trade, options);
        if (!PERFORMANCE_CATEGORIES.has(category)) continue;

        const r = numericR(trade) ?? 0;
        performanceR += r;
        if (r > 0) grossWinR += r;
        else if (r < 0) grossLossR += r;

        const dir = directionBucket(trade);
        if (dir === "long") {
            longCount += 1;
            longNetR += r;
        } else if (dir === "short") {
            shortCount += 1;
            shortNetR += r;
        } else {
            unknownDirection += 1;
        }

        if (includeDrawdown) {
            cumR += r;
            if (cumR > peakR) peakR = cumR;
            const dd = cumR - peakR;
            if (dd < maxDrawdownR) maxDrawdownR = dd;
        }
    }

    const profitFactor = grossLossR !== 0
        ? grossWinR / Math.abs(grossLossR)
        : (grossWinR > 0 ? Infinity : null);

    const expectancy = rollup.performanceTrades > 0
        ? performanceR / rollup.performanceTrades
        : null;

    return {
        // Everything the canonical roll-up already gave us
        ...rollup,

        // Direction-aware
        longCount,
        shortCount,
        longNetR,
        shortNetR,
        unknownDirection,

        // Gross R splits — loss R kept as a NEGATIVE number so consumers can
        // sum + sign-color without re-deriving sign.
        grossWinR,
        grossLossR,

        // Risk / efficiency
        profitFactor,
        expectancy,
        // maxDrawdownR is negative or 0; consumers should Math.abs() when
        // displaying as a positive "DD" number.
        maxDrawdownR: includeDrawdown ? maxDrawdownR : null,

        // Alias for compatibility with KPI strips that read `netR`. This is
        // the performance-trades net (matches the equity chart), not the raw
        // sum of every row.
        netRPerformance: rollup.netRPerformance,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Direction × Structure × Outcome matrix
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cross-tabulates performance trades by direction, structure, and outcome.
 *
 * @param {object[]} trades — canonical trade array
 * @returns {{ rows: object[], totals: object }}
 *   rows: stable order [long·BOS, long·CHoCH, short·BOS, short·CHoCH],
 *         only non-empty rows included.
 *   totals: { win, loss, flat, total } across all performance trades.
 */
export function buildDirStructMatrix(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const cells = {};
    const initCell = () => ({ win: 0, loss: 0, flat: 0, total: 0 });
    const getCell = (dir, struct) => {
        const key = `${dir}:${struct}`;
        if (!cells[key]) cells[key] = initCell();
        return cells[key];
    };

    let totalWin = 0, totalLoss = 0, totalFlat = 0, totalPerf = 0;

    for (const trade of list) {
        if (!isPerformanceTrade(trade)) continue;
        totalPerf++;
        const dir = directionBucket(trade) ?? "unknown";
        // Inline structure normalization (normalizeStructure lives in sessionAnalytics, not here)
        const rawStruct = String(trade.structure || trade.structure_type || "").toUpperCase();
        const struct = rawStruct === "BOS" ? "BOS" : rawStruct === "CHOCH" ? "CHoCH" : "Unknown";
        const cell = getCell(dir, struct);
        cell.total++;
        if (isWinTrade(trade)) { cell.win++; totalWin++; }
        else if (isLossTrade(trade)) { cell.loss++; totalLoss++; }
        else { cell.flat++; totalFlat++; }
    }

    const ROWS = [
        { dir: "long",  struct: "BOS"   },
        { dir: "long",  struct: "CHoCH" },
        { dir: "short", struct: "BOS"   },
        { dir: "short", struct: "CHoCH" },
    ];

    const rows = ROWS
        .map(({ dir, struct }) => {
            const key = `${dir}:${struct}`;
            const c = cells[key] || initCell();
            return { dir, struct, ...c };
        })
        .filter((r) => r.total > 0);

    return {
        rows,
        totals: { win: totalWin, loss: totalLoss, flat: totalFlat, total: totalPerf },
    };
}

// ────────────────────────────────────────────────────────────────────────────
// UI display translation — internal enums → human-friendly strings.
//
// The backend emits raw outcome strings like "INVALID" and cancel reasons
// like "invalidated_before_edge_entry". Those words read like "broken",
// "corrupted", "failed" — but what actually happened is the entry model
// prevented a bad fill before the edge entry occurred. That's *protection*,
// not failure.
//
// All user-facing surfaces should route through these helpers so the
// terminology stays consistent and one rename re-themes the whole app.
// ────────────────────────────────────────────────────────────────────────────

/**
 * UI label for the rendered Pill / chip text given a raw outcome string.
 *
 * Length tiers:
 *   "short"  → PROTECTED                 (tight chips, badge overlays)
 *   "medium" → PROTECTED ENTRY           (small pills, ledger rows)
 *   "long"   → Protected before entry    (expanded details, tooltips)
 *
 * Non-protected outcomes fall through to the existing display format
 * ("WIN" / "LOSS" / "NEWS FLATTEN" / etc.), so this is safe to drop in
 * everywhere `formatTradeOutcome` used to be called.
 */
export function displayOutcomeLabel(rawOutcome, options = {}) {
    const length = options.length || "medium";
    const norm = normalizeOutcome(rawOutcome);
    if (norm === "INVALID" || norm === "INVALIDATED") {
        if (length === "short") return "PROTECTED";
        if (length === "long")  return "Protected before edge entry";
        return "PROTECTED ENTRY";
    }
    if (!rawOutcome || rawOutcome === "—") return "—";
    return String(rawOutcome).replace(/_/g, " ").toUpperCase();
}

/**
 * UI label for a raw `cancel_reason` value (e.g. "invalidated_before_edge_entry").
 * Returns a Title-cased sentence — the rest of the app should render it as-is.
 */
export function displayCancelReason(rawReason) {
    if (!rawReason) return "";
    const norm = normalizeOutcome(rawReason);
    // Canonical cancel reason labels (spec-aligned)
    if (norm === "FIRST_FAILED_TAG") return "First Failed Visit";
    if (norm === "RETRACE_CANCEL") return "Move-Away / Retrace Cancel";
    if (norm === "NEWS_TOUCH_CANCEL") return "News Touch Cancel";
    if (norm === "SESSION_FILTER_CANCEL") return "Session Filter Cancel";
    if (norm === "NEWS_BLACKOUT_CANCEL") return "News Blackout Cancel";
    if (norm === "INVALIDATED_BEFORE_EDGE_ENTRY") return "Invalidated Before Entry";
    if (norm === "NEVER_FILLED_AFTER_TRIGGER") return "Never Filled After Trigger";
    if (norm === "NEVER_TRIGGERED") return "Never Triggered";
    if (norm === "INVALID" || norm === "INVALIDATED") return "Invalidated Before Entry";
    // Generic title-case fallback for any other reason string.
    return String(rawReason)
        .replace(/_/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pill / chip tone string for a given canonical category. Matches the
 * `Pill` component's tone enum in `components/lab/DataTable.jsx`.
 *
 *   WIN / NEWS_FLATTEN_WIN          → success (green)
 *   LOSS / NEWS_FLATTEN_LOSS        → danger  (red)
 *   BREAKEVEN / NEWS_FLATTEN_FLAT   → muted   (grey)
 *   INVALID_CANCELLED               → secondary (violet — PROTECTED)
 *   UNFILLED / SESSION_FILTERED /
 *   NEWS_CANCELLED / OPEN           → warning (amber)
 *   UNKNOWN                         → muted
 */
export function categoryPillTone(category) {
    if (category === "WIN" || category === "NEWS_FLATTEN_WIN") return "success";
    if (category === "LOSS" || category === "NEWS_FLATTEN_LOSS") return "danger";
    if (category === "BREAKEVEN" || category === "NEWS_FLATTEN_FLAT") return "muted";
    if (category === "INVALID_CANCELLED") return "secondary";
    if (category === "UNFILLED"
        || category === "SESSION_FILTERED"
        || category === "NEWS_CANCELLED"
        || category === "OPEN") return "warning";
    return "muted";
}

/** Convenience: tone directly from a trade. */
export function outcomeToneForTrade(trade, options) {
    return categoryPillTone(classifyTrade(trade, options));
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers exported for tests / advanced callers. Treat as private.
// ────────────────────────────────────────────────────────────────────────────
export const _internal = {
    normalizeOutcome,
    asTruthyFlag,
    numericR,
    beExitR,
    hasRealEntry,
    isNewsFlattenOutcome,
    directionBucket,
};
