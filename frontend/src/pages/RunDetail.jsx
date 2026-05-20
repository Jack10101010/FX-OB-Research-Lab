import React from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { EquityCurve } from "@/components/lab/EquityCurve";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonButton, NeonSelect } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import { computeProfitFactor, computeMaxDrawdown, computeExpectancy } from "@/lib/metrics";
import { Map as MapIcon, Crosshair, GitCompareArrows, TrendingUp, Hash, Activity, Target, AlertTriangle, ShieldCheck } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie } from "recharts";

export default function RunDetail() {
    const { ACTIVE_RUN, EQUITY_CURVE, TRADES, MONTHLY, R_DIST, RUNS, getRunData, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS } = useDataset();
    const params = useParams();
    const runId = params.runId === "active" ? ACTIVE_RUN.id : decodeURIComponent(params.runId || ACTIVE_RUN.id);
    const run = RUNS.find((r) => r.id === runId) || ACTIVE_RUN;
    // Per-run lookup: imported bundles carry their own trades + equity curve.
    const runData = getRunData(runId);
    const isActiveRun = run.id === ACTIVE_RUN.id;
    const tradesForRun  = isActiveRun ? TRADES : (runData?.trades || null);
    const equityForRun  = isActiveRun ? EQUITY_CURVE : (runData?.equityCurve || null);
    const hasFull = !!(tradesForRun?.length && equityForRun?.length);
    const pf         = hasFull ? computeProfitFactor(tradesForRun) : null;
    const maxDd      = hasFull ? computeMaxDrawdown(equityForRun)  : null;
    const expectancy = hasFull ? computeExpectancy(tradesForRun)   : null;
    const spark = (equityForRun || EQUITY_CURVE).filter((_, i) => i % 12 === 0).map((p) => p.netR);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="RUN DETAIL"
                title={run.id}
                subtitle={`${run.symbol} · ${run.detectionTf} · RR ${run.rr.toFixed(1)} · ${run.dateRange || "2025-05-18 → 2026-05-18"}`}
                actions={
                    <>
                        <Link to="/strategy-map"><NeonButton icon={MapIcon} tone="primary">Open Strategy Map</NeonButton></Link>
                        <Link to="/trade-inspector"><NeonButton icon={Crosshair} tone="secondary">Open Trade Inspector</NeonButton></Link>
                        <Link to="/comparison"><NeonButton icon={GitCompareArrows} tone="ghost">Compare Run</NeonButton></Link>
                    </>
                }
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Net R"          value={`${run.netR >= 0 ? "+" : ""}${run.netR}R`} sub={`${run.trades} trades`}     tone="primary"   icon={TrendingUp} sparkline={spark} />
                <MetricChip label="Win Rate"       value={`${run.winRate.toFixed(1)}%`}             sub={`${run.wins || ACTIVE_RUN.wins} / ${run.losses || ACTIVE_RUN.losses}`} tone="secondary" icon={Target} />
                <MetricChip label="Trades"         value={String(run.trades)}                       sub="Validated"                      tone="muted"     icon={Hash} />
                <MetricChip label="Expectancy"     value={expectancy != null ? `${expectancy.toFixed(3)}R` : "N/A"}  sub={expectancy != null ? "per trade · computed" : "Limited Data"} tone="primary"   icon={Activity} />
                <MetricChip label="Profit Factor"  value={pf != null ? pf.toFixed(2) : "N/A"}                       sub={pf != null ? "Σ wins / |Σ losses|" : "Limited Data"}        tone="secondary" icon={ShieldCheck} />
                <MetricChip label="Max Drawdown"   value={maxDd != null ? `${maxDd.toFixed(1)}R` : "N/A"}            sub={maxDd != null ? "peak → trough" : "Limited Data"}            tone="danger"    icon={AlertTriangle} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-2" title="Equity Curve" action={<Pill tone="primary">NET R</Pill>}>
                    <EquityCurve data={equityForRun || EQUITY_CURVE} height={300} />
                </NeonPanel>

                <NeonPanel title="Configuration">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11.5px]">
                        {[
                            ["Symbol",        run.symbol],
                            ["Detection TF",  run.detectionTf],
                            ["Execution TF",  run.executionTf || "1m"],
                            ["Date Range",    run.dateRange || "May '25 → May '26"],
                            ["RR",            (run.rr ?? 0).toFixed(1)],
                            ["Stop Buffer",   `${run.stopBuffer ?? 1.0} pip`],
                            ["Entry Buffer",  `${run.entryBuffer ?? 0} pip`],
                            ["Verify Ticks",  String(run.verifyTicks ?? 0)],
                            ["Execution",     run.executionMode || "single_position"],
                            ["Trade Variant", isActiveRun ? variantLabel(ACTIVE_TRADE_VARIANT) : variantLabel(runData?.primaryVariant || run.executionMode)],
                            ["Source",        runData ? "Imported" : "Mock"],
                            ["Structure",     "Both"],
                            ["Direction",     "Both"],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div className="text-muted-lab uppercase tracking-wider text-[10px]">{k}</div>
                                <div className="text-right text-white">{v}</div>
                            </React.Fragment>
                        ))}
                    </div>
                </NeonPanel>

                <NeonPanel
                    className="xl:col-span-2"
                    title="Trade Ledger"
                    action={
                        <div className="flex items-center gap-2">
                            {isActiveRun && <VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />}
                            <Pill tone="secondary">{(tradesForRun || []).length} TRADES</Pill>
                        </div>
                    }
                >
                    <DataTable
                        testId="run-detail-trades"
                        maxHeight={360}
                        columns={[
                            { key: "id",        label: "ID" },
                            { key: "direction", label: "Dir", render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction}</Pill> },
                            { key: "structure", label: "Struct" },
                            { key: "session",   label: "Session" },
                            { key: "entry",     label: "Entry Time" },
                            { key: "entryPrice",label: "Entry",   align: "right" },
                            { key: "stop",      label: "Stop",    align: "right" },
                            { key: "tp",        label: "TP",      align: "right" },
                            { key: "r",         label: "R",       align: "right", render: (r) => <ColoredR value={r.r} /> },
                            { key: "outcome",   label: "Result",  render: (r) => <Pill tone={r.outcome === "Win" ? "success" : "danger"}>{r.outcome}</Pill> },
                        ]}
                        rows={tradesForRun || []}
                    />
                </NeonPanel>

                <NeonPanel title="Order Block Stats">
                    <div className="grid grid-cols-2 gap-3 text-[12px] font-mono">
                        <Stat label="Bullish OBs"  value="68" tone="primary" />
                        <Stat label="Bearish OBs"  value="62" tone="secondary" />
                        <Stat label="BOS"          value="74" tone="primary" />
                        <Stat label="CHoCH"        value="56" tone="secondary" />
                        <Stat label="Reverse Cancels" value={String(run.reverseCancels ?? 2)} tone="warning" />
                        <Stat label="Avg OB Width" value="14.2 pips" tone="muted" />
                    </div>
                </NeonPanel>

                <NeonPanel title="Outcome Distribution">
                    <div className="flex items-center gap-4">
                        <div style={{ width: 120, height: 120 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={[{ name: "Wins", value: 41 }, { name: "Losses", value: 96 }]} dataKey="value" innerRadius={38} outerRadius={58} stroke="hsl(var(--panel))" strokeWidth={2} isAnimationActive={false}>
                                        <Cell fill="hsl(var(--accent-primary))" />
                                        <Cell fill="hsl(var(--bear) / 0.55)" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ width: "60%", height: 120 }}>
                            <ResponsiveContainer>
                                <BarChart data={R_DIST}>
                                    <XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                    <YAxis hide />
                                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                        {R_DIST.map((d, i) => <Cell key={i} fill={d.bucket.startsWith("-") ? "hsl(var(--bear)/0.65)" : "hsl(var(--accent-primary))"} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Monthly Performance (Net R)">
                    <div style={{ width: "100%", height: 200 }}>
                        <ResponsiveContainer>
                            <BarChart data={MONTHLY} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                                <CartesianGrid stroke="hsl(var(--grid))" strokeDasharray="2 4" vertical={false} />
                                <XAxis dataKey="m" tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted))", fontFamily: "JetBrains Mono", fontSize: 10 }} tickFormatter={(v) => `${v}R`} />
                                <Tooltip contentStyle={{ background: "hsl(var(--panel-2))", border: "1px solid hsl(var(--accent-primary)/0.4)", fontFamily: "JetBrains Mono", fontSize: 11 }} />
                                <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                                    {MONTHLY.map((d, i) => <Cell key={i} fill={d.v >= 0 ? "hsl(var(--accent-primary))" : "hsl(var(--bear)/0.75)"} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </NeonPanel>

                <SessionMatrix trades={tradesForRun} />
                <TimeOfDayHeatmap trades={tradesForRun} />
            </div>
        </div>
    );
}

