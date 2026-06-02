import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { isFiniteNumber, num } from "../analytics/entryFormatters";
import { PROFILE_KEYS } from "../analytics/entryRegistry";
import { CHART_NUM_FONT, CHART_UI_FONT } from "@/lib/chartStyles";

export function SensitivityPanel({ exactRows }) {
    // V2: use metricsProfile from registry row — not a mode string check.
    // Includes legacy fallback for rows pre-dating V2 registry fields.
    const penetrationRows = exactRows.filter(r =>
        r.exact &&
        (r.metricsProfile === PROFILE_KEYS.PENETRATION ||
            (!r.metricsProfile && String(r.mode).startsWith("entry_penetration"))) &&
        isFiniteNumber(r.netR)
    );
    const baseline = exactRows.find(r => r.isBaseline);

    if (penetrationRows.length < 2) {
        return (
            <NeonPanel title="Entry Sensitivity Curve" className="xl:col-span-2"
                action={<Pill tone="warning">NEED ≥2 PENETRATION MODELS</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    Import penetration model results to build the sensitivity curve.
                </div>
            </NeonPanel>
        );
    }

    const data = [
        baseline ? { label: "Edge", pct: 0, netR: num(baseline.netR), fillPct: num(baseline.fillPct), expectancy: num(baseline.expectancy) } : null,
        ...penetrationRows.map(r => {
            const pctMatch = String(r.threshold || r.mode).match(/[\d.]+/);
            const pct = pctMatch ? parseFloat(pctMatch[0]) : null;
            return pct != null ? { label: r.threshold, pct, netR: num(r.netR), fillPct: num(r.fillPct), expectancy: num(r.expectancy) } : null;
        }).filter(Boolean),
    ].filter(Boolean).sort((a, b) => a.pct - b.pct);

    return (
        <NeonPanel title="Entry Sensitivity Curve" className="xl:col-span-2"
            action={<Pill tone="success">{penetrationRows.length} POINTS</Pill>}
        >
            <p className="mb-3 text-[10.5px] font-ui text-muted-lab">Penetration threshold vs. Net R and Fill Rate. Stable plateau = robust threshold. Pick where the curve flattens.</p>
            <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-soft)/0.3)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false} tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}R`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--text-2))", fontFamily: CHART_NUM_FONT }} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                    <Tooltip
                        contentStyle={{ background: "hsl(var(--panel))", border: "1px solid hsl(var(--border-soft))", borderRadius: 0, fontSize: 11, fontFamily: CHART_NUM_FONT }}
                    />
                    <ReferenceLine yAxisId="left" y={baseline ? num(baseline.netR) : 0} stroke="hsl(var(--accent-secondary))" strokeDasharray="4 2" label={{ value: "Baseline", fontSize: 9, fill: "hsl(var(--accent-secondary))" }} />
                    <Line yAxisId="left"  type="monotone" dataKey="netR"     name="Net R"     stroke="hsl(var(--accent-primary))"   strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--accent-primary))" }} />
                    <Line yAxisId="right" type="monotone" dataKey="fillPct"  name="Fill %"    stroke="hsl(var(--accent-secondary))" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" />
                    <Line yAxisId="left"  type="monotone" dataKey="expectancy" name="Exp"     stroke="hsl(var(--success))"          strokeWidth={1.5} dot={{ r: 3 }} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: CHART_UI_FONT }} />
                </LineChart>
            </ResponsiveContainer>
        </NeonPanel>
    );
}
