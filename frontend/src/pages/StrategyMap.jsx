import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useResolvedScenario } from "./strategyMap/useResolvedScenario";
import { ScenarioSelector } from "./strategyMap/ScenarioSelector";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonInput, NeonSelect, Segment, NeonButton, FilterToggle } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { CandleChart } from "@/components/lab/CandleChart";
import { IntrabarInspector } from "@/components/lab/IntrabarInspector";
import { compactTimeframe, formatRunDateRange, getRunDisplayName, loadCandlesForRun, reloadFullRunFromSidecar, rehydrateRunCandles, useDataset } from "@/data/store";
import { setActiveRunId, setScenario, setSelectedTradeVariant } from "@/data/store";
import { FolderKanban, Search, AlertTriangle } from "lucide-react";
import {
    isWinTrade,
    isLossTrade,
    summarizeTradeClassifications,
    displayOutcomeLabel,
    displayCancelReason,
    outcomeToneForTrade,
} from "@/data/tradeClassification";
import { formatDirectionalScenarioLabel } from "@/components/lab/entries/analytics/entryFormatters";
import { derivePrimaryResultView } from "@/data/tradeUniverse";

const STRATEGY_MAP_UI_KEY = "fxob_strategy_map_ui_v1";
const DEFAULT_CHART_HEIGHT = 460;
const MIN_CHART_HEIGHT = 420;
const MAX_CHART_HEIGHT_VH = 0.85;

const DEFAULT_SESSION_SETTINGS = {
    asia: { label: "Asia", enabled: false, start: "23:00", end: "07:00", colorKey: "asia" },
    london: { label: "London", enabled: true, start: "07:00", end: "10:00", colorKey: "london" },
    londonLull: { label: "London Lull", enabled: false, start: "10:00", end: "12:00", colorKey: "londonLull" },
    newYork: { label: "New York", enabled: true, start: "12:00", end: "16:00", colorKey: "newYork" },
};

const DEFAULT_LAYERS = {
    obs: true,
    longs: true,
    shorts: true,
    wins: true,
    losses: true,
    bosChoch: true,
    sessions: true,
    markers: true,
    obOrigin: false,
    obDetection: false,
    obLabels: false,
    rrTools: false,
    news: false,
    newsLabels: false,
    // Triggered-edge lifecycle visuals
    triggeredEdgeLevels: false,
    triggeredEdgeLabels: false,
    triggeredEdgeLifecycle: false,
    triggeredEdgeBadges: true,
    cancelledSetups: true,
    // OB Details callout overlay
    obDetails: false,
    // Ghost tracking overlays (Phase 0 — observational, all off by default)
    ghostCandidateMarkers: false,
    ghostFillMarkers: false,
    ghostWinMarkers: false,
    ghostLossMarkers: false,
    // FFT Debug overlay — pink tap/cancel markers + debug checklist in lifecycle panel
    fftDebug: false,
};

const DEFAULT_UI_SETTINGS = {
    version: 1,
    displayTf: "15m",
    zoom: "ALL",
    chartHeight: DEFAULT_CHART_HEIGHT,
    selectedEntryModelByRun: {},
    showTradeList: true,
    showChartFilters: true,
    showSessionEditor: false,
    layers: DEFAULT_LAYERS,
    sessionSettings: DEFAULT_SESSION_SETTINGS,
};

function maxChartHeight() {
    if (typeof window === "undefined") return 900;
    return Math.max(MIN_CHART_HEIGHT, Math.floor(window.innerHeight * MAX_CHART_HEIGHT_VH));
}

function clampChartHeight(value) {
    const n = Number(value);
    if (!isFinite(n)) return DEFAULT_CHART_HEIGHT;
    return Math.max(MIN_CHART_HEIGHT, Math.min(maxChartHeight(), Math.round(n)));
}

function isValidSavedChartHeight(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= MIN_CHART_HEIGHT && n <= maxChartHeight();
}

function mergeSessionSettings(saved = {}) {
    return Object.fromEntries(
        Object.entries(DEFAULT_SESSION_SETTINGS).map(([key, defaults]) => [
            key,
            { ...defaults, ...(saved?.[key] || {}) },
        ]),
    );
}

function mergeStrategyMapUi(saved = {}) {
    return {
        ...DEFAULT_UI_SETTINGS,
        ...saved,
        chartHeight: clampChartHeight(saved?.chartHeight ?? DEFAULT_CHART_HEIGHT),
        selectedEntryModelByRun: saved?.selectedEntryModelByRun && typeof saved.selectedEntryModelByRun === "object"
            ? saved.selectedEntryModelByRun
            : {},
        showTradeList: saved?.showTradeList ?? (typeof window === "undefined" ? true : window.innerWidth >= 1280),
        showChartFilters: saved?.showChartFilters ?? true,
        showSessionEditor: saved?.showSessionEditor ?? false,
        layers: { ...DEFAULT_LAYERS, ...(saved?.layers || {}) },
        sessionSettings: mergeSessionSettings(saved?.sessionSettings),
    };
}

