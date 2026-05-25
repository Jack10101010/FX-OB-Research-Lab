import React from "react";
import { ActiveRunContext } from "@/components/lab/ActiveRunContext";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset } from "@/data/store";
import {
    AlertTriangle, MousePointerClick, ShieldCheck, Target, TrendingUp,
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
    { mode: "entry_penetration_10p0", label: "Penetration 10%", family: "Penetration", threshold: "10%" },
    { mode: "entry_penetration_25p0", label: "Penetration 25%", family: "Penetration", threshold: "25%" },
    { mode: "entry_penetration_50p0", label: "Penetration 50%", family: "Penetration", threshold: "50%" },
    { mode: "entry_penetration_75p0", label: "Penetration 75%", family: "Penetration", threshold: "75%" },
    { mode: "close_inside_edge", label: "1m Close Inside → Edge Order", family: "Confirmation", threshold: "Close inside" },
    { mode: "wick_reclaim", label: "Wick Reclaim Confirmation", family: "Confirmation", threshold: "Reclaim" },
    { mode: "sweep_reclaim", label: "Sweep + Reclaim", family: "Confirmation", threshold: "Sweep" },
    { mode: "delayed_confirmation", label: "Delayed Confirmation Entry", family: "Confirmation", threshold: "Delay" },
];
const FUTURE_ENTRY_MODELS = PLANNED_ENTRY_MODES.filter((mode) => mode.family === "Confirmation");

