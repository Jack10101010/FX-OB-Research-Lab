import React, { useEffect, useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { buildAllModelCurves, mergeEquityCurves, buildDrawdownSeries } from "../analytics/equityCurveAnalytics";
import { useLocalStorageState } from "../shared/useEntryWorkspace";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

const MODEL_COLORS = [
    "hsl(var(--accent-secondary))",
    "hsl(var(--accent-primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--danger))",
    "#a78bfa",
    "#34d399",
];

export function EquityCurvePanel({ exactRows, tradesByMode, activeVariant }) {
    const curves = useMemo(
        () => buildAllModelCurves(exactRows, tradesByMode, activeVariant),
        [exactRows, tradesByMode, activeVariant],
    );
    const [selectedModes, setSelectedModes] = useLocalStorageState("fxob_entries_workspace_equity_selected_models_v1", []);
    const [chartMode, setChartMode] = useLocalStorageState("fxob_entries_workspace_chart_toggles_v1", { equityMode: "equity" });
    const showDD = chartMode?.equityMode === "drawdown";

    useEffect(() => {
        if (!curves.length) return;
        const curveModes = curves.map(c => c.mode);
        const selectedList = Array.isArray(selectedModes) ? selectedModes : [];
        const valid = selectedList.filter(mode => curveModes.includes(mode));
        if (!valid.length) setSelectedModes(curveModes);
        else if (valid.length !== selectedList.length) setSelectedModes(valid);
    }, [curves, selectedModes, setSelectedModes]);

    const selected = useMemo(() => new Set(Array.isArray(selectedModes) ? selectedModes : []), [selectedModes]);

    const toggleModel = (mode) => {
        setSelectedModes(prev => {
            const next = new Set(Array.isArray(prev) ? prev : []);
            next.has(mode) ? next.delete(mode) : next.add(mode);
            return [...next];
        });
    };

    const visibleCurves = curves.filter(c => selected.has(c.mode));
    const chartCurves = useMemo(() => {
        if (!showDD) return visibleCurves;
        return visibleCurves.map(curve => ({
            ...curve,
            points: buildDrawdownSeries(curve.points).map(point => ({
                ...point,
                netR: point.drawdown,
            })),
        }));
    }, [visibleCurves, showDD]);
    const merged = useMemo(() => mergeEquityCurves(chartCurves), [chartCurves]);

    if (!curves.length) {
        return (
            <NeonPanel title="Equity Curve Comparison" className="xl:col-span-3" action={<Pill tone="warning">AWAITING PER-TRADE DATA</Pill>}>
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    Requires per-model entry trade exports (<span className="text-[hsl(var(--accent-secondary))]">trades_*__entry_*.csv</span>).
                    Summary entry results are loaded, but trade-level model lists are missing.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            title="Equity Curve Comparison"
            className="xl:col-span-3"
            action={
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setChartMode(prev => ({ ...prev, equityMode: showDD ? "equity" : "drawdown" }))}
                        className={cn("px-2.5 py-1 text-[9.5px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors",
                            showDD ? "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.08)]"
                                   : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white")}
                    >
                        {showDD ? "Equity" : "Drawdown"}
                    </button>
                    <Pill tone="secondary">{visibleCurves.length} MODELS</Pill>
                </div>
            }
        >
            {/* Model toggles */}
            <div className="flex flex-wrap gap-2 mb-4">
                {curves.map((c, i) => (
                    <button
                        key={c.mode}
                        type="button"
                        onClick={() => toggleModel(c.mode)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 clip-bevel-sm border text-[10px] font-ui uppercase tracking-wider transition-colors",
                            selected.has(c.mode)
                                ? "border-transparent text-white"
                                : "border-[hsl(var(--border-soft))] text-muted-lab opacity-50",
                        )}
                        style={selected.has(c.mode) ? {
                            borderColor: MODEL_COLORS[i % MODEL_COLORS.length].replace(")", "/0.5)"),
                            background: MODEL_COLORS[i % MODEL_COLORS.length].replace(")", "/0.12)"),
                            color: MODEL_COLORS[i % MODEL_COLORS.length],
                        } : undefined}
                    >
                        <span className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        {c.label}
                    </button>
                ))}
            </div>

            <ResponsiveContainer width="100%" height={320}>
                <LineChart data={merged} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-soft)/0.3)" />
                    <XAxis dataKey="i" tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false} tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}R`} />
                    <Tooltip
                        contentStyle={{ background: "hsl(var(--panel))", border: "1px solid hsl(var(--border-soft))", borderRadius: 0, fontSize: 11, fontFamily: CHART_NUM_FONT }}
                        formatter={(v, name) => [`${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`, name]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="4 2" />
                    {visibleCurves.map((c, i) => (
                        <Line
                            key={c.mode}
                            type="monotone"
                            dataKey={c.mode}
                            name={c.label}
                            stroke={MODEL_COLORS[curves.indexOf(c) % MODEL_COLORS.length]}
                            strokeWidth={c.isBaseline ? 2.5 : 1.5}
                            dot={false}
                            strokeDasharray={c.isBaseline ? undefined : "0"}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </NeonPanel>
    );
}
