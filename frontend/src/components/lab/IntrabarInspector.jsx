// IntrabarInspector — Phase 1 click-to-pin M1 magnifier for Strategy Map.
//
// Renders a small floating card anchored inside the chart panel. Shows a
// second lightweight-charts instance fed from the run's raw sourceCandles
// for a narrow time window around the selected trade's trigger / fill /
// detection event, with OB band, trigger / entry / stop level lines, and
// lifecycle event markers.
//
// Self-contained: copies the small helpers it needs (normalizeChartTimestamp,
// candleTimeOf, formatters) instead of importing from CandleChart, so this
// component can evolve without touching the main chart.
//
// Activation in Phase 1: parent (StrategyMap) passes the resolved selectedTrade
// + matching triggeredEdgeOverlay derived from selectedTradeId. Future phases
// will add chart-marker / OB-box / triggered-edge-badge click activation.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { X, Pin } from "lucide-react";

const INSPECTOR_POS_KEY = "fxob_strategy_map_inspector_pos_v1";
const DEFAULT_LEAD_MIN = 15;
const DEFAULT_TRAIL_MIN = 30;
const INSPECTOR_WIDTH = 360;
const INSPECTOR_HEIGHT = 260;
const HEADER_HEIGHT = 22;
const STATUS_HEIGHT = 16;
const FOOTER_HEIGHT = 28;
const CHART_HEIGHT = INSPECTOR_HEIGHT - HEADER_HEIGHT - STATUS_HEIGHT - FOOTER_HEIGHT; // 194px

const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONO_FONT = "JetBrains Mono, Menlo, monospace";
const UI_FONT = "IBM Plex Sans, Inter, system-ui, sans-serif";

function padUtc(value) {
    return String(value).padStart(2, "0");
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

function candleTimeOf(c) {
    return normalizeChartTimestamp(c?.time ?? c?.t ?? c?.timestamp ?? c?.datetime);
}

function numericOrNull(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

function normalizeFormatterTime(value) {
    if (value && typeof value === "object") {
        if (value.timestamp != null) return normalizeChartTimestamp(value.timestamp);
        if (value.time != null) return normalizeChartTimestamp(value.time);
        if (value.year != null && value.month != null && value.day != null) {
            return Math.floor(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)) / 1000);
        }
    }
    return normalizeChartTimestamp(value);
}

function formatUtcInspector(value) {
    const ts = normalizeFormatterTime(value);
    if (ts == null) return "";
    const date = new Date(ts * 1000);
    const month = UTC_MONTHS[date.getUTCMonth()];
    const day = padUtc(date.getUTCDate());
    const hh = padUtc(date.getUTCHours());
    const mm = padUtc(date.getUTCMinutes());
    return `${day} ${month} ${hh}:${mm} UTC`;
}

function formatUtcTickMark(value) {
    const ts = normalizeFormatterTime(value);
    if (ts == null) return "";
    const date = new Date(ts * 1000);
    const hh = padUtc(date.getUTCHours());
    const mm = padUtc(date.getUTCMinutes());
    return `${hh}:${mm}`;
}

function loadPos() {
    try {
        const raw = localStorage.getItem(INSPECTOR_POS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Number.isFinite(parsed.top) && Number.isFinite(parsed.left)) return parsed;
    } catch {
        // ignore
    }
    return null;
}

function savePos(pos) {
    try {
        localStorage.setItem(INSPECTOR_POS_KEY, JSON.stringify(pos));
    } catch {
        // ignore
    }
}

