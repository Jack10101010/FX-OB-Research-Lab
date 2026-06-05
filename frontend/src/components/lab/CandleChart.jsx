import React, { useEffect, useMemo, useRef, useLayoutEffect, useState } from "react";
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
//   verificationOverlay optional selected-trade verifier geometry
//
// OB rectangles are rendered as DOM overlay layer positioned via the chart's
// timeScale.timeToCoordinate() + series.priceToCoordinate() — LWC v4 has no
// native rectangle primitive, so this is the cleanest approach.

const BASE_TIME = Math.floor(new Date("2025-05-20T00:00:00Z").getTime() / 1000);
const STEP_SEC = 4 * 3600;

function padUtc(value) {
    return String(value).padStart(2, "0");
}

const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHART_FONT_STACK = "IBM Plex Sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

function normalizeChartFormatterTime(value) {
    if (value && typeof value === "object") {
        if (value.timestamp != null) return normalizeChartTimestamp(value.timestamp);
        if (value.time != null) return normalizeChartTimestamp(value.time);
        if (value.year != null && value.month != null && value.day != null) {
            return Math.floor(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) / 1000);
        }
    }
    return normalizeChartTimestamp(value);
}

function formatUtcChartTime(timestamp) {
    const ts = normalizeChartFormatterTime(timestamp);
    if (ts == null) return "";
    const date = new Date(ts * 1000);
    const year = String(date.getUTCFullYear()).slice(-2);
    const month = UTC_MONTHS[date.getUTCMonth()];
    const day = padUtc(date.getUTCDate());
    const hours = padUtc(date.getUTCHours());
    const minutes = padUtc(date.getUTCMinutes());
    return `${day} ${month} '${year} ${hours}:${minutes} UTC`;
}

function formatUtcTickMark(timestamp) {
    const ts = normalizeChartFormatterTime(timestamp);
    if (ts == null) return "";
    const date = new Date(ts * 1000);
    const month = UTC_MONTHS[date.getUTCMonth()];
    const day = padUtc(date.getUTCDate());
    const year = String(date.getUTCFullYear()).slice(-2);
    const hours = padUtc(date.getUTCHours());
    const minutes = padUtc(date.getUTCMinutes());
    return hours === "00" && minutes === "00" ? `${day} ${month} '${year}` : `${hours}:${minutes}`;
}

function normalizeChartTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        return n > 100000000000 ? Math.floor(n / 1000) : Math.floor(n);
    }
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function chartTime(point, indexKey = "i") {
    const realTime = normalizeChartTimestamp(point?.time ?? point?.t ?? point?.timestamp ?? point?.datetime);
    if (realTime != null) return realTime;
    const i = Number(point?.[indexKey] ?? 0);
    return BASE_TIME + i * STEP_SEC;
}

function formatOrderBlockLabel(id) {
    if (id == null || id === "") return "OB-?";
    const s = String(id).trim();
    const match = s.match(/\d+/);
    return match ? `OB-${String(Number(match[0])).padStart(3, "0")}` : s.slice(0, 12);
}

function formatTradeLabel(id) {
    if (id == null || id === "") return "";
    const s = String(id).trim();
    if (/^T-\d+/i.test(s)) return s.toUpperCase();
    const match = s.match(/\d+/);
    return match ? `T-${String(Number(match[0])).padStart(3, "0")}` : s.slice(0, 12);
}

function formatStatusLabel(value) {
    if (!value || normalizeText(value) === "unknown") return "";
    return String(value).replace(/_/g, " ").trim().toUpperCase();
}

