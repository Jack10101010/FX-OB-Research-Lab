/**
 * tradeClassificationDims.js
 *
 * Derives multi-dimensional trade classification tags from a trade object.
 *
 * NOTE: This is the DIMENSION CLASSIFIER (entry model / context / exit / protection).
 *   The existing tradeClassification.js exports classifyTrade() for WIN/LOSS
 *   outcome category strings. These are orthogonal systems — do not confuse them.
 *
 * Design constraints:
 *   - Pure function: no side effects, no React imports, no store imports.
 *   - All rules start with null/undefined guards (backwards-compatible with
 *     older bundles that predate AAE instrumentation).
 *   - Missing fields default to safe values: entry_context → ["clean"],
 *     entry_model → "baseline".
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a full classification object for a single trade.
 *
 * @param {object} trade — trade object as returned by importer.js
 * @returns {{
 *   entry_model:     string,
 *   entry_context:   string[],
 *   exit_type:       string,
 *   protection_mode: string,
 *   key:             string,
 * }}
 */
export function buildTradeClassification(trade) {
    if (!trade) {
        return {
            entry_model:     "baseline",
            entry_context:   ["clean"],
            exit_type:       "unknown_exit",
            protection_mode: "baseline",
            key:             "baseline|clean|unknown_exit|baseline",
        };
    }

    const entry_model     = deriveEntryModel(trade);
    const entry_context   = deriveEntryContext(trade);
    const exit_type       = deriveExitType(trade);
    const protection_mode = deriveProtectionMode(trade);

    const key = [
        entry_model,
        entry_context.join("+"),
        exit_type,
        protection_mode,
    ].join("|");

    return { entry_model, entry_context, exit_type, protection_mode, key };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal derivation functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the entry_model tag from trade.entry_model_key.
 *
 * Canonical key format (from normalizeEntryModeKey in importer.js):
 *   entry_triggered_edge_25p0[_same|_next|_d2|_d3]
 *   entry_penetration_25p0
 *   baseline | "" | null | undefined
 *
 * @param {object} trade
 * @returns {string}
 */
function deriveEntryModel(trade) {
    const raw = String(
        trade.entry_model_key ?? trade.entryModelKey ?? ""
    ).toLowerCase().trim();

    if (!raw || raw === "baseline") return "baseline";

    // Triggered-edge delay variants — check most specific suffixes first.
    if (raw.includes("_d3"))   return "te_d3";
    if (raw.includes("_d2"))   return "te_d2";
    if (raw.includes("_next")) return "te_next";
    if (raw.includes("_same")) return "te_same";

    // Triggered-edge without a recognized suffix (delay=0 / same-candle default).
    if (raw.includes("triggered_edge")) return "te_same";

    // Penetration — extract numeric threshold from canonical key.
    // Canonical form: entry_penetration_Np0  (e.g. entry_penetration_25p0)
    // The regex captures the integer part before the 'p'.
    const penMatch = raw.match(/penetration_(\d+)/);
    if (penMatch) return `ep_${penMatch[1]}`;

    return "unknown_model";
}

/**
 * Derive the entry_context tag array.
 * Multiple tags can apply simultaneously (multi-valued dimension).
 * Returns ["clean"] when no special context is detected.
 *
 * Null safety: all boolean TE/AAE fields from the importer return
 * true | false | null. Using === true and === false is intentional —
 * null/undefined must NOT qualify as a match.
 *
 * @param {object} trade
 * @returns {string[]}
 */
function deriveEntryContext(trade) {
    const context = [];

    // AAE: Armed After OB Exit.
    // True when price exited the OB through the entry side during the delay
    // window AND the limit order subsequently armed.
    // armedAfterObExit is the camelCase alias set by importer.js.
    if (trade.armedAfterObExit === true || trade.armed_after_ob_exit === true) {
        context.push("aae");
    }

    // OB Not Occupied: price was outside the OB range at the arm candle.
    // Only push this if AAE was NOT already detected — AAE is the more
    // specific condition (it implies ob_not_occupied, but has separate meaning).
    if (
        (trade.obOccupiedAtArm === false || trade.ob_occupied_at_arm === false)
        && trade.armedAfterObExit !== true
        && trade.armed_after_ob_exit !== true
    ) {
        context.push("ob_not_occupied");
    }

    if (context.length === 0) {
        context.push("clean");
    }

    return context;
}

/**
 * Derive the exit_type tag from trade outcome and related fields.
 *
 * Rules are evaluated in order; the first match wins.
 * Uses case-normalized raw outcome string to avoid dependency on any
 * upstream normalizer or the outcome-classifier in tradeClassification.js.
 *
 * @param {object} trade
 * @returns {string}
 */
function deriveExitType(trade) {
    const rawO = String(trade.outcome ?? "").toLowerCase().trim();

    // Protection exit — check before win/loss because classifyTrade() maps
    // PROTECTION_EXIT to WIN/LOSS/BREAKEVEN by R sign; raw outcome is authoritative.
    if (rawO.includes("protection_exit")) return "protection_exit";

    // News flatten — check before plain win/loss in case outcome string is
    // something like "News_Flatten_Win".
    if (rawO.includes("news_flatten") || rawO.includes("news_flat")) return "news_flatten";

    // Core win / loss.
    if (rawO === "win") return "tp_hit";
    if (rawO === "loss") return "sl_hit";

    // Breakeven.
    if (rawO === "breakeven") return "breakeven";

    // Unfilled — check before cancel group.
    const entryModelFilled =
        trade.entry_model_filled ?? trade.entryModelFilled;
    if (entryModelFilled === false || rawO.includes("unfilled")) return "unfilled";

    // Cancel variants — news blackout and news_cancel both contain "news".
    if (rawO.includes("news")) return "news_cancel";
    if (rawO.includes("session")) return "session_cancel";
    if (rawO.includes("reverse")) return "reverse_cancel";

    // Invalid / invalidated.
    if (rawO.includes("invalid")) return "invalid";

    return "unknown_exit";
}

/**
 * Derive the protection_mode tag.
 * Phase 1 stub: all trades return "baseline".
 * Full protection tag logic is deferred to Phase 2.
 *
 * @param {object} _trade
 * @returns {string}
 */
function deriveProtectionMode(_trade) {
    // Phase 1: no protection variants implemented.
    return "baseline";
}
