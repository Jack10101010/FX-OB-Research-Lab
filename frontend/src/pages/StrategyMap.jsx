import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { NeonInput, NeonSelect, Segment, NeonButton, FilterToggle } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { CandleChart } from "@/components/lab/CandleChart";
import { compactTimeframe, formatRunDateRange, getRunDisplayName, rehydrateRunCandles, useDataset } from "@/data/store";
import { setActiveRunId } from "@/data/store";
import { FolderKanban, Search, AlertTriangle } from "lucide-react";

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
};

const DEFAULT_UI_SETTINGS = {
    version: 1,
    displayTf: "15m",
    zoom: "ALL",
    chartHeight: DEFAULT_CHART_HEIGHT,
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
    const { CANDLES, OB_BOXES, OB_BOXES_ENRICHED, TRADE_MARKERS, RUNS, activeRunId, getRunData, ACTIVE_TRADE_VARIANT } = useDataset();
    const [initialUi] = useState(loadStrategyMapUi);
    const resizeRef = useRef(null);
    const [displayTf, setDisplayTf] = useState(initialUi.displayTf);
    const [zoom, setZoom] = useState(initialUi.zoom);
    const [chartHeight, setChartHeight] = useState(initialUi.chartHeight);
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
    const [sessionSettings, setSessionSettings] = useState(initialUi.sessionSettings);
    const [tradeQuery, setTradeQuery] = useState("");
    const [tradeOutcomeFilter, setTradeOutcomeFilter] = useState("All");
    const [tradeDirectionFilter, setTradeDirectionFilter] = useState("All");
    const [tradeStructureFilter, setTradeStructureFilter] = useState("All");
    const [selectedTradeId, setSelectedTradeId] = useState(null);
    const [showRunInfo, setShowRunInfo] = useState(false);
    const importedRuns = RUNS.filter((r) => r._source === "imported");
    const fallbackRunId = importedRuns.find((r) => (
        r.id && (r.hasCandles || r.candleCount || r.trades || r.ob_count || r.obCount)
    ))?.id || importedRuns[0]?.id || null;
    const runId = activeRunId || fallbackRunId;
    const alternateRunId = importedRuns.find((r) => (
        r.id && r.id !== runId && (r.hasCandles || r.candleCount || r.trades || r.ob_count || r.obCount)
    ))?.id || null;
    const bundle = runId ? getRunData(runId) : null;
    const sourceCandles = CANDLES?.length ? CANDLES : (bundle?.candles || []);
    const hasCandles = bundle ? (bundle.hasCandles !== false && !!bundle.candles?.length) : (CANDLES?.length > 0);
    const candlesInIndexedDb = !!bundle?.hasCandles && bundle?.candlesStorage === "indexeddb" && !bundle?.candles?.length;
    const activeRunMeta = RUNS.find((r) => r.id === runId) || {};
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
    const rawChartObBoxes = OB_BOXES_ENRICHED?.length ? OB_BOXES_ENRICHED : OB_BOXES;
    const activeTrades = useMemo(() => (
        ACTIVE_TRADE_VARIANT && bundle?.tradesByVariant?.[ACTIVE_TRADE_VARIANT]
            ? bundle.tradesByVariant[ACTIVE_TRADE_VARIANT]
            : (bundle?.trades || [])
    ), [ACTIVE_TRADE_VARIANT, bundle]);
    const filteredTrades = useMemo(() => (
        filterStrategyTrades(activeTrades, {
            query: tradeQuery,
            outcome: tradeOutcomeFilter,
            direction: tradeDirectionFilter,
            structure: tradeStructureFilter,
        })
    ), [activeTrades, tradeQuery, tradeOutcomeFilter, tradeDirectionFilter, tradeStructureFilter]);
    const chartObBoxes = useMemo(() => (
        enrichObsWithTradeLabels(rawChartObBoxes, activeTrades)
    ), [rawChartObBoxes, activeTrades]);
    const rrTools = useMemo(() => (
        showRrTools ? buildRrToolsFromObs(chartObBoxes, activeTrades) : []
    ), [showRrTools, chartObBoxes, activeTrades]);
    const newsEventsAvailable = useMemo(() => buildStrategyMapNewsEvents(bundle, summary, ACTIVE_TRADE_VARIANT), [bundle, summary, ACTIVE_TRADE_VARIANT]);
    const newsEvents = showNewsEvents ? newsEventsAvailable : [];
    const sessionRanges = useMemo(() => (
        showSessions ? buildSessionRanges(displayCandles, sessionSettings) : []
    ), [displayCandles, sessionSettings, showSessions]);
    const runStats = useMemo(() => buildRunStats(activeTrades, summary, bundle, ACTIVE_TRADE_VARIANT), [activeTrades, summary, bundle, ACTIVE_TRADE_VARIANT]);
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
            },
            sessionSettings,
        });
    }, [
        displayTf,
        zoom,
        chartHeight,
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
        if (!activeTrades.some((trade) => trade.id === selectedTradeId)) {
            setSelectedTradeId(null);
        }
    }, [activeTrades, selectedTradeId]);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Strategy Map"
                title={heroTitle}
                runLine={`Run: ${getRunDisplayName(bundle || activeRunMeta || { id: runId })} · ${heroSymbol} · ${heroTf} · ${heroTrades ?? "—"} trades`}
                configLine={`${heroSymbol} · ${heroTf} · RR ${Number.isFinite(heroRr) ? heroRr.toFixed(1) : "—"}`}
                dateRangeLine={heroDateRange || "—"}
                actions={projectId && (
                    <Link to={`/projects/${encodeURIComponent(projectId)}`}>
                        <NeonButton icon={FolderKanban} tone="ghost">Open Project</NeonButton>
                    </Link>
                )}
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
                            <NeonSelect testId="map-symbol" value="EURUSD" onChange={() => {}} options={["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]} />
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
                    {!hasCandles && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="map-no-candles-banner">
                            <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                            <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                                Trade sequence view · no candle data imported
                            </span>
                        </div>
                    )}
                    {showChartFilters ? (
                        <>
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                                <Toggle label="Order Blocks" checked={showOB} onChange={setShowOB} dot="primary" />
                                <Toggle label="BOS / CHoCH" checked={showBC} onChange={setShowBC} dot="secondary" />
                                <Toggle label="Sessions" checked={showSessions} onChange={setShowSessions} dot="primary" />
                                <Toggle label="OB Origin" checked={showObOriginMarkers} onChange={setShowObOriginMarkers} dot="primary" />
                                <Toggle label="OB Detection" checked={showObDetectionMarkers} onChange={setShowObDetectionMarkers} dot="warning" />
                                <Toggle label="OB IDs" checked={showObLabels} onChange={setShowObLabels} dot="secondary" />
                                <Toggle label="RR Tools" checked={showRrTools} onChange={setShowRrTools} dot="success" />
                                <Toggle label={`News (${newsEventsAvailable.length})`} checked={showNewsEvents} onChange={setShowNewsEvents} dot="warning" />
                                <Toggle label="News Labels" checked={showNewsLabels} onChange={setShowNewsLabels} dot="warning" />
                                <Pill tone="muted">Chart time: UTC</Pill>
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
                    <CandleChart
                        key={`${showTradeList ? "with-trades" : "full-width"}-${displayTf}`}
                        candles={displayCandles}
                        obBoxes={chartObBoxes}
                        trades={TRADE_MARKERS}
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
                    />
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
        const entry = numericOrNull(trade.entryPrice ?? ob.entry ?? ob.entryPrice ?? ob.entry_price ?? ob.actual_entry_price);
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
            stop,
            tp,
            direction: ob.direction || ob.side,
        };
    }).filter(Boolean);
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