// Slice a sorted-by-time candle array. Uses binary search above 50k candles,
// linear filter otherwise (the typical Strategy Map run is under that).
function sliceCandlesByTime(candles, windowStart, windowEnd) {
    if (!candles?.length) return [];
    if (candles.length <= 50000) {
        return candles.filter((c) => {
            const t = candleTimeOf(c);
            return t != null && t >= windowStart && t <= windowEnd;
        });
    }
    const times = candles.map(candleTimeOf);
    let lo = 0;
    let hi = candles.length - 1;
    let loIdx = candles.length;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = times[mid];
        if (t != null && t >= windowStart) {
            loIdx = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    lo = 0;
    hi = candles.length - 1;
    let hiIdx = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = times[mid];
        if (t != null && t <= windowEnd) {
            hiIdx = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (loIdx > hiIdx) return [];
    return candles.slice(loIdx, hiIdx + 1).filter((c) => candleTimeOf(c) != null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function IntrabarInspector({
    selectedTrade,
    triggeredEdgeOverlay,
    sourceCandles,
    sourceIsFine,
    medianCandleGapSec,
    onClose,
}) {
    const wrapperRef = useRef(null);
    const dragRef = useRef(null);
    const [position, setPosition] = useState(loadPos);
    const [pinned, setPinned] = useState(false); // visual toggle in Phase 1; behavior reserved for Phase 2
    const [leadMinutes, setLeadMinutes] = useState(DEFAULT_LEAD_MIN);
    const [trailMinutes, setTrailMinutes] = useState(DEFAULT_TRAIL_MIN);

    // Compute initial right-aligned position if none was persisted.
    // Also clamp a stale persisted position back into the visible area (e.g.
    // if the chart panel is narrower than when the position was last saved).
    useLayoutEffect(() => {
        const parent = wrapperRef.current?.offsetParent;
        if (!parent) return;
        const parentW = parent.clientWidth || 800;
        const parentH = parent.clientHeight || 600;
        if (!position) {
            setPosition({ top: 8, left: Math.max(8, parentW - INSPECTOR_WIDTH - 8) });
            return;
        }
        const maxLeft = Math.max(0, parentW - INSPECTOR_WIDTH);
        const maxTop = Math.max(0, parentH - HEADER_HEIGHT);
        const clampedLeft = Math.max(0, Math.min(maxLeft, position.left));
        const clampedTop = Math.max(0, Math.min(maxTop, position.top));
        if (clampedLeft !== position.left || clampedTop !== position.top) {
            const clamped = { top: clampedTop, left: clampedLeft };
            savePos(clamped);
            setPosition(clamped);
        }
    }, [position]);

    // Window-level drag handlers (mirrors CandleChart's resize pattern).
    useEffect(() => {
        const onMove = (e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            const parent = wrapperRef.current?.offsetParent;
            const parentW = parent?.clientWidth || 800;
            const parentH = parent?.clientHeight || 600;
            const nextLeft = Math.max(0, Math.min(Math.max(0, parentW - INSPECTOR_WIDTH), dragRef.current.startLeft + dx));
            const nextTop = Math.max(0, Math.min(Math.max(0, parentH - HEADER_HEIGHT), dragRef.current.startTop + dy));
            setPosition({ top: nextTop, left: nextLeft });
        };
        const onUp = () => {
            if (!dragRef.current) return;
            dragRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setPosition((cur) => {
                if (cur) savePos(cur);
                return cur;
            });
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    const startDrag = (e) => {
        if (!position) return;
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startLeft: position.left,
            startTop: position.top,
        };
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
    };

    // ESC closes the inspector.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Resolution order for center time. First non-null wins.
    const centerTime = useMemo(() => {
        const order = [
            triggeredEdgeOverlay?.triggerTime,
            selectedTrade?.entry,
            triggeredEdgeOverlay?.detectionTime,
            selectedTrade?.obOriginTime,
        ];
        for (const v of order) {
            const t = normalizeChartTimestamp(v);
            if (t != null) return t;
        }
        return null;
    }, [triggeredEdgeOverlay, selectedTrade]);

    const windowStart = centerTime != null ? centerTime - leadMinutes * 60 : null;
    const windowEnd = centerTime != null ? centerTime + trailMinutes * 60 : null;

    const slicedCandles = useMemo(() => {
        if (windowStart == null || windowEnd == null) return [];
        return sliceCandlesByTime(sourceCandles || [], windowStart, windowEnd);
    }, [sourceCandles, windowStart, windowEnd]);

    // Levels and events extracted from the resolved overlay + trade.
    const levels = useMemo(() => ({
        obTop: numericOrNull(triggeredEdgeOverlay?.obTop ?? selectedTrade?.obTop),
        obBot: numericOrNull(triggeredEdgeOverlay?.obBot ?? selectedTrade?.obBottom),
        triggerPrice: numericOrNull(triggeredEdgeOverlay?.triggerPrice),
        triggerPenetrationPct: numericOrNull(triggeredEdgeOverlay?.triggerPenetrationPct ?? selectedTrade?.trigger_penetration_pct),
        entryPrice: numericOrNull(triggeredEdgeOverlay?.entryPrice ?? selectedTrade?.entryPrice ?? selectedTrade?.actual_entry_price ?? selectedTrade?.planned_entry_price),
        stopPrice: numericOrNull(selectedTrade?.stop),
        tpPrice: numericOrNull(selectedTrade?.tp),
    }), [triggeredEdgeOverlay, selectedTrade]);

    const events = useMemo(() => ({
        obDetectionTime: normalizeChartTimestamp(triggeredEdgeOverlay?.detectionTime ?? selectedTrade?.obDetectionTime ?? selectedTrade?.detected),
        tappedTime: normalizeChartTimestamp(triggeredEdgeOverlay?.tappedTime ?? selectedTrade?.tapped_time),
        triggerTime: normalizeChartTimestamp(triggeredEdgeOverlay?.triggerTime ?? selectedTrade?.trigger_time),
        armedAt: normalizeChartTimestamp(triggeredEdgeOverlay?.armedAt ?? selectedTrade?.armed_at),
        fillTime: normalizeChartTimestamp(selectedTrade?.entry),
        edgeRevisitTime: normalizeChartTimestamp(triggeredEdgeOverlay?.edgeRevisitTime ?? selectedTrade?.edge_revisit_time),
        retraceCancelTime: normalizeChartTimestamp(triggeredEdgeOverlay?.retraceCancelTime ?? selectedTrade?.retrace_cancel_time),
        exitTime: normalizeChartTimestamp(selectedTrade?.exit),
        invalidationTime: normalizeChartTimestamp(selectedTrade?.invalidationTime ?? selectedTrade?.invalidation_time),
    }), [triggeredEdgeOverlay, selectedTrade]);

    // Header bits
    const tradeIdLabel = String(selectedTrade?.displayTradeId || selectedTrade?.id || "—");
    const obIdLabel = String(selectedTrade?.displayObId || selectedTrade?.obId || triggeredEdgeOverlay?.obId || "—");
    const rawDirection = String(triggeredEdgeOverlay?.direction || selectedTrade?.direction || "");
    const direction = (rawDirection.toLowerCase().startsWith("bear") || rawDirection.toLowerCase().startsWith("s")) ? "bear" : "bull";
    const directionLabel = direction.toUpperCase();
    const badgeState = triggeredEdgeOverlay?.badgeState;
    const badgeLabel = badgeState ? String(badgeState).toUpperCase() : "";

    // Status sub-line bits
    const cancelReason = triggeredEdgeOverlay?.cancelReason || selectedTrade?.cancel_reason || "";
    const resultR = numericOrNull(selectedTrade?.r ?? selectedTrade?.net_r);
    const outcomeLabel = String(selectedTrade?.outcome || "").toUpperCase();

    // ── Render ────────────────────────────────────────────────────────────────
    if (!selectedTrade) return null;
    if (!position) {
        // Hidden placeholder so the layout effect can read offsetParent dimensions
        return <div ref={wrapperRef} style={{ position: "absolute", visibility: "hidden" }} />;
    }

    const isUnavailable = !sourceIsFine;
    const containerStyle = {
        position: "absolute",
        top: position.top,
        left: position.left,
        width: INSPECTOR_WIDTH,
        height: isUnavailable ? (HEADER_HEIGHT + 56) : INSPECTOR_HEIGHT,
        zIndex: 30,
        background: "rgba(248, 250, 252, 0.98)",
        border: "1px solid rgba(15, 23, 42, 0.22)",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.18)",
        borderRadius: 4,
        fontFamily: UI_FONT,
        color: "rgba(15, 23, 42, 0.92)",
        overflow: "hidden",
    };

    return (
        <div ref={wrapperRef} style={containerStyle} data-testid="intrabar-inspector">
            <Header
                tradeIdLabel={tradeIdLabel}
                obIdLabel={obIdLabel}
                directionLabel={directionLabel}
                badgeLabel={badgeLabel}
                pinned={pinned}
                onTogglePin={() => setPinned((v) => !v)}
                onClose={onClose}
                onDragStart={startDrag}
            />
            {!isUnavailable && (
                <StatusLine
                    outcomeLabel={outcomeLabel}
                    resultR={resultR}
                    cancelReason={cancelReason}
                />
            )}
            {isUnavailable ? (
                <UnavailableMessage medianCandleGapSec={medianCandleGapSec} />
            ) : (
                <>
                    <MiniChart
                        candles={slicedCandles}
                        levels={levels}
                        events={events}
                        direction={direction}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                    />
                    <Footer
                        leadMinutes={leadMinutes}
                        trailMinutes={trailMinutes}
                        onLead={setLeadMinutes}
                        onTrail={setTrailMinutes}
                    />
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

const iconBtnStyle = {
    background: "transparent",
    border: "none",
    color: "rgba(248, 250, 252, 0.86)",
    cursor: "pointer",
    padding: "0 3px",
    display: "inline-flex",
    alignItems: "center",
};

function Header({ tradeIdLabel, obIdLabel, directionLabel, badgeLabel, pinned, onTogglePin, onClose, onDragStart }) {
    const headerTitle = `M1 intrabar view · ${tradeIdLabel} · ${obIdLabel} · ${directionLabel}${badgeLabel ? ` · ${badgeLabel}` : ""}`;
    return (
        <div
            onMouseDown={onDragStart}
            style={{
                height: HEADER_HEIGHT,
                background: "rgba(15, 23, 42, 0.92)",
                color: "rgba(248, 250, 252, 0.96)",
                display: "flex",
                alignItems: "center",
                padding: "0 6px",
                fontSize: 10,
                fontFamily: MONO_FONT,
                cursor: "grab",
                userSelect: "none",
                gap: 6,
            }}
            title="Drag to reposition"
        >
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {headerTitle}
            </span>
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onTogglePin}
                title={pinned ? "Pinned" : "Pin"}
                aria-pressed={pinned}
                style={{ ...iconBtnStyle, opacity: pinned ? 1 : 0.6 }}
            >
                <Pin size={11} />
            </button>
            <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onClose}
                title="Close (Esc)"
                style={iconBtnStyle}
            >
                <X size={11} />
            </button>
        </div>
    );
}

function StatusLine({ outcomeLabel, resultR, cancelReason }) {
    const parts = [];
    if (outcomeLabel) parts.push(outcomeLabel);
    if (resultR != null) parts.push(`${resultR >= 0 ? "+" : ""}${resultR.toFixed(2)}R`);
    if (cancelReason) parts.push(`Cancel: ${cancelReason}`);
    return (
        <div
            style={{
                height: STATUS_HEIGHT,
                padding: "0 6px",
                display: "flex",
                alignItems: "center",
                fontSize: 9,
                fontFamily: MONO_FONT,
                color: "rgba(55, 65, 81, 0.88)",
                background: "rgba(241, 245, 249, 0.86)",
                borderBottom: "1px solid rgba(203, 213, 225, 0.6)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
            }}
        >
            {parts.length ? parts.join(" · ") : "—"}
        </div>
    );
}

function UnavailableMessage({ medianCandleGapSec }) {
    const mins = medianCandleGapSec ? Math.round(Number(medianCandleGapSec) / 60) : null;
    return (
        <div style={{ padding: "8px 10px", fontSize: 10.5, color: "rgba(55, 65, 81, 0.9)", lineHeight: 1.45 }}>
            <strong>M1 data not available for this run</strong>
            {mins ? ` (imported candles are ~${mins}m).` : "."} {" "}
            Re-import with 1m candles to enable intrabar inspection.
        </div>
    );
}

function Footer({ leadMinutes, trailMinutes, onLead, onTrail }) {
    const wrap = {
        height: FOOTER_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 8px",
        borderTop: "1px solid rgba(203, 213, 225, 0.6)",
        background: "rgba(241, 245, 249, 0.7)",
        fontSize: 10,
        fontFamily: MONO_FONT,
    };
    const inputStyle = {
        width: 48,
        height: 18,
        padding: "0 4px",
        fontSize: 10,
        fontFamily: MONO_FONT,
        border: "1px solid rgba(148, 163, 184, 0.5)",
        background: "rgba(255,255,255,0.95)",
        color: "rgba(15,23,42,0.92)",
        borderRadius: 2,
    };
    const clamp = (v) => {
        const n = Math.round(Number(v));
        if (!isFinite(n)) return 1;
        return Math.max(1, Math.min(240, n));
    };
    return (
        <div style={wrap}>
            <span>Lead</span>
            <input
                type="number"
                min={1}
                max={240}
                value={leadMinutes}
                onChange={(e) => onLead(clamp(e.target.value))}
                style={inputStyle}
            />
            <span>min</span>
            <span style={{ flex: 1 }} />
            <span>Trail</span>
            <input
                type="number"
                min={1}
                max={240}
                value={trailMinutes}
                onChange={(e) => onTrail(clamp(e.target.value))}
                style={inputStyle}
            />
            <span>min</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MiniChart — second lightweight-charts instance
// ─────────────────────────────────────────────────────────────────────────────

function MiniChart({ candles, levels, events, direction, windowStart, windowEnd }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const [overlayKey, setOverlayKey] = useState(0);

    useLayoutEffect(() => {
        if (!containerRef.current) return undefined;
        const width = Math.max(1, containerRef.current.clientWidth || 1);
        const chart = createChart(containerRef.current, {
            width,
            height: CHART_HEIGHT,
            layout: {
                background: { color: "rgba(248, 250, 252, 1)" },
                textColor: "rgba(71, 85, 105, 0.86)",
                fontFamily: UI_FONT,
                fontSize: 9,
            },
            localization: {
                locale: "en-US",
                timeFormatter: formatUtcInspector,
            },
            watermark: { visible: false },
            attributionLogo: false,
            grid: {
                vertLines: { color: "rgba(0,0,0,0)" },
                horzLines: { color: "rgba(0,0,0,0)" },
            },
            rightPriceScale: { borderColor: "rgba(203, 213, 225, 0.62)" },
            timeScale: {
                borderColor: "rgba(203, 213, 225, 0.62)",
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: formatUtcTickMark,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: "rgba(71, 85, 105, 0.42)" },
                horzLine: { color: "rgba(71, 85, 105, 0.42)" },
            },
        });
        chartRef.current = chart;
        const series = chart.addCandlestickSeries({
            upColor: "rgba(188, 188, 188, 1)",
            downColor: "rgba(55, 65, 81, 1)",
            borderUpColor: "rgba(188, 188, 188, 1)",
            borderDownColor: "rgba(55, 65, 81, 1)",
            wickUpColor: "rgba(188, 188, 188, 1)",
            wickDownColor: "rgba(55, 65, 81, 1)",
            priceLineVisible: false,
        });
        seriesRef.current = series;
        const repaint = () => setOverlayKey((k) => k + 1);
        chart.timeScale().subscribeVisibleTimeRangeChange(repaint);
        chart.timeScale().subscribeVisibleLogicalRangeChange?.(repaint);
        const ro = new ResizeObserver(() => {
            if (!containerRef.current || !chartRef.current) return;
            const w = containerRef.current.clientWidth;
            if (w > 0) chartRef.current.applyOptions({ width: w, height: CHART_HEIGHT });
            repaint();
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
        const series = seriesRef.current;
        const chart = chartRef.current;
        if (!series || !chart) return;
        if (!candles?.length) {
            series.setData([]);
            return;
        }
        const seen = new Set();
        const data = candles
            .map((c) => {
                const t = candleTimeOf(c);
                if (t == null) return null;
                const o = Number(c.o ?? c.open);
                const h = Number(c.h ?? c.high);
                const l = Number(c.l ?? c.low);
                const cl = Number(c.c ?? c.close);
                if (![o, h, l, cl].every((v) => isFinite(v))) return null;
                return { time: t, open: o, high: h, low: l, close: cl };
            })
            .filter(Boolean)
            .sort((a, b) => a.time - b.time)
            .filter((c) => {
                if (seen.has(c.time)) return false;
                seen.add(c.time);
                return true;
            });
        series.setData(data);
        chart.timeScale().fitContent();
        setOverlayKey((k) => k + 1);
    }, [candles]);

    const overlays = computeOverlays({
        chart: chartRef.current,
        series: seriesRef.current,
        container: containerRef.current,
        levels,
        events,
        direction,
        windowStart,
        windowEnd,
        // overlayKey participates as a dep so React re-runs render after time-scale moves.
        // eslint-disable-next-line no-unused-vars
        _key: overlayKey,
    });

    return (
        <div style={{ position: "relative", width: "100%", height: CHART_HEIGHT, overflow: "hidden" }}>
            <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
            <div
                className="pointer-events-none"
                data-overlay-version={overlayKey}
                style={{ position: "absolute", inset: 0, zIndex: 5 }}
            >
                {overlays.obBand && (
                    <div
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: overlays.obBand.top,
                            height: overlays.obBand.height,
                            background: overlays.obBand.fill,
                            borderTop: `1px solid ${overlays.obBand.border}`,
                            borderBottom: `1px solid ${overlays.obBand.border}`,
                        }}
                    />
                )}
                {overlays.lines.map((l) => (
                    <div
                        key={l.id}
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: l.y,
                            height: 0,
                            borderTop: `1px dashed ${l.color}`,
                        }}
                    >
                        <span
                            style={{
                                position: "absolute",
                                right: 2,
                                top: -10,
                                fontSize: 8,
                                fontFamily: MONO_FONT,
                                color: l.color,
                                background: "rgba(248,250,252,0.86)",
                                padding: "0 2px",
                            }}
                        >
                            {l.label}
                        </span>
                    </div>
                ))}
                {overlays.markers.map((m) => (
                    <div
                        key={m.id}
                        style={{
                            position: "absolute",
                            top: 0,
                            height: "100%",
                            left: m.x,
                            width: 1,
                            borderLeft: `1px solid ${m.color}`,
                        }}
                    >
                        <span
                            style={{
                                position: "absolute",
                                top: 1,
                                left: 2,
                                fontSize: 7.5,
                                fontFamily: MONO_FONT,
                                color: m.color,
                                background: "rgba(248,250,252,0.86)",
                                padding: "0 2px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {m.label}
                        </span>
                    </div>
                ))}
                {!candles?.length && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: "rgba(100,116,139,0.9)",
                        }}
                    >
                        No 1m candles in window
                    </div>
                )}
            </div>
        </div>
    );
}

function computeOverlays({ chart, series, container, levels, events, direction, windowStart, windowEnd }) {
    if (!chart || !series || !container) {
        return { obBand: null, lines: [], markers: [] };
    }
    const bounds = container.getBoundingClientRect();
    const maxH = bounds.height || CHART_HEIGHT;
    const maxW = bounds.width || 1;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    let obBand = null;
    if (levels.obTop != null && levels.obBot != null) {
        const yTopOfRange = series.priceToCoordinate(Math.max(levels.obTop, levels.obBot));
        const yBotOfRange = series.priceToCoordinate(Math.min(levels.obTop, levels.obBot));
        if (yTopOfRange != null && yBotOfRange != null) {
            const isBull = direction === "bull";
            const baseRgb = isBull ? "24, 72, 204" : "178, 40, 51";
            obBand = {
                top: clamp(Math.min(yTopOfRange, yBotOfRange), 0, maxH),
                height: Math.max(2, Math.abs(yBotOfRange - yTopOfRange)),
                fill: `rgba(${baseRgb}, 0.10)`,
                border: `rgba(${baseRgb}, 0.45)`,
            };
        }
    }

    const lines = [];
    const pushLine = (id, price, label, color) => {
        if (price == null) return;
        const y = series.priceToCoordinate(price);
        if (y == null) return;
        lines.push({ id, y: clamp(y, 0, maxH), color, label });
    };
    const trigLabel = levels.triggerPenetrationPct != null
        ? `Trig ${levels.triggerPenetrationPct}%`
        : "Trigger";
    pushLine("trigger", levels.triggerPrice, trigLabel, "rgba(245, 158, 11, 0.92)");
    pushLine("entry", levels.entryPrice, "Entry", "rgba(34, 197, 94, 0.92)");
    pushLine("stop", levels.stopPrice, "Stop", "rgba(220, 38, 38, 0.85)");
    if (levels.tpPrice != null) pushLine("tp", levels.tpPrice, "TP", "rgba(34, 197, 94, 0.55)");

    const eventColors = {
        obDetectionTime:   ["rgba(107, 114, 128, 0.85)", "DET"],
        tappedTime:        ["rgba(99, 102, 241, 0.9)",   "TAP"],
        triggerTime:       ["rgba(245, 158, 11, 0.95)",  "TRIG"],
        armedAt:           ["rgba(234, 179, 8, 0.95)",   "ARM"],
        fillTime:          ["rgba(34, 197, 94, 0.95)",   "FILL"],
        edgeRevisitTime:   ["rgba(6, 182, 212, 0.9)",    "REV"],
        retraceCancelTime: ["rgba(220, 38, 38, 0.9)",    "RETR"],
        exitTime:          ["rgba(139, 92, 246, 0.9)",   "EXIT"],
        invalidationTime:  ["rgba(220, 38, 38, 0.95)",   "INV"],
    };
    const markers = [];
    Object.entries(events).forEach(([key, t]) => {
        if (t == null) return;
        if (windowStart != null && t < windowStart) return;
        if (windowEnd != null && t > windowEnd) return;
        const x = chart.timeScale().timeToCoordinate(t);
        if (x == null) return;
        const [color, label] = eventColors[key] || ["rgba(71, 85, 105, 0.9)", key];
        markers.push({ id: `${key}-${t}`, x: clamp(x, 0, maxW), color, label });
    });

    return { obBand, lines, markers };
}

export default IntrabarInspector;