function loadStrategyMapUi() {
    try {
        const raw = localStorage.getItem(STRATEGY_MAP_UI_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        if (saved?.chartHeight != null && !isValidSavedChartHeight(saved.chartHeight)) {
            delete saved.chartHeight;
            localStorage.setItem(STRATEGY_MAP_UI_KEY, JSON.stringify(saved));
        }
        return mergeStrategyMapUi(saved);
    } catch {
        try {
            localStorage.removeItem(STRATEGY_MAP_UI_KEY);
        } catch {
            // View preferences are non-critical.
        }
        return mergeStrategyMapUi();
    }
}

function saveStrategyMapUi(settings) {
    try {
        localStorage.setItem(STRATEGY_MAP_UI_KEY, JSON.stringify(settings));
    } catch {
        // View preferences are non-critical.
    }
}

export default function StrategyMap() {
    const { CANDLES, OB_BOXES, OB_BOXES_ENRICHED, TRADE_MARKERS, RUNS, activeRunId, getRunData, ACTIVE_TRADE_VARIANT, candleLoadStatus, SCENARIO } = useDataset();
    const [initialUi] = useState(loadStrategyMapUi);
    const resizeRef = useRef(null);
    const candleLoadAttemptedRef = useRef(new Set());
    const fullRunLoadAttemptedRef = useRef(new Set());
    const [displayTf, setDisplayTf] = useState(initialUi.displayTf);
    const [zoom, setZoom] = useState(initialUi.zoom);
    const [chartHeight, setChartHeight] = useState(initialUi.chartHeight);
    const [selectedEntryModelByRun, setSelectedEntryModelByRun] = useState(initialUi.selectedEntryModelByRun || {});
    const [showTradeList, setShowTradeList] = useState(initialUi.showTradeList);
    const [showChartFilters, setShowChartFilters] = useState(initialUi.showChartFilters);
    const [showSessionEditor, setShowSessionEditor] = useState(initialUi.showSessionEditor);
    const [showOB, setShowOB] = useState(initialUi.layers.obs);
    const [showLongs, setShowLongs] = useState(initialUi.layers.longs);
    const [showShorts, setShowShorts] = useState(initialUi.layers.shorts);
    const [showWins, setShowWins] = useState(initialUi.layers.wins);
    const [showLosses, setShowLosses] = useState(initialUi.layers.losses);
    const [showBC, setShowBC] = useState(initialUi.layers.bosChoch);
    const [showObOriginMarkers, setShowObOriginMarkers] = useState(initialUi.layers.obOrigin);
    const [showObDetectionMarkers, setShowObDetectionMarkers] = useState(initialUi.layers.obDetection);
    const [showObLabels, setShowObLabels] = useState(initialUi.layers.obLabels);
    const [showRrTools, setShowRrTools] = useState(initialUi.layers.rrTools);
    const [showNewsEvents, setShowNewsEvents] = useState(initialUi.layers.news);
    const [showNewsLabels, setShowNewsLabels] = useState(initialUi.layers.newsLabels);
    const [showSessions, setShowSessions] = useState(initialUi.layers.sessions);
    const [showMarkers, setShowMarkers] = useState(initialUi.layers.markers);
    // Triggered-edge lifecycle layer toggles
    const [showTriggeredEdgeLevels, setShowTriggeredEdgeLevels] = useState(initialUi.layers.triggeredEdgeLevels);
    const [showTriggeredEdgeLabels, setShowTriggeredEdgeLabels] = useState(initialUi.layers.triggeredEdgeLabels ?? false);
    const [showTriggeredEdgeLifecycle, setShowTriggeredEdgeLifecycle] = useState(initialUi.layers.triggeredEdgeLifecycle);
    const [showTriggeredEdgeBadges, setShowTriggeredEdgeBadges] = useState(initialUi.layers.triggeredEdgeBadges);
    const [showCancelledSetups, setShowCancelledSetups] = useState(initialUi.layers.cancelledSetups);
    // Lifecycle detail popover (shown when a badge/lifecycle marker is clicked)
    const [selectedOverlay, setSelectedOverlay] = useState(null);
    const [showObDetails, setShowObDetails] = useState(initialUi.layers.obDetails ?? false);
    // Ghost tracking overlay toggles (Phase 0 — all off by default)
    const [showGhostCandidateMarkers, setShowGhostCandidateMarkers] = useState(initialUi.layers.ghostCandidateMarkers ?? false);
    const [showGhostFillMarkers, setShowGhostFillMarkers] = useState(initialUi.layers.ghostFillMarkers ?? false);
    const [showGhostWinMarkers, setShowGhostWinMarkers] = useState(initialUi.layers.ghostWinMarkers ?? false);
    const [showGhostLossMarkers, setShowGhostLossMarkers] = useState(initialUi.layers.ghostLossMarkers ?? false);
    const [showFftDebug, setShowFftDebug] = useState(initialUi.layers.fftDebug ?? false);
    const [sessionSettings, setSessionSettings] = useState(initialUi.sessionSettings);
    const [tradeQuery, setTradeQuery] = useState("");
    const [tradeOutcomeFilter, setTradeOutcomeFilter] = useState("All");
    const [tradeDirectionFilter, setTradeDirectionFilter] = useState("All");
    const [tradeStructureFilter, setTradeStructureFilter] = useState("All");
    const [selectedTradeId, setSelectedTradeId] = useState(null);
    const [showRunInfo, setShowRunInfo] = useState(false);
    const [fullRunLoading, setFullRunLoading] = useState(false);
    const [fullRunError, setFullRunError] = useState("");
    const importedRuns = RUNS.filter((r) => r._source === "imported");
    const fallbackRunId = importedRuns.find((r) => (
        r.id && (r.hasCandles || r.candleCount || r.trades || r.ob_count || r.obCount)
    ))?.id || importedRuns[0]?.id || null;
    const runId = activeRunId || fallbackRunId;
    const alternateRunId = importedRuns.find((r) => (
        r.id && r.id !== runId && (r.hasCandles || r.candleCount || r.trades || r.ob_count || r.obCount)
    ))?.id || null;
    const bundle = runId ? getRunData(runId) : null;
    const activeRunMeta = RUNS.find((r) => r.id === runId) || {};
    const isViewedActiveRun = Boolean(runId && activeRunId === runId);
    const runHasOverlayData = Boolean(
        bundle?.hasFullData
        || (Array.isArray(bundle?.orderBlocks) && bundle.orderBlocks.length)
        || (Array.isArray(bundle?.trades) && bundle.trades.length)
        || Object.values(bundle?.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length)
    );
    const canReloadFullRunFromSidecar = Boolean(
        runId
        && !runHasOverlayData
        && (
            bundle?.reloadAvailable
            || activeRunMeta?.reloadAvailable
            || bundle?.sidecarRunId
            || bundle?.sidecarJobId
            || bundle?.sourceOutputFolder
            || bundle?.outputFolder
            || activeRunMeta?.sourceOutputFolder
            || activeRunMeta?.outputFolder
        )
    );
    const sourceCandles = CANDLES?.length ? CANDLES : (bundle?.candles || []);
    const hasCandles = bundle ? (bundle.hasCandles !== false && !!bundle.candles?.length) : (CANDLES?.length > 0);
    const candlesInIndexedDb = !!bundle?.hasCandles && bundle?.candlesStorage === "indexeddb" && !bundle?.candles?.length;
    const candleStatus = runId ? candleLoadStatus?.[runId] || null : null;
    const candlesLoading = candleStatus?.status === "loading";
    const candlesError = candleStatus?.status === "failed" ? candleStatus.error : "";
    const canLoadCandlesFromSidecar = Boolean(
        runId
        && !hasCandles
        && !fullRunLoading
        && (!canReloadFullRunFromSidecar || runHasOverlayData || fullRunError)
        && (
            bundle?.reloadAvailable
            || activeRunMeta?.reloadAvailable
            || bundle?.sidecarRunId
            || bundle?.sidecarJobId
            || bundle?.sourceOutputFolder
            || bundle?.outputFolder
            || activeRunMeta?.sourceOutputFolder
            || activeRunMeta?.outputFolder
        )
    );
    const summary = bundle?.summary || activeRunMeta || {};
    const projectId = bundle?.projectId || bundle?.summary?.projectId || activeRunMeta?.projectId || activeRunMeta?.summary?.projectId;
    const heroTitle = summary.projectName || bundle?.projectName || activeRunMeta?.projectName || getRunDisplayName(bundle || activeRunMeta || { id: runId });
    const heroSymbol = bundle?.config?.symbol || summary.symbol || activeRunMeta.symbol || "—";
    const heroTf = compactTimeframe(
        summary.detectionTf ||
        summary.detection_tf ||
        bundle?.config?.detection_timeframe ||
        activeRunMeta.detectionTf ||
        "—",
    );
    const heroRr = Number(activeRunMeta.rr ?? summary.rr ?? summary.rr_multiple ?? bundle?.config?.rr_multiple);
    const heroTrades = summary.trades ?? summary.trade_count ?? activeRunMeta.trades;
    const heroDateRange = formatRunDateRange(
        summary.dateRange ||
        activeRunMeta.dateRange ||
        (bundle?.config?.start_date && bundle?.config?.end_date ? `${bundle.config.start_date} → ${bundle.config.end_date}` : ""),
    );
    const medianCandleGapSec = useMemo(() => getMedianCandleGapSec(sourceCandles), [sourceCandles]);
    const candlesAreCoarse = medianCandleGapSec >= 900;
    const displayTfOptions = useMemo(() => (candlesAreCoarse ? ["15m"] : ["1m", "5m", "15m"]), [candlesAreCoarse]);
    const displayCandles = useMemo(() => {
        if (candlesAreCoarse || displayTf === "1m") return normalizeDisplayCandles(sourceCandles);
        return resampleCandlesForDisplay(sourceCandles, displayTf === "15m" ? 15 : 5);
    }, [sourceCandles, candlesAreCoarse, displayTf]);
    const rawChartObBoxes = isViewedActiveRun && (OB_BOXES_ENRICHED?.length || OB_BOXES?.length)
        ? (OB_BOXES_ENRICHED?.length ? OB_BOXES_ENRICHED : OB_BOXES)
        : (bundle?.orderBlocks || []);
    const selectedVariant = ACTIVE_TRADE_VARIANT && bundle?.tradesByVariant?.[ACTIVE_TRADE_VARIANT]
        ? ACTIVE_TRADE_VARIANT
        : bundle?.primaryVariant;
    const baseVariantTrades = useMemo(() => (
        selectedVariant && bundle?.tradesByVariant?.[selectedVariant]
            ? bundle.tradesByVariant[selectedVariant]
            : (bundle?.trades || [])
    ), [bundle, selectedVariant]);
    const entryModelOptions = useMemo(() => (
        buildEntryModelOptions(bundle, baseVariantTrades)
    ), [bundle, baseVariantTrades]);
    const defaultEntryModel = useMemo(() => (
        defaultEntryModelSelection(entryModelOptions)
    ), [entryModelOptions]);
    const selectedEntryModel = useMemo(() => {
        const saved = runId ? selectedEntryModelByRun[runId] : "";
        return entryModelOptions.some((option) => option.value === saved) ? saved : defaultEntryModel;
    }, [defaultEntryModel, entryModelOptions, runId, selectedEntryModelByRun]);
    // Derived primary result view — seeds the global scenario when no explicit
    // selection exists for this run (replaces the old "first TE key" heuristic).
    const derivedPrimaryScenario = useMemo(
        () => derivePrimaryResultView(bundle),
        [bundle],
    );
    // Auto-seed the global scenario from the run's primary result view when:
    //   - No scenario active (fresh start, SCENARIO.runId is null)
    //   - Scenario targets a different run (run switch)
    //   - Scenario family is unset (null)
    // Explicit user selections (SCENARIO.runId === runId && SCENARIO.family set)
    // are never overwritten — the shouldSeed guard prevents that.
    useEffect(() => {
        if (!runId || !derivedPrimaryScenario) return;
        const shouldSeed = (
            !SCENARIO?.runId
            || SCENARIO.runId !== runId
            || !SCENARIO.family
        );
        if (!shouldSeed) return;
        setScenario({ runId, ...derivedPrimaryScenario });
    }, [runId, derivedPrimaryScenario]); // eslint-disable-line react-hooks/exhaustive-deps
    // ------------------------------------------------------------------
    // Canonical scenario resolver (Phase 2)
    // All trade/OB/overlay/stats data flows from here.
    // ------------------------------------------------------------------
    const resolvedScenario = useResolvedScenario(SCENARIO, bundle, {
        activeTradeVariant: ACTIVE_TRADE_VARIANT,
        tradeMarkers: TRADE_MARKERS,
        obBoxes: rawChartObBoxes,
        isViewedActiveRun,
        summary,
        legacyEntryModelHint: selectedEntryModel,
        showRrTools,
    });

    // ── Directional scenario bypass ───────────────────────────────────────────
    // When a directional backend scenario is selected, we bypass the entry-model
    // resolution chain entirely — useResolvedScenario doesn't know about
    // family:"directional" and falls back to baseline. All overrides live here.
    const isDirectionalMode = SCENARIO?.family === "directional";
    const directionalStorageKey = isDirectionalMode ? (SCENARIO?.directionalStorageKey || null) : null;

    const directionalAvailableScenarios = useMemo(() => {
        const dr = bundle?.directionalResults;
        if (!dr?.scenarioMeta) return [];
        return Object.entries(dr.scenarioMeta)
            .map(([sk, meta]) => ({
                storageKey: sk,
                meta,
                label: formatDirectionalScenarioLabel(
                    meta?.scenarioId || sk.replace(/^[^_]+__/, ""),
                ),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [bundle]);

    const directionalTrades = useMemo(() => {
        if (!isDirectionalMode || !directionalStorageKey) return [];
        return bundle?.directionalResults?.tradesByScenario?.[directionalStorageKey] || [];
    }, [isDirectionalMode, bundle, directionalStorageKey]);

    // Patch resolvedScenario.trades so ScenarioSelector's sanity strip reflects
    // the directional trade set rather than baseline.
    const resolvedScenarioForSelector = useMemo(() => {
        if (!isDirectionalMode) return resolvedScenario;
        return { ...resolvedScenario, trades: directionalTrades };
    }, [isDirectionalMode, resolvedScenario, directionalTrades]);

    // Resolver aliases — these replace the equivalent useMemo chains below.
    // CandleChart props and all render code remain unchanged.
    // Directional mode overrides trades, markers, overlays, and stats.
    const activeTrades = isDirectionalMode ? directionalTrades : resolvedScenario.trades;
    const chartObBoxes = resolvedScenario.orderBlocks;
    const chartTradeMarkers = isDirectionalMode ? directionalTrades : resolvedScenario.tradeMarkers;
    const rrTools = isDirectionalMode ? [] : resolvedScenario.rrTools;
    const triggeredEdgeOverlays = isDirectionalMode ? [] : resolvedScenario.triggeredEdgeOverlays;
    const runStats = isDirectionalMode
        ? buildRunStats(
            directionalTrades,
            summary,
            bundle,
            bundle?.directionalResults?.scenarioMeta?.[directionalStorageKey]?.executionMode || null,
          )
        : resolvedScenario.stats;

    const filteredTrades = useMemo(() => (
        filterStrategyTrades(activeTrades, {
            query: tradeQuery,
            outcome: tradeOutcomeFilter,
            direction: tradeDirectionFilter,
            structure: tradeStructureFilter,
        })
    ), [activeTrades, tradeQuery, tradeOutcomeFilter, tradeDirectionFilter, tradeStructureFilter]);
    const hasTriggeredEdgeTrades = triggeredEdgeOverlays.length > 0;
    const hasGhostData = triggeredEdgeOverlays.some(ov => ov.ghost_candidate === true);
    const newsEventsAvailable = useMemo(() => buildStrategyMapNewsEvents(bundle, summary, selectedVariant), [bundle, summary, selectedVariant]);
    const newsEvents = showNewsEvents ? newsEventsAvailable : [];
    const sessionRanges = useMemo(() => (
        showSessions ? buildSessionRanges(displayCandles, sessionSettings) : []
    ), [displayCandles, sessionSettings, showSessions]);
    const sessionStats = useMemo(() => buildSessionStats(activeTrades), [activeTrades]);
    const obStats = useMemo(() => buildObStats(chartObBoxes), [chartObBoxes]);
    const runInfoRows = useMemo(() => buildRunInfoRows({
        runId,
        runMeta: activeRunMeta,
        summary,
        bundle,
        trades: activeTrades,
        obs: chartObBoxes,
    }), [runId, activeRunMeta, summary, bundle, activeTrades, chartObBoxes]);

    const patchSession = (key, patch) => {
        setSessionSettings((current) => ({
            ...current,
            [key]: { ...current[key], ...patch },
        }));
    };
    const resetViewSettings = () => {
        const defaults = mergeStrategyMapUi();
        setDisplayTf(defaults.displayTf);
        setZoom(defaults.zoom);
        setChartHeight(defaults.chartHeight);
        setShowTradeList(defaults.showTradeList);
        setShowChartFilters(defaults.showChartFilters);
        setShowSessionEditor(defaults.showSessionEditor);
        setShowOB(defaults.layers.obs);
        setShowLongs(defaults.layers.longs);
        setShowShorts(defaults.layers.shorts);
        setShowWins(defaults.layers.wins);
        setShowLosses(defaults.layers.losses);
        setShowBC(defaults.layers.bosChoch);
        setShowSessions(defaults.layers.sessions);
        setShowMarkers(defaults.layers.markers);
        setShowObOriginMarkers(defaults.layers.obOrigin);
        setShowObDetectionMarkers(defaults.layers.obDetection);
        setShowObLabels(defaults.layers.obLabels);
        setShowRrTools(defaults.layers.rrTools);
        setShowNewsEvents(defaults.layers.news);
        setShowNewsLabels(defaults.layers.newsLabels);
        setShowTriggeredEdgeLevels(defaults.layers.triggeredEdgeLevels);
        setShowTriggeredEdgeLabels(defaults.layers.triggeredEdgeLabels ?? false);
        setShowTriggeredEdgeLifecycle(defaults.layers.triggeredEdgeLifecycle);
        setShowTriggeredEdgeBadges(defaults.layers.triggeredEdgeBadges);
        setShowCancelledSetups(defaults.layers.cancelledSetups);
        setShowObDetails(defaults.layers.obDetails ?? false);
        setShowGhostCandidateMarkers(defaults.layers.ghostCandidateMarkers ?? false);
        setShowGhostFillMarkers(defaults.layers.ghostFillMarkers ?? false);
        setShowGhostWinMarkers(defaults.layers.ghostWinMarkers ?? false);
        setShowGhostLossMarkers(defaults.layers.ghostLossMarkers ?? false);
        setShowFftDebug(defaults.layers.fftDebug ?? false);
        setSelectedEntryModelByRun(defaults.selectedEntryModelByRun || {});
        setSessionSettings(defaults.sessionSettings);
        saveStrategyMapUi(defaults);
    };

    useEffect(() => {
        setChartHeight((current) => clampChartHeight(current));
    }, []);

    useEffect(() => {
        saveStrategyMapUi({
            version: 1,
            displayTf,
            zoom,
            chartHeight,
            selectedEntryModelByRun,
            showTradeList,
            showChartFilters,
            showSessionEditor,
            layers: {
                obs: showOB,
                longs: showLongs,
                shorts: showShorts,
                wins: showWins,
                losses: showLosses,
                bosChoch: showBC,
                sessions: showSessions,
                markers: showMarkers,
                obOrigin: showObOriginMarkers,
                obDetection: showObDetectionMarkers,
                obLabels: showObLabels,
                rrTools: showRrTools,
                news: showNewsEvents,
                newsLabels: showNewsLabels,
                triggeredEdgeLevels: showTriggeredEdgeLevels,
                triggeredEdgeLabels: showTriggeredEdgeLabels,
                triggeredEdgeLifecycle: showTriggeredEdgeLifecycle,
                triggeredEdgeBadges: showTriggeredEdgeBadges,
                cancelledSetups: showCancelledSetups,
                obDetails: showObDetails,
                ghostCandidateMarkers: showGhostCandidateMarkers,
                ghostFillMarkers: showGhostFillMarkers,
                ghostWinMarkers: showGhostWinMarkers,
                ghostLossMarkers: showGhostLossMarkers,
                fftDebug: showFftDebug,
            },
            sessionSettings,
        });
    }, [
        displayTf,
        zoom,
        chartHeight,
        selectedEntryModelByRun,
        showTradeList,
        showChartFilters,
        showSessionEditor,
        showOB,
        showLongs,
        showShorts,
        showWins,
        showLosses,
        showBC,
        showSessions,
        showMarkers,
        showObOriginMarkers,
        showObDetectionMarkers,
        showObLabels,
        showRrTools,
        showNewsEvents,
        showNewsLabels,
        showTriggeredEdgeLevels,
        showTriggeredEdgeLabels,
        showTriggeredEdgeLifecycle,
        showTriggeredEdgeBadges,
        showCancelledSetups,
        showObDetails,
        showGhostCandidateMarkers,
        showGhostFillMarkers,
        showGhostWinMarkers,
        showGhostLossMarkers,
        showFftDebug,
        sessionSettings,
    ]);

    useEffect(() => {
        let cancelled = false;
        if (!runId || !candlesInIndexedDb) return undefined;
        rehydrateRunCandles(runId).then((rehydrated) => {
            if (cancelled) return;
            const hasFallbackData = !!(bundle?.trades?.length || bundle?.orderBlocks?.length);
            if (!rehydrated && !hasFallbackData && alternateRunId) setActiveRunId(alternateRunId);
        }).catch(() => {
            if (cancelled) return;
            const hasFallbackData = !!(bundle?.trades?.length || bundle?.orderBlocks?.length);
            if (!hasFallbackData && alternateRunId) setActiveRunId(alternateRunId);
        });
        return () => { cancelled = true; };
    }, [runId, candlesInIndexedDb, alternateRunId, bundle]);

    useEffect(() => {
        if (!canReloadFullRunFromSidecar || fullRunLoadAttemptedRef.current.has(runId)) return;
        fullRunLoadAttemptedRef.current.add(runId);
        setFullRunLoading(true);
        setFullRunError("");
        reloadFullRunFromSidecar(runId).catch((error) => {
            setFullRunError(error?.message || "Could not reload full run data from sidecar.");
        }).finally(() => {
            setFullRunLoading(false);
        });
    }, [canReloadFullRunFromSidecar, runId]);

    useEffect(() => {
        if (!canLoadCandlesFromSidecar || candleLoadAttemptedRef.current.has(runId)) return;
        candleLoadAttemptedRef.current.add(runId);
        loadCandlesForRun(runId).catch(() => {
            // Store state carries the user-facing error; keep this effect one-shot.
        });
    }, [canLoadCandlesFromSidecar, runId]);

    useEffect(() => {
        const onMove = (event) => {
            if (!resizeRef.current) return;
            const delta = event.clientY - resizeRef.current.startY;
            setChartHeight(clampChartHeight(resizeRef.current.startHeight + delta));
        };
        const onUp = () => {
            resizeRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    const startChartResize = (event) => {
        event.preventDefault();
        resizeRef.current = { startY: event.clientY, startHeight: clampChartHeight(chartHeight) };
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
    };

    useEffect(() => {
        if (!sourceCandles.length) return;
        if (!displayTfOptions.includes(displayTf)) setDisplayTf(displayTfOptions[0] || "15m");
    }, [runId, sourceCandles.length, candlesAreCoarse, displayTf, displayTfOptions]);

    useEffect(() => {
        if (!activeTrades.length) {
            if (selectedTradeId) setSelectedTradeId(null);
            return;
        }
        // Use same fuzzy key as selectedTrade lookup so IDs like "T-007" match "7"
        const key = rrLookupKey(selectedTradeId);
        const stillPresent = activeTrades.some((trade) => (
            trade.id === selectedTradeId
            || rrLookupKey(trade.id) === key
            || rrLookupKey(trade.displayTradeId) === key
        ));
        if (!stillPresent) setSelectedTradeId(null);
    }, [activeTrades, selectedTradeId]);

    // ── Intrabar inspector (Phase 1) — resolve the currently-selected trade
    // and its matching triggered-edge overlay (if any). Both are passed to
    // IntrabarInspector so it can render the M1 magnifier for the selection.
    const selectedTrade = useMemo(() => {
        if (!selectedTradeId) return null;
        const key = rrLookupKey(selectedTradeId);
        return activeTrades.find((t) => (
            t.id === selectedTradeId
            || rrLookupKey(t.id) === key
            || rrLookupKey(t.displayTradeId) === key
        )) || null;
    }, [selectedTradeId, activeTrades]);
    const selectedTriggeredEdge = useMemo(() => {
        if (!selectedTradeId) return null;
        const key = rrLookupKey(selectedTradeId);
        return triggeredEdgeOverlays.find((o) => (
            o.tradeId === selectedTradeId
            || rrLookupKey(o.tradeId) === key
        )) || null;
    }, [selectedTradeId, triggeredEdgeOverlays]);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Strategy Map"
                title={heroTitle}
                runLine={`Run: ${getRunDisplayName(bundle || activeRunMeta || { id: runId })} · ${heroTrades ?? "—"} trades`}
                dateRangeLine={heroDateRange || "—"}
                actions={
                    (runId || projectId) ? (
                        <div className="flex gap-2">
                            {runId && (
                                <Link to={`/runs/${encodeURIComponent(runId)}`}>
                                    <NeonButton tone="ghost">Run Detail</NeonButton>
                                </Link>
                            )}
                            {projectId && (
                                <Link to={`/projects/${encodeURIComponent(projectId)}`}>
                                    <NeonButton icon={FolderKanban} tone="ghost">Open Project</NeonButton>
                                </Link>
                            )}
                        </div>
                    ) : null
                }
            />

            <div className={`px-6 grid grid-cols-1 gap-3 min-w-0 ${showTradeList ? "xl:grid-cols-[240px_minmax(0,1fr)]" : ""}`}>
                {showTradeList && (
                    <div className="min-w-0 overflow-hidden">
                        <StrategyTradeListPanel
                            trades={activeTrades}
                            filteredTrades={filteredTrades}
                            selectedTradeId={selectedTradeId}
                            onSelect={(id) => setSelectedTradeId((current) => (current === id ? null : id))}
                            onHide={() => setShowTradeList(false)}
                            panelHeight={chartHeight + 200}
                            query={tradeQuery}
                            onQueryChange={setTradeQuery}
                            outcomeFilter={tradeOutcomeFilter}
                            onOutcomeFilterChange={setTradeOutcomeFilter}
                            directionFilter={tradeDirectionFilter}
                            onDirectionFilterChange={setTradeDirectionFilter}
                            structureFilter={tradeStructureFilter}
                            onStructureFilterChange={setTradeStructureFilter}
                        />
                    </div>
                )}
                <div className="min-w-0 overflow-hidden">
                <NeonPanel
                    title="Full Chart View"
                    action={
                        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
                            <NeonSelect value={displayTf} onChange={setDisplayTf} options={displayTfOptions} />
                            <NeonSelect value={runId || ""} onChange={(v) => setActiveRunId(v)} options={importedRuns.slice(0, 20).map((r) => ({ value: r.id, label: getRunDisplayName(r) }))} />
                            {!showTradeList && (
                                <NeonButton tone="ghost" onClick={() => setShowTradeList(true)}>
                                    Show Trades
                                </NeonButton>
                            )}
                            <NeonButton tone="ghost" onClick={() => setShowChartFilters((value) => !value)}>
                                {showChartFilters ? "Hide Filters" : "Show Filters"}
                            </NeonButton>
                            <RunInfoDropdown
                                open={showRunInfo}
                                onToggle={() => setShowRunInfo((value) => !value)}
                                rows={runInfoRows}
                            />
                        </div>
                    }
                >
                    {(fullRunLoading || fullRunError) && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm">
                            <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                            <span className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">
                                {fullRunLoading
                                    ? "Loading overlay data from sidecar..."
                                    : "Could not load overlay data from sidecar. OBs, trades, RR tools, and news may be unavailable."}
                            </span>
                        </div>
                    )}
                    {!hasCandles && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="map-no-candles-banner">
                            <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                            <span className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">
                                {candlesLoading
                                    ? "Loading candles from sidecar..."
                                    : candlesError
                                        ? "Could not load candle data from sidecar. Make sure sidecar is running and candles.csv exists."
                                        : "Trade sequence view · no candle data loaded"}
                            </span>
                        </div>
                    )}
                    <div className="mb-3">
                        <ScenarioSelector
                            resolvedScenario={resolvedScenarioForSelector}
                            directionalScenarios={directionalAvailableScenarios}
                            onScenarioChange={(patch) => {
                                setScenario(patch);
                                setSelectedTradeId(null);
                            }}
                            onVariantChange={(variant) => {
                                setScenario({ positionVariant: variant });
                                setSelectedTradeVariant(variant);
                                setSelectedTradeId(null);
                            }}
                        />
                    </div>
                    {showChartFilters ? (
                        <>
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                                <Toggle label={`Order Blocks (${chartObBoxes.length})`} checked={showOB} onChange={setShowOB} dot="primary" />
                                <Toggle label="BOS / CHoCH" checked={showBC} onChange={setShowBC} dot="secondary" />
                                <Toggle label="Sessions" checked={showSessions} onChange={setShowSessions} dot="primary" />
                                <Toggle label="OB Origin" checked={showObOriginMarkers} onChange={setShowObOriginMarkers} dot="primary" />
                                <Toggle label="OB Detection" checked={showObDetectionMarkers} onChange={setShowObDetectionMarkers} dot="warning" />
                                <Toggle label="OB IDs" checked={showObLabels} onChange={setShowObLabels} dot="secondary" />
                                <Toggle label="OB Details" checked={showObDetails} onChange={setShowObDetails} dot="secondary" />
                                <Toggle label={`RR Tools${showRrTools ? ` (${rrTools.length})` : ""}`} checked={showRrTools} onChange={setShowRrTools} dot="success" />
                                <Toggle label={`News (${newsEventsAvailable.length})`} checked={showNewsEvents} onChange={setShowNewsEvents} dot="warning" />
                                <Toggle label="News Labels" checked={showNewsLabels} onChange={setShowNewsLabels} dot="warning" />
                                {resolvedScenario.resolvedFamily === "triggered_edge" && hasTriggeredEdgeTrades && (
                                    <>
                                        <Toggle label="Trigger Levels" checked={showTriggeredEdgeLevels} onChange={setShowTriggeredEdgeLevels} dot="warning" />
                                        {showTriggeredEdgeLevels && (
                                            <Toggle label="Trig Labels" checked={showTriggeredEdgeLabels} onChange={setShowTriggeredEdgeLabels} dot="muted" />
                                        )}
                                        <Toggle label="Lifecycle" checked={showTriggeredEdgeLifecycle} onChange={setShowTriggeredEdgeLifecycle} dot="primary" />
                                        <Toggle label="OB Badges" checked={showTriggeredEdgeBadges} onChange={setShowTriggeredEdgeBadges} dot="success" />
                                        <Toggle label="Cancelled Setups" checked={showCancelledSetups} onChange={setShowCancelledSetups} dot="secondary" />
                                        <Toggle label="🔍 FFT Debug" checked={showFftDebug} onChange={setShowFftDebug} dot="danger" />
                                    </>
                                )}
                                {hasGhostData && (
                                    <>
                                        <Toggle label="👁 Candidates" checked={showGhostCandidateMarkers} onChange={setShowGhostCandidateMarkers} dot="muted" />
                                        <Toggle label="👁 Ghost Fill" checked={showGhostFillMarkers} onChange={setShowGhostFillMarkers} dot="muted" />
                                        <Toggle label="👁 Ghost Win" checked={showGhostWinMarkers} onChange={setShowGhostWinMarkers} dot="success" />
                                        <Toggle label="👁 Ghost Loss" checked={showGhostLossMarkers} onChange={setShowGhostLossMarkers} dot="danger" />
                                    </>
                                )}
                                <Pill tone="muted">Chart time: UTC</Pill>
                                <Pill tone="muted">{displayCandles.length} candles</Pill>
                                <Pill tone="muted">{chartTradeMarkers.length} markers</Pill>
                                {showOB && !chartObBoxes.length && <Pill tone="warning">No OB data</Pill>}
                                {showMarkers && !chartTradeMarkers.length && <Pill tone="warning">No trade markers</Pill>}
                                {candlesAreCoarse && (
                                    <Pill tone="warning">Imported candles are 15m/coarser. 1m/5m views unavailable for this run.</Pill>
                                )}
                            </div>
                            <SessionSummary
                                sessionSettings={sessionSettings}
                                sessionsEnabled={showSessions}
                                editorOpen={showSessionEditor}
                                onToggleEditor={() => setShowSessionEditor((value) => !value)}
                                onPatch={patchSession}
                            />
                        </>
                    ) : (
                        <div className="mb-3 flex items-center gap-2 flex-wrap">
                            <Pill tone="muted">Chart time: UTC</Pill>
                            {candlesAreCoarse && (
                                <Pill tone="warning">Imported candles are 15m/coarser. 1m/5m views unavailable for this run.</Pill>
                            )}
                        </div>
                    )}
                    <div className="relative">
                        <CandleChart
                            key={`${showTradeList ? "with-trades" : "full-width"}-${displayTf}`}
                            candles={displayCandles}
                            obBoxes={chartObBoxes}
                            trades={chartTradeMarkers}
                            showOB={showOB}
                            showLongs={showLongs}
                            showShorts={showShorts}
                            showWins={showWins}
                            showLosses={showLosses}
                            showBOSCHoCH={showBC}
                            showObOriginMarkers={showMarkers && showObOriginMarkers}
                            showObDetectionMarkers={showMarkers && showObDetectionMarkers}
                            showObLabels={showObLabels}
                            rrTools={rrTools}
                            newsEvents={newsEvents}
                            showNewsLabels={showNewsLabels}
                            sessionRanges={sessionRanges}
                            showSessionHighlights={showSessions}
                            selectedTradeId={selectedTradeId}
                            height={chartHeight}
                            triggeredEdgeOverlays={triggeredEdgeOverlays}
                            showTriggeredEdgeLevels={showTriggeredEdgeLevels}
                            showTriggeredEdgeLabels={showTriggeredEdgeLabels}
                            showTriggeredEdgeLifecycle={showTriggeredEdgeLifecycle}
                            showTriggeredEdgeBadges={showTriggeredEdgeBadges}
                            showCancelledSetups={showCancelledSetups}
                            onSelectOverlay={(ov) => setSelectedOverlay((cur) => (cur === ov ? null : ov))}
                            showObDetails={showObDetails}
                            showGhostCandidateMarkers={showGhostCandidateMarkers}
                            showGhostFillMarkers={showGhostFillMarkers}
                            showGhostWinMarkers={showGhostWinMarkers}
                            showGhostLossMarkers={showGhostLossMarkers}
                            showFftDebug={showFftDebug}
                            onSelectTrade={(id) => {
                                if (id == null) { setSelectedTradeId(null); return; }
                                const incomingKey = rrLookupKey(id);
                                setSelectedTradeId((current) => {
                                    if (current === id) return null;
                                    if (current && rrLookupKey(current) === incomingKey) return null;
                                    return id;
                                });
                            }}
                        />
                        {selectedTrade && (
                            <IntrabarInspector
                                selectedTrade={selectedTrade}
                                triggeredEdgeOverlay={selectedTriggeredEdge}
                                sourceCandles={sourceCandles}
                                sourceIsFine={!candlesAreCoarse}
                                medianCandleGapSec={medianCandleGapSec}
                                onClose={() => setSelectedTradeId(null)}
                            />
                        )}
                        {selectedOverlay && (
                            <LifecycleDetailPanel
                                overlay={selectedOverlay}
                                trades={activeTrades}
                                onClose={() => setSelectedOverlay(null)}
                                showFftDebug={showFftDebug}
                                runConfig={summary?.config || bundle?.config || null}
                            />
                        )}
                    </div>
                    <button
                        type="button"
                        onMouseDown={startChartResize}
                        className="mt-1 mb-3 w-full h-4 cursor-ns-resize group flex items-center justify-center"
                        aria-label="Resize Strategy Map chart height"
                        title="Drag to resize chart"
                    >
                        <span className="h-[3px] w-16 rounded-full bg-[hsl(var(--border-soft))] group-hover:bg-[hsl(var(--accent-primary)/0.55)] transition-colors" />
                    </button>
                </NeonPanel>
                </div>
            </div>
            <div className="px-6">
                <StrategyMapIntelligencePanel runStats={runStats} sessionStats={sessionStats} obStats={obStats} />
            </div>
        </div>
    );
}

function normalizeTimestampSeconds(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function numericOrNull(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

function truthyFlag(value) {
    if (value === true) return true;
    if (value === false || value == null || value === "") return false;
    return ["true", "1", "yes", "y"].includes(String(value).trim().toLowerCase());
}

function rrLookupKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    const numeric = text.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : text.toLowerCase();
}

function enrichObsWithTradeLabels(obs = [], trades = []) {
    const tradesByOb = new Map();
    const tradesById = new Map();
    (trades || []).forEach((trade) => {
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const tradeKey = rrLookupKey(trade.id ?? trade.tradeId ?? trade.trade_id ?? trade.rawTradeId ?? trade.displayTradeId);
        if (obKey) tradesByOb.set(obKey, trade);
        if (tradeKey) tradesById.set(tradeKey, trade);
    });
    return (obs || []).map((ob) => {
        const trade = tradesById.get(rrLookupKey(ob.linkedTradeId || ob.tradeId || ob.trade_id))
            || tradesByOb.get(rrLookupKey(ob.obId || ob.ob_id || ob.id));
        if (!trade) return ob;
        const outcome = trade.outcome || ob.outcome;
        const flattenKey = normalizeOutcome(outcome || trade.news_action || ob.status || ob.obFinalStatus);
        const isNewsFlatten = flattenKey.includes("news_flatten") || flattenKey.includes("flattened_active_trade");
        const resultR = isNewsFlatten
            ? numericOrNull(trade.news_flatten_r ?? trade.newsFlattenR ?? trade.r ?? ob.newsFlattenR ?? ob.news_flatten_r ?? ob.r)
            : null;
        return {
            ...ob,
            tradeId: trade.displayTradeId || trade.id || ob.linkedTradeId || ob.tradeId,
            displayTradeId: trade.displayTradeId || trade.id || ob.displayTradeId,
            rawTradeId: trade.rawTradeId || trade.id,
            obId: trade.obId || ob.obId || ob.ob_id || ob.id,
            resultR,
            outcome,
            isNewsFlatten,
            statusLabel: isNewsFlatten ? "NEWS FLATTEN" : (ob.statusLabel || ob.obFinalStatusLabel),
        };
    });
}

function buildRrToolsFromObs(obs = [], trades = []) {
    const tradesByOb = new Map();
    const tradesById = new Map();
    (trades || []).forEach((trade) => {
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const tradeKey = rrLookupKey(trade.id ?? trade.tradeId ?? trade.trade_id ?? trade.rawTradeId ?? trade.displayTradeId);
        if (obKey) tradesByOb.set(obKey, trade);
        if (tradeKey) tradesById.set(tradeKey, trade);
    });
    return (obs || []).map((ob, index) => {
        const trade = tradesById.get(rrLookupKey(ob.linkedTradeId || ob.tradeId || ob.trade_id))
            || tradesByOb.get(rrLookupKey(ob.obId || ob.ob_id || ob.id))
            || {};
        const fillTime = trade.entry ?? trade.fillTime ?? ob.fillTime ?? ob.fill_time ?? ob.entryTime ?? ob.entry_time ?? ob.entry_time_utc ?? ob.entry;
        const outcome = trade.outcome ?? ob.outcome ?? ob.result ?? ob.status ?? ob.obFinalStatus ?? ob.statusLabel ?? ob.obFinalStatusLabel;
        const normalizedOutcome = normalizeOutcome(outcome);
        const newsAction = normalizeOutcome(trade.news_action ?? trade.newsAction ?? ob.news_action ?? ob.newsAction);
        const isNewsFlatten = normalizedOutcome.includes("news_flatten") || newsAction.includes("flattened_active_trade");
        const entryResolved = resolveTradeEntryPrice(trade, ob);
        const entry = entryResolved.value;
        const stop = numericOrNull(trade.stop ?? ob.stop ?? ob.sl ?? ob.stopLoss ?? ob.stop_loss);
        const tp = numericOrNull(trade.tp ?? ob.tp ?? ob.takeProfit ?? ob.take_profit);
        const exitTime = isNewsFlatten
            ? (trade.news_flatten_time ?? trade.newsFlattenTime ?? trade.exit ?? ob.newsFlattenTime ?? ob.news_flatten_time ?? ob.exitTime ?? ob.exit_time)
            : (trade.exit ?? ob.exitTime ?? ob.exit_time);
        const exitPrice = isNewsFlatten
            ? numericOrNull(trade.news_flatten_price ?? trade.newsFlattenPrice ?? trade.protection_exit_price ?? ob.newsFlattenPrice ?? ob.news_flatten_price ?? ob.protectionExitPrice ?? ob.protection_exit_price)
            : numericOrNull(trade.exitPrice ?? ob.exitPrice ?? ob.exit_price ?? ob.protectionExitPrice ?? ob.protection_exit_price);
        const resultR = numericOrNull(trade.news_flatten_r ?? trade.newsFlattenR ?? trade.r ?? ob.newsFlattenR ?? ob.news_flatten_r ?? ob.pnlR ?? ob.pnl_r ?? ob.r ?? ob.rResult);
        const displayTradeId = trade.displayTradeId || ob.displayTradeId || trade.id || ob.linkedTradeId || ob.tradeId || ob.trade_id;
        const rawTradeId = trade.rawTradeId || trade.id || ob.rawTradeId || "";
        const tradeId = displayTradeId;
        const obId = ob.obId || ob.ob_id || ob.id;
        if (!fillTime || entry == null || stop == null || tp == null) return null;
        return {
            id: tradeId || obId || `rr-${index}`,
            tradeId,
            displayTradeId,
            rawTradeId,
            obId,
            fillTime,
            exitTime,
            exitPrice,
            resultR,
            outcome,
            status: ob.status || ob.obFinalStatus,
            statusLabel: ob.statusLabel || ob.obFinalStatusLabel,
            isNewsFlatten,
            entry,
            entrySource: entryResolved.source,
            stop,
            tp,
            direction: ob.direction || ob.side,
        };
    }).filter(Boolean);
}

function resolveTradeEntryPrice(trade = {}, ob = {}) {
    const candidates = [
        ["actual_entry_price", trade.actual_entry_price ?? trade.actualEntryPrice],
        ["planned_entry_price", trade.planned_entry_price ?? trade.plannedEntryPrice],
        ["entry", trade.entryPrice ?? trade.entry_price ?? trade.entry],
        ["ob_actual_entry_price", ob.actual_entry_price ?? ob.actualEntryPrice],
        ["ob_planned_entry_price", ob.planned_entry_price ?? ob.plannedEntryPrice],
        ["ob_entry", ob.entryPrice ?? ob.entry_price ?? ob.entry],
    ];
    for (const [source, value] of candidates) {
        const n = numericOrNull(value);
        if (n != null) return { value: n, source };
    }
    return { value: null, source: "" };
}

function resolveEntryResults(bundle = {}) {
    return bundle?.entryResults
        || bundle?.entry_results
        || bundle?.summary?.entryResults
        || bundle?.summary?.entry_results
        || {};
}

function entryTradesByMode(bundle = {}) {
    const results = resolveEntryResults(bundle);
    const raw = results?.tradesByMode || results?.trades_by_mode || {};
    const out = {};
    Object.entries(raw || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            out[normalizeEntryModelKey(key)] = value;
            return;
        }
        if (value && typeof value === "object") {
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
                if (Array.isArray(nestedValue)) out[normalizeEntryModelKey(nestedKey)] = nestedValue;
            });
        }
    });
    return out;
}

function entrySummaryKeys(bundle = {}) {
    const results = resolveEntryResults(bundle);
    const summary = results?.summary || results?.results || results?.rows || [];
    if (Array.isArray(summary)) {
        return summary.map((row) => normalizeEntryModelKey(
            row.entry_model_key || row.entryModelKey || row.model_key || row.modelKey || row.mode || row.key || row.label,
        )).filter(Boolean);
    }
    if (summary && typeof summary === "object") {
        const keys = [];
        Object.entries(summary).forEach(([key, value]) => {
            const normalizedKey = normalizeEntryModelKey(key);
            if (normalizedKey === "baseline" || normalizedKey.startsWith("entry_")) keys.push(normalizedKey);
            if (value && typeof value === "object") {
                const rowKey = normalizeEntryModelKey(value.entry_model_key || value.entryModelKey || value.model_key || value.modelKey || value.mode || value.key);
                if (rowKey) keys.push(rowKey);
                Object.keys(value).forEach((nestedKey) => {
                    const normalizedNested = normalizeEntryModelKey(nestedKey);
                    if (normalizedNested === "baseline" || normalizedNested.startsWith("entry_")) keys.push(normalizedNested);
                });
            }
        });
        return [...new Set(keys)].filter(Boolean);
    }
    return [];
}

function buildEntryModelOptions(bundle = {}, baseTrades = []) {
    const keys = new Set(["baseline"]);
    Object.keys(entryTradesByMode(bundle)).forEach((key) => keys.add(normalizeEntryModelKey(key)));
    entrySummaryKeys(bundle).forEach((key) => keys.add(key));
    for (const trade of baseTrades || []) {
        const key = normalizeEntryModelKey(trade.entry_model_key || trade.entryModelKey || trade.entry_model || trade.entryModel);
        if (key) keys.add(key);
    }
    const specificKeys = [...keys].filter((key) => key && key !== "baseline");
    specificKeys.sort((a, b) => entryModelSortRank(a) - entryModelSortRank(b) || formatEntryModelKey(a).localeCompare(formatEntryModelKey(b)));
    return [
        { value: "baseline", label: "Baseline" },
        ...specificKeys.map((key) => ({ value: key, label: formatEntryModelKey(key) })),
        { value: "__all__", label: "All / Mixed" },
    ];
}

function defaultEntryModelSelection(options = []) {
    const values = options.map((option) => option.value);
    return values.find((value) => String(value).startsWith("entry_triggered_edge"))
        || values.find((value) => value !== "baseline" && value !== "__all__")
        || "baseline";
}

function uniqueTrades(trades = []) {
    const seen = new Set();
    const out = [];
    for (const trade of trades || []) {
        const key = [
            trade.entry_model_key || trade.entryModelKey || "baseline",
            trade.id || trade.trade_id || trade.tradeId || trade.base_trade_id || trade.baseTradeId || trade.ob_id || trade.obId || out.length,
        ].join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trade);
    }
    return out;
}

function normalizeEntryModelKey(value) {
    const key = String(value || "").trim();
    if (!key) return "";
    if (key === "entry_baseline") return "baseline";
    return key;
}

function entryModelSortRank(key) {
    if (String(key).startsWith("entry_triggered_edge")) return 1;
    if (String(key).startsWith("entry_penetration")) return 2;
    return 3;
}

function formatEntryModelKey(value) {
    const key = String(value || "").trim();
    // Directional scenario IDs: dir_long_X__short_Y
    if (key.startsWith("dir_long_")) return formatDirectionalScenarioLabel(key);
    const penetration = key.match(/^entry_penetration_([0-9]+(?:p[0-9]+)?)/i);
    if (penetration) return `Penetration ${formatModelPct(penetration[1])}`;
    const triggered = key.match(/^entry_triggered_edge_([0-9]+(?:p[0-9]+)?)(?:_(same|next|d\d+))?/i);
    if (triggered) {
        const rawMode = triggered[2] || "";
        const mode = rawMode === "same" ? "Same"
                   : rawMode === "next" ? "Next"
                   : /^d(\d+)$/i.test(rawMode) ? `Delay +${rawMode.slice(1)}`
                   : "";
        return ["Triggered Edge", formatModelPct(triggered[1]), mode].filter(Boolean).join(" · ");
    }
    if (key === "entry_baseline" || key === "baseline") return "Baseline";
    return key.replace(/^entry_/, "").replace(/_/g, " ");
}

function formatModelPct(value) {
    const text = String(value || "").replace("p", ".");
    const n = Number(text);
    return Number.isFinite(n) ? `${Number.isInteger(n) ? n.toFixed(0) : n}%` : String(value);
}


function buildTriggeredEdgeOverlays(trades = [], obs = []) {
    if (!trades.length) return [];
    // Index OBs by normalized numeric key (same as rrLookupKey)
    const obMap = new Map();
    (obs || []).forEach((ob) => {
        const key = rrLookupKey(ob.obId || ob.ob_id || ob.id);
        if (key) obMap.set(key, ob);
    });
    const out = [];
    for (const trade of trades) {
        const entryModelKey = String(trade.entry_model_key || trade.entryModelKey || "");
        if (!entryModelKey.startsWith("entry_triggered_edge")) continue;
        const obKey = rrLookupKey(trade.obId ?? trade.ob_id);
        const ob = obKey ? obMap.get(obKey) : null;
        const top = ob ? numericOrNull(ob.top) : null;
        const bot = ob ? numericOrNull(ob.bot ?? ob.bottom) : null;
        const obStartTime = ob ? (ob.time0 ?? ob.startTime ?? ob.start_time ?? null) : null;
        const obEndTime = ob ? (ob.time1 ?? ob.endTime ?? ob.end_time ?? null) : null;
        const detectionTime = firstAvailable(
            trade.detection_time,
            trade.detectionTime,
            trade.ob_detection_time,
            trade.obDetectionTime,
            ob?.detection_time,
            ob?.detectionTime,
            ob?.ob_detection_time,
            ob?.obDetectionTime,
            obStartTime,
        );
        const rawSide = normalizeOutcome(ob?.direction || ob?.side || ob?.obDirection || trade.direction || trade.side || "");
        const isBull = rawSide.includes("bull") || rawSide.includes("long");
        const depth = (top != null && bot != null) ? Math.abs(top - bot) : null;
        const trigPct = numericOrNull(trade.trigger_penetration_pct ?? trade.triggerPenetrationPct);
        const entryPct = numericOrNull(trade.entry_level_pct ?? trade.entryLevelPct) ?? 0;
        let triggerPrice = null;
        let entryPrice = null;
        if (depth != null && top != null && bot != null) {
            triggerPrice = trigPct != null
                ? (isBull ? top - depth * trigPct / 100 : bot + depth * trigPct / 100)
                : null;
            entryPrice = isBull ? top - depth * entryPct / 100 : bot + depth * entryPct / 100;
        }
        const triggerTime = trade.trigger_time || trade.triggerTime || null;
        const tappedTime = trade.tapped_time || trade.tappedTime || null;
        const armedAt = trade.armed_at || trade.armedAt || null;
        const edgeRevisitTime = trade.edge_revisit_time || trade.edgeRevisitTime || null;
        const retraceCancelTime = trade.retrace_cancel_time || trade.retraceCancelTime || null;
        const exitTime = firstAvailable(trade.exit, trade.exit_time, trade.exitTime, ob?.exitTime, ob?.exit_time);
        const lineStartTime = firstAvailable(detectionTime, obStartTime);
        const lineEndTime = firstAvailable(
            ob?.chartRightTime,
            ob?.chart_right_time,
            ob?.time1,
            ob?.endTime,
            ob?.end_time,
            edgeRevisitTime,
            exitTime,
            retraceCancelTime,
            triggerTime,
            obEndTime,
        );
        const cancelReason = trade.cancel_reason || trade.cancelReason || "";
        const cancelledBeforeEntry = truthyFlag(trade.cancelled_before_entry) || truthyFlag(trade.cancelledBeforeEntry);
        const isFftCancel = normalizeOutcome(cancelReason).includes("first_failed");
        // For FFT cancels, exit_time (the candle at which FFT fired) is the cancel timestamp
        const fftCancelTime = isFftCancel
            ? firstAvailable(trade.exit_time, trade.exitTime, trade.exit)
            : null;
        const filledOnTriggerCandle = truthyFlag(trade.filled_on_trigger_candle) || truthyFlag(trade.filledOnTriggerCandle);
        const filledOnNextCandle = trade.filled_on_trigger_candle === false || trade.filledOnTriggerCandle === false || String(trade.filled_on_trigger_candle).toLowerCase() === "false" || String(trade.filledOnTriggerCandle).toLowerCase() === "false";
        const hasTrigger = !!(triggerTime && String(triggerTime).trim());
        const cancelNorm = normalizeOutcome(cancelReason);
        const wasCancelled = Boolean(
            cancelledBeforeEntry
            || (retraceCancelTime && String(retraceCancelTime).trim())
            || cancelNorm.includes("cancel")
            || cancelNorm.includes("inval")
            || cancelNorm.includes("breach")
            || cancelNorm.includes("broken")
        );
        const triggerLineState = wasCancelled ? "cancelled" : hasTrigger ? "tagged" : "not_tagged";
        let badgeState = null;
        if (!hasTrigger) {
            badgeState = "never_trig";
        } else if ((retraceCancelTime && String(retraceCancelTime).trim()) || cancelNorm.includes("retrace")) {
            badgeState = "used_ob";
        } else if (cancelledBeforeEntry && cancelNorm.includes("first_failed")) {
            badgeState = "first_failed";
        } else if (cancelledBeforeEntry && (cancelNorm.includes("inval") || cancelNorm.includes("breach") || cancelNorm.includes("broken"))) {
            badgeState = "inval";
        } else if (filledOnTriggerCandle) {
            badgeState = "same";
        } else if (filledOnNextCandle) {
            badgeState = "next";
        }
        out.push({
            tradeId: trade.displayTradeId || trade.id || null,
            obId: trade.obId ?? trade.ob_id ?? null,
            direction: isBull ? "bull" : "bear",
            entryModelKey,
            triggerPenetrationPct: trigPct,
            entryLevelPct: entryPct,
            triggerTime,
            detectionTime,
            lineStartTime,
            lineEndTime,
            wasTriggered: hasTrigger,
            wasCancelled,
            triggerLineState,
            tappedTime,
            armedAt,
            edgeRevisitTime,
            retraceCancelTime,
            triggerToEntryMinutes: numericOrNull(trade.trigger_to_entry_minutes ?? trade.triggerToEntryMinutes),
            cancelReason,
            cancelledBeforeEntry,
            tappedBeforeTrigger: truthyFlag(trade.tapped_before_trigger) || truthyFlag(trade.tappedBeforeTrigger),
            sameCandleEntryAllowed: truthyFlag(trade.same_candle_entry_allowed) || truthyFlag(trade.sameCandleEntryAllowed),
            armedOnTriggerCandle: truthyFlag(trade.armed_on_trigger_candle) || truthyFlag(trade.armedOnTriggerCandle),
            filledOnTriggerCandle,
            obTop: top,
            obBot: bot,
            obStartTime,
            obEndTime,
            triggerPrice,
            entryPrice,
            badgeState,
            // FFT debug fields
            isFftCancel,
            fftCancelTime,
            tappedCandleIndex: numericOrNull(trade.tapped_candle_index ?? trade.tappedCandleIndex),
            triggerCandleIndex: numericOrNull(trade.trigger_candle_index ?? trade.triggerCandleIndex),
            armCandleIndex: numericOrNull(trade.arm_candle_index ?? trade.armCandleIndex),
            exitedObBeforeArm: trade.exited_ob_before_arm ?? trade.exitedObBeforeArm ?? null,
            obOccupiedAtArm: trade.ob_occupied_at_arm ?? trade.obOccupiedAtArm ?? null,
            armedAfterObExit: trade.armed_after_ob_exit ?? trade.armedAfterObExit ?? null,
            obExitTime: firstAvailable(trade.ob_exit_time, trade.obExitTime) || null,
            ghostCandidate: trade.ghost_candidate ?? trade.ghostCandidate ?? null,
        });
    }
    return out;
}

function buildStrategyMapNewsEvents(bundle, summary, activeVariant) {
    const config = bundle?.config || summary?.config || {};
    const beforeMinutes = numericOrNull(firstAvailable(
        config.news_blackout_minutes_before,
        config.newsBlackoutBefore,
        summary?.news_window_minutes_before,
        summary?.newsWindowMinutesBefore,
    ));
    const afterMinutes = numericOrNull(firstAvailable(
        config.news_blackout_minutes_after,
        config.newsBlackoutAfter,
        summary?.news_window_minutes_after,
        summary?.newsWindowMinutesAfter,
    ));
    const withWindow = (event) => {
        const eventTime = normalizeTimestampSeconds(event?.time ?? event?.eventTime ?? event?.event_time ?? event?.news_blackout_event_time);
        const rawStart = event?.blackoutStartTime
            ?? event?.blackoutStart
            ?? event?.blackout_start
            ?? event?.window_start
            ?? event?.news_blackout_window_start
            ?? event?.newsBlackoutWindowStart;
        const rawEnd = event?.blackoutEndTime
            ?? event?.blackoutEnd
            ?? event?.blackout_end
            ?? event?.window_end
            ?? event?.news_blackout_window_end
            ?? event?.newsBlackoutWindowEnd;
        const parsedStart = normalizeTimestampSeconds(rawStart);
        const parsedEnd = normalizeTimestampSeconds(rawEnd);
        const blackoutStartTime = parsedStart ?? (eventTime != null && beforeMinutes != null ? eventTime - beforeMinutes * 60 : null);
        const blackoutEndTime = parsedEnd ?? (eventTime != null && afterMinutes != null ? eventTime + afterMinutes * 60 : null);
        return {
            ...event,
            blackoutStartTime,
            blackoutEndTime,
        };
    };
    const runLevel = [
        bundle?.newsEvents,
        bundle?.news_events,
        bundle?.newsBlackoutEvents,
        summary?.newsEvents,
        summary?.news_events,
    ].find((events) => Array.isArray(events) && events.length);
    if (runLevel) return runLevel.map(withWindow);

    const trades = activeVariant && bundle?.tradesByVariant?.[activeVariant]
        ? bundle.tradesByVariant[activeVariant]
        : (bundle?.trades || []);
    const seen = new Set();
    const events = [];
    (trades || []).forEach((trade) => {
        const time = trade.news_blackout_event_time || trade.newsBlackoutEventTime;
        if (!time) return;
        const currency = trade.news_blackout_currency || trade.newsBlackoutCurrency || "";
        const impact = trade.news_blackout_impact || trade.newsBlackoutImpact || "";
        const event = trade.news_blackout_event || trade.newsBlackoutEvent || "";
        const windowStart = trade.news_blackout_window_start || trade.newsBlackoutWindowStart || "";
        const windowEnd = trade.news_blackout_window_end || trade.newsBlackoutWindowEnd || "";
        const key = [time, currency, impact, event, windowStart, windowEnd].map((value) => String(value || "").trim().toLowerCase()).join("|");
        if (seen.has(key)) return;
        seen.add(key);
        events.push(withWindow({
            time,
            currency,
            impact,
            event,
            news_blackout_window_start: windowStart,
            news_blackout_window_end: windowEnd,
        }));
    });
    return events;
}

function candleTimeSeconds(candle) {
    return normalizeTimestampSeconds(candle?.time ?? candle?.t ?? candle?.timestamp ?? candle?.datetime);
}

function normalizeDisplayCandles(candles = []) {
    return candles.map((c) => {
        const time = candleTimeSeconds(c);
        return {
            ...c,
            time: time ?? c.time,
            t: time ?? c.t,
            o: Number(c.o ?? c.open),
            h: Number(c.h ?? c.high),
            l: Number(c.l ?? c.low),
            c: Number(c.c ?? c.close),
            volume: c.volume == null ? c.v : c.volume,
        };
    }).filter((c) => c.time != null && [c.o, c.h, c.l, c.c].every((v) => isFinite(Number(v))));
}

function getMedianCandleGapSec(candles = []) {
    const times = candles
        .map(candleTimeSeconds)
        .filter((t) => t != null)
        .sort((a, b) => a - b);
    if (times.length < 2) return 60;
    const gaps = [];
    for (let i = 1; i < times.length; i += 1) {
        const gap = times[i] - times[i - 1];
        if (gap > 0) gaps.push(gap);
    }
    if (!gaps.length) return 60;
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
}

function resampleCandlesForDisplay(candles = [], minutes = 5) {
    const source = normalizeDisplayCandles(candles).sort((a, b) => a.time - b.time);
    if (!source.length) return [];
    const bucketSec = minutes * 60;
    const buckets = new Map();
    source.forEach((c) => {
        const bucketTime = Math.floor(Number(c.time) / bucketSec) * bucketSec;
        const existing = buckets.get(bucketTime);
        const volume = Number(c.volume ?? c.v ?? 0);
        if (!existing) {
            buckets.set(bucketTime, {
                time: bucketTime,
                t: bucketTime,
                o: Number(c.o),
                h: Number(c.h),
                l: Number(c.l),
                c: Number(c.c),
                volume: isFinite(volume) ? volume : undefined,
            });
            return;
        }
        existing.h = Math.max(existing.h, Number(c.h));
        existing.l = Math.min(existing.l, Number(c.l));
        existing.c = Number(c.c);
        if (isFinite(volume)) existing.volume = Number(existing.volume ?? 0) + volume;
    });
    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

function parseUtcClock(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!isFinite(hours) || !isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 3600 + minutes * 60;
}

function buildSessionRanges(candles = [], settings = {}) {
    const times = (candles || []).map(candleTimeSeconds).filter((time) => time != null).sort((a, b) => a - b);
    if (!times.length) return [];
    const first = times[0];
    const last = times[times.length - 1];
    const daySec = 86400;
    const firstDay = Math.floor(first / daySec) * daySec;
    const lastDay = Math.floor(last / daySec) * daySec;
    const ranges = [];
    Object.entries(settings).forEach(([key, session]) => {
        if (!session?.enabled) return;
        const startOffset = parseUtcClock(session.start);
        const endOffset = parseUtcClock(session.end);
        if (startOffset == null || endOffset == null) return;
        for (let day = firstDay - daySec; day <= lastDay + daySec; day += daySec) {
            const startTime = day + startOffset;
            const endTime = day + endOffset + (endOffset <= startOffset ? daySec : 0);
            if (endTime < first || startTime > last) continue;
            ranges.push({
                id: `${key}-${day}`,
                label: session.label,
                startTime: Math.max(startTime, first),
                endTime: Math.min(endTime, last),
                colorKey: session.colorKey,
            });
        }
    });
    return ranges;
}

function normalizeOutcome(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function tradeR(trade) {
    return numericOrNull(trade?.r ?? trade?.pnl_r ?? trade?.rResult) ?? 0;
}

// Trade-list pill colors + outcome filter rows delegate to the canonical
// classifier so the Strategy Map agrees with Run Detail / Entries Lab. Prior
// behavior was outcome.includes("win") || r > 0 (and the loss mirror); that
// matched the new canonical wins for the latest run but disagreed on edge
// cases like outcome="WIN" with stale +R rows, INVALID with r != 0, etc.
function isWin(trade) {
    return isWinTrade(trade);
}

function isLoss(trade) {
    return isLossTrade(trade);
}

function buildRunStats(trades = [], summary = {}, bundle = {}, activeVariant = null) {
    // Canonical roll-up over the trades actually being displayed. We
    // intentionally compute from `trades` rather than blindly trusting
    // summary.wins / summary.losses: those come from the BASELINE primary-
    // variant CSV via importer.js, but Strategy Map is usually showing a
    // DIFFERENT scenario (e.g. entry_triggered_edge_25p0_next). Using the
    // baseline summary against scenario trades is exactly how we ended up
    // with "10 wins on KPI vs 8 wins on Strategy Map".
    const rollup = summarizeTradeClassifications(trades);
    const total = trades.length;
    const wins = rollup.wins;
    const losses = rollup.losses;
    const netR = numericOrNull(summary.netR ?? summary.net_r) ?? rollup.netR;
    const winRate = rollup.winRate ?? 0;
    const performanceTrades = rollup.performanceTrades;
    const avgR = performanceTrades ? netR / performanceTrades : 0;
    return {
        symbol: summary.symbol || bundle?.summary?.symbol || bundle?.config?.symbol || "—",
        detectionTf: summary.detectionTf || summary.detection_tf || bundle?.config?.detection_timeframe || "—",
        executionTf: summary.executionTf || summary.execution_tf || bundle?.config?.execution_timeframe || "—",
        variant: activeVariant || summary.selectedTradeVariant || summary.executionMode || "—",
        total,
        wins,
        losses,
        winRate,
        netR,
        avgR,
        expectancy: numericOrNull(summary.expectancyR ?? summary.expectancy_r) ?? avgR,
        maxDd: numericOrNull(summary.maxDrawdownR ?? summary.max_drawdown_r ?? summary.maxDD ?? summary.max_dd),
        // Surface the rest of the canonical roll-up so the Strategy Map header
        // can show invalid / unfilled counts without re-computing.
        flats: rollup.flats,
        performanceTrades,
        invalidCancelled: rollup.invalidCancelled,
        unfilled: rollup.unfilled,
        sessionFiltered: rollup.sessionFiltered,
        newsCancelled: rollup.newsCancelled,
        newsFlattenWins: rollup.newsFlattenWins,
        newsFlattenLosses: rollup.newsFlattenLosses,
        newsFlattenFlats: rollup.newsFlattenFlats,
    };
}

function buildSessionStats(trades = []) {
    const hasSession = (trades || []).some((trade) => {
        const session = String(trade?.session || "").trim();
        return session && session !== "—";
    });
    if (!hasSession) return [];
    const map = new Map();
    (trades || []).forEach((trade) => {
        const rawSession = String(trade?.session || "").trim();
        const session = rawSession && rawSession !== "—" ? rawSession : "Unassigned";
        if (!map.has(session)) map.set(session, { session, trades: 0, wins: 0, losses: 0, netR: 0 });
        const row = map.get(session);
        row.trades += 1;
        row.wins += isWin(trade) ? 1 : 0;
        row.losses += isLoss(trade) ? 1 : 0;
        row.netR += tradeR(trade);
    });
    return Array.from(map.values())
        .map((row) => ({
            ...row,
            winRate: row.trades ? (row.wins / row.trades) * 100 : 0,
            avgR: row.trades ? row.netR / row.trades : 0,
        }))
        .sort((a, b) => b.trades - a.trades);
}

function buildObStats(obs = []) {
    const hasLifecycle = (obs || []).some((ob) => ob?.status || ob?.statusLabel || ob?.obFinalStatus || ob?.obFinalStatusLabel);
    const statusCounts = { wins: 0, losses: 0, invalid: 0, unfilled: 0 };
    let bullish = 0;
    let bearish = 0;
    let linked = 0;
    (obs || []).forEach((ob) => {
        const side = normalizeOutcome(ob?.direction || ob?.side || ob?.obDirection);
        if (side.includes("bear") || side.includes("short")) bearish += 1;
        else if (side.includes("bull") || side.includes("long")) bullish += 1;
        if (ob?.linkedTradeId || ob?.linked_trade_id || ob?.tradeId || ob?.trade_id) linked += 1;
        const status = normalizeOutcome(ob?.status || ob?.obFinalStatus || ob?.statusLabel || ob?.obFinalStatusLabel);
        if (status.includes("win")) statusCounts.wins += 1;
        if (status.includes("loss")) statusCounts.losses += 1;
        if (status.includes("invalid")) statusCounts.invalid += 1;
        if (status.includes("unfilled")) statusCounts.unfilled += 1;
    });
    return {
        total: obs?.length || 0,
        bullish,
        bearish,
        linked,
        hasLifecycle,
        ...statusCounts,
    };
}

function fmt(value, digits = 1) {
    return value == null || !isFinite(Number(value)) ? "—" : Number(value).toFixed(digits);
}

function fmtPct(value) {
    return value == null || !isFinite(Number(value)) ? "—" : `${Number(value).toFixed(1)}%`;
}

function firstAvailable(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
}

function formatInfoValue(value) {
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return value === undefined || value === null || value === "" ? "—" : String(value);
}

function buildRunInfoRows({ runId, runMeta = {}, summary = {}, bundle = {}, trades = [], obs = [] }) {
    const config = bundle?.config || summary?.config || runMeta?.config || {};
    const newsBefore = firstAvailable(config.news_blackout_minutes_before, config.newsBlackoutBefore, summary.news_window_minutes_before);
    const newsAfter = firstAvailable(config.news_blackout_minutes_after, config.newsBlackoutAfter, summary.news_window_minutes_after);
    const infoDateStart = firstAvailable(config.start_date, config.dateFrom, config.date_from, summary.dateFrom, summary.start_date);
    const infoDateEnd = firstAvailable(config.end_date, config.dateTo, config.date_to, summary.dateTo, summary.end_date);
    return [
        ["Run", firstAvailable(getRunDisplayName(runMeta), summary.displayName, summary.name, runId)],
        ["Run ID", runId],
        ["Symbol", firstAvailable(config.symbol, summary.symbol, runMeta.symbol)],
        ["Detection TF", firstAvailable(config.detection_timeframe, config.detectionTf, summary.detectionTf, summary.detection_tf)],
        ["Execution TF", firstAvailable(config.execution_timeframe, config.executionTf, summary.executionTf, summary.execution_tf)],
        ["Execution Mode", firstAvailable(config.execution_mode, config.executionMode, summary.executionMode)],
        ["Date Range", formatRunDateRange(infoDateStart || infoDateEnd ? `${infoDateStart || ""} → ${infoDateEnd || ""}` : "")],
        // "Trades" and "Order Blocks" rows removed in Phase 1 — they used to
        // prefer baseline summary.trades / summary.order_blocks even when the
        // page was showing a scenario, contradicting the TradeSanityStrip
        // (which is the canonical scenario row count) and the on-chart
        // "{chartObBoxes.length} markers" pill (canonical OB count).
        ["RR Multiple", firstAvailable(config.rr_multiple, config.rr, summary.rr_multiple)],
        ["Session Filter", firstAvailable(config.session_filter_enabled, summary.session_filter_enabled)],
        ["Allowed Sessions", firstAvailable(config.allowed_sessions, summary.allowed_sessions)],
        ["News Blackout", firstAvailable(config.news_blackout_enabled, summary.news_blackout_enabled)],
        ["News Impacts", firstAvailable(config.news_blackout_impacts, summary.news_impacts_used)],
        ["News Currencies", firstAvailable(config.news_blackout_currencies, summary.news_currencies_used)],
        ["News Window", newsBefore !== undefined || newsAfter !== undefined ? `${formatInfoValue(newsBefore)} before / ${formatInfoValue(newsAfter)} after` : "—"],
        ["Flatten Active Trades", firstAvailable(config.news_flatten_active_trades, summary.news_flatten_active_trades)],
        ["Flatten Buffer", firstAvailable(config.news_flatten_minutes_before_blackout, summary.news_flatten_minutes_before_blackout)],
    ];
}

function formatPaddedId(prefix, value) {
    if (value == null || value === "") return "";
    const text = String(value).trim();
    const match = text.match(/\d+/);
    if (!match) return text;
    return `${prefix}-${String(Number(match[0])).padStart(3, "0")}`;
}

function getTradeObValue(trade) {
    return trade?.obId ?? trade?.ob_id ?? trade?.orderBlockId ?? trade?.order_block_id;
}

function displayTradeId(trade) {
    return trade?.displayTradeId || formatPaddedId("T", getTradeObValue(trade)) || trade?.id || "—";
}

function displayObId(trade) {
    return trade?.displayObId || formatPaddedId("OB", getTradeObValue(trade)) || "—";
}

function rawTradeId(trade) {
    return trade?.rawTradeId || trade?.trade_id || trade?.tradeId || trade?.id || "—";
}

function displayTradeDirection(trade) {
    const text = String(trade?.direction || trade?.side || "").trim();
    if (!text) return "—";
    if (/^l/i.test(text) || /bull/i.test(text)) return "Long";
    if (/^s/i.test(text) || /bear/i.test(text)) return "Short";
    return text;
}

function displayTradeStructure(trade) {
    return trade?.structure || trade?.structureTag || trade?.structure_tag || trade?.type || "—";
}

function displayTradeSession(trade) {
    return trade?.fillSession || trade?.fill_session || trade?.session || trade?.trade_session || trade?.entry_session || "—";
}

function formatTradeTime(value, withDate = false) {
    const seconds = normalizeTimestampSeconds(value);
    if (seconds == null) return "—";
    const date = new Date(seconds * 1000);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return withDate ? `${day} ${month}, ${hours}:${minutes} UTC` : `${day} ${month} ${hours}:${minutes}`;
}

function formatTradePrice(value) {
    const n = numericOrNull(value);
    if (n == null) return "—";
    return n.toFixed(5).replace(/\.?0+$/, "");
}

function formatTradeR(value) {
    const n = numericOrNull(value);
    if (n == null || Math.abs(n) < 0.000001) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}R`;
}

function tradeOutcomeValue(trade) {
    return trade?.outcome || trade?.result || "—";
}

// Delegates to the canonical UI translator so "INVALID" reads as "PROTECTED
// ENTRY" and "invalidated_before_edge_entry" reads as "Protected before edge
// entry" everywhere this is rendered (ledger row chips, expanded detail).
function formatTradeOutcome(value) {
    return displayOutcomeLabel(value, { length: "medium" });
}

function tradeEntryTime(trade) {
    return trade?.entry ?? trade?.fillTime ?? trade?.fill_time ?? trade?.entryTime ?? trade?.entry_time;
}

function tradeExitTime(trade) {
    return trade?.exit ?? trade?.exitTime ?? trade?.exit_time ?? trade?.newsFlattenTime ?? trade?.news_flatten_time;
}

function tradeEntryPrice(trade) {
    return trade?.entryPrice ?? trade?.entry_price ?? trade?.entry;
}

function tradeStopPrice(trade) {
    return trade?.stop ?? trade?.stopPrice ?? trade?.stop_loss ?? trade?.sl;
}

function tradeTargetPrice(trade) {
    return trade?.tp ?? trade?.target ?? trade?.takeProfit ?? trade?.take_profit;
}

function tradeSearchText(trade) {
    return [
        displayTradeId(trade),
        rawTradeId(trade),
        displayObId(trade),
        getTradeObValue(trade),
        displayTradeDirection(trade),
        displayTradeStructure(trade),
        displayTradeSession(trade),
        formatTradeOutcome(tradeOutcomeValue(trade)),
    ].filter(Boolean).join(" ").toLowerCase();
}

function filterStrategyTrades(trades = [], filters = {}) {
    const query = String(filters.query || "").trim().toLowerCase();
    return (trades || []).filter((trade) => {
        if (query && !tradeSearchText(trade).includes(query)) return false;
        if (filters.outcome === "Win" && !isWin(trade)) return false;
        if (filters.outcome === "Loss" && !isLoss(trade)) return false;
        const direction = displayTradeDirection(trade).toLowerCase();
        if (filters.direction === "Long" && direction !== "long") return false;
        if (filters.direction === "Short" && direction !== "short") return false;
        const structure = String(displayTradeStructure(trade)).toLowerCase();
        if (filters.structure === "BOS" && !structure.includes("bos")) return false;
        if (filters.structure === "CHoCH" && !structure.includes("choch")) return false;
        return true;
    });
}

// Pill tone from canonical category. INVALID_CANCELLED now lands on the
// violet "secondary" tone (PROTECTED) instead of the orange warning tone, so
// protected entries no longer read as "something went wrong".
function outcomeTone(trade) {
    return outcomeToneForTrade(trade);
}

function TradeRValue({ value }) {
    const n = numericOrNull(value);
    if (n == null || Math.abs(n) < 0.000001) {
        return <span className="text-[hsl(var(--text-3))]">—</span>;
    }
    return (
        <span className={n > 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>
            {formatTradeR(n)}
        </span>
    );
}

function RunInfoDropdown({ open, onToggle, rows }) {
    return (
        <div className="relative">
            <NeonButton tone="ghost" onClick={onToggle}>Run Info</NeonButton>
            {open && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[320px] max-w-[80vw] clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] shadow-[0_18px_60px_rgba(0,0,0,0.38)] p-3">
                    <div className="mb-2 font-ui text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">Run Info</div>
                    <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                        {(rows || []).map(([label, value]) => (
                            <React.Fragment key={label}>
                                <div className="font-ui text-[9.5px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
                                <div className="font-ui text-[10.5px] text-[hsl(var(--text-1))] min-w-0 break-words">{formatInfoValue(value)}</div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StrategyTradeListPanel({
    trades,
    filteredTrades,
    selectedTradeId,
    onSelect,
    onHide,
    query,
    onQueryChange,
    outcomeFilter,
    onOutcomeFilterChange,
    directionFilter,
    onDirectionFilterChange,
    structureFilter,
    onStructureFilterChange,
    panelHeight,
}) {
    const visibleTrades = (filteredTrades || []).slice(0, 80);
    const listHeight = panelHeight ? Math.max(180, panelHeight - 220) : undefined;
    return (
        <div className="min-h-0" style={panelHeight ? { height: panelHeight } : undefined}>
            <NeonPanel
                title="Trades"
                action={
                    <div className="flex items-center gap-1.5">
                        <Pill tone="muted">{trades.length} total</Pill>
                        <button
                            type="button"
                            onClick={onHide}
                            className="px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary)/0.45)]"
                        >
                            Hide
                        </button>
                    </div>
                }
            >
                <div className="space-y-2 min-h-0">
                <label className="relative block">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
                    <NeonInput
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Search trade, OB, session..."
                        className="pl-7"
                    />
                </label>
                <div className="space-y-1.5">
                    <Segment options={["All", "Win", "Loss"]} value={outcomeFilter} onChange={onOutcomeFilterChange} />
                    <Segment options={["All", "Long", "Short"]} value={directionFilter} onChange={onDirectionFilterChange} />
                    <Segment options={["All", "BOS", "CHoCH"]} value={structureFilter} onChange={onStructureFilterChange} />
                </div>
                <div className="overflow-y-auto pr-1 space-y-1" style={listHeight ? { maxHeight: listHeight } : undefined}>
                    {!visibleTrades.length && (
                        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3 text-[11px] text-[hsl(var(--text-3))]">
                            No trades match the current filters.
                        </div>
                    )}
                    {visibleTrades.map((trade) => {
                        const selected = trade.id === selectedTradeId;
                        return (
                            <button
                                key={trade.id || rawTradeId(trade)}
                                type="button"
                                onClick={() => onSelect(trade.id)}
                                className={`w-full text-left clip-bevel-sm border px-2 py-2 transition-colors ${
                                    selected
                                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.08)]"
                                        : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] hover:border-[hsl(var(--accent-primary)/0.35)]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-code text-[12px] text-[hsl(var(--text-1))] truncate">
                                            {displayTradeId(trade)}
                                            <span className="ml-1.5 text-[10px] text-[hsl(var(--text-3))]">{displayTradeDirection(trade)}</span>
                                        </div>
                                        <div className="mt-0.5 font-ui text-[10px] text-[hsl(var(--text-3))] truncate">
                                            {formatTradeTime(tradeEntryTime(trade))} · {displayTradeStructure(trade)}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <TradeRValue value={tradeR(trade)} />
                                        <Pill tone={outcomeTone(trade)}>{formatTradeOutcome(tradeOutcomeValue(trade))}</Pill>
                                    </div>
                                </div>
                                {selected && (
                                    <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft))] grid grid-cols-2 gap-x-3 gap-y-1.5">
                                        <TradeDetail label="Raw Trade ID" value={rawTradeId(trade)} />
                                        <TradeDetail label="OB ID" value={displayObId(trade)} />
                                        <TradeDetail label="Session" value={displayTradeSession(trade)} />
                                        <TradeDetail label="Outcome" value={formatTradeOutcome(tradeOutcomeValue(trade))} />
                                        {(trade.cancel_reason || trade.cancelReason) && (
                                            <TradeDetail
                                                label="Protection Reason"
                                                value={displayCancelReason(trade.cancel_reason || trade.cancelReason)}
                                                wide
                                            />
                                        )}
                                        <TradeDetail label="Entry Time" value={formatTradeTime(tradeEntryTime(trade), true)} wide />
                                        <TradeDetail label="Exit Time" value={formatTradeTime(tradeExitTime(trade), true)} wide />
                                        <TradeDetail label="Entry" value={formatTradePrice(tradeEntryPrice(trade))} />
                                        <TradeDetail label="Stop" value={formatTradePrice(tradeStopPrice(trade))} />
                                        <TradeDetail label="TP" value={formatTradePrice(tradeTargetPrice(trade))} />
                                        <TradeDetail label="R" value={formatTradeR(tradeR(trade))} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    {filteredTrades.length > visibleTrades.length && (
                        <div className="pt-1 text-center font-ui text-[10px] uppercase tracking-wider text-[hsl(var(--text-3))]">
                            Showing first {visibleTrades.length} of {filteredTrades.length}
                        </div>
                    )}
                </div>
                </div>
            </NeonPanel>
        </div>
    );
}


