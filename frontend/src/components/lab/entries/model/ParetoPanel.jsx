import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ZAxis,
} from "recharts";
import { isFiniteNumber, num } from "../analytics/entryFormatters";

const MODEL_COLORS = [
    "hsl(var(--accent-secondary))",
    "hsl(var(--accent-primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--danger))",
    "#a78bfa", "#34d399",
];

export function ParetoPanel({ exactRows }) {
    const data = exactRows
        .filter(r => r.exact && isFiniteNumber(r.fillPct) && isFiniteNumber(r.expectancy))
        .map((r, i) => ({
            mode:    r.mode,
            label:   r.label,
            fillPct: num(r.fillPct),
            expectancy: num(r.expectancy),
            netR:    num(r.netR),
            isBaseline: r.isBaseline,
            color:   r.isBaseline ? "hsl(var(--accent-secondary))" : MODEL_COLORS[(i + 1) % MODEL_COLORS.length],
        }));

    if (data.length < 2) {
        return (
            <NeonPanel title="Pareto Frontier" className="xl:col-span-1"
                action={<Pill tone="warning">NEED ≥2 MODELS</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-mono text-muted-lab">Import model results to plot the Pareto frontier.</div>
            </NeonPanel>
        );
    }

    const CustomTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const d = payload[0]?.payload;
        return (
            <div className="clip-bevel-sm bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] p-2 text-[10px] font-mono">
                <div className="text-white font-semibold">{d.label}</div>
                <div className="text-[hsl(var(--text-2))] mt-1">Fill %: {d.fillPct.toFixed(1)}%</div>
                <div className="text-[hsl(var(--text-2))]">Exp: {d.expectancy >= 0 ? "+" : ""}{d.expectancy.toFixed(3)}R</div>
                <div className="text-[hsl(var(--text-2))]">Net R: {d.netR >= 0 ? "+" : ""}{d.netR.toFixed(1)}R</div>
            </div>
        );
    };

    return (
        <NeonPanel title="Pareto Frontier" className="xl:col-span-1"
            action={<Pill tone="secondary">Fill Rate × Expectancy</Pill>}
        >
            <p className="mb-2 text-[10px] font-mono text-muted-lab">X = fill rate, Y = expectancy. Bubble size = |Net R|. Top-right dominates.</p>
            <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-soft)/0.3)" />
                    <XAxis type="number" dataKey="fillPct"    name="Fill %" domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: "monospace" }} tickLine={false}
                        label={{ value: "Fill %", position: "insideBottom", offset: -2, fontSize: 9, fill: "hsl(var(--text-2))" }}
                    />
                    <YAxis type="number" dataKey="expectancy" name="Expectancy"
                        tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: "monospace" }} tickLine={false}
                        tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
                    />
                    <ZAxis type="number" dataKey="netR" range={[40, 300]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Scatter data={data} shape="circle">
                        {data.map((d, i) => (
                            <Cell key={d.mode} fill={d.color} fillOpacity={0.8} stroke={d.color} strokeWidth={d.isBaseline ? 2 : 1} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2">
                {data.map(d => (
                    <div key={d.mode} className="flex items-center gap-1 text-[9.5px] font-mono text-[hsl(var(--text-2))]">
                        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        {d.label}
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}
