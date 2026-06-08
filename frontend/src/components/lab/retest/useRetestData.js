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
import { deriveRetests, summarizeRetestEvents, DEFAULT_RETEST_CONFIG } from "@/data/obRetest";
import { enrichRetestEvents, buildRetestEdgeBreakdowns, buildBestWorstRetestConditions, buildSessionMatrix, buildRetestFindings, DEFAULT_MIN_N } from "@/data/obRetestResearch";

// Synthesize per-OB rows from events when the ob_retest_summary.csv sidecar is
// absent — lets summarizeRetestEvents derive obsRetested even without it.
function synthPerOBFromEvents(events) {
    const byOb = new Map();
    for (const e of events) {
        const k = String(e.obId);
        if (!byOb.has(k)) byOb.set(k, { obId: e.obId, touchCount: 1, retestCount: 0 });
        const rec = byOb.get(k);
        rec.retestCount += 1;
        rec.touchCount += 1;
    }
    return [...byOb.values()];
}

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
    // Backend-preferred (Phase 2.4): when the imported run carries ob_retests.csv,
    // use it verbatim — no candle load, no derivation. Presence (an array, even
    // empty) = backend mode; absence (null/undefined) = frontend derivation.
    const hasBackend = Array.isArray(activeRun?.obRetests);

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
        if (enabled && activeRunId && mayHaveCandles && !hasBackend) {
            doLoad();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRunId, enabled, mayHaveCandles, hasBackend]);

    // Derive retests (memoized). Only meaningful once candles are ready.
    const tradesByObId = React.useMemo(() => buildTradesByObId(trades || []), [trades]);

    const derived = React.useMemo(() => {
        if (hasBackend) return null; // backend-preferred → no derivation
        if (loadState !== "ready" || !candles || !candles.length) return null;
        return deriveRetests({
            orderBlocks,
            tradesByObId,
            candles,
            config,
            deriveStatus: deriveOBStatus,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasBackend, loadState, candles, orderBlocks, tradesByObId, config]);

    // Backend-verified result: built from imported ob_retests.csv (+ optional
    // ob_retest_summary.csv) via the SAME summarizer → identical cards/breakdowns.
    const backendResult = React.useMemo(() => {
        if (!hasBackend) return null;
        const events = activeRun.obRetests || [];
        const perOB = Array.isArray(activeRun.obRetestSummary) && activeRun.obRetestSummary.length
            ? activeRun.obRetestSummary
            : synthPerOBFromEvents(events);
        const obsTotal = Array.isArray(activeRun.orderBlocks) ? activeRun.orderBlocks.length : perOB.length;
        const summary = summarizeRetestEvents(events, perOB, obsTotal);
        return { events, perOB, summary, meta: { dataBasis: "backend", candleCount: null, config: null } };
    }, [hasBackend, activeRun]);

    const result = hasBackend ? backendResult : derived;

    // ── Phase C1: research layer (enrich events + grouped edge breakdowns) ───────
    // Source-agnostic: joins events to activeRun.orderBlocks for OB-level dims.
    const research = React.useMemo(() => {
        const events = result?.events || [];
        if (!events.length) return { enrichedEvents: [], edgeBreakdowns: {}, bestWorstConditions: null, sessionMatrix: null, findings: [] };
        const obs = Array.isArray(activeRun?.orderBlocks) ? activeRun.orderBlocks : [];
        const enrichedEvents = enrichRetestEvents(events, obs);
        const edgeBreakdowns = buildRetestEdgeBreakdowns(enrichedEvents, { minN: DEFAULT_MIN_N });
        return {
            enrichedEvents,
            edgeBreakdowns,
            bestWorstConditions: buildBestWorstRetestConditions(enrichedEvents, { minN: DEFAULT_MIN_N }),
            sessionMatrix: buildSessionMatrix(enrichedEvents, { minN: DEFAULT_MIN_N }),
            findings: buildRetestFindings(edgeBreakdowns, { minN: DEFAULT_MIN_N }),
        };
    }, [result, activeRun]);

    // Resolve the public status enum. Backend mode is READY immediately (no candles).
    let status;
    if (!activeRunId) status = RETEST_STATUS.NO_RUN;
    else if (hasBackend) status = RETEST_STATUS.READY;
    else if (!mayHaveCandles) status = RETEST_STATUS.NO_CANDLES;
    else if (loadState === "failed") status = RETEST_STATUS.FAILED;
    else if (loadState === "ready" && derived) status = RETEST_STATUS.READY;
    else status = RETEST_STATUS.LOADING;

    return {
        status,
        source: hasBackend ? "backend" : "frontend",
        error,
        candleCount: result?.meta?.candleCount ?? (candles?.length || 0),
        events: result?.events || [],
        perOB: result?.perOB || [],
        summary: result?.summary || null,
        meta: result?.meta || null,
        // Phase C1 / C1.5 / C1.6 research layer
        enrichedEvents: research.enrichedEvents,
        edgeBreakdowns: research.edgeBreakdowns,
        bestWorstConditions: research.bestWorstConditions,
        sessionMatrix: research.sessionMatrix,
        findings: research.findings,
        minN: DEFAULT_MIN_N,
        config,
        setConfig,
        retryLoad: doLoad,
    };
}
