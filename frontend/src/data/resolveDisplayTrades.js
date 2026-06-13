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

export default resolveDisplayTrades;
