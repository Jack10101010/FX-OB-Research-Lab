// ── ArchetypeRadarPanel.jsx ──────────────────────────────────────────────────
// Phase 3: Fingerprint radar chart per failure archetype.
// 5-axis Recharts RadarChart: Severity, R Magnitude, Session Concentration,
// Direction Skew, Frequency. One chart per archetype with ≥1 trade.

import React, { useMemo, useState } from "react";
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip,
} from "recharts";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { archetypeColour, archetypeLabel, sampleConfidence } from "../shared/failuresRegistry";
import { buildArchetypeRadarData } from "../shared/failuresAnalytics";
import { safeLabel, confidenceTone } from "../shared/failuresFormatters";

// ── Tooltip ───────────────────────────────────────────────────────────────────

const TT_STYLE = {
    background: "hsl(var(--panel-2))",
    border: "1px solid hsl(var(--border-soft))",
    borderRadius: 2,
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 10,
    padding: "6px 10px",
};

function RadarTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    const data  = entry?.payload;
    if (!data) return null;

    // Find the rawValue for the hovered axis
    const radarData = payload[0]?.payload;
    return (
        <div style={TT_STYLE}>
            <div className="text-white font-semibold">{radarData?.axis}</div>
            <div className="text-muted-lab">Score: {radarData?.value?.toFixed(0)}</div>
        </div>
    );
}

// ── Single archetype radar card ───────────────────────────────────────────────

function RadarCard({ data, total }) {
    const { archetypeId, count, axes } = data;
    const colour = archetypeColour(archetypeId);
    const label  = archetypeLabel(archetypeId);
    const conf   = sampleConfidence(count);
    const pct    = total > 0 ? ((count / total) * 100).toFixed(0) : "0";

    // RadarChart needs data in { axis, value } format
    const chartData = axes.map(a => ({ axis: a.axis, value: a.value }));

    return (
        <div className="clip-bevel p-[1px]" style={{ background: `linear-gradient(135deg, ${colour}25, hsl(var(--border-soft)))` }}>
            <div className="clip-bevel bg-[hsl(var(--panel))] p-3 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="text-[9px] font-mono text-muted-lab uppercase tracking-wider">Fingerprint</div>
                        <div className="font-display font-semibold text-[12px] leading-snug" style={{ color: colour }}>
                            {label}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-display text-[20px] font-semibold text-white leading-none">{count}</div>
                        <div className="text-[9px] font-mono text-muted-lab">{pct}%</div>
                    </div>
                </div>

                <Pill tone={confidenceTone(conf)} className="text-[8px]">{safeLabel(conf)}</Pill>

                {/* Radar chart */}
                <ResponsiveContainer width="100%" height={160}>
                    <RadarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <PolarGrid
                            stroke="hsl(var(--grid))"
                            strokeDasharray="2 3"
                        />
                        <PolarAngleAxis
                            dataKey="axis"
                            tick={{
                                fill: "hsl(var(--muted))",
                                fontSize: 8.5,
                                fontFamily: "JetBrains Mono, monospace",
                            }}
                        />
                        <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tick={false}
                            axisLine={false}
                        />
                        <Tooltip content={<RadarTooltip />} />
                        <Radar
                            dataKey="value"
                            stroke={colour}
                            fill={colour}
                            fillOpacity={0.18}
                            strokeWidth={1.5}
                            isAnimationActive={false}
                        />
                    </RadarChart>
                </ResponsiveContainer>

                {/* Axis summary */}
                <div className="space-y-0.5">
                    {axes.map(a => (
                        <div key={a.axis} className="flex items-center gap-2 text-[9px] font-mono">
                            <span className="text-muted-lab w-24 shrink-0">{a.axis}</span>
                            <div className="flex-1 h-1 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full"
                                    style={{ width: `${a.value}%`, background: colour }}
                                />
                            </div>
                            <span className="text-[hsl(var(--text-2))] tabular-nums w-8 text-right">{a.rawValue}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function ArchetypeRadarPanel({ losers = [], allLosers = [] }) {
    const source = losers.length ? losers : allLosers;

    const radarData = useMemo(
        () => buildArchetypeRadarData(source),
        [source],
    );

    // Only show archetypes that have trades
    const populated = radarData.filter(d => d.count > 0);

    if (populated.length === 0) return null;

    return (
        <NeonPanel title="Archetype Fingerprints" tone="secondary">
            <div className="p-4">
                <p className="text-[10px] font-mono text-[hsl(var(--text-2))] mb-4 leading-relaxed">
                    Radar fingerprint per archetype across five dimensions: severity score, R magnitude,
                    session concentration, directional skew, and frequency. All axes normalised 0–100.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {populated.map(d => (
                        <RadarCard key={d.archetypeId} data={d} total={source.length} />
                    ))}
                </div>
            </div>
        </NeonPanel>
    );
}
