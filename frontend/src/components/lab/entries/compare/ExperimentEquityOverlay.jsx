import React, { useEffect, useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { getRunDisplayName } from "@/data/store";
import { num, isFiniteNumber } from "../analytics/entryFormatters";
import { SLOT_COLORS, SLOT_LABELS } from "./RunSelectorBar";
import { useLocalStorageState } from "../shared/useEntryWorkspace";

function buildRunCurve(run, activeVariant, mode) {
    const tradesByMode = run?.entryResults?.tradesByMode || run?.entryResults?.trades_by_mode;
    if (!tradesByMode) return null;

    const modeKey = mode
        ? String(mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
        : null;

    let trades = null;
    if (modeKey) {
        trades = tradesByMode[`${activeVariant}__${modeKey}`] || tradesByMode[modeKey] || null;
    } else {
        // baseline: aggregate all trades or use first available key
        const keys = Object.keys(tradesByMode);
        const baseKey = keys.find(k => k.includes("baseline") || k.includes("edge")) || keys[0];
        trades = baseKey ? tradesByMode[baseKey] : null;
    }

    if (!Array.isArray(trades) || !trades.length) return null;

    let cumR = 0;
    return trades.map((t, i) => {
        const r = isFiniteNumber(t.r) ? num(t.r) : isFiniteNumber(t.R) ? num(t.R) : 0;
        cumR += r;
        return { i, cumR: parseFloat(cumR.toFixed(2)) };
    });
}

function mergeRunCurves(curves) {
    // align by index (trade number)
    const lengths = curves.filter(Boolean).map(c => c?.length || 0);
    const maxLen = lengths.length ? Math.max(...lengths) : 0;
    if (!maxLen) return [];
    return Array.from({ length: maxLen }, (_, i) => {
        const point = { i };
        curves.forEach((curve, ci) => {
            if (curve && i < curve.length) {
                point[`run_${ci}`] = curve[i].cumR;
            }
        });
        return point;
    });
}

const CustomTooltip = ({ active, payload, label, selectedRuns }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="clip-bevel-sm bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] p-2 text-[10px] font-mono min-w-[120px]">
            <div className="text-muted-lab mb-1">Trade #{label}</div>
            {payload.map((p, i) => (
                <div key={i} className="flex justify-between gap-3" style={{ color: p.color }}>
                    <span>{p.name}</span>
                    <span>{p.value >= 0 ? "+" : ""}{p.value?.toFixed(2)}R</span>
                </div>
            ))}
        </div>
    );
};

export function ExperimentEquityOverlay({ selectedRuns, activeVariant }) {
    const [mode, setMode] = useLocalStorageState("fxob_entries_workspace_compare_equity_mode_v1", null); // null = baseline

    // Collect available modes from first run
    const availableModes = useMemo(() => {
        const first = selectedRuns[0];
        const tradesByMode = first?.entryResults?.tradesByMode || first?.entryResults?.trades_by_mode;
        if (!tradesByMode) return [];
        return Object.keys(tradesByMode)
            .map(k => k.replace(`${activeVariant}__`, "").replace(/_/g, " "))
            .filter(k => k);
    }, [selectedRuns, activeVariant]);

    useEffect(() => {
        if (mode && !availableModes.includes(mode)) setMode(null);
    }, [availableModes, mode, setMode]);

    const curves = useMemo(() => {
        return selectedRuns.map(run => buildRunCurve(run, activeVariant, mode));
    }, [selectedRuns, activeVariant, mode]);

    const merged = useMemo(() => mergeRunCurves(curves), [curves]);

    if (selectedRuns.length < 2) {
        return (
            <NeonPanel title="Equity Overlay (Cross-Run)" className="xl:col-span-3"
                action={<Pill tone="warning">SELECT ≥2 RUNS</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-mono text-muted-lab">
                    Select runs above to overlay equity curves.
                </div>
            </NeonPanel>
        );
    }

    const hasData = merged.length > 0;

    return (
        <NeonPanel title="Equity Overlay (Cross-Run)" className="xl:col-span-3"
            action={<Pill tone={hasData ? "success" : "warning"}>{hasData ? `${merged.length} TRADES` : "NO TRADE DATA"}</Pill>}
        >
            <p className="mb-3 text-[10px] font-mono text-muted-lab">
                Compare how the same model performs across different runs / date ranges.
                {!hasData && " Requires per-model entry trade exports (trades_*__entry_*.csv). Summary entry results may be loaded, but trade-level model lists are missing."}
            </p>

            {/* Mode selector */}
            {availableModes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">Model:</span>
                    {[null, ...availableModes.slice(0, 8)].map((m, i) => (
                        <button key={i} type="button"
                            onClick={() => setMode(m)}
                            className={cn(
                                "px-2 py-0.5 text-[9.5px] font-mono border rounded-[1px] transition-colors",
                                mode === m
                                    ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.1)] text-white"
                                    : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"
                            )}
                        >
                            {m || "baseline"}
                        </button>
                    ))}
                </div>
            )}

            {hasData ? (
                <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={merged} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-soft)/0.3)" />
                        <XAxis dataKey="i" tick={{ fontSize: 9, fill: "hsl(var(--text-2))", fontFamily: "monospace" }} tickLine={false} label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 9, fill: "hsl(var(--text-2))" }} />
                        <YAxis tick={{ fontSize: 9, fill: "hsl(var(--text-2))", fontFamily: "monospace" }} tickLine={false} tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}R`} />
                        <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 2" />
                        <Tooltip content={<CustomTooltip selectedRuns={selectedRuns} />} />
                        {selectedRuns.map((run, i) => (
                            <Line key={run.id}
                                type="monotone"
                                dataKey={`run_${i}`}
                                name={`${SLOT_LABELS[i]}: ${getRunDisplayName(run)}`}
                                stroke={SLOT_COLORS[i]}
                                strokeWidth={1.5}
                                dot={false}
                                connectNulls
                            />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }} />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="py-8 text-center text-[10.5px] font-mono text-[hsl(var(--warning))]">
                    Requires per-model entry trade exports (trades_*__entry_*.csv). Summary entry results are loaded when available, but trade-level model lists are missing.
                </div>
            )}
        </NeonPanel>
    );
}
