/**
 * useRetestData — React hook for the Retest Lab tab (Phase 1, frontend-derived).
 *
 * Responsibilities (kept thin — all retest logic lives in data/obRetest.js):
 *   1. Resolve candle availability for the active run and lazily load candles
 *      (via store.loadCandlesForRun) only once the tab is enabled.
 *   2. Build the OB↔trade map and run deriveRetests (memoized).
 *   3. Expose a single status enum + the derived { events, perOB, summary, meta }
 *      plus the config + setConfig for the config bar.
 *
 * Does NOT touch backend / importer / store internals / export schema — it only
 * consumes the public useDataset() surface and the pure obRetest module.
 */
import React from "react";
import { useDataset } from "@/data/store";
import { buildTradesByObId, deriveOBStatus } from "@/data/obLifecycle";
import { deriveRetests, DEFAULT_RETEST_CONFIG } from "@/data/obRetest";

// Status enum drives the gate order in RetestLabTab.
export const RETEST_STATUS = {
    NO_RUN: "no_run",
    NO_CANDLES: "no_candles",
    LOADING: "loading",
    FAILED: "failed",
    READY: "ready",
};

function runMayHaveCandles(run) {
    return !!(run && (run.hasCandles || run.candlesStorage || (Array.isArray(run.candles) && run.candles.length)));
}

export function useRetestData({ orderBlocks = [], trades = [], activeRun = null, activeRunId = null, enabled = false } = {}) {
    const { loadCandlesForRun } = useDataset();

    const [config, setConfigState] = React.useState(DEFAULT_RETEST_CONFIG);
    const [candles, setCandles] = React.useState(null);
    const [loadState, setLoadState] = React.useState("idle"); // idle | loading | ready | failed
    const [error, setError] = React.useState("");

    const setConfig = React.useCallback((patch) => {
        setConfigState((prev) => ({ ...prev, ...patch }));
    }, []);

    const mayHaveCandles = runMayHaveCandles(activeRun);

    // Lazy candle load — only when the tab is enabled and the run plausibly has candles.
    const loadToken = React.useRef(0);
    const doLoad = React.useCallback(async () => {
        if (!activeRunId || !mayHaveCandles) return;
        const token = ++loadToken.current;
        setLoadState("loading");
        setError("");
        // In-memory fast path.
        if (Array.isArray(activeRun?.candles) && activeRun.candles.length) {
            setCandles(activeRun.candles);
            setLoadState("ready");
            return;
        }
        try {
            const result = await loadCandlesForRun(activeRunId);
            if (token !== loadToken.current) return; // superseded by a newer run
            const arr = Array.isArray(result) ? result : (result?.candles || []);
            setCandles(arr);
            setLoadState(arr.length ? "ready" : "failed");
            if (!arr.length) setError("Candle data was empty for this run.");
        } catch (e) {
            if (token !== loadToken.current) return;
            setCandles(null);
            setLoadState("failed");
            setError(e?.message || "Could not load candle data for this run.");
        }
    }, [activeRunId, mayHaveCandles, activeRun, loadCandlesForRun]);

    // Reset + trigger load on run change / enable.
    React.useEffect(() => {
        setCandles(null);
        setLoadState("idle");
        setError("");
        loadToken.current += 1;
        if (enabled && activeRunId && mayHaveCandles) {
            doLoad();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRunId, enabled, mayHaveCandles]);

    // Derive retests (memoized). Only meaningful once candles are ready.
    const tradesByObId = React.useMemo(() => buildTradesByObId(trades || []), [trades]);

    const derived = React.useMemo(() => {
        if (loadState !== "ready" || !candles || !candles.length) return null;
        return deriveRetests({
            orderBlocks,
            tradesByObId,
            candles,
            config,
            deriveStatus: deriveOBStatus,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadState, candles, orderBlocks, tradesByObId, config]);

    // Resolve the public status enum.
    let status;
    if (!activeRunId) status = RETEST_STATUS.NO_RUN;
    else if (!mayHaveCandles) status = RETEST_STATUS.NO_CANDLES;
    else if (loadState === "failed") status = RETEST_STATUS.FAILED;
    else if (loadState === "ready" && derived) status = RETEST_STATUS.READY;
    else status = RETEST_STATUS.LOADING;

    return {
        status,
        error,
        candleCount: derived?.meta?.candleCount ?? (candles?.length || 0),
        events: derived?.events || [],
        perOB: derived?.perOB || [],
        summary: derived?.summary || null,
        meta: derived?.meta || null,
        config,
        setConfig,
        retryLoad: doLoad,
    };
}
