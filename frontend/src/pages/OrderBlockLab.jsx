import React from "react";
import { ActiveRunContext } from "@/components/lab/ActiveRunContext";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonSelect } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import { Activity, AlertTriangle, Boxes, Clipboard, FileText, GitBranch, ShieldCheck, TrendingUp, X } from "lucide-react";

const LOW_SAMPLE_N = 10;
const EMPTY_TRADES = [];
const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];
const RESEARCH_BACKLOG_ITEMS = [
    {
        title: "High-Quality Setup Clustering",
        status: "Requires derived feature set",
        body: "Cluster winners/losers by OB width, age, displacement away before fill, structure type, session origin, penetration depth, fill session, and future trend/regime tags.",
    },
    {
        title: "Dynamic Stop Logic Attribution",
        status: "Future execution model",
        body: "Compare per-trade stop behavior once stops become dynamic instead of run-level config attribution.",
    },
    {
        title: "Trend / Regime Analysis",
        status: "Future regime tagging",
        body: "Split OB performance by trending/ranging and volatility regimes.",
    },
];

export default function OrderBlockLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS, activeRunId } = useDataset();
    const [reportOpen, setReportOpen] = React.useState(false);
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const analytics = React.useMemo(() => buildOrderBlockAnalytics(trades), [trades]);
    const reportText = React.useMemo(
        () => buildResearchReport({ run: ACTIVE_RUN, variant: ACTIVE_TRADE_VARIANT, analytics }),
        [ACTIVE_RUN, ACTIVE_TRADE_VARIANT, analytics],
    );

    return (
        <div className="pb-12">
            <ActiveRunContext
                pageLabel="Order Block Lab"
                description={`${variantLabel(ACTIVE_TRADE_VARIANT)} — deep order block research using linked trades.`}
                actions={(
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setReportOpen(true)}
                            className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.12)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.2)] transition-colors inline-flex items-center gap-2"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Generate Report
                        </button>
                        <VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />
                    </div>
                )}
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Linked Trades" value={String(analytics.linkedCount)} sub="with OB data" tone="primary" icon={Boxes} />
                <MetricChip label="Unlinked Trades" value={String(analytics.unlinkedCount)} sub="limited OB research" tone={analytics.unlinkedCount ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Variant" value={variantShort(ACTIVE_TRADE_VARIANT)} sub="selected trades" tone="secondary" icon={GitBranch} />
                <MetricChip label="Low Sample Rule" value={`n < ${LOW_SAMPLE_N}`} sub="badge every bucket" tone="muted" icon={ShieldCheck} />
                <MetricChip label="Best Bucket" value={analytics.bestBucket ? formatR(analytics.bestBucket.netR) : "—"} sub={analytics.bestBucket?.label || "Limited Data"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Active Run" value={activeRunId ? "Imported" : "No Run"} sub={trades.length ? `${trades.length} trades` : "No trades"} tone="secondary" icon={Activity} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                {analytics.lowSampleBuckets > 0 && (
                    <NeonPanel className="xl:col-span-3" title="Research Safety" tone="secondary" action={<Pill tone="warning">{analytics.lowSampleBuckets} LOW SAMPLE BUCKETS</Pill>}>
                        <div className="flex items-start gap-2 text-[11.5px] font-mono text-[hsl(var(--warning))]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Every bucket shows sample count. Treat buckets below {LOW_SAMPLE_N} trades as directional only.</span>
                        </div>
                    </NeonPanel>
                )}

                <BucketPanel title="Structural Quality · BOS vs CHoCH" rows={analytics.structureRows} />
                <BucketPanel title="Structural Quality · Long vs Short" rows={analytics.directionRows} />
                <BucketPanel title="Origin Session Performance" rows={analytics.originSessionRows} />
                <BucketPanel className="xl:col-span-3" title="OB Creation Hour Performance" rows={analytics.creationHourRows} />
                <BucketPanel className="xl:col-span-3" title="OB Width Analysis" rows={analytics.widthRows} />
                <BucketPanel className="xl:col-span-3" title="OB Age / Time-to-Fill" rows={analytics.ageRows} compact />
                <BucketPanel className="xl:col-span-3" title="Penetration Depth Analysis" rows={analytics.penetrationRows} compact />
                <CatastrophicBreachPanel analysis={analytics.catastrophicBreach} />
                <BucketPanel title="Fast Stopout Analysis" rows={analytics.fastStopoutRows} compact />
                <BucketPanel title="Distance Before Fill" rows={analytics.distanceBeforeFillRows} compact />
                <SessionMatrix matrix={analytics.sessionMatrix} />
                <FailureLab trades={analytics.worstLosses} />
                <ResearchBacklog />
            </div>
            {reportOpen && (
                <ReportModal
                    reportText={reportText}
                    onClose={() => setReportOpen(false)}
                />
            )}
        </div>
    );
}

