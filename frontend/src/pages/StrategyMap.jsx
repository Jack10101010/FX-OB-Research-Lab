import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Field, NeonSelect, Segment, NeonToggle, NeonButton } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { CandleChart } from "@/components/lab/CandleChart";
import { useDataset } from "@/data/store";
import { Camera, Settings as SettingsIcon, BarChart3, Layers, ZoomIn, ZoomOut, Move, MousePointer2, Ruler, PenLine } from "lucide-react";

export default function StrategyMap() {
    const { CANDLES, OB_BOXES, TRADE_MARKERS, RUNS } = useDataset();
    const [tf, setTf] = useState("M15");
    const [zoom, setZoom] = useState("ALL");
    const [showOB, setShowOB] = useState(true);
    const [showLongs, setShowLongs] = useState(true);
    const [showShorts, setShowShorts] = useState(true);
    const [showWins, setShowWins] = useState(true);
    const [showLosses, setShowLosses] = useState(true);
    const [showBC, setShowBC] = useState(true);
    const [runId, setRunId] = useState(RUNS[0].id);

    const tools = [MousePointer2, Move, ZoomIn, ZoomOut, Ruler, PenLine, Layers, Camera];

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="STRATEGY MAP · FULL CHART"
                title="EURUSD · M15 · RR 3.3"
                subtitle="Visual map of all detected order blocks, entries, exits, and trade outcomes for the selected run."
                actions={<><NeonButton icon={Camera} tone="ghost">Export PNG</NeonButton><NeonButton icon={SettingsIcon} tone="ghost">Display</NeonButton></>}
            />

            <div className="px-6 grid grid-cols-1 xl:grid-cols-[60px_1fr] gap-3">
                {/* Left toolbar (visual placeholder) */}
                <div className="hidden xl:flex flex-col items-center gap-1 border border-[hsl(var(--border-soft))] py-2 bg-[hsl(var(--panel)/0.5)] backdrop-blur clip-bevel-sm">
                    {tools.map((T, i) => (
                        <button key={i} className={`w-9 h-9 grid place-items-center rounded-sm hover:bg-[hsl(var(--accent-primary)/0.12)] ${i === 0 ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-2))]"}`}>
                            <T className="w-4 h-4" />
                        </button>
                    ))}
                </div>

                <NeonPanel
                    title="Full Chart View"
                    action={
                        <div className="flex items-center gap-2 flex-wrap">
                            <NeonSelect testId="map-symbol" value="EURUSD" onChange={() => {}} options={["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]} />
                            <NeonSelect value={tf} onChange={setTf} options={["M5", "M15", "M30", "H1"]} />
                            <NeonSelect value={runId} onChange={setRunId} options={RUNS.slice(0, 10).map((r) => r.id)} />
                            <Pill tone="muted">2025-05-18 → 2026-05-18</Pill>
                        </div>
                    }
                >
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                        <Toggle label="Order Blocks" checked={showOB} onChange={setShowOB} dot="primary" />
                        <Toggle label="Long Entries" checked={showLongs} onChange={setShowLongs} dot="success" />
                        <Toggle label="Short Entries" checked={showShorts} onChange={setShowShorts} dot="danger" />
                        <Toggle label="Wins" checked={showWins} onChange={setShowWins} dot="success" />
                        <Toggle label="Losses" checked={showLosses} onChange={setShowLosses} dot="danger" />
                        <Toggle label="BOS / CHoCH" checked={showBC} onChange={setShowBC} dot="secondary" />
                    </div>
                    <CandleChart
                        candles={CANDLES}
                        obBoxes={OB_BOXES}
                        trades={TRADE_MARKERS}
                        showOB={showOB}
                        showLongs={showLongs}
                        showShorts={showShorts}
                        showWins={showWins}
                        showLosses={showLosses}
                        showBOSCHoCH={showBC}
                    />
                    {/* Bottom timeframe ribbon */}
                    <div className="mt-2 flex items-center justify-between border-t border-[hsl(var(--border-soft))] pt-2">
                        <Segment options={["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "ALL"]} value={zoom} onChange={setZoom} />
                        <div className="font-mono text-[10.5px] text-muted-lab uppercase tracking-wider">
                            {OB_BOXES.length} OBs · {TRADE_MARKERS.length} trades · {CANDLES.length} candles
                        </div>
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Toggle({ label, checked, onChange, dot }) {
    const dotColor = { primary: "hsl(var(--accent-primary))", secondary: "hsl(var(--accent-secondary))", success: "hsl(var(--success))", danger: "hsl(var(--danger))" }[dot];
    return (
        <button
            onClick={() => onChange(!checked)}
            className={`inline-flex items-center gap-2 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider clip-bevel-sm border transition-colors ${
                checked ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--panel-2))] text-white" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] opacity-60"
            }`}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
            {label}
        </button>
    );
}
