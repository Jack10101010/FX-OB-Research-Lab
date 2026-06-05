/**
 * fftPairingResolver.js — Pure helpers for explicit FFT-OFF run pairing.
 *
 * The paired FFT-OFF analytics architecture (fftPairingAnalytics.js) requires
 * a counterpart trade array from a run where FFT was disabled. This module
 * provides the two helpers needed to activate that architecture:
 *
 *   extractOffTrades(bundle, activeVariant)
 *     Returns the correct trade array from a paired OFF bundle,
 *     matching the active variant key when possible.
 *
 *   getPairableRunOptions(runs, activeRunId)
 *     Returns all loaded run bundles (except the active one) as option
 *     descriptors for a picker UI. Includes FFT on/off detection from
 *     bundle.config when available — does NOT filter aggressively so
 *     the user retains explicit control.
 *
 * No React. No side effects. All functions are pure.
 */

// ── extractOffTrades ──────────────────────────────────────────────────────────

/**
 * Extract the trade array from a paired OFF bundle.
 *
 * Priority:
 *   1. bundle.tradesByVariant[activeVariant]  — variant-matched (best)
 *   2. bundle.trades                          — top-level flat array
 *   3. first non-empty array in tradesByVariant
 *   4. []
 *
 * @param {object|null} bundle        — full run bundle from store
 * @param {string|null} activeVariant — active trade-variant key (e.g. "single_position")
 * @returns {Array}
 */
export function extractOffTrades(bundle, activeVariant) {
    if (!bundle) return [];

    // 1. Variant-matched
    if (
        activeVariant &&
        bundle.tradesByVariant &&
        Array.isArray(bundle.tradesByVariant[activeVariant]) &&
        bundle.tradesByVariant[activeVariant].length > 0
    ) {
        return bundle.tradesByVariant[activeVariant];
    }

    // 2. Top-level trades
    if (Array.isArray(bundle.trades) && bundle.trades.length > 0) {
        return bundle.trades;
    }

    // 3. First populated variant
    if (bundle.tradesByVariant && typeof bundle.tradesByVariant === "object") {
        for (const v of Object.values(bundle.tradesByVariant)) {
            if (Array.isArray(v) && v.length > 0) return v;
        }
    }

    return [];
}

// ── getPairableRunOptions ─────────────────────────────────────────────────────

/**
 * Build the list of run options that can be selected as the paired FFT-OFF run.
 *
 * Returns all fully-loaded bundles except the active run. Includes FFT
 * detection from bundle.config — but does NOT filter on this so the user can
 * always choose manually even if the config key is absent (older bundles).
 *
 * Sorting: detected FFT-OFF runs appear first, then FFT-ON, then unknown.
 *
 * @param {object} runs           — raw state.runs map (runId → bundle)
 * @param {string|null} activeRunId
 * @returns {Array<{
 *   runId:       string,
 *   label:       string,   // display name only
 *   symbol:      string,
 *   dateRange:   string,
 *   isFftOff:    boolean,  // config.triggered_edge_cancel_on_first_failed_tag === false
 *   isFftOn:     boolean,  // config.triggered_edge_cancel_on_first_failed_tag === true
 *   hasFullData: boolean,  // at least one trade array is non-empty
 * }>}
 */
export function getPairableRunOptions(runs, activeRunId) {
    if (!runs || typeof runs !== "object") return [];

    const options = Object.values(runs)
        .filter(bundle => bundle?.id && bundle.id !== activeRunId)
        .map(bundle => {
            const cfg     = bundle.config     || bundle.summary?.config || {};
            const summary = bundle.summary    || {};

            // Display name — mirrors headlineSummary priority
            const label =
                bundle.displayName ||
                bundle.name        ||
                summary.displayName ||
                summary.name       ||
                bundle.id;

            // Symbol
            const symbol =
                cfg.symbol     ||
                summary.symbol ||
                bundle.symbol  ||
                "";

            // Date range
            const dateRange =
                summary.dateRange ||
                bundle.dateRange  ||
                (cfg.date_from && cfg.date_to
                    ? `${cfg.date_from} → ${cfg.date_to}`
                    : null)                   ||
                (cfg.start_date && cfg.end_date
                    ? `${cfg.start_date} → ${cfg.end_date}`
                    : null)                   ||
                "";

            // FFT detection — key absent on pre-FFT bundles
            const fftFlag = cfg.triggered_edge_cancel_on_first_failed_tag;
            const isFftOff = fftFlag === false;
            const isFftOn  = fftFlag === true;

            // Full data check
            const hasFullData = Boolean(
                (Array.isArray(bundle.trades) && bundle.trades.length > 0) ||
                Object.values(bundle.tradesByVariant || {}).some(
                    t => Array.isArray(t) && t.length > 0
                )
            );

            return { runId: bundle.id, label, symbol, dateRange, isFftOff, isFftOn, hasFullData };
        });

    // Sort: FFT-OFF first, then unknown, then FFT-ON
    options.sort((a, b) => {
        const rankA = a.isFftOff ? 0 : a.isFftOn ? 2 : 1;
        const rankB = b.isFftOff ? 0 : b.isFftOn ? 2 : 1;
        return rankA - rankB;
    });

    return options;
}
