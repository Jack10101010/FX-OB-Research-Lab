// ── StreakDotStrip.jsx ───────────────────────────────────────────────────────
// Phase 3: Compact SVG W/L trade sequence dot strip.
// Shows the full trade history as a row of coloured dots.
// Wins: small primary dot. Losses: larger dot, coloured by archetype, height varies with streak depth.
// Tooltip on hover shows trade details.

import React, { useMemo, useState, useRef } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { archetypeColour, archetypeLabel } from "../shared/failuresRegistry";
import { buildTradeDotStrip } from "../shared/failuresAnalytics";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

// ── Constants ─────────────────────────────────────────────────────────────────

const STRIP_H    = 48;   // SVG height
const DOT_BASE_Y = 36;   // baseline Y for wins
const WIN_R      = 2.5;
const LOSS_BASE_R = 4;
const WIN_COLOR   = "hsl(var(--accent-primary) / 0.55)";
const MAX_STREAK_LIFT = 20; // px a loss dot rises at streak depth 5+

function liftY(streakDepth) {
    // Lift loss dots up as streak depth increases (deeper = higher)
    return Math.min(MAX_STREAK_LIFT, (streakDepth - 1) * 4);
}

function lossR(streakDepth) {
    return LOSS_BASE_R + Math.min(3, (streakDepth - 1) * 0.7);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function DotTooltip({ dot, x, y, containerRef }) {
    if (!dot) return null;
    const style = {
        position: "absolute",
        left: Math.min(x, (containerRef.current?.clientWidth ?? 600) - 160),
        top: Math.max(0, y - 72),
        pointerEvents: "none",
        zIndex: 20,
        background: "hsl(var(--panel-2))",
        border: "1px solid hsl(var(--accent-primary) / 0.3)",
        borderRadius: 2,
        padding: "6px 10px",
        fontFamily: CHART_NUM_FONT,
        fontSize: 10,
        minWidth: 140,
        whiteSpace: "nowrap",
    };

    const archColour = archetypeColour(dot.archetype);

    return (
        <div style={style}>
            <div className="text-[10px] text-muted-lab">Trade #{dot.i + 1}</div>
            <div className={`text-[13px] font-semibold ${dot.isLoss ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--accent-primary))]"}`}>
                {dot.r >= 0 ? "+" : ""}{dot.r}R
            </div>
            {dot.isLoss && (
                <>
                    <div className="text-[9.5px] mt-0.5" style={{ color: archColour }}>
                        {archetypeLabel(dot.archetype)}
                    </div>
                    {dot.streakDepth > 1 && (
                        <div className="text-[9px] text-[hsl(var(--warning))]">
                            Streak #{dot.streakDepth}
                        </div>
                    )}
                </>
            )}
            {dot.session && (
                <div className="text-[9px] text-muted-lab mt-0.5">{dot.session} · {dot.direction}</div>
            )}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreakDotStrip({ allTrades = [] }) {
    const [hoveredDot, setHoveredDot] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);

    const dots = useMemo(() => buildTradeDotStrip(allTrades), [allTrades]);

    if (!dots.length) return null;

    const n     = dots.length;
    const PAD   = 8;
    const W     = Math.max(400, n * 7 + PAD * 2);
    const spacing = Math.max(4, Math.min(12, (W - PAD * 2) / n));
    const svgW  = n * spacing + PAD * 2;

    // Streak zones: contiguous loss runs ≥ 2
    const zones = [];
    let zoneStart = null;
    for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (d.streakDepth === 1) zoneStart = i;
        if (d.streakDepth >= 2 && zoneStart == null) zoneStart = i - 1;
        if (!dots[i + 1] || dots[i + 1]?.streakDepth === 0) {
            if (zoneStart != null && d.streakDepth > 0) {
                if (i - zoneStart >= 1) {
                    zones.push({ from: zoneStart, to: i });
                }
                zoneStart = null;
            }
        }
    }

    return (
        <NeonPanel title="Trade Sequence Strip">
            <div ref={containerRef} className="relative px-4 pb-4 pt-3 overflow-x-auto">
                <p className="text-[9.5px] font-ui text-muted-lab mb-2">
                    {n} trades chronologically. Loss dots rise and grow with streak depth. Hover for details.
                </p>

                <svg
                    width="100%"
                    viewBox={`0 0 ${svgW} ${STRIP_H}`}
                    style={{ minWidth: svgW, display: "block", overflow: "visible" }}
                >
                    {/* Baseline rule */}
                    <line
                        x1={PAD} y1={DOT_BASE_Y}
                        x2={svgW - PAD} y2={DOT_BASE_Y}
                        stroke="hsl(var(--border-soft))"
                        strokeWidth={0.5}
                    />

                    {/* Streak zone highlight bands */}
                    {zones.map((z, zi) => {
                        const x1 = PAD + z.from * spacing - spacing * 0.4;
                        const x2 = PAD + z.to   * spacing + spacing * 0.4;
                        return (
                            <rect
                                key={zi}
                                x={x1}
                                y={0}
                                width={x2 - x1}
                                height={STRIP_H}
                                fill="hsl(var(--danger) / 0.06)"
                                rx={2}
                            />
                        );
                    })}

                    {/* Dots */}
                    {dots.map(dot => {
                        const cx = PAD + dot.i * spacing;
                        const cy = dot.isLoss
                            ? DOT_BASE_Y - liftY(dot.streakDepth) - lossR(dot.streakDepth)
                            : DOT_BASE_Y - WIN_R;
                        const r  = dot.isLoss ? lossR(dot.streakDepth) : WIN_R;
                        const fill = dot.isLoss ? archetypeColour(dot.archetype) : WIN_COLOR;

                        return (
                            <circle
                                key={dot.i}
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill={fill}
                                opacity={dot.isLoss ? 0.88 : 0.5}
                                stroke={dot.isLoss ? "hsl(var(--bg) / 0.5)" : "none"}
                                strokeWidth={0.5}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={e => {
                                    setHoveredDot(dot);
                                    const rect = containerRef.current?.getBoundingClientRect();
                                    const svgRect = e.currentTarget.closest("svg")?.getBoundingClientRect();
                                    if (rect && svgRect) {
                                        setTooltipPos({
                                            x: e.clientX - rect.left,
                                            y: e.clientY - rect.top,
                                        });
                                    }
                                }}
                                onMouseLeave={() => setHoveredDot(null)}
                            />
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full opacity-55" style={{ background: WIN_COLOR }} />
                        <span className="text-[9px] font-ui text-muted-lab">Win</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--danger) / 0.7)" }} />
                        <span className="text-[9px] font-ui text-muted-lab">Loss (archetype-coloured)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-4 rounded-sm opacity-10" style={{ background: "hsl(var(--danger))" }} />
                        <span className="text-[9px] font-ui text-muted-lab">Streak zone</span>
                    </div>
                </div>

                {/* Tooltip */}
                {hoveredDot && (
                    <DotTooltip dot={hoveredDot} x={tooltipPos.x} y={tooltipPos.y} containerRef={containerRef} />
                )}
            </div>
        </NeonPanel>
    );
}
