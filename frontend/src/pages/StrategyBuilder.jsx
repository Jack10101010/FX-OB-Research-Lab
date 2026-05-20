import React, { useState } from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import { Field, NeonInput, NeonSelect, Segment, NeonToggle, NeonButton } from "@/components/lab/controls";
import { Play, Save, FileInput, Copy, ShieldAlert, Trash2, Check } from "lucide-react";
import { usePresets } from "@/data/presets";
import { Pill } from "@/components/lab/DataTable";

export default function StrategyBuilder() {
    const [cfg, setCfg] = useState({
        symbol: "EURUSD",
        detectionTf: "M15",
        executionTf: "1m",
        dateFrom: "2025-05-18",
        dateTo: "2026-05-18",
        dataFile: "data/candles/EURUSD_M15.csv",
        swing: 7,
        obFilter: "ATR",
        structure: "Both",
        direction: "Both",
        rr: 3.3,
        entryBuffer: 0.0,
        stopBuffer: 1.0,
        verifyTicks: 0,
        executionMode: "single_position",
        conflict: "Block Opposite",
        cancelAction: "Kill OB",
        sessionFilter: true,
        london: true, lull: false, newYork: true, asia: false, outside: false,
        originSession: "Any",
        detectionSession: "Any",
        newsBlackout: false,
        spread: 0.2,
        slippage: 0.2,
        commission: 0,
        monteCarlo: false,
    });
    const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));

    // ── Preset manager (localStorage: fxob_configs) ─────────────────
    const { presets, save, remove, duplicate, load, names } = usePresets();
    const [selectedPreset, setSelectedPreset] = useState("");
    const [presetName, setPresetName] = useState("");
    const [flash, setFlash] = useState("");
    const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 1800); };

    const onSave = () => {
        const name = (presetName || selectedPreset || `${cfg.symbol}_${cfg.detectionTf}_RR${cfg.rr}`).trim();
        if (!name) return;
        save(name, cfg);
        setSelectedPreset(name);
        setPresetName("");
        showFlash(`Saved · ${name}`);
    };
    const onLoad = () => {
        if (!selectedPreset) return;
        const p = load(selectedPreset);
        if (!p) return;
        const { _savedAt, ...rest } = p;
        setCfg((c) => ({ ...c, ...rest }));
        showFlash(`Loaded · ${selectedPreset}`);
    };
    const onDup = () => {
        if (!selectedPreset) return;
        const newName = duplicate(selectedPreset);
        if (newName) { setSelectedPreset(newName); showFlash(`Duplicated → ${newName}`); }
    };
    const onDelete = () => {
        if (!selectedPreset) return;
        remove(selectedPreset);
        showFlash(`Deleted · ${selectedPreset}`);
        setSelectedPreset("");
    };

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="STRATEGY BUILDER"
                title="Create New Backtest"
                subtitle="Configure research parameters. This builder writes config only — execution happens against local Python engine."
                actions={
                    <>
                        <NeonButton icon={Play} tone="primary" data-testid="builder-run-backtest">Run Backtest</NeonButton>
                    </>
                }
            />

            {/* Preset manager bar */}
            <div className="px-6 mb-4">
                <div className="clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--accent-primary)/0.4)] via-[hsl(var(--border-mid))] to-[hsl(var(--accent-secondary)/0.4)]">
                    <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">Config Presets</div>
                        <NeonSelect
                            testId="preset-select"
                            value={selectedPreset}
                            onChange={setSelectedPreset}
                            options={[{ value: "", label: names.length ? "— select preset —" : "— no presets saved —" }, ...names.map((n) => ({ value: n, label: n }))]}
                            className="min-w-[220px]"
                        />
                        <NeonInput
                            data-testid="preset-name"
                            placeholder="New preset name…"
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            className="min-w-[200px]"
                        />
                        <NeonButton icon={Save}      tone="primary"   onClick={onSave}                                data-testid="preset-save">Save</NeonButton>
                        <NeonButton icon={FileInput} tone="secondary" onClick={onLoad}   disabled={!selectedPreset}    data-testid="preset-load">Load</NeonButton>
                        <NeonButton icon={Copy}      tone="ghost"     onClick={onDup}    disabled={!selectedPreset}    data-testid="preset-duplicate">Duplicate</NeonButton>
                        <NeonButton icon={Trash2}    tone="danger"    onClick={onDelete} disabled={!selectedPreset}    data-testid="preset-delete">Delete</NeonButton>
                        <Pill tone="muted">{names.length} saved</Pill>
                        {flash && (
                            <span className="inline-flex items-center gap-1.5 ml-auto px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider clip-bevel-sm border border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]" data-testid="preset-flash">
                                <Check className="w-3.5 h-3.5" /> {flash}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <NeonPanel title="Basic Settings">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Symbol">
                            <NeonSelect testId="bld-symbol" value={cfg.symbol} onChange={set("symbol")} options={["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"]} />
                        </Field>
                        <Field label="Detection TF">
                            <NeonSelect value={cfg.detectionTf} onChange={set("detectionTf")} options={["M5", "M15", "M30", "H1", "H4"]} />
                        </Field>
                        <Field label="Execution TF">
                            <NeonSelect value={cfg.executionTf} onChange={set("executionTf")} options={["1m", "5m"]} />
                        </Field>
                        <Field label="Date From">
                            <NeonInput type="date" value={cfg.dateFrom} onChange={(e) => set("dateFrom")(e.target.value)} />
                        </Field>
                        <Field label="Date To">
                            <NeonInput type="date" value={cfg.dateTo} onChange={(e) => set("dateTo")(e.target.value)} />
                        </Field>
                        <Field label="Data Source File" className="col-span-2">
                            <NeonInput value={cfg.dataFile} onChange={(e) => set("dataFile")(e.target.value)} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel title="Structure Settings">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Swing Length">
                            <NeonInput type="number" min="2" max="30" value={cfg.swing} onChange={(e) => set("swing")(Number(e.target.value))} />
                        </Field>
                        <Field label="OB Filter">
                            <NeonSelect value={cfg.obFilter} onChange={set("obFilter")} options={[{ value: "ATR", label: "ATR" }, { value: "CMR", label: "Cumulative Mean Range" }]} />
                        </Field>
                        <Field label="Structure Type" className="col-span-2">
                            <Segment options={["BOS", "CHoCH", "Both"]} value={cfg.structure} onChange={set("structure")} />
                        </Field>
                        <Field label="Trade Direction" className="col-span-2">
                            <Segment options={["Long", "Short", "Both"]} value={cfg.direction} onChange={set("direction")} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel title="Execution Settings">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="RR Multiple">
                            <NeonInput data-testid="bld-rr" type="number" step="0.1" value={cfg.rr} onChange={(e) => set("rr")(Number(e.target.value))} />
                        </Field>
                        <Field label="Entry Buffer (pips)">
                            <NeonInput type="number" step="0.1" value={cfg.entryBuffer} onChange={(e) => set("entryBuffer")(Number(e.target.value))} />
                        </Field>
                        <Field label="Stop Buffer (pips)">
                            <NeonInput type="number" step="0.1" value={cfg.stopBuffer} onChange={(e) => set("stopBuffer")(Number(e.target.value))} />
                        </Field>
                        <Field label="Verify Limit (ticks)">
                            <NeonInput type="number" value={cfg.verifyTicks} onChange={(e) => set("verifyTicks")(Number(e.target.value))} />
                        </Field>
                        <Field label="Execution Mode" className="col-span-2">
                            <Segment
                                options={[
                                    { value: "single_position", label: "Single" },
                                    { value: "allow_multi_position", label: "Multi" },
                                    { value: "one_per_direction", label: "One/Dir" },
                                ]}
                                value={cfg.executionMode}
                                onChange={set("executionMode")}
                            />
                        </Field>
                        <Field label="Position Conflict" className="col-span-2">
                            <Segment options={["Block Opposite", "Allow Auto Reversal"]} value={cfg.conflict} onChange={set("conflict")} />
                        </Field>
                        <Field label="If Cancelled by Conflict" className="col-span-2">
                            <Segment options={["Kill OB", "Allow Resume", "Kill If Touched"]} value={cfg.cancelAction} onChange={set("cancelAction")} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel title="Filters" className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <SectionTitle>Session Filtering</SectionTitle>
                        <NeonToggle checked={cfg.sessionFilter} onChange={set("sessionFilter")} label="Enabled" testId="bld-session-toggle" />
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {[
                            ["london", "London"], ["lull", "London Lull"], ["newYork", "New York"], ["asia", "Asia"], ["outside", "Outside"],
                        ].map(([k, label]) => (
                            <button
                                key={k}
                                onClick={() => set(k)(!cfg[k])}
                                className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-colors ${
                                    cfg[k]
                                        ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                                        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="OB Origin Session">
                            <NeonSelect value={cfg.originSession} onChange={set("originSession")} options={["Any", "London", "London Lull", "New York", "Asia"]} />
                        </Field>
                        <Field label="OB Detection Session">
                            <NeonSelect value={cfg.detectionSession} onChange={set("detectionSession")} options={["Any", "London", "London Lull", "New York", "Asia"]} />
                        </Field>
                        <div className="col-span-2 flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                            <div>
                                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-lab">News Blackout</div>
                                <div className="text-[10.5px] text-muted-lab">Placeholder · feed not connected</div>
                            </div>
                            <NeonToggle checked={cfg.newsBlackout} onChange={set("newsBlackout")} />
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel title="Advanced">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Spread (pips)"><NeonInput type="number" step="0.05" value={cfg.spread} onChange={(e) => set("spread")(Number(e.target.value))} /></Field>
                        <Field label="Slippage (pips)"><NeonInput type="number" step="0.05" value={cfg.slippage} onChange={(e) => set("slippage")(Number(e.target.value))} /></Field>
                        <Field label="Commission" className="col-span-2"><NeonInput type="number" step="0.01" value={cfg.commission} onChange={(e) => set("commission")(Number(e.target.value))} /></Field>
                        <div className="col-span-2 flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                            <div>
                                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-lab">Monte Carlo</div>
                                <div className="text-[10.5px] text-muted-lab">Robustness simulation (placeholder)</div>
                            </div>
                            <NeonToggle checked={cfg.monteCarlo} onChange={set("monteCarlo")} />
                        </div>
                    </div>
                </NeonPanel>
            </div>

            <div className="mx-6 mt-4 flex items-center gap-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">Research only · this builder does NOT place orders</span>
            </div>
        </div>
    );
}
