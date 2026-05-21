import React from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset } from "@/data/store";
import {
    Activity, AlertTriangle, MousePointerClick, ShieldCheck, Target, TrendingUp,
} from "lucide-react";

const LOW_SAMPLE_N = 10;
const EMPTY_TRADES = [];
const ENTRY_BACKLOG = [
    ["Spread / Slippage Modelling", "Future execution realism", "Model realistic spread, slippage, and missed fills around reactive confirmation entries."],
    ["Stop-Entry Confirmation Models", "Future exporter fields", "Compare close-inside followed by stop/trigger entry instead of passive edge retest."],
    ["Liquidity Confirmation", "Future derived feature", "Require sweep/reclaim or liquidity event tags before activating an entry model."],
    ["HTF Confirmation", "Future context tagging", "Split entry performance by higher-timeframe alignment and structure state."],
    ["News-Aware Entries", "Future external data", "Suppress or alter entries near high-impact news windows."],
    ["Session-Aware Entries", "Research hook", "Enable model selection by Asia, London, London Lull, New York, and Outside sessions."],
    ["Regime-Aware Entries", "Future regime tagging", "Compare entry models during trending, ranging, and volatility expansion regimes."],
    ["Broker Execution Realism", "Future execution model", "Account for order queueing, partial fills, latency, and broker-specific fill behavior."],
];

const PLANNED_ENTRY_MODES = [
    { mode: "baseline", label: "Baseline · Edge Touch", family: "Baseline", threshold: "Edge" },
    { mode: "penetration_10", label: "Penetration 10%", family: "Penetration", threshold: "10%" },
    { mode: "penetration_25", label: "Penetration 25%", family: "Penetration", threshold: "25%" },
    { mode: "penetration_50", label: "Penetration 50%", family: "Penetration", threshold: "50%" },
    { mode: "penetration_75", label: "Penetration 75%", family: "Penetration", threshold: "75%" },
    { mode: "close_inside_edge", label: "1m Close Inside → Edge Order", family: "Confirmation", threshold: "Close inside" },
    { mode: "wick_reclaim", label: "Wick Reclaim Confirmation", family: "Confirmation", threshold: "Reclaim" },
    { mode: "sweep_reclaim", label: "Sweep + Reclaim", family: "Confirmation", threshold: "Sweep" },
    { mode: "delayed_confirmation", label: "Delayed Confirmation Entry", family: "Confirmation", threshold: "Delay" },
];

