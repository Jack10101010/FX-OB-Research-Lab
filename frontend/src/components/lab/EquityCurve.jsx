import React from "react";
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
    ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CHART_NUM_FONT } from "@/lib/chartStyles";

// ── EquityCurve (original — unchanged) ───────────────────────────────────────

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
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 10 }} interval={Math.floor(data.length / 8)} hide={!showAxis} />
                    <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 10 }} tickFormatter={(v) => `${v}R`} hide={!showAxis} />
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--panel-2))",
                            border: "1px solid hsl(var(--accent-primary) / 0.4)",
                            borderRadius: 2,
                            fontFamily: CHART_NUM_FONT,
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

// ── MiniLine (original — unchanged) ──────────────────────────────────────────

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

// ── EquityCurveV2 helpers ─────────────────────────────────────────────────────

function fmtR(v) {
    const n = Number(v);
    if (!isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function fmtUtc(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (!isFinite(d.getTime())) return "—";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} UTC`;
}

// Format an account dollar value for the tooltip (e.g. "$100,000", "-$2,500").
function fmtAcct(v, currency = "USD") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
            maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
        }).format(n);
    } catch {
        return `${n >= 0 ? "" : "-"}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
}

// Format a dollar value for the Y-axis tick label (e.g. "100k", "90k").
function fmtAcctTick(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
}

// Colour for a trade dot (and the legend).
// Must match LEGEND_ITEMS order below.
function dotFill(point, showNews) {
    if (!point) return "hsl(var(--muted))";
    const outcome    = String(point.outcome || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const newsAction = String(point.news_action || "").trim();
    const fundingMarker = String(point.fundingMarker || "").trim();
    const fundingPhase = String(point.fundingPhase || point.phase || "").trim();
    const tradeR     = Number(point.tradeR);
    if (fundingMarker === "funded_start")                              return "hsl(330 88% 68%)";
    if (fundingPhase === "Funded") {
        // News-flattened trades → orange, same as pre-funded news/special dots
        if (outcome.includes("FLATTEN"))               return "hsl(var(--warning))";
        if (outcome === "WIN"  || tradeR >  0.005)     return "hsl(var(--success))";
        if (outcome === "LOSS" || tradeR < -0.005)     return "hsl(var(--bear))";
        return "hsl(var(--muted))";
    }
    if (fundingMarker)                                                  return "hsl(var(--warning))";
    if (showNews && newsAction)                                         return "hsl(var(--warning))";
    if (outcome.includes("FLATTEN"))                                    return "hsl(var(--warning))";
    if (outcome === "WIN")                                              return "hsl(var(--accent-primary))";
    if (outcome === "LOSS" || tradeR < -0.005)                         return "hsl(var(--bear))";
    if (outcome.includes("SESSION_FILTERED") || outcome.includes("MISSED")) return "hsl(var(--warning) / 0.65)";
    if (Math.abs(tradeR) < 0.005)                                       return "hsl(var(--muted))";
    if (tradeR > 0)                                                     return "hsl(var(--accent-primary))";
    if (tradeR < 0)                                                     return "hsl(var(--bear))";
    return "hsl(var(--muted))";
}

// Colour for each segment of the drawdown strip.
// Green when at/near equity high, deepening red as drawdown worsens.
function ddFill(dd) {
    const d = Number(dd);
    if (!isFinite(d) || d >= 0) return "hsl(var(--accent-primary) / 0.58)";
    if (d >= -1)  return "hsl(var(--bear) / 0.48)";
    if (d >= -3)  return "hsl(var(--bear) / 0.68)";
    if (d >= -5)  return "hsl(var(--bear) / 0.84)";
    return               "hsl(0 72% 38% / 0.95)";
}

// Legend items rendered below the drawdown strip.
const LEGEND_ITEMS = [
    { label: "Win",              color: "hsl(var(--accent-primary))" },
    { label: "Loss",             color: "hsl(var(--bear))"           },
    { label: "News / Special",   color: "hsl(var(--warning))"        },
    { label: "Breakeven / Zero", color: "hsl(var(--muted))"          },
];

const FUNDING_LEGEND_ITEMS = [
    { label: "Funded Win",       color: "hsl(var(--success))"  },
    { label: "Funded Flattened", color: "hsl(var(--warning))"  },
    { label: "Funded Loss",      color: "hsl(var(--bear))"     },
    { label: "Funded Start",     color: "hsl(330 88% 68%)"     },
];

const TT_STYLE = {
    background: "hsl(var(--panel-2))",
    border: "1px solid hsl(var(--accent-primary) / 0.4)",
    borderRadius: 2,
    fontFamily: CHART_NUM_FONT,
    fontSize: 11,
    padding: "8px 10px",
    lineHeight: 1.75,
    maxWidth: 272,
    pointerEvents: "none",
    zIndex: 50,
};

const SEP = { borderTop: "1px solid hsl(var(--border-soft))", margin: "4px 0" };

function TradeTooltip({ active, payload, accountMode = false, currency = "USD" }) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;

    // Synthetic start anchor — minimal tooltip
    if (p.isStart) {
        return (
            <div style={TT_STYLE}>
                <div style={{ fontWeight: 700, color: "hsl(var(--text-1))" }}>
                    {accountMode ? `Start · ${fmtAcct(p.netR, currency)}` : "Start · 0.00R"}
                </div>
            </div>
        );
    }

    // Phase boundary anchor (Verification Start, Funded Start) — no trade data
    if (p.trade === null && p.fundingMarker) {
        const phaseLabel = {
            phase_2_start: "Verification Start",
            funded_start:  "Funded Start",
        }[p.fundingMarker] || p.displayTradeId || p.fundingMarker;
        return (
            <div style={TT_STYLE}>
                <div style={{ fontWeight: 700, color: "hsl(var(--warning))", marginBottom: accountMode ? 4 : 0 }}>
                    ◆ {phaseLabel}
                </div>
                {accountMode && Number.isFinite(Number(p.netR)) && (
                    <div style={{ color: "hsl(var(--text-2))", fontSize: 11 }}>
                        Balance: {fmtAcct(p.netR, currency)}
                    </div>
                )}
            </div>
        );
    }

    const rN  = Number(p.tradeR);
    const ddN = Number(p.drawdown);
    const rColor  = rN  >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear))";
    const ddColor = ddN < -0.005 ? "hsl(var(--bear))" : "hsl(var(--accent-primary))";
    // Fall back to p.trade?.field for FTMO phase points, where buildPhasePoints
    // spreads the trade object but does not extract these event fields explicitly.
    const newsAction   = String(p.news_action   || p.trade?.news_action   || "").trim();
    const missedReason = String(p.missed_reason || p.trade?.missed_reason || "").trim();
    const protExit     = String(p.protection_exit_reason || p.trade?.protection_exit_reason || "").trim();

    return (
        <div style={TT_STYLE}>
            {/* Header: TradingView-style chronological trade number (NOT the OB-derived id).
                Prefer executionTradeNumber/tradeNumber; fall back to the chronological point
                index (p.i, where 0 = START anchor) only if the number is missing. The OB id
                stays available as a muted suffix for forensic/debug. */}
            <div style={{ fontWeight: 700, color: "hsl(var(--text-1))", marginBottom: 3 }}>
                {`Trade #${p.executionTradeNumber ?? p.tradeNumber ?? (Number.isFinite(Number(p.i)) ? Number(p.i) : "—")}`} · {p.direction || "—"} · {p.structure || "—"}
                {p.displayObId ? <span style={{ color: "hsl(var(--muted))", fontWeight: 400, fontSize: 10 }}>{` · ${p.displayObId}`}</span> : null}
            </div>
            {/* Timestamp + session */}
            <div style={{ color: "hsl(var(--muted))", fontSize: 10, marginBottom: 5 }}>
                {fmtUtc(p.entryTime)}
                {p.session ? <><br />{p.session}</> : null}
            </div>
            <div style={SEP} />
            {/* R / balance values */}
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", rowGap: 1 }}>
                <span style={{ color: "hsl(var(--muted))" }}>R Result</span>
                <span style={{ color: rColor, fontWeight: 600 }}>{fmtR(rN)}</span>
                <span style={{ color: "hsl(var(--muted))" }}>
                    {accountMode ? "Balance" : "Cumul. R"}
                </span>
                <span style={{ color: "hsl(var(--text-1))" }}>
                    {accountMode ? fmtAcct(p.netR, currency) : fmtR(p.netR)}
                </span>
                <span style={{ color: "hsl(var(--muted))" }}>Drawdown</span>
                <span style={{ color: ddColor }}>
                    {p.isAtHigh
                        ? "new high ✓"
                        : accountMode
                            ? fmtAcct(ddN, currency)
                            : fmtR(ddN)}
                </span>
            </div>
            {/* News — only real trade news events, never phase markers */}
            {newsAction && <>
                <div style={SEP} />
                <div style={{ color: "hsl(var(--warning))" }}>
                    ⚡ {newsAction.replace(/_/g, " ")}
                    {isFinite(Number(p.news_flatten_r ?? p.trade?.news_flatten_r)) ? ` → ${fmtR(p.news_flatten_r ?? p.trade?.news_flatten_r)}` : ""}
                </div>
            </>}
            {/* Session filter / missed */}
            {missedReason && <>
                <div style={SEP} />
                <div style={{ color: "hsl(var(--warning) / 0.85)" }}>
                    ⛔ {missedReason.replace(/_/g, " ")}
                </div>
            </>}
            {/* Protection exit */}
            {protExit && <>
                <div style={SEP} />
                <div style={{ color: "hsl(var(--muted))" }}>
                    🛡 {protExit.replace(/_/g, " ")}
                </div>
            </>}
        </div>
    );
}

