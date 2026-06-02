import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from "recharts";
import { isFiniteNumber, num } from "../analytics/entryFormatters";
import { useLocalStorageState } from "../shared/useEntryWorkspace";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

const METRICS = [
    { key: "expectancy", label: "Expectancy", color: "hsl(var(--accent-primary))",   fmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(3)}R` },
    { key: "winRate",    label: "Win Rate",   color: "hsl(var(--accent-secondary))", fmt: v => `${v.toFixed(1)}%` },
    { key: "netR",       label: "Net R",      color: "hsl(var(--success))",          fmt: v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R` },
];

const CustomTooltip = ({ active, payload, label, metricKey }) => {
    if (!active || !payload?.length) return null;
    const m = METRICS.find(m => m.key === metricKey);
    return (
        <div className="clip-bevel-sm bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] p-2 text-[10px] font-ui">
            <div className="text-muted-lab mb-1">Trades {label}–{Number(label) + (payload[0]?.payload?.window || 20)}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color }}>
                    {p.name}: {m ? m.fmt(p.value) : p.value?.toFixed(3)}
                </div>
            ))}
        </div>
    );
};

export function RollingMetricsPanel({ rollingData, modelLabel, window: windowSize = 20 }) {
    const [metricKey, setMetricKey] = useLocalStorageState("fxob_entries_workspace_rolling_metric_v1", "expectancy");

    const hasData = Array.isArray(rollingData) && rollingData.length > 1;
    const metric  = METRICS.find(m => m.key === metricKey) || METRICS[0];

    // Overall average for reference line
    const avg = hasData
        ? rollingData.reduce((s, d) => s + (isFiniteNumber(d[metricKey]) ? num(d[metricKey]) : 0), 0) / rollingData.length
        : 0;

    return (
        <NeonPanel title="Rolling Metrics" className="xl:col-span-2"
            action={
                hasData
                    ? <Pill tone="secondary">{windowSize}-TRADE WINDOW</Pill>
                    : <Pill tone="warning">NO TRADE DATA</Pill>
            }
        >
            <p className="mb-3 text-[10.5px] font-ui text-muted-lab">
                {modelLabel ? <><span className="text-white">{modelLabel}</span> · </> : ""}
                Rolling {windowSize}-trade {metric.label.toLowerCase()} over time. A stable, positive plateau confirms robustness.
                Wide swings signal fragility.
            </p>

            {/* Metric selector */}
            <div className="flex items-center gap-2 mb-3">
                {METRICS.map(m => (
                    <button key={m.key} type="button"
                        onClick={() => setMetricKey(m.key)}
                        className={cn(
                            "px-2 py-0.5 text-[9.5px] font-ui border rounded-[1px] transition-colors",
                            metricKey === m.key
                                ? "text-white border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.5)]"
                                : "text-muted-lab border-[hsl(var(--border-soft)/0.4)] hover:text-white"
                        )}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {hasData ? (
                <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={rollingData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-soft)/0.3)" />
                        <XAxis dataKey="i" tick={{ fontSize: 9, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false}
                            label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 9, fill: "hsl(var(--text-2))" }}
                        />
                        <YAxis tick={{ fontSize: 9, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false}
                            tickFormatter={v => metric.fmt(v)}
                        />
                        <ReferenceLine y={0}   stroke="hsl(var(--border-mid))"          strokeDasharray="2 2" />
                        <ReferenceLine y={avg}  stroke={metric.color}                    strokeDasharray="4 2" opacity={0.4}
                            label={{ value: "avg", fontSize: 8, fill: metric.color, position: "insideTopRight" }}
                        />
                        <Tooltip content={<CustomTooltip metricKey={metricKey} />} />
                        <Line type="monotone" dataKey={metricKey} stroke={metric.color} strokeWidth={1.5} dot={false} name={metric.label} />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="py-8 text-center text-[10.5px] font-ui text-muted-lab">
                    Requires per-model entry trade exports (trades_*__entry_*.csv). Summary entry results are loaded, but trade-level model lists are missing.
                </div>
            )}
        </NeonPanel>
    );
}
