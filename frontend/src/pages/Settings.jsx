import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Field, NeonInput, NeonToggle, NeonButton, Segment } from "@/components/lab/controls";
import { useTheme, THEMES } from "@/context/ThemeContext";
import { ImportZone } from "@/components/lab/ImportZone";
import { Pill } from "@/components/lab/DataTable";
import { Check, ShieldAlert, Sparkles } from "lucide-react";

export default function Settings() {
    const { theme, setTheme } = useTheme();
    const [dense, setDense] = useState(true);
    const [glow, setGlow] = useState(70);
    const [markerSize, setMarkerSize] = useState(6);
    const [tableDensity, setTableDensity] = useState("Compact");
    const [paths, setPaths] = useState({
        runs: "outputs/runs",
        sweeps: "outputs/sweeps",
        candles: "data/candles",
        tradingview: "data/tradingview",
    });

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="SETTINGS"
                title="Workspace Configuration"
                subtitle="Theme, data paths, symbol metadata, display preferences."
            />

            <div className="px-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Theme">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {THEMES.map((t) => {
                            const active = theme === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTheme(t.id)}
                                    data-testid={`theme-card-${t.id}`}
                                    className={`text-left clip-bevel p-[1px] transition-all ${
                                        active
                                            ? "bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]"
                                            : "bg-gradient-to-br from-[hsl(var(--border-mid))] to-[hsl(var(--border-soft))] hover:from-[hsl(var(--accent-primary))] hover:to-[hsl(var(--accent-secondary))]"
                                    }`}
                                >
                                    <div className="clip-bevel bg-[hsl(var(--panel))] p-3 relative overflow-hidden">
                                        <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                                        <div className="relative flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.swatch[0], boxShadow: `0 0 8px ${t.swatch[0]}` }} />
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.swatch[1], boxShadow: `0 0 8px ${t.swatch[1]}` }} />
                                            {active && <Check className="w-3.5 h-3.5 text-white ml-auto" />}
                                        </div>
                                        <div className="relative mt-3 font-display text-[13px] text-white">{t.name}</div>
                                        <div className="relative text-[10px] font-mono uppercase tracking-wider text-muted-lab mt-0.5">accent · {t.id}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </NeonPanel>

                <NeonPanel title="Display">
                    <div className="space-y-3">
                        <Row label="Dense Mode" checked={dense} onChange={setDense} />
                        <Field label={`Glow Intensity (${glow}%)`}>
                            <input type="range" min="0" max="100" value={glow} onChange={(e) => setGlow(Number(e.target.value))} className="accent-[hsl(var(--accent-primary))]" />
                        </Field>
                        <Field label={`Chart Marker Size (${markerSize}px)`}>
                            <input type="range" min="3" max="12" value={markerSize} onChange={(e) => setMarkerSize(Number(e.target.value))} className="accent-[hsl(var(--accent-primary))]" />
                        </Field>
                        <Field label="Table Density">
                            <Segment options={["Compact", "Comfortable", "Spacious"]} value={tableDensity} onChange={setTableDensity} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Data Sources · Import" action={<Pill tone="primary">FILE API</Pill>}>
                    <ImportZone />
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Data Paths">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(paths).map(([k, v]) => (
                            <Field key={k} label={k}>
                                <NeonInput value={v} onChange={(e) => setPaths((p) => ({ ...p, [k]: e.target.value }))} />
                            </Field>
                        ))}
                    </div>
                </NeonPanel>

                <NeonPanel title="Symbol Metadata">
                    <div className="space-y-2 font-mono text-[11.5px]">
                        <Meta k="EURUSD · pip size" v="0.00010" />
                        <Meta k="EURUSD · tick size" v="0.00001" />
                        <Meta k="GBPUSD · pip size" v="0.00010" />
                        <Meta k="USDJPY · pip size" v="0.01000" />
                        <Meta k="XAUUSD · pip size" v="0.10000" />
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Research Safety Notes" tone="secondary">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Note icon={ShieldAlert} title="Research Only" body="This workspace is for backtest analysis. It does not connect to brokers, place orders, or run live strategies." />
                        <Note icon={ShieldAlert} title="No Live Trading" body="Live execution belongs to a separate trading dashboard outside this product. There are no kill switches or live controls here." />
                        <Note icon={Sparkles}    title="Pine Parity First" body="Always verify new Python engine logic against TradingView/Pine exports before trusting it in further sweeps or Monte Carlo runs." />
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Row({ label, checked, onChange }) {
    return (
        <div className="flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2">
            <span className="text-[11.5px] font-mono uppercase tracking-wider text-[hsl(var(--text-2))]">{label}</span>
            <NeonToggle checked={checked} onChange={onChange} />
        </div>
    );
}
function Meta({ k, v }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-lab text-[10px] uppercase tracking-wider">{k}</span>
            <span className="text-white">{v}</span>
        </div>
    );
}
function Note({ icon: Icon, title, body }) {
    return (
        <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-3">
            <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">{title}</span>
            </div>
            <p className="text-[11.5px] text-[hsl(var(--text-2))] mt-2 leading-relaxed">{body}</p>
        </div>
    );
}
