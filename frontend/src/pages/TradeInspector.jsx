import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill, ColoredR } from "@/components/lab/DataTable";
import { Segment, NeonInput, NeonSelect, NeonButton } from "@/components/lab/controls";
import { CandleChart } from "@/components/lab/CandleChart";
import { getRunDisplayName, rehydrateRunCandles, useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { TradeUniverseBadge } from "@/components/lab/TradeUniverseBadge";
import { deriveOBRightTime } from "@/data/obLifecycle";
import { Search, AlertTriangle } from "lucide-react";
import { ActiveRunContext } from "@/components/lab/ActiveRunContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TradeInspector() {
    const { CANDLES, OB_BOXES, OB_BOXES_ENRICHED, ACTIVE_RUN, activeRunId, getRunData, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS } = useDataset();
    // Phase 2D — trade source comes from the canonical store-level resolver
    // via useTradeUniverse(). When the user picks a scenario in Strategy Map
    // (e.g. Triggered Edge 25% · Next), the inspector's left-panel trade list,
    // filters, and currently-inspected trade all re-evaluate against that
    // scenario's trades. Previously this page read baseline-only `TRADES`
    // from useDataset and so a user inspecting "OB 12" while a triggered-edge
    // scenario was active would see the baseline outcome (NEWS_FLATTEN), not
    // the scenario outcome (PROTECTED).
    //
    // Non-trade fields (CANDLES, OB_BOXES, ACTIVE_RUN, variant metadata) still
    // come from useDataset — those are run-level and correctly run-wide.
    const universe = useTradeUniverse();
    const trades = universe.trades;
    // Phase 2G — TradeUniverseBadge filters universe.warnings internally to
    // the user-facing codes; the per-page filter is no longer needed here.
    const bundle = activeRunId ? getRunData(activeRunId) : null;
    const runLabel = getRunDisplayName(bundle || ACTIVE_RUN);
    const hasCandles = bundle ? !!bundle.candles?.length : false;
    const candlesInIndexedDb = !!bundle?.hasCandles && bundle?.candlesStorage === "indexeddb" && !hasCandles;
    const candlesDroppedAfterReload = !!bundle?.hasCandles && !!bundle?.candlesDroppedFromPersistence && !hasCandles && !candlesInIndexedDb;
    const [candleLoadState, setCandleLoadState] = useState("idle");
    const [q, setQ] = useState("");
    const [outcome, setOutcome] = useState("All");
    const [direction, setDirection] = useState("All");
    const [structure, setStructure] = useState("All");
    const [chartTf, setChartTf] = useState("1m");
    const [selectedId, setSelectedId] = useState(trades[0]?.id);

    useEffect(() => {
        if (!trades.some((t) => t.id === selectedId)) {
            setSelectedId(trades[0]?.id || null);
        }
    }, [trades, selectedId]);

    useEffect(() => {
        setCandleLoadState("idle");
    }, [activeRunId]);

    useEffect(() => {
        let cancelled = false;
        if (!activeRunId || !candlesInIndexedDb || candleLoadState !== "idle") return undefined;
        setCandleLoadState("loading");
        rehydrateRunCandles(activeRunId)
            .then((ok) => {
                if (!cancelled) setCandleLoadState(ok ? "loaded" : "missing");
            })
            .catch(() => {
                if (!cancelled) setCandleLoadState("missing");
            });
        return () => { cancelled = true; };
    }, [activeRunId, candlesInIndexedDb, candleLoadState]);

    const loadStoredCandles = () => {
        if (!activeRunId) return;
        setCandleLoadState("loading");
        rehydrateRunCandles(activeRunId)
            .then((ok) => setCandleLoadState(ok ? "loaded" : "missing"))
            .catch(() => setCandleLoadState("missing"));
    };

    const filtered = useMemo(() => trades.filter((t) => {
        if (q && !tradeSearchText(t).includes(q.toLowerCase())) return false;
        if (outcome !== "All" && t.outcome !== outcome) return false;
        if (direction !== "All" && t.direction !== direction) return false;
        if (structure !== "All" && t.structure !== structure) return false;
        return true;
    }), [q, outcome, direction, structure, trades]);

    const trade = trades.find((t) => t.id === selectedId) || trades[0] || null;
    const tradeStatus = getTradeStatus(trade);
    const isFilledTrade = tradeStatus.key === "filled" || tradeStatus.key === "protection_exit";
    const rawCandleGapSec = useMemo(() => medianCandleGapSec(CANDLES), [CANDLES]);
    const supportsExecutionTimeframes = rawCandleGapSec > 0 && rawCandleGapSec < 900;
    const effectiveChartTf = supportsExecutionTimeframes ? chartTf : "15m";
    useEffect(() => {
        if (!supportsExecutionTimeframes && chartTf !== "15m") setChartTf("15m");
    }, [supportsExecutionTimeframes, chartTf]);
    const displayCandles = useMemo(() => resampleCandlesForDisplay(CANDLES, effectiveChartTf), [CANDLES, effectiveChartTf]);
    const candleIndex = useMemo(() => buildCandleIndex(displayCandles), [displayCandles]);
    const fillTimeForMapping = tradeStatus.key === "news_blackout"
        ? trade?.news_blackout_trigger_time
        : trade?.entry;
    const fillMap = useMemo(() => mapTimeToCandle(fillTimeForMapping, candleIndex), [fillTimeForMapping, candleIndex]);
    const selectedMarker = trade
        ? {
            i: fillMap.i,
            time: fillMap.time,
            mappingQuality: fillMap.quality,
            price: trade.entryPrice,
            direction: trade.direction,
            win: trade.outcome === "Win",
            id: trade.id,
        }
        : null;
    const exitMap = useMemo(() => {
        if (!trade) return emptyMap();
        if (trade.exit_candle_index != null && Number(trade.exit_candle_index) >= 0) {
            return mapTimeToCandle(trade.exit, candleIndex);
        }
        return mapTimeToCandle(trade.exit, candleIndex);
    }, [trade, candleIndex]);
    const hasMappedMarker = hasCandles && selectedMarker?.i >= 0 && selectedMarker.mappingQuality !== "missing";
    const mappedFillIndex = hasMappedMarker ? selectedMarker.i : fillMap.i;
    const selectedOB = useMemo(() => (
        findSelectedOrderBlock(trade, OB_BOXES_ENRICHED?.length ? OB_BOXES_ENRICHED : OB_BOXES) || buildTradeOrderBlock(trade, candleIndex)
    ), [trade, OB_BOXES, OB_BOXES_ENRICHED, candleIndex]);
    const chartSelectedOB = useMemo(() => buildSelectedTradeDisplayOB(selectedOB, trade, candleIndex), [selectedOB, trade, candleIndex]);

    // Prefer mapped imported trade location; fall back to legacy mock positioning.
    const candleWindow = Math.max(1, displayCandles.length - 80);
    const center = mappedFillIndex >= 0 ? mappedFillIndex : (trade ? ((trade.num * 2) % candleWindow) + Math.min(40, displayCandles.length) : 0);
    const exitIndex = exitMap.i >= 0 ? exitMap.i : null;
    const baseStart = Math.max(0, center - 40);
    const baseEnd = Math.min(displayCandles.length, center + 40);
    const sliceStart = exitIndex != null ? Math.max(0, Math.min(baseStart, exitIndex - 12)) : baseStart;
    const sliceEnd = exitIndex != null ? Math.min(displayCandles.length, Math.max(baseEnd, exitIndex + 12)) : baseEnd;
    const rawSlice = displayCandles.slice(sliceStart, sliceEnd);
    const slice = hasCandles ? rawSlice : rawSlice.map((c, i) => ({ ...c, i }));
    const chartTrades = [];
    const chartOBs = selectedOB
        ? [chartSelectedOB || selectedOB]
        : [];
    const verifierOverlay = buildVerifierOverlay({ trade, status: tradeStatus, selectedMarker, fillMap, exitMap, candles: displayCandles });
    const fillCandle = mappedFillIndex >= 0 ? displayCandles[mappedFillIndex] : null;
    const exitCandle = exitMap.i >= 0 ? displayCandles[exitMap.i] : null;
    const mappingQuality = selectedMarker?.mappingQuality || fillMap.quality || "missing";

    if (!activeRunId && !trades.length) {
        return (
            <div className="pb-12">
                <ActiveRunContext
                    pageLabel="Trade Inspector"
                    description="Select an imported run to inspect individual trades."
                />
                <div className="px-6 py-20 flex flex-col items-center text-center gap-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-lab">No Imported Run</div>
                    <p className="text-[13px] text-[hsl(var(--text-2))] max-w-[480px] leading-relaxed">
                        Import a run to inspect individual trades, verify candle mapping, and explore order block geometry.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                        <Link to="/runs" className="inline-flex"><NeonButton tone="secondary">Go to Runs</NeonButton></Link>
                        <Link to="/strategy" className="inline-flex"><NeonButton tone="primary">Open Strategy Builder</NeonButton></Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-12">
            <ActiveRunContext
                pageLabel="Trade Inspector"
                description={trade ? `${displayTradeId(trade)} · ${trade.direction} · ${trade.structure} · ${trade.session} · ${tradeStatus.label} · ${trade.obWidthPips != null ? `OB width ${trade.obWidthPips} pips` : "OB link unavailable"}` : `${runLabel} · selected variant has no imported trades.`}
                actions={<VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />}
            />

            {/* Universe / source badge — shared component. Tells the user
                exactly which trade universe powers the list + chart + details
                below. Without this, a user inspecting a single OB could not
                tell whether they were looking at the baseline outcome or the
                triggered-edge scenario outcome. Placement preserved from the
                Phase 2D local version. Warnings filtered inside the badge. */}
            {activeRunId && (
                <TradeUniverseBadge
                    universe={universe}
                    className="px-6 mt-2 mb-3"
                />
            )}

            {!hasCandles && (
                <div className="px-6 mb-3">
                    <div className="flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="ti-no-candles-banner">
                        <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                            {candlesInIndexedDb
                                ? (candleLoadState === "loading" ? "Loading candles from browser storage..." : "Candles are stored in browser storage but are not loaded into this session yet.")
                                : candlesDroppedAfterReload
                                ? "Candles were imported but are not available after reload because they are not stored in localStorage. Re-import the run or reload candles from the output folder."
                                : "Trade sequence view · no candle data imported"}
                        </span>
                        {candlesInIndexedDb && (
                            <NeonButton tone="secondary" onClick={loadStoredCandles} disabled={candleLoadState === "loading"}>
                                Load candles from browser storage
                            </NeonButton>
                        )}
                    </div>
                </div>
            )}
            {hasCandles && trade && !hasMappedMarker && (
                <div className="px-6 mb-3">
                    <div className="flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="ti-mapping-warning">
                        <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                            Trade timestamp mapping degraded · using sequence fallback
                        </span>
                    </div>
                </div>
            )}

            <div className="px-6 grid grid-cols-1 xl:grid-cols-[280px_1fr_280px] gap-3">
                {/* LEFT: trade list */}
                <NeonPanel title={`Trades (${filtered.length})`} dense>
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <Search className="w-3.5 h-3.5 text-muted-lab" />
                        <NeonInput data-testid="ti-search" placeholder="Search T-001…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        <Segment options={["All", "Win", "Loss"]} value={outcome} onChange={setOutcome} />
                        <Segment options={["All", "Long", "Short"]} value={direction} onChange={setDirection} />
                        <Segment options={["All", "BOS", "CHoCH"]} value={structure} onChange={setStructure} />
                    </div>
                    <div className="max-h-[520px] overflow-y-auto scrollbar-thin pr-1 space-y-1">
                        {!filtered.length && (
                            <div className="px-2.5 py-2 text-[11px] font-mono text-muted-lab border border-dashed border-[hsl(var(--border-soft))] clip-bevel-sm">
                                No trades in selected variant.
                            </div>
                        )}
                        {filtered.slice(0, 80).map((t) => {
                            const active = t.id === selectedId;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedId(t.id)}
                                    className={`w-full text-left px-2.5 py-1.5 clip-bevel-sm border transition-colors ${
                                        active
                                            ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                            : "border-[hsl(var(--border-soft))] hover:border-[hsl(var(--accent-secondary)/0.5)]"
                                    }`}
                                >
                                    <div className="flex items-center justify-between font-mono text-[11px]">
                                        <span className="text-white">{displayTradeId(t)} {t.direction}</span>
                                        <ColoredR value={t.r} />
                                    </div>
                                    <div className="flex items-center justify-between font-mono text-[10px] text-muted-lab mt-0.5">
                                        <span>{t.entry.slice(0, 16)}</span>
                                        <Pill tone={t.outcome === "Win" ? "success" : "danger"}>{t.outcome}</Pill>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </NeonPanel>

                {/* MAIN CHART */}
                <NeonPanel
                    title={trade ? <>{displayTradeId(trade)} <span className="text-[hsl(var(--accent-primary))] ml-1">{trade.direction}</span></> : "No Trade Selected"}
                    action={(
                        <div className="flex items-center gap-2">
                            <Segment options={supportsExecutionTimeframes ? ["1m", "5m", "15m"] : ["15m"]} value={effectiveChartTf} onChange={setChartTf} />
                            {trade ? <Pill tone={trade.outcome === "Win" ? "success" : "danger"}>{trade.outcome} · {trade.r >= 0 ? "+" : ""}{trade.r}R</Pill> : null}
                        </div>
                    )}
                >
                    {hasCandles && !supportsExecutionTimeframes && (
                        <div className="mb-2 flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm">
                            <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                            <span className="text-[10.5px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                                Imported candles are 15m/coarser. 1m/5m execution views unavailable for this run.
                            </span>
                        </div>
                    )}
                    <CandleChart
                        candles={slice}
                        obBoxes={chartOBs}
                        trades={chartTrades}
                        tpSlLines={trade && isFilledTrade ? [{ i: mappedFillIndex >= 0 ? mappedFillIndex : 44, tp: trade.tp, sl: trade.stop }] : []}
                        selectedTradeId={trade?.id}
                        verificationOverlay={verifierOverlay}
                        debugOverlays
                        showObOriginMarkers
                        showObDetectionMarkers
                        showObLabels
                        height={400}
                    />
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-lab">
                        <DebugCell label="Trade" value={trade ? displayTradeId(trade) : "none"} />
                        <DebugCell label="OB" value={trade ? displayObId(trade) : displayObId(selectedOB) || "none"} />
                        <DebugCell label="OB Found" value={selectedOB ? "yes" : "no"} />
                        <DebugCell label="Verifier" value={verifierOverlay ? "1" : "0"} />
                        <DebugCell label="OB Time0" value={formatUtc(chartSelectedOB?.time0 || selectedOB?.time0)} />
                        <DebugCell label="OB Time1" value={formatUtc(chartSelectedOB?.time1 || selectedOB?.time1)} />
                        <DebugCell label="OB Top/Bot" value={`${formatNumber(chartSelectedOB?.top ?? selectedOB?.top)} / ${formatNumber(chartSelectedOB?.bot ?? selectedOB?.bot)}`} />
                        <DebugCell label="Candles/OBs" value={`${slice.length} / ${chartOBs.length}`} />
                    </div>
                    <Tabs defaultValue="overview" className="mt-3">
                        <TabsList className="bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))]">
                            <TabsTrigger value="overview" data-testid="ti-tab-overview">Overview</TabsTrigger>
                            <TabsTrigger value="ob">Order Block</TabsTrigger>
                            <TabsTrigger value="exec">Execution</TabsTrigger>
                            <TabsTrigger value="verify">Verifier</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>
                        <TabsContent value="overview" className="text-[11.5px] font-mono text-muted-lab pt-3 leading-relaxed">
                            {trade ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                                    <Row k="Trade ID" v={displayTradeId(trade)} />
                                    <Row k="Raw Trade ID" v={rawTradeId(trade)} />
                                    <Row k="Direction" v={trade.direction} />
                                    <Row k="Structure" v={trade.structure} />
                                    <Row k="Session" v={trade.session} />
                                    <RBreakdownRows trade={trade} />
                                </div>
                            ) : "No trade selected for this variant."}
                        </TabsContent>
                        <TabsContent value="ob" className="text-[11.5px] font-mono pt-3">
                            {trade ? (
                                hasOrderBlockData(trade) ? <>
                                    <Row k="OB ID" v={displayObId(trade)} />
                                    <Row k="Origin" v={formatValue(trade.obOriginTime)} />
                                    <Row k="Detected" v={formatValue(trade.obDetectionTime)} />
                                    <Row k="Top" v={formatNumber(trade.obTop)} />
                                    <Row k="Bottom" v={formatNumber(trade.obBottom)} />
                                    <Row k="OB Width" v={trade.obWidthPips != null ? `${trade.obWidthPips} pips` : "N/A"} />
                                    <Row k="Side" v={formatValue(trade.obDirection)} />
                                </> : <span className="text-muted-lab">No linked order block data.</span>
                            ) : <span className="text-muted-lab">No order block details.</span>}
                        </TabsContent>
                        <TabsContent value="exec" className="text-[11.5px] font-mono pt-3">
                            {trade ? <>
                                <Row k="Entry" v={`${trade.entry} @ ${trade.entryPrice}`} />
                                <Row k="Stop" v={String(trade.stop)} />
                                <Row k="TP" v={String(trade.tp)} />
                                <Row k="Exit" v={trade.exit} />
                                <Row k="R Result" v={`${trade.r >= 0 ? "+" : ""}${trade.r}R`} />
                                <Row k="Reverse Conflict" v={trade.reverseConflict ? "YES" : "NO"} />
                            </> : <span className="text-muted-lab">No execution details.</span>}
                        </TabsContent>
                        <TabsContent value="verify" className="pt-3">
                            <VisualVerifier
                                trade={trade}
                                status={tradeStatus}
                                selectedOB={chartSelectedOB || selectedOB}
                                selectedMarker={selectedMarker}
                                fillMap={fillMap}
                                exitMap={exitMap}
                                fillCandle={fillCandle}
                                exitCandle={exitCandle}
                                mappingQuality={mappingQuality}
                                displayTimeframe={effectiveChartTf}
                            />
                        </TabsContent>
                        <TabsContent value="notes" className="text-[11.5px] text-muted-lab pt-3">No notes recorded.</TabsContent>
                    </Tabs>
                </NeonPanel>

                {/* RIGHT: details */}
                <NeonPanel title="Trade Details" dense>
                    <div className="space-y-1 font-mono text-[11.5px]">
                        {trade ? <>
                            <Row k="Trade ID" v={displayTradeId(trade)} />
                            <Row k="Raw Trade ID" v={rawTradeId(trade)} />
                            <Row k="Direction" v={trade.direction} />
                            <Row k="Structure" v={trade.structure} />
                            <Row k="Session" v={trade.session} />
                            <Row k="OB ID" v={displayObId(trade)} />
                            <Row k="OB Origin" v={formatValue(trade.obOriginTime)} />
                            <Row k="Detected" v={formatValue(trade.obDetectionTime)} />
                            <Row k="Entry Time" v={trade.entry} />
                            <Row k="Exit Time" v={trade.exit} />
                            <div className="divider-glow my-2" />
                            <Row k="Entry Price" v={trade.entryPrice} />
                            <Row k="Stop Loss" v={trade.stop} />
                            <Row k="Take Profit" v={trade.tp} />
                            <Row k="OB Width" v={trade.obWidthPips != null ? `${trade.obWidthPips} pips` : "N/A"} />
                            <div className="divider-glow my-2" />
                            <Row k="Status" v={<Pill tone={tradeStatus.tone}>{tradeStatus.label}</Pill>} />
                            <Row k="R Result" v={<ColoredR value={trade.r} />} />
                            <RBreakdownRows trade={trade} />
                            <Row k="Outcome" v={<Pill tone={trade.outcome === "Win" ? "success" : "danger"}>{trade.outcome}</Pill>} />
                            <Row k="Mapping" v={<Pill tone={mappingQuality === "exact" ? "success" : mappingQuality === "nearest_prior" ? "warning" : "danger"}>{mappingQuality}</Pill>} />
                            <Row k="Reverse Conflict" v={trade.reverseConflict ? <Pill tone="warning">YES</Pill> : <span className="text-muted-lab">No</span>} />
                        </> : <span className="text-muted-lab">No trade details available.</span>}
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function VisualVerifier({ trade, status, selectedOB, selectedMarker, fillMap, exitMap, fillCandle, exitCandle, mappingQuality, displayTimeframe }) {
    if (!trade) {
        return <span className="text-muted-lab text-[11.5px]">No trade selected.</span>;
    }
    const statusWarning = ["filled", "protection_exit"].includes(status.key)
        ? null
        : "This trade is not treated as a normal filled trade for chart verification.";
    return (
        <div className="space-y-3 font-mono text-[11.5px]">
            <div className="flex flex-wrap items-center gap-2">
                <Pill tone={status.tone}>{status.label}</Pill>
                <Pill tone={mappingQuality === "exact" ? "success" : mappingQuality === "nearest_prior" ? "warning" : "danger"}>
                    Fill mapping: {mappingQuality || "missing"}
                </Pill>
                <span className="text-muted-lab">Compare with TradingView set to UTC using the same candle feed.</span>
            </div>
            {statusWarning && (
                <div className="flex items-center gap-2 text-[hsl(var(--warning))]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{statusWarning}</span>
                </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <VerifierBlock title="Mapping Diagnostics">
                    <VerifierRow k="Trade ID" v={displayTradeId(trade)} />
                    <VerifierRow k="Raw Trade ID" v={rawTradeId(trade)} />
                    <VerifierRow k="OB ID" v={displayObId(trade)} />
                    <VerifierRow k="Direction" v={trade.direction} />
                    <VerifierRow k="Fill Time (UTC)" v={formatUtc(trade.news_blackout_trigger_time || trade.entry)} />
                    <VerifierRow k="Exit Time (UTC)" v={formatUtc(trade.exit)} />
                    <VerifierRow k="Fill Candle Index (Execution TF)" v={formatIndex(trade.fill_candle_index)} />
                    <VerifierRow k="Exit Candle Index (Execution TF)" v={formatIndex(trade.exit_candle_index)} />
                    <VerifierRow k="Entry" v={formatNumber(trade.entryPrice)} />
                    <VerifierRow k="Stop" v={formatNumber(trade.stop)} />
                    <VerifierRow k="TP" v={formatNumber(trade.tp)} />
                    <VerifierRow k="Outcome" v={formatValue(trade.outcome)} />
                    <VerifierRow k="Session" v={formatValue(trade.session)} />
                    <VerifierRow k="Display Timeframe" v={displayTimeframe || "1m"} />
                    <VerifierRow k="Mapped Fill Index" v={formatIndex(selectedMarker?.i ?? fillMap.i)} />
                    <VerifierRow k="Mapped Exit Index" v={formatIndex(exitMap.i)} />
                    <VerifierRow k="Exit Mapping" v={exitMap.quality || "missing"} />
                    <VerifierRow k="Fill Candle Time (UTC)" v={formatUtc(fillCandle?.t || secondsToIso(fillCandle?.time))} />
                    <VerifierRow k="Exit Candle Time (UTC)" v={formatUtc(exitCandle?.t || secondsToIso(exitCandle?.time))} />
                </VerifierBlock>
                <VerifierBlock title="Raw Imported Fields">
                    <VerifierRow k="fill_time / entry" v={formatUtc(trade.entry)} />
                    <VerifierRow k="exit_time" v={formatUtc(trade.exit)} />
                    <VerifierRow k="pnl_r" v={formatValue(trade.r)} />
                    <RBreakdownRows trade={trade} verifier />
                    <VerifierRow k="missed_trade" v={formatBool(trade.missed_trade)} />
                    <VerifierRow k="missed_reason" v={formatValue(trade.missed_reason)} />
                    <VerifierRow k="news_blackout" v={formatBool(trade.news_blackout)} />
                    <VerifierRow k="news event" v={formatValue(trade.news_blackout_event)} />
                    <VerifierRow k="news event time UTC" v={formatUtc(trade.news_blackout_event_time)} />
                    <VerifierRow k="fill_candle_index" v={formatIndex(trade.fill_candle_index)} />
                    <VerifierRow k="exit_candle_index" v={formatIndex(trade.exit_candle_index)} />
                    <VerifierRow k="fill candle OHLC" v={formatOhlc(trade.fill_candle_open, trade.fill_candle_high, trade.fill_candle_low, trade.fill_candle_close)} />
                    <VerifierRow k="OB top / bottom" v={`${formatNumber(trade.obTop)} / ${formatNumber(trade.obBottom)}`} />
                </VerifierBlock>
            </div>
            <VerifierBlock title="Selected OB Geometry">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    <VerifierRow k="Chart OB ID" v={displayObId(selectedOB)} />
                    <VerifierRow k="OB Mapping" v={formatValue(selectedOB?.mappingQuality)} />
                    <VerifierRow k="OB Origin Time UTC" v={formatUtc(selectedOB?.originTime || trade.obOriginTime)} />
                    <VerifierRow k="OB Detection Time UTC" v={formatUtc(selectedOB?.endTime || trade.obDetectionTime)} />
                    <VerifierRow k="OB Display Right Edge UTC" v={formatUtc(selectedOB?.displayRightTime)} />
                    <VerifierRow k="OB Display Right Edge Source" v={formatValue(selectedOB?.displayRightSource)} />
                    <VerifierRow k="Python Final Status" v={formatValue(selectedOB?.obFinalStatus)} />
                    <VerifierRow k="Python Status Label" v={formatValue(selectedOB?.obFinalStatusLabel)} />
                    <VerifierRow k="Python Chart Right UTC" v={formatUtc(selectedOB?.chartRightTime)} />
                    <VerifierRow k="Python Chart Right Source" v={formatValue(selectedOB?.chartRightTimeSource)} />
                    <VerifierRow k="Lifecycle Reason" v={formatValue(selectedOB?.lifecycleReason)} />
                    <VerifierRow k="Detection-TF Origin Index" v={formatIndex(selectedOB?.originIndexRaw ?? trade.obOriginIndexRaw)} />
                    <VerifierRow k="Detection-TF Detection Index" v={formatIndex(selectedOB?.detectionIndexRaw ?? trade.obDetectionIndexRaw)} />
                    <VerifierRow k="Top" v={formatNumber(selectedOB?.top ?? trade.obTop)} />
                    <VerifierRow k="Bottom" v={formatNumber(selectedOB?.bot ?? trade.obBottom)} />
                </div>
            </VerifierBlock>
        </div>
    );
}

function VerifierBlock({ title, children }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-title-lab">{title}</div>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function VerifierRow({ k, v }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-lab">{k}</span>
            <span className="text-white text-right break-all">{v == null || v === "" ? "missing" : v}</span>
        </div>
    );
}

// Local InspectorUniverseBadge + InspectorBadgeCell removed in Phase 2F —
// replaced by the shared @/components/lab/TradeUniverseBadge component.

function VariantSelector({ variants, value }) {
    if (!variants?.length) return null;
    if (variants.length === 1) return <Pill tone="muted">{variantLabel(variants[0])}</Pill>;
    return (
        <NeonSelect
            testId="ti-variant"
            value={value || variants[0]}
            onChange={setSelectedTradeVariant}
            options={variants.map((v) => ({ value: v, label: variantLabel(v) }))}
        />
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

function hasOrderBlockData(trade) {
    return !!(trade?.obId || trade?.obOriginTime || trade?.obDetectionTime || trade?.obTop != null || trade?.obBottom != null || trade?.obWidthPips != null);
}

function displayTradeId(trade) {
    return formatEntityId("T", trade?.obId) || trade?.displayTradeId || trade?.id || "—";
}

function rawTradeId(trade) {
    return trade?.rawTradeId || trade?.id || "—";
}

function displayObId(tradeOrOb) {
    return formatEntityId("OB", tradeOrOb?.obId ?? tradeOrOb?.ob_id) || tradeOrOb?.displayObId || formatEntityId("OB", tradeOrOb?.id) || "—";
}

function tradeSearchText(trade) {
    return [
        trade?.displayTradeId,
        trade?.rawTradeId,
        trade?.id,
        trade?.displayObId,
        displayObId(trade),
        trade?.obId,
    ].filter(Boolean).join(" ").toLowerCase();
}

function formatEntityId(prefix, value) {
    if (value == null || value === "") return "";
    const match = String(value).match(/\d+/);
    return match ? `${prefix}-${String(Number(match[0])).padStart(3, "0")}` : String(value);
}

function formatValue(value) {
    return value == null || value === "" ? "N/A" : String(value);
}

function formatNumber(value) {
    return value == null || value === "" || !isFinite(Number(value)) ? "N/A" : String(value);
}

function formatSignedR(value) {
    const n = numericOrNull(value);
    if (n == null) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function formatCostR(value) {
    const n = numericOrNull(value);
    if (n == null || Math.abs(n) < 0.000001) return "—";
    return `${n > 0 ? "-" : ""}${Math.abs(n).toFixed(2)}R`;
}

function rCostBreakdown(trade) {
    const net = numericOrNull(trade?.netR ?? trade?.net_r ?? trade?.r);
    const gross = numericOrNull(trade?.grossR ?? trade?.gross_r);
    const spread = numericOrNull(trade?.spreadCostR ?? trade?.spread_cost_r) ?? 0;
    const slippage = numericOrNull(trade?.slippageCostR ?? trade?.slippage_cost_r) ?? 0;
    const commission = numericOrNull(trade?.commissionR ?? trade?.commission_r) ?? 0;
    const total = numericOrNull(trade?.totalCostR ?? trade?.total_cost_r) ?? (spread + slippage + commission);
    const show = net != null && (Math.abs(total) > 0.000001 || (gross != null && Math.abs(gross - net) > 0.000001));
    return {
        show,
        gross: gross ?? net,
        spread,
        slippage,
        commission,
        total,
        net,
    };
}

function RBreakdownRows({ trade, verifier = false }) {
    const breakdown = rCostBreakdown(trade);
    if (!breakdown.show) return null;
    const RowComponent = verifier ? VerifierRow : Row;
    return (
        <>
            <RowComponent k="Gross R" v={formatSignedR(breakdown.gross)} />
            <RowComponent k="Spread Cost" v={formatCostR(breakdown.spread)} />
            <RowComponent k="Slippage Cost" v={formatCostR(breakdown.slippage)} />
            <RowComponent k="Commission" v={formatCostR(breakdown.commission)} />
            <RowComponent k="Total Cost" v={formatCostR(breakdown.total)} />
            <RowComponent k="Net R" v={formatSignedR(breakdown.net)} />
        </>
    );
}

function Row({ k, v }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-lab">{k}</span>
            <span className="text-white text-right">{v}</span>
        </div>
    );
}

function DebugCell({ label, value }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] px-2 py-1">
            <span className="text-[hsl(var(--text-3))]">{label}: </span>
            <span className="text-[hsl(var(--text-1))] normal-case break-all">{value == null || value === "" ? "missing" : value}</span>
        </div>
    );
}

function normalizeTimestamp(value) {
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

function buildCandleIndex(candles) {
    const ordered = [];
    const byTime = new Map();
    (candles || []).forEach((c, i) => {
        const time = c.time ?? normalizeTimestamp(c.t);
        if (time == null) return;
        byTime.set(time, i);
        ordered.push({ time, i });
    });
    ordered.sort((a, b) => a.time - b.time);
    const gaps = [];
    for (let i = 1; i < ordered.length; i += 1) {
        const gap = ordered[i].time - ordered[i - 1].time;
        if (gap > 0) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3600;
    return { byTime, ordered, toleranceSec: Math.max(3600, Math.floor(medianGap * 1.5)) };
}

function medianCandleGapSec(candles) {
    const times = (candles || [])
        .map((c) => c.time ?? normalizeTimestamp(c.t))
        .filter((time) => time != null)
        .sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < times.length; i += 1) {
        const gap = times[i] - times[i - 1];
        if (gap > 0) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
}

function emptyMap() {
    return { i: -1, quality: "missing", time: null };
}

function mapTimeToCandle(time, idx) {
    const target = normalizeTimestamp(time);
    if (target == null || !idx?.ordered?.length) return emptyMap();
    if (idx.byTime.has(target)) {
        return { i: idx.byTime.get(target), quality: "exact", time: target };
    }
    let lo = 0;
    let hi = idx.ordered.length - 1;
    let best = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (idx.ordered[mid].time <= target) {
            best = idx.ordered[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (best && target - best.time <= idx.toleranceSec) {
        return { i: best.i, quality: "nearest_prior", time: best.time };
    }
    return emptyMap();
}

function resampleCandlesForDisplay(candles, timeframe) {
    const minutes = timeframe === "15m" ? 15 : timeframe === "5m" ? 5 : 1;
    if (minutes === 1) {
        return (candles || []).map((c, i) => {
            const time = c.time ?? normalizeTimestamp(c.t ?? c.timestamp ?? c.datetime);
            return { ...c, i: c.i ?? i, time };
        });
    }
    const bucketSec = minutes * 60;
    const buckets = new Map();
    (candles || []).forEach((c) => {
        const time = c.time ?? normalizeTimestamp(c.t);
        if (time == null) return;
        const bucketTime = Math.floor(time / bucketSec) * bucketSec;
        const existing = buckets.get(bucketTime);
        const volume = numericOrNull(c.v ?? c.volume);
        if (!existing) {
            buckets.set(bucketTime, {
                i: buckets.size,
                t: secondsToIso(bucketTime),
                time: bucketTime,
                o: Number(c.o),
                h: Number(c.h),
                l: Number(c.l),
                c: Number(c.c),
                v: volume ?? undefined,
                sourceStartTime: time,
                sourceEndTime: time,
            });
            return;
        }
        existing.h = Math.max(existing.h, Number(c.h));
        existing.l = Math.min(existing.l, Number(c.l));
        existing.c = Number(c.c);
        existing.sourceEndTime = time;
        if (volume != null || existing.v != null) existing.v = (existing.v || 0) + (volume || 0);
    });
    return [...buckets.values()].sort((a, b) => a.time - b.time).map((c, i) => ({ ...c, i }));
}

function findSelectedOrderBlock(trade, orderBlocks) {
    if (!trade) return null;
    const tradeKey = orderBlockKey(trade.obId);
    if (!tradeKey) return null;
    return (orderBlocks || []).find((ob) => {
        const keys = [ob.id, ob.obId].map(orderBlockKey).filter(Boolean);
        return keys.includes(tradeKey);
    }) || null;
}

function buildTradeOrderBlock(trade, candleIndex) {
    if (!trade || !isFinite(Number(trade.obTop)) || !isFinite(Number(trade.obBottom))) return null;
    const origin = mapTimeToCandle(trade.obOriginTime || trade.obOrigin, candleIndex);
    const detected = mapTimeToCandle(trade.obDetectionTime || trade.detected, candleIndex);
    const fill = mapTimeToCandle(trade.entry, candleIndex);
    const i0 = origin.i >= 0 ? origin.i : Math.max(0, (fill.i >= 0 ? fill.i : 0) - 24);
    const i1 = detected.i >= 0 ? detected.i : Math.max(i0 + 1, fill.i >= 0 ? fill.i : i0 + 18);
    const time0 = origin.time ?? candleIndex?.ordered?.find((c) => c.i === i0)?.time ?? null;
    const time1 = detected.time ?? candleIndex?.ordered?.find((c) => c.i === i1)?.time ?? null;
    return {
        id: trade.obId || "Selected OB",
        obId: trade.obId,
        displayObId: displayObId(trade),
        tradeId: displayTradeId(trade),
        displayTradeId: displayTradeId(trade),
        rawTradeId: rawTradeId(trade),
        originTime: trade.obOriginTime || trade.obOrigin,
        endTime: trade.obDetectionTime || trade.detected,
        originIndexRaw: trade.obOriginIndexRaw,
        detectionIndexRaw: trade.obDetectionIndexRaw,
        i0,
        i1,
        time0,
        time1,
        mappingQuality: origin.quality === "missing" || detected.quality === "missing"
            ? "missing"
            : (origin.quality === "nearest_prior" || detected.quality === "nearest_prior" ? "nearest_prior" : "exact"),
        top: Number(trade.obTop),
        bot: Number(trade.obBottom),
        side: String(trade.obDirection || trade.direction || "").toLowerCase().includes("bear") || trade.direction === "Short" ? "bear" : "bull",
        direction: trade.direction,
        outcome: trade.outcome,
        result: trade.result,
        status: trade.status,
        missed_reason: trade.missed_reason,
        missed_trade: trade.missed_trade,
        news_blackout: trade.news_blackout,
        reverseConflict: trade.reverseConflict,
        reverse_conflict: trade.reverse_conflict,
        ob_fully_breached: trade.ob_fully_breached,
        protection_exit: trade.protection_exit,
    };
}

function buildSelectedTradeDisplayOB(ob, trade, candleIndex) {
    if (!ob || !trade) return ob;
    const originTime = ob.originTime || trade.obOriginTime || trade.obOrigin;
    const right = selectObDisplayRightEdge(trade, ob);
    const origin = mapTimeToCandle(originTime, candleIndex);
    const rightMap = mapTimeToCandle(right.time, candleIndex);
    return {
        ...ob,
        tradeId: displayTradeId(trade),
        displayTradeId: displayTradeId(trade),
        rawTradeId: rawTradeId(trade),
        obId: trade.obId || ob.obId || ob.ob_id || ob.id,
        displayObId: displayObId(trade),
        originTime,
        endTime: ob.endTime || trade.obDetectionTime || trade.detected,
        displayRightTime: right.time,
        displayRightSource: right.source,
        i0: origin.i >= 0 ? origin.i : ob.i0,
        i1: rightMap.i >= 0 ? rightMap.i : ob.i1,
        time0: origin.time ?? normalizeTimestamp(originTime) ?? ob.time0,
        time1: rightMap.time ?? normalizeTimestamp(right.time) ?? ob.time1,
        mappingQuality: origin.quality === "missing" || rightMap.quality === "missing"
            ? "nearest_prior"
            : (origin.quality === "exact" && rightMap.quality === "exact" ? "exact" : "nearest_prior"),
        direction: trade.direction,
        outcome: trade.outcome,
        result: trade.result,
        status: trade.status,
        missed_reason: trade.missed_reason,
        missed_trade: trade.missed_trade,
        news_blackout: trade.news_blackout,
        reverseConflict: trade.reverseConflict,
        reverse_conflict: trade.reverse_conflict,
        ob_fully_breached: trade.ob_fully_breached,
        protection_exit: trade.protection_exit,
    };
}

function selectObDisplayRightEdge(trade, ob) {
    const lifecycleRight = deriveOBRightTime(trade, ob, null);
    if (normalizeTimestamp(lifecycleRight.rightTime) != null) {
        return { time: lifecycleRight.rightTime, source: lifecycleRight.rightTimeSource };
    }
    if (normalizeTimestamp(trade?.exit) != null) return { time: trade.exit, source: "exit_time" };
    if (normalizeTimestamp(trade?.entry) != null) return { time: trade.entry, source: "fill_time" };
    const detection = ob?.endTime || trade?.obDetectionTime || trade?.detected;
    if (normalizeTimestamp(detection) != null) return { time: detection, source: "detection_time" };
    return { time: null, source: "visible_window" };
}

function orderBlockKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim().toLowerCase();
    const numeric = text.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : text;
}

function getTradeStatus(trade) {
    if (!trade) return { key: "missing", label: "Missing", tone: "muted" };
    const outcome = String(trade.outcome || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const reason = String(trade.missed_reason || "").toLowerCase();
    if (trade.news_blackout === true || outcome === "NEWS_BLACKOUT" || reason === "news_blackout") {
        return { key: "news_blackout", label: "News Blackout", tone: "warning" };
    }
    if (outcome === "PROTECTION_EXIT" || trade.protection_exit === true || trade.protection_exit_reason) {
        return { key: "protection_exit", label: "Protection Exit", tone: "primary" };
    }
    if (reason.includes("cancel") || outcome.includes("CANCEL")) {
        return { key: "cancelled", label: "Cancelled", tone: "warning" };
    }
    if (reason.includes("unfilled") || outcome.includes("UNFILLED") || trade.entry_model_filled === false) {
        return { key: "unfilled", label: "Unfilled", tone: "muted" };
    }
    if (trade.missed_trade === true || reason) {
        return { key: "skipped", label: "Skipped", tone: "warning" };
    }
    return { key: "filled", label: "Filled", tone: trade.outcome === "Win" ? "success" : trade.outcome === "Loss" ? "danger" : "primary" };
}

function buildVerifierOverlay({ trade, status, selectedMarker, fillMap, exitMap, candles }) {
    if (!trade || !["filled", "protection_exit"].includes(status.key)) return null;
    const entry = numericOrNull(trade.entryPrice);
    const stop = numericOrNull(trade.stop);
    const tp = numericOrNull(trade.tp);
    if (entry == null || stop == null || tp == null) return null;
    const fillIndex = selectedMarker?.i >= 0 ? selectedMarker.i : fillMap.i;
    const fillTime = selectedMarker?.time ?? fillMap.time;
    if (fillIndex == null || fillIndex < 0) return null;
    const exitIndex = exitMap.i >= 0 ? exitMap.i : null;
    const projectedIndex = Math.min((candles || []).length - 1, fillIndex + 24);
    return {
        direction: trade.direction,
        entry,
        stop,
        tp,
        fillIndex,
        fillTime,
        exitIndex,
        exitTime: exitMap.time,
        projectedExitIndex: exitIndex == null ? projectedIndex : null,
        projectedExitTime: exitIndex == null ? candles?.[projectedIndex]?.time : null,
        projected: exitIndex == null,
    };
}

function numericOrNull(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

function secondsToIso(value) {
    return value != null && isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString() : "";
}

function formatUtc(value) {
    if (value == null || value === "") return "missing";
    const ts = normalizeTimestamp(value);
    if (ts == null) return String(value);
    return `${new Date(ts * 1000).toISOString().replace("T", " ").replace(".000Z", "Z")} UTC`;
}

function formatIndex(value) {
    return value != null && value !== "" && isFinite(Number(value)) && Number(value) >= 0 ? String(Number(value)) : "missing";
}

function formatBool(value) {
    if (value === true) return "true";
    if (value === false) return "false";
    return "missing";
}

function formatOhlc(o, h, l, c) {
    if ([o, h, l, c].every((value) => value == null || value === "")) return "missing";
    return `O ${formatNumber(o)} · H ${formatNumber(h)} · L ${formatNumber(l)} · C ${formatNumber(c)}`;
}