export default function EntriesLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const exactRows = React.useMemo(() => buildEntryResultRows(activeRun, trades), [activeRun, trades]);
    const hasImportedEntryResults = exactRows.some((row) => row.exact && !row.isBaseline);
    const baseline = exactRows.find((row) => row.isBaseline) || exactRows[0];
    const analytics = React.useMemo(() => buildEntryAnalytics(trades, exactRows), [trades, exactRows]);

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="ENTRIES LAB"
                title={ACTIVE_RUN?.id || "No active run"}
                subtitle={`${ACTIVE_RUN?.symbol || "Symbol"} · ${ACTIVE_RUN?.detectionTf || "TF"} · ${variantLabel(ACTIVE_TRADE_VARIANT)} — exact entry execution research`}
                actions={(
                    <div className="flex items-center gap-2">
                        <Pill tone={activeRunId ? "primary" : "muted"}>{activeRunId ? "IMPORTED" : "MOCK"}</Pill>
                        <Pill tone="secondary">{trades.length} TRADES</Pill>
                    </div>
                )}
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Baseline Trades" value={String(trades.length)} sub="active variant" tone="primary" icon={MousePointerClick} />
                <MetricChip label="Baseline WR" value={fmtPct(baseline?.winRate)} sub={`${analytics.wins}W / ${analytics.losses}L`} tone="secondary" icon={Target} />
                <MetricChip label="Baseline Net R" value={fmtR(baseline?.netR)} sub="edge touch" tone={num(baseline?.netR) >= 0 ? "primary" : "danger"} icon={TrendingUp} />
                <MetricChip label="Exact Modes" value={String(exactRows.filter((r) => r.exact && !r.isBaseline).length)} sub="imported results" tone={hasImportedEntryResults ? "success" : "muted"} icon={ShieldCheck} />
                <MetricChip label="Planned Models" value={String(PLANNED_ENTRY_MODES.length - 1)} sub="simulation-ready structure" tone="muted" icon={Activity} />
                <MetricChip label="Low Sample Rule" value={`n < ${LOW_SAMPLE_N}`} sub="research safety" tone="muted" icon={AlertTriangle} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-3" title="Exact Entry Simulation Results" action={<Pill tone={hasImportedEntryResults ? "success" : "warning"}>{hasImportedEntryResults ? "EXACT DATA" : "BASELINE ONLY"}</Pill>}>
                    <Note tone={hasImportedEntryResults ? "muted" : "warning"}>
                        Exact entry model CSV/summary plumbing is not present yet. Baseline is derived from active trades; non-baseline rows are simulation-ready placeholders.
                    </Note>
                    <DataTable
                        testId="entries-exact-results"
                        maxHeight={360}
                        columns={[
                            { key: "mode", label: "Mode", render: (r) => <EntryModeLabel row={r} /> },
                            { key: "threshold", label: "Threshold", align: "right", render: (r) => r.threshold || "—" },
                            { key: "trades", label: "Trades", align: "right", render: (r) => fmtCount(r.trades) },
                            { key: "fills", label: "Fills", align: "right", render: (r) => fmtCount(r.fills) },
                            { key: "fillPct", label: "Fill %", align: "right", render: (r) => fmtMaybePct(r.fillPct) },
                            { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                            { key: "netR", label: "Net R", align: "right", render: (r) => r.netR == null ? "—" : <ColoredR value={r.netR} /> },
                            { key: "expectancy", label: "Expectancy", align: "right", render: (r) => fmtMaybeExp(r.expectancy) },
                            { key: "maxDD", label: "Max DD", align: "right", render: (r) => fmtMaybeR(r.maxDD) },
                            { key: "avgMAE", label: "Avg MAE", align: "right", render: (r) => fmtMaybeR(r.avgMAE) },
                            { key: "avgMFE", label: "Avg MFE", align: "right", render: (r) => fmtMaybeR(r.avgMFE) },
                            { key: "avgTimeToTP", label: "Avg Time to TP", align: "right", render: (r) => r.avgTimeToTP || "—" },
                            { key: "avgTimeToSL", label: "Avg Time to SL", align: "right", render: (r) => r.avgTimeToSL || "—" },
                            { key: "delta", label: "Delta vs Baseline", align: "right", render: (r) => <DeltaCell row={r} /> },
                        ]}
                        rows={exactRows}
                        rowKey="mode"
                    />
                </NeonPanel>

                <BucketPanel title="Fill Rate Analysis" rows={analytics.fillRateRows} />
                <BucketPanel title="Penetration Entry Comparison" rows={analytics.penetrationRows} />
                <BucketPanel title="Missed Winner Analysis" rows={analytics.missedWinnerRows} />
                <BucketPanel title="Avoided Loser Analysis" rows={analytics.avoidedLoserRows} />
                <BucketPanel title="Time-to-Fill Analysis" rows={analytics.timeToFillRows} />
                <BucketPanel title="Session Entry Performance" rows={analytics.sessionRows} />
                <HeatmapPanel title="Entry Timing Heatmap" grid={analytics.hourGrid} />
                <HeatmapPanel title="Day / Hour Entry Toxicity" grid={analytics.toxicityGrid} danger />
                <EntryOutcomeMatrix rows={analytics.matrixRows} />
                <LifecyclePanel />
                <ResearchBacklog />
            </div>
        </div>
    );
}

