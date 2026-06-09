// useFftAnalysis — single source of truth for FFT analysis on a run + scenario.
//
// FFT-IA Phase 1: wraps the existing pure modules and reproduces RunDetail's
// EXACT FFT computation so the new Protection Lab FFT tab reconciles to RunDetail.
// No new analytics formulas — every number here comes from existing modules
// (computeFftAnalytics / computePairedFftAnalytics / summarizeFftPairBuckets /
// extractOffTrades) or the display-only helpers extracted into fftDisplay.js.

import { useMemo } from "react";
import { getRunData } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { useResultsLens } from "@/data/useResultsLens";
import { buildCanonicalKey } from "@/data/tradeUniverse";
import { computeFftAnalytics } from "@/data/fftAnalytics";
import { computePairedFftAnalytics, summarizeFftPairBuckets } from "@/data/fftPairingAnalytics";
import { extractOffTrades, getAutoControlInfo } from "@/data/fftPairingResolver";
import { computeStripMetrics, dirStructSanityRows, isValidExecutedTrade } from "@/components/lab/fft/fftDisplay";

export function useFftAnalysis(runId, resultView) {
    const runData = getRunData(runId);
    const universe = useTradeUniverse(runId, resultView);
    const lens = useResultsLens();
    const accountSettings = lens?.accountSettings;
    const accountModeEnabled = accountSettings?.mode !== "r_only";
    const accountCurrency = accountSettings?.currency;

    return useMemo(() => {
        const variant = universe?.variant ?? null;
        // Mirror RunDetail.tradesForRun: prefer the resolved universe scenario
        // trades (which include FFT cancels), fall back to the variant/flat array.
        const onTrades = (Array.isArray(universe?.trades) && universe.trades.length)
            ? universe.trades
            : ((variant && runData?.tradesByVariant?.[variant]) || runData?.trades || []);

        const fft = computeFftAnalytics(onTrades);
        const canonicalKey = resultView
            ? buildCanonicalKey(resultView.family, resultView.threshold, resultView.fillMode)
            : null;
        const offTrades = extractOffTrades(runData, null, variant, canonicalKey);
        const autoControl = getAutoControlInfo(runData, variant);
        const paired = computePairedFftAnalytics(onTrades, offTrades);
        const fftBuckets = summarizeFftPairBuckets(paired.pairs);
        const hasPaired = paired.hasPairedData && paired.hasHighConfPairs;

        // Strategy delta (DISPLAY ONLY) — identical to RunDetail: NetR(FFT ON) − NetR(FFT OFF).
        const onMetrics = computeStripMetrics(onTrades, accountSettings);
        const controlMetrics = computeStripMetrics(offTrades, accountSettings);
        const strategyDeltaR = onMetrics.netR - controlMetrics.netR;
        const strategyDeltaPnl = accountModeEnabled
            ? (Number(onMetrics.account?.netPnlAmount ?? 0) - Number(controlMetrics.account?.netPnlAmount ?? 0))
            : null;
        const verdict = strategyDeltaR > 0.005 ? "helped" : strategyDeltaR < -0.005 ? "hurt" : "neutral";
        const verdictTone = verdict === "helped" ? "success" : verdict === "hurt" ? "danger" : "muted";
        const verdictText = verdict === "helped" ? "FFT helped this strategy"
            : verdict === "hurt" ? "FFT hurt this strategy" : "FFT had no clear effect";
        const isAllowMulti = String(variant ?? "") === "allow_multi_position";

        const onPerf = Array.isArray(onTrades) ? onTrades.filter(isValidExecutedTrade) : [];
        const offPerf = Array.isArray(offTrades) ? offTrades.filter(isValidExecutedTrade) : [];
        const controlSanityRows = dirStructSanityRows(offTrades);
        const onSanityRows = dirStructSanityRows(onPerf);

        const cfg = runData?.config || runData?.summary?.config || {};
        const criteria = {
            enabled: Boolean(cfg.triggered_edge_cancel_on_first_failed_tag),
            minObWidthPips: Number(cfg.triggered_edge_fft_min_ob_width_pips ?? 0) || 0,
            moveAwayPips: Number(cfg.triggered_edge_fft_move_away_pips ?? 0) || 0,
            moveAwayObMultiple: Number(cfg.triggered_edge_fft_move_away_ob_multiple ?? 0) || 0,
        };

        const fillLabel = resultView?.fillMode === "same" ? "Same Candle"
            : resultView?.fillMode === "next" ? "Next Candle"
            : /^d(\d+)$/.test(String(resultView?.fillMode || "")) ? `Delay +${String(resultView.fillMode).slice(1)}`
            : "Both";
        const scenarioLabel = resultView
            ? `Triggered Edge ${resultView.threshold}% · ${fillLabel} · FFT ON vs FFT-OFF control`
            : "";

        return {
            runData, universe, variant,
            onTrades, offTrades, onPerf, offPerf,
            fft, paired, fftBuckets, autoControl, hasPaired,
            onMetrics, controlMetrics, strategyDeltaR, strategyDeltaPnl,
            verdict, verdictTone, verdictText, isAllowMulti,
            controlSanityRows, onSanityRows,
            criteria, scenarioLabel,
            accountModeEnabled, accountCurrency,
            fftCancels: fft.fftCancels,
        };
    }, [runData, universe, accountSettings, accountModeEnabled, accountCurrency, resultView]);
}
