import React from "react";

// Premium SVG-based mock candlestick chart, architected as a replaceable component.
// Future: swap internals for lightweight-charts; keep props API stable.
//
// Props:
//   candles: [{ i, t, o, h, l, c }]
//   obBoxes: [{ i0, i1, top, bot, side, id }]
//   trades:  [{ i, price, direction, win }]
//   tpSlLines: [{ i, tp, sl }]
//   height: pixels
//   selectedTradeId, onTradeClick
//
// Visual: dark grid + neon OB rectangles + TP/SL dashed lines + entry/exit markers.

export function CandleChart({
    candles = [],
    obBoxes = [],
    trades = [],
    tpSlLines = [],
    height = 460,
    showOB = true,
    showLongs = true,
    showShorts = true,
    showWins = true,
    showLosses = true,
    showBOSCHoCH = true,
    onTradeClick,
    selectedTradeId,
}) {
    if (!candles.length) return null;
    const padL = 24, padR = 64, padT = 18, padB = 32;
    const W = 1200, H = height;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const yMax = Math.max(...highs);
    const yMin = Math.min(...lows);
    const pad = (yMax - yMin) * 0.08;
    const pMax = yMax + pad;
    const pMin = yMin - pad;
    const range = pMax - pMin;

    const xFor = (i) => padL + (i / (candles.length - 1)) * innerW;
    const yFor = (p) => padT + ((pMax - p) / range) * innerH;
    const cWidth = Math.max(2, (innerW / candles.length) * 0.62);

    // Grid lines
    const yTicks = 6;
    const gridY = Array.from({ length: yTicks }).map((_, i) => {
        const v = pMax - (range * i) / (yTicks - 1);
        return { v, y: yFor(v) };
    });

    return (
        <div className="relative w-full" style={{ height }} data-testid="candle-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
                {/* Background */}
                <defs>
                    <linearGradient id="cc-bg" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"  stopColor="hsl(var(--panel-2))" />
                        <stop offset="100%" stopColor="hsl(var(--panel))" />
                    </linearGradient>
                    <pattern id="cc-grid" x="0" y="0" width="60" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 60 0 L 0 0 0 40" fill="none" stroke="hsl(var(--grid))" strokeWidth="0.5" />
                    </pattern>
                </defs>
                <rect x="0" y="0" width={W} height={H} fill="url(#cc-bg)" />
                <rect x={padL} y={padT} width={innerW} height={innerH} fill="url(#cc-grid)" opacity="0.55" />

                {/* Y-axis labels */}
                {gridY.map((g, i) => (
                    <g key={i}>
                        <line x1={padL} x2={W - padR} y1={g.y} y2={g.y} stroke="hsl(var(--grid))" strokeWidth="0.5" />
                        <text x={W - padR + 6} y={g.y + 3} fontSize="9" fill="hsl(var(--muted))" fontFamily="JetBrains Mono">
                            {g.v.toFixed(5)}
                        </text>
                    </g>
                ))}
                {/* X labels (every ~ 30 candles) */}
                {candles.filter((_, i) => i % 30 === 0).map((c) => (
                    <text key={c.i} x={xFor(c.i)} y={H - 10} fontSize="9" fill="hsl(var(--muted))" textAnchor="middle" fontFamily="JetBrains Mono">
                        {c.t.slice(5)}
                    </text>
                ))}

                {/* OB rectangles */}
                {showOB && obBoxes.map((b) => {
                    const x0 = xFor(b.i0);
                    const x1 = xFor(b.i1);
                    const y0 = yFor(b.top);
                    const y1 = yFor(b.bot);
                    const fill = b.side === "bull"
                        ? "hsl(var(--accent-primary) / 0.13)"
                        : "hsl(var(--accent-secondary) / 0.13)";
                    const stroke = b.side === "bull"
                        ? "hsl(var(--accent-primary))"
                        : "hsl(var(--accent-secondary))";
                    return (
                        <g key={b.id}>
                            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={fill} stroke={stroke} strokeWidth="1" strokeDasharray="2 2" />
                            {/* extension line to the right */}
                            <line x1={x1} x2={W - padR} y1={(y0 + y1) / 2} y2={(y0 + y1) / 2} stroke={stroke} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.6" />
                            <text x={x0 + 4} y={y0 + 11} fontSize="8.5" fill={stroke} fontFamily="JetBrains Mono" opacity="0.85">
                                {b.id}
                            </text>
                        </g>
                    );
                })}

                {/* Candles */}
                {candles.map((c) => {
                    const up = c.c >= c.o;
                    const x = xFor(c.i);
                    const color = up ? "hsl(var(--bull))" : "hsl(var(--bear))";
                    const yH = yFor(c.h);
                    const yL = yFor(c.l);
                    const yO = yFor(c.o);
                    const yC = yFor(c.c);
                    const yT = Math.min(yO, yC);
                    const bH = Math.max(1, Math.abs(yC - yO));
                    return (
                        <g key={c.i}>
                            <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
                            <rect x={x - cWidth / 2} y={yT} width={cWidth} height={bH} fill={color} opacity={up ? 0.9 : 0.85} />
                        </g>
                    );
                })}

                {/* TP/SL lines */}
                {tpSlLines.map((l, idx) => (
                    <g key={idx}>
                        <line x1={xFor(l.i)} x2={W - padR} y1={yFor(l.tp)} y2={yFor(l.tp)} stroke="hsl(var(--success))" strokeDasharray="4 3" strokeWidth="1" />
                        <text x={W - padR - 2} y={yFor(l.tp) - 3} textAnchor="end" fontSize="9" fontFamily="JetBrains Mono" fill="hsl(var(--success))">TP {l.tp.toFixed(5)}</text>
                        <line x1={xFor(l.i)} x2={W - padR} y1={yFor(l.sl)} y2={yFor(l.sl)} stroke="hsl(var(--danger))" strokeDasharray="4 3" strokeWidth="1" />
                        <text x={W - padR - 2} y={yFor(l.sl) - 3} textAnchor="end" fontSize="9" fontFamily="JetBrains Mono" fill="hsl(var(--danger))">SL {l.sl.toFixed(5)}</text>
                    </g>
                ))}

                {/* Trade markers */}
                {trades
                    .filter((t) => (t.direction === "Long" ? showLongs : showShorts))
                    .filter((t) => (t.win ? showWins : showLosses))
                    .map((t, idx) => {
                        const x = xFor(t.i);
                        const y = yFor(t.price);
                        const isSel = selectedTradeId && t.id === selectedTradeId;
                        const color = t.win ? "hsl(var(--success))" : "hsl(var(--danger))";
                        const up = t.direction === "Long";
                        const points = up
                            ? `${x},${y - 8} ${x - 5},${y + 1} ${x + 5},${y + 1}`
                            : `${x},${y + 8} ${x - 5},${y - 1} ${x + 5},${y - 1}`;
                        return (
                            <g key={idx} onClick={() => onTradeClick && onTradeClick(t)} style={{ cursor: onTradeClick ? "pointer" : undefined }}>
                                <polygon points={points} fill={color} opacity={isSel ? 1 : 0.95} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                                {isSel && <circle cx={x} cy={y} r="9" fill="none" stroke={color} strokeWidth="1" opacity="0.7" />}
                            </g>
                        );
                    })}

                {/* Header strip indicators */}
                {showBOSCHoCH && (
                    <text x={padL + 6} y={padT + 12} fontSize="9" fontFamily="JetBrains Mono" fill="hsl(var(--muted))">
                        BOS · CHoCH overlay enabled
                    </text>
                )}
            </svg>
        </div>
    );
}
