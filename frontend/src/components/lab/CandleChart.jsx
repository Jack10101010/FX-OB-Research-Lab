import React, { useEffect, useRef, useLayoutEffect, useState } from "react";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";

// CandleChart — backed by lightweight-charts v4.
// Public prop API is intentionally identical to the prior SVG implementation:
//
//   candles      [{ i, t, o, h, l, c }]            (t = "YYYY-MM-DD"; i is monotonic)
//   obBoxes      [{ i0, i1, top, bot, side, id }]
//   trades       [{ i, price, direction, win, id }]
//   tpSlLines    [{ i, tp, sl }]
//   showOB, showLongs, showShorts, showWins, showLosses, showBOSCHoCH (bool)
//   height       number (px)
//   onTradeClick (fn)
//   selectedTradeId
//
// OB rectangles are rendered as DOM overlay layer positioned via the chart's
// timeScale.timeToCoordinate() + series.priceToCoordinate() — LWC v4 has no
// native rectangle primitive, so this is the cleanest approach.

const BASE_TIME = Math.floor(new Date("2025-05-20T00:00:00Z").getTime() / 1000);
const STEP_SEC = 4 * 3600;

function hslToRgba(h, s, l, a = 1) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function readToken(name, fallback) {
    if (typeof window === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    if (!v) return fallback;
    // CSS var format: "H S% L%"  →  rgba()  (lightweight-charts v4 only supports rgb/hex)
    const parts = v.trim().split(/\s+/);
    if (parts.length >= 3) {
        const h = parseFloat(parts[0]);
        const s = parseFloat(parts[1]);
        const l = parseFloat(parts[2]);
        if (!isNaN(h) && !isNaN(s) && !isNaN(l)) return hslToRgba(h, s, l, 1);
    }
    return fallback;
}

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
    onTradeClick,
    selectedTradeId,
}) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const priceLinesRef = useRef([]);
    const [overlayKey, setOverlayKey] = useState(0); // triggers OB box reposition

    // Compute token-derived colors once per mount (themes reapply on remount; ok).
    const accentPrimary = readToken("--accent-primary", "rgba(217,70,239,1)");
    const accentSecondary = readToken("--accent-secondary", "rgba(34,211,238,1)");
    const bull = readToken("--bull", "rgba(16,185,129,1)");
    const bear = readToken("--bear", "rgba(239,68,68,1)");
    const success = readToken("--success", "rgba(16,185,129,1)");
    const danger = readToken("--danger", "rgba(239,68,68,1)");
    const muted = readToken("--muted", "rgba(120,120,140,1)");
    const grid = readToken("--grid", "rgba(40,40,60,1)");
    const panel = readToken("--panel", "rgba(20,20,30,1)");

    // Create chart once
    useLayoutEffect(() => {
        if (!containerRef.current) return undefined;
        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height,
            layout: { background: { color: "transparent" }, textColor: muted, fontFamily: "JetBrains Mono" },
            localization: { locale: "en-US" },
            grid: { vertLines: { color: grid }, horzLines: { color: grid } },
            rightPriceScale: { borderColor: grid },
            timeScale: { borderColor: grid, timeVisible: true, secondsVisible: false },
            crosshair: { mode: CrosshairMode.Normal, vertLine: { color: accentSecondary }, horzLine: { color: accentSecondary } },
        });
        chartRef.current = chart;
        const series = chart.addCandlestickSeries({
            upColor: bull, downColor: bear,
            borderUpColor: bull, borderDownColor: bear,
            wickUpColor: bull, wickDownColor: bear,
        });
        seriesRef.current = series;

        // Reposition OB overlays on every time-scale change
        const repaint = () => setOverlayKey((k) => k + 1);
        chart.timeScale().subscribeVisibleTimeRangeChange(repaint);

        const ro = new ResizeObserver(() => {
            if (containerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: containerRef.current.clientWidth, height });
                repaint();
            }
        });
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [height, accentSecondary, bull, bear, grid, muted]);

    // Push candle data
    useEffect(() => {
        const series = seriesRef.current;
        if (!series || !candles.length) return;
        const data = candles.map((c) => ({
            time: BASE_TIME + c.i * STEP_SEC,
            open: c.o, high: c.h, low: c.l, close: c.c,
        }));
        series.setData(data);
        chartRef.current?.timeScale().fitContent();
        setOverlayKey((k) => k + 1);
    }, [candles]);

    // Push trade markers
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        const visible = trades
            .filter((t) => (t.direction === "Long" ? showLongs : showShorts))
            .filter((t) => (t.win ? showWins : showLosses));
        const markers = visible.map((t) => ({
            time: BASE_TIME + t.i * STEP_SEC,
            position: t.direction === "Long" ? "belowBar" : "aboveBar",
            color: t.win ? success : danger,
            shape: t.direction === "Long" ? "arrowUp" : "arrowDown",
            text: `${t.win ? "W" : "L"}${selectedTradeId === t.id ? "★" : ""}`,
            size: selectedTradeId === t.id ? 2 : 1,
        }));
        series.setMarkers(markers);
    }, [trades, showLongs, showShorts, showWins, showLosses, selectedTradeId, success, danger]);

    // Push TP/SL price lines
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        priceLinesRef.current.forEach((pl) => series.removePriceLine(pl));
        priceLinesRef.current = [];
        tpSlLines.forEach((l) => {
            const tp = series.createPriceLine({ price: l.tp, color: success, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" });
            const sl = series.createPriceLine({ price: l.sl, color: danger,  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" });
            priceLinesRef.current.push(tp, sl);
        });
    }, [tpSlLines, success, danger]);

    // OB box overlays — computed every render-trigger (overlayKey).
    const overlays = (() => {
        if (!showOB) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return [];
        const out = [];
        for (const b of obBoxes) {
            const x0 = chart.timeScale().timeToCoordinate(BASE_TIME + b.i0 * STEP_SEC);
            const x1 = chart.timeScale().timeToCoordinate(BASE_TIME + b.i1 * STEP_SEC);
            const yTop = series.priceToCoordinate(b.top);
            const yBot = series.priceToCoordinate(b.bot);
            if (x0 == null || x1 == null || yTop == null || yBot == null) continue;
            out.push({
                id: b.id,
                left: Math.min(x0, x1),
                width: Math.abs(x1 - x0),
                top: Math.min(yTop, yBot),
                height: Math.abs(yBot - yTop),
                side: b.side,
            });
        }
        return out;
        // overlayKey participates as a dependency for re-execution via state change
    })();

    return (
        <div className="relative w-full" style={{ height }} data-testid="candle-chart">
            <div ref={containerRef} className="w-full h-full" onClick={onTradeClick ? () => onTradeClick(null) : undefined} />
            {/* Overlay layer for OB rectangles */}
            <div className="pointer-events-none absolute inset-0" data-overlay-version={overlayKey}>
                {overlays.map((o) => (
                    <div
                        key={o.id}
                        data-testid={`ob-overlay-${o.id}`}
                        className="absolute"
                        style={{
                            left: o.left, width: o.width, top: o.top, height: o.height,
                            background: o.side === "bull"
                                ? "hsl(var(--accent-primary) / 0.13)"
                                : "hsl(var(--accent-secondary) / 0.13)",
                            border: `1px dashed ${o.side === "bull" ? accentPrimary : accentSecondary}`,
                            boxShadow: `0 0 12px -6px ${o.side === "bull" ? accentPrimary : accentSecondary}`,
                        }}
                    >
                        <span
                            className="absolute -top-0.5 left-1 text-[9px] font-mono px-1 leading-[12px] bg-[hsl(var(--panel))]"
                            style={{ color: o.side === "bull" ? accentPrimary : accentSecondary }}
                        >
                            {o.id}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
