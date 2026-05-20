import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill, ColoredR } from "@/components/lab/DataTable";
import { Segment, NeonInput, NeonSelect, Field } from "@/components/lab/controls";
import { CandleChart } from "@/components/lab/CandleChart";
import { useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import { Search, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function TradeInspector() {
    const { CANDLES, TRADES, OB_BOXES, TRADE_MARKERS, activeRunId, getRunData, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS } = useDataset();
    const bundle = activeRunId ? getRunData(activeRunId) : null;
    const hasCandles = bundle ? bundle.hasCandles !== false && !!bundle.candles?.length : true;
    const [q, setQ] = useState("");
    const [outcome, setOutcome] = useState("All");
    const [direction, setDirection] = useState("All");
    const [structure, setStructure] = useState("All");
    const [selectedId, setSelectedId] = useState(TRADES[0]?.id);

    useEffect(() => {
        if (!TRADES.some((t) => t.id === selectedId)) {
            setSelectedId(TRADES[0]?.id || null);
        }
    }, [TRADES, selectedId]);

    const filtered = useMemo(() => TRADES.filter((t) => {
        if (q && !t.id.toLowerCase().includes(q.toLowerCase())) return false;
        if (outcome !== "All" && t.outcome !== outcome) return false;
        if (direction !== "All" && t.direction !== direction) return false;
        if (structure !== "All" && t.structure !== structure) return false;
        return true;
    }), [q, outcome, direction, structure, TRADES]);

    const trade = TRADES.find((t) => t.id === selectedId) || TRADES[0] || null;
    const selectedMarker = trade ? TRADE_MARKERS.find((m) => m.id === trade.id) : null;
    const hasMappedMarker = hasCandles && selectedMarker?.i >= 0 && selectedMarker.mappingQuality !== "missing";

    // Prefer mapped imported trade location; fall back to legacy mock positioning.
    const candleWindow = Math.max(1, CANDLES.length - 80);
    const center = hasMappedMarker ? selectedMarker.i : (trade ? ((trade.num * 2) % candleWindow) + Math.min(40, CANDLES.length) : 0);
    const sliceStart = Math.max(0, center - 40);
    const sliceEnd = Math.min(CANDLES.length, center + 40);
    const rawSlice = CANDLES.slice(sliceStart, sliceEnd);
    const slice = hasMappedMarker ? rawSlice : rawSlice.map((c, i) => ({ ...c, i }));
    const chartTrades = trade
        ? (hasMappedMarker
            ? [{ ...selectedMarker, price: selectedMarker.price || trade.entryPrice }]
            : [{ i: 44, price: trade.entryPrice, direction: trade.direction, win: trade.outcome === "Win", id: trade.id }])
        : [];
    const chartOBs = hasMappedMarker
        ? OB_BOXES.filter((b) => {
            if (b.time0 != null && b.time1 != null && slice[0]?.time != null && slice[slice.length - 1]?.time != null) {
                return b.time1 >= slice[0].time && b.time0 <= slice[slice.length - 1].time;
            }
            return b.i1 >= sliceStart && b.i0 <= sliceEnd;
        })
        : [];

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="TRADE INSPECTOR"
                title={trade ? `${trade.id} · ${trade.direction}` : "No trades"}
                subtitle={trade ? `${trade.structure} · ${trade.session} · OB width ${trade.obWidth} pips` : "Selected variant has no imported trades."}
                actions={<VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />}
            />

            {!hasCandles && (
                <div className="px-6 mb-3">
                    <div className="flex items-center gap-2 px-3 py-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm" data-testid="ti-no-candles-banner">
                        <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                            Trade sequence view · no candle data imported
                        </span>
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
                                        <span className="text-white">#{String(t.num).padStart(3, "0")} {t.direction}</span>
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
                    title={trade ? <>#{String(trade.num).padStart(3, "0")} <span className="text-[hsl(var(--accent-primary))] ml-1">{trade.direction}</span></> : "No Trade Selected"}
                    action={trade ? <Pill tone={trade.outcome === "Win" ? "success" : "danger"}>{trade.outcome} · {trade.r >= 0 ? "+" : ""}{trade.r}R</Pill> : null}
                >
                    <CandleChart
                        candles={slice}
                        obBoxes={chartOBs}
                        trades={chartTrades}
                        tpSlLines={trade ? [{ i: 44, tp: trade.tp, sl: trade.stop }] : []}
                        selectedTradeId={trade?.id}
                        height={400}
                    />
                    <Tabs defaultValue="overview" className="mt-3">
                        <TabsList className="bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))]">
                            <TabsTrigger value="overview" data-testid="ti-tab-overview">Overview</TabsTrigger>
                            <TabsTrigger value="ob">Order Block</TabsTrigger>
                            <TabsTrigger value="exec">Execution</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>
                        <TabsContent value="overview" className="text-[11.5px] font-mono text-muted-lab pt-3 leading-relaxed">
                            {trade ? `Trade ${trade.id} captured a ${trade.direction.toLowerCase()} order block after a ${trade.structure} confirmation in the ${trade.session} session. Entry on retest; exit on TP/SL touch within 1m execution timeframe.` : "No trade selected for this variant."}
                        </TabsContent>
                        <TabsContent value="ob" className="text-[11.5px] font-mono pt-3">
                            {trade ? <>
                                <Row k="OB ID" v="OB-042" />
                                <Row k="Origin" v={trade.obOrigin} />
                                <Row k="Detected" v={trade.detected} />
                                <Row k="OB Width" v={`${trade.obWidth} pips`} />
                                <Row k="Side" v={trade.direction === "Long" ? "Bullish" : "Bearish"} />
                            </> : <span className="text-muted-lab">No order block details.</span>}
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
                        <TabsContent value="notes" className="text-[11.5px] text-muted-lab pt-3">No notes recorded.</TabsContent>
                    </Tabs>
                </NeonPanel>

                {/* RIGHT: details */}
                <NeonPanel title="Trade Details" dense>
                    <div className="space-y-1 font-mono text-[11.5px]">
                        {trade ? <>
                            <Row k="Direction" v={trade.direction} />
                            <Row k="Structure" v={trade.structure} />
                            <Row k="Session" v={trade.session} />
                            <Row k="OB Origin" v={trade.obOrigin} />
                            <Row k="Detected" v={trade.detected} />
                            <Row k="Entry Time" v={trade.entry} />
                            <Row k="Exit Time" v={trade.exit} />
                            <div className="divider-glow my-2" />
                            <Row k="Entry Price" v={trade.entryPrice} />
                            <Row k="Stop Loss" v={trade.stop} />
                            <Row k="Take Profit" v={trade.tp} />
                            <Row k="OB Width" v={`${trade.obWidth} pips`} />
                            <div className="divider-glow my-2" />
                            <Row k="R Result" v={<ColoredR value={trade.r} />} />
                            <Row k="Outcome" v={<Pill tone={trade.outcome === "Win" ? "success" : "danger"}>{trade.outcome}</Pill>} />
                            <Row k="Reverse Conflict" v={trade.reverseConflict ? <Pill tone="warning">YES</Pill> : <span className="text-muted-lab">No</span>} />
                        </> : <span className="text-muted-lab">No trade details available.</span>}
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

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

function Row({ k, v }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-lab">{k}</span>
            <span className="text-white text-right">{v}</span>
        </div>
    );
}
