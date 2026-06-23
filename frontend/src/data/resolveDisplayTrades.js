/**
 * resolveDisplayTrades.js — shared active-trade-variant resolver.
 *
 * Pure, React-free, node-testable. Resolves which trade array a read surface should
 * analyse, honouring the workspace's active trade-variant selection (e.g. "TrigE +2")
 * the same way RunDetail / Strategy Map do — instead of always reading the bundle's
 * base `runData.trades`.
 *
 * Resolution order (mirrors RunDetail's legacy variant path):
 *   1. active trade variant — `tradesByVariant[activeTradeVariant]` if present
 *   2. primary variant      — `tradesByVariant[primaryVariant]` if present
 *   3. base trades          — `runData.trades`
 *   4. empty
 *
 * @param {object} runData            the run bundle (getRunData(runId))
 * @param {string|null} activeTradeVariant  store ACTIVE_TRADE_VARIANT
 * @returns {{
 *   trades: object[],
 *   selectedVariantKey: string|null,
 *   selectedVariantLabel: string|null,
 *   source: 'active_variant'|'primary_variant'|'base_trades'|'empty',
 * }}
 */
export function resolveDisplayTrades(runData, activeTradeVariant = null) {
    const rd = runData && typeof runData === "object" ? runData : {};
    const byVariant = rd.tradesByVariant && typeof rd.tradesByVariant === "object" ? rd.tradesByVariant : {};
    const has = (k) => k != null && Array.isArray(byVariant[k]);

    let selectedVariantKey = null;
    let source;
    let trades;

    if (has(activeTradeVariant)) {
        selectedVariantKey = activeTradeVariant;
        trades = byVariant[activeTradeVariant];
        source = "active_variant";
    } else if (has(rd.primaryVariant)) {
        selectedVariantKey = rd.primaryVariant;
        trades = byVariant[rd.primaryVariant];
        source = "primary_variant";
    } else if (Array.isArray(rd.trades)) {
        trades = rd.trades;
        source = "base_trades";
    } else {
        trades = [];
        source = "empty";
    }

    const selectedVariantLabel =
        selectedVariantKey || (source === "base_trades" ? "Baseline" : null);

    return { trades, selectedVariantKey, selectedVariantLabel, source };
}

// ── Shared run-display universe (Research Lab / Cockpit bridge) ───────────────
// Like resolveDisplayTrades, but FALLS BACK to entryResults.tradesByMode when
// tradesByVariant / base trades carry no resident rows. This is the fix for
// lazy / guarded entry-variant runs, whose lazily-loaded rows are merged into
// entryResults.tradesByMode (NOT tradesByVariant) — see RUN-DATA-PATH-AUDIT-1.md.
// resolveDisplayTrades itself is left unchanged (its other consumers keep their
// exact behaviour); Research Lab + Cockpit use THIS via the shared hook.
//
// Resolution order (first populated wins):
//   1. tradesByVariant[activeTradeVariant]      → "active_variant"
//   2. tradesByVariant[primaryVariant]          → "primary_variant"
//   3. bundle.trades                            → "base_trades"
//   4. entryResults.tradesByMode[activeVariant] → "entry_mode_active"
//   5. entryResults.tradesByMode[primaryVariant]→ "entry_mode_primary"
//   6. best populated entryResults.tradesByMode → "entry_mode_fallback"
//   7. none                                     → "empty" (needsHydration if lazy)
//
// @returns {{ trades, source, variantKey, needsHydration, reason }}
const _arr = (v) => (Array.isArray(v) && v.length > 0 ? v : null);

function pickBestByMode(byMode, active, primary) {
    const entries = Object.entries(byMode).filter(([, v]) => Array.isArray(v) && v.length > 0);
    if (!entries.length) return null;
    const pref = (active && entries.find(([k]) => k.startsWith(`${active}__`)))
        || (primary && entries.find(([k]) => k.startsWith(`${primary}__`)));
    const chosen = pref || [...entries].sort((a, b) => b[1].length - a[1].length)[0];
    return { key: chosen[0], trades: chosen[1] };
}

export function resolveRunDisplayUniverse(runData, activeTradeVariant = null) {
    const rd = runData && typeof runData === "object" ? runData : {};
    const byVariant = rd.tradesByVariant && typeof rd.tradesByVariant === "object" ? rd.tradesByVariant : {};
    const byMode = rd.entryResults?.tradesByMode && typeof rd.entryResults.tradesByMode === "object" ? rd.entryResults.tradesByMode : {};
    const primary = rd.primaryVariant || null;
    const out = (trades, source, variantKey) => ({ trades, source, variantKey: variantKey ?? null, needsHydration: false, reason: source });

    let t;
    if (activeTradeVariant != null && (t = _arr(byVariant[activeTradeVariant]))) return out(t, "active_variant", activeTradeVariant);
    if (primary != null && (t = _arr(byVariant[primary]))) return out(t, "primary_variant", primary);
    if ((t = _arr(rd.trades))) return out(t, "base_trades", primary || "baseline");
    if (activeTradeVariant != null && (t = _arr(byMode[activeTradeVariant]))) return out(t, "entry_mode_active", activeTradeVariant);
    if (primary != null && (t = _arr(byMode[primary]))) return out(t, "entry_mode_primary", primary);
    const best = pickBestByMode(byMode, activeTradeVariant, primary);
    if (best) return out(best.trades, "entry_mode_fallback", best.key);

    // No resident rows. The run can still be hydrated on demand if it's a lazy
    // run OR an index-only run with a sidecar reload identifier.
    const canHydrate = Boolean(rd.lazy || rd.reloadAvailable);
    return { trades: [], source: "empty", variantKey: null, needsHydration: canHydrate, reason: canHydrate ? "needs_hydration" : "no_trades" };
}

export default resolveDisplayTrades;