function formatResultR(value) {
    if (value == null || value === "" || !isFinite(Number(value))) return "";
    const n = Number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function orderBlockLabelText(ob, debugOverlays = false) {
    const obId = formatOrderBlockLabel(ob.obId || ob.ob_id || ob.id || ob.obIdRaw);
    const status = formatStatusLabel(ob.statusLabel || ob.obFinalStatusLabel || ob.status || ob.obFinalStatus || "");
    const tradeId = formatTradeLabel(ob.displayTradeId || ob.tradeId || ob.linkedTradeId || ob.trade_id || ob.linked_trade_id);
    const statusKey = normalizeText(ob.statusLabel || ob.obFinalStatusLabel || ob.status || ob.obFinalStatus || ob.outcome || "");
    const isNewsFlatten = Boolean(ob.isNewsFlatten) || statusKey.includes("news_flatten");
    const resultR = isNewsFlatten ? formatResultR(ob.resultR ?? ob.newsFlattenR ?? ob.news_flatten_r ?? ob.r ?? ob.pnlR ?? ob.pnl_r) : "";
    const source = ob.rightTimeSource || ob.chartRightTimeSource || ob.chart_right_time_source;
    if (debugOverlays) {
        return [obId, tradeId, isNewsFlatten ? "NEWS FLATTEN" : status, resultR, source ? `right: ${source}` : ""].filter(Boolean).join(" · ");
    }
    return [obId, tradeId, resultR].filter(Boolean).join(" · ");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function rgba(hex, alpha) {
    const value = String(hex || "").replace("#", "");
    if (value.length !== 6) return `rgba(107, 114, 128, ${alpha})`;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const OB_PALETTE = {
    bull: "#1848cc",
    bear: "#b22833",
    pending: "#f59e0b",
    done: "#7e22ce",
    paused: "#eab308",
    sessionCancel: "#d946ef",
    reverseCancel: "#06b6d4",
    win: "#16a34a",
    loss: "#dc2626",
    be: "#6b7280",
};

function normalizeText(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function resolveObVisual(ob) {
    if (ob?.colorKey && OB_PALETTE[ob.colorKey]) {
        const base = OB_PALETTE[ob.colorKey];
        const alpha = ob.colorKey === "pending" ? 0.22 : ob.colorKey === "paused" ? 0.16 : ob.colorKey === "done" ? 0.12 : 0.18;
        return {
            fill: rgba(base, alpha),
            border: rgba(base, Math.min(0.58, alpha + 0.24)),
            label: rgba(base, 0.92),
        };
    }
    const outcome = normalizeText(ob.outcome || ob.result);
    const reason = normalizeText(ob.missed_reason || ob.missedReason || ob.lastCancelReason);
    const status = normalizeText(ob.status || ob.state || ob.lifecycleState);
    const all = `${outcome} ${reason} ${status}`;
    let base = null;
    let alpha = 0.2;

    if (ob.news_blackout === true || ob.newsBlackout === true || all.includes("news_blackout") || all.includes("blackout") || all.includes("paused")) {
        base = OB_PALETTE.paused;
        alpha = 0.16;
    } else if (all.includes("session_cancel") || all.includes("session_touch_cancel")) {
        base = OB_PALETTE.sessionCancel;
        alpha = 0.18;
    } else if (all.includes("reverse_cancel") || all.includes("reverse_touch") || ob.reverseConflict === true || ob.reverse_conflict === true) {
        base = OB_PALETTE.reverseCancel;
        alpha = 0.18;
    } else if (outcome === "win" || outcome === "tp" || outcome === "target") {
        base = OB_PALETTE.win;
        alpha = 0.18;
    } else if (outcome === "loss" || outcome === "sl" || outcome === "stop") {
        base = OB_PALETTE.loss;
        alpha = 0.18;
    } else if (outcome === "be" || outcome === "breakeven" || outcome === "break_even") {
        base = OB_PALETTE.be;
        alpha = 0.18;
    } else if (
        all.includes("invalid") ||
        all.includes("unfilled") ||
        all.includes("mitigation") ||
        all.includes("done") ||
        ob.missed_trade === true ||
        ob.missedTrade === true ||
        ob.ob_fully_breached === true ||
        ob.obFullyBreached === true ||
        ob.protection_exit === true ||
        ob.protectionExit === true
    ) {
        base = OB_PALETTE.done;
        alpha = 0.12;
    } else if (all.includes("pending") || ob.pending === true) {
        base = OB_PALETTE.pending;
        alpha = 0.22;
    } else {
        const side = normalizeText(ob.side || ob.direction || ob.obDirection);
        base = side.includes("bear") || side.includes("short") ? OB_PALETTE.bear : OB_PALETTE.bull;
        alpha = 0.2;
    }

    return {
        fill: rgba(base, alpha),
        border: rgba(base, Math.min(0.62, alpha + 0.26)),
        label: rgba(base, 0.92),
    };
}

// Normalize an OB/trade ID to a comparable numeric key (mirrors StrategyMap's rrLookupKey)
function obLookupKey(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    const numeric = text.match(/\d+/);
    return numeric ? String(Number(numeric[0])) : text.toLowerCase();
}

// Phase 2: turn either a baseline marker ({i, time, price, direction, win, id})
// or a raw triggered-edge trade ({entry, entryPrice, direction, outcome, ...}) into
// a uniform shape the chart can render as a clickable dot.
function resolveTradeMarkerInfo(t) {
    if (!t) return null;
    const time = normalizeChartTimestamp(t.time ?? t.entry ?? t.entry_time ?? t.fill_time ?? t.fillTime);
    const price = Number(t.price ?? t.entryPrice ?? t.entry_price ?? t.actual_entry_price ?? t.planned_entry_price);
    if (time == null || !isFinite(price)) return null;
    const dirRaw = String(t.direction || t.side || "").toLowerCase();
    const isLong = dirRaw.startsWith("l") || dirRaw === "bull" || dirRaw === "buy";
    let win = typeof t.win === "boolean" ? t.win : null;
    if (win == null) {
        const outcome = String(t.outcome || "").toLowerCase();
        if (outcome === "win" || outcome === "target" || outcome === "tp") win = true;
        else if (outcome === "loss" || outcome === "stop" || outcome === "sl") win = false;
    }
    const id = t.id ?? t.displayTradeId ?? t.tradeId ?? t.trade_id;
    return { time, price, direction: isLong ? "long" : "short", win, id };
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
    onSelectTrade,           // (tradeId | null) => void — Phase 2: chart-side activation of the Intrabar Inspector
    selectedTradeId,
    verificationOverlay = null,
    rrTools = [],
    newsEvents = [],
    sessionRanges = [],
    showSessionHighlights = false,
    debugOverlays = false,
    showObOriginMarkers = false,
    showObDetectionMarkers = false,
    showObLabels = false,
    showNewsLabels = false,
    // Triggered-edge lifecycle props
    triggeredEdgeOverlays = [],
    showTriggeredEdgeLevels = false,
    showTriggeredEdgeLabels = false,   // sub-toggle for trigger line text labels
    showTriggeredEdgeLifecycle = false,
    showTriggeredEdgeBadges = true,
    showCancelledSetups = true,
    onSelectOverlay,   // (overlayObject | null) => void — lifecycle detail popover
    // OB Details callout overlay (compact badge per OB box, off by default)
    showObDetails = false,
    // Ghost tracking overlay props (Phase 0 — observational, all off by default)
    showGhostCandidateMarkers = false,
    showGhostFillMarkers = false,
    showGhostWinMarkers = false,
    showGhostLossMarkers = false,
    // FFT Debug overlay — pink entry-edge tap/cancel markers
    showFftDebug = false,
    // FFT move-away threshold config — { pips, obMultiple, pipSize }
    // When set, draws threshold line above/below OB and places cancel dot at actual cancel price.
    fftMoveAwayConfig = null,
}) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const priceLinesRef = useRef([]);
    const [overlayKey, setOverlayKey] = useState(0); // triggers OB box reposition
    const hasRealCandleTime = candles.some((c) => normalizeChartTimestamp(c.time ?? c.t ?? c.timestamp ?? c.datetime) != null);
    const safeHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Math.round(Number(height)) : 460;

    // ── Phase 2: trade-selection key + OB→trade lookup ─────────────────────────
    // selectedKey normalizes selectedTradeId (e.g. "T-007") to the same numeric key
    // used by obLookupKey, so OBs / badges / dots can compare against it. Pre-built
    // ob→trade map lets us resolve an OB click to a tradeId even when the OB
    // wasn't enriched upstream (enrichObsWithTradeLabels usually does this).
    const selectedKey = obLookupKey(selectedTradeId);
    const tradeByObKey = useMemo(() => {
        const map = new Map();
        for (const t of trades || []) {
            const k = obLookupKey(t?.obId ?? t?.ob_id);
            if (k != null && !map.has(k)) map.set(k, t);
        }
        return map;
    }, [trades]);
    const handleSelectTrade = (tradeId) => {
        if (!onSelectTrade && !onTradeClick) return;
        if (onSelectTrade) onSelectTrade(tradeId ?? null);
        else if (onTradeClick && tradeId == null) onTradeClick(null);
    };
    const handleObClick = (ob) => {
        if (!onSelectTrade) return;
        const linkedTradeId = ob?.tradeId || ob?.displayTradeId || ob?.linkedTradeId || ob?.trade_id;
        if (linkedTradeId) { onSelectTrade(linkedTradeId); return; }
        const k = obLookupKey(ob?.obId || ob?.ob_id || ob?.id);
        const matchedTrade = k != null ? tradeByObKey.get(k) : null;
        if (matchedTrade) onSelectTrade(matchedTrade.id ?? matchedTrade.displayTradeId);
    };
    const obIsSelectable = (ob) => {
        if (!onSelectTrade) return false;
        if (ob?.tradeId || ob?.displayTradeId || ob?.linkedTradeId || ob?.trade_id) return true;
        const k = obLookupKey(ob?.obId || ob?.ob_id || ob?.id);
        return !!(k != null && tradeByObKey.get(k));
    };

    const chartBg = "rgba(248, 250, 252, 1)";
    const axis = "rgba(148, 163, 184, 0.86)";
    const border = "rgba(203, 213, 225, 0.62)";
    const crosshairLine = "rgba(71, 85, 105, 0.42)";
    const crosshairLabelBg = "rgba(15, 23, 42, 0.94)";
    const transparent = "rgba(0, 0, 0, 0)";
    const upCandle = "rgba(188, 188, 188, 1)";
    const downCandle = "rgba(55, 65, 81, 1)";
    const rewardStroke = "rgba(22, 163, 74, 0.18)";
    const rewardFill = "rgba(22, 163, 74, 0.12)";
    const riskStroke = "rgba(220, 38, 38, 0.18)";
    const riskFill = "rgba(220, 38, 38, 0.12)";

    // Create chart once
    useLayoutEffect(() => {
        if (!containerRef.current) return undefined;
        const initialWidth = Math.max(1, containerRef.current.clientWidth || 1);
        const chart = createChart(containerRef.current, {
            width: initialWidth,
            height: safeHeight,
            layout: {
                background: { color: chartBg },
                textColor: axis,
                fontFamily: CHART_FONT_STACK,
                fontSize: 11,
            },
            localization: {
                locale: "en-US",
                timeFormatter: formatUtcChartTime,
            },
            watermark: { visible: false },
            attributionLogo: false,
            grid: { vertLines: { color: transparent }, horzLines: { color: transparent } },
            rightPriceScale: { borderColor: border },
            timeScale: {
                borderColor: border,
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: formatUtcTickMark,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: crosshairLine,
                    labelBackgroundColor: crosshairLabelBg,
                },
                horzLine: {
                    color: crosshairLine,
                    labelBackgroundColor: crosshairLabelBg,
                },
            },
        });
        chartRef.current = chart;
        const series = chart.addCandlestickSeries({
            upColor: upCandle,
            downColor: downCandle,
            borderUpColor: upCandle,
            borderDownColor: downCandle,
            wickUpColor: upCandle,
            wickDownColor: downCandle,
            priceLineVisible: false,
        });
        seriesRef.current = series;

        // Reposition OB overlays on every time-scale change
        const repaint = () => setOverlayKey((k) => k + 1);
        chart.timeScale().subscribeVisibleTimeRangeChange(repaint);
        chart.timeScale().subscribeVisibleLogicalRangeChange?.(repaint);

        const ro = new ResizeObserver(() => {
            if (containerRef.current && chartRef.current) {
                const width = containerRef.current.clientWidth;
                const bounds = containerRef.current.getBoundingClientRect();
                if (width > 0 && bounds.height > 0) {
                    chartRef.current.applyOptions({ width, height: bounds.height });
                }
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
    }, []);

    useEffect(() => {
        const chart = chartRef.current;
        const container = containerRef.current;
        if (!chart || !container) return;
        const width = container.clientWidth;
        if (width <= 0 || safeHeight <= 0) return;
        chart.applyOptions({ width, height: safeHeight });
        setOverlayKey((k) => k + 1);
    }, [safeHeight]);

    // Push candle data
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        if (!candles.length) {
            series.setData([]);
            return;
        }
        const seen = new Set();
        const data = candles
            .map((c) => ({
                time: chartTime(c),
                open: c.o, high: c.h, low: c.l, close: c.c,
            }))
            .sort((a, b) => a.time - b.time)
            .filter((c) => {
                if (seen.has(c.time)) return false;
                seen.add(c.time);
                return true;
            });
        series.setData(data);
        const bounds = containerRef.current?.getBoundingClientRect();
        if ((bounds?.width || 0) > 0 && (bounds?.height || 0) > 0) {
            chartRef.current?.timeScale().fitContent();
        }
        setOverlayKey((k) => k + 1);
    }, [candles]);

    // Entry arrows are intentionally hidden in verifier mode; the RR tool and details panel carry entry context.
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        series.setMarkers([]);
    }, [trades, showLongs, showShorts, showWins, showLosses, selectedTradeId, hasRealCandleTime]);

    // Push TP/SL price lines
    useEffect(() => {
        const series = seriesRef.current;
        if (!series) return;
        priceLinesRef.current.forEach((pl) => series.removePriceLine(pl));
        priceLinesRef.current = [];
        tpSlLines.forEach((l) => {
            const tp = series.createPriceLine({ price: l.tp, color: rewardStroke, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" });
            const sl = series.createPriceLine({ price: l.sl, color: riskStroke,  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" });
            priceLinesRef.current.push(tp, sl);
        });
    }, [tpSlLines]);

    const debugInfo = {
        candleCount: candles.length,
        firstCandleTime: candles[0] ? chartTime(candles[0]) : null,
        lastCandleTime: candles.length ? chartTime(candles[candles.length - 1]) : null,
        hasRealCandleTime,
        obCount: obBoxes.length,
        verificationReceived: !!verificationOverlay,
        tradeMarkersCount: trades.length,
        obsDrawn: 0,
        obsSkipped: 0,
        skipReasons: {
            missingTime: 0,
            xNullOffscreen: 0,
            missingPrice: 0,
            priceScaleNull: 0,
        },
        rrDrawn: 0,
        rrSkipped: 0,
        firstOb: obBoxes[0] || null,
        selectedRightEdge: verificationOverlay?.projectedExitTime || verificationOverlay?.exitTime || null,
    };

    const candleTimes = candles
        .map((c) => chartTime(c))
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => a - b);
    const snapFloor = (time) => {
        if (!Number.isFinite(time) || !candleTimes.length) return null;
        let match = candleTimes[0];
        for (const candleTime of candleTimes) {
            if (candleTime > time) break;
            match = candleTime;
        }
        return match;
    };
    const snapCeil = (time) => {
        if (!Number.isFinite(time) || !candleTimes.length) return null;
        for (const candleTime of candleTimes) {
            if (candleTime > time) return candleTime;
        }
        return candleTimes[candleTimes.length - 1];
    };

    const sessionOverlays = (() => {
        if (!showSessionHighlights || !sessionRanges?.length) return [];
        const chart = chartRef.current;
        if (!chart || !candleTimes.length) return [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const toVisibleX = (time, boundary) => {
            const x = chart.timeScale().timeToCoordinate(time);
            if (x != null) return x;
            return boundary === "left" ? 0 : maxWidth;
        };
        return (sessionRanges || []).map((range, index) => {
            const rawStart = normalizeChartTimestamp(range.startTime);
            const rawEnd = normalizeChartTimestamp(range.endTime);
            if (rawStart == null || rawEnd == null) return null;
            const start = hasRealCandleTime ? snapFloor(rawStart) : rawStart;
            const end = hasRealCandleTime ? snapCeil(rawEnd) : rawEnd;
            if (start == null || end == null) return null;
            const rangeStart = Math.min(start, end);
            const rangeEnd = Math.max(start, end);
            const drawStart = rangeFrom == null ? rangeStart : Math.max(rangeStart, rangeFrom);
            const drawEnd = rangeTo == null ? rangeEnd : Math.min(rangeEnd, rangeTo);
            if (drawEnd < drawStart) return null;
            const x0 = toVisibleX(hasRealCandleTime ? snapCeil(drawStart) : drawStart, "left");
            const x1 = toVisibleX(hasRealCandleTime ? snapFloor(drawEnd) : drawEnd, "right");
            if (x0 == null || x1 == null) return null;
            const left = clamp(Math.min(x0, x1), 0, Math.max(0, maxWidth - 1));
            const right = clamp(Math.max(x0, x1), 0, Math.max(0, maxWidth));
            return {
                id: range.id || `${range.label || "session"}-${index}`,
                label: range.label,
                colorKey: range.colorKey,
                left,
                width: Math.max(1, right - left),
                height: maxHeight,
            };
        }).filter(Boolean);
    })();

    // OB box overlays — computed every render-trigger (overlayKey).
    const overlays = (() => {
        if (!showOB) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return [];
        const out = [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const toVisibleX = (time, boundary) => {
            const x = chart.timeScale().timeToCoordinate(time);
            if (x != null) return x;
            return boundary === "left" ? 0 : maxWidth;
        };
        for (const b of obBoxes) {
            if (hasRealCandleTime && (b.time0 == null || b.time1 == null)) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.missingTime += 1;
                continue;
            }
            const rawTime0 = normalizeChartTimestamp(b.time0) ?? chartTime(b, "i0");
            const rawTime1 = normalizeChartTimestamp(b.time1) ?? chartTime(b, "i1");
            const time0 = hasRealCandleTime ? snapFloor(rawTime0) : rawTime0;
            const time1 = hasRealCandleTime ? snapCeil(rawTime1) : rawTime1;
            if (time0 == null || time1 == null) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.missingTime += 1;
                continue;
            }
            const boxStart = Math.min(time0, time1);
            const boxEnd = Math.max(time0, time1);
            const drawStart = rangeFrom == null ? boxStart : Math.max(boxStart, rangeFrom);
            const drawEnd = rangeTo == null ? boxEnd : Math.min(boxEnd, rangeTo);
            if (drawEnd < drawStart) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.xNullOffscreen += 1;
                continue;
            }
            const x0 = toVisibleX(drawStart, "left");
            const x1 = toVisibleX(drawEnd, "right");
            if (x0 == null || x1 == null) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.xNullOffscreen += 1;
                continue;
            }
            if (b.top == null || b.bot == null || !isFinite(Number(b.top)) || !isFinite(Number(b.bot))) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.missingPrice += 1;
                continue;
            }
            const yTop = series.priceToCoordinate(b.top);
            const yBot = series.priceToCoordinate(b.bot);
            if (yTop == null || yBot == null) {
                debugInfo.obsSkipped += 1;
                debugInfo.skipReasons.priceScaleNull += 1;
                continue;
            }
            const left = clamp(Math.min(x0, x1), 0, Math.max(0, maxWidth - 1));
            const right = clamp(Math.max(x0, x1), 0, Math.max(0, maxWidth));
            const top = clamp(Math.min(yTop, yBot), 0, Math.max(0, maxHeight - 1));
            const bottom = clamp(Math.max(yTop, yBot), 0, Math.max(0, maxHeight));
            out.push({
                ...b,
                id: b.id,
                left,
                width: Math.max(1, right - left),
                top,
                height: Math.max(1, bottom - top),
            });
        }
        debugInfo.obsDrawn = out.length;
        return out;
        // overlayKey participates as a dependency for re-execution via state change
    })();

    const obMarkers = (() => {
        if (!showOB || (!showObOriginMarkers && !showObDetectionMarkers)) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return [];
        const out = [];
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const isVisibleTime = (time) => (rangeFrom == null || time >= rangeFrom) && (rangeTo == null || time <= rangeTo);
        const markerYRange = (ob) => {
            const top = Number(ob.top);
            const bot = Number(ob.bot ?? ob.bottom);
            if (!isFinite(top) || !isFinite(bot)) return null;
            const yTop = series.priceToCoordinate(top);
            const yBot = series.priceToCoordinate(bot);
            if (yTop == null || yBot == null) return null;
            return {
                top: Math.min(yTop, yBot),
                height: Math.max(1, Math.abs(yBot - yTop)),
            };
        };
        const pushMarker = (ob, kind, rawTime) => {
            const parsed = normalizeChartTimestamp(rawTime);
            if (parsed == null) return;
            const time = hasRealCandleTime ? snapFloor(parsed) : parsed;
            if (time == null || !isVisibleTime(time)) return;
            const x = chart.timeScale().timeToCoordinate(time);
            const yRange = markerYRange(ob);
            if (x == null || yRange == null) return;
            out.push({
                id: `${ob.id || ob.obId || ob.ob_id || "ob"}-${kind}`,
                x,
                top: yRange.top,
                height: yRange.height,
                kind,
                label: kind === "origin" ? "O" : "",
            });
        };
        for (const ob of obBoxes) {
            if (showObOriginMarkers) {
                pushMarker(ob, "origin", ob.originTime ?? ob.origin_time ?? ob.startTime ?? ob.start_time ?? ob.time0);
            }
            if (showObDetectionMarkers) {
                pushMarker(ob, "detected", ob.endTime ?? ob.detectionTime ?? ob.detection_time ?? ob.detected ?? ob.time1);
            }
        }
        return out;
    })();

    const verificationShapes = (() => {
        if (!verificationOverlay) {
            debugInfo.rrSkipped += 1;
            return null;
        }
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) {
            debugInfo.rrSkipped += 1;
            return null;
        }
        const toX = (point, key = "i") => {
            if (!point) return null;
            const t = chartTime(point, key);
            return chart.timeScale().timeToCoordinate(t);
        };
        const toY = (price) => {
            if (price == null || !isFinite(Number(price))) return null;
            return series.priceToCoordinate(Number(price));
        };
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const fillX = toX({ time: verificationOverlay.fillTime, i: verificationOverlay.fillIndex });
        const entryY = toY(verificationOverlay.entry);
        const stopY = toY(verificationOverlay.stop);
        const tpY = toY(verificationOverlay.tp);
        if (fillX == null || entryY == null) {
            debugInfo.rrSkipped += 1;
            return null;
        }
        const estimatedStep = maxWidth > 0 ? Math.max(8, Math.min(18, maxWidth / Math.max(24, candles.length || 1))) : 10;
        const visualWidth = Math.round(estimatedStep * 16);
        const left = clamp(fillX, 0, Math.max(0, maxWidth - 1));
        const right = clamp(fillX + visualWidth, left + 6, Math.max(left + 6, maxWidth));
        const boxWidth = Math.max(6, right - left);
        const clampBoxY = (a, b) => {
            if (a == null || b == null) return { top: null, height: null };
            const top = clamp(Math.min(a, b), 0, Math.max(0, maxHeight - 1));
            const bottom = clamp(Math.max(a, b), 0, Math.max(0, maxHeight));
            return { top, height: Math.max(2, bottom - top) };
        };
        const riskBox = clampBoxY(entryY, stopY);
        const rewardBox = clampBoxY(entryY, tpY);
        debugInfo.rrDrawn = Number(riskBox.top != null) + Number(rewardBox.top != null);
        return {
            left,
            width: boxWidth,
            entryY: clamp(entryY, 0, maxHeight),
            stopY: stopY == null ? null : clamp(stopY, 0, maxHeight),
            tpY: tpY == null ? null : clamp(tpY, 0, maxHeight),
            riskTop: riskBox.top,
            riskHeight: riskBox.height,
            rewardTop: rewardBox.top,
            rewardHeight: rewardBox.height,
        };
    })();

    const rrToolShapes = (() => {
        if (!rrTools?.length) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series || !candleTimes.length) return [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const toVisibleX = (time, boundary) => {
            const x = chart.timeScale().timeToCoordinate(time);
            if (x != null) return x;
            return boundary === "left" ? 0 : maxWidth;
        };
        const toYBox = (a, b) => {
            const yA = series.priceToCoordinate(Number(a));
            const yB = series.priceToCoordinate(Number(b));
            if (yA == null || yB == null) return null;
            const top = clamp(Math.min(yA, yB), 0, Math.max(0, maxHeight - 1));
            const bottom = clamp(Math.max(yA, yB), 0, Math.max(0, maxHeight));
            return { top, height: Math.max(2, bottom - top) };
        };
        return rrTools.flatMap((tool, index) => {
            const rawFillTime = normalizeChartTimestamp(tool.fillTime ?? tool.fill_time ?? tool.entryTime ?? tool.entry_time ?? tool.time);
            const entry = Number(tool.entry);
            const stop = Number(tool.stop);
            const tp = Number(tool.tp);
            if (rawFillTime == null || !isFinite(entry) || !isFinite(stop) || !isFinite(tp)) return [];
            const startTime = hasRealCandleTime ? snapFloor(rawFillTime) : rawFillTime;
            if (startTime == null) return [];
            const startIndex = candleTimes.findIndex((time) => time >= startTime);
            if (startIndex < 0) return [];
            const rawExitTime = normalizeChartTimestamp(tool.exitTime ?? tool.exit_time ?? tool.newsFlattenTime ?? tool.news_flatten_time);
            const isNewsFlatten = Boolean(tool.isNewsFlatten || normalizeText(tool.outcome || tool.status || tool.statusLabel).includes("news_flatten"));
            const snappedExitTime = rawExitTime != null && hasRealCandleTime ? snapCeil(rawExitTime) : rawExitTime;
            // Use actual exit time when available (for all trade types).
            // Fall back to 50-candle lookahead when exit_time is absent.
            const endTime = snappedExitTime != null
                ? snappedExitTime
                : candleTimes[Math.min(candleTimes.length - 1, startIndex + 50)];
            const boxStart = Math.min(startTime, endTime);
            const boxEnd = Math.max(startTime, endTime);
            const drawStart = rangeFrom == null ? boxStart : Math.max(boxStart, rangeFrom);
            const drawEnd = rangeTo == null ? boxEnd : Math.min(boxEnd, rangeTo);
            if (drawEnd < drawStart) return [];
            const drawStartTime = hasRealCandleTime ? snapCeil(drawStart) : drawStart;
            const drawEndTime = hasRealCandleTime ? snapFloor(drawEnd) : drawEnd;
            if (drawStartTime == null || drawEndTime == null || drawEndTime < drawStartTime) return [];
            const x0 = toVisibleX(drawStartTime, "left");
            const x1 = toVisibleX(drawEndTime, "right");
            if (x0 == null || x1 == null) return [];
            const left = clamp(Math.min(x0, x1), 0, Math.max(0, maxWidth - 1));
            const right = clamp(Math.max(x0, x1), 0, Math.max(0, maxWidth));
            const width = Math.max(6, right - left);
            const riskBox = toYBox(entry, stop);
            const rewardBox = toYBox(entry, tp);
            const shapes = [];
            if (isNewsFlatten) {
                const exitPrice = Number(tool.exitPrice ?? tool.newsFlattenPrice ?? tool.news_flatten_price);
                const resultBox = isFinite(exitPrice) ? toYBox(entry, exitPrice) : null;
                if (resultBox) {
                    const resultR = tool.resultR ?? tool.newsFlattenR ?? tool.news_flatten_r;
                    const resultNumber = Number(resultR);
                    const isProfit = isFinite(resultNumber)
                        ? resultNumber >= 0
                        : normalizeText(tool.direction).includes("short")
                            ? exitPrice <= entry
                            : exitPrice >= entry;
                    shapes.push({
                        id: `${tool.id || index}-flatten-result`,
                        kind: isProfit ? "reward" : "risk",
                        left,
                        width,
                        ...resultBox,
                    });
                }
                return shapes;
            }
            if (rewardBox) shapes.push({ id: `${tool.id || index}-reward`, kind: "reward", left, width, ...rewardBox });
            if (riskBox) shapes.push({ id: `${tool.id || index}-risk`, kind: "risk", left, width, ...riskBox });
            return shapes;
        });
    })();

    const newsEventLines = (() => {
        if (!newsEvents?.length) return [];
        const chart = chartRef.current;
        if (!chart || !candleTimes.length) return [];
        const series = seriesRef.current;
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxHeight = bounds?.height || height;
        const axisOffset = 24;
        const maxMarkerHeight = Math.max(28, Math.round(maxHeight * 0.2));
        const fallbackMarkerHeight = Math.max(24, Math.round(maxHeight * 0.15));
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        return newsEvents.map((event, index) => {
            const rawTime = normalizeChartTimestamp(event.time ?? event.eventTime ?? event.event_time ?? event.news_blackout_event_time);
            if (rawTime == null) return null;
            const time = hasRealCandleTime ? snapFloor(rawTime) : rawTime;
            if (time == null) return null;
            if ((rangeFrom != null && time < rangeFrom) || (rangeTo != null && time > rangeTo)) return null;
            const x = chart.timeScale().timeToCoordinate(time);
            if (x == null) return null;
            const impact = normalizeText(event.impact ?? event.news_blackout_impact);
            const currency = String(event.currency ?? event.news_blackout_currency ?? "").trim().toUpperCase();
            const eventName = String(event.event ?? event.name ?? event.news_blackout_event ?? "NEWS").trim();
            const shortEvent = eventName.length > 14 ? `${eventName.slice(0, 13)}…` : eventName;
            const lineBottom = axisOffset;
            const matchedCandle = candles.find((candle) => normalizeChartTimestamp(candle.time ?? candle.t ?? candle.timestamp ?? candle.datetime) === time);
            const closeY = matchedCandle && series ? series.priceToCoordinate(Number(matchedCandle.close)) : null;
            const bottomY = maxHeight - lineBottom;
            const candleHeight = closeY == null ? null : bottomY - closeY;
            const markerHeight = candleHeight == null
                ? fallbackMarkerHeight
                : clamp(candleHeight, 22, maxMarkerHeight);
            const displayTime = event.time ?? event.eventTime ?? event.event_time ?? event.news_blackout_event_time ?? "";
            return {
                id: `${event.id || event.event || event.name || "news"}-${index}`,
                x,
                height: markerHeight,
                bottom: lineBottom,
                impact,
                label: `${currency || "NEWS"} ${impact ? impact.toUpperCase() : ""} · ${shortEvent}`.trim(),
                tooltip: `${currency || "NEWS"} ${impact ? impact.toUpperCase() : ""}\n${eventName}\n${displayTime}`,
            };
        }).filter(Boolean);
    })();

    const newsBoundaryLines = (() => {
        if (!newsEvents?.length) return [];
        const chart = chartRef.current;
        if (!chart || !candleTimes.length) return [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const axisOffset = 24;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const timeToInterpolatedX = (rawTime) => {
            if (!Number.isFinite(rawTime)) return null;
            if ((rangeFrom != null && rawTime < rangeFrom) || (rangeTo != null && rawTime > rangeTo)) return null;
            const exact = chart.timeScale().timeToCoordinate(rawTime);
            if (exact != null) return exact;
            if (!hasRealCandleTime) return null;
            const floor = snapFloor(rawTime);
            const ceil = snapCeil(rawTime);
            if (floor == null || ceil == null) return null;
            const floorX = chart.timeScale().timeToCoordinate(floor);
            const ceilX = chart.timeScale().timeToCoordinate(ceil);
            if (floor === ceil) return floorX ?? ceilX ?? null;
            if (floorX == null || ceilX == null) return floorX ?? ceilX ?? null;
            const ratio = clamp((rawTime - floor) / Math.max(1, ceil - floor), 0, 1);
            return floorX + (ceilX - floorX) * ratio;
        };
        const boundaryTime = (event, side) => normalizeChartTimestamp(
            side === "start"
                ? (event.blackoutStartTime ?? event.blackoutStart ?? event.blackout_start ?? event.window_start ?? event.news_blackout_window_start)
                : (event.blackoutEndTime ?? event.blackoutEnd ?? event.blackout_end ?? event.window_end ?? event.news_blackout_window_end),
        );
        return newsEvents.flatMap((event, index) => {
            const start = boundaryTime(event, "start");
            const end = boundaryTime(event, "end");
            return [
                { side: "start", time: start },
                { side: "end", time: end },
            ].map((boundary) => {
                const x = timeToInterpolatedX(boundary.time);
                if (x == null) return null;
                return {
                    id: `${event.id || event.event || event.name || "news"}-${index}-${boundary.side}`,
                    x: clamp(x, 0, Math.max(0, maxWidth)),
                    top: 0,
                    height: Math.max(0, maxHeight - axisOffset),
                    side: boundary.side,
                };
            }).filter(Boolean);
        });
    })();

    // ── Triggered-edge: dashed horizontal trigger threshold line across OB active span ──
    const triggeredEdgeLevelShapes = (() => {
        if (!showTriggeredEdgeLevels || !triggeredEdgeOverlays?.length) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxWidth = bounds?.width || 0;
        const maxHeight = bounds?.height || height;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const toVisibleX = (time, boundary) => {
            const x = chart.timeScale().timeToCoordinate(time);
            if (x != null) return x;
            return boundary === "left" ? 0 : maxWidth;
        };
        const colorForState = (state) => {
            if (state === "tagged") {
                return {
                    border: "rgba(22, 163, 74, 0.86)",
                    text: "rgba(21, 128, 61, 0.95)",
                    bg: "rgba(240, 253, 244, 0.78)",
                    stateLabel: "Tagged",
                };
            }
            if (state === "cancelled") {
                return {
                    border: "rgba(139, 92, 246, 0.80)",
                    text: "rgba(109, 40, 217, 0.95)",
                    bg: "rgba(245, 243, 255, 0.78)",
                    stateLabel: "Cancelled",
                };
            }
            if (state === "muted") {
                return {
                    border: "rgba(107, 114, 128, 0.56)",
                    text: "rgba(75, 85, 99, 0.90)",
                    bg: "rgba(249, 250, 251, 0.70)",
                    stateLabel: "Not tagged",
                };
            }
            return {
                border: "rgba(245, 158, 11, 0.78)",
                text: "rgba(161, 93, 0, 0.92)",
                bg: "rgba(255, 251, 235, 0.76)",
                stateLabel: "Not tagged",
            };
        };
        const out = [];
        for (const ov of triggeredEdgeOverlays) {
            if (!showCancelledSetups && ov.cancelledBeforeEntry) continue;
            if (ov.triggerPrice == null || !isFinite(ov.triggerPrice)) continue;
            const y = series.priceToCoordinate(ov.triggerPrice);
            if (y == null) continue;
            const rawT0 = normalizeChartTimestamp(ov.lineStartTime ?? ov.detectionTime ?? ov.obStartTime);
            const rawT1 = normalizeChartTimestamp(ov.lineEndTime ?? ov.obEndTime ?? ov.edgeRevisitTime ?? ov.triggerTime);
            if (rawT0 == null || rawT1 == null) continue;
            const t0 = hasRealCandleTime ? snapFloor(rawT0) : rawT0;
            const t1 = hasRealCandleTime ? snapCeil(rawT1) : rawT1;
            if (t0 == null || t1 == null) continue;
            const boxStart = Math.min(t0, t1);
            const boxEnd = Math.max(t0, t1);
            const drawStart = rangeFrom == null ? boxStart : Math.max(boxStart, rangeFrom);
            const drawEnd = rangeTo == null ? boxEnd : Math.min(boxEnd, rangeTo);
            if (drawEnd < drawStart) continue;
            const x0 = toVisibleX(drawStart, "left");
            const x1 = toVisibleX(drawEnd, "right");
            const left = clamp(Math.min(x0, x1), 0, Math.max(0, maxWidth - 1));
            const right = clamp(Math.max(x0, x1), 0, Math.max(0, maxWidth));
            const fallbackState = ov.wasCancelled ? "cancelled" : ov.wasTriggered ? "tagged" : "not_tagged";
            const lineState = !showCancelledSetups && !ov.wasTriggered && !ov.wasCancelled ? "muted" : (ov.triggerLineState || fallbackState);
            const color = colorForState(lineState);
            const pctLabel = ov.triggerPenetrationPct != null ? `Trig ${ov.triggerPenetrationPct}%` : "Trigger";
            out.push({
                id: `trig-level-${ov.tradeId || ov.obId}`,
                left,
                width: Math.max(2, right - left),
                y: clamp(y, 0, maxHeight),
                color,
                label: showTriggeredEdgeLabels ? `${pctLabel} · ${color.stateLabel}` : null,
            });
        }
        return out;
    })();

    // ── Triggered-edge: small colored dot markers for each lifecycle event ──
    const triggeredEdgeLifecycleMarkers = (() => {
        if (!showTriggeredEdgeLifecycle || !triggeredEdgeOverlays?.length) return [];
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return [];
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const isVisible = (t) => (rangeFrom == null || t >= rangeFrom) && (rangeTo == null || t <= rangeTo);
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxHeight = bounds?.height || height;
        const out = [];
        for (const ov of triggeredEdgeOverlays) {
            if (!showCancelledSetups && (ov.cancelledBeforeEntry || ov.badgeState === "never_trig")) continue;
            const yTop = ov.obTop != null ? series.priceToCoordinate(ov.obTop) : null;
            const yBot = ov.obBot != null ? series.priceToCoordinate(ov.obBot) : null;
            const yMid = yTop != null && yBot != null ? clamp((yTop + yBot) / 2, 0, maxHeight) : null;
            const events = [
                ov.tappedTime  && { rawTime: ov.tappedTime,        color: "rgba(99, 102, 241, 0.85)",  label: "TAP"  },
                ov.triggerTime && { rawTime: ov.triggerTime,        color: "rgba(245, 158, 11, 0.90)",  label: "TRIG" },
                ov.armedAt     && { rawTime: ov.armedAt,            color: "rgba(234, 179, 8, 0.90)",   label: "ARM"  },
                ov.edgeRevisitTime && { rawTime: ov.edgeRevisitTime, color: "rgba(6, 182, 212, 0.90)",  label: "REV"  },
                ov.retraceCancelTime && { rawTime: ov.retraceCancelTime, color: "rgba(220, 38, 38, 0.90)", label: "RETR" },
            ].filter(Boolean);
            for (const ev of events) {
                const parsed = normalizeChartTimestamp(ev.rawTime);
                if (parsed == null) continue;
                const snapTime = hasRealCandleTime ? snapFloor(parsed) : parsed;
                if (snapTime == null || !isVisible(snapTime)) continue;
                const x = chart.timeScale().timeToCoordinate(snapTime);
                if (x == null || yMid == null) continue;
                out.push({
                    id: `lifecycle-${ov.tradeId || ov.obId}-${ev.label}`,
                    x,
                    y: yMid,
                    color: ev.color,
                    label: ev.label,
                    overlay: ov,
                });
            }
        }
        return out;
    })();

    // ── Triggered-edge: badge chips pinned to matching OB box pixel position ──
    const triggeredEdgeBadgeShapes = (() => {
        if (!showTriggeredEdgeBadges || !triggeredEdgeOverlays?.length || !overlays?.length) return [];
        const obPixelMap = new Map();
        for (const ob of overlays) {
            const key = obLookupKey(ob.obId || ob.ob_id || ob.id);
            if (key) obPixelMap.set(key, ob);
        }
        // `inval` is kept as the internal badge-state key (maps to
        // INVALID_CANCELLED outcomes from the backend) but the rendered label
        // is now PROTECTED — these setups were saved from a bad fill, not
        // corrupted. Violet palette already wired in BADGE_COLORS below.
        const BADGE_LABELS = { same: "SAME", next: "NEXT", used_ob: "RETRACE", first_failed: "FAILED TAG", never_trig: "NEVER TRIG", inval: "PROTECTED" };
        const BADGE_COLORS = {
            same:         { bg: "rgba(22, 163, 74, 0.88)",   text: "rgba(255,255,255,0.96)" },
            next:         { bg: "rgba(6, 182, 212, 0.85)",   text: "rgba(255,255,255,0.96)" },
            used_ob:      { bg: "rgba(219, 39, 119, 0.88)",  text: "rgba(255,255,255,0.96)" },  // pre-trigger cancel — pink
            first_failed: { bg: "rgba(219, 39, 119, 0.88)",  text: "rgba(255,255,255,0.96)" },  // pre-trigger cancel — pink
            never_trig:   { bg: "rgba(107, 114, 128, 0.82)", text: "rgba(255,255,255,0.92)" },
            inval:        { bg: "rgba(139, 92, 246, 0.82)",  text: "rgba(255,255,255,0.96)" },
        };
        return triggeredEdgeOverlays
            .filter((ov) => {
                if (!showCancelledSetups && (ov.cancelledBeforeEntry || ov.badgeState === "never_trig")) return false;
                return ov.badgeState != null;
            })
            .map((ov) => {
                const key = obLookupKey(ov.obId);
                const obPx = key ? obPixelMap.get(key) : null;
                if (!obPx) return null;
                const label = BADGE_LABELS[ov.badgeState];
                const color = BADGE_COLORS[ov.badgeState];
                if (!label || !color) return null;
                return {
                    id: `trig-badge-${ov.tradeId || ov.obId}`,
                    left: obPx.left + obPx.width,
                    top: obPx.top + 2,
                    label,
                    color,
                    tradeId: ov.tradeId,
                    overlay: ov,
                };
            })
            .filter(Boolean);
    })();

    // ── Ghost tracking: badge chips for Phase 0 observational overlays ───────
    // Rendered on top of existing triggered-edge overlays. Each badge shows
    // what would have happened if the OB had not been cancelled.
    // All four toggles share one computation — they filter by outcome category.
    const ghostBadgeShapes = (() => {
        const anyGhost = showGhostCandidateMarkers || showGhostFillMarkers || showGhostWinMarkers || showGhostLossMarkers;
        if (!anyGhost || !triggeredEdgeOverlays?.length || !overlays?.length) return [];
        const obPixelMap = new Map();
        for (const ob of overlays) {
            const key = obLookupKey(ob.obId || ob.ob_id || ob.id);
            if (key) obPixelMap.set(key, ob);
        }
        const GHOST_OUTCOME_LABEL = {
            WIN: "G:WIN", LOSS: "G:LOSS", BE: "G:BE", BREAKEVEN: "G:BE",
            PROTECTION_EXIT: "G:PROT", UNFILLED: "G:UNFILL",
            NEVER_TRIGGERED: "G:NO-TRIG", INVALIDATED: "G:INVAL",
        };
        const GHOST_OUTCOME_COLOR = {
            WIN:             { bg: "rgba(22, 163, 74, 0.75)",   text: "rgba(255,255,255,0.96)" },
            LOSS:            { bg: "rgba(239, 68, 68, 0.75)",   text: "rgba(255,255,255,0.96)" },
            BE:              { bg: "rgba(107, 114, 128, 0.70)", text: "rgba(255,255,255,0.92)" },
            BREAKEVEN:       { bg: "rgba(107, 114, 128, 0.70)", text: "rgba(255,255,255,0.92)" },
            PROTECTION_EXIT: { bg: "rgba(245, 158, 11, 0.75)", text: "rgba(255,255,255,0.96)" },
            UNFILLED:        { bg: "rgba(100, 116, 139, 0.65)", text: "rgba(255,255,255,0.88)" },
            NEVER_TRIGGERED: { bg: "rgba(100, 116, 139, 0.65)", text: "rgba(255,255,255,0.88)" },
            INVALIDATED:     { bg: "rgba(139, 92, 246, 0.70)",  text: "rgba(255,255,255,0.92)" },
        };
        const out = [];
        for (const ov of triggeredEdgeOverlays) {
            if (!ov.ghost_candidate) continue;
            const outcome = String(ov.ghost_outcome || "").toUpperCase();
            const isWin = outcome === "WIN";
            const isLoss = outcome === "LOSS";
            const isFill = isWin || isLoss || outcome === "BE" || outcome === "BREAKEVEN" || outcome === "PROTECTION_EXIT";
            // Apply visibility filters
            if (!showGhostCandidateMarkers) {
                if (showGhostFillMarkers && !isFill) continue;
                if (showGhostWinMarkers && !isWin) continue;
                if (showGhostLossMarkers && !isLoss) continue;
                if (!showGhostFillMarkers && !showGhostWinMarkers && !showGhostLossMarkers) continue;
            }
            const key = obLookupKey(ov.obId);
            const obPx = key ? obPixelMap.get(key) : null;
            if (!obPx) continue;
            const label = GHOST_OUTCOME_LABEL[outcome] || "G:?";
            const color = GHOST_OUTCOME_COLOR[outcome] || { bg: "rgba(100,116,139,0.65)", text: "rgba(255,255,255,0.88)" };
            out.push({
                id: `ghost-badge-${ov.tradeId || ov.obId}`,
                left: obPx.left + obPx.width,
                top: obPx.top + 18, // offset below the triggered-edge badge
                label,
                color,
                ghostR: ov.ghost_r,
                tradeId: ov.tradeId,
            });
        }
        return out;
    })();

    // ── FFT Debug: entry-edge tap + cancel markers + tap→cancel line ─────────
    // Renders at the OB entry edge (top for bull, bottom for bear) rather than
    // the midpoint used by the regular lifecycle markers.
    // When fftMoveAwayConfig is set and threshold > 0:
    //   - draws a dashed pink threshold line at the activation distance outside the OB
    //   - places the FFT cancel dot at the actual cancel price (obEdge + actualPips)
    const fftDebugMarkers = (() => {
        if (!showFftDebug || !triggeredEdgeOverlays?.length) return { dots: [], lines: [], thresholdLines: [] };
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series) return { dots: [], lines: [], thresholdLines: [] };
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const isVisible = (t) => (rangeFrom == null || t >= rangeFrom) && (rangeTo == null || t <= rangeTo);
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxHeight = bounds?.height || height;
        // Move-away threshold config
        const moveAwayPips = fftMoveAwayConfig?.pips ?? 0;
        const moveAwayObMultiple = fftMoveAwayConfig?.obMultiple ?? 0;
        const pipSize = fftMoveAwayConfig?.pipSize || 0.0001;
        const hasThreshold = moveAwayPips > 0 || moveAwayObMultiple > 0;
        const dots = [];
        const lines = [];
        const thresholdLines = [];
        for (const ov of triggeredEdgeOverlays) {
            if (!showCancelledSetups && (ov.cancelledBeforeEntry || ov.badgeState === "never_trig")) continue;
            // Y = OB entry side: top for bullish, bottom for bearish
            const rawEntryY = ov.direction === "bull"
                ? (ov.obTop != null ? series.priceToCoordinate(ov.obTop) : null)
                : (ov.obBot != null ? series.priceToCoordinate(ov.obBot) : null);
            if (rawEntryY == null) continue;
            const y = clamp(rawEntryY, 0, maxHeight);

            // ── Per-OB threshold computation ──────────────────────────────────
            let effectivePips = 0;
            let thresholdLabel = null;
            let cancelY = y; // default: cancel at entry edge (immediate mode / no data)
            if (hasThreshold && ov.obTop != null && ov.obBot != null && pipSize > 0) {
                const obHeightPips = (ov.obTop - ov.obBot) / pipSize;
                const pipT = moveAwayPips;
                const obT = obHeightPips * moveAwayObMultiple;
                effectivePips = Math.max(pipT, obT);
                const thresholdPriceOffset = effectivePips * pipSize;
                // Threshold line: above OB top for bullish, below OB bottom for bearish
                const thresholdPriceLevel = ov.direction === "bull"
                    ? ov.obTop + thresholdPriceOffset
                    : ov.obBot - thresholdPriceOffset;
                const rawThresholdY = series.priceToCoordinate(thresholdPriceLevel);
                if (rawThresholdY != null) {
                    const tY = clamp(rawThresholdY, 0, maxHeight);
                    // Label: show which threshold is active
                    thresholdLabel = obT > pipT
                        ? `FFT: ${moveAwayObMultiple}× OB`
                        : `FFT: ${effectivePips.toFixed(1)} pips`;
                    thresholdLines.push({
                        id: `fft-threshold-${ov.tradeId || ov.obId}`,
                        y: tY,
                        label: thresholdLabel,
                    });
                }
                // Cancel dot Y: place at actual cancel price when data is available
                const actualPips = ov.fftMoveAwayPipsAtCancel;
                if (actualPips != null) {
                    const actualOffset = Number(actualPips) * pipSize;
                    const actualPrice = ov.direction === "bull"
                        ? ov.obTop + actualOffset
                        : ov.obBot - actualOffset;
                    const rawCancelY = series.priceToCoordinate(actualPrice);
                    if (rawCancelY != null) cancelY = clamp(rawCancelY, 0, maxHeight);
                }
            }

            // TAP dot (indigo) at OB entry edge
            let tapX = null;
            if (ov.tappedTime) {
                const parsed = normalizeChartTimestamp(ov.tappedTime);
                if (parsed != null) {
                    const snap = hasRealCandleTime ? snapFloor(parsed) : parsed;
                    if (snap != null && isVisible(snap)) {
                        tapX = chart.timeScale().timeToCoordinate(snap);
                        if (tapX != null) {
                            dots.push({
                                id: `fft-tap-${ov.tradeId || ov.obId}`,
                                x: tapX, y,
                                color: "rgba(99,102,241,0.95)",
                                label: "TAP",
                                overlay: ov,
                            });
                        }
                    }
                }
            }
            // FFT cancel dot (bright pink) — at actual cancel price when threshold data available
            let cancelX = null;
            if (ov.isFftCancel && ov.fftCancelTime) {
                const parsed = normalizeChartTimestamp(ov.fftCancelTime);
                if (parsed != null) {
                    const snap = hasRealCandleTime ? snapFloor(parsed) : parsed;
                    if (snap != null && isVisible(snap)) {
                        cancelX = chart.timeScale().timeToCoordinate(snap);
                        if (cancelX != null) {
                            const tooltipThreshold = hasThreshold ? `${effectivePips.toFixed(1)} pips` : null;
                            const tooltipActual = ov.fftMoveAwayPipsAtCancel != null
                                ? `${Number(ov.fftMoveAwayPipsAtCancel).toFixed(1)} pips`
                                : null;
                            dots.push({
                                id: `fft-cancel-${ov.tradeId || ov.obId}`,
                                x: cancelX, y: cancelY,
                                color: "rgba(219,39,119,0.95)",
                                label: "FFT",
                                size: "lg",
                                overlay: ov,
                                tooltipThreshold,
                                tooltipActual,
                            });
                        }
                    }
                }
            }
            // Horizontal line from TAP → FFT cancel across OB entry edge
            if (tapX != null && cancelX != null) {
                const x1 = Math.min(tapX, cancelX);
                const x2 = Math.max(tapX, cancelX);
                lines.push({
                    id: `fft-line-${ov.tradeId || ov.obId}`,
                    x1, x2, y,
                    color: "rgba(219,39,119,0.55)",
                });
            }
        }
        return { dots, lines, thresholdLines };
    })();

    // ── Phase 2: clickable trade-marker dots ──────────────────────────────────
    // Lightweight DOM dots rendered at each trade's fill candle. Respects the
    // existing showLongs / showShorts / showWins / showLosses layer toggles.
    // We render dots (rather than re-enabling native LWC markers) so the chart
    // can attach click handlers without changing how lightweight-charts works.
    const tradeMarkerShapes = (() => {
        const chart = chartRef.current;
        const series = seriesRef.current;
        if (!chart || !series || !trades?.length) return [];
        const bounds = containerRef.current?.getBoundingClientRect();
        const maxW = bounds?.width || 0;
        const maxH = bounds?.height || safeHeight;
        const visibleRange = chart.timeScale().getVisibleRange?.();
        const rangeFrom = normalizeChartTimestamp(visibleRange?.from);
        const rangeTo = normalizeChartTimestamp(visibleRange?.to);
        const out = [];
        const seenTrades = new Set();
        for (const raw of trades) {
            const info = resolveTradeMarkerInfo(raw);
            if (!info || info.id == null) continue;
            const dedupKey = String(info.id);
            if (seenTrades.has(dedupKey)) continue;
            seenTrades.add(dedupKey);
            const isLong = info.direction === "long";
            if (isLong && !showLongs) continue;
            if (!isLong && !showShorts) continue;
            if (info.win === true && !showWins) continue;
            if (info.win === false && !showLosses) continue;
            const snap = hasRealCandleTime ? snapFloor(info.time) : info.time;
            if (snap == null) continue;
            if (rangeFrom != null && snap < rangeFrom) continue;
            if (rangeTo != null && snap > rangeTo) continue;
            const x = chart.timeScale().timeToCoordinate(snap);
            const y = series.priceToCoordinate(info.price);
            if (x == null || y == null) continue;
            const selected = selectedKey != null && obLookupKey(info.id) === selectedKey;
            out.push({
                id: `trade-dot-${dedupKey}`,
                tradeId: info.id,
                x: clamp(x, 0, maxW),
                y: clamp(y, 0, maxH),
                direction: info.direction,
                win: info.win,
                selected,
            });
        }
        return out;
    })();

    return (
        <div className="relative w-full overflow-hidden" style={{ height: safeHeight }} data-testid="candle-chart">
            <div
                ref={containerRef}
                className="w-full h-full"
                onClick={(onSelectTrade || onTradeClick) ? () => handleSelectTrade(null) : undefined}
            />
            {/* Overlay layer for OB rectangles */}
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-overlay-version={overlayKey}>
                {sessionOverlays.map((session) => (
                    <SessionOverlay key={session.id} session={session} />
                ))}
                {newsEventLines.map((event) => (
                    <NewsEventLine key={event.id} event={event} showLabel={showNewsLabels} />
                ))}
                {newsBoundaryLines.map((line) => (
                    <NewsBoundaryLine key={line.id} line={line} />
                ))}
                {overlays.map((o, index) => {
                    const selectable = obIsSelectable(o);
                    const obKey = obLookupKey(o.tradeId || o.displayTradeId || o.linkedTradeId || o.obId || o.ob_id || o.id);
                    const selected = !!(selectedKey != null && obKey != null && obKey === selectedKey);
                    return (
                        <OrderBlockOverlay
                            key={o.id}
                            ob={o}
                            debugIndex={index}
                            debugOverlays={debugOverlays}
                            showObLabels={showObLabels}
                            showObDetails={showObDetails}
                            selected={selected}
                            onClick={selectable ? () => handleObClick(o) : undefined}
                        />
                    );
                })}
                {obMarkers.map((marker) => (
                    <OrderBlockMarker key={marker.id} marker={marker} />
                ))}
                {/* Triggered-edge: trigger level dashed lines */}
                {triggeredEdgeLevelShapes.map((shape) => (
                    <TriggeredEdgeLevelLine key={shape.id} shape={shape} />
                ))}
                {/* Triggered-edge: lifecycle event dot markers */}
                {triggeredEdgeLifecycleMarkers.map((m) => (
                    <TriggeredEdgeLifecycleMarker
                        key={m.id}
                        marker={m}
                        onClick={onSelectOverlay ? () => { onSelectOverlay(m.overlay); } : undefined}
                    />
                ))}
                {/* Triggered-edge: OB badge chips */}
                {triggeredEdgeBadgeShapes.map((b) => {
                    const badgeKey = obLookupKey(b.tradeId);
                    const selected = !!(selectedKey != null && badgeKey != null && badgeKey === selectedKey);
                    const handleBadgeClick = () => {
                        if (onSelectOverlay && b.overlay) onSelectOverlay(b.overlay);
                        // Also open IntrabarInspector for filled (non-cancelled) trades
                        if (onSelectTrade && b.tradeId && !b.overlay?.cancelledBeforeEntry) {
                            handleSelectTrade(b.tradeId);
                        }
                    };
                    return (
                        <TriggeredEdgeBadge
                            key={b.id}
                            badge={b}
                            selected={selected}
                            onClick={(onSelectTrade || onSelectOverlay) ? handleBadgeClick : undefined}
                        />
                    );
                })}
                {/* Ghost tracking: outcome badge chips (Phase 0 — observational) */}
                {ghostBadgeShapes.map((b) => (
                    <div
                        key={b.id}
                        className="absolute pointer-events-none select-none"
                        style={{
                            left: b.left + 1,
                            top: b.top,
                            background: b.color.bg,
                            color: b.color.text,
                            fontSize: 7,
                            fontFamily: "var(--font-ui)",
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            padding: "1px 3px",
                            borderRadius: 0,
                            whiteSpace: "nowrap",
                            zIndex: 14,
                            border: "1px dashed rgba(255,255,255,0.35)",
                            opacity: 0.9,
                        }}
                    >
                        {b.label}{b.ghostR != null ? ` ${b.ghostR >= 0 ? "+" : ""}${b.ghostR.toFixed(1)}R` : ""}
                    </div>
                ))}
                {/* FFT Debug: move-away threshold lines — dashed pink, full-width, labeled */}
                {fftDebugMarkers.thresholdLines.map((line) => (
                    <FftThresholdLine key={line.id} line={line} />
                ))}
                {/* FFT Debug: tap→cancel horizontal lines at OB entry edge */}
                {fftDebugMarkers.lines.map((line) => (
                    <FftDebugLine key={line.id} line={line} />
                ))}
                {/* FFT Debug: TAP (indigo) and FFT (pink) dots at OB entry edge */}
                {fftDebugMarkers.dots.map((dot) => (
                    <FftDebugDot
                        key={dot.id}
                        dot={dot}
                        onClick={onSelectOverlay && dot.overlay ? () => onSelectOverlay(dot.overlay) : undefined}
                    />
                ))}
                {/* Phase 2: clickable trade-marker dots */}
                {tradeMarkerShapes.map((dot) => (
                    <TradeMarkerDot
                        key={dot.id}
                        dot={dot}
                        onClick={onSelectTrade ? () => handleSelectTrade(dot.tradeId) : undefined}
                    />
                ))}
                {rrToolShapes.map((shape) => (
                    <div
                        key={shape.id}
                        className="absolute"
                        style={{
                            left: shape.left,
                            width: shape.width,
                            top: shape.top,
                            height: shape.height,
                            background: shape.kind === "reward" ? rewardFill : riskFill,
                            borderRadius: 0,
                            boxShadow: "none",
                            zIndex: 11,
                        }}
                    >
                        {shape.label && (
                            <span
                                className="absolute left-1 top-1 px-1 py-0.5 rounded-sm text-[9px] font-semibold"
                                style={{ color: "rgba(55, 65, 81, 0.92)", background: "rgba(248, 250, 252, 0.86)" }}
                            >
                                {shape.label}
                            </span>
                        )}
                    </div>
                ))}
                {verificationShapes && (
                    <>
                        {verificationShapes.rewardTop != null && (
                            <div
                                data-testid="verification-reward-box"
                                className="absolute"
                                style={{
                                    left: verificationShapes.left,
                                    width: verificationShapes.width,
                                    top: verificationShapes.rewardTop,
                                    height: verificationShapes.rewardHeight,
                                    background: rewardFill,
                                    boxShadow: `inset 0 0 0 1px ${rewardStroke}`,
                                }}
                            />
                        )}
                        {verificationShapes.riskTop != null && (
                            <div
                                data-testid="verification-risk-box"
                                className="absolute"
                                style={{
                                    left: verificationShapes.left,
                                    width: verificationShapes.width,
                                    top: verificationShapes.riskTop,
                                    height: verificationShapes.riskHeight,
                                    background: riskFill,
                                    boxShadow: `inset 0 0 0 1px ${riskStroke}`,
                                }}
                            />
                        )}
                    </>
                )}
                {debugOverlays && <OverlayDebugPanel info={debugInfo} />}
            </div>
        </div>
    );
}

