import React from "react";
import { cn } from "@/lib/utils";
import {
    BarChart, Bar, LineChart, Line, ComposedChart, Scatter,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
    Cell,
} from "recharts";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { HeroBadge } from "@/components/lab/controls";
import {
    buildEquityCurveOverlayData,
    buildRBins,
    buildStreakData,
    buildPenetrationSweep,
    buildDrawdownCurves,
    buildTradeLifecycleFlow,
    buildObBreakdown,
    OB_BREAKDOWN_LABEL_FNS,
    prettyModeName,
} from "./protectionAnalytics";
import { CHART_NUM_FONT } from "@/lib/chartStyles";
// RB-6B — the OB characteristic breakdown (baseline-scoped) routes through the
// shared canonical bucket table. Protection-mode comparison tables are NOT
// migrated; ProtectionLab stays pinned to the unprotected baseline universe.
import { useResultsLens } from "@/data/useResultsLens";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";

// ── Shared style tokens ───────────────────────────────────────────────────────
const C_BASELINE  = "hsl(var(--accent-secondary))";
const C_PROTECTED = "hsl(var(--accent-primary))";
const C_SUCCESS   = "hsl(var(--success))";
const C_DANGER    = "hsl(var(--danger))";
const C_WARNING   = "hsl(var(--warning))";
const C_TEXT2     = "hsl(var(--text-2))";
const C_BORDER    = "hsl(var(--border-soft))";
const PANEL_BG    = "hsl(var(--panel-2))";

function EmptyState({ message = "No protection dataset available for this view." }) {
    return (
        <div className="flex items-center justify-center h-32 text-[11px] font-ui text-[hsl(var(--text-3))] text-center px-4">
            {message}
        </div>
    );
}