function BucketPanel({ title, rows, className = "", compact = false }) {
    return (
        <NeonPanel className={className} title={title} action={<Pill tone="muted">{rows.length} BUCKETS</Pill>}>
            <DataTable
                testId={`oblab-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                maxHeight={compact ? 260 : 320}
                columns={[
                    { key: "label", label: "Bucket", render: (r) => <BucketLabel row={r} /> },
                    { key: "count", label: "N", align: "right" },
                    { key: "wins", label: "Wins", align: "right" },
                    { key: "losses", label: "Losses", align: "right" },
                    { key: "winRate", label: "WR", align: "right", render: (r) => formatPct(r.winRate) },
                    { key: "netR", label: "Net R", align: "right", render: (r) => <ColoredR value={round1(r.netR)} /> },
                    { key: "expectancy", label: "Exp", align: "right", render: (r) => `${formatSigned(round3(r.expectancy))}R` },
                ]}
                rows={rows}
            />
        </NeonPanel>
    );
}

function BucketLabel({ row }) {
    return (
        <div className="flex items-center gap-2">
            <span>{row.label || "Limited Data"}</span>
            {row.count < LOW_SAMPLE_N && <Pill tone="warning">LOW N</Pill>}
        </div>
    );
}

function SessionMatrix({ matrix }) {
    return (
        <NeonPanel className="xl:col-span-3" title="Timing · Origin Session × Fill Session" action={<Pill tone="muted">{matrix.total} TRADES</Pill>}>
            <div className="overflow-x-auto scrollbar-thin" data-testid="oblab-session-matrix">
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
                        {matrix.rows.map((row) => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {SESSION_COLUMNS.map((col) => {
                                    const cell = matrix.cells[`${row}|||${col}`];
                                    if (!cell) {
                                        return (
                                            <td key={col}>
                                                <div className="clip-bevel-sm px-2 py-2 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const alpha = (0.16 + 0.48 * (Math.abs(cell.netR) / matrix.maxAbs)).toFixed(3);
                                    const bg = cell.netR >= 0 ? `hsl(var(--accent-primary) / ${alpha})` : `hsl(var(--bear) / ${alpha})`;
                                    return (
                                        <td key={col}>
                                            <div className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums" style={{ background: bg }}>
                                                <div>{formatR(cell.netR)}</div>
                                                <div className="text-[9px] text-white/70">{cell.count} trade{cell.count === 1 ? "" : "s"}</div>
                                                {cell.count < LOW_SAMPLE_N && <div className="text-[8px] text-[hsl(var(--warning))]">LOW N</div>}
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

function FailureLab({ trades }) {
    return (
        <NeonPanel className="xl:col-span-3" title="Failure Lab · Worst Losing Trades" action={<Pill tone="danger">{trades.length} LOSSES</Pill>}>
            <DataTable
                testId="oblab-failure-lab"
                maxHeight={300}
                columns={[
                    { key: "id", label: "Trade ID" },
                    { key: "direction", label: "Dir", render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction}</Pill> },
                    { key: "structure", label: "Struct" },
                    { key: "obWidthPips", label: "OB Width", align: "right", render: (r) => r.obWidthPips != null ? `${round1(r.obWidthPips)}p` : "—" },
                    { key: "ageLabel", label: "OB Age" },
                    { key: "originSession", label: "Origin Session" },
                    { key: "fillSession", label: "Fill Session" },
                    { key: "r", label: "R", align: "right", render: (r) => <ColoredR value={r.r} /> },
                ]}
                rows={trades}
            />
        </NeonPanel>
    );
}

function CatastrophicBreachPanel({ analysis }) {
    return (
        <NeonPanel
            title="Loss Analytics · Catastrophic Failures"
            action={<Pill tone={analysis.breachCount ? "danger" : "muted"}>{formatPct(analysis.breachPct)} FAILURE</Pill>}
        >
            <div className="grid grid-cols-2 gap-2 mb-3">
                <MetricChip label="Hard Invalidated" value={String(analysis.breachCount)} sub={`${formatPct(analysis.breachPct)} of known`} tone={analysis.breachCount ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Avg Loss" value={analysis.avgLoss == null ? "—" : formatR(analysis.avgLoss)} sub="hard invalidation losses" tone="secondary" icon={TrendingUp} />
            </div>
            <DataTable
                testId="oblab-catastrophic-breach"
                maxHeight={220}
                columns={[
                    { key: "label", label: "Bucket", render: (r) => <BucketLabel row={r} /> },
                    { key: "count", label: "N", align: "right" },
                    { key: "winRate", label: "WR", align: "right", render: (r) => formatPct(r.winRate) },
                    { key: "netR", label: "Net R", align: "right", render: (r) => <ColoredR value={round1(r.netR)} /> },
                    { key: "expectancy", label: "Exp", align: "right", render: (r) => `${formatSigned(round3(r.expectancy))}R` },
                ]}
                rows={analysis.rows}
            />
        </NeonPanel>
    );
}

function ResearchBacklog() {
    return (
        <NeonPanel className="xl:col-span-3" title="Research Backlog · Requires Exporter Fields" action={<Pill tone="muted">{RESEARCH_BACKLOG_ITEMS.length} IDEAS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5" data-testid="oblab-research-backlog">
                {RESEARCH_BACKLOG_ITEMS.map((item) => (
                    <div key={item.title} className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2.5">
                        <div className="flex items-start gap-2 justify-between">
                            <div className="text-[11.5px] font-display text-white leading-tight">{item.title}</div>
                            <Pill tone="warning">{item.status}</Pill>
                        </div>
                        <p className="mt-2 text-[11px] text-[hsl(var(--text-2))] leading-relaxed">{item.body}</p>
                        {item.future && <div className="mt-1.5 text-[10.5px] font-mono text-muted-lab">{item.future}</div>}
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

function ReportModal({ reportText, onClose }) {
    const [copied, setCopied] = React.useState(false);
    const copyReport = async () => {
        try {
            await navigator.clipboard.writeText(reportText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
            <div className="w-full max-w-4xl max-h-[86vh] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.98)] clip-bevel overflow-hidden shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-[hsl(var(--border-soft))] px-4 py-3">
                    <div>
                        <div className="font-display text-sm text-white uppercase tracking-wider">Order Block Lab Report</div>
                        <div className="text-[11px] font-mono text-muted-lab">Deterministic summary from current analytics</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={copyReport}
                            className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.12)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.2)] transition-colors inline-flex items-center gap-2"
                        >
                            <Clipboard className="w-3.5 h-3.5" />
                            {copied ? "Copied" : "Copy Report"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-2"
                            aria-label="Close report"
                        >
                            <X className="w-4 h-4" />
                            Close
                        </button>
                    </div>
                </div>
                <div className="p-4 overflow-auto max-h-[calc(86vh-72px)] scrollbar-thin">
                    <pre className="whitespace-pre-wrap text-[11.5px] leading-relaxed font-mono text-[hsl(var(--text-2))]">{reportText}</pre>
                </div>
            </div>
        </div>
    );
}

function buildResearchReport({ run, variant, analytics }) {
    const structuralGroups = [
        ["Structure Type", analytics.structureRows],
        ["Direction", analytics.directionRows],
        ["Origin Session", analytics.originSessionRows],
        ["Creation Hour", analytics.creationHourRows],
        ["Width Bucket", analytics.widthRows],
        ["Age Bucket", analytics.ageRows],
    ];
    const executionGroups = [
        ["Penetration Bucket", analytics.penetrationRows],
        ["Fast Stopout Bucket", analytics.fastStopoutRows],
        ["Distance Before Fill Bucket", analytics.distanceBeforeFillRows],
    ];
    const limitedSections = [
        ...structuralGroups,
        ...executionGroups,
    ].filter(([, rows]) => hasLimitedData(rows)).map(([label]) => label);
    const nonZeroBucketCount = [
        ...structuralGroups.flatMap(([, rows]) => rows),
        ...executionGroups.flatMap(([, rows]) => rows),
        ...(analytics.catastrophicBreach?.rows || []),
    ].filter((row) => row.count > 0).length;
    const weakConfidence = nonZeroBucketCount > 0 && analytics.lowSampleBuckets / nonZeroBucketCount >= 0.5;

    const lines = [
        "ORDER BLOCK LAB REPORT",
        "",
        "OVERVIEW",
        `Run: ${run?.id || "No active run"}`,
        `Selected variant: ${variantLabel(variant)}`,
        `Linked trades: ${analytics.linkedCount}`,
        `Unlinked trades: ${analytics.unlinkedCount}`,
        "",
        "STRUCTURAL QUALITY HIGHLIGHTS",
        "Best-performing:",
        ...structuralGroups.map(([label, rows]) => `- ${label}: ${formatBucketSummary(bestRow(rows))}`),
        "",
        "Worst-performing:",
        ...structuralGroups.map(([label, rows]) => `- ${label}: ${formatBucketSummary(worstRow(rows))}`),
        "",
        "EXECUTION FINDINGS",
        `Best penetration bucket: ${formatBucketSummary(bestRow(analytics.penetrationRows))}`,
        `Worst penetration bucket: ${formatBucketSummary(worstRow(analytics.penetrationRows))}`,
        `Catastrophic failure rate: ${formatPct(analytics.catastrophicBreach?.breachPct || 0)} (${analytics.catastrophicBreach?.breachCount || 0} hard invalidated)`,
        `Fastest losing bucket: ${formatBucketSummary(fastestLosingRow(analytics.fastStopoutRows))}`,
        `Best distance-before-fill bucket: ${formatBucketSummary(bestRow(analytics.distanceBeforeFillRows))}`,
        "",
        "WARNING FLAGS",
        `Low sample buckets: ${analytics.lowSampleBuckets}`,
        `Limited data sections: ${limitedSections.length ? limitedSections.join(", ") : "None"}`,
        `Weak confidence: ${weakConfidence ? "Yes - many populated buckets are below n < 10" : "No"}`,
        "",
        "RESEARCH BACKLOG",
        ...RESEARCH_BACKLOG_ITEMS.map((item) => `- ${item.title} (${item.status}): ${item.body}`),
    ];

    return lines.join("\n");
}

function bestRow(rows) {
    return rows.filter(isUsableBucket).reduce((acc, row) => (!acc || row.netR > acc.netR ? row : acc), null);
}

function worstRow(rows) {
    return rows.filter(isUsableBucket).reduce((acc, row) => (!acc || row.netR < acc.netR ? row : acc), null);
}

function fastestLosingRow(rows) {
    return rows.find((row) => isUsableBucket(row) && row.netR < 0) || worstRow(rows);
}

function isUsableBucket(row) {
    return row && row.count > 0 && row.label !== "Limited Data";
}

function hasLimitedData(rows) {
    return rows.some((row) => row.label === "Limited Data" && row.count > 0);
}

function formatBucketSummary(row) {
    if (!row) return "Limited Data";
    return `${row.label} · n=${row.count} · WR ${formatPct(row.winRate)} · Net ${formatR(row.netR)} · Exp ${formatSigned(round3(row.expectancy))}R`;
}

function buildOrderBlockAnalytics(trades) {
    const linkedCount = trades.filter(hasLinkedOb).length;
    const unlinkedCount = trades.length - linkedCount;
    const structureRows = bucketRows(trades, (t) => t.structure || "Limited Data", ["BOS", "CHoCH", "Limited Data"]);
    const directionRows = bucketRows(trades, (t) => t.direction || "Limited Data", ["Long", "Short", "Limited Data"]);
    const originSessionRows = bucketRows(trades, originSessionForTrade, SESSION_COLUMNS);
    const creationHourRows = bucketRows(trades, creationHourLabel);
    const widthRows = bucketRows(trades, widthBucket, ["0-2 pips", "2-5 pips", "5-10 pips", "10+ pips", "Limited Data"]);
    const ageRows = bucketRows(trades, ageBucket, ["same session / <4h", "4-12h", "12-24h", "1-3d", "3-7d", "7-14d", "14d+", "Limited Data"]);
    const penetrationRows = bucketRows(trades, penetrationBucket, ["0–10%", "10–25%", "25–50%", "50–75%", "75–100%", "100%+", "Limited Data"]);
    const fastStopoutRows = bucketRows(trades, fastStopoutBucket, ["same candle", "<15m", "15–60m", "1–4h", "4h+", "Limited Data"]);
    const distanceBeforeFillRows = bucketRows(trades, distanceBeforeFillBucket, ["0–0.5R", "0.5–1R", "1–2R", "2R+", "Limited Data"]);
    const allRows = [
        ...structureRows,
        ...directionRows,
        ...originSessionRows,
        ...creationHourRows,
        ...widthRows,
        ...ageRows,
        ...penetrationRows,
        ...fastStopoutRows,
        ...distanceBeforeFillRows,
    ];
    const lowSampleBuckets = allRows.filter((r) => r.count > 0 && r.count < LOW_SAMPLE_N).length;
    const bestBucket = allRows.filter((r) => r.count > 0).reduce((acc, cur) => (!acc || cur.netR > acc.netR ? cur : acc), null);
    return {
        linkedCount,
        unlinkedCount,
        lowSampleBuckets,
        bestBucket,
        structureRows,
        directionRows,
        originSessionRows,
        creationHourRows,
        widthRows,
        ageRows,
        penetrationRows,
        catastrophicBreach: buildCatastrophicBreach(trades),
        fastStopoutRows,
        distanceBeforeFillRows,
        sessionMatrix: buildSessionMatrix(trades),
        worstLosses: trades
            .filter((t) => Number(t.r) < 0)
            .map((t) => ({ ...t, ageLabel: ageBucket(t), originSession: originSessionForTrade(t), fillSession: fillSessionForTrade(t) }))
            .sort((a, b) => Number(a.r) - Number(b.r))
            .slice(0, 12),
    };
}

function buildCatastrophicBreach(trades) {
    const known = trades.filter((trade) => trade?.ob_fully_breached === true || trade?.ob_fully_breached === false);
    const breached = known.filter((trade) => trade.ob_fully_breached === true);
    const rows = [
        finalizeBucket(breached.reduce((bucket, trade) => {
            addTradeToBucket(bucket, trade);
            return bucket;
        }, emptyBucket("Hard Invalidated"))),
        finalizeBucket(known.filter((trade) => trade.ob_fully_breached === false).reduce((bucket, trade) => {
            addTradeToBucket(bucket, trade);
            return bucket;
        }, emptyBucket("Not Hard Invalidated"))),
    ];
    if (known.length !== trades.length) {
        rows.push(finalizeBucket(trades.filter((trade) => trade?.ob_fully_breached !== true && trade?.ob_fully_breached !== false).reduce((bucket, trade) => {
            addTradeToBucket(bucket, trade);
            return bucket;
        }, emptyBucket("Limited Data"))));
    }
    const breachedLosses = breached.map((trade) => Number(trade.r)).filter((r) => Number.isFinite(r) && r < 0);
    const avgLoss = breachedLosses.length ? breachedLosses.reduce((sum, r) => sum + r, 0) / breachedLosses.length : null;
    return {
        rows,
        breachCount: breached.length,
        breachPct: known.length ? (breached.length / known.length) * 100 : 0,
        avgLoss,
    };
}

function bucketRows(trades, labelFn, preferredOrder = null) {
    const buckets = {};
    trades.forEach((trade) => {
        const label = labelFn(trade) || "Limited Data";
        if (!buckets[label]) buckets[label] = emptyBucket(label);
        addTradeToBucket(buckets[label], trade);
    });
    const rows = Object.values(buckets).map(finalizeBucket);
    if (!preferredOrder) return rows.sort((a, b) => b.count - a.count || b.netR - a.netR);
    const ordered = preferredOrder.map((label) => finalizeBucket(buckets[label] || emptyBucket(label)));
    const extras = rows.filter((row) => !preferredOrder.includes(row.label));
    return [...ordered, ...extras];
}

function emptyBucket(label) {
    return { label, count: 0, wins: 0, losses: 0, netR: 0 };
}

function addTradeToBucket(bucket, trade) {
    const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
    bucket.count += 1;
    bucket.netR += r;
    if (r > 0 || trade?.outcome === "Win") bucket.wins += 1;
    if (r < 0 || trade?.outcome === "Loss") bucket.losses += 1;
}

function finalizeBucket(bucket) {
    return {
        ...bucket,
        netR: round1(bucket.netR),
        winRate: bucket.count ? (bucket.wins / bucket.count) * 100 : 0,
        expectancy: bucket.count ? bucket.netR / bucket.count : 0,
    };
}

function buildSessionMatrix(trades) {
    const rows = [];
    const rowSet = new Set();
    const cells = {};
    trades.forEach((trade) => {
        const row = originSessionForTrade(trade);
        const col = fillSessionForTrade(trade);
        const key = `${row}|||${col}`;
        if (!rowSet.has(row)) {
            rowSet.add(row);
            rows.push(row);
        }
        if (!cells[key]) cells[key] = { row, col, netR: 0, count: 0 };
        cells[key].netR += Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
        cells[key].count += 1;
    });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    return { rows: rows.length ? rows : ["Unknown"], cells, maxAbs, total: trades.length };
}

function hasLinkedOb(trade) {
    return !!(trade?.obId || trade?.obOriginTime || trade?.obDetectionTime || trade?.obTop != null || trade?.obBottom != null || trade?.obWidthPips != null);
}

function creationHourLabel(trade) {
    const d = parseDate(trade?.obOriginTime || trade?.obDetectionTime);
    return d ? `${String(d.getUTCHours()).padStart(2, "0")}:00 UTC` : "Limited Data";
}

function widthBucket(trade) {
    const v = Number(trade?.obWidthPips);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 2) return "0-2 pips";
    if (v < 5) return "2-5 pips";
    if (v < 10) return "5-10 pips";
    return "10+ pips";
}

function ageBucket(trade) {
    const hours = ageHours(trade);
    if (hours == null) return "Limited Data";
    if (hours < 4) return "same session / <4h";
    if (hours < 12) return "4-12h";
    if (hours < 24) return "12-24h";
    if (hours < 72) return "1-3d";
    if (hours < 168) return "3-7d";
    if (hours < 336) return "7-14d";
    return "14d+";
}

function penetrationBucket(trade) {
    const v = Number(trade?.max_ob_penetration_pct);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 10) return "0–10%";
    if (v < 25) return "10–25%";
    if (v < 50) return "25–50%";
    if (v < 75) return "50–75%";
    if (v < 100) return "75–100%";
    return "100%+";
}

function fastStopoutBucket(trade) {
    if (trade?.same_candle_exit === true) return "same candle";
    const minutes = Number(trade?.minutes_to_exit);
    if (!Number.isFinite(minutes)) return "Limited Data";
    if (minutes < 15) return "<15m";
    if (minutes < 60) return "15–60m";
    if (minutes < 240) return "1–4h";
    return "4h+";
}

function distanceBeforeFillBucket(trade) {
    const v = Number(trade?.max_distance_away_before_fill_r);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 0.5) return "0–0.5R";
    if (v < 1) return "0.5–1R";
    if (v < 2) return "1–2R";
    return "2R+";
}

function ageHours(trade) {
    const from = parseDate(trade?.obDetectionTime || trade?.obOriginTime);
    const to = parseDate(trade?.entry);
    if (!from || !to) return null;
    const hours = (to.getTime() - from.getTime()) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function originSessionForTrade(trade) {
    return normalizeSession(trade?.obOriginSession)
        || deriveSessionFromTimestamp(trade?.obOriginTime || trade?.obDetectionTime)
        || "Unknown";
}

function fillSessionForTrade(trade) {
    return normalizeSession(trade?.fillSession)
        || normalizeSession(trade?.entrySession)
        || deriveSessionFromTimestamp(trade?.entry)
        || "Unknown";
}

function normalizeSession(value) {
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull")) return "London Lull";
    if (lower.includes("london")) return "London";
    if (lower.includes("new") || lower === "ny") return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside")) return "Outside";
    if (lower === "unknown" || lower === "—") return "Unknown";
    return text;
}

function deriveSessionFromTimestamp(value) {
    const d = parseDate(value);
    if (!d) return null;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function parseDate(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

function VariantSelector({ variants, value }) {
    if (!variants?.length) return null;
    if (variants.length === 1) return <Pill tone="muted">{variantLabel(variants[0])}</Pill>;
    return (
        <NeonSelect
            testId="oblab-variant"
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

function variantShort(v) {
    return {
        single_position: "Single",
        allow_multi_position: "Multi",
        one_per_direction: "Per Dir",
        unknown: "Trades",
    }[v] || "N/A";
}

function round1(value) {
    return Number((Number(value) || 0).toFixed(1));
}

function round3(value) {
    return Number((Number(value) || 0).toFixed(3));
}

function formatR(value) {
    const n = round1(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

function formatSigned(value) {
    const n = Number(value) || 0;
    return `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
}

function formatPct(value) {
    return `${round1(value).toFixed(1)}%`;
}