function OverlayDebugPanel({ info }) {
    const first = info.firstOb || {};
    return (
        <div className="absolute top-2 left-2 z-20 max-w-[360px] pointer-events-none rounded-sm border border-black/15 bg-white/90 px-2 py-1.5 font-code text-[9px] leading-snug text-slate-800 shadow-sm">
            <div>candles: {info.candleCount} · real times: {String(info.hasRealCandleTime)}</div>
            <div>first/last: {formatDebugTime(info.firstCandleTime)} → {formatDebugTime(info.lastCandleTime)}</div>
            <div>OB recv/drawn/skipped: {info.obCount} / {info.obsDrawn} / {info.obsSkipped}</div>
            <div>skip time/x/price/scale: {info.skipReasons.missingTime}/{info.skipReasons.xNullOffscreen}/{info.skipReasons.missingPrice}/{info.skipReasons.priceScaleNull}</div>
            <div>RR recv/drawn/skipped: {String(info.verificationReceived)} / {info.rrDrawn} / {info.rrSkipped}</div>
            <div>markers recv: {info.tradeMarkersCount}</div>
            <div>first OB: {formatDebugTime(first.time0)} → {formatDebugTime(first.time1)} · {first.top ?? "?"}/{first.bot ?? "?"}</div>
            <div>first status: {first.status || first.outcome || first.result || first.side || "none"}</div>
            <div>overlay right: {formatDebugTime(info.selectedRightEdge)}</div>
        </div>
    );
}

