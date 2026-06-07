/**
 * fftPairingResolver.js — Pure helpers for FFT-OFF run pairing.
 *
 * The paired FFT-OFF analytics architecture (fftPairingAnalytics.js) requires a
 * counterpart trade array from a run where FFT was disabled. Two sources can
 * provide it, in priority order:
 *
 *   1. Auto-control (built-in): backend-generated FFT-OFF control trades that
 *      ship inside the active run bundle as `controlTradesByScenario`, keyed by
 *      `${executionMode}:${scenarioKey}`. No manual selection required.
 *   2. Manual pairing: a separately-imported FFT-OFF run the user selects via
 *      PairedRunSelector (legacy path, for older runs with no control data).
 *
 * Exports:
 *   extractOffTrades(activeBundle, pairedOffBundle, activeVariant, activeScenarioKey)
 *     Returns the OFF trade array — built-in auto-control first, then a
 *     manually-selected paired OFF run as fallback.
 *
 *   resolveAutoControlTrades(activeBundle, activeVariant, activeScenarioKey)
 *     Built-in FFT-OFF control trades for the active variant + scenario, or [].
 *
 *   getAutoControlInfo(bundle, activeVariant)
 *     Whether auto-control trades exist (drives the PairedRunSelector badge).
 *
 *   getPairableRunOptions(runs, activeRunId)
 *     Returns all loaded run bundles (except the active one) as option
 *     descriptors for a picker UI. Includes FFT on/off detection from
 *     bundle.config when available — does NOT filter aggressively so
 *     the user retains explicit control.
 *
 * No React. No side effects. All functions are pure.
 */

// ── auto-control resolution ───────────────────────────────────────────────────

/**
 * Resolve the built-in FFT-OFF control trades carried on the active run bundle.
 *
 * Priority:
 *   a. exact key  `${activeVariant}:${activeScenarioKey}`               (best)
 *   b. when the scenario key is absent/unmatched but exactly ONE control
 *      scenario exists for the active variant, use it (unambiguous)
 *   c. []  (no auto-control available)
 *
 * @param {object|null} activeBundle      — the active run bundle (carries control trades)
 * @param {string|null} activeVariant     — active trade-variant key (e.g. "single_position")
 * @param {string|null} activeScenarioKey — active scenario key (e.g. "entry_triggered_edge_25p0_d3")
 * @returns {Array}
 */
export function resolveAutoControlTrades(activeBundle, activeVariant, activeScenarioKey) {
    const map = activeBundle?.controlTradesByScenario;
    if (!map || typeof map !== "object") return [];

    // a. Exact variant:scenario match.
    if (activeVariant && activeScenarioKey) {
        const exact = map[`${activeVariant}:${activeScenarioKey}`];
        if (Array.isArray(exact) && exact.length > 0) return exact;
    }

    // b. Single unambiguous control scenario for the active variant.
    const prefix = activeVariant ? `${activeVariant}:` : null;
    const populated = Object.entries(map).filter(
        ([key, arr]) =>
            Array.isArray(arr) && arr.length > 0 && (prefix ? key.startsWith(prefix) : true),
    );
    if (populated.length === 1) return populated[0][1];

    return [];
}

/**
 * Report auto-control availability for the active variant — drives the
 * PairedRunSelector informational badge. Variant-level (not scenario-level) so
 * the badge reflects that the run *has* built-in control data.
 *
 * @param {object|null} bundle
 * @param {string|null} activeVariant
 * @returns {{ available: boolean, scenarioKeys: string[], count: number }}
 */
export function getAutoControlInfo(bundle, activeVariant) {
    const map = bundle?.controlTradesByScenario;
    if (!map || typeof map !== "object") {
        return { available: false, scenarioKeys: [], count: 0 };
    }
    const prefix = activeVariant ? `${activeVariant}:` : null;
    const scenarioKeys = Object.keys(map).filter((key) => {
        const arr = map[key];
        if (!Array.isArray(arr) || arr.length === 0) return false;
        return prefix ? key.startsWith(prefix) : true;
    });
    return { available: scenarioKeys.length > 0, scenarioKeys, count: scenarioKeys.length };
}

// ── extractOffTrades ──────────────────────────────────────────────────────────

/**
 * Resolve the FFT-OFF counterpart trade array for the paired analytics.
 *
 * Priority:
 *   0. auto-control on the active bundle (resolveAutoControlTrades)   ← first
 *   1. pairedOffBundle.tradesByVariant[activeVariant]   (manual, variant-matched)
 *   2. pairedOffBundle.trades                            (manual, flat array)
 *   3. first non-empty variant in pairedOffBundle        (manual)
 *   4. []
 *
 * @param {object|null} activeBundle      — active run bundle (carries control trades)
 * @param {object|null} pairedOffBundle   — manually-selected FFT-OFF run (fallback)
 * @param {string|null} activeVariant     — active trade-variant key (e.g. "single_position")
 * @param {string|null} activeScenarioKey — active scenario key (e.g. "entry_triggered_edge_25p0_d3")
 * @returns {Array}
 */
export function extractOffTrades(activeBundle, pairedOffBundle, activeVariant, activeScenarioKey) {
    // Priority 0 — built-in auto-control trades (no manual selection needed).
    const auto = resolveAutoControlTrades(activeBundle, activeVariant, activeScenarioKey);
    if (auto.length > 0) return auto;

    // Priority 1-4 — manual paired FFT-OFF run fallback.
    return extractManualOffTrades(pairedOffBundle, activeVariant);
}

/**
 * Manual paired-run extraction (legacy path). Used when no auto-control exists.
 *
 * Priority:
 *   1. bundle.tradesByVariant[activeVariant]  — variant-matched (best)
 *   2. bundle.trades                          — top-level flat array
 *   3. first non-empty array in tradesByVariant
 *   4. []
 *
 * @param {object|null} bundle        — manually-paired OFF run bundle
 * @param {string|null} activeVariant — active trade-variant key (e.g. "single_position")
 * @returns {Array}
 */
function extractManualOffTrades(bundle, activeVariant) {
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