function TradeDetail({ label, value, wide = false }) {
    return (
        <div className={wide ? "col-span-2" : ""}>
            <div className="font-ui text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
            <div className="font-ui text-[11px] text-[hsl(var(--text-1))] truncate">{value || "—"}</div>
        </div>
    );
}

// ── Lifecycle Detail Panel ────────────────────────────────────────────────────
// Compact popover shown when a triggered-edge badge or lifecycle marker is
// clicked. Displays cancel reason, OB/trade IDs, timestamps, and ghost fields
// for cancelled/protected setups (no IntrabarInspector needed for these).

function fmtOverlayTime(raw) {
    const ts = normalizeTimestampSeconds(raw);
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    const pad = (v) => String(v).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function LifecycleDetailPanel({ overlay: ov, onClose, trades = [], showFftDebug = false, runConfig = null }) {
    if (!ov) return null;

    // Look up the live trade for outcome/R/fill-time/exit-time (not in overlay)
    const tradeKey = rrLookupKey(ov.tradeId);
    const trade = trades.find((t) => (
        t.id === ov.tradeId
        || rrLookupKey(t.id) === tradeKey
        || rrLookupKey(t.displayTradeId) === tradeKey
    )) || null;

    // IDs and direction
    const rawId = ov.obId || ov.ob_id || "";
    const idNum = String(rawId).match(/\d+/) ? String(Number(String(rawId).match(/\d+/)[0])).padStart(3, "0") : String(rawId);
    const obIdLabel = idNum ? `OB-${idNum}` : "—";
    const tradeIdLabel = ov.tradeId || "—";
    const dir = ov.direction === "bull" ? "bullish" : ov.direction === "bear" ? "bearish" : String(ov.direction || "").toLowerCase();
    const dirLabel = dir === "bullish" ? "BULL" : dir === "bearish" ? "BEAR" : String(ov.direction || "—").toUpperCase();

    // Trade values from live trade lookup
    const outcome = String(trade?.outcome || "").toLowerCase();
    const r = (() => {
        const v = trade?.r ?? trade?.net_r;
        return (v != null && v !== "" && isFinite(Number(v))) ? Number(v) : null;
    })();
    const fillTime = trade?.entry || null;  // 'entry' field in trade = fill timestamp string
    const exitTime = trade?.exit || null;

    // Badge
    const BADGE_STATUS = {
        same:         { label: "Same-Candle Fill",      tone: "rgba(22,163,74,0.88)" },
        next:         { label: "Next-Candle Fill",       tone: "rgba(6,182,212,0.85)" },
        used_ob:      { label: "Retrace Cancel",         tone: "rgba(219,39,119,0.88)" },
        first_failed: { label: "First Failed Visit",     tone: "rgba(219,39,119,0.88)" },
        never_trig:   { label: "Never Triggered",        tone: "rgba(107,114,128,0.82)" },
        inval:        { label: "Invalidated Pre-Entry",  tone: "rgba(139,92,246,0.82)" },
    };
    const badgeInfo = BADGE_STATUS[ov.badgeState] || null;

    // Time helpers
    const fmtShort = (raw) => {
        const ts = normalizeTimestampSeconds(raw);
        if (!ts) return null;
        const d = new Date(ts * 1000);
        const pad = (v) => String(v).padStart(2, "0");
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    };
    const fmtAt = (raw) => {
        const s = fmtShort(raw);
        return s ? ` at ${s} UTC` : "";
    };

    // Narrative
    const trigPctText = ov.triggerPenetrationPct != null
        ? `${ov.triggerPenetrationPct}% penetration`
        : "the trigger level";
    const rText = r != null
        ? (r >= 0 ? `won +${r.toFixed(2)}R` : `lost ${Math.abs(r).toFixed(2)}R`)
        : (outcome ? `resulted in ${outcome}` : "outcome unknown");
    const cancelLabel = displayCancelReason(ov.cancelReason);

    let narrative = "";
    switch (ov.badgeState) {
        case "never_trig":
            narrative = `Price tapped into the ${dir} OB${fmtAt(ov.tappedTime)} but never reached ${trigPctText}. The setup expired without a fill.`;
            break;
        case "first_failed":
            narrative = `Price first entered the ${dir} OB${fmtAt(ov.tappedTime)} but exited without reaching ${trigPctText}. This first visit is marked as a "failed tag" — the OB won't accept further entries.`;
            break;
        case "used_ob":
            narrative = `Price tapped the ${dir} OB${fmtAt(ov.tappedTime)}, crossed ${trigPctText}${fmtAt(ov.triggerTime)}, arming the entry order. Before the order filled, price retraced back out of the OB. The pending fill was cancelled${fmtAt(ov.retraceCancelTime)}.`;
            break;
        case "inval":
            narrative = `The ${dir} OB setup was invalidated before any trigger.${cancelLabel ? ` Reason: ${cancelLabel}.` : ""} The setup was removed to protect the trade from a compromised zone.`;
            break;
        case "same":
            narrative = `Price tapped the ${dir} OB${fmtAt(ov.tappedTime)}, crossed ${trigPctText}, and filled on the same trigger candle${fmtAt(fillTime)}. The trade ${rText}.`;
            break;
        case "next":
            narrative = `Price tapped the ${dir} OB${fmtAt(ov.tappedTime)}, crossed ${trigPctText}${fmtAt(ov.triggerTime)}, then the fill order executed on the next candle open${fmtAt(fillTime)}. The trade ${rText}.`;
            break;
        default:
            narrative = ov.cancelledBeforeEntry
                ? `The ${dir} OB setup was cancelled before any fill.${cancelLabel ? ` (${cancelLabel})` : ""}`
                : ov.wasTriggered
                    ? `Price triggered the ${dir} OB at ${trigPctText}${fmtAt(ov.triggerTime)}.`
                    : `The ${dir} OB setup did not trigger.`;
    }
    if (ov.ghost_candidate && ov.ghost_outcome) {
        const ghostRText = ov.ghost_r != null
            ? ` at ${ov.ghost_r >= 0 ? "+" : ""}${ov.ghost_r.toFixed(2)}R`
            : "";
        narrative += ` Simulated as a ghost: hypothetical outcome was ${ov.ghost_outcome.toUpperCase()}${ghostRText}.`;
    }

    // Event timeline
    const isWin = (o) => ["win", "target", "tp"].includes(String(o).toLowerCase());
    const timelineEvents = [
        ov.detectionTime && { label: "OB Detected",                   time: ov.detectionTime,    color: "hsl(var(--text-3))" },
        ov.tappedTime    && { label: "Tapped OB",                     time: ov.tappedTime,        color: "#6366f1" },
        ov.triggerTime   && { label: `Trigger Crossed (${trigPctText})`, time: ov.triggerTime,   color: "#f59e0b" },
        ov.armedAt       && { label: "Entry Armed",                    time: ov.armedAt,           color: "#fbbf24" },
        fillTime         && { label: "Filled",                         time: fillTime,             color: "#16a34a" },
        ov.retraceCancelTime && { label: "Retrace Cancel",             time: ov.retraceCancelTime, color: "#e11d48" },
        exitTime && outcome && {
            label: `Exit (${outcome.toUpperCase()})${r != null ? ` · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : ""}`,
            time: exitTime,
            color: isWin(outcome) ? "#16a34a" : "#e11d48",
        },
    ].filter(Boolean).sort((a, b) => {
        const ta = normalizeTimestampSeconds(a.time);
        const tb = normalizeTimestampSeconds(b.time);
        if (ta == null) return 1;
        if (tb == null) return -1;
        return ta - tb;
    });

    const ghostOutcome = String(ov.ghost_outcome || "").toUpperCase();
    const ghostR = ov.ghost_r;

    return (
        <div
            className="mt-2 rounded-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-1)/0.96)] px-3 py-2.5 shadow-md"
            style={{ fontSize: 11 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <span className="font-ui text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--text-1))]">
                        Lifecycle Detail
                    </span>
                    {badgeInfo && (
                        <span
                            className="px-1.5 py-px rounded-sm font-ui text-[8px] uppercase tracking-wider"
                            style={{ background: badgeInfo.tone, color: "rgba(255,255,255,0.96)" }}
                        >
                            {badgeInfo.label}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="font-ui text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-1))] px-1"
                >
                    ✕
                </button>
            </div>
            {/* Compact meta */}
            <div className="mb-2 flex items-center gap-1.5 font-ui text-[10px] text-[hsl(var(--text-2))]">
                <span className="font-semibold text-[hsl(var(--text-1))]">{obIdLabel}</span>
                <span>·</span>
                <span>{tradeIdLabel}</span>
                <span>·</span>
                <span>{dirLabel}</span>
                {r != null && (
                    <>
                        <span>·</span>
                        <span className={`font-semibold ${r >= 0 ? "text-green-600" : "text-rose-500"}`}>
                            {r >= 0 ? "+" : ""}{r.toFixed(2)}R
                        </span>
                    </>
                )}
            </div>
            {/* Plain-English narrative */}
            <p className="font-ui text-[10.5px] text-[hsl(var(--text-1))] leading-snug mb-2">
                {narrative}
            </p>
            {/* Event timeline */}
            {timelineEvents.length > 0 && (
                <div className="border-t border-[hsl(var(--border-soft))] pt-1.5">
                    <div className="font-ui text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))] mb-1">Event Sequence</div>
                    <div className="space-y-0.5">
                        {timelineEvents.map((ev, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <span
                                    className="flex-shrink-0 rounded-full"
                                    style={{ width: 5, height: 5, background: ev.color }}
                                />
                                <span className="font-ui text-[9px] text-[hsl(var(--text-3))] w-44 flex-shrink-0 truncate">{ev.label}</span>
                                <span className="font-mono text-[9px] text-[hsl(var(--text-2))]">{fmtShort(ev.time)} UTC</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Ghost simulation */}
            {ov.ghost_candidate && (ghostOutcome || ghostR != null) && (
                <div className="border-t border-[hsl(var(--border-soft))] mt-1.5 pt-1.5">
                    <div className="font-ui text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))] mb-0.5">Ghost Simulation</div>
                    <div className="flex items-center gap-3">
                        {ghostOutcome && (
                            <span className="font-ui text-[10px] text-[hsl(var(--text-1))]">{ghostOutcome}</span>
                        )}
                        {ghostR != null && (
                            <span className={`font-ui text-[10px] font-semibold ${ghostR > 0 ? "text-green-600" : ghostR < 0 ? "text-rose-500" : "text-[hsl(var(--text-2))]"}`}>
                                {ghostR >= 0 ? "+" : ""}{ghostR.toFixed(2)}R
                            </span>
                        )}
                    </div>
                </div>
            )}
            {/* FFT Debug checklist — shown when FFT Debug layer is on */}
            {showFftDebug && (ov.isFftCancel || ov.tappedBeforeTrigger || ov.badgeState === "first_failed") && (() => {
                const fftEnabled = runConfig?.triggered_edge_cancel_on_first_failed_tag;
                const fftEnabledLabel = fftEnabled === true ? "YES" : fftEnabled === false ? "NO" : "unknown";
                const tappedFlag = ov.tappedBeforeTrigger;
                const triggerReachedBeforeCancel = ov.wasTriggered && !ov.isFftCancel;
                const noFftRecorded = !ov.isFftCancel && tappedFlag;
                const fmtBool = (v) => v === true ? "true" : v === false ? "false" : "—";
                const fmtNum = (v) => (v != null && v !== "") ? String(v) : "—";
                return (
                    <div className="border-t border-[hsl(var(--border-soft))] mt-1.5 pt-1.5">
                        <div className="font-ui text-[9px] uppercase tracking-wider mb-1" style={{ color: "rgba(219,39,119,0.9)" }}>
                            🔍 FFT Debug
                        </div>
                        <div className="space-y-0.5">
                            {[
                                ["FFT enabled in config",    fftEnabledLabel],
                                ["tapped_before_trigger",    fmtBool(tappedFlag)],
                                ["First tap time",           fmtShort(ov.tappedTime) || "—"],
                                ["Trigger threshold",        ov.triggerPenetrationPct != null ? `${ov.triggerPenetrationPct}%` : "—"],
                                ["Trigger time",             fmtShort(ov.triggerTime) || "—"],
                                ["Cancel reason",            ov.cancelReason || "—"],
                                ["Cancelled before entry",   fmtBool(ov.cancelledBeforeEntry)],
                                ["Trigger before cancel?",   triggerReachedBeforeCancel ? "YES" : ov.isFftCancel ? "NO (FFT fired first)" : "—"],
                                ["FFT cancel time",          ov.fftCancelTime ? (fmtShort(ov.fftCancelTime) || "—") : "not exported"],
                                ["Ghost candidate",          fmtBool(ov.ghostCandidate)],
                                ["tapped_candle_index",      fmtNum(ov.tappedCandleIndex)],
                                ["trigger_candle_index",     fmtNum(ov.triggerCandleIndex)],
                                ["arm_candle_index",         fmtNum(ov.armCandleIndex)],
                                ["exited_ob_before_arm",     fmtBool(ov.exitedObBeforeArm)],
                                ["ob_occupied_at_arm",       fmtBool(ov.obOccupiedAtArm)],
                                ["armed_after_ob_exit",      fmtBool(ov.armedAfterObExit)],
                                ["ob_exit_time",             ov.obExitTime ? (fmtShort(ov.obExitTime) || "—") : "—"],
                            ].map(([label, value]) => (
                                <div key={label} className="flex items-start gap-1">
                                    <span className="font-ui text-[9px] text-[hsl(var(--text-3))] w-40 flex-shrink-0 truncate">{label}</span>
                                    <span className="font-mono text-[9px] text-[hsl(var(--text-1))]">{value}</span>
                                </div>
                            ))}
                        </div>
                        {noFftRecorded && (
                            <p className="mt-1 font-ui text-[9px]" style={{ color: "rgba(219,39,119,0.85)" }}>
                                ⚠ Tapped OB but no FFT cancel recorded for this row.
                            </p>
                        )}
                        {!ov.fftCancelTime && ov.isFftCancel && (
                            <p className="mt-1 font-ui text-[9px] text-[hsl(var(--text-3))]">
                                FFT cancel point: backend does not export first_failed_tag_time separately — using exit_time as proxy.
                            </p>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

function compactSessionName(key, session) {
    return {
        asia: "Asia",
        london: "London",
        londonLull: "Lull",
        newYork: "NY",
    }[key] || session?.label || key;
}

function SessionSummary({ sessionSettings, sessionsEnabled, editorOpen, onToggleEditor, onPatch }) {
    return (
        <div className="mb-3 clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] px-2.5 py-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="font-ui text-[10px] uppercase tracking-wider text-[hsl(var(--text-3))]">
                    Sessions are visual only · UTC
                </span>
                {Object.entries(sessionSettings).map(([key, session]) => {
                    const active = sessionsEnabled && session.enabled;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onPatch(key, { enabled: !session.enabled })}
                            title={sessionsEnabled ? "Toggle session highlight" : "Sessions layer is off"}
                            className={`font-ui text-[10px] px-1.5 py-0.5 clip-bevel-sm border transition-colors ${
                                active
                                    ? "border-[hsl(var(--accent-primary)/0.35)] text-[hsl(var(--text-1))] bg-[hsl(var(--accent-primary)/0.06)]"
                                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-3))] opacity-70 hover:opacity-100 hover:border-[hsl(var(--accent-primary)/0.28)]"
                            }`}
                        >
                            {compactSessionName(key, session)} {session.start}–{session.end}
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={onToggleEditor}
                    className="ml-auto px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary)/0.45)]"
                >
                    {editorOpen ? "Close Sessions" : "Edit Sessions"}
                </button>
            </div>
            {editorOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(sessionSettings).map(([key, session]) => (
                        <SessionControl key={key} id={key} session={session} onPatch={onPatch} />
                    ))}
                </div>
            )}
        </div>
    );
}

function SessionControl({ id, session, onPatch }) {
    const palette = {
        asia: {
            bg: "rgba(99, 102, 241, 0.08)",
            border: "rgba(99, 102, 241, 0.34)",
            text: "rgba(165, 180, 252, 0.98)",
            dot: "rgba(129, 140, 248, 0.95)",
        },
        london: {
            bg: "rgba(6, 182, 212, 0.08)",
            border: "rgba(6, 182, 212, 0.36)",
            text: "rgba(103, 232, 249, 0.98)",
            dot: "rgba(34, 211, 238, 0.95)",
        },
        londonLull: {
            bg: "rgba(217, 119, 6, 0.08)",
            border: "rgba(217, 119, 6, 0.34)",
            text: "rgba(252, 211, 77, 0.96)",
            dot: "rgba(245, 158, 11, 0.95)",
        },
        newYork: {
            bg: "rgba(22, 163, 74, 0.08)",
            border: "rgba(22, 163, 74, 0.34)",
            text: "rgba(134, 239, 172, 0.96)",
            dot: "rgba(34, 197, 94, 0.95)",
        },
    };
    const color = palette[session.colorKey] || palette.london;
    return (
        <div
            className="clip-bevel-sm border px-2 py-1 flex items-center gap-2 transition-colors"
            style={{
                borderColor: session.enabled ? color.border : "hsl(var(--border-soft))",
                background: session.enabled ? color.bg : "hsl(var(--panel-2) / 0.35)",
            }}
        >
            <button
                type="button"
                onClick={() => onPatch(id, { enabled: !session.enabled })}
                className="inline-flex items-center gap-1.5 font-ui text-[10px] uppercase tracking-wider"
                style={{ color: session.enabled ? color.text : "hsl(var(--text-3))" }}
            >
                <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                        background: session.enabled ? color.dot : "hsl(var(--text-3))",
                        opacity: session.enabled ? 1 : 0.45,
                    }}
                />
                {session.label}
            </button>
            <input
                type="time"
                value={session.start}
                onChange={(event) => onPatch(id, { start: event.target.value })}
                className="w-[76px] bg-transparent font-ui text-[10px] text-[hsl(var(--text-1))] outline-none"
            />
            <span className="font-ui text-[10px] text-[hsl(var(--text-3))]">→</span>
            <input
                type="time"
                value={session.end}
                onChange={(event) => onPatch(id, { end: event.target.value })}
                className="w-[76px] bg-transparent font-ui text-[10px] text-[hsl(var(--text-1))] outline-none"
            />
        </div>
    );
}

function StrategyMapIntelligencePanel({ runStats, sessionStats, obStats }) {
    return (
        <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1fr_1.25fr_0.9fr] gap-3">
            <IntelligenceCard title="Run Metadata">
                {/* Phase 1 cleanup: this card is now metadata-only. Stats
                    (Trades / W-L / WR / Net R / Expectancy / Max DD) live in
                    the TradeSanityStrip rendered by ScenarioSelector — they're
                    scenario-aware there, and duplicating them here used to
                    let baseline summary numbers sit next to scenario numbers
                    in the same row without distinction. */}
                <div className="grid grid-cols-2 gap-1.5">
                    <StatChip label="Symbol" value={runStats.symbol} />
                    <StatChip label="Variant" value={variantLabel(runStats.variant)} />
                    <StatChip label="Detection TF" value={runStats.detectionTf} />
                    <StatChip label="Execution TF" value={runStats.executionTf} />
                </div>
                <div className="mt-2 text-[10px] leading-snug text-[hsl(var(--text-3))] font-ui">
                    Scenario stats (W/L, Net R, WR, PF, DD) sit in the sanity strip above.
                </div>
            </IntelligenceCard>
            <IntelligenceCard title="Session Breakdown">
                {sessionStats.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full font-ui text-[10.5px]">
                            <thead className="text-[hsl(var(--text-3))] uppercase tracking-wider">
                                <tr>
                                    <th className="text-left py-1">Session</th>
                                    <th className="text-right py-1">Trades</th>
                                    <th className="text-right py-1">Wins</th>
                                    <th className="text-right py-1">Losses</th>
                                    <th className="text-right py-1">WR</th>
                                    <th className="text-right py-1">Net R</th>
                                    <th className="text-right py-1">Avg R</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionStats.map((row) => (
                                    <tr key={row.session} className="border-t border-[hsl(var(--border-soft))]">
                                        <td className="py-1.5 text-[hsl(var(--text-1))]">{row.session}</td>
                                        <td className="py-1.5 text-right font-num">{row.trades}</td>
                                        <td className="py-1.5 text-right font-num text-[hsl(var(--success))]">{row.wins}</td>
                                        <td className="py-1.5 text-right font-num text-[hsl(var(--danger))]">{row.losses}</td>
                                        <td className="py-1.5 text-right font-num">{fmtPct(row.winRate)}</td>
                                        <td className="py-1.5 text-right font-num">{fmt(row.netR, 2)}</td>
                                        <td className="py-1.5 text-right font-num">{fmt(row.avgR, 3)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-[11px] text-[hsl(var(--text-3))] font-ui">Session data unavailable for this run.</div>
                )}
            </IntelligenceCard>
            <IntelligenceCard title="OB Breakdown">
                <div className="grid grid-cols-2 gap-1.5">
                    <StatChip label="Total OBs" value={obStats.total} />
                    <StatChip label="Linked Trades" value={obStats.linked} />
                    <StatChip label="Bullish" value={obStats.bullish} />
                    <StatChip label="Bearish" value={obStats.bearish} />
                    <StatChip label="Wins" value={obStats.hasLifecycle ? obStats.wins : "—"} />
                    <StatChip label="Losses" value={obStats.hasLifecycle ? obStats.losses : "—"} />
                    <StatChip label="Invalid" value={obStats.hasLifecycle ? obStats.invalid : "—"} />
                    <StatChip label="Unfilled" value={obStats.hasLifecycle ? obStats.unfilled : "—"} />
                </div>
                <div className="mt-2 text-[10px] leading-snug text-[hsl(var(--text-3))] font-ui">
                    Metrics come from the imported run. Visual session settings do not change strategy results.
                </div>
            </IntelligenceCard>
        </div>
    );
}

function IntelligenceCard({ title, children }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
            <div className="mb-2 font-ui text-[10.5px] uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">{title}</div>
            {children}
        </div>
    );
}

function StatChip({ label, value }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.45)] px-2 py-1.5">
            <div className="font-ui text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
            <div className="mt-0.5 font-ui text-[12px] text-[hsl(var(--text-1))] truncate">{value ?? "—"}</div>
        </div>
    );
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v;
}

function Toggle({ label, checked, onChange, dot }) {
    return (
        <FilterToggle
            active={checked}
            inactiveBorder="mid"
            dot={dot}
            onClick={() => onChange(!checked)}
            className="text-[11px] tracking-wider"
        >
            {label}
        </FilterToggle>
    );
}