function BucketPanel({ title, rows }) {
    return (
        <NeonPanel title={title} action={<Pill tone={rows.some((r) => r.exact) ? "success" : "muted"}>{rows.length} ROWS</Pill>}>
            <DataTable
                testId={`entries-${slug(title)}`}
                maxHeight={240}
                columns={[
                    { key: "label", label: "Bucket", render: (r) => <BucketLabel row={r} /> },
                    { key: "count", label: "N", align: "right", render: (r) => fmtCount(r.count) },
                    { key: "fillPct", label: "Fill %", align: "right", render: (r) => fmtMaybePct(r.fillPct) },
                    { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                    { key: "netR", label: "Net R", align: "right", render: (r) => r.netR == null ? "—" : <ColoredR value={r.netR} /> },
                    { key: "expectancy", label: "Exp", align: "right", render: (r) => fmtMaybeExp(r.expectancy) },
                ]}
                rows={rows}
            />
        </NeonPanel>
    );
}

function HeatmapPanel({ title, grid, danger = false }) {
    return (
        <NeonPanel className="xl:col-span-3" title={title} action={<Pill tone={grid.total ? (danger ? "danger" : "secondary") : "muted"}>{grid.total} TRADES</Pill>}>
            <div className="overflow-x-auto scrollbar-thin" data-testid={`entries-${slug(title)}`}>
                <table className="w-full min-w-[760px] font-mono text-[10.5px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Day / Hr UTC</th>
                            {HOURS.map((h) => <th key={h} className="text-muted-lab px-1 py-1 text-[9px] tabular-nums">{pad2(h)}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {WEEKDAYS.map((day, di) => (
                            <tr key={day}>
                                <td className="text-muted-lab px-2 py-1">{day}</td>
                                {HOURS.map((hour) => {
                                    const cell = grid.cells[`${di}-${hour}`];
                                    if (!cell) return <td key={hour}><div className="clip-bevel-sm px-1 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div></td>;
                                    const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / grid.maxAbs)).toFixed(3);
                                    const bg = cell.netR >= 0 ? `hsl(var(--accent-primary) / ${alpha})` : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={hour}>
                                            <div className="clip-bevel-sm px-1 py-1 text-center text-white tabular-nums leading-tight" style={{ background: bg }}>
                                                <div>{cell.count}</div>
                                                <div className="text-[8px] text-white/70">{fmtR(cell.netR)}</div>
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

function EntryOutcomeMatrix({ rows }) {
    return (
        <NeonPanel className="xl:col-span-3" title="Entry Outcome Matrix" action={<Pill tone="muted">BASELINE VIEW</Pill>}>
            <DataTable
                testId="entries-outcome-matrix"
                maxHeight={240}
                columns={[
                    { key: "label", label: "Entry Family" },
                    { key: "fills", label: "Fills", align: "right", render: (r) => fmtCount(r.fills) },
                    { key: "wins", label: "Wins", align: "right", render: (r) => fmtCount(r.wins) },
                    { key: "losses", label: "Losses", align: "right", render: (r) => fmtCount(r.losses) },
                    { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                    { key: "netR", label: "Net R", align: "right", render: (r) => r.netR == null ? "—" : <ColoredR value={r.netR} /> },
                    { key: "status", label: "Status", render: (r) => <Pill tone={r.exact ? "success" : "warning"}>{r.status}</Pill> },
                ]}
                rows={rows}
            />
        </NeonPanel>
    );
}

function LifecyclePanel() {
    const rows = [
        ["Cancel if structurally invalidated before fill", "Pending lifecycle", "Requires pending-order exporter state"],
        ["Cancel if excessive penetration pre-fill", "Pending lifecycle", "Requires pre-fill penetration trail"],
        ["Cancel after X time decay", "Pending lifecycle", "Requires pending age / expiry simulation"],
        ["Reverse touch invalidation", "Invalidation", "Requires reverse-side touch tracking"],
        ["Displacement-through cancel", "Invalidation", "Requires candle displacement tags"],
    ];
    return (
        <NeonPanel className="xl:col-span-3" title="Pre-Fill / Pending Lifecycle Ideas" action={<Pill tone="warning">ARCHITECTURE PLACEHOLDERS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {rows.map(([title, status, body]) => (
                    <RoadmapCard key={title} title={title} status={status} body={body} />
                ))}
            </div>
        </NeonPanel>
    );
}

function ResearchBacklog() {
    return (
        <NeonPanel className="xl:col-span-3" title="Future Backlog" action={<Pill tone="muted">{ENTRY_BACKLOG.length} ITEMS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                {ENTRY_BACKLOG.map(([title, status, body]) => (
                    <RoadmapCard key={title} title={title} status={status} body={body} />
                ))}
            </div>
        </NeonPanel>
    );
}

function RoadmapCard({ title, status, body }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2.5">
            <div className="flex items-start gap-2 justify-between">
                <div className="text-[11.5px] font-display text-white leading-tight">{title}</div>
                <Pill tone="warning">{status}</Pill>
            </div>
            <p className="mt-2 text-[11px] text-[hsl(var(--text-2))] leading-relaxed">{body}</p>
        </div>
    );
}

function EntryModeLabel({ row }) {
    return (
        <div className="flex items-center gap-2">
            <span className={row.isBaseline ? "text-[hsl(var(--accent-secondary))] font-semibold" : row.isBestNetR || row.isBestExpectancy ? "text-[hsl(var(--success))] font-semibold" : "text-white"}>
                {row.label || prettyMode(row.mode)}
            </span>
            {row.isBaseline && <Pill tone="secondary">BASELINE</Pill>}
            {row.isBestNetR && <Pill tone="success">BEST NET R</Pill>}
            {row.isBestExpectancy && <Pill tone="primary">BEST EXP</Pill>}
            {row.isLowestDD && <Pill tone="muted">LOWEST DD</Pill>}
            {!row.exact && !row.isBaseline && <Pill tone="warning">PENDING</Pill>}
        </div>
    );
}

function BucketLabel({ row }) {
    return (
        <div className="flex items-center gap-2">
            <span>{row.label}</span>
            {row.count != null && row.count < LOW_SAMPLE_N && <Pill tone="warning">LOW N</Pill>}
            {!row.exact && <Pill tone="muted">LIMITED</Pill>}
        </div>
    );
}

function DeltaCell({ row }) {
    if (row.isBaseline) return <span className="font-mono text-[hsl(var(--accent-secondary))]">BASELINE</span>;
    if (!isFiniteNumber(row.deltaVsBaseline)) return "—";
    const color = row.deltaVsBaseline >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    return <span className={`font-mono font-semibold tabular-nums ${color}`}>{fmtR(row.deltaVsBaseline)}</span>;
}

function Note({ tone = "muted", children }) {
    const color = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-muted-lab";
    return <div className={`mb-2 text-[10.5px] font-mono leading-relaxed ${color}`}>{children}</div>;
}

function buildEntryResultRows(run, trades) {
    const exact = flattenEntrySummary(run?.entryResults?.summary || run?.summary?.entry_results || {});
    const exactByMode = new Map(exact.map((row) => [normalizeMode(row.mode), row]));
    const baseline = baselineEntryRow(trades);
    const rows = PLANNED_ENTRY_MODES.map((planned) => {
        const src = exactByMode.get(planned.mode);
        return src ? entryRowFromSummary(planned, src, baseline) : { ...planned, exact: planned.mode === "baseline", ...baselineForPlanned(planned, baseline) };
    });
    markHighlights(rows);
    return rows;
}

function baselineEntryRow(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const wins = list.filter((t) => rOf(t) > 0).length;
    const losses = list.filter((t) => rOf(t) < 0).length;
    const netR = list.reduce((sum, t) => sum + rOf(t), 0);
    return {
        mode: "baseline",
        label: "Baseline · Edge Touch",
        threshold: "Edge",
        trades: list.length,
        fills: list.length,
        fillPct: list.length ? 100 : 0,
        winRate: list.length ? (wins / list.length) * 100 : 0,
        netR: round1(netR),
        expectancy: list.length ? netR / list.length : 0,
        maxDD: maxDrawdown(list),
        wins,
        losses,
        avgMAE: null,
        avgMFE: null,
        avgTimeToTP: null,
        avgTimeToSL: null,
        deltaVsBaseline: 0,
        exact: true,
        isBaseline: true,
    };
}

function baselineForPlanned(planned, baseline) {
    if (planned.mode === "baseline") return baseline;
    return {
        trades: null,
        fills: null,
        fillPct: null,
        winRate: null,
        netR: null,
        expectancy: null,
        maxDD: null,
        avgMAE: null,
        avgMFE: null,
        avgTimeToTP: null,
        avgTimeToSL: null,
        deltaVsBaseline: null,
        exact: false,
    };
}

function entryRowFromSummary(planned, src, baseline) {
    const netR = firstNumber(src, "net_r", "netR", "net");
    return {
        ...planned,
        exact: true,
        trades: firstNumber(src, "trades", "trade_count", "total_trades"),
        fills: firstNumber(src, "fills", "filled_trades", "fill_count"),
        fillPct: normalizePct(firstNumber(src, "fill_pct", "fill_rate", "fill_percent")),
        winRate: normalizePct(firstNumber(src, "win_rate", "wr")),
        netR,
        expectancy: firstNumber(src, "expectancy", "avg_r", "expectancy_r"),
        maxDD: firstNumber(src, "max_dd", "max_drawdown", "max_drawdown_r"),
        avgMAE: firstNumber(src, "avg_mae", "avg_mae_r"),
        avgMFE: firstNumber(src, "avg_mfe", "avg_mfe_r"),
        avgTimeToTP: src.avg_time_to_tp || src.avgTimeToTP || null,
        avgTimeToSL: src.avg_time_to_sl || src.avgTimeToSL || null,
        deltaVsBaseline: isFiniteNumber(netR) ? Number((netR - baseline.netR).toFixed(2)) : null,
    };
}

function buildEntryAnalytics(trades, exactRows) {
    const list = Array.isArray(trades) ? trades : [];
    const wins = list.filter((t) => rOf(t) > 0).length;
    const losses = list.filter((t) => rOf(t) < 0).length;
    const baseline = exactRows.find((r) => r.isBaseline) || {};
    const placeholderRows = (labels) => labels.map((label) => ({ label, count: null, fillPct: null, winRate: null, netR: null, expectancy: null, exact: false }));
    return {
        wins,
        losses,
        fillRateRows: [
            { label: "Baseline · Edge Touch", count: baseline.trades, fillPct: baseline.fillPct, winRate: baseline.winRate, netR: baseline.netR, expectancy: baseline.expectancy, exact: true },
            ...placeholderRows(["Penetration Entries", "Confirmation Entries", "Pending Lifecycle Filters"]),
        ],
        penetrationRows: placeholderRows(["10% Penetration", "25% Penetration", "50% Penetration", "75% Penetration"]),
        missedWinnerRows: placeholderRows(["Missed Winners · Penetration", "Missed Winners · Confirmation", "Missed Winners · Time Decay"]),
        avoidedLoserRows: placeholderRows(["Avoided Losers · No Fill", "Avoided Losers · Pre-Fill Cancel", "Avoided Losers · Confirmation Reject"]),
        timeToFillRows: placeholderRows(["Same Candle", "<15m", "15–60m", "1–4h", "4h+"]),
        sessionRows: sessionRows(list),
        hourGrid: buildHourGrid(list),
        toxicityGrid: buildHourGrid(list),
        matrixRows: [
            { label: "Baseline", fills: baseline.fills, wins, losses, winRate: baseline.winRate, netR: baseline.netR, status: "Exact", exact: true },
            { label: "Penetration", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Awaiting exporter", exact: false },
            { label: "Confirmation", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Awaiting exporter", exact: false },
            { label: "Lifecycle Cancel", fills: null, wins: null, losses: null, winRate: null, netR: null, status: "Architecture only", exact: false },
        ],
    };
}

function sessionRows(trades) {
    const sessions = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];
    return sessions.map((label) => bucket(label, trades.filter((t) => sessionOf(t.entry) === label)));
}

function bucket(label, rows) {
    const wins = rows.filter((t) => rOf(t) > 0).length;
    const netR = rows.reduce((sum, t) => sum + rOf(t), 0);
    return {
        label,
        count: rows.length,
        fillPct: rows.length ? 100 : 0,
        winRate: rows.length ? (wins / rows.length) * 100 : 0,
        netR: round1(netR),
        expectancy: rows.length ? netR / rows.length : 0,
        exact: true,
    };
}

function buildHourGrid(trades) {
    const cells = {};
    let total = 0;
    trades.forEach((trade) => {
        const d = parseDate(trade.entry);
        if (!d) return;
        const key = `${dayIndex(d.getUTCDay())}-${d.getUTCHours()}`;
        if (!cells[key]) cells[key] = { count: 0, netR: 0 };
        cells[key].count += 1;
        cells[key].netR += rOf(trade);
        total += 1;
    });
    Object.values(cells).forEach((cell) => { cell.netR = round1(cell.netR); });
    const maxAbs = Object.values(cells).reduce((max, cell) => Math.max(max, Math.abs(cell.netR)), 0) || 1;
    return { cells, total, maxAbs };
}

function flattenEntrySummary(summary) {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap(flattenEntrySummary);
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (value && typeof value === "object") rows.push({ ...value, mode: normalizeMode(value.mode || value.entry_mode || key) });
    });
    return rows;
}

function markHighlights(rows) {
    const exact = rows.filter((r) => r.exact);
    const bestNet = exact.reduce((best, row) => isFiniteNumber(row.netR) && (!best || row.netR > best.netR) ? row : best, null);
    const bestExp = exact.reduce((best, row) => isFiniteNumber(row.expectancy) && (!best || row.expectancy > best.expectancy) ? row : best, null);
    const lowestDD = exact.reduce((best, row) => isFiniteNumber(row.maxDD) && (!best || row.maxDD > best.maxDD) ? row : best, null);
    if (bestNet) bestNet.isBestNetR = true;
    if (bestExp) bestExp.isBestExpectancy = true;
    if (lowestDD) lowestDD.isLowestDD = true;
}

function maxDrawdown(trades) {
    let equity = 0;
    let peak = 0;
    let dd = 0;
    trades.forEach((trade) => {
        equity += rOf(trade);
        peak = Math.max(peak, equity);
        dd = Math.min(dd, equity - peak);
    });
    return round1(dd);
}

function rOf(trade) {
    return Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
}

function sessionOf(value) {
    const d = parseDate(value);
    if (!d) return "Unknown";
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h < 7) return "Asia";
    if (h < 10) return "London";
    if (h < 12) return "London Lull";
    if (h < 17) return "New York";
    return "Outside";
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

function firstNumber(obj, ...keys) {
    for (const key of keys) {
        const value = obj?.[key];
        if (isFiniteNumber(value)) return Number(value);
    }
    return null;
}

function normalizePct(value) {
    if (!isFiniteNumber(value)) return null;
    const n = Number(value);
    return n <= 1 ? n * 100 : n;
}

function normalizeMode(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function prettyMode(value) {
    return String(value || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

function isFiniteNumber(value) {
    return value != null && Number.isFinite(Number(value));
}

const num = (value) => isFiniteNumber(value) ? Number(value) : 0;
const round1 = (value) => Number(num(value).toFixed(1));
const fmtR = (value) => `${num(value) >= 0 ? "+" : ""}${round1(value).toFixed(1)}R`;
const fmtPct = (value) => isFiniteNumber(value) ? `${round1(value).toFixed(1)}%` : "—";
const fmtMaybePct = fmtPct;
const fmtMaybeR = (value) => isFiniteNumber(value) ? fmtR(value) : "—";
const fmtMaybeExp = (value) => isFiniteNumber(value) ? `${num(value) >= 0 ? "+" : ""}${num(value).toFixed(3)}R` : "—";
const fmtCount = (value) => isFiniteNumber(value) ? String(Number(value)) : "—";
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pad2 = (value) => String(value).padStart(2, "0");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const dayIndex = (utcDay) => (utcDay + 6) % 7;