function VariantSelector({ variants, value }) {
    if (!variants?.length) return null;
    if (variants.length === 1) return <Pill tone="muted">{variantLabel(variants[0])}</Pill>;
    return (
        <NeonSelect
            testId="run-detail-variant"
            value={value || variants[0]}
            onChange={setSelectedTradeVariant}
            options={variants.map((v) => ({ value: v, label: variantLabel(v) }))}
        />
    );
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

function Stat({ label, value, tone }) {
    const color = { primary: "text-[hsl(var(--accent-primary))]", secondary: "text-[hsl(var(--accent-secondary))]", warning: "text-[hsl(var(--warning))]", muted: "text-white" }[tone];
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2.5 bg-[hsl(var(--panel-2)/0.5)]">
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{label}</div>
            <div className={`text-[18px] font-display font-semibold tabular-nums mt-1 ${color}`}>{value}</div>
        </div>
    );
}

const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];

function deriveSessionFromTimestamp(value) {
    if (value == null || value === "") return "Unknown";
    const d = new Date(value);
    if (!isFinite(d.getTime())) return "Unknown";
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function normalizeSession(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull")) return "London Lull";
    if (lower.includes("london")) return "London";
    if (lower.includes("new") || lower === "ny" || lower.includes("nyse")) return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside")) return "Outside";
    if (lower === "unknown" || lower === "—") return "Unknown";
    return text;
}

function originSessionForTrade(trade) {
    return normalizeSession(trade?.obOriginSession)
        || normalizeSession(trade?.originSession)
        || normalizeSession(trade?.obSession)
        || normalizeSession(trade?.obDirection)
        || normalizeSession(trade?.direction)
        || normalizeSession(trade?.session)
        || "Unknown";
}

function fillSessionForTrade(trade) {
    return normalizeSession(trade?.fillSession)
        || normalizeSession(trade?.entrySession)
        || normalizeSession(trade?.session)
        || deriveSessionFromTimestamp(trade?.entry);
}

function SessionMatrix({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const rows = [];
        const rowSet = new Set();
        const cells = {};

        list.forEach((trade) => {
            const row = originSessionForTrade(trade);
            const col = fillSessionForTrade(trade);
            const key = `${row}|||${col}`;
            const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
            if (!rowSet.has(row)) {
                rowSet.add(row);
                rows.push(row);
            }
            if (!cells[key]) cells[key] = { netR: 0, count: 0, row, col };
            cells[key].netR += r;
            cells[key].count += 1;
        });

        const entries = Object.values(cells);
        const best = entries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worst = entries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const active = entries.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const maxAbs = entries.reduce((m, cur) => Math.max(m, Math.abs(cur.netR)), 0) || 1;
        return { rows: rows.length ? rows : ["Unknown"], cells, best, worst, active, maxAbs, count: list.length };
    }, [trades]);

    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;
    const pairLabel = (cell) => cell ? `${cell.row} × ${cell.col}` : "—";

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Session Origin × Fill Session (Net R)"
            action={<Pill tone="muted">{data.count} TRADES</Pill>}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="session-matrix-summary">
                <MetricChip label="Best Pair" value={data.best ? fmtR(data.best.netR) : "—"} sub={pairLabel(data.best)} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Pair" value={data.worst ? fmtR(data.worst.netR) : "—"} sub={pairLabel(data.worst)} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active" value={data.active ? `${data.active.count}` : "—"} sub={pairLabel(data.active)} tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="session-matrix">
                <table className="w-full min-w-[720px] font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Origin / Fill</th>
                            {SESSION_COLUMNS.map((session) => (
                                <th key={session} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{session}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row) => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {SESSION_COLUMNS.map((col) => {
                                    const cell = data.cells[`${row}|||${col}`];
                                    if (!cell) {
                                        return (
                                            <td key={col}>
                                                <div className="clip-bevel-sm px-2 py-2 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / data.maxAbs)).toFixed(3);
                                    const bg = cell.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={col}>
                                            <div className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums" style={{ background: bg }}>
                                                <div>{fmtR(cell.netR)}</div>
                                                <div className="text-[9px] text-white/70">{cell.count} trade{cell.count === 1 ? "" : "s"}</div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// ── Entry Time Heatmap · Day-of-week × Hour-of-day (Net R) ───────────
// Read-only: buckets the run's trades by their entry timestamp's weekday and
// hour, summing Net R per cell. Timestamp-safe (invalid/missing entries are
// skipped) and renders no NaN.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun

function TimeOfDayHeatmap({ trades }) {
    const data = React.useMemo(() => {
        const list = Array.isArray(trades) ? trades : [];
        const cells = {};        // `${day}-${hour}` -> { netR, count }
        const dayStats = {};     // day -> { netR, count }
        const hourStats = {};    // hour -> { netR, count }
        const hourCount = {};    // hour -> trade count
        const hourSet = new Set();
        let used = 0, skipped = 0;

        list.forEach((t) => {
            const d = t?.entry != null && t.entry !== "" ? new Date(t.entry) : null;
            if (!d || !isFinite(d.getTime())) { skipped++; return; }
            const day = d.getDay();
            const hour = d.getHours();
            const rv = Number.isFinite(Number(t?.r)) ? Number(t.r) : 0;
            const key = `${day}-${hour}`;
            if (!cells[key]) cells[key] = { netR: 0, count: 0 };
            cells[key].netR += rv;
            cells[key].count += 1;
            if (!dayStats[day]) dayStats[day] = { netR: 0, count: 0, day };
            dayStats[day].netR += rv;
            dayStats[day].count += 1;
            if (!hourStats[hour]) hourStats[hour] = { netR: 0, count: 0, hour };
            hourStats[hour].netR += rv;
            hourStats[hour].count += 1;
            hourSet.add(hour);
            hourCount[hour] = (hourCount[hour] || 0) + 1;
            used += 1;
        });

        const hours = [...hourSet].sort((a, b) => a - b);

        const days = Object.values(dayStats);
        const hourEntries = Object.values(hourStats);
        const bestDay = days.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstDay = days.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const bestHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
        const worstHour = hourEntries.reduce((acc, cur) => (!acc || cur.netR < acc.netR ? cur : acc), null);
        const activeDay = days.reduce((acc, cur) => (!acc || cur.count > acc.count ? cur : acc), null);
        const populatedSlots = Object.values(cells);
        const profitableSlots = populatedSlots.filter((c) => c.netR > 0).length;
        const profitableSlotPct = populatedSlots.length ? (profitableSlots / populatedSlots.length) * 100 : null;
        const maxAbs = Object.values(cells).reduce((m, v) => Math.max(m, Math.abs(v.netR)), 0) || 1;
        return { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs };
    }, [trades]);

    const { cells, hours, bestDay, worstDay, bestHour, worstHour, activeDay, profitableSlotPct, used, skipped, maxAbs } = data;
    const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;
    const fmtR = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`;

    if (!used) {
        return (
            <NeonPanel className="xl:col-span-3" title="Entry Time Heatmap · All Trades by Weekday × Hour">
                <div data-testid="tod-heatmap-empty" className="py-8 text-center text-muted-lab font-mono text-[12px]">
                    No timestamped trades available to build the time-of-day heatmap.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="Entry Time Heatmap · All Trades by Weekday × Hour"
            action={<Pill tone="muted">{used} trades{skipped ? ` · ${skipped} undated` : ""}</Pill>}
        >
            <div className="mb-3 text-[11px] font-mono text-muted-lab">
                Aggregates every trade in the selected run by entry weekday and hour.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4" data-testid="tod-summary">
                <MetricChip label="Best Day by Net R"    value={bestDay ? fmtR(bestDay.netR) : "—"}       sub={bestDay ? DOW[bestDay.day] : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Day by Net R"   value={worstDay ? fmtR(worstDay.netR) : "—"}     sub={worstDay ? DOW[worstDay.day] : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Best Hour by Net R"   value={bestHour ? fmtR(bestHour.netR) : "—"}     sub={bestHour ? fmtHour(bestHour.hour) : "—"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Hour by Net R"  value={worstHour ? fmtR(worstHour.netR) : "—"}   sub={worstHour ? fmtHour(worstHour.hour) : "—"} tone="danger" icon={AlertTriangle} />
                <MetricChip label="Most Active Day"      value={activeDay ? DOW[activeDay.day] : "—"}     sub={activeDay ? `${activeDay.count} trade${activeDay.count === 1 ? "" : "s"}` : "—"} tone="secondary" icon={Activity} />
                <MetricChip label="Profitable Slot %"    value={profitableSlotPct != null ? `${profitableSlotPct.toFixed(1)}%` : "—"} sub="positive Net R cells" tone="secondary" icon={Activity} />
            </div>

            <div className="overflow-x-auto scrollbar-thin" data-testid="tod-heatmap">
                <table className="font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Day / Hr</th>
                            {hours.map((h) => (
                                <th key={h} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider tabular-nums">{fmtHour(h)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {DOW_ORDER.map((day) => (
                            <tr key={day}>
                                <td className="text-muted-lab px-2 py-1">{DOW[day]}</td>
                                {hours.map((h) => {
                                    const c = cells[`${day}-${h}`];
                                    if (!c || c.count === 0) {
                                        return (
                                            <td key={h}>
                                                <div className="clip-bevel-sm px-2 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.15 + 0.5 * (Math.abs(c.netR) / maxAbs)).toFixed(3);
                                    const bg = c.netR >= 0
                                        ? `hsl(var(--accent-primary) / ${alpha})`
                                        : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={h}>
                                            <div
                                                className="clip-bevel-sm px-2 py-1 text-center text-white tabular-nums"
                                                style={{ background: bg }}
                                                title={`${DOW[day]} ${fmtHour(h)} · ${c.count} trade${c.count === 1 ? "" : "s"}`}
                                            >
                                                {fmtR(c.netR).replace("R", "")}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