function ChartTooltipBox({ active, payload, label, labelFn, rowFn }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2 text-[11px] font-ui shadow-xl min-w-[120px]">
            {label != null && (
                <div className="text-[hsl(var(--text-3))] mb-1">{labelFn ? labelFn(label) : label}</div>
            )}
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                    <span style={{ color: entry.color || entry.fill }}>{entry.name}</span>
                    <span className="tabular-nums text-[hsl(var(--text-1))]">
                        {rowFn ? rowFn(entry) : entry.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. EQUITY CURVE OVERLAY
// ──────────────────────────────────────────────────────────────────────────────
export function EquityCurveOverlay({ baselineTrades, tradesByMode, selectedMode }) {
    const { data, hasProtected, baselineFinal, protectedFinal } = React.useMemo(
        () => buildEquityCurveOverlayData(baselineTrades, tradesByMode, selectedMode),
        [baselineTrades, tradesByMode, selectedMode],
    );

    if (!data.length) {
        return <EmptyState message="Equity impact requires at least one unprotected baseline trade." />;
    }

    const delta = hasProtected ? (protectedFinal - baselineFinal).toFixed(2) : null;

    return (
        <div>
            <div className="flex flex-wrap gap-4 mb-3 px-1">
                <LegendDot color={C_BASELINE} label={`Unprotected  ${baselineFinal >= 0 ? "+" : ""}${baselineFinal.toFixed(2)}R`} />
                {hasProtected && (
                    <LegendDot color={C_PROTECTED} label={`Protected  ${protectedFinal >= 0 ? "+" : ""}${protectedFinal.toFixed(2)}R`} />
                )}
                {delta != null && (
                    <span className={cn("text-[10px] font-num tabular-nums", Number(delta) >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                        Δ {Number(delta) >= 0 ? "+" : ""}{delta}R
                    </span>
                )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C_BASELINE} stopOpacity={0.25} />
                            <stop offset="100%" stopColor={C_BASELINE} stopOpacity={0.03} />
                        </linearGradient>
                        <linearGradient id="gradProt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C_PROTECTED} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={C_PROTECTED} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} />
                    <XAxis dataKey="i" hide />
                    <YAxis tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}R`} />
                    <ReferenceLine y={0} stroke={C_BORDER} strokeOpacity={0.5} />
                    <Tooltip content={<ChartTooltipBox labelFn={v => `Trade #${v + 1}`} rowFn={e => `${e.value >= 0 ? "+" : ""}${Number(e.value).toFixed(2)}R`} />} />
                    <Area type="monotone" dataKey="netR" name="Unprotected" stroke={C_BASELINE} fill="url(#gradBase)" strokeWidth={1.5} dot={false} />
                    {hasProtected && (
                        <Area type="monotone" dataKey="netRB" name="Protected" stroke={C_PROTECTED} fill="url(#gradProt)" strokeWidth={1.5} dot={false} />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. PROTECTION IMPACT SCATTER  (unprotected R vs protected R per trade)
// ──────────────────────────────────────────────────────────────────────────────
export function ProtectionImpactScatter({ pairs }) {
    const scatterData = React.useMemo(() => {
        if (!pairs?.length) return [];
        return pairs.map((p, i) => ({
            id: i,
            base: Number(p.baselineR ?? 0),
            prot: Number(p.protectedR ?? 0),
            saved: Number((p.protectedR ?? 0) - (p.baselineR ?? 0)),
        }));
    }, [pairs]);

    if (!scatterData.length) return <EmptyState message="No paired trade data. Select a protection mode with matching trade IDs." />;

    const allVals = scatterData.flatMap(d => [d.base, d.prot]);
    const minV = Math.floor(Math.min(...allVals)) - 0.5;
    const maxV = Math.ceil(Math.max(...allVals)) + 0.5;
    const diagData = [{ x: minV, y: minV }, { x: maxV, y: maxV }];

    return (
        <div>
            <div className="flex flex-wrap gap-4 mb-2 px-1">
                <LegendDot color={C_SUCCESS} label="Improved by defense" />
                <LegendDot color={C_DANGER} label="Reduced by defense" />
                <LegendDot color={C_TEXT2} label="No change" />
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <ComposedChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} />
                    <XAxis
                        type="number" dataKey="base" name="Unprotected R" domain={[minV, maxV]}
                        tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }}
                        tickLine={false} axisLine={false}
                        tickFormatter={v => `${v}R`}
                        label={{ value: "Unprotected R", fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT, position: "insideBottom", offset: -2 }}
                    />
                    <YAxis
                        type="number" dataKey="prot" name="Protected R" domain={[minV, maxV]}
                        tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }}
                        tickLine={false} axisLine={false} width={36}
                        tickFormatter={v => `${v}R`}
                    />
                    <ReferenceLine y={0} stroke={C_BORDER} strokeOpacity={0.4} />
                    <ReferenceLine x={0} stroke={C_BORDER} strokeOpacity={0.4} />
                    <Tooltip content={<ChartTooltipBox
                        labelFn={() => "Trade"}
                        rowFn={e => `${e.value >= 0 ? "+" : ""}${Number(e.value).toFixed(2)}R`}
                    />} />
                    {/* Diagonal equality line */}
                    <Line
                        data={diagData} dataKey="y" name="No change"
                        stroke={C_BORDER} strokeDasharray="4 4" strokeWidth={1} dot={false}
                    />
                    <Scatter
                        data={scatterData} dataKey="prot" name="Trades" shape="circle"
                    >
                        {scatterData.map((d, i) => (
                            <Cell
                                key={i}
                                fill={d.saved > 0.05 ? C_SUCCESS : d.saved < -0.05 ? C_DANGER : C_TEXT2}
                                fillOpacity={0.7}
                                r={4}
                            />
                        ))}
                    </Scatter>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. R DISTRIBUTION HISTOGRAM
// ──────────────────────────────────────────────────────────────────────────────
const R_BIN_LABELS = ["< -2R", "-2 to -1R", "-1 to 0R", "0R", "0 to +1R", "+1 to +2R", "> +2R"];

export function RDistributionHistogram({ baselineTrades, protectedTrades }) {
    const bins = React.useMemo(
        () => buildRBins(baselineTrades, protectedTrades),
        [baselineTrades, protectedTrades],
    );

    if (!bins?.length) return <EmptyState message="No trade data available for R distribution." />;

    return (
        <div>
            <div className="flex flex-wrap gap-4 mb-2 px-1">
                <LegendDot color={C_BASELINE} label="Unprotected" />
                {bins.some(b => b.prot != null) && <LegendDot color={C_PROTECTED} label="Protected" />}
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bins} margin={{ top: 4, right: 12, left: -8, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} vertical={false} />
                    <XAxis
                        dataKey="bin" tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }}
                        tickLine={false} axisLine={false}
                    />
                    <YAxis tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<ChartTooltipBox />} />
                    <Bar dataKey="base" name="Unprotected" fill={C_BASELINE} fillOpacity={0.75} radius={[2, 2, 0, 0]} />
                    {bins.some(b => b.prot != null) && (
                        <Bar dataKey="prot" name="Protected" fill={C_PROTECTED} fillOpacity={0.75} radius={[2, 2, 0, 0]} />
                    )}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. PENETRATION SENSITIVITY
// ──────────────────────────────────────────────────────────────────────────────
export function PenetrationSensitivity({ trades }) {
    const [minPct, setMinPct] = React.useState(50);
    const [maxPct, setMaxPct] = React.useState(100);

    const sweep = React.useMemo(
        () => buildPenetrationSweep(trades, minPct, maxPct, 5),
        [trades, minPct, maxPct],
    );

    if (!sweep.hasPenData) {
        return <EmptyState message="OB penetration data is unavailable. Requires max_ob_penetration_pct in the imported trade export." />;
    }

    return (
        <div>
            <div className="flex flex-wrap items-center gap-4 mb-3 px-1">
                <label className="flex items-center gap-2 text-[10px] font-ui text-[hsl(var(--text-2))]">
                    Min %
                    <input
                        type="range" min={0} max={95} step={5} value={minPct}
                        onChange={e => setMinPct(Number(e.target.value))}
                        className="w-20 accent-[hsl(var(--accent-primary))]"
                    />
                    <span className="w-6 tabular-nums">{minPct}</span>
                </label>
                <label className="flex items-center gap-2 text-[10px] font-ui text-[hsl(var(--text-2))]">
                    Max %
                    <input
                        type="range" min={5} max={100} step={5} value={maxPct}
                        onChange={e => setMaxPct(Number(e.target.value))}
                        className="w-20 accent-[hsl(var(--accent-primary))]"
                    />
                    <span className="w-6 tabular-nums">{maxPct}</span>
                </label>
                <span className="text-[10px] font-ui text-[hsl(var(--text-3))]">
                    Unprotected: {sweep.baselineNet >= 0 ? "+" : ""}{sweep.baselineNet?.toFixed(2)}R
                </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={sweep.results} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} />
                    <XAxis dataKey="threshold" tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <YAxis tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}R`} />
                    <ReferenceLine y={sweep.baselineNet} stroke={C_BASELINE} strokeDasharray="4 4" strokeWidth={1} label={{ value: "Unprotected", fill: C_BASELINE, fontSize: 9 }} />
                    <ReferenceLine y={0} stroke={C_BORDER} strokeOpacity={0.5} />
                    <Tooltip content={<ChartTooltipBox labelFn={v => `Threshold: ${v}%`} rowFn={e => `${e.value >= 0 ? "+" : ""}${Number(e.value).toFixed(2)}R`} />} />
                    <Bar dataKey="savedR" name="Research-Estimate R Saved" fill={C_SUCCESS} fillOpacity={0.55} radius={[2, 2, 0, 0]} yAxisId={0} />
                    <Line dataKey="projectedNet" name="Projected Net R" stroke={C_PROTECTED} strokeWidth={2} dot={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. DRAWDOWN COMPARISON
// ──────────────────────────────────────────────────────────────────────────────
const MODE_COLORS = [
    "hsl(var(--accent-primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(200 80% 60%))",
];

export function DrawdownComparison({ baselineTrades, tradesByMode }) {
    const modes = Object.keys(tradesByMode ?? {});
    const [activeModes, setActiveModes] = React.useState(() => modes.slice(0, 3));

    const { curves, merged, hasModes } = React.useMemo(
        () => buildDrawdownCurves(baselineTrades, tradesByMode, activeModes),
        [baselineTrades, tradesByMode, activeModes],
    );

    const toggleMode = (m) => setActiveModes(prev =>
        prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );

    if (!baselineTrades?.length) return <EmptyState message="No unprotected baseline trades available for drawdown comparison." />;

    return (
        <div>
            {modes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 px-1">
                    {curves.map(c => (
                        <button
                            key={c.mode}
                            onClick={() => !c.isBaseline && toggleMode(c.mode)}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-0.5 clip-bevel-sm border text-[10px] font-ui uppercase tracking-[0.12em] transition-opacity",
                                activeModes.includes(c.mode) || c.isBaseline ? "opacity-100" : "opacity-30",
                                c.isBaseline ? "cursor-default" : "cursor-pointer hover:opacity-80",
                            )}
                            style={{
                                borderColor: c.color + "66",
                                color: c.color,
                                background: c.color + "12",
                            }}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={merged} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} />
                    <XAxis dataKey="i" hide />
                    <YAxis tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}R`} />
                    <ReferenceLine y={0} stroke={C_BORDER} strokeOpacity={0.5} />
                    <Tooltip content={<ChartTooltipBox labelFn={v => `Trade #${v + 1}`} rowFn={e => `${Number(e.value).toFixed(2)}R`} />} />
                    {curves.map(c => (
                        <Line
                            key={c.mode}
                            type="monotone"
                            dataKey={c.mode}
                            name={c.label}
                            stroke={c.color}
                            strokeWidth={c.isBaseline ? 1.5 : 1.5}
                            strokeDasharray={c.isBaseline ? "4 4" : undefined}
                            dot={false}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. WIN/LOSS STREAK VISUALISER
// ──────────────────────────────────────────────────────────────────────────────
const STREAK_DOT_SIZE = 10;
const STREAK_DOT_GAP  = 3;
const STREAK_ROW_H    = STREAK_DOT_SIZE + STREAK_DOT_GAP;

export function StreakVisualiser({ trades }) {
    const { points, maxConsecutiveLoss, maxConsecutiveWin, currentStreak } = React.useMemo(
        () => buildStreakData(trades),
        [trades],
    );

    if (!points.length) return <EmptyState message="No trades available for streak analysis." />;

    const COLS = Math.min(points.length, 80);
    const ROWS = Math.ceil(points.length / COLS);
    const svgW = COLS * (STREAK_DOT_SIZE + STREAK_DOT_GAP);
    const svgH = ROWS * STREAK_ROW_H;

    return (
        <div>
            <div className="flex flex-wrap gap-6 mb-3 px-1">
                <Stat label="Max Win Streak" value={maxConsecutiveWin} tone="success" />
                <Stat label="Max Loss Streak" value={maxConsecutiveLoss} tone="danger" />
                <Stat label="Current Streak" value={`${currentStreak > 0 ? "+" : ""}${currentStreak}`} tone={currentStreak >= 0 ? "success" : "danger"} />
            </div>
            <div className="overflow-auto">
                <svg width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg">
                    {points.map((p, i) => {
                        const col = i % COLS;
                        const row = Math.floor(i / COLS);
                        const x = col * (STREAK_DOT_SIZE + STREAK_DOT_GAP);
                        const y = row * STREAK_ROW_H;
                        const fill =
                            p.outcome === "win"       ? "hsl(var(--success))"  :
                            p.outcome === "loss"      ? "hsl(var(--danger))"   :
                            p.outcome === "breakeven" ? "hsl(var(--warning))"  :
                            "hsl(var(--border-soft))";
                        return (
                            <rect
                                key={i}
                                x={x} y={y}
                                width={STREAK_DOT_SIZE} height={STREAK_DOT_SIZE}
                                rx={2} ry={2}
                                fill={fill} fillOpacity={0.8}
                            >
                                <title>{`#${i + 1} · ${p.outcome} · ${p.r >= 0 ? "+" : ""}${Number(p.r).toFixed(2)}R`}</title>
                            </rect>
                        );
                    })}
                </svg>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 px-1">
                <LegendDot color="hsl(var(--success))" label="Win" />
                <LegendDot color="hsl(var(--danger))" label="Loss" />
                <LegendDot color="hsl(var(--warning))" label="Breakeven" />
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. TRIGGER-TIME HISTOGRAM
// ──────────────────────────────────────────────────────────────────────────────
export function TriggerTimeHistogram({ breachTimes }) {
    const hourData = React.useMemo(() => {
        if (!breachTimes?.length) return [];
        const counts = Array(24).fill(0);
        breachTimes.forEach(t => {
            if (t == null) return;
            const d = new Date(t);
            if (!Number.isFinite(d.getTime())) return;
            counts[d.getUTCHours()]++;
        });
        return counts.map((n, h) => ({ hour: h, count: n, label: `${String(h).padStart(2, "0")}:00` }));
    }, [breachTimes]);

    if (!hourData.length) return <EmptyState message="No invalidation timestamp data available." />;

    const peak = Math.max(...hourData.map(d => d.count));

    return (
        <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} strokeOpacity={0.25} vertical={false} />
                <XAxis
                    dataKey="label"
                    interval={3}
                    tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }}
                    tickLine={false} axisLine={false}
                />
                <YAxis tick={{ fill: C_TEXT2, fontSize: 9, fontFamily: CHART_NUM_FONT }} tickLine={false} axisLine={false} width={24} />
                <Tooltip content={<ChartTooltipBox labelFn={v => `${v} UTC`} rowFn={e => `${e.value} triggers`} />} />
                <Bar dataKey="count" name="Invalidation Triggers" radius={[2, 2, 0, 0]}>
                    {hourData.map((d, i) => (
                        <Cell
                            key={i}
                            fill={d.count === peak ? C_PROTECTED : C_BASELINE}
                            fillOpacity={0.7}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 8. OB CHARACTERISTIC BREAKDOWN
// ──────────────────────────────────────────────────────────────────────────────
const OB_BREAKDOWN_TABS = [
    { key: "byWidth",     label: "OB Width" },
    { key: "byAge",       label: "OB Age" },
    { key: "byDepth",     label: "Penetration" },
    { key: "byStructure", label: "Structure" },
    { key: "byDirection", label: "Direction" },
];

// RB-6B canonical schema. Columns/labels preserved (Group / Trades / Win % /
// Avg R / Net R); fields mapped to the canonical bucket row (label, rows,
// winRate, expectancy, netR). WR uses the frozen wins/(wins+losses) denominator.
// (This also corrects a pre-existing latent field mismatch where the old
// columns read row.bucket / row.avgR, which the builder never emitted.)
const OB_RAW_SCHEMA = [
    { key: "label",      label: "Group",  kind: "label", sortable: false },
    { key: "rows",       label: "Trades", align: "right", kind: "int" },
    { key: "winRate",    label: "Win %",  align: "right", kind: "pct", invariant: true },
    { key: "expectancy", label: "Avg R",  align: "right", kind: "expR", heatmap: true },
    { key: "netR",       label: "Net R",  align: "right", kind: "rNet", heatmap: true },
];
const OB_CE_SCHEMA = [
    { key: "label",              label: "Group",        kind: "label", sortable: false },
    { key: "rows",               label: "Trades",       align: "right", kind: "int" },
    { key: "winRate",            label: "Win %",        align: "right", kind: "pct", invariant: true },
    { key: "contributionAmount", label: "Contribution", align: "right", kind: "money", heatmap: true },
    { key: "contributionPct",    label: "Contrib %",    align: "right", kind: "moneyPct" },
];
const OB_SCHEMA = { raw: OB_RAW_SCHEMA, ce: OB_CE_SCHEMA };

export function ObCharacteristicBreakdown({ trades }) {
    const [tab, setTab] = React.useState("byWidth");
    const lens = useResultsLens();

    const breakdown = React.useMemo(() => buildObBreakdown(trades), [trades]);
    const rows = breakdown?.[tab] ?? [];
    const hasData = rows.length > 0;
    // CE recompute groups the SAME baseline trades; order is derived from the
    // visible Raw R rows so both bases show an identical bucket set.
    const def = { labelFn: OB_BREAKDOWN_LABEL_FNS[tab], order: rows.map((r) => r.label) };
    const isPureR = (lens.accountSettings?.mode || "r_only") === "r_only";

    return (
        <div>
            <div className="flex flex-wrap gap-1 mb-3">
                {OB_BREAKDOWN_TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                            "px-3 py-1 clip-bevel-sm border text-[10px] font-ui uppercase tracking-[0.14em] transition-colors",
                            tab === t.key
                                ? "border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]",
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="mb-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">Results Basis</span>
                    <HeroBadge tone={lens.isCurrentEquity ? "secondary" : "muted"}>{lens.isCurrentEquity ? "Current Equity" : "Raw R"}</HeroBadge>
                    <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">· Unprotected baseline</span>
                </div>
                {lens.isCurrentEquity && (
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-2.5 py-1.5">
                        <span className="text-[10.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            Current Equity bucket values are sequence-dependent contribution over the unprotected
                            baseline, not isolated edge.
                            {isPureR && " Account model is Pure R — set an account mode in Settings → Results Basis for dollar contribution."}
                        </span>
                    </div>
                )}
            </div>
            {hasData ? (
                <CanonicalBucketTable
                    bare
                    bareHeatmap
                    compact
                    restrictToOrder
                    testId={`protlab-ob-breakdown-${tab}`}
                    rawRows={rows}
                    trades={trades}
                    def={def}
                    schema={OB_SCHEMA}
                    defaultSortKey="netR"
                />
            ) : (
                <EmptyState message={`No ${OB_BREAKDOWN_TABS.find(t => t.key === tab)?.label} data. Required field is not populated in this dataset.`} />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// 9. TRADE LIFECYCLE FLOW  (simplified Sankey-style SVG)
// ──────────────────────────────────────────────────────────────────────────────
export function TradeLifecycleFlow({ trades, tradesByMode, selectedMode }) {
    const flow = React.useMemo(
        () => buildTradeLifecycleFlow(trades, tradesByMode, selectedMode),
        [trades, tradesByMode, selectedMode],
    );

    // buildTradeLifecycleFlow returns null when there are no trades; guard the
    // whole object (not just .n) so the empty case renders the limited-data
    // state instead of crashing on `null.n`.
    if (!flow || !flow.n) return <EmptyState message="No trades available for lifecycle flow." />;

    const {
        n, wins, losses, breakeven,
        hardInvals, hardInvalLosses, normalLosses,
        hasProtection, protectionExits, savedFromLoss, winnersCut,
    } = flow;

    // Simple visual: horizontal flow boxes connected by arrows
    const boxW = 80, boxH = 36, gapX = 56, startX = 20, startY = 10;

    function Box({ x, y, label, count, color }) {
        const pct = n > 0 ? ((count / n) * 100).toFixed(0) : 0;
        return (
            <g>
                <rect x={x} y={y} width={boxW} height={boxH} rx={3} ry={3}
                    fill={color} fillOpacity={0.12} stroke={color} strokeOpacity={0.5} strokeWidth={1} />
                <text x={x + boxW / 2} y={y + 13} textAnchor="middle"
                    fill={color} fontSize={9} fontFamily="monospace" fontWeight="600">
                    {label}
                </text>
                <text x={x + boxW / 2} y={y + 26} textAnchor="middle"
                    fill={color} fontSize={9} fontFamily="monospace" opacity={0.9}>
                    {count} · {pct}%
                </text>
            </g>
        );
    }

    function Arrow({ x1, y1, x2, y2, color = C_BORDER }) {
        const mx = (x1 + x2) / 2;
        return (
            <path
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5}
                markerEnd="url(#arrowHead)"
            />
        );
    }

    const svgW = hasProtection ? 560 : 360;
    const svgH = 220;

    // Layout: All trades → Wins / Losses / Breakeven → (if protected) Protection exits → Saved / Cost
    const col0x = startX;
    const col1x = col0x + boxW + gapX;
    const col2x = col1x + boxW + gapX;
    const col3x = col2x + boxW + gapX;

    const winY    = startY;
    const beY     = startY + boxH + 12;
    const lossY   = startY + (boxH + 12) * 2;
    const allY    = startY + boxH + 6;

    return (
        <div className="overflow-auto">
            <svg width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <marker id="arrowHead" markerWidth="6" markerHeight="6"
                        refX="3" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill={C_BORDER} opacity={0.6} />
                    </marker>
                </defs>

                {/* Col 0: All trades */}
                <Box x={col0x} y={allY} label="All Trades" count={n} color={C_BASELINE} />

                {/* Arrows to outcomes */}
                <Arrow x1={col0x + boxW} y1={allY + boxH / 2} x2={col1x} y2={winY + boxH / 2} color={C_SUCCESS} />
                {breakeven > 0 && <Arrow x1={col0x + boxW} y1={allY + boxH / 2} x2={col1x} y2={beY + boxH / 2} color={C_WARNING} />}
                <Arrow x1={col0x + boxW} y1={allY + boxH / 2} x2={col1x} y2={lossY + boxH / 2} color={C_DANGER} />

                {/* Col 1: Outcomes */}
                <Box x={col1x} y={winY}  label="Wins"      count={wins}     color={C_SUCCESS} />
                {breakeven > 0 && <Box x={col1x} y={beY}   label="Breakeven" count={breakeven} color={C_WARNING} />}
                <Box x={col1x} y={lossY} label="Losses"    count={losses}    color={C_DANGER} />

                {/* Col 2: Loss breakdown */}
                {hardInvals > 0 && (
                    <>
                        <Arrow x1={col1x + boxW} y1={lossY + boxH / 2} x2={col2x} y2={lossY + boxH / 2} color={C_DANGER} />
                <Box x={col2x} y={lossY} label="Invalid." count={hardInvals} color={C_DANGER} />
                    </>
                )}
                {normalLosses > 0 && (
                    <>
                        <Arrow x1={col1x + boxW} y1={lossY + boxH / 2} x2={col2x} y2={winY + boxH / 2} color={C_DANGER} />
                        <Box x={col2x} y={winY} label="Normal Loss" count={normalLosses} color={C_WARNING} />
                    </>
                )}

                {/* Col 3: Protection effects */}
                {hasProtection && (
                    <>
                        <Arrow x1={col2x + boxW} y1={winY + boxH / 2} x2={col3x} y2={winY + boxH / 2} color={C_PROTECTED} />
                        <Box x={col3x} y={winY} label="Loss R Saved" count={savedFromLoss} color={C_SUCCESS} />
                        {winnersCut > 0 && (
                            <>
                                <Arrow x1={col1x + boxW} y1={winY + boxH / 2} x2={col3x} y2={beY + boxH / 2} color={C_DANGER} />
                                <Box x={col3x} y={beY} label="Winner Cost" count={winnersCut} color={C_WARNING} />
                            </>
                        )}
                    </>
                )}
            </svg>

            {/* Legend row */}
            <div className="flex flex-wrap gap-4 mt-2 px-1">
                <Stat label="Total" value={n} tone="muted" />
                <Stat label="Wins" value={wins} tone="success" />
                <Stat label="Losses" value={losses} tone="danger" />
                {hasProtection && <Stat label="Loss R Saved" value={savedFromLoss} tone="primary" />}
                {hasProtection && winnersCut > 0 && <Stat label="Winner Cost" value={winnersCut} tone="warning" />}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ──────────────────────────────────────────────────────────────────────────────
function LegendDot({ color, label }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-ui text-[hsl(var(--text-2))]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
            {label}
        </span>
    );
}

function Stat({ label, value, tone = "muted" }) {
    const toneColor = {
        muted:    "text-[hsl(var(--text-2))]",
        success:  "text-[hsl(var(--success))]",
        danger:   "text-[hsl(var(--danger))]",
        warning:  "text-[hsl(var(--warning))]",
        primary:  "text-[hsl(var(--accent-primary))]",
    }[tone] || "text-[hsl(var(--text-2))]";
    return (
        <div className="flex flex-col items-start">
            <span className="text-[9px] font-ui uppercase tracking-[0.16em] text-[hsl(var(--text-3))]">{label}</span>
            <span className={cn("text-[13px] font-num tabular-nums font-semibold", toneColor)}>{value}</span>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL WRAPPER  — ProtectionVisualAnalytics
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ProtectionVisualAnalytics
 * ─────────────────────────
 * Renders all Phase 2 visual analytics panels in a collapsible NeonPanel grid.
 *
 * Props
 * ─────
 * baselineTrades   — trade array (baseline variant)
 * tradesByMode     — { [modeKey]: tradeArray } from protectionResults
 * selectedMode     — string, currently selected protection mode key
 * onModeChange     — (modeKey) => void
 * pairs            — array from buildPairedTrades, or []
 * breachTimestamps — array of ISO strings (close_breach_time)
 * hasProtectedData — boolean
 */
export function ProtectionVisualAnalytics({
    baselineTrades = [],
    tradesByMode = {},
    selectedMode = null,
    onModeChange = null,
    pairs = [],
    breachTimestamps = [],
    hasProtectedData = false,
}) {
    const modeKeys = Object.keys(tradesByMode);
    const protectedTrades = selectedMode ? (tradesByMode[selectedMode] ?? []) : [];

    return (
        <div className="space-y-4">
            {/* Mode selector strip */}
            {modeKeys.length > 0 && onModeChange && (
                <div className="mx-6 flex flex-wrap gap-2">
                    <span className="self-center text-[10px] font-ui uppercase tracking-[0.16em] text-[hsl(var(--text-3))] mr-1">Protection Result</span>
                    {modeKeys.map(m => (
                        <button
                            key={m}
                            onClick={() => onModeChange(m)}
                            className={cn(
                                "px-3 py-1 clip-bevel-sm border text-[10px] font-ui uppercase tracking-[0.14em] transition-colors",
                                selectedMode === m
                                    ? "border-[hsl(var(--accent-primary)/0.6)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.1)]"
                                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]",
                            )}
                        >
                            {prettyModeName(m)}
                        </button>
                    ))}
                </div>
            )}

            {/* Row 1: equity overlay + scatter */}
            <div className="mx-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Equity Impact Overlay" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <EquityCurveOverlay
                            baselineTrades={baselineTrades}
                            tradesByMode={tradesByMode}
                            selectedMode={selectedMode}
                        />
                    </div>
                </NeonPanel>
                <NeonPanel title="Trade-Level Protection Impact" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <ProtectionImpactScatter pairs={pairs} />
                    </div>
                </NeonPanel>
            </div>

            {/* Row 2: R distribution + streak */}
            <div className="mx-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Executed R Distribution" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <RDistributionHistogram
                            baselineTrades={baselineTrades}
                            protectedTrades={protectedTrades}
                        />
                    </div>
                </NeonPanel>
                <NeonPanel title="Win / Loss Streak Profile" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <StreakVisualiser trades={baselineTrades} />
                    </div>
                </NeonPanel>
            </div>

            {/* Row 3: drawdown comparison + trigger time */}
            <div className="mx-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <NeonPanel title="Drawdown Defense Comparison" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <DrawdownComparison
                            baselineTrades={baselineTrades}
                            tradesByMode={tradesByMode}
                        />
                    </div>
                </NeonPanel>
                <NeonPanel title="Invalidation Trigger-Time Distribution (UTC)" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <TriggerTimeHistogram breachTimes={breachTimestamps} />
                    </div>
                </NeonPanel>
            </div>

            {/* Row 4: Penetration sensitivity (full width) */}
            <div className="mx-6">
                <NeonPanel title="OB Penetration Defense Sensitivity" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <PenetrationSensitivity trades={baselineTrades} />
                    </div>
                </NeonPanel>
            </div>

            {/* Row 5: OB breakdown (full width) */}
            <div className="mx-6">
                <NeonPanel title="OB Risk Characteristic Breakdown" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <ObCharacteristicBreakdown trades={baselineTrades} />
                    </div>
                </NeonPanel>
            </div>

            {/* Row 6: Trade lifecycle flow (full width) */}
            <div className="mx-6">
                <NeonPanel title="Protection Lifecycle Flow" collapsible defaultCollapsed={false}>
                    <div className="px-3 pb-3">
                        <TradeLifecycleFlow
                            trades={baselineTrades}
                            tradesByMode={tradesByMode}
                            selectedMode={selectedMode}
                        />
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}