function isWin(trade) {
    const outcome = normalizeOutcome(trade?.outcome ?? trade?.result);
    return outcome.includes("win") || outcome === "tp" || tradeR(trade) > 0;
}

function isLoss(trade) {
    const outcome = normalizeOutcome(trade?.outcome ?? trade?.result);
    return outcome.includes("loss") || outcome === "sl" || tradeR(trade) < 0;
}

function buildRunStats(trades = [], summary = {}, bundle = {}, activeVariant = null) {
    const total = Number(summary.trades ?? summary.trade_count ?? trades.length) || trades.length;
    const wins = Number(summary.wins ?? trades.filter(isWin).length) || 0;
    const losses = Number(summary.losses ?? trades.filter(isLoss).length) || 0;
    const netR = numericOrNull(summary.netR ?? summary.net_r) ?? trades.reduce((sum, trade) => sum + tradeR(trade), 0);
    const winRate = numericOrNull(summary.winRate ?? summary.win_rate) ?? (total ? (wins / total) * 100 : 0);
    const avgR = total ? netR / total : 0;
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
        ["Trades", firstAvailable(summary.trades, summary.trade_count, trades.length)],
        ["Order Blocks", firstAvailable(summary.order_blocks, summary.orderBlockCount, obs.length)],
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

function formatTradeOutcome(value) {
    if (!value || value === "—") return "—";
    return String(value).replace(/_/g, " ").toUpperCase();
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

function outcomeTone(trade) {
    if (isWin(trade)) return "success";
    if (isLoss(trade)) return "danger";
    return "warning";
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
                    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">Run Info</div>
                    <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
                        {(rows || []).map(([label, value]) => (
                            <React.Fragment key={label}>
                                <div className="font-mono text-[9.5px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
                                <div className="font-mono text-[10.5px] text-[hsl(var(--text-1))] min-w-0 break-words">{formatInfoValue(value)}</div>
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
                            className="px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary)/0.45)]"
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
                                        <div className="font-mono text-[12px] text-[hsl(var(--text-1))] truncate">
                                            {displayTradeId(trade)}
                                            <span className="ml-1.5 text-[10px] text-[hsl(var(--text-3))]">{displayTradeDirection(trade)}</span>
                                        </div>
                                        <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--text-3))] truncate">
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
                        <div className="pt-1 text-center font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--text-3))]">
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
            <div className="font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
            <div className="font-mono text-[11px] text-[hsl(var(--text-1))] truncate">{value || "—"}</div>
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
                <span className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--text-3))]">
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
                            className={`font-mono text-[10px] px-1.5 py-0.5 clip-bevel-sm border transition-colors ${
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
                    className="ml-auto px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-soft))] text-[10px] font-mono uppercase tracking-wider text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary)/0.45)]"
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
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
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
                className="w-[76px] bg-transparent font-mono text-[10px] text-[hsl(var(--text-1))] outline-none"
            />
            <span className="font-mono text-[10px] text-[hsl(var(--text-3))]">→</span>
            <input
                type="time"
                value={session.end}
                onChange={(event) => onPatch(id, { end: event.target.value })}
                className="w-[76px] bg-transparent font-mono text-[10px] text-[hsl(var(--text-1))] outline-none"
            />
        </div>
    );
}

function StrategyMapIntelligencePanel({ runStats, sessionStats, obStats }) {
    return (
        <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1fr_1.25fr_0.9fr] gap-3">
            <IntelligenceCard title="Run Summary">
                <div className="grid grid-cols-2 gap-1.5">
                    <StatChip label="Symbol" value={runStats.symbol} />
                    <StatChip label="Variant" value={variantLabel(runStats.variant)} />
                    <StatChip label="Detection TF" value={runStats.detectionTf} />
                    <StatChip label="Execution TF" value={runStats.executionTf} />
                    <StatChip label="Trades" value={runStats.total} />
                    <StatChip label="Wins / Losses" value={`${runStats.wins} / ${runStats.losses}`} />
                    <StatChip label="WR" value={fmtPct(runStats.winRate)} />
                    <StatChip label="Net R" value={fmt(runStats.netR, 2)} />
                    <StatChip label="Expectancy" value={fmt(runStats.expectancy, 3)} />
                    <StatChip label="Max DD" value={fmt(runStats.maxDd, 2)} />
                </div>
            </IntelligenceCard>
            <IntelligenceCard title="Session Breakdown">
                {sessionStats.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full font-mono text-[10.5px]">
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
                                        <td className="py-1.5 text-right">{row.trades}</td>
                                        <td className="py-1.5 text-right text-[hsl(var(--success))]">{row.wins}</td>
                                        <td className="py-1.5 text-right text-[hsl(var(--danger))]">{row.losses}</td>
                                        <td className="py-1.5 text-right">{fmtPct(row.winRate)}</td>
                                        <td className="py-1.5 text-right">{fmt(row.netR, 2)}</td>
                                        <td className="py-1.5 text-right">{fmt(row.avgR, 3)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-[11px] text-[hsl(var(--text-3))] font-mono">Session data unavailable for this run.</div>
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
                <div className="mt-2 text-[10px] leading-snug text-[hsl(var(--text-3))] font-mono">
                    Metrics come from the imported run. Visual session settings do not change strategy results.
                </div>
            </IntelligenceCard>
        </div>
    );
}

function IntelligenceCard({ title, children }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">{title}</div>
            {children}
        </div>
    );
}

function StatChip({ label, value }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.45)] px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--text-3))]">{label}</div>
            <div className="mt-0.5 font-mono text-[12px] text-[hsl(var(--text-1))] truncate">{value ?? "—"}</div>
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