export default function EntriesLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const exactRows = React.useMemo(() => buildEntryResultRows(activeRun, trades, ACTIVE_TRADE_VARIANT), [activeRun, trades, ACTIVE_TRADE_VARIANT]);
    const hasImportedEntryResults = exactRows.some((row) => row.exact && !row.isBaseline);
    const baseline = exactRows.find((row) => row.isBaseline) || exactRows[0];
    const summary = React.useMemo(() => buildExactSummary(exactRows), [exactRows]);
    const analytics = React.useMemo(() => buildEntryAnalytics(trades, exactRows), [trades, exactRows]);
    const exportEntryResults = () => {
        const rows = exactRows.map((row) => ({
            mode: row.mode,
            threshold: row.threshold,
            setups: row.eligible ?? row.trades,
            filled: row.fills,
            fill_rate: row.fillPct,
            wins: row.wins,
            losses: row.losses,
            win_rate: row.winRate,
            net_r: row.netR,
            expectancy: row.expectancy,
            max_dd: row.maxDD,
            delta_vs_baseline: row.deltaVsBaseline,
        }));
        downloadCsv(`entries_lab_${fileSafe(ACTIVE_RUN?.id || activeRunId || "run")}_${csvTimestamp()}.csv`, rows);
    };

    return (
        <div className="pb-12">
            <ActiveRunContext
                pageLabel="Entries Lab"
                description={`${variantLabel(ACTIVE_TRADE_VARIANT)} — exact entry execution research.`}
                actions={(
                    <div className="flex items-center gap-2">
                        <Pill tone="secondary">{trades.length} TRADES</Pill>
                    </div>
                )}
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricChip label="Baseline Trades" value={String(trades.length)} sub="active variant" tone="primary" icon={MousePointerClick} />
                <MetricChip label="Baseline WR" value={fmtPct(baseline?.winRate)} sub={`${analytics.wins}W / ${analytics.losses}L`} tone="secondary" icon={Target} />
                <MetricChip label="Best Model" value={summary.bestModel?.label || "—"} sub="by net R" tone={summary.bestModel ? "success" : "muted"} icon={ShieldCheck} />
                <MetricChip label="Best Delta" value={fmtMaybeR(summary.bestDelta?.deltaVsBaseline)} sub={summary.bestDelta?.label || "vs baseline"} tone={num(summary.bestDelta?.deltaVsBaseline) >= 0 ? "success" : "danger"} icon={TrendingUp} />
                <MetricChip label="Best Fill Rate" value={fmtMaybePct(summary.bestFill?.fillPct)} sub={summary.bestFill?.label || "fill efficiency"} tone="secondary" icon={Target} />
                <MetricChip label="Lowest DD" value={fmtMaybeR(summary.lowestDD?.maxDD)} sub={summary.lowestDD?.label || "drawdown"} tone="muted" icon={AlertTriangle} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel
                    className="xl:col-span-3"
                    title="Exact Entry Simulation Results"
                    action={(
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={exportEntryResults}
                                disabled={!exactRows.length}
                                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-40 clip-bevel-sm"
                            >
                                Export Entry Results CSV
                            </button>
                            <Pill tone={hasImportedEntryResults ? "success" : "warning"}>{hasImportedEntryResults ? "EXACT DATA" : "BASELINE ONLY"}</Pill>
                        </div>
                    )}
                >
                    <Note tone={hasImportedEntryResults ? "muted" : "warning"}>
                        {hasImportedEntryResults
                            ? "Exact entry results are imported from Python simulation outputs. Baseline remains the active trade variant."
                            : "No exact entry simulation results imported yet. Baseline is derived from active trades; future models are listed separately."}
                    </Note>
                    <div className="overflow-x-auto scrollbar-thin">
                        <div className="min-w-[1320px]">
                            <ExactResultsTable
                                testId="entries-exact-results"
                                rows={exactRows}
                            />
                        </div>
                    </div>
                </NeonPanel>

                <BucketPanel title="Fill Rate Analysis" rows={analytics.fillRateRows} />
                <BucketPanel title="Penetration Entry Comparison" rows={analytics.penetrationRows} />
                <FutureEntryModels />
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

function ExactResultsTable({ rows, testId }) {
    const headers = ["Mode", "Tags", "Threshold", "Setups", "Filled", "Fill %", "Wins", "Losses", "WR", "Net R", "Exp", "Max DD", "Δ Base"];
    return (
        <div data-testid={testId} className="relative overflow-auto scrollbar-thin max-h-[360px]">
            <table className="w-full text-[12px] font-mono border-collapse">
                <thead className="sticky top-0 z-10 bg-[hsl(var(--panel-2))] backdrop-blur">
                    <tr>
                        {headers.map((header, idx) => (
                            <th
                                key={header}
                                className={[
                                    "text-[10px] font-mono uppercase tracking-[0.18em] text-title-lab font-medium px-3 py-2",
                                    idx > 1 ? "text-right" : "text-left",
                                ].join(" ")}
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                    <tr><td colSpan={headers.length} className="p-0 h-px bg-[hsl(var(--border-soft))]" /></tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.mode}
                            className={[
                                "border-b transition-colors",
                                row.isBestNetR && !row.isBaseline
                                    ? "border-[hsl(var(--success)/0.55)] bg-[hsl(var(--success)/0.10)] shadow-[inset_4px_0_0_hsl(var(--success)),0_0_24px_hsl(var(--success)/0.10)]"
                                    : row.isBaseline
                                        ? "border-b border-dashed border-[hsl(var(--accent-secondary)/0.35)] bg-transparent"
                                        : "border-[hsl(var(--border-soft)/0.35)] hover:bg-[hsl(var(--panel-2)/0.5)]",
                            ].join(" ")}
                        >
                            <td className="px-3 py-2 text-left text-[hsl(var(--text-2))]"><EntryModeLabel row={row} /></td>
                            <td className="px-3 py-2 text-left text-[hsl(var(--text-2))]"><EntryModeTags row={row} /></td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{row.threshold || <MutedDash />}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtCount(row.eligible ?? row.trades)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtCount(row.fills)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.fillPct)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtCount(row.wins)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtCount(row.losses)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtMaybePct(row.winRate)}</td>
                            <td className="px-3 py-2 text-right">{row.netR == null ? <MutedDash /> : <ColoredR value={row.netR} />}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtMaybeExp(row.expectancy)}</td>
                            <td className="px-3 py-2 text-right text-[hsl(var(--text-2))]">{fmtMaybeR(row.maxDD)}</td>
                            <td className="px-3 py-2 text-right"><DeltaCell row={row} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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

function FutureEntryModels() {
    return (
        <NeonPanel title="Future Entry Models" action={<Pill tone="warning">{FUTURE_ENTRY_MODELS.length} UNTESTED</Pill>}>
            <div className="grid grid-cols-1 gap-2">
                {FUTURE_ENTRY_MODELS.map((model) => (
                    <div key={model.mode} className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-[11.5px] font-display text-white">{model.label}</div>
                            <Pill tone="warning">FUTURE</Pill>
                        </div>
                        <div className="mt-1 text-[10.5px] font-mono uppercase tracking-wider text-muted-lab">
                            Requires exporter simulation · {model.threshold}
                        </div>
                    </div>
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
        <div className="min-w-0">
            <span className={[
                "block truncate",
                row.isBaseline
                    ? "text-[hsl(var(--accent-secondary))] font-semibold"
                    : row.isBestNetR || row.isBestExpectancy
                        ? "text-[hsl(var(--success))] font-semibold"
                        : "text-white",
            ].join(" ")}>
                {row.label || prettyMode(row.mode)}
            </span>
        </div>
    );
}

function EntryModeTags({ row }) {
    const tags = [];
    if (row.isBaseline) tags.push(<Pill key="baseline" tone="secondary">BASELINE</Pill>);
    if (row.isBestNetR) tags.push(<Pill key="net" tone="success">BEST NET R</Pill>);
    if (row.isBestExpectancy) tags.push(<Pill key="exp" tone="primary">BEST EXP</Pill>);
    if (row.isLowestDD) tags.push(<Pill key="dd" tone="muted">LOWEST DD</Pill>);
    if (row.isBestFillPct) tags.push(<Pill key="fill" tone="secondary">BEST FILL</Pill>);
    if (!row.exact && !row.isBaseline) tags.push(<Pill key="pending" tone="warning">PENDING</Pill>);
    return tags.length ? <div className="flex flex-wrap gap-1">{tags}</div> : <MutedDash />;
}

function MutedDash() {
    return <span className="text-muted-lab">—</span>;
}

function BucketLabel({ row }) {
    return (
        <div className="flex items-center gap-2">
            <span className={row.isBestPanel ? "text-[hsl(var(--success))] font-semibold" : row.exact ? "text-[hsl(var(--text-2))]" : "text-muted-lab"}>{row.label}</span>
            {row.isBestPanel && <Pill tone="success">BEST</Pill>}
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

function buildEntryResultRows(run, trades, selectedVariant) {
    const activeVariant = selectedVariant || run?.primaryVariant || run?.summary?.executionMode || "single_position";
    const entryResults = run?.entryResults || {};
    const exact = flattenEntrySummary(entryResults.summary || run?.summary?.entry_results || {}, activeVariant);
    const exactByMode = new Map(exact.map((row) => [normalizeMode(row.mode), row]));
    const tradesByMode = entryResults.tradesByMode || {};
    const baseline = baselineEntryRow(trades);
    const rows = PLANNED_ENTRY_MODES.flatMap((planned) => {
        const src = exactByMode.get(normalizeMode(planned.mode));
        const modeKey = normalizeMode(planned.mode);
        const modeTrades = tradesByMode[`${activeVariant}__${modeKey}`] || tradesByMode[modeKey];
        if (planned.mode === "baseline") return [{ ...planned, ...baseline }];
        if (src || modeTrades?.length) return [entryRowFromSummary(planned, src || {}, baseline, modeTrades)];
        return [];
    });
    markHighlights(rows);
    return rows;
}

function buildExactSummary(rows) {
    const tested = rows.filter((row) => row.exact && !row.isBaseline);
    const candidates = tested.length ? tested : rows.filter((row) => row.exact);
    return {
        bestModel: bestBy(candidates, "netR"),
        bestDelta: bestBy(candidates, "deltaVsBaseline"),
        bestFill: bestBy(candidates, "fillPct"),
        lowestDD: bestBy(candidates, "maxDD"),
    };
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
        eligible: list.length,
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

function entryRowFromSummary(planned, src, baseline, trades) {
    const tradeStats = trades?.length ? entryStatsFromTrades(trades) : {};
    const netR = firstNumber(src, "net_r", "netR", "net", "net_r_total") ?? tradeStats.netR;
    const eligible = firstNumber(src, "eligible_setups", "eligible", "setups", "trades", "trade_count", "total_trades") ?? tradeStats.eligible;
    const fills = firstNumber(src, "fills", "filled", "filled_trades", "fill_count") ?? tradeStats.fills;
    const threshold = firstNumber(src, "threshold", "threshold_pct", "entry_threshold_pct", "entry_threshold") ?? planned.threshold;
    const wins = firstNumber(src, "wins", "winning_trades") ?? tradeStats.wins;
    const losses = firstNumber(src, "losses", "losing_trades") ?? tradeStats.losses;
    const fillPct = normalizePct(firstNumber(src, "fill_pct", "fill_rate", "fill_percent"))
        ?? (isFiniteNumber(eligible) && Number(eligible) > 0 && isFiniteNumber(fills) ? (Number(fills) / Number(eligible)) * 100 : tradeStats.fillPct);
    const winRate = normalizePct(firstNumber(src, "win_rate", "wr"))
        ?? (Number(wins || 0) + Number(losses || 0) ? (Number(wins || 0) / (Number(wins || 0) + Number(losses || 0))) * 100 : tradeStats.winRate);
    const expectancy = firstNumber(src, "expectancy", "avg_r", "expectancy_r")
        ?? (isFiniteNumber(netR) && isFiniteNumber(fills) && Number(fills) > 0 ? Number(netR) / Number(fills) : tradeStats.expectancy);
    return {
        ...planned,
        exact: true,
        isBaseline: planned.mode === "baseline",
        threshold: isFiniteNumber(threshold) ? `${Number(threshold).toFixed(Number(threshold) % 1 ? 1 : 0)}%` : threshold,
        eligible,
        trades: eligible,
        fills,
        fillPct,
        wins,
        losses,
        winRate,
        netR,
        expectancy,
        maxDD: firstNumber(src, "max_dd", "max_drawdown", "max_drawdown_r") ?? tradeStats.maxDD,
        avgMAE: firstNumber(src, "avg_mae", "avg_mae_r"),
        avgMFE: firstNumber(src, "avg_mfe", "avg_mfe_r"),
        avgTimeToTP: src.avg_time_to_tp || src.avgTimeToTP || null,
        avgTimeToSL: src.avg_time_to_sl || src.avgTimeToSL || null,
        deltaVsBaseline: isFiniteNumber(netR) ? Number((netR - baseline.netR).toFixed(2)) : null,
    };
}

function entryStatsFromTrades(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const filled = list.filter((t) => t.entry_model_filled === true || (t.missed_trade !== true && !!t.entry));
    const wins = filled.filter((t) => rOf(t) > 0).length;
    const losses = filled.filter((t) => rOf(t) < 0).length;
    const netR = filled.reduce((sum, t) => sum + rOf(t), 0);
    return {
        eligible: list.length,
        fills: filled.length,
        fillPct: list.length ? (filled.length / list.length) * 100 : 0,
        wins,
        losses,
        winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
        netR: round1(netR),
        expectancy: filled.length ? netR / filled.length : 0,
        maxDD: maxDrawdown(list),
    };
}

function buildEntryAnalytics(trades, exactRows) {
    const list = Array.isArray(trades) ? trades : [];
    const wins = list.filter((t) => rOf(t) > 0).length;
    const losses = list.filter((t) => rOf(t) < 0).length;
    const baseline = exactRows.find((r) => r.isBaseline) || {};
    const exactEntryRows = exactRows.filter((r) => r.exact);
    const penetrationExactRows = exactRows.filter((r) => r.exact && String(r.mode).startsWith("entry_penetration"));
    const placeholderRows = (labels) => labels.map((label) => ({ label, count: null, fillPct: null, winRate: null, netR: null, expectancy: null, exact: false }));
    const tableBucketRow = (row) => ({
        label: row.label,
        count: row.eligible ?? row.trades,
        fillPct: row.fillPct,
        winRate: row.winRate,
        netR: row.netR,
        expectancy: row.expectancy,
        exact: row.exact,
    });
    const fillRateRows = markPanelBest([
        ...exactEntryRows.map(tableBucketRow),
        ...placeholderRows(["Confirmation Entries", "Pending Lifecycle Filters"]),
    ]);
    const penetrationRows = markPanelBest(
        penetrationExactRows.length ? penetrationExactRows.map(tableBucketRow) : placeholderRows(["10% Penetration", "25% Penetration", "50% Penetration", "75% Penetration"]),
    );
    return {
        wins,
        losses,
        fillRateRows,
        penetrationRows,
        missedWinnerRows: placeholderRows(["Missed Winners · Penetration", "Missed Winners · Confirmation", "Missed Winners · Time Decay"]),
        avoidedLoserRows: placeholderRows(["Avoided Losers · No Fill", "Avoided Losers · Pre-Fill Cancel", "Avoided Losers · Confirmation Reject"]),
        timeToFillRows: placeholderRows(["Same Candle", "<15m", "15–60m", "1–4h", "4h+"]),
        sessionRows: sessionRows(list),
        hourGrid: buildHourGrid(list),
        toxicityGrid: buildHourGrid(list),
        matrixRows: [
            { label: "Baseline", fills: baseline.fills, wins, losses, winRate: baseline.winRate, netR: baseline.netR, status: "Exact", exact: true },
            ...penetrationExactRows.map((row) => ({ label: row.label, fills: row.fills, wins: row.wins, losses: row.losses, winRate: row.winRate, netR: row.netR, status: "Exact", exact: true })),
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

function flattenEntrySummary(summary, activeVariant = "single_position") {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap((item) => flattenEntrySummary(item, activeVariant));
    if (summary.mode || summary.entry_mode || summary.entry_model) {
        return [{ ...summary, mode: normalizeMode(summary.mode || summary.entry_mode || summary.entry_model) }];
    }
    const rows = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (!value || typeof value !== "object") return;
        if (key === "single_position" || key === "allow_multi_position" || key === "one_per_direction") {
            if (key === activeVariant) rows.push(...flattenEntrySummary(value, activeVariant));
        } else {
            rows.push({ ...value, mode: normalizeMode(value.mode || value.entry_mode || value.entry_model || key) });
        }
    });
    return rows;
}

function markHighlights(rows) {
    const tested = rows.filter((r) => r.exact && !r.isBaseline);
    const exact = tested.length ? tested : rows.filter((r) => r.exact);
    const bestNet = bestBy(exact, "netR");
    const bestExp = bestBy(exact, "expectancy");
    const lowestDD = bestBy(exact, "maxDD");
    const bestFill = bestBy(exact, "fillPct");
    if (bestNet) bestNet.isBestNetR = true;
    if (bestExp) bestExp.isBestExpectancy = true;
    if (lowestDD) lowestDD.isLowestDD = true;
    if (bestFill) bestFill.isBestFillPct = true;
}

function markPanelBest(rows) {
    const exact = rows.filter((row) => row.exact && isFiniteNumber(row.netR));
    const best = bestBy(exact, "netR");
    return rows.map((row) => ({ ...row, isBestPanel: best && row.label === best.label }));
}

function bestBy(rows, key) {
    return rows.reduce((best, row) => (
        isFiniteNumber(row?.[key]) && (!best || Number(row[key]) > Number(best[key])) ? row : best
    ), null);
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

function downloadCsv(filename, rows) {
    const csv = rowsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function rowsToCsv(rows) {
    if (!rows.length) return "";
    const columns = Object.keys(rows[0]);
    return [
        columns.join(","),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\n");
}

function csvCell(value) {
    if (value == null) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function fileSafe(value) {
    return String(value || "run").replace(/[^a-z0-9_-]+/gi, "_");
}
