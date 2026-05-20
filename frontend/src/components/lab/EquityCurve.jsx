import React from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

export function EquityCurve({ data, height = 280, color = "primary", showAxis = true, secondary }) {
    const stroke = color === "secondary" ? "hsl(var(--accent-secondary))" : "hsl(var(--accent-primary))";
    const gradId = `eq-${color}`;
    return (
        <div style={{ width: "100%", height }} data-testid="equity-curve">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                        {secondary && (
                            <linearGradient id="eq-b" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--accent-secondary))" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="hsl(var(--accent-secondary))" stopOpacity={0} />
                            </linearGradient>
                        )}
                    </defs>
                    <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} interval={Math.floor(data.length / 8)} hide={!showAxis} />
                    <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} hide={!showAxis} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--panel-2))",
                            border: "1px solid hsl(var(--accent-primary) / 0.4)",
                            borderRadius: 2,
                            fontFamily: "JetBrains Mono",
                            fontSize: 11,
                        }}
                        labelStyle={{ color: "hsl(var(--muted))" }}
                        formatter={(v) => [`${Number(v).toFixed(2)}R`, "Net R"]}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--border-mid))" strokeDasharray="2 3" />
                    <Area type="monotone" dataKey="netR" stroke={stroke} strokeWidth={1.8} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
                    {secondary && (
                        <Area type="monotone" dataKey="netRB" stroke="hsl(var(--accent-secondary))" strokeWidth={1.6} fill="url(#eq-b)" dot={false} isAnimationActive={false} />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function MiniLine({ data, dataKey = "v", color }) {
    const c = color || "hsl(var(--accent-primary))";
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                <Line type="monotone" dataKey={dataKey} stroke={c} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}
