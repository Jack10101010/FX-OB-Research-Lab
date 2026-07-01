// ── useMarketState.js ──────────────────────────────────────────────────────
// Thin React memo wrappers around the pure engine in data/marketState.js.
//
// PURPOSE: keep ALL indicator math in marketState.js. Components import these
// hooks and receive a ready-made panel / per-trade snapshot — they never compute
// EMA / BBW / ADX themselves. The heavy panel is built ONCE per (candles, cfg,
// symbol) and memoized, so per-trade lookups are O(1) map reads.
//
// The panel/snapshot carry source:"client" + version (see marketState.js): these
// are the fast client-side label values, NOT authoritative engine truth. When the
// engine later emits per-trade regime columns, prefer those (source:"engine").

import { useMemo } from "react";
import {
    daily_regime_panel,
    REGIME_DEFAULTS,
} from "@/data/marketState";
import { resolveTradeMarketState } from "@/data/marketStateSource";

// Map a saved run config.json (backend regime_* keys) back to the marketState.js
// cfg shape. Absent keys fall through to REGIME_DEFAULTS, so a run with no regime
// settings still yields a labelled snapshot from the locked per-symbol defaults.
export function regimeCfgFromRunConfig(config) {
    if (!config || typeof config !== "object") return {};
    const num = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
    return {
        emaLength: num(config.regime_ema_length, REGIME_DEFAULTS.emaLength),
        emaConfirmDays: num(config.regime_ema_confirm, REGIME_DEFAULTS.emaConfirmDays),
        emaTimeframe: config.regime_ema_tf ?? "Daily",
        bbwLength: num(config.regime_bbw_length, REGIME_DEFAULTS.bbwLength),
        bbwStdDev: num(config.regime_bbw_std, REGIME_DEFAULTS.bbwStdDev),
        bbwThresholdMode: config.regime_bbw_thr_mode ?? REGIME_DEFAULTS.bbwThresholdMode,
        bbwThresholdValue: config.regime_bbw_thr_value != null ? Number(config.regime_bbw_thr_value) : undefined,
        bbwPercentile: num(config.regime_bbw_pctile, REGIME_DEFAULTS.bbwPercentile),
        adxLength: num(config.regime_adx_length, REGIME_DEFAULTS.adxLength),
        adxChop: num(config.regime_adx_chop, REGIME_DEFAULTS.adxChop),
    };
}

// Stable-ish key so the memo only rebuilds when a relevant regime input changes.
function cfgKey(cfg) {
    if (!cfg) return "";
    const k = [
        cfg.emaLength, cfg.emaConfirmDays, cfg.emaTimeframe,
        cfg.bbwLength, cfg.bbwStdDev, cfg.bbwThresholdMode, cfg.bbwThresholdValue, cfg.bbwPercentile,
        cfg.adxLength, cfg.adxChop,
    ];
    return k.join("|");
}

/**
 * Build (and memoize) the leakage-safe daily regime panel for a run's candles.
 * @param {Array}  candles run-level candles ([{t,o,h,l,c}] or [{time,open,...}])
 * @param {Object} cfg     regime cfg (marketState.js shape) — defaults if omitted
 * @param {string} symbol  e.g. "EURUSD" (drives the locked BBW default)
 */
export function useMarketStatePanel(candles, cfg, symbol) {
    const key = cfgKey(cfg);
    const n = candles ? candles.length : 0;
    return useMemo(
        () => daily_regime_panel(candles || [], cfg || {}, symbol || "EURUSD"),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [n, key, symbol],
    );
}

/**
 * Per-trade market-state snapshot (memoized), ENGINE-PREFERRED (Phase 3d).
 *
 * If the trade carries an engine-emitted snapshot (`trade.regimeEmit`, source:"engine")
 * it is returned directly and the client reconstruction is NOT invoked. Otherwise this
 * falls back to the client panel lookup (source:"client"), preserving legacy behaviour.
 * Returns null when neither is available (warmup / unknown day / no candles).
 */
export function useTradeMarketState(trade, panel) {
    const id = trade?.id ?? trade?.fill_time ?? trade?.entry ?? null;
    const hasEngine = !!(trade && trade.regimeEmit && trade.regimeEmit.marketState);
    return useMemo(
        () => resolveTradeMarketState(trade, panel),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [id, panel, hasEngine],
    );
}