function SessionOverlay({ session }) {
    const palette = {
        asia: "rgba(99, 102, 241, 0.07)",
        london: "rgba(6, 182, 212, 0.075)",
        londonLull: "rgba(217, 119, 6, 0.065)",
        newYork: "rgba(22, 163, 74, 0.07)",
    };
    const fill = palette[session.colorKey] || "rgba(107, 114, 128, 0.055)";
    return (
        <div
            className="absolute top-0"
            title={session.label}
            style={{
                left: session.left,
                width: session.width,
                height: session.height,
                background: fill,
                zIndex: 1,
            }}
        />
    );
}

function formatDebugTime(value) {
    const ts = normalizeChartTimestamp(value);
    if (ts == null) return "missing";
    return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function obDetailsContent(ob) {
    const rawId = ob.obId || ob.ob_id || ob.id || "";
    const idNum = String(rawId).match(/\d+/) ? String(Number(String(rawId).match(/\d+/)[0])) : String(rawId);
    const idText = idNum ? `OB-${idNum}` : "OB";
    const side = normalizeText(ob.direction || ob.side || ob.obDirection || "");
    const isBull = side.includes("bull") || side.includes("long");
    const dirText = isBull ? "BULL" : "BEAR";
    const outcome = normalizeText(ob.outcome || ob.statusLabel || ob.obFinalStatusLabel || ob.status || ob.obFinalStatus || "");
    const cancelRaw = String(ob.cancel_reason || ob.cancelReason || "").trim();
    const cancelNorm = normalizeText(cancelRaw);

    let statusText = "";
    if (cancelNorm.includes("inval") || cancelNorm.includes("before_entry")) {
        // Cancel reason "invalidated_before_edge_entry" → entry was protected
        // by the model before a bad fill. Violet palette / "PROTECTED" label
        // is applied consistently across the app.
        statusText = "PROTECTED";
    } else if (cancelNorm.includes("retrace")) {
        statusText = "USED OB";
    } else if (outcome.includes("win") || outcome === "tp") {
        statusText = "WIN";
    } else if (outcome.includes("loss") || outcome === "sl") {
        statusText = "LOSS";
    } else if (outcome === "be" || outcome.includes("breakeven")) {
        statusText = "BE";
    } else if (outcome.includes("never_trig") || outcome.includes("never trig") || cancelNorm.includes("never")) {
        statusText = "NEVER TRIG";
    } else if (outcome.includes("invalid")) {
        // Raw outcome "INVALID" from the backend — same protection event,
        // surfaced via the outcome column instead of the cancel_reason field.
        statusText = "PROTECTED";
    } else if (outcome.includes("news")) {
        statusText = "NEWS";
    } else if (outcome.includes("session")) {
        statusText = "SESSION";
    } else if (outcome) {
        statusText = outcome.replace(/_/g, " ").toUpperCase().slice(0, 14);
    } else {
        statusText = "OPEN";
    }

    const rVal = ob.resultR != null && isFinite(Number(ob.resultR)) ? Number(ob.resultR) : null;
    const rText = rVal != null ? `${rVal >= 0 ? "+" : ""}${rVal.toFixed(1)}R` : null;

    // Cancel-reason readout in the OB tooltip / detail panel. The backend
    // emits "invalidated_before_edge_entry"; we render the protection-framed
    // short form so it stays consistent with the chip and badge text.
    const cancelDisplay = cancelRaw
        ? cancelRaw.replace(/_/g, " ").replace(/invalidated before edge entry/i, "protected pre-entry").slice(0, 28)
        : null;
    const structTag = String(ob.structureTag || ob.structure_tag || ob.structure || ob.tag || "").trim();
    const structDisplay = structTag ? structTag.replace(/_/g, " ").slice(0, 18) : null;

    return { idText, dirText, statusText, rText, cancelDisplay, structDisplay };
}

function OrderBlockOverlay({ ob, debugIndex = 0, debugOverlays = false, showObLabels = false, showObDetails = false, selected = false, onClick }) {
    const visual = resolveObVisual(ob);
    const interactive = !!onClick;
    const selectionRing = selected
        ? "0 0 0 2px rgba(56, 189, 248, 0.92), 0 0 6px rgba(56, 189, 248, 0.45)"
        : "none";
    const borderColor = selected ? "rgba(14, 116, 144, 0.92)" : visual.border;

    return (
        <div
            data-testid={`ob-overlay-${ob.id}`}
            data-selected={selected ? "true" : "false"}
            className="absolute"
            onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            title={interactive ? "Click to inspect this trade" : undefined}
            style={{
                left: ob.left,
                width: ob.width,
                top: ob.top,
                height: ob.height,
                background: visual.fill,
                border: `${selected ? 2 : 1}px solid ${borderColor}`,
                boxShadow: selectionRing,
                zIndex: selected ? 13 : 12,
                pointerEvents: interactive ? "auto" : "none",
                cursor: interactive ? "pointer" : "default",
            }}
        >
            {showObLabels && !showObDetails && (
                <span
                    className="absolute top-0.5 left-1 text-[8.5px] font-code px-1 leading-[11px]"
                    style={{ color: visual.label, background: "rgba(255, 255, 255, 0.78)" }}
                >
                    {orderBlockLabelText(ob, debugOverlays)}
                </span>
            )}
            {showObDetails && (() => {
                const { idText, dirText, statusText, rText, cancelDisplay, structDisplay } = obDetailsContent(ob);
                const borderColor = visual.border;
                const labelColor = visual.label;
                return (
                    <div
                        className="absolute right-0 font-code pointer-events-none"
                        style={{
                            top: ob.height >= 28 ? 2 : -20,
                            right: 2,
                            maxWidth: Math.max(ob.width - 4, 100),
                            background: "rgba(248, 250, 252, 0.93)",
                            border: `1px solid ${borderColor}`,
                            borderRadius: 2,
                            padding: "1px 4px",
                            zIndex: 20,
                            whiteSpace: "nowrap",
                        }}
                    >
                        <div
                            className="text-[8px] font-bold leading-[11px] tracking-wide"
                            style={{ color: labelColor }}
                        >
                            {idText} · {dirText} · {statusText}{rText ? ` · ${rText}` : ""}
                        </div>
                        {cancelDisplay && (
                            <div className="text-[7px] leading-[10px] opacity-80" style={{ color: labelColor }}>
                                {cancelDisplay}
                            </div>
                        )}
                        {!cancelDisplay && structDisplay && (
                            <div className="text-[7px] leading-[10px] opacity-70" style={{ color: labelColor }}>
                                {structDisplay}
                            </div>
                        )}
                    </div>
                );
            })()}
            {debugOverlays && debugIndex < 3 && (
                <span
                    className="absolute left-1/2 top-1/2 text-[10px] font-code font-bold tracking-wider px-1.5 py-0.5"
                    style={{
                        transform: "translate(-50%, -50%)",
                        color: "#111827",
                        background: "rgba(255,255,255,0.95)",
                        border: `2px solid ${visual.border}`,
                    }}
                >
                    DEBUG OB
                </span>
            )}
        </div>
    );
}

function OrderBlockMarker({ marker }) {
    const isOrigin = marker.kind === "origin";
    const color = isOrigin ? "rgba(6, 182, 212, 0.58)" : "rgba(17, 24, 39, 0.82)";
    const fill = isOrigin ? "rgba(6, 182, 212, 0.08)" : "rgba(17, 24, 39, 0.06)";
    return (
        <div
            className="absolute"
            style={{
                left: marker.x,
                top: marker.top,
                transform: "translateX(-0.5px)",
                width: 1,
                height: marker.height,
                borderLeft: `1px solid ${color}`,
                background: fill,
                zIndex: 14,
            }}
        >
            {marker.label && (
                <span
                    className="absolute left-1 top-0 whitespace-nowrap font-code text-[8px] leading-[9px] px-0.5"
                    style={{
                        color,
                        background: "rgba(255,255,255,0.7)",
                    }}
                >
                    {marker.label}
                </span>
            )}
        </div>
    );
}

// ── Triggered-edge overlay components ─────────────────────────────────────────

function TriggeredEdgeLevelLine({ shape }) {
    return (
        <div
            className="absolute pointer-events-none"
            style={{
                left: shape.left,
                top: shape.y,
                width: shape.width,
                height: 1,
                borderTop: `1px dashed ${shape.color?.border || "rgba(245, 158, 11, 0.68)"}`,
                zIndex: 13,
            }}
        >
            {shape.label && (
                <span
                    className="absolute right-0.5 whitespace-nowrap font-ui text-[7px] leading-[8px] px-0.5"
                    style={{
                        top: -8,
                        color: shape.color?.text || "rgba(161, 93, 0, 0.88)",
                        background: shape.color?.bg || "rgba(255, 255, 255, 0.70)",
                    }}
                >
                    {shape.label}
                </span>
            )}
        </div>
    );
}

function TriggeredEdgeLifecycleMarker({ marker, onClick }) {
    const interactive = !!onClick;
    return (
        <div
            className={`absolute rounded-full ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
            title={`${marker.label}${marker.overlay?.cancelReason ? ` · ${marker.overlay.cancelReason}` : ""}`}
            onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            style={{
                left: marker.x - 4,
                top: marker.y - 4,
                width: 8,
                height: 8,
                background: marker.color,
                zIndex: 15,
                cursor: interactive ? "pointer" : "default",
            }}
        />
    );
}

function FftDebugDot({ dot, onClick }) {
    const size = dot.size === "lg" ? 10 : 7;
    const interactive = !!onClick;
    const titleParts = [
        dot.label,
        dot.overlay?.cancelReason ? `· ${dot.overlay.cancelReason}` : null,
        dot.tooltipThreshold ? `Threshold: ${dot.tooltipThreshold}` : null,
        dot.tooltipActual ? `Actual: ${dot.tooltipActual}` : null,
    ].filter(Boolean);
    return (
        <div
            className={`absolute rounded-full ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
            title={titleParts.join(" | ")}
            onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            style={{
                left: dot.x - size / 2,
                top: dot.y - size / 2,
                width: size,
                height: size,
                background: dot.color,
                zIndex: 18,
                cursor: interactive ? "pointer" : "default",
                boxShadow: `0 0 4px ${dot.color}`,
            }}
        />
    );
}

function FftThresholdLine({ line }) {
    return (
        <div
            className="absolute pointer-events-none"
            style={{
                left: 0,
                right: 0,
                top: line.y,
                height: 1,
                zIndex: 16,
            }}
        >
            <div style={{
                width: "100%",
                height: "100%",
                borderTop: "1px dashed rgba(219,39,119,0.65)",
            }} />
            {line.label && (
                <span style={{
                    position: "absolute",
                    right: 6,
                    top: -11,
                    fontSize: 9,
                    fontFamily: "ui-monospace, monospace",
                    color: "rgba(219,39,119,0.90)",
                    background: "rgba(0,0,0,0.55)",
                    padding: "1px 4px",
                    borderRadius: 2,
                    whiteSpace: "nowrap",
                    letterSpacing: "0.03em",
                }}>
                    {line.label}
                </span>
            )}
        </div>
    );
}

function FftDebugLine({ line }) {
    return (
        <div
            className="absolute pointer-events-none"
            style={{
                left: line.x1,
                top: line.y,
                width: line.x2 - line.x1,
                height: 1,
                borderTop: `1px solid ${line.color}`,
                zIndex: 17,
            }}
        />
    );
}

function TriggeredEdgeBadge({ badge, selected = false, onClick }) {
    const interactive = !!onClick;
    return (
        <div
            className={`absolute ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
            data-selected={selected ? "true" : "false"}
            onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            title={interactive ? "Click to inspect this trade" : undefined}
            style={{
                left: badge.left,
                top: badge.top,
                zIndex: selected ? 17 : 16,
                transform: "translateX(-100%)",
                cursor: interactive ? "pointer" : "default",
            }}
        >
            <span
                className="whitespace-nowrap font-ui leading-[10px] px-1 py-px rounded-sm"
                style={{
                    fontSize: "7.5px",
                    background: badge.color.bg,
                    color: badge.color.text,
                    boxShadow: selected
                        ? "0 0 0 2px rgba(56, 189, 248, 0.92), 0 0 4px rgba(56, 189, 248, 0.5)"
                        : "none",
                    outline: "none",
                }}
            >
                {badge.label}
            </span>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────

// Phase 2: clickable trade marker rendered as a small DOM dot. Subtle by default;
// pops when selected so the user can see which trade owns the Intrabar Inspector.
function TradeMarkerDot({ dot, onClick }) {
    const interactive = !!onClick;
    const baseColor = dot.win === true
        ? "rgba(22, 163, 74, 0.85)"
        : dot.win === false
            ? "rgba(220, 38, 38, 0.85)"
            : "rgba(107, 114, 128, 0.78)";
    const size = dot.selected ? 11 : 7;
    const offset = size / 2;
    return (
        <div
            className={interactive ? "pointer-events-auto" : "pointer-events-none"}
            data-testid={`trade-marker-${dot.tradeId}`}
            data-selected={dot.selected ? "true" : "false"}
            onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            title={interactive ? `Trade ${dot.tradeId} — click to inspect` : undefined}
            style={{
                position: "absolute",
                left: dot.x - offset,
                top: dot.y - offset,
                width: size,
                height: size,
                borderRadius: "50%",
                background: baseColor,
                border: `${dot.selected ? 2 : 1}px solid rgba(255,255,255,0.95)`,
                boxShadow: dot.selected
                    ? "0 0 0 2px rgba(56, 189, 248, 0.92), 0 0 6px rgba(56, 189, 248, 0.5)"
                    : "0 0 2px rgba(15, 23, 42, 0.35)",
                cursor: interactive ? "pointer" : "default",
                zIndex: dot.selected ? 20 : 18,
                opacity: dot.selected ? 1 : 0.78,
            }}
        />
    );
}

// ──────────────────────────────────────────────────────────────────────────────

function NewsBoundaryLine({ line }) {
    const isStart = line.side === "start";
    const color = isStart ? "rgba(217, 119, 6, 0.58)" : "rgba(20, 184, 166, 0.5)";
    return (
        <div
            className="absolute pointer-events-none"
            title={isStart ? "News blackout start" : "News blackout end"}
            style={{
                left: line.x,
                top: line.top,
                height: line.height,
                width: 1,
                borderLeft: `1px dashed ${color}`,
                zIndex: 8,
            }}
        />
    );
}

function NewsEventLine({ event, showLabel = false }) {
    const palette = {
        high: {
            line: "rgba(185, 28, 28, 0.72)",
            fill: "rgba(254, 226, 226, 0.92)",
            text: "rgba(127, 29, 29, 0.96)",
            border: "rgba(185, 28, 28, 0.38)",
        },
        medium: {
            line: "rgba(217, 119, 6, 0.68)",
            fill: "rgba(254, 243, 199, 0.94)",
            text: "rgba(120, 53, 15, 0.96)",
            border: "rgba(217, 119, 6, 0.34)",
        },
        low: {
            line: "rgba(107, 114, 128, 0.5)",
            fill: "rgba(243, 244, 246, 0.94)",
            text: "rgba(55, 65, 81, 0.9)",
            border: "rgba(107, 114, 128, 0.28)",
        },
    };
    const color = palette[event.impact] || palette.medium;
    return (
        <div
            className="absolute pointer-events-auto"
            title={event.tooltip}
            style={{
                left: event.x,
                bottom: event.bottom,
                height: event.height,
                width: 1,
                borderLeft: `1px solid ${color.line}`,
                zIndex: 9,
            }}
        >
            <span
                className="absolute rounded-full"
                style={{
                    left: -2.5,
                    bottom: -2,
                    width: 6,
                    height: 6,
                    background: color.line,
                    border: `1px solid ${color.border}`,
                }}
            />
            {showLabel && (
                <span
                    className="absolute left-1 whitespace-nowrap rounded-sm font-ui text-[8px] leading-[9px] px-1 py-0.5"
                    style={{
                        bottom: event.height + 3,
                        color: color.text,
                        background: color.fill,
                        border: `1px solid ${color.border}`,
                    }}
                >
                    {event.label}
                </span>
            )}
        </div>
    );
}
