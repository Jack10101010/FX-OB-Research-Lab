import React from "react";
import { ActiveRunContext } from "@/components/lab/ActiveRunContext";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { NeonSelect, Segment } from "@/components/lab/controls";
import { useDataset } from "@/data/store";
import { setSelectedTradeVariant } from "@/data/store";
import {
    Activity, AlertTriangle, Boxes, Clipboard, FileText, GitBranch,
    ShieldCheck, TrendingUp, TrendingDown, X, Filter, Layers,
    BarChart2, Calendar, Database, Target, Award,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_SAMPLE_N = 10;
const EMPTY_TRADES = [];
const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Limited Data"];
const FILTER_DEFAULTS = { structure: "all", direction: "all", session: "all" };

const OB_FIELDS = [
    { key: "obId",                              label: "OB ID" },
    { key: "obOriginTime",                      label: "Origin Time" },
    { key: "obDetectionTime",                   label: "Detection Time" },
    { key: "obTop",                             label: "OB Top" },
    { key: "obBottom",                          label: "OB Bottom" },
    { key: "obWidthPips",                       label: "OB Width (pips)" },
    { key: "max_ob_penetration_pct",            label: "Max Penetration %" },
    { key: "ob_fully_breached",                 label: "Breach Flag" },
    { key: "obOriginSession",                   label: "Origin Session" },
    { key: "fillSession",                       label: "Fill Session" },
    { key: "same_candle_exit",                  label: "Same Candle Exit" },
    { key: "minutes_to_exit",                   label: "Minutes to Exit" },
    { key: "max_distance_away_before_fill_r",   label: "Distance Before Fill R" },
];

const RESEARCH_BACKLOG_ITEMS = [
    {
        title: "MAE / MFE Suite",
        status: "Requires excursion data",
        body: "Maximum adverse / favorable excursion per trade. Stop placement optimiser, MFE efficiency score (final R / MFE), and per-bucket MAE distributions. Direct impact on stop and target model design.",
    },
    {
        title: "First Touch vs Re-test Performance",
        status: "Requires OB visit count",
        body: "Does the first fill of an OB outperform subsequent revisits? Tests a core SMC hypothesis. Requires an ob_touch_count or equivalent field from the exporter.",
    },
    {
        title: "Multi-Run Comparison Mode",
        status: "UI architecture work",
        body: "Load two runs simultaneously and show delta columns (Δ expectancy, Δ WR, Δ net R) per bucket across all panels. Delta heatmap + parameter diff summary. The most commercially differentiating research feature.",
    },
    {
        title: "Liquidity Sweep Relationship",
        status: "Requires sweep detection flag",
        body: "Did price sweep a swing liquidity pool before reaching the OB? Sweep + OB is a specific institutional confluence pattern. Requires ob_preceded_by_sweep boolean from exporter.",
    },
    {
        title: "High-Quality Setup Clustering",
        status: "Requires derived feature set",
        body: "Cluster winners/losers by OB width, age, displacement, structure type, session origin, penetration depth, fill session, and regime tags. ML-assisted pattern discovery.",
    },
    {
        title: "Trend / Regime Analysis",
        status: "Future regime tagging",
        body: "Split OB performance by trending/ranging and volatility regimes. HTF trend alignment analysis (counter-trend OBs should show distinct statistics).",
    },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderBlockLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS, activeRunId } = useDataset();

    // Filter state — persisted to localStorage
    const [filters, setFilters] = React.useState(() => {
        try { return { ...FILTER_DEFAULTS, ...JSON.parse(localStorage.getItem("oblab-filters") || "{}") }; }
        catch { return FILTER_DEFAULTS; }
    });

    const [drillModal, setDrillModal] = React.useState(null); // { title, trades }
    const [reportOpen, setReportOpen] = React.useState(false);

    const updateFilter = React.useCallback((key, value) => {
        setFilters(f => {
            const next = { ...f, [key]: value };
            try { localStorage.setItem("oblab-filters", JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const clearFilters = React.useCallback(() => {
        setFilters(FILTER_DEFAULTS);
        try { localStorage.removeItem("oblab-filters"); } catch {}
    }, []);

    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const filteredTrades = React.useMemo(() => applyFilters(trades, filters), [trades, filters]);
    const analytics = React.useMemo(() => buildOrderBlockAnalytics(filteredTrades), [filteredTrades]);
    const insights = React.useMemo(() => buildInsights(analytics), [analytics]);

    const activeFilterCount = Object.values(filters).filter(v => v !== "all").length;
    const isFiltered = activeFilterCount > 0;

    const reportText = React.useMemo(
        () => buildResearchReport({ run: ACTIVE_RUN, variant: ACTIVE_TRADE_VARIANT, analytics, filters }),
        [ACTIVE_RUN, ACTIVE_TRADE_VARIANT, analytics, filters],
    );

    const handleDrill = React.useCallback((title, row) => {
        if (row?.tradeRefs?.length) setDrillModal({ title: `${title} · ${row.label}`, trades: row.tradeRefs });
    }, []);

    return (
        <div className="pb-16">
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

            {/* ── KPI Chips ─────────────────────────────────────────────── */}
            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Linked Trades" value={String(analytics.linkedCount)} sub="with OB data" tone="primary" icon={Boxes} />
                <MetricChip label="Unlinked Trades" value={String(analytics.unlinkedCount)} sub="limited OB research" tone={analytics.unlinkedCount ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Best Bucket" value={analytics.bestBucket ? formatR(analytics.bestBucket.netR) : "—"} sub={analytics.bestBucket?.label || "Limited Data"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Bucket" value={analytics.worstBucket ? formatR(analytics.worstBucket.netR) : "—"} sub={analytics.worstBucket?.label || "Limited Data"} tone={analytics.worstBucket?.netR < 0 ? "danger" : "muted"} icon={TrendingDown} />
                <MetricChip label="Variant" value={variantShort(ACTIVE_TRADE_VARIANT)} sub="selected trades" tone="secondary" icon={GitBranch} />
                <MetricChip label="Active Run" value={activeRunId ? "Imported" : "No Run"} sub={isFiltered ? `${filteredTrades.length}/${trades.length} filtered` : (trades.length ? `${trades.length} trades` : "No trades")} tone={isFiltered ? "warning" : "secondary"} icon={Activity} />
            </div>

            {/* ── Auto-Insights ─────────────────────────────────────────── */}
            {insights.length > 0 && <InsightCallouts insights={insights} />}

            {/* ── Filter Bar ────────────────────────────────────────────── */}
            <FilterBar filters={filters} onUpdate={updateFilter} onClear={clearFilters} totalTrades={trades.length} filteredCount={filteredTrades.length} />

            <div className="px-6 mt-4 space-y-4">

                {/* ── Research Safety ──────────────────────────────────── */}
                {analytics.lowSampleBuckets > 0 && (
                    <NeonPanel title="Research Safety" tone="secondary" action={<Pill tone="warning">{analytics.lowSampleBuckets} LOW SAMPLE BUCKETS</Pill>}>
                        <div className="flex items-start gap-2 text-[11.5px] font-mono text-[hsl(var(--warning))]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Every bucket shows sample count. Treat buckets below {LOW_SAMPLE_N} trades as directional only. Click any bucket row to inspect its trade list.</span>
                        </div>
                    </NeonPanel>
                )}

                {/* ── Row 1: Structure · Direction · Origin Session ──────── */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <BucketPanel title="Structural Quality · BOS vs CHoCH" rows={analytics.structureRows} onDrill={r => handleDrill("Structure", r)} />
                    <BucketPanel title="Structural Quality · Long vs Short" rows={analytics.directionRows} onDrill={r => handleDrill("Direction", r)} />
                    <BucketPanel title="Origin Session Performance" rows={analytics.originSessionRows} onDrill={r => handleDrill("Origin Session", r)} />
                </div>

                {/* ── Full-width bucket panels ───────────────────────────── */}
                <BucketPanel title="OB Creation Hour Performance" rows={analytics.creationHourRows} onDrill={r => handleDrill("Creation Hour", r)} />
                <BucketPanel title="OB Width Analysis" rows={analytics.widthRows} onDrill={r => handleDrill("OB Width", r)} />
                <BucketPanel title="OB Age / Time-to-Fill" rows={analytics.ageRows} compact onDrill={r => handleDrill("OB Age", r)} />
                <BucketPanel title="Penetration Depth Analysis" rows={analytics.penetrationRows} compact onDrill={r => handleDrill("Penetration Depth", r)} />
                <BucketPanel title="Day of Week Performance" rows={analytics.dayOfWeekRows} onDrill={r => handleDrill("Day of Week", r)} />

                {/* ── Row: Breach + Stopout + Distance ──────────────────── */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <CatastrophicBreachPanel analysis={analytics.catastrophicBreach} onDrill={handleDrill} />
                    <BucketPanel title="Fast Stopout Analysis" rows={analytics.fastStopoutRows} compact onDrill={r => handleDrill("Fast Stopout", r)} />
                    <BucketPanel title="Distance Before Fill" rows={analytics.distanceBeforeFillRows} compact onDrill={r => handleDrill("Distance Before Fill", r)} />
                </div>

                {/* ── Session Matrix ────────────────────────────────────── */}
                <SessionMatrix matrix={analytics.sessionMatrix} />

                {/* ── Temporal Analytics ───────────────────────────────── */}
                <TemporalAnalytics rollingExpectancy={analytics.rollingExpectancy} equityCurves={analytics.equityCurves} />

                {/* ── Failure Lab ───────────────────────────────────────── */}
                <FailureLab losses={analytics.worstLosses} wins={analytics.bestWins} />

                {/* ── Field Completeness ────────────────────────────────── */}
                <FieldCompletenessPanel rows={analytics.fieldCompleteness} totalTrades={filteredTrades.length} />

                {/* ── Research Backlog ──────────────────────────────────── */}
                <ResearchBacklog />
            </div>

            {drillModal && (
                <BucketDrillModal
                    title={drillModal.title}
                    trades={drillModal.trades}
                    onClose={() => setDrillModal(null)}
                />
            )}
            {reportOpen && (
                <ReportModal reportText={reportText} onClose={() => setReportOpen(false)} />
            )}
        </div>
    );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ filters, onUpdate, onClear, totalTrades, filteredCount }) {
    const isFiltered = Object.values(filters).some(v => v !== "all");
    const STRUCT_OPTS = [
        { value: "all", label: "All" },
        { value: "BOS", label: "BOS" },
        { value: "CHoCH", label: "CHoCH" },
    ];
    const DIR_OPTS = [
        { value: "all", label: "All" },
        { value: "Long", label: "Long" },
        { value: "Short", label: "Short" },
    ];
    const SESSION_OPTS = [
        { value: "all", label: "All Sessions" },
        { value: "Asia", label: "Asia" },
        { value: "London", label: "London" },
        { value: "London Lull", label: "Lull" },
        { value: "New York", label: "New York" },
        { value: "Outside", label: "Outside" },
    ];

    return (
        <div className="px-6 mt-4">
            <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.6)] clip-bevel-sm px-4 py-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Research Filter</span>
                    {isFiltered && (
                        <span className="ml-1 px-1.5 py-0.5 bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))] rounded text-[9px]">
                            {filteredCount}/{totalTrades} trades
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-lab uppercase tracking-wider">Structure</span>
                    <Segment options={STRUCT_OPTS} value={filters.structure} onChange={v => onUpdate("structure", v)} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-lab uppercase tracking-wider">Direction</span>
                    <Segment options={DIR_OPTS} value={filters.direction} onChange={v => onUpdate("direction", v)} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-lab uppercase tracking-wider">OB Origin</span>
                    <Segment options={SESSION_OPTS} value={filters.session} onChange={v => onUpdate("session", v)} />
                </div>
                {isFiltered && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="ml-auto clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-1.5"
                    >
                        <X className="w-3 h-3" />
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Insight Callouts ─────────────────────────────────────────────────────────

function InsightCallouts({ insights }) {
    const toneMap = {
        primary:   { border: "hsl(var(--accent-primary))", bg: "hsl(var(--accent-primary)/0.06)", label: "text-[hsl(var(--accent-primary))]" },
        secondary: { border: "hsl(var(--accent-secondary))", bg: "hsl(var(--accent-secondary)/0.06)", label: "text-[hsl(var(--accent-secondary))]" },
        danger:    { border: "hsl(var(--danger))", bg: "hsl(var(--danger)/0.06)", label: "text-[hsl(var(--danger))]" },
        warning:   { border: "hsl(var(--warning))", bg: "hsl(var(--warning)/0.06)", label: "text-[hsl(var(--warning))]" },
        success:   { border: "hsl(var(--success))", bg: "hsl(var(--success)/0.06)", label: "text-[hsl(var(--success))]" },
    };

    return (
        <div className="px-6 mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {insights.map((insight, i) => {
                const t = toneMap[insight.tone] || toneMap.primary;
                return (
                    <div
                        key={i}
                        className="clip-bevel-sm border-l-2 px-3 py-2.5"
                        style={{ borderLeftColor: t.border, borderTop: "1px solid hsl(var(--border-soft))", borderRight: "1px solid hsl(var(--border-soft))", borderBottom: "1px solid hsl(var(--border-soft))", background: t.bg }}
                    >
                        <div className={`text-[9px] font-mono uppercase tracking-[0.18em] mb-1 ${t.label}`}>{insight.label}</div>
                        <div className="text-[11.5px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{insight.text}</div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Bucket Panel ─────────────────────────────────────────────────────────────

const BUCKET_COLUMNS = (heatmap) => [
    { key: "label",        label: "Bucket",   sortable: false, render: (r) => <BucketLabel row={r} />, heatmap: false },
    { key: "count",        label: "N",        align: "right" },
    { key: "wins",         label: "Wins",     align: "right" },
    { key: "losses",       label: "Losses",   align: "right" },
    { key: "winRate",      label: "WR",       align: "right", render: (r) => formatPct(r.winRate) },
    { key: "netR",         label: "Net R",    align: "right", render: (r) => <ColoredR value={round1(r.netR)} />, heatmap: heatmap },
    { key: "expectancy",   label: "Exp",      align: "right", render: (r) => <span className={r.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{formatSigned(round3(r.expectancy))}R</span>, heatmap: heatmap },
    { key: "profitFactor", label: "PF",       align: "right", render: (r) => <PFCell value={r.profitFactor} /> },
    { key: "ci",           label: "95% CI",   align: "right", sortable: false, heatmap: false, render: (r) => <CICell lo={r.ciLo} hi={r.ciHi} /> },
];

function BucketPanel({ title, rows, className = "", compact = false, onDrill }) {
    const [heatmap, setHeatmap] = React.useState(false);

    const handleRowClick = React.useCallback((row) => {
        if (onDrill && row?.tradeRefs?.length) onDrill(row);
    }, [onDrill]);

    return (
        <NeonPanel
            collapsible
            className={className}
            title={title}
            action={(
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        title={heatmap ? "Disable heatmap" : "Enable heatmap"}
                        onClick={() => setHeatmap(h => !h)}
                        className={`clip-bevel-sm border px-2 py-1 text-[10px] inline-flex items-center gap-1 transition-colors ${heatmap ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.15)] text-[hsl(var(--accent-primary))]" : "border-[hsl(var(--border-soft))] text-muted-lab hover:text-white"}`}
                    >
                        <Layers className="w-3 h-3" />
                    </button>
                    <Pill tone="muted">{rows.filter(r => r.count > 0).length} BUCKETS</Pill>
                </div>
            )}
        >
            <DataTable
                testId={`oblab-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                maxHeight={compact ? 260 : 320}
                columns={BUCKET_COLUMNS(heatmap)}
                rows={rows}
                onRowClick={onDrill ? handleRowClick : undefined}
                heatmap={heatmap}
                defaultSortKey="expectancy"
                defaultSortDir="desc"
            />
        </NeonPanel>
    );
}

function BucketLabel({ row }) {
    const tier = getBucketTier(row);
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span>{row.label || "Limited Data"}</span>
            {tier && <Pill tone={tier.tone}>{tier.label}</Pill>}
        </div>
    );
}

function getBucketTier(row) {
    if (!row || row.count === 0) return null;
    if (row.count < LOW_SAMPLE_N) return { tone: "warning", label: "LOW N" };
    if (row.winRate >= 65 && row.count >= 20 && row.expectancy > 0)
        return { tone: "success", label: "STRONG EDGE" };
    if (row.winRate >= 55 && row.count >= 10 && row.expectancy > 0)
        return { tone: "primary", label: "EDGE SIGNAL" };
    if (row.expectancy <= -0.3)
        return { tone: "danger", label: "NEGATIVE EDGE" };
    return null;
}

function PFCell({ value }) {
    if (value == null) return <span className="text-[hsl(var(--success))]">∞</span>;
    if (!Number.isFinite(value)) return <span className="text-muted-lab">—</span>;
    const cls = value >= 1.5 ? "text-[hsl(var(--success))]" : value < 1 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]";
    return <span className={cls}>{value.toFixed(2)}</span>;
}

function CICell({ lo, hi }) {
    if (lo == null || hi == null) return <span className="text-muted-lab opacity-50">—</span>;
    const significant = lo > 0 || hi < 0;
    const cls = lo > 0 ? "text-[hsl(var(--success)/0.8)]" : hi < 0 ? "text-[hsl(var(--danger)/0.8)]" : "text-muted-lab";
    return (
        <span className={`text-[10px] ${cls}`} title={significant ? "Statistically separable from zero" : "CI crosses zero — edge not confirmed"}>
            [{lo > 0 ? "+" : ""}{lo.toFixed(2)}, {hi > 0 ? "+" : ""}{hi.toFixed(2)}]
        </span>
    );
}

// ─── Session Matrix ───────────────────────────────────────────────────────────

const MATRIX_METRICS = [
    { value: "netR",       label: "Net R" },
    { value: "winRate",    label: "Win %" },
    { value: "expectancy", label: "Exp" },
    { value: "count",      label: "Count" },
];

function SessionMatrix({ matrix }) {
    const [metric, setMetric] = React.useState("netR");
    const [tooltip, setTooltip] = React.useState(null);

    // Compute row totals and column totals
    const rowTotals = React.useMemo(() => {
        const out = {};
        matrix.rows.forEach(row => {
            const cells = SESSION_COLUMNS.map(col => matrix.cells[`${row}|||${col}`]).filter(Boolean);
            if (!cells.length) return;
            const count = cells.reduce((s, c) => s + c.count, 0);
            const netR = cells.reduce((s, c) => s + c.netR, 0);
            const wins = cells.reduce((s, c) => s + (c.wins || 0), 0);
            out[row] = { count, netR, winRate: count ? (wins / count) * 100 : 0, expectancy: count ? netR / count : 0 };
        });
        return out;
    }, [matrix]);

    const colTotals = React.useMemo(() => {
        const out = {};
        SESSION_COLUMNS.forEach(col => {
            const cells = matrix.rows.map(row => matrix.cells[`${row}|||${col}`]).filter(Boolean);
            if (!cells.length) return;
            const count = cells.reduce((s, c) => s + c.count, 0);
            const netR = cells.reduce((s, c) => s + c.netR, 0);
            const wins = cells.reduce((s, c) => s + (c.wins || 0), 0);
            out[col] = { count, netR, winRate: count ? (wins / count) * 100 : 0, expectancy: count ? netR / count : 0 };
        });
        return out;
    }, [matrix]);

    const formatMetricVal = (cell) => {
        if (!cell) return null;
        switch (metric) {
            case "netR":       return formatR(cell.netR);
            case "winRate":    return formatPct(cell.winRate ?? (cell.count > 0 ? (cell.wins / cell.count) * 100 : 0));
            case "expectancy": return `${formatSigned(round3(cell.expectancy ?? (cell.count > 0 ? cell.netR / cell.count : 0)))}R`;
            case "count":      return String(cell.count);
            default:           return "";
        }
    };

    const metricValNum = (cell) => {
        if (!cell) return 0;
        switch (metric) {
            case "netR":       return cell.netR;
            case "winRate":    return cell.winRate ?? (cell.count > 0 ? (cell.wins / cell.count) * 100 : 0);
            case "expectancy": return cell.expectancy ?? (cell.count > 0 ? cell.netR / cell.count : 0);
            case "count":      return cell.count;
            default:           return 0;
        }
    };

    // Re-compute maxAbs for selected metric
    const metricMaxAbs = React.useMemo(() => {
        const vals = Object.values(matrix.cells).map(c => Math.abs(metricValNum(c)));
        return Math.max(...vals) || 1;
    }, [matrix, metric]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <NeonPanel
            collapsible
            title="Timing · Origin Session × Fill Session"
            action={(
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Segment options={MATRIX_METRICS} value={metric} onChange={setMetric} />
                    <Pill tone="muted">{matrix.total} TRADES</Pill>
                </div>
            )}
        >
            <div className="relative overflow-x-auto scrollbar-thin" data-testid="oblab-session-matrix">
                <table className="w-full min-w-[760px] font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider">Origin ↓ / Fill →</th>
                            {SESSION_COLUMNS.map(s => (
                                <th key={s} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{s}</th>
                            ))}
                            <th className="text-[hsl(var(--accent-secondary)/0.7)] px-2 py-1 text-[10px] uppercase tracking-wider">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map(row => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {SESSION_COLUMNS.map(col => {
                                    const key = `${row}|||${col}`;
                                    const cell = matrix.cells[key];
                                    if (!cell) {
                                        return (
                                            <td key={col}>
                                                <div className="clip-bevel-sm px-2 py-2 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                            </td>
                                        );
                                    }
                                    const val = metricValNum(cell);
                                    const alpha = (0.16 + 0.48 * (Math.abs(val) / metricMaxAbs)).toFixed(3);
                                    const bg = val >= 0 ? `hsl(var(--accent-primary) / ${alpha})` : `hsl(var(--bear) / ${alpha})`;
                                    const isHovered = tooltip?.key === key;
                                    return (
                                        <td key={col} className="relative">
                                            <div
                                                className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums cursor-default transition-opacity"
                                                style={{ background: bg, outline: isHovered ? "1px solid hsl(var(--accent-primary))" : undefined }}
                                                onMouseEnter={() => setTooltip({ key, cell, row, col })}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                <div className="font-semibold">{formatMetricVal(cell)}</div>
                                                <div className="text-[9px] text-white/70">{cell.count} trade{cell.count === 1 ? "" : "s"}</div>
                                                {cell.count < LOW_SAMPLE_N && <div className="text-[8px] text-[hsl(var(--warning))]">LOW N</div>}
                                            </div>
                                            {isHovered && (
                                                <MatrixTooltip cell={cell} row={row} col={col} />
                                            )}
                                        </td>
                                    );
                                })}
                                {/* Row total */}
                                {rowTotals[row] ? (
                                    <td>
                                        <div className="clip-bevel-sm px-2 py-1.5 text-center tabular-nums bg-[hsl(var(--accent-secondary)/0.08)] border border-[hsl(var(--accent-secondary)/0.2)]">
                                            <div className="text-[hsl(var(--accent-secondary)/0.9)] font-semibold">{formatMetricVal(rowTotals[row])}</div>
                                            <div className="text-[9px] text-muted-lab">{rowTotals[row].count} total</div>
                                        </div>
                                    </td>
                                ) : <td />}
                            </tr>
                        ))}
                        {/* Column totals row */}
                        <tr>
                            <td className="text-[hsl(var(--accent-secondary)/0.7)] px-2 py-1 text-[10px] uppercase tracking-wider">Total</td>
                            {SESSION_COLUMNS.map(col => (
                                colTotals[col] ? (
                                    <td key={col}>
                                        <div className="clip-bevel-sm px-2 py-1.5 text-center tabular-nums bg-[hsl(var(--accent-secondary)/0.08)] border border-[hsl(var(--accent-secondary)/0.2)]">
                                            <div className="text-[hsl(var(--accent-secondary)/0.9)] font-semibold">{formatMetricVal(colTotals[col])}</div>
                                            <div className="text-[9px] text-muted-lab">{colTotals[col].count}</div>
                                        </div>
                                    </td>
                                ) : <td key={col} />
                            ))}
                            <td />
                        </tr>
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

function MatrixTooltip({ cell, row, col }) {
    const wr = cell.count > 0 ? ((cell.wins || 0) / cell.count) * 100 : 0;
    const exp = cell.count > 0 ? cell.netR / cell.count : 0;
    return (
        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-xl p-2.5 pointer-events-none clip-bevel-sm">
            <div className="text-[10px] font-mono text-[hsl(var(--accent-primary))] uppercase tracking-wider mb-1.5">{row} → {col}</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono">
                <span className="text-muted-lab">Net R</span>   <span className="text-white">{formatR(cell.netR)}</span>
                <span className="text-muted-lab">Win Rate</span> <span className="text-white">{formatPct(wr)}</span>
                <span className="text-muted-lab">Exp</span>      <span className="text-white">{formatSigned(round3(exp))}R</span>
                <span className="text-muted-lab">Trades</span>   <span className="text-white">{cell.count}</span>
            </div>
        </div>
    );
}

// ─── Failure Lab ──────────────────────────────────────────────────────────────

const TRADE_DETAIL_COLS = [
    { key: "id",             label: "Trade ID" },
    { key: "direction",      label: "Dir",      render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction || "—"}</Pill> },
    { key: "structure",      label: "Struct" },
    { key: "obWidthPips",    label: "Width",    align: "right", render: (r) => r.obWidthPips != null ? `${round1(r.obWidthPips)}p` : "—" },
    { key: "ageLabel",       label: "OB Age" },
    { key: "originSession",  label: "Origin" },
    { key: "fillSession",    label: "Fill" },
    { key: "r",              label: "R",        align: "right", render: (r) => <ColoredR value={Number(r.r)} /> },
];

const N_OPTIONS = [
    { value: "12", label: "Top 12" },
    { value: "25", label: "Top 25" },
    { value: "50", label: "Top 50" },
    { value: "all", label: "All" },
];

function FailureLab({ losses, wins }) {
    const [tab, setTab] = React.useState("losses");
    const [nOption, setNOption] = React.useState("12");

    const trades = tab === "losses" ? losses : wins;
    const allTrades = tab === "losses" ? losses : wins;
    const displayTrades = nOption === "all" ? allTrades : allTrades.slice(0, Number(nOption));

    return (
        <NeonPanel
            collapsible
            title={tab === "losses" ? "Failure Lab · Worst Losing Trades" : "Winner Lab · Best Winning Trades"}
            action={(
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Segment
                        options={[{ value: "losses", label: "Losses" }, { value: "wins", label: "Wins" }]}
                        value={tab}
                        onChange={setTab}
                    />
                    <Segment options={N_OPTIONS} value={nOption} onChange={setNOption} />
                    <Pill tone={tab === "losses" ? "danger" : "success"}>{allTrades.length} {tab === "losses" ? "LOSSES" : "WINS"}</Pill>
                </div>
            )}
        >
            <DataTable
                testId="oblab-failure-lab"
                maxHeight={340}
                columns={TRADE_DETAIL_COLS}
                rows={displayTrades}
                defaultSortKey="r"
                defaultSortDir={tab === "losses" ? "asc" : "desc"}
            />
        </NeonPanel>
    );
}

// ─── Catastrophic Breach Panel ────────────────────────────────────────────────

function CatastrophicBreachPanel({ analysis, onDrill }) {
    return (
        <NeonPanel
            collapsible
            title="Loss Analytics · Catastrophic Failures"
            action={<Pill tone={analysis.breachCount ? "danger" : "muted"}>{formatPct(analysis.breachPct)} FAILURE</Pill>}
        >
            <div className="grid grid-cols-2 gap-2 mb-3">
                <MetricChip label="Hard Invalidated" value={String(analysis.breachCount)} sub={`${formatPct(analysis.breachPct)} of known`} tone={analysis.breachCount ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Avg Breach Loss" value={analysis.avgLoss == null ? "—" : formatR(analysis.avgLoss)} sub="hard invalidation only" tone="secondary" icon={Target} />
            </div>
            <DataTable
                testId="oblab-catastrophic-breach"
                maxHeight={220}
                columns={[
                    { key: "label",        label: "Bucket",   sortable: false, render: (r) => <BucketLabel row={r} />, heatmap: false },
                    { key: "count",        label: "N",        align: "right" },
                    { key: "winRate",      label: "WR",       align: "right", render: (r) => formatPct(r.winRate) },
                    { key: "netR",         label: "Net R",    align: "right", render: (r) => <ColoredR value={round1(r.netR)} /> },
                    { key: "expectancy",   label: "Exp",      align: "right", render: (r) => `${formatSigned(round3(r.expectancy))}R` },
                    { key: "profitFactor", label: "PF",       align: "right", render: (r) => <PFCell value={r.profitFactor} /> },
                ]}
                rows={analysis.rows}
                onRowClick={r => onDrill && r?.tradeRefs?.length && onDrill("Catastrophic Breach", r)}
                defaultSortKey="expectancy"
            />
        </NeonPanel>
    );
}

// ─── Temporal Analytics ───────────────────────────────────────────────────────

function TemporalAnalytics({ rollingExpectancy, equityCurves }) {
    const hasRolling = rollingExpectancy?.length >= 5;
    const hasCurves = equityCurves && (equityCurves.all?.length >= 5 || equityCurves.bos?.length >= 3 || equityCurves.choch?.length >= 3);

    if (!hasRolling && !hasCurves) return null;

    return (
        <NeonPanel collapsible defaultCollapsed title="Temporal Analytics · Equity & Rolling Performance" action={<Pill tone="muted">Time Series</Pill>}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {hasRolling && (
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-lab mb-2">Rolling Expectancy · Trailing 20 Trades</div>
                        <RollingExpectancyChart points={rollingExpectancy} />
                    </div>
                )}
                {hasCurves && (
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-lab mb-2">Cumulative R · BOS vs CHoCH vs All</div>
                        <EquityCurveChart curves={equityCurves} />
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}

function RollingExpectancyChart({ points }) {
    const W = 500, H = 100;
    if (!points?.length) return null;
    const ys = points.map(p => p.exp);
    const yMin = Math.min(...ys, 0) * 1.15 || -0.5;
    const yMax = Math.max(...ys, 0) * 1.15 || 0.5;
    const range = yMax - yMin || 1;
    const sx = i => ((i / (points.length - 1)) * W).toFixed(1);
    const sy = y => (H - ((y - yMin) / range) * H).toFixed(1);
    const zeroY = sy(0);
    const pts = points.map((p, i) => `${sx(i)},${sy(p.exp)}`).join(" ");

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
                <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="hsl(var(--border-soft))" strokeWidth="1" strokeDasharray="4,3" />
                <text x="4" y={Number(zeroY) - 3} fill="hsl(var(--text-2))" fontSize="8" fontFamily="monospace">0R</text>
                <polyline
                    points={pts}
                    fill="none"
                    stroke="hsl(var(--accent-primary))"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: "drop-shadow(0 0 4px hsl(var(--accent-primary)))" }}
                />
            </svg>
        </div>
    );
}

function EquityCurveChart({ curves }) {
    const W = 500, H = 100;
    const seriesDefs = [
        { key: "all",   color: "hsl(var(--text-2))",          label: "All" },
        { key: "bos",   color: "hsl(var(--accent-primary))",  label: "BOS" },
        { key: "choch", color: "hsl(var(--accent-secondary))", label: "CHoCH" },
    ];
    const allPoints = seriesDefs.flatMap(s => (curves[s.key] || []).map(p => p.y));
    if (!allPoints.length) return null;
    const yMin = Math.min(...allPoints, 0) * 1.1 || -1;
    const yMax = Math.max(...allPoints, 0) * 1.1 || 1;
    const range = yMax - yMin || 1;
    const sy = y => (H - ((y - yMin) / range) * H).toFixed(1);
    const zeroY = sy(0);

    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
                <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="hsl(var(--border-soft))" strokeWidth="1" strokeDasharray="4,3" />
                {seriesDefs.map(({ key, color }) => {
                    const pts = curves[key];
                    if (!pts?.length) return null;
                    const polyPts = pts.map((p, i) => `${((i / Math.max(pts.length - 1, 1)) * W).toFixed(1)},${sy(p.y)}`).join(" ");
                    return (
                        <polyline
                            key={key}
                            points={polyPts}
                            fill="none"
                            stroke={color}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                        />
                    );
                })}
            </svg>
            <div className="flex items-center gap-4 mt-1.5">
                {seriesDefs.map(({ key, color, label }) => curves[key]?.length ? (
                    <div key={key} className="flex items-center gap-1.5">
                        <span className="w-5 h-px inline-block" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                        <span className="text-[10px] font-mono text-muted-lab">{label}</span>
                    </div>
                ) : null)}
            </div>
        </div>
    );
}

// ─── Field Completeness Panel ─────────────────────────────────────────────────

function FieldCompletenessPanel({ rows, totalTrades }) {
    if (!totalTrades || !rows?.length) return null;

    const statusTone = (pct) => {
        if (pct >= 95) return { tone: "success", label: "FULL" };
        if (pct >= 50) return { tone: "warning", label: "PARTIAL" };
        if (pct >= 1)  return { tone: "danger",  label: "SPARSE" };
        return { tone: "muted", label: "MISSING" };
    };

    return (
        <NeonPanel
            collapsible
            defaultCollapsed
            title="Data Quality · OB Field Completeness"
            action={<Pill tone="muted"><Database className="w-2.5 h-2.5 inline mr-1" />{totalTrades} TRADES</Pill>}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {rows.map(row => {
                    const st = statusTone(row.pct);
                    return (
                        <div key={row.key} className="flex items-center gap-2.5 py-1.5 px-2 border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.4)]">
                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-mono text-[hsl(var(--text-2))] truncate">{row.label}</div>
                                <div className="mt-1 w-full h-1 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${row.pct}%`,
                                            background: row.pct >= 95 ? "hsl(var(--success))" : row.pct >= 50 ? "hsl(var(--warning))" : "hsl(var(--danger))",
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-white shrink-0">{row.pct.toFixed(0)}%</div>
                            <Pill tone={st.tone}>{st.label}</Pill>
                        </div>
                    );
                })}
            </div>
        </NeonPanel>
    );
}

// ─── Research Backlog ─────────────────────────────────────────────────────────

function ResearchBacklog() {
    return (
        <NeonPanel collapsible defaultCollapsed title="Research Backlog · Future Capabilities" action={<Pill tone="muted">{RESEARCH_BACKLOG_ITEMS.length} IDEAS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5" data-testid="oblab-research-backlog">
                {RESEARCH_BACKLOG_ITEMS.map((item) => (
                    <div key={item.title} className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2.5">
                        <div className="flex items-start gap-2 justify-between">
                            <div className="text-[11.5px] font-display text-white leading-tight">{item.title}</div>
                            <Pill tone="warning">{item.status}</Pill>
                        </div>
                        <p className="mt-2 text-[11px] text-[hsl(var(--text-2))] leading-relaxed">{item.body}</p>
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

// ─── Bucket Drill Modal ───────────────────────────────────────────────────────

function BucketDrillModal({ title, trades, onClose }) {
    const rows = trades.map(t => ({
        ...t,
        ageLabel:      ageBucket(t),
        originSession: originSessionForTrade(t),
        fillSession:   fillSessionForTrade(t),
    }));

    const wins   = rows.filter(t => Number(t.r) > 0).length;
    const netR   = round1(rows.reduce((s, t) => s + (Number.isFinite(Number(t.r)) ? Number(t.r) : 0), 0));
    const exp    = rows.length ? round3(netR / rows.length) : 0;
    const wr     = rows.length ? (wins / rows.length) * 100 : 0;

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl max-h-[88vh] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.98)] clip-bevel overflow-hidden shadow-2xl shadow-black/40 flex flex-col">
                <div className="flex items-center justify-between border-b border-[hsl(var(--border-soft))] px-4 py-3 shrink-0">
                    <div>
                        <div className="font-display text-sm text-white uppercase tracking-wider">Bucket Drill-Through</div>
                        <div className="text-[11px] font-mono text-[hsl(var(--accent-primary))]">{title}</div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                            <span className="text-muted-lab">n={rows.length}</span>
                            <span className="text-white">WR {formatPct(wr)}</span>
                            <ColoredR value={netR} />
                            <span className={exp >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{formatSigned(exp)}R exp</span>
                        </div>
                        <button type="button" onClick={onClose} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-2">
                            <X className="w-4 h-4" />
                            Close
                        </button>
                    </div>
                </div>
                <div className="overflow-auto flex-1 scrollbar-thin">
                    <DataTable
                        testId="oblab-drill-modal"
                        columns={TRADE_DETAIL_COLS}
                        rows={rows}
                        defaultSortKey="r"
                        defaultSortDir="asc"
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ reportText, onClose }) {
    const [copied, setCopied] = React.useState(false);
    const copyReport = async () => {
        try {
            await navigator.clipboard.writeText(reportText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        } catch { setCopied(false); }
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
                        <button type="button" onClick={copyReport} className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.12)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.2)] transition-colors inline-flex items-center gap-2">
                            <Clipboard className="w-3.5 h-3.5" />
                            {copied ? "Copied" : "Copy Report"}
                        </button>
                        <button type="button" onClick={onClose} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-3 py-2 text-[11px] font-display uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-2" aria-label="Close report">
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

// ─── Variant Selector ─────────────────────────────────────────────────────────

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

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildResearchReport({ run, variant, analytics, filters }) {
    const activeFilters = Object.entries(filters).filter(([, v]) => v !== "all").map(([k, v]) => `${k}=${v}`);
    const structuralGroups = [
        ["Structure Type",   analytics.structureRows],
        ["Direction",        analytics.directionRows],
        ["Origin Session",   analytics.originSessionRows],
        ["Creation Hour",    analytics.creationHourRows],
        ["Width Bucket",     analytics.widthRows],
        ["Age Bucket",       analytics.ageRows],
        ["Day of Week",      analytics.dayOfWeekRows],
    ];
    const executionGroups = [
        ["Penetration Bucket",       analytics.penetrationRows],
        ["Fast Stopout Bucket",      analytics.fastStopoutRows],
        ["Distance Before Fill",     analytics.distanceBeforeFillRows],
    ];

    const limitedSections = [...structuralGroups, ...executionGroups]
        .filter(([, rows]) => hasLimitedData(rows)).map(([label]) => label);

    const nonZeroBucketCount = [...structuralGroups.flatMap(([, rows]) => rows), ...executionGroups.flatMap(([, rows]) => rows)]
        .filter(row => row.count > 0).length;
    const weakConfidence = nonZeroBucketCount > 0 && analytics.lowSampleBuckets / nonZeroBucketCount >= 0.5;

    const lines = [
        "ORDER BLOCK LAB REPORT",
        "",
        "OVERVIEW",
        `Run: ${run?.id || "No active run"}`,
        `Variant: ${variantLabel(variant)}`,
        `Linked trades: ${analytics.linkedCount}`,
        `Unlinked trades: ${analytics.unlinkedCount}`,
        `Active filters: ${activeFilters.length ? activeFilters.join(", ") : "none"}`,
        "",
        "STRUCTURAL QUALITY HIGHLIGHTS",
        "Best-performing bucket per dimension:",
        ...structuralGroups.map(([label, rows]) => `  ${label}: ${formatBucketSummary(bestRow(rows))}`),
        "",
        "Worst-performing bucket per dimension:",
        ...structuralGroups.map(([label, rows]) => `  ${label}: ${formatBucketSummary(worstRow(rows))}`),
        "",
        "EXECUTION FINDINGS",
        `Best penetration bucket: ${formatBucketSummary(bestRow(analytics.penetrationRows))}`,
        `Catastrophic failure rate: ${formatPct(analytics.catastrophicBreach?.breachPct || 0)} (${analytics.catastrophicBreach?.breachCount || 0} hard invalidated)`,
        `Fastest losing bucket: ${formatBucketSummary(fastestLosingRow(analytics.fastStopoutRows))}`,
        `Best distance-before-fill bucket: ${formatBucketSummary(bestRow(analytics.distanceBeforeFillRows))}`,
        "",
        "AUTO-INSIGHTS",
        ...(buildInsights(analytics).map(i => `  [${i.label.toUpperCase()}] ${i.text}`)),
        "",
        "WARNING FLAGS",
        `Low sample buckets: ${analytics.lowSampleBuckets}`,
        `Limited data sections: ${limitedSections.length ? limitedSections.join(", ") : "None"}`,
        `Weak confidence: ${weakConfidence ? "Yes — many buckets are below n<10" : "No"}`,
        "",
        "RESEARCH BACKLOG",
        ...RESEARCH_BACKLOG_ITEMS.map(item => `  - ${item.title} (${item.status})`),
    ];

    return lines.join("\n");
}

// ─── Analytics Builders ───────────────────────────────────────────────────────

function buildOrderBlockAnalytics(trades) {
    const linkedCount   = trades.filter(hasLinkedOb).length;
    const unlinkedCount = trades.length - linkedCount;

    const structureRows          = bucketRows(trades, t => t.structure || "Limited Data", ["BOS", "CHoCH", "Limited Data"]);
    const directionRows          = bucketRows(trades, t => t.direction || "Limited Data", ["Long", "Short", "Limited Data"]);
    const originSessionRows      = bucketRows(trades, originSessionForTrade, SESSION_COLUMNS);
    const creationHourRows       = bucketRows(trades, creationHourLabel);
    const widthRows              = bucketRows(trades, widthBucket, ["0-2 pips", "2-5 pips", "5-10 pips", "10+ pips", "Limited Data"]);
    const ageRows                = bucketRows(trades, ageBucket, ["same session / <4h", "4-12h", "12-24h", "1-3d", "3-7d", "7-14d", "14d+", "Limited Data"]);
    const penetrationRows        = bucketRows(trades, penetrationBucket, ["0–10%", "10–25%", "25–50%", "50–75%", "75–100%", "100%+", "Limited Data"]);
    const fastStopoutRows        = bucketRows(trades, fastStopoutBucket, ["same candle", "<15m", "15–60m", "1–4h", "4h+", "Limited Data"]);
    const distanceBeforeFillRows = bucketRows(trades, distanceBeforeFillBucket, ["0–0.5R", "0.5–1R", "1–2R", "2R+", "Limited Data"]);
    const dayOfWeekRows          = bucketRows(trades, dayOfWeekBucket, DAY_ORDER);

    const allRows = [
        ...structureRows, ...directionRows, ...originSessionRows, ...creationHourRows,
        ...widthRows, ...ageRows, ...penetrationRows, ...fastStopoutRows,
        ...distanceBeforeFillRows, ...dayOfWeekRows,
    ];

    const lowSampleBuckets = allRows.filter(r => r.count > 0 && r.count < LOW_SAMPLE_N).length;
    const usableRows       = allRows.filter(r => r.count > 0 && r.label !== "Limited Data");
    const bestBucket       = usableRows.length ? usableRows.reduce((a, b) => b.netR > a.netR ? b : a) : null;
    const worstBucket      = usableRows.length ? usableRows.reduce((a, b) => b.netR < a.netR ? b : a) : null;

    const sessionMatrix        = buildSessionMatrix(trades);
    const catastrophicBreach   = buildCatastrophicBreach(trades);
    const fieldCompleteness    = buildFieldCompleteness(trades);
    const rollingExpectancy    = buildRollingExpectancy(trades);
    const equityCurves         = buildEquityCurves(trades);

    // Sort by time for failure / winner lab
    const sortedByR = trades
        .filter(t => Number.isFinite(Number(t?.r)))
        .map(t => ({ ...t, ageLabel: ageBucket(t), originSession: originSessionForTrade(t), fillSession: fillSessionForTrade(t) }));

    const worstLosses = [...sortedByR].filter(t => Number(t.r) < 0).sort((a, b) => Number(a.r) - Number(b.r));
    const bestWins    = [...sortedByR].filter(t => Number(t.r) > 0).sort((a, b) => Number(b.r) - Number(a.r));

    return {
        linkedCount, unlinkedCount, lowSampleBuckets, bestBucket, worstBucket,
        structureRows, directionRows, originSessionRows, creationHourRows,
        widthRows, ageRows, penetrationRows, catastrophicBreach,
        fastStopoutRows, distanceBeforeFillRows, dayOfWeekRows,
        sessionMatrix, fieldCompleteness, rollingExpectancy, equityCurves,
        worstLosses, bestWins,
    };
}

function buildCatastrophicBreach(trades) {
    const known    = trades.filter(t => t?.ob_fully_breached === true || t?.ob_fully_breached === false);
    const breached = known.filter(t => t.ob_fully_breached === true);
    const rows = [
        finalizeBucket(breached.reduce((b, t) => { addTradeToBucket(b, t); return b; }, emptyBucket("Hard Invalidated"))),
        finalizeBucket(known.filter(t => !t.ob_fully_breached).reduce((b, t) => { addTradeToBucket(b, t); return b; }, emptyBucket("Not Invalidated"))),
    ];
    if (known.length !== trades.length) {
        rows.push(finalizeBucket(
            trades.filter(t => t?.ob_fully_breached !== true && t?.ob_fully_breached !== false)
                .reduce((b, t) => { addTradeToBucket(b, t); return b; }, emptyBucket("Limited Data"))
        ));
    }
    const breachLosses = breached.map(t => Number(t.r)).filter(r => Number.isFinite(r) && r < 0);
    return {
        rows,
        breachCount: breached.length,
        breachPct:   known.length ? (breached.length / known.length) * 100 : 0,
        avgLoss:     breachLosses.length ? round1(breachLosses.reduce((s, r) => s + r, 0) / breachLosses.length) : null,
    };
}

function buildSessionMatrix(trades) {
    const rows = [], rowSet = new Set(), cells = {};
    trades.forEach(trade => {
        const row = originSessionForTrade(trade);
        const col = fillSessionForTrade(trade);
        const key = `${row}|||${col}`;
        if (!rowSet.has(row)) { rowSet.add(row); rows.push(row); }
        if (!cells[key]) cells[key] = { row, col, netR: 0, count: 0, wins: 0 };
        const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
        cells[key].netR   += r;
        cells[key].count  += 1;
        cells[key].winRate = cells[key].count ? (cells[key].wins / cells[key].count) * 100 : 0;
        if (r > 0 || trade?.outcome === "Win") cells[key].wins += 1;
    });
    // Recompute winRate and expectancy for each cell
    Object.values(cells).forEach(c => {
        c.winRate    = c.count ? (c.wins / c.count) * 100 : 0;
        c.expectancy = c.count ? c.netR / c.count : 0;
    });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    return { rows: rows.length ? rows : ["Unknown"], cells, maxAbs, total: trades.length };
}

function buildFieldCompleteness(trades) {
    if (!trades.length) return [];
    return OB_FIELDS.map(({ key, label }) => {
        const present = trades.filter(t => t?.[key] != null && t[key] !== "").length;
        return { key, label, present, total: trades.length, pct: round1((present / trades.length) * 100) };
    });
}

function buildRollingExpectancy(trades, window = 20) {
    const sorted = trades
        .filter(t => parseDate(t?.entry) && Number.isFinite(Number(t?.r)))
        .sort((a, b) => parseDate(a.entry).getTime() - parseDate(b.entry).getTime());
    if (sorted.length < window) return [];
    const points = [];
    for (let i = window - 1; i < sorted.length; i++) {
        const slice = sorted.slice(i - window + 1, i + 1);
        points.push({ i, exp: slice.reduce((s, t) => s + Number(t.r), 0) / window });
    }
    return points;
}

function buildEquityCurves(trades) {
    const sorted = trades
        .filter(t => parseDate(t?.entry) && Number.isFinite(Number(t?.r)))
        .sort((a, b) => parseDate(a.entry).getTime() - parseDate(b.entry).getTime());
    if (sorted.length < 5) return null;
    const all = [], bos = [], choch = [];
    let cAll = 0, cBos = 0, cChoch = 0;
    sorted.forEach((t, i) => {
        const r = Number(t.r);
        cAll += r;
        all.push({ x: i, y: cAll });
        if (t?.structure === "BOS")   { cBos   += r; bos.push({   x: bos.length,   y: cBos   }); }
        if (t?.structure === "CHoCH") { cChoch += r; choch.push({ x: choch.length, y: cChoch }); }
    });
    return { all, bos, choch };
}

function buildInsights(analytics) {
    const results = [];

    // Structure gap
    const validStructs = analytics.structureRows.filter(r => r.count >= LOW_SAMPLE_N && r.label !== "Limited Data");
    if (validStructs.length >= 2) {
        const sorted = [...validStructs].sort((a, b) => b.expectancy - a.expectancy);
        const gap = round2(sorted[0].expectancy - sorted[sorted.length - 1].expectancy);
        if (gap >= 0.1) {
            results.push({ tone: "primary", label: "Structure Edge", text: `${sorted[0].label} outperforms ${sorted[sorted.length - 1].label} by +${gap}R expectancy · n=${sorted[0].count} vs ${sorted[sorted.length - 1].count}` });
        }
    }

    // Directional asymmetry
    const longRow  = analytics.directionRows.find(r => r.label === "Long");
    const shortRow = analytics.directionRows.find(r => r.label === "Short");
    if (longRow?.count >= LOW_SAMPLE_N && shortRow?.count >= LOW_SAMPLE_N) {
        const diff = longRow.expectancy - shortRow.expectancy;
        if (Math.abs(diff) >= 0.15) {
            const better = diff > 0 ? "Long" : "Short";
            results.push({ tone: "secondary", label: "Directional Asymmetry", text: `${better} OBs outperform by +${round2(Math.abs(diff))}R expectancy — consider filtering to ${better} direction only` });
        }
    }

    // Best session matrix cell
    const matrixCells = Object.values(analytics.sessionMatrix.cells).filter(c => c.count >= LOW_SAMPLE_N);
    if (matrixCells.length) {
        const best = matrixCells.reduce((a, b) => b.netR > a.netR ? b : a);
        if (best.netR > 0.5) {
            results.push({ tone: "primary", label: "Best Session Flow", text: `${best.row} → ${best.col} is your top session combination: ${formatR(best.netR)} over ${best.count} trades` });
        }
    }

    // Catastrophic breach warning
    if (analytics.catastrophicBreach.breachPct > 30 && analytics.catastrophicBreach.breachCount >= 5) {
        results.push({ tone: "danger", label: "High Breach Rate", text: `${formatPct(analytics.catastrophicBreach.breachPct)} of OBs fully breached before exit — avg hard-invalidation loss: ${analytics.catastrophicBreach.avgLoss != null ? formatR(analytics.catastrophicBreach.avgLoss) : "—"}` });
    }

    // Day of week standout
    const validDays = analytics.dayOfWeekRows.filter(r => r.count >= LOW_SAMPLE_N && r.label !== "Limited Data");
    if (validDays.length >= 2) {
        const bestDay = validDays.reduce((a, b) => b.expectancy > a.expectancy ? b : a);
        if (bestDay.expectancy > 0.2) {
            results.push({ tone: "success", label: "Day-of-Week Edge", text: `${bestDay.label} is your strongest day: ${formatSigned(round3(bestDay.expectancy))}R expectancy · WR ${formatPct(bestDay.winRate)} · n=${bestDay.count}` });
        }
    }

    return results.slice(0, 4);
}

// ─── Bucket Infrastructure ────────────────────────────────────────────────────

function emptyBucket(label) {
    return { label, count: 0, wins: 0, losses: 0, netR: 0, sumWinR: 0, sumLossR: 0, rValues: [], outcomes: [], tradeRefs: [] };
}

function addTradeToBucket(bucket, trade) {
    const r     = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
    const isWin = r > 0 || trade?.outcome === "Win";
    const isLoss = r < 0 || trade?.outcome === "Loss";
    bucket.count  += 1;
    bucket.netR   += r;
    bucket.rValues.push(r);
    bucket.outcomes.push(isWin);
    bucket.tradeRefs.push(trade);
    if (isWin)  { bucket.wins   += 1; bucket.sumWinR  += r; }
    if (isLoss) { bucket.losses += 1; bucket.sumLossR += Math.abs(r); }
}

function finalizeBucket(bucket) {
    const n          = bucket.count;
    const expectancy = n ? bucket.netR / n : 0;
    const winRate    = n ? (bucket.wins / n) * 100 : 0;

    // Profit factor
    const pf = bucket.sumLossR > 0
        ? round2(bucket.sumWinR / bucket.sumLossR)
        : (bucket.sumWinR > 0 ? null : 0);  // null = infinite (no losses)

    // 95% CI on expectancy (t-based)
    let ciLo = null, ciHi = null;
    if (n >= 4) {
        const mean     = expectancy;
        const variance = bucket.rValues.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(n - 1, 1);
        const se       = Math.sqrt(variance / n);
        const tCrit    = n >= 30 ? 1.96 : n >= 20 ? 2.09 : n >= 10 ? 2.26 : 2.57;
        ciLo = round3(mean - tCrit * se);
        ciHi = round3(mean + tCrit * se);
    }

    // Streak stats
    let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
    for (const w of bucket.outcomes) {
        if (w) { curWin++; curLoss = 0; maxWinStreak  = Math.max(maxWinStreak,  curWin);  }
        else   { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
    }

    return {
        label: bucket.label, count: n, wins: bucket.wins, losses: bucket.losses,
        netR: round1(bucket.netR), winRate, expectancy,
        profitFactor: pf, ciLo, ciHi,
        maxWinStreak, maxLossStreak,
        tradeRefs: bucket.tradeRefs,
    };
}

function bucketRows(trades, labelFn, preferredOrder = null) {
    const buckets = {};
    trades.forEach(trade => {
        const label = labelFn(trade) || "Limited Data";
        if (!buckets[label]) buckets[label] = emptyBucket(label);
        addTradeToBucket(buckets[label], trade);
    });
    const rows = Object.values(buckets).map(finalizeBucket);
    if (!preferredOrder) return rows.sort((a, b) => b.count - a.count || b.netR - a.netR);
    const ordered = preferredOrder.map(label => finalizeBucket(buckets[label] || emptyBucket(label)));
    const extras  = rows.filter(r => !preferredOrder.includes(r.label));
    return [...ordered, ...extras];
}

// ─── Filter Function ──────────────────────────────────────────────────────────

function applyFilters(trades, filters) {
    return trades.filter(trade => {
        if (filters.structure !== "all" && (trade?.structure || "") !== filters.structure) return false;
        if (filters.direction !== "all" && (trade?.direction || "") !== filters.direction) return false;
        if (filters.session   !== "all" && originSessionForTrade(trade) !== filters.session) return false;
        return true;
    });
}

// ─── Bucket Label Functions ───────────────────────────────────────────────────

function creationHourLabel(trade) {
    const d = parseDate(trade?.obOriginTime || trade?.obDetectionTime);
    return d ? `${String(d.getUTCHours()).padStart(2, "0")}:00 UTC` : "Limited Data";
}

function widthBucket(trade) {
    const v = Number(trade?.obWidthPips);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 2)  return "0-2 pips";
    if (v < 5)  return "2-5 pips";
    if (v < 10) return "5-10 pips";
    return "10+ pips";
}

function ageBucket(trade) {
    const hours = ageHours(trade);
    if (hours == null) return "Limited Data";
    if (hours < 4)   return "same session / <4h";
    if (hours < 12)  return "4-12h";
    if (hours < 24)  return "12-24h";
    if (hours < 72)  return "1-3d";
    if (hours < 168) return "3-7d";
    if (hours < 336) return "7-14d";
    return "14d+";
}

function penetrationBucket(trade) {
    const v = Number(trade?.max_ob_penetration_pct);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 10)  return "0–10%";
    if (v < 25)  return "10–25%";
    if (v < 50)  return "25–50%";
    if (v < 75)  return "50–75%";
    if (v < 100) return "75–100%";
    return "100%+";
}

function fastStopoutBucket(trade) {
    if (trade?.same_candle_exit === true) return "same candle";
    const minutes = Number(trade?.minutes_to_exit);
    if (!Number.isFinite(minutes)) return "Limited Data";
    if (minutes < 15)  return "<15m";
    if (minutes < 60)  return "15–60m";
    if (minutes < 240) return "1–4h";
    return "4h+";
}

function distanceBeforeFillBucket(trade) {
    const v = Number(trade?.max_distance_away_before_fill_r);
    if (!Number.isFinite(v)) return "Limited Data";
    if (v < 0.5) return "0–0.5R";
    if (v < 1)   return "0.5–1R";
    if (v < 2)   return "1–2R";
    return "2R+";
}

function dayOfWeekBucket(trade) {
    const d = parseDate(trade?.entry || trade?.obOriginTime);
    if (!d) return "Limited Data";
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

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
    const text  = String(value).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("lull"))                          return "London Lull";
    if (lower.includes("london"))                        return "London";
    if (lower.includes("new") || lower === "ny")         return "New York";
    if (lower.includes("asia") || lower.includes("tokyo")) return "Asia";
    if (lower.includes("outside"))                       return "Outside";
    if (lower === "unknown" || lower === "—")            return "Unknown";
    return text;
}

function deriveSessionFromTimestamp(value) {
    const d = parseDate(value);
    if (!d) return null;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7)   return "Asia";
    if (hour >= 7 && hour < 10)  return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

// ─── Report Helpers ───────────────────────────────────────────────────────────

function bestRow(rows) {
    return rows.filter(isUsableBucket).reduce((acc, row) => (!acc || row.netR > acc.netR ? row : acc), null);
}

function worstRow(rows) {
    return rows.filter(isUsableBucket).reduce((acc, row) => (!acc || row.netR < acc.netR ? row : acc), null);
}

function fastestLosingRow(rows) {
    return rows.find(row => isUsableBucket(row) && row.netR < 0) || worstRow(rows);
}

function isUsableBucket(row) {
    return row && row.count > 0 && row.label !== "Limited Data";
}

function hasLimitedData(rows) {
    return rows.some(row => row.label === "Limited Data" && row.count > 0);
}

function formatBucketSummary(row) {
    if (!row) return "Limited Data";
    const ci = row.ciLo != null ? ` · CI [${row.ciLo > 0 ? "+" : ""}${row.ciLo}, ${row.ciHi > 0 ? "+" : ""}${row.ciHi}]` : "";
    return `${row.label} · n=${row.count} · WR ${formatPct(row.winRate)} · Net ${formatR(row.netR)} · Exp ${formatSigned(round3(row.expectancy))}R · PF ${row.profitFactor != null ? row.profitFactor.toFixed(2) : "∞"}${ci}`;
}

function hasLinkedOb(trade) {
    return !!(trade?.obId || trade?.obOriginTime || trade?.obDetectionTime || trade?.obTop != null || trade?.obBottom != null || trade?.obWidthPips != null);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function ageHours(trade) {
    const from = parseDate(trade?.obDetectionTime || trade?.obOriginTime);
    const to   = parseDate(trade?.entry);
    if (!from || !to) return null;
    const hours = (to.getTime() - from.getTime()) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function parseDate(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

function variantLabel(v) {
    return { single_position: "Single position", allow_multi_position: "Allow multi", one_per_direction: "One per direction", unknown: "Trades" }[v] || v || "N/A";
}

function variantShort(v) {
    return { single_position: "Single", allow_multi_position: "Multi", one_per_direction: "Per Dir", unknown: "Trades" }[v] || "N/A";
}

function round1(value) { return Number((Number(value) || 0).toFixed(1)); }
function round2(value) { return Number((Number(value) || 0).toFixed(2)); }
function round3(value) { return Number((Number(value) || 0).toFixed(3)); }

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