// ── EquityCurveV2 ─────────────────────────────────────────────────────────────

export function EquityCurveV2({
    data = [],
    height = 360,
    showDots      = true,
    showDrawdown  = true,
    showNews      = true,
    accountMode   = false,          // true when netR values are dollar amounts, not R
    currency      = "USD",          // display currency for tooltip and axis in accountMode
    referenceLevels = [],           // [{ y, label, color, dash? }] — FTMO targets, floors, baseline
}) {
    const STRIP_H  = 10;   // thin continuous underwater strip
    const LEGEND_H = 22;   // dot-colour legend row
    const mainH    = height - (showDrawdown ? STRIP_H : 0) - LEGEND_H;

    // drawdownBar: 1 gives every strip bar a constant height;
    // Cell fill provides the depth-coded colour via ddFill():
    //   R mode       — uses pt.drawdown (R units; thresholds at -1 / -3 / -5 R)
    //   accountMode  — uses pt.accountDrawdownPct (% from peak; same thresholds
    //                  read as -1% / -3% / -5%, giving meaningful colour gradation
    //                  across a 10% FTMO-style buffer).  Falls back to pt.drawdown
    //                  for synthetic anchor points that carry no accountDrawdownPct.
    const chartData = React.useMemo(
        () => data.map((p) => ({ ...p, drawdownBar: 1 })),
        [data],
    );
    const legendItems = React.useMemo(
        () => {
            const hasFunding = chartData.some((point) => point.fundingMarker || point.fundingPhase === "Funded" || point.phase === "Funded");
            return hasFunding ? [...LEGEND_ITEMS, ...FUNDING_LEGEND_ITEMS] : LEGEND_ITEMS;
        },
        [chartData],
    );

    // Y-domain:
    //   R mode    — always extends below 0 so the zero-line has breathing room.
    //   Account mode — anchors to the actual equity/reference range, no forced zero.
    //   Reference levels (FTMO floor, baseline, targets) are included so they
    //   are never clipped off the visible canvas.
    const yDomain = React.useMemo(() => {
        if (!chartData.length) return ["auto", "auto"];
        const dataVals = chartData.map((p) => Number(p.netR)).filter(Number.isFinite);
        if (!dataVals.length) return ["auto", "auto"];
        // Pull reference level Y values in so floor/targets are always in view.
        const refVals = referenceLevels.map((r) => Number(r.y)).filter(Number.isFinite);
        const allVals = [...dataVals, ...refVals];
        const maxVal = Math.max(...allVals);
        const minVal = Math.min(...allVals);
        const range  = Math.abs(maxVal - minVal) || 1;
        const pad    = Math.max(range * 0.08, accountMode ? 1 : 0.5);
        const domainMin = accountMode
            ? minVal - pad
            : Math.min(minVal, 0) - pad;           // R mode keeps zero in view
        const domainMax = maxVal + Math.max(range * 0.05, accountMode ? 1 : 0.5);
        if (accountMode) {
            return [Math.floor(domainMin), Math.ceil(domainMax)];
        }
        return [Number(domainMin.toFixed(1)), Number(domainMax.toFixed(1))];
    }, [chartData, referenceLevels, accountMode]);

    // Y-axis ticks: explicit clean values so Recharts never picks fractional or
    // unreadable numbers.  Account mode uses human-friendly increments (5k, 10k,
    // 25k …); R mode uses the original integer step logic.
    const yAxisTicks = React.useMemo(() => {
        const [lo, hi] = yDomain;
        const numLo = Number(lo);
        const numHi = Number(hi);
        if (!Number.isFinite(numLo) || !Number.isFinite(numHi)) return undefined;
        const range = numHi - numLo;
        let step;
        if (accountMode) {
            // Dollar amounts — aim for 4–6 human-readable ticks.
            const rawStep  = range / 5;
            const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
            const norm = rawStep / magnitude;
            step = magnitude * (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10);
        } else {
            // R values — pick step for ~5–7 ticks
            if      (range <=  8) step = 1;
            else if (range <= 20) step = 2;
            else if (range <= 50) step = 5;
            else if (range <= 100) step = 10;
            else step = Math.pow(10, Math.floor(Math.log10(range / 5)));
        }
        const start = Math.ceil(numLo  / step) * step;
        const end   = Math.floor(numHi / step) * step;
        const ticks = [];
        let t = start;
        while (t <= end + 1e-9) {
            ticks.push(Math.round(t * 1000) / 1000); // guard float drift
            t += step;
        }
        return ticks;
    }, [yDomain, accountMode]);

    // X-axis: one tick per calendar month, at the first trade of each new month
    const xAxisConfig = React.useMemo(() => {
        const seen  = new Set();
        const ticks = [];
        chartData.forEach((pt) => {
            if (!pt.isStart && pt.label && !seen.has(pt.label)) {
                seen.add(pt.label);
                ticks.push(pt.i);
            }
        });
        // Thin to ≤ 10 visible ticks for readability
        const step   = ticks.length > 10 ? Math.ceil(ticks.length / 10) : 1;
        const sparse = ticks.filter((_, k) => k % step === 0);
        const labelMap = {};
        chartData.forEach((pt) => { if (pt.i != null) labelMap[pt.i] = pt.label || ""; });
        return { ticks: sparse, labelMap };
    }, [chartData]);

    // ── Custom dot renderers ────────────────────────────────────────────────
    // Defined inside the component so showNews is in scope.
    const renderDot = (dotProps) => {
        const { cx, cy, payload } = dotProps;
        if (cx == null || cy == null || payload?.isStart) return null;
        return (
            <circle
                key={`dot-${payload?.i ?? cx}`}
                cx={cx} cy={cy} r={4}
                fill={dotFill(payload, showNews)}
                stroke="none"
            />
        );
    };

    const renderActiveDot = (dotProps) => {
        const { cx, cy, payload } = dotProps;
        if (cx == null || cy == null || payload?.isStart) return null;
        return (
            <circle
                key={`adot-${payload?.i ?? cx}`}
                cx={cx} cy={cy} r={6}
                fill={dotFill(payload, showNews)}
                stroke="hsl(var(--panel-2))"
                strokeWidth={2}
            />
        );
    };

    if (!chartData.length) {
        return (
            <div
                style={{ width: "100%", height, display: "flex", alignItems: "center", justifyContent: "center" }}
                className="font-ui text-[11px] text-muted-lab"
                data-testid="equity-curve-v2"
            >
                No data available
            </div>
        );
    }

    return (
        <div style={{ width: "100%" }} data-testid="equity-curve-v2">

            {/* ── Main chart: equity line + trade dots ──────────────────────── */}
            <div style={{ width: "100%", height: mainH }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                        <defs>
                            <linearGradient id="eqv2-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="hsl(var(--accent-primary))" stopOpacity={0.32} />
                                <stop offset="100%" stopColor="hsl(var(--accent-primary))" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />

                        <XAxis
                            dataKey="i"
                            type="number"
                            scale="linear"
                            domain={["dataMin", "dataMax"]}
                            ticks={xAxisConfig.ticks}
                            tickFormatter={(idx) => xAxisConfig.labelMap[idx] ?? ""}
                            tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            tick={{ fill: "hsl(var(--muted))", fontFamily: CHART_NUM_FONT, fontSize: 10 }}
                            tickFormatter={(v) => {
                                const n = Number(v);
                                if (!Number.isFinite(n)) return "";
                                if (accountMode) return fmtAcctTick(n);
                                return `${Number.isInteger(n) ? n : n.toFixed(1)}R`;
                            }}
                            ticks={yAxisTicks}
                            width={accountMode ? 52 : 48}
                            domain={yDomain}
                        />

                        <Tooltip content={(props) => <TradeTooltip {...props} accountMode={accountMode} currency={currency} />} />

                        {/* Zero-equity reference — R mode only; not meaningful for dollar charts */}
                        {!accountMode && (
                            <ReferenceLine
                                y={0}
                                stroke="hsl(var(--muted))"
                                strokeWidth={1}
                            />
                        )}

                        {/* FTMO / account reference levels (blowout floor, baseline, phase targets) */}
                        {referenceLevels.map(({ y, label, color, dash = "4 3" }) => (
                            <ReferenceLine
                                key={`reflvl-${y}`}
                                y={y}
                                stroke={color}
                                strokeWidth={1.5}
                                strokeDasharray={dash}
                                label={{
                                    value: label,
                                    position: "insideTopRight",
                                    fill: color,
                                    fontFamily: CHART_NUM_FONT,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    dy: -4,
                                }}
                            />
                        ))}

                        {/*
                         * Cumulative R area with per-trade coloured dots.
                         * dot={false} when showDots is off still keeps activeDot for
                         * the tooltip crosshair; full-area hover still triggers tooltip.
                         */}
                        <Area
                            type="monotone"
                            dataKey="netR"
                            stroke="hsl(var(--accent-primary))"
                            strokeWidth={2}
                            fill="url(#eqv2-grad)"
                            dot={showDots ? renderDot : false}
                            activeDot={renderActiveDot}
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* ── Drawdown underwater strip ──────────────────────────────────── */}
            {showDrawdown && (
                <div style={{ width: "100%", height: STRIP_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                        {/*
                         * barCategoryGap="0%" eliminates inter-bar spacing so the strip
                         * reads as a continuous coloured band rather than a histogram.
                         * left must match the main chart plot area origin:
                         *   R mode:       YAxis width 48 + margin.left 4 = 52
                         *   accountMode:  YAxis width 52 + margin.left 4 = 56
                         */}
                        <BarChart
                            data={chartData}
                            barCategoryGap="0%"
                            margin={{ top: 0, right: 8, left: accountMode ? 56 : 52, bottom: 0 }}
                        >
                            <Bar dataKey="drawdownBar" isAnimationActive={false} radius={0}>
                                {chartData.map((pt, idx) => (
                                    <Cell key={idx} fill={ddFill(accountMode ? (pt.accountDrawdownPct ?? pt.drawdown) : pt.drawdown)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Dot colour legend ──────────────────────────────────────────── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 20,
                    height: LEGEND_H,
                    marginTop: 4,
                }}
            >
                {legendItems.map(({ label, color }) => (
                    <div
                        key={label}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontFamily: CHART_NUM_FONT,
                            fontSize: 10,
                            color: "hsl(var(--muted))",
                        }}
                    >
                        <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}>
                            <circle cx="4" cy="4" r="4" fill={color} />
                        </svg>
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}
