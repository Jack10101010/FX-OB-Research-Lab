import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { HeroBadge, NeonSelect, Segment } from "@/components/lab/controls";
import { LabRunHero } from "@/components/lab/LabRunHero";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
import { RunConfigStrip } from "@/components/lab/RunConfigStrip";
import { useDataset } from "@/data/store";
import { setSelectedTradeVariant, getTradeUniverse } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { useResultsLens } from "@/data/useResultsLens";
import { OBLabTabShell } from "@/components/lab/OBLabTabShell";
// Phase OB-RETEST-1 — frontend-derived OB retest analysis (new tab).
import { RetestLabTab } from "@/components/lab/retest/RetestLabTab";
// Phase RB-4 — all OrderBlockLab bucket tables route through the shared
// basis-aware CanonicalBucketTable (frozen RB-3.2 contract).
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
// Phase TC-1 — inline Table Compare pilot (Structure Quality only).
import { TableCompareShell } from "@/components/lab/TableCompareShell";
// Phase TC-6 — Edge Explorer foundation (drill-through trade table). Pilot: Structure Quality.
import { EdgeExplorerPanel } from "@/components/lab/EdgeExplorerPanel";
import { createDrillPayload } from "@/data/drillContract";
import {
    AlertTriangle, Boxes, Clipboard, FileText,
    TrendingUp, TrendingDown, X, Filter,
    Database, Target, SlidersHorizontal, Clock,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_SAMPLE_N = 10;
const SESSION_COLUMNS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Limited Data"];
const FILTER_DEFAULTS = { structure: "all", direction: "all", session: "all" };

// Phase TC-1/TC-2 — shared inline-compare metric set for the Tier-1 bucket
// tables (Structure Quality, Direction, Origin Session). Module-level constant
// so the prop identity is stable across renders.
const TC_COMPARE_METRICS = ["netR", "winRate", "expectancy", "profitFactor", "count"];

const OB_FIELDS = [
    { key: "obId",                              label: "OB ID" },
    { key: "obOriginTime",                      label: "Origin Time" },
    { key: "obDetectionTime",                   label: "Detection Time" },
    { key: "obTop",                             label: "OB Top" },
    { key: "obBottom",                          label: "OB Bottom" },
    { key: "obWidthPips",                       label: "OB Width (pips)" },
    { key: "max_ob_penetration_pct",            label: "Max Penetration %" },
    { key: "ob_fully_breached",                 label: "Breach Flag" },
    { key: "obCreatedDuringNews",               label: "News Origin Window" },
    { key: "obDetectedDuringNews",              label: "News Detection Window" },
    { key: "obOriginMinutesFromNews",           label: "Origin Minutes From News" },
    { key: "obDetectionMinutesFromNews",        label: "Detection Minutes From News" },
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

// Local OBLabUniverseBadge + OBLabBadgeCell removed in Phase 2F — replaced
// by the shared @/components/lab/TradeUniverseBadge component.

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderBlockLab() {
    const { ACTIVE_PROJECT, ACTIVE_RUN, ACTIVE_TRADE_VARIANT, AVAILABLE_TRADE_VARIANTS, activeRunId, runs } = useDataset();
    const universe = useTradeUniverse();
    const lens = useResultsLens(); // TC-6/EDGE-2 — basis/account context for Edge Explorer drill payloads
    // Phase 2G — universeWarnings filtering moved into TradeUniverseBadge.

    // Tab state — persisted to localStorage
    const [activeTab, setActiveTab] = React.useState(() => {
        try { return localStorage.getItem("oblab-active-tab-v1") || "model-analysis"; }
        catch { return "model-analysis"; }
    });

    const handleTabChange = React.useCallback((key) => {
        setActiveTab(key);
        try { localStorage.setItem("oblab-active-tab-v1", key); } catch {}
    }, []);

    // Filter state — persisted to localStorage
    const [filters, setFilters] = React.useState(() => {
        try { return { ...FILTER_DEFAULTS, ...JSON.parse(localStorage.getItem("oblab-filters") || "{}") }; }
        catch { return FILTER_DEFAULTS; }
    });

    const [edgeDrill, setEdgeDrill] = React.useState(null);   // Edge Explorer drill payload
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

    const trades = universe.trades;
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const orderBlocks = React.useMemo(() => (Array.isArray(activeRun?.orderBlocks) ? activeRun.orderBlocks : []), [activeRun]);
    const filteredTrades = React.useMemo(() => applyFilters(trades, filters), [trades, filters]);
    const analytics = React.useMemo(() => buildOrderBlockAnalytics(filteredTrades), [filteredTrades]);
    const obPopulationAnalytics = React.useMemo(() => buildNewsCreatedObPopulationAnalytics(orderBlocks, trades), [orderBlocks, trades]);
    const insights = React.useMemo(() => buildInsights(analytics), [analytics]);

    const activeFilterCount = Object.values(filters).filter(v => v !== "all").length;
    const isFiltered = activeFilterCount > 0;

    const reportText = React.useMemo(
        () => buildResearchReport({ run: ACTIVE_RUN, variant: ACTIVE_TRADE_VARIANT, analytics, filters }),
        [ACTIVE_RUN, ACTIVE_TRADE_VARIANT, analytics, filters],
    );

    // Edge Explorer drill — builds a
    // canonical drill payload via the SHARED drillContract (no second drill
    // system) and enriches each trade with its origin session for display.
    const handleEdgeDrill = React.useCallback((dimension, row) => {
        if (!row?.tradeRefs?.length) return;
        const payload = createDrillPayload({
            runId: activeRunId,
            universeKey: universe?.sourceKey,
            basis: lens.basis,
            account: lens.accountSettings,
            bucketKey: row.label,
            label: `${dimension} · ${row.label}`,
            // Enrich with the canonical OBL derivations so Edge Explorer's
            // Origin / Fill / Age columns are accurate (panel reads these fields).
            tradeRefs: row.tradeRefs.map((t) => ({
                ...t,
                originSession: originSessionForTrade(t),
                fillSession: fillSessionForTrade(t),
                ageLabel: ageBucket(t),
            })),
        });
        setEdgeDrill(payload);
    }, [activeRunId, universe, lens.basis, lens.accountSettings]);

    // Phase TC-2 — tiny LOCAL helper (OrderBlockLab-only) that produces the
    // shared TableCompareShell props for a Tier-1 bucket table. Side B is
    // resolved under the SAME scenario (getTradeUniverse) and the SAME page
    // filters as Side A, and rebuilt with the SAME bucketRows builder, so both
    // sides are identical math. Not a global abstraction — just deduplication.
    const compareProps = React.useCallback((defKey) => ({
        currentTrades: filteredTrades,
        currentUniverse: universe,
        renderers: OBL_BUCKET_RENDERERS,
        metrics: TC_COMPARE_METRICS,
        resolveCompared: (runId) => {
            const u = getTradeUniverse(runId);
            return { trades: applyFilters(u?.trades || [], filters), universe: u };
        },
        buildRows: (t) => {
            const def = analytics.bucketDefs?.[defKey];
            return def ? bucketRows(t, def.labelFn, def.order) : [];
        },
    }), [filteredTrades, universe, filters, analytics]);

    // ── Tab content definitions ───────────────────────────────────────────────
    // Workflow-based tabs mirroring the Entries Research Workspace pattern.
    // Each tab answers a distinct researcher question rather than grouping
    // by data category.

    // Persistent header — LabRunHero + RunConfigStrip + TradeUniverseBadge only.
    // KPI chips and InsightCallouts belong in Tab 1 (Model Analysis) where they
    // serve as the verdict surface, not in the always-visible navigation band.
    // RESEARCH-RESULT-VIEW-BANNER: the Universe / Model context now lives in the wide
    // ResearchResultViewBanner rendered below the hero (see tabHeader). The hero keeps
    // only the RunConfigButton affordance, so we never stack duplicate result-view context.
    const headerConfigNode = activeRunId ? (
        <RunConfigButton run={activeRun} />
    ) : null;

    const tabHeader = (
        <>
            <LabRunHero
                pageLabel="Order Block Lab"
                titleFallback="Order Block Lab"
                description={headerConfigNode}
                activeProject={ACTIVE_PROJECT}
                activeRun={activeRun}
                activeSummary={ACTIVE_RUN}
                activeRunId={activeRunId}
                tradeCount={trades.length}
                variant={ACTIVE_TRADE_VARIANT}
                showDefaultStatusBadges={false}
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => setReportOpen(true)}
                            className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.10)] px-3 py-1.5 text-[12px] font-medium text-[hsl(var(--accent-primary))] transition-colors hover:bg-[hsl(var(--accent-primary)/0.16)]"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Generate Report
                        </button>
                        <VariantSelector variants={AVAILABLE_TRADE_VARIANTS} value={ACTIVE_TRADE_VARIANT} />
                    </>
                )}
            />
            {activeRunId && universe && (
                <div className="px-6 -mt-2 mb-3">
                    <ResearchResultViewBanner universe={universe} run={buildBannerRunIdentity(activeRun)} />
                </div>
            )}
        </>
    );

    // FilterBar — rendered by OBLabTabShell between the sticky tab bar and tab
    // content; applies globally across all tabs.
    const filterBarNode = (
        <FilterBar
            filters={filters}
            onUpdate={updateFilter}
            onClear={clearFilters}
            totalTrades={trades.length}
            filteredCount={filteredTrades.length}
        />
    );

    // ── Tab 1: Model Analysis ─────────────────────────────────────────────────
    // Goal: "Does this OB model produce edge? Which structural slice carries it?"
    // Primary decision surface — complete verdict in a single tab.
    const tabModelAnalysis = (
        <div className="px-6 mt-4 space-y-4">
            {/* KPI strip — verdict numbers */}
            <div className="kpi-strip">
                <MetricChip label="Linked Trades" value={String(analytics.linkedCount)} sub="with OB data" tone="primary" icon={Boxes} />
                <MetricChip label="Unlinked Trades" value={String(analytics.unlinkedCount)} sub="limited OB research" tone={analytics.unlinkedCount ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Best Bucket" value={analytics.bestBucket ? formatR(analytics.bestBucket.netR) : "—"} sub={analytics.bestBucket?.label || "Limited Data"} tone="primary" icon={TrendingUp} />
                <MetricChip label="Worst Bucket" value={analytics.worstBucket ? formatR(analytics.worstBucket.netR) : "—"} sub={analytics.worstBucket?.label || "Limited Data"} tone={analytics.worstBucket?.netR < 0 ? "danger" : "muted"} icon={TrendingDown} />
                <MetricChip label="Best Session" value={analytics.bestSession ? formatR(analytics.bestSession.netR) : "—"} sub={analytics.bestSession?.label || "No data"} tone="primary" icon={Clock} />
                <MetricChip label="Worst Session" value={analytics.worstSession ? formatR(analytics.worstSession.netR) : "—"} sub={analytics.worstSession?.label || "No data"} tone={analytics.worstSession?.netR < 0 ? "danger" : "muted"} icon={Clock} />
            </div>

            {/* Auto-generated insights */}
            {insights.length > 0 && <InsightCallouts insights={insights} />}


            {/* Structural Quality + Session Performance — 2×2 grid.
                Row 1: BOS vs CHoCH · Long vs Short (structure type verdict)
                Row 2: Origin Session · Created/Detection Session (session breakdown)
                Controls (heatmap, compare, basis) hidden behind a popover icon to
                reduce header clutter on laptop-width viewports. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <TableCompareShell
                    testId="oblab-structural-quality-bos-vs-choch"
                    eyebrow="Structural Quality"
                    title="BOS vs CHoCH"
                    currentRows={analytics.structureRows}
                    bucketDef={analytics.bucketDefs.structure}
                    onDrill={r => handleEdgeDrill("Structure", r)}
                    hideResultsBasis
                    hideChip
                    basisFooter
                    controlsPopover
                    {...compareProps("structure")}
                />
                <TableCompareShell
                    testId="oblab-structural-quality-long-vs-short"
                    eyebrow="Structural Quality"
                    title="Long vs Short"
                    currentRows={analytics.directionRows}
                    bucketDef={analytics.bucketDefs.direction}
                    onDrill={r => handleEdgeDrill("Direction", r)}
                    hideResultsBasis
                    hideChip
                    basisFooter
                    controlsPopover
                    {...compareProps("direction")}
                />
                <TableCompareShell
                    testId="oblab-origin-session-performance"
                    eyebrow="Session Performance"
                    title="Origin Session"
                    currentRows={analytics.originSessionRows}
                    bucketDef={analytics.bucketDefs.originSession}
                    onDrill={r => handleEdgeDrill("Origin Session", r)}
                    hideResultsBasis
                    hideChip
                    basisFooter
                    controlsPopover
                    {...compareProps("originSession")}
                />
                {/* Created Session — groups trades by the session in which the OB
                    was detected (obDetectionTime). Distinct from Origin Session which
                    uses obOriginSession / obOriginTime. Shows unavailable state when
                    obDetectionTime is absent from the run. */}
                {analytics.detectionFieldAvailable ? (
                    <TableCompareShell
                        testId="oblab-created-session-performance"
                        eyebrow="Session Performance"
                        title="Created Session"
                        currentRows={analytics.createdSessionRows}
                        bucketDef={analytics.bucketDefs.createdSession}
                        onDrill={r => handleEdgeDrill("Created Session", r)}
                        hideResultsBasis
                        hideChip
                        basisFooter
                        controlsPopover
                        {...compareProps("createdSession")}
                    />
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <NeonPanel
                            title={(
                                <span className="flex flex-col leading-none gap-0.5">
                                    <span className="text-[9px] font-ui tracking-widest text-[hsl(var(--text-muted))] normal-case opacity-75">Session Performance</span>
                                    <span>Created Session</span>
                                </span>
                            )}
                            action={<Pill tone="muted">UNAVAILABLE</Pill>}
                        >
                            <p className="py-5 text-center text-[11.5px] text-muted-lab">
                                Created session data unavailable —{" "}
                                <span className="font-code text-[10.5px] text-[hsl(var(--text-2))]">obDetectionTime</span>{" "}
                                not present in this run.
                            </p>
                        </NeonPanel>
                    </div>
                )}
            </div>

            {/* Timing breakdowns */}
            <CanonicalBucketTable
                testId="oblab-ob-creation-hour-performance"
                title="OB Creation Hour Performance"
                rawRows={analytics.creationHourRows}
                trades={filteredTrades}
                def={analytics.bucketDefs.creationHour}
                renderers={OBL_BUCKET_RENDERERS}
                onDrill={r => handleEdgeDrill("Creation Hour", r)}
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
            />
            <TableCompareShell
                testId="oblab-day-of-week-performance"
                title="Day of Week Performance"
                currentRows={analytics.dayOfWeekRows}
                bucketDef={analytics.bucketDefs.dayOfWeek}
                onDrill={r => handleEdgeDrill("Day of Week", r)}
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("dayOfWeek")}
            />
        </div>
    );

    // ── Tab 2: Edge Discovery ─────────────────────────────────────────────────
    // Goal: "What OB characteristics define the winning setup? Build a filter profile."
    // All sections answer: "what kind of OB should I be targeting?"
    const tabEdgeDiscovery = (
        <div className="px-6 mt-4 space-y-4">
            <TableCompareShell
                testId="oblab-ob-width-analysis"
                title="OB Width Analysis"
                currentRows={analytics.widthRows}
                bucketDef={analytics.bucketDefs.width}
                onDrill={r => handleEdgeDrill("OB Width", r)}
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("width")}
            />
            <TableCompareShell
                testId="oblab-ob-age-time-to-fill"
                title="OB Age / Time-to-Fill"
                currentRows={analytics.ageRows}
                bucketDef={analytics.bucketDefs.age}
                onDrill={r => handleEdgeDrill("OB Age", r)}
                compact
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("age")}
            />
            <TableCompareShell
                testId="oblab-penetration-depth-analysis"
                title="Penetration Depth Analysis"
                currentRows={analytics.penetrationRows}
                bucketDef={analytics.bucketDefs.penetration}
                onDrill={r => handleEdgeDrill("Penetration Depth", r)}
                compact
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("penetration")}
            />
            {/* Session Matrix — where do OBs form vs where do they fill? */}
            <SessionMatrix matrix={analytics.sessionMatrix} />
            {/* News OB panels — collapsed by default; relevant when investigating
                whether news proximity is a characteristic to filter on */}
            <NewsCreatedObPanel
                analytics={analytics}
                onDrill={r => handleEdgeDrill("News-Created OB Trades", r)}
            />
            <NewsCreatedObPopulationPanel
                analysis={obPopulationAnalytics}
            />
        </div>
    );

    // ── Tab 3: Failure Lab ────────────────────────────────────────────────────
    // Goal: "What breaks this model? Where is the loss concentration?"
    // FailureLab is first — it is the primary section on this tab.
    const tabFailureLab = (
        <div className="px-6 mt-4 space-y-4">
            <FailureLab losses={analytics.worstLosses} wins={analytics.bestWins} />
            <CatastrophicBreachPanel analysis={analytics.catastrophicBreach} onDrill={handleEdgeDrill} />
            <TableCompareShell
                testId="oblab-fast-stopout-analysis"
                title="Fast Stopout Analysis"
                currentRows={analytics.fastStopoutRows}
                bucketDef={analytics.bucketDefs.fastStopout}
                onDrill={r => handleEdgeDrill("Fast Stopout", r)}
                compact
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("fastStopout")}
            />
            <TableCompareShell
                testId="oblab-distance-before-fill"
                title="Distance Before Fill"
                currentRows={analytics.distanceBeforeFillRows}
                bucketDef={analytics.bucketDefs.distanceBeforeFill}
                onDrill={r => handleEdgeDrill("Distance Before Fill", r)}
                compact
                hideResultsBasis
                hideChip
                basisFooter
                controlsPopover
                {...compareProps("distanceBeforeFill")}
            />
        </div>
    );

    // ── Tab 4: Robustness ─────────────────────────────────────────────────────
    // Goal: "Is this edge stable across time? Is the data trustworthy?"
    // TemporalAnalytics is the primary section — expanded by default here.
    const tabRobustness = (
        <div className="px-6 mt-4 space-y-4">
            <TemporalAnalytics
                rollingExpectancy={analytics.rollingExpectancy}
                equityCurves={analytics.equityCurves}
            />
            <FieldCompletenessPanel rows={analytics.fieldCompleteness} totalTrades={filteredTrades.length} />
            <ResearchBacklog />
        </div>
    );

    // ── Tab 5: Promotion Desk (placeholder) ───────────────────────────────────
    // Goal: "What parameter changes am I committing to? Structured decision record."
    // Full Promotion Desk system not yet built — placeholder shown for tab
    // consistency with Entries Research Workspace.
    const tabPromotion = (
        <div className="px-6 mt-4">
            <NeonPanel
                title="Promotion Desk"
                action={<Pill tone="muted">COMING SOON</Pill>}
            >
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="text-[13px] font-ui text-[hsl(var(--text-2))]">
                        Promotion Desk is under construction.
                    </div>
                    <div className="text-[11px] text-muted-lab max-w-sm leading-relaxed">
                        This tab will provide a structured decision surface for committing to
                        parameter changes and filter refinements based on evidence from
                        Model Analysis, Edge Discovery, and Failure Lab.
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-lg">
                        {[
                            "Decision cards · approve / reject / watch",
                            "Auto-populated evidence brief from analytics",
                            "Export decisions to research report",
                        ].map(item => (
                            <div key={item} className="clip-bevel-sm border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.3)] px-3 py-2 text-[10.5px] text-muted-lab">
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            </NeonPanel>
        </div>
    );

    // ── Tab 6: Retest Lab ─────────────────────────────────────────────────────
    // Frontend-derived OB retest analysis (Phase 1). Gated on candle availability;
    // all logic lives in data/obRetest.js. `enabled` defers candle load until the
    // tab is active so unopened tabs never fetch ~25k candles.
    const tabRetestLab = (
        <RetestLabTab
            orderBlocks={orderBlocks}
            trades={trades}
            activeRun={activeRun}
            activeRunId={activeRunId}
            enabled={activeTab === "retest-lab"}
        />
    );

    const TABS = [
        { key: "model-analysis", label: "Model Analysis",  short: "Analysis",   content: tabModelAnalysis   },
        { key: "edge-discovery", label: "Edge Discovery",  short: "Discovery",  content: tabEdgeDiscovery   },
        { key: "failure-lab",    label: "Failure Lab",     short: "Failures",   content: tabFailureLab      },
        { key: "robustness",     label: "Robustness",      short: "Robustness", content: tabRobustness      },
        { key: "promotion",      label: "Promotion Desk",  short: "Promotion",  content: tabPromotion       },
        { key: "retest-lab",     label: "Retest Lab",      short: "Retest",     content: tabRetestLab       },
    ];

    return (
        <div className="pb-16">
            <OBLabTabShell
                header={tabHeader}
                filterBar={filterBarNode}
                tabs={TABS}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                hasActiveFilters={isFiltered}
            />

            {edgeDrill && (
                <EdgeExplorerPanel
                    payload={edgeDrill}
                    onClose={() => setEdgeDrill(null)}
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
                <div className="flex items-center gap-2 text-[10px] font-ui uppercase tracking-[0.18em] text-[hsl(var(--accent-primary))]">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Research Filter</span>
                    {isFiltered && (
                        <span className="ml-1 px-1.5 py-0.5 bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))] rounded text-[9px]">
                            {filteredCount}/{totalTrades} trades
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui text-muted-lab uppercase tracking-wider">Structure</span>
                    <Segment options={STRUCT_OPTS} value={filters.structure} onChange={v => onUpdate("structure", v)} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui text-muted-lab uppercase tracking-wider">Direction</span>
                    <Segment options={DIR_OPTS} value={filters.direction} onChange={v => onUpdate("direction", v)} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-ui text-muted-lab uppercase tracking-wider">OB Origin</span>
                    <Segment options={SESSION_OPTS} value={filters.session} onChange={v => onUpdate("session", v)} />
                </div>
                {isFiltered && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="ml-auto clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-2.5 py-1.5 text-[10px] font-ui uppercase tracking-wider text-muted-lab hover:text-white transition-colors inline-flex items-center gap-1.5"
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
        <div className="px-6 mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {insights.map((insight, i) => {
                const t = toneMap[insight.tone] || toneMap.primary;
                return (
                    <div
                        key={i}
                        className="clip-bevel-sm border-l-2 px-4 py-4"
                        style={{ borderLeftColor: t.border, borderTop: "1px solid hsl(var(--border-soft))", borderRight: "1px solid hsl(var(--border-soft))", borderBottom: "1px solid hsl(var(--border-soft))", background: t.bg }}
                    >
                        <div className={`text-[10px] font-ui uppercase tracking-[0.18em] mb-2 ${t.label}`}>{insight.label}</div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{insight.text}</div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Bucket tables ────────────────────────────────────────────────────────────
// All OrderBlockLab bucket tables now render through the shared
// CanonicalBucketTable (Phase RB-4). The former local BucketPanel/BUCKET_COLUMNS
// were retired in that migration; OBL-specific cell styling lives in
// OBL_BUCKET_RENDERERS above.

// ─── Bucket renderers shared with CanonicalBucketTable (Phase RB-4) ───────────
// All OrderBlockLab bucket tables render through the shared CanonicalBucketTable
// (frozen RB-3.2 contract). These OBL-styled cell renderers (tier badge label,
// PF coloring, CI bracket) are injected so the look is preserved; everything
// else uses the table's built-in renderers. Raw R metrics are unchanged; only
// WR is recomputed to the canonical wins/(wins+losses).
const OBL_BUCKET_RENDERERS = {
    label: (r) => <BucketLabel row={r} />,
    pf: (r) => <PFCell value={r.profitFactor} />,
    ci: (r) => <CICell lo={r.ciLo} hi={r.ciHi} />,
};

const NEWS_OB_COLUMNS = [
    { key: "label",               label: "Bucket",     sortable: false, render: (r) => <BucketLabel row={r} /> },
    { key: "count",               label: "N",          align: "right" },
    { key: "winRate",             label: "WR",         align: "right", render: (r) => formatPct(r.winRate) },
    { key: "lossRate",            label: "Loss",       align: "right", render: (r) => formatPct(r.lossRate) },
    { key: "netR",                label: "Net R",      align: "right", render: (r) => <ColoredR value={round1(r.netR)} /> },
    { key: "expectancy",          label: "Exp",        align: "right", render: (r) => <span className={r.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>{formatSigned(round3(r.expectancy))}R</span> },
    { key: "fullBreachRate",      label: "Breach",     align: "right", render: (r) => formatPct(r.fullBreachRate) },
    { key: "avgPenetrationPct",   label: "Avg Pen",    align: "right", render: (r) => r.avgPenetrationPct == null ? "—" : `${round1(r.avgPenetrationPct)}%` },
    { key: "avgAgeHours",         label: "Avg Age",    align: "right", render: (r) => formatAgeHours(r.avgAgeHours) },
    { key: "directionSplit",      label: "L/S",        align: "right", render: (r) => `${r.longCount || 0}/${r.shortCount || 0}` },
];

function NewsCreatedObPanel({ analytics, onDrill, defaultCollapsed = false }) {
    if (!analytics.newsFieldAvailable) {
        return (
            <NeonPanel
                title="News-Created OB Trade Performance"
                action={<Pill tone="muted">REIMPORT REQUIRED</Pill>}
            >
                <div className="text-[12px] text-muted-lab">
                    Trade-level news analytics require rerun/reimport with news-created OB tagging enabled.
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            title="News-Created OB Trade Performance"
            action={<Pill tone="warning">{analytics.newsCreatedTaggedCount} TAGGED</Pill>}
        >
            <div className="mb-3 text-[10.5px] text-muted-lab">
                Executed trades only. Use the population panel below for all detected OBs.
            </div>
            {analytics.newsComparison && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    <MetricChip
                        label="News-Created"
                        value={formatR(analytics.newsComparison.news.netR)}
                        sub={`WR ${formatPct(analytics.newsComparison.news.winRate)} · Exp ${formatSigned(round3(analytics.newsComparison.news.expectancy))}R`}
                        tone={analytics.newsComparison.news.expectancy >= 0 ? "primary" : "danger"}
                        icon={AlertTriangle}
                    />
                    <MetricChip
                        label="Normal OBs"
                        value={formatR(analytics.newsComparison.normal.netR)}
                        sub={`WR ${formatPct(analytics.newsComparison.normal.winRate)} · Exp ${formatSigned(round3(analytics.newsComparison.normal.expectancy))}R`}
                        tone={analytics.newsComparison.normal.expectancy >= 0 ? "primary" : "secondary"}
                        icon={Target}
                    />
                </div>
            )}
            <DataTable
                testId="oblab-news-created-order-blocks"
                maxHeight={320}
                columns={NEWS_OB_COLUMNS}
                rows={analytics.newsCreatedRows}
                onRowClick={r => onDrill && r?.tradeRefs?.length && onDrill(r)}
                defaultSortKey="expectancy"
                defaultSortDir="asc"
            />
        </NeonPanel>
    );
}

const OB_POPULATION_COLUMNS = [
    { key: "label",             label: "OB Cohort",     sortable: false, render: (r) => <BucketLabel row={r} /> },
    { key: "count",             label: "OB Count",      align: "right" },
    { key: "fillRate",          label: "Fill Rate",     align: "right", render: (r) => formatPct(r.fillRate) },
    { key: "winRate",           label: "Linked Win %",  align: "right", render: (r) => r.linkedCount ? formatPct(r.winRate) : "—" },
    { key: "lossRate",          label: "Linked Loss %", align: "right", render: (r) => r.linkedCount ? formatPct(r.lossRate) : "—" },
    { key: "invalidationRate",  label: "Invalidated",   align: "right", render: (r) => formatPct(r.invalidationRate) },
    { key: "unfilledRate",      label: "Unfilled",      align: "right", render: (r) => formatPct(r.unfilledRate) },
    { key: "cancelledRate",     label: "Cancelled",     align: "right", render: (r) => formatPct(r.cancelledRate) },
    { key: "avgWidthPips",      label: "Avg Width",     align: "right", render: (r) => formatMaybePips(r.avgWidthPips) },
    { key: "avgAgeHours",       label: "Avg Age",       align: "right", render: (r) => formatAgeHours(r.avgAgeHours) },
];

function NewsCreatedObPopulationPanel({ analysis, defaultCollapsed = false }) {
    if (!analysis?.hasOrderBlocks) {
        return (
            <NeonPanel
                title="News-Created OB Population"
                action={<Pill tone="muted">NO OB DATA</Pill>}
            >
                <div className="text-[12px] text-muted-lab">
                    All detected order block analytics require imported order_blocks.csv data.
                </div>
            </NeonPanel>
        );
    }

    if (!analysis.hasNewsFields) {
        return (
            <NeonPanel
                title="News-Created OB Population"
                action={<Pill tone="muted">REIMPORT REQUIRED</Pill>}
            >
                <div className="space-y-2 text-[12px] text-muted-lab">
                    <p>All detected order blocks, not just executed trades.</p>
                    <p>OB-level news analytics require rerun/reimport after news-created OB tagging was added.</p>
                </div>
            </NeonPanel>
        );
    }

    return (
        <NeonPanel
            title="News-Created OB Population"
            action={<Pill tone="secondary">{analysis.totalCount} DETECTED OBS</Pill>}
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[12px] text-[hsl(var(--text-2))]">All detected order blocks, not just executed trades.</div>
                    <div className="mt-1 text-[10.5px] text-muted-lab">
                        Trade-level stats only include OBs that became trades. OB-level stats include all detected OBs.
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                <ObPopulationSummaryCard title="News-created OBs" row={analysis.newsSummary} tone="warning" />
                <ObPopulationSummaryCard title="Normal OBs" row={analysis.normalSummary} tone="secondary" />
            </div>

            <ObLifecycleStrip title="News-created lifecycle" row={analysis.newsSummary} />
            <ObLifecycleStrip title="Normal lifecycle" row={analysis.normalSummary} />

            {analysis.insights.length > 0 && (
                <div className="my-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.insights.map((text, index) => (
                        <div key={index} className="clip-bevel-sm border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.07)] px-3 py-2 text-[11.5px] text-[hsl(var(--text-2))]">
                            {text}
                        </div>
                    ))}
                </div>
            )}

            <DataTable
                testId="oblab-news-created-ob-population"
                maxHeight={360}
                columns={OB_POPULATION_COLUMNS}
                rows={analysis.rows}
                defaultSortKey="count"
                defaultSortDir="desc"
            />
        </NeonPanel>
    );
}

function ObPopulationSummaryCard({ title, row, tone }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.42)] p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-title-lab">{title}</div>
                <Pill tone={tone}>{row.count} OBS</Pill>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <MiniObMetric label="Fill" value={formatPct(row.fillRate)} />
                <MiniObMetric label="Win Conv." value={row.linkedCount ? formatPct(row.winRate) : "—"} />
                <MiniObMetric label="Invalid." value={formatPct(row.invalidationRate)} />
                <MiniObMetric label="Unfilled" value={formatPct(row.unfilledRate)} />
                <MiniObMetric label="Cancel" value={formatPct(row.cancelledRate)} />
                <MiniObMetric label="Width" value={formatMaybePips(row.avgWidthPips)} />
                <MiniObMetric label="Age" value={formatAgeHours(row.avgAgeHours)} />
                <MiniObMetric label="Linked" value={String(row.linkedCount)} />
            </div>
        </div>
    );
}

function MiniObMetric({ label, value }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.42)] px-2 py-1.5">
            <div className="text-[9.5px] text-muted-lab">{label}</div>
            <div className="mt-0.5 font-num text-[12px] text-white tabular-nums">{value}</div>
        </div>
    );
}

function ObLifecycleStrip({ title, row }) {
    const segments = [
        { label: "Detected", value: row.count, tone: "bg-[hsl(var(--accent-secondary)/0.35)]" },
        { label: "Filled", value: row.filledCount, tone: "bg-[hsl(var(--accent-primary)/0.45)]" },
        { label: "Won", value: row.wins, tone: "bg-[hsl(var(--success)/0.5)]" },
        { label: "Lost", value: row.losses, tone: "bg-[hsl(var(--danger)/0.5)]" },
        { label: "Invalid.", value: row.invalidatedCount, tone: "bg-[hsl(var(--bear)/0.42)]" },
        { label: "Cancelled", value: row.cancelledCount, tone: "bg-[hsl(var(--warning)/0.42)]" },
        { label: "Unfilled", value: row.unfilledCount, tone: "bg-[hsl(var(--panel-3)/0.75)]" },
    ];
    const max = Math.max(row.count, 1);
    return (
        <div className="mb-2">
            <div className="mb-1.5 text-[10px] text-muted-lab">{title}</div>
            <div className="grid grid-cols-7 gap-1.5">
                {segments.map((segment) => (
                    <div key={segment.label} className="min-w-0">
                        <div className="h-1.5 overflow-hidden bg-[hsl(var(--panel-3)/0.5)] clip-bevel-sm">
                            <div className={`h-full ${segment.tone}`} style={{ width: `${Math.max(3, (segment.value / max) * 100)}%` }} />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1 text-[9.5px] text-muted-lab">
                            <span className="truncate">{segment.label}</span>
                            <span className="font-ui text-[hsl(var(--text-2))]">{segment.value}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
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
            title="Timing · Origin Session × Fill Session"
            action={(
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Segment options={MATRIX_METRICS} value={metric} onChange={setMetric} />
                    <Pill tone="muted">{matrix.total} TRADES</Pill>
                </div>
            )}
        >
            <div className="relative overflow-x-auto scrollbar-thin" data-testid="oblab-session-matrix">
                <table className="w-full min-w-[760px] text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider font-ui">Origin ↓ / Fill →</th>
                            {SESSION_COLUMNS.map(s => (
                                <th key={s} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider font-ui">{s}</th>
                            ))}
                            <th className="text-[hsl(var(--accent-secondary)/0.7)] px-2 py-1 text-[10px] uppercase tracking-wider font-ui">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map(row => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap font-ui">{row}</td>
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
                                                className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums font-num cursor-default transition-opacity"
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
                                        <div className="clip-bevel-sm px-2 py-1.5 text-center tabular-nums font-num bg-[hsl(var(--accent-secondary)/0.08)] border border-[hsl(var(--accent-secondary)/0.2)]">
                                            <div className="text-[hsl(var(--accent-secondary)/0.9)] font-semibold">{formatMetricVal(rowTotals[row])}</div>
                                            <div className="text-[9px] text-muted-lab">{rowTotals[row].count} total</div>
                                        </div>
                                    </td>
                                ) : <td />}
                            </tr>
                        ))}
                        {/* Column totals row */}
                        <tr>
                            <td className="text-[hsl(var(--accent-secondary)/0.7)] px-2 py-1 text-[10px] uppercase tracking-wider font-ui">Total</td>
                            {SESSION_COLUMNS.map(col => (
                                colTotals[col] ? (
                                    <td key={col}>
                                        <div className="clip-bevel-sm px-2 py-1.5 text-center tabular-nums font-num bg-[hsl(var(--accent-secondary)/0.08)] border border-[hsl(var(--accent-secondary)/0.2)]">
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
            <div className="text-[10px] font-ui text-[hsl(var(--accent-primary))] uppercase tracking-wider mb-1.5">{row} → {col}</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-ui">
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
    { key: "id",             label: "Trade ID", mono: true },
    { key: "direction",      label: "Dir",      render: (r) => <Pill tone={r.direction === "Long" ? "primary" : "secondary"}>{r.direction || "—"}</Pill> },
    { key: "structure",      label: "Struct" },
    { key: "obWidthPips",    label: "Width",    align: "right", mono: true, render: (r) => r.obWidthPips != null ? `${round1(r.obWidthPips)}p` : "—" },
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

function TemporalAnalytics({ rollingExpectancy, equityCurves, defaultCollapsed = true }) {
    const hasRolling = rollingExpectancy?.length >= 5;
    const hasCurves = equityCurves && (equityCurves.all?.length >= 5 || equityCurves.bos?.length >= 3 || equityCurves.choch?.length >= 3);

    if (!hasRolling && !hasCurves) return null;

    return (
        <NeonPanel title="Temporal Analytics · Equity & Rolling Performance" action={<Pill tone="muted">Time Series</Pill>}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {hasRolling && (
                    <div>
                        <div className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab mb-2">Rolling Expectancy · Trailing 20 Trades</div>
                        <RollingExpectancyChart points={rollingExpectancy} />
                    </div>
                )}
                {hasCurves && (
                    <div>
                        <div className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab mb-2">Cumulative R · BOS vs CHoCH vs All</div>
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
                        <span className="text-[10px] font-ui text-muted-lab">{label}</span>
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
            title="Data Quality · OB Field Completeness"
            action={<Pill tone="muted"><Database className="w-2.5 h-2.5 inline mr-1" />{totalTrades} TRADES</Pill>}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {rows.map(row => {
                    const st = statusTone(row.pct);
                    return (
                        <div key={row.key} className="flex items-center gap-2.5 py-1.5 px-2 border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.4)]">
                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-ui text-[hsl(var(--text-2))] truncate">{row.label}</div>
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
                            <div className="text-[11px] font-num tabular-nums text-white shrink-0">{row.pct.toFixed(0)}%</div>
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
        <NeonPanel title="Research Backlog · Future Capabilities" action={<Pill tone="muted">{RESEARCH_BACKLOG_ITEMS.length} IDEAS</Pill>}>
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
                        <div className="text-[11px] font-ui text-muted-lab">Deterministic summary from current analytics</div>
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
                    <pre className="whitespace-pre-wrap text-[11.5px] leading-relaxed font-code text-[hsl(var(--text-2))]">{reportText}</pre>
                </div>
            </div>
        </div>
    );
}

// ─── Run Config Button ────────────────────────────────────────────────────────
// Compact button that reveals the full RunConfigStrip in a floating popover.
// Replaces the always-visible chip row in the header right panel.

function RunConfigButton({ run }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    if (!run) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className={`clip-bevel-sm border px-3 py-1.5 text-[11px] font-ui inline-flex items-center gap-1.5 transition-colors ${
                    open
                        ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                        : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-white"
                }`}
            >
                <SlidersHorizontal className="w-3 h-3" />
                Run Config
            </button>
            {open && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[260px] bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-[0_4px_24px_hsl(0,0%,0%,0.35)] clip-bevel-sm p-3">
                    <RunConfigStrip run={run} className="mx-0 mb-0" defaultOpen={true} />
                </div>
            )}
        </div>
    );
}

// ─── Variant Selector ─────────────────────────────────────────────────────────

function VariantSelector({ variants, value }) {
    if (!variants?.length || variants.length === 1) return null;
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
        ["News-Created OB Trades", analytics.newsCreatedRows],
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

    // RB-4: each bucket table's grouping + order is defined ONCE here and reused
    // both to build the Raw R rows and (via `bucketDefs`) to recompute Current
    // Equity contributions in CanonicalBucketTable. No drift between the two.
    const bucketDefs = {
        structure:          { labelFn: t => t.structure || "Limited Data", order: ["BOS", "CHoCH", "Limited Data"] },
        direction:          { labelFn: t => t.direction || "Limited Data", order: ["Long", "Short", "Limited Data"] },
        originSession:      { labelFn: originSessionForTrade, order: SESSION_COLUMNS },
        createdSession:     { labelFn: detectionSessionForTrade, order: SESSION_COLUMNS },
        creationHour:       { labelFn: creationHourLabel, order: null },
        width:              { labelFn: widthBucket, order: ["0-2 pips", "2-5 pips", "5-10 pips", "10+ pips", "Limited Data"] },
        age:                { labelFn: ageBucket, order: ["same session / <4h", "4-12h", "12-24h", "1-3d", "3-7d", "7-14d", "14d+", "Limited Data"] },
        penetration:        { labelFn: penetrationBucket, order: ["0–10%", "10–25%", "25–50%", "50–75%", "75–100%", "100%+", "Limited Data"] },
        fastStopout:        { labelFn: fastStopoutBucket, order: ["same candle", "<15m", "15–60m", "1–4h", "4h+", "Limited Data"] },
        distanceBeforeFill: { labelFn: distanceBeforeFillBucket, order: ["0–0.5R", "0.5–1R", "1–2R", "2R+", "Limited Data"] },
        dayOfWeek:          { labelFn: dayOfWeekBucket, order: DAY_ORDER },
    };
    const structureRows          = bucketRows(trades, bucketDefs.structure.labelFn, bucketDefs.structure.order);
    const directionRows          = bucketRows(trades, bucketDefs.direction.labelFn, bucketDefs.direction.order);
    const originSessionRows      = bucketRows(trades, bucketDefs.originSession.labelFn, bucketDefs.originSession.order);
    const createdSessionRows     = bucketRows(trades, bucketDefs.createdSession.labelFn, bucketDefs.createdSession.order);
    // detectionFieldAvailable: true when any trade carries obDetectionTime; the
    // Created Session card shows an honest unavailable state when this is false.
    const detectionFieldAvailable = trades.some(t => t?.obDetectionTime != null && t.obDetectionTime !== "");
    const creationHourRows       = bucketRows(trades, bucketDefs.creationHour.labelFn);
    const widthRows              = bucketRows(trades, bucketDefs.width.labelFn, bucketDefs.width.order);
    const ageRows                = bucketRows(trades, bucketDefs.age.labelFn, bucketDefs.age.order);
    const penetrationRows        = bucketRows(trades, bucketDefs.penetration.labelFn, bucketDefs.penetration.order);
    const fastStopoutRows        = bucketRows(trades, bucketDefs.fastStopout.labelFn, bucketDefs.fastStopout.order);
    const distanceBeforeFillRows = bucketRows(trades, bucketDefs.distanceBeforeFill.labelFn, bucketDefs.distanceBeforeFill.order);
    const dayOfWeekRows          = bucketRows(trades, bucketDefs.dayOfWeek.labelFn, bucketDefs.dayOfWeek.order);
    const newsFieldAvailable     = trades.some(hasNewsCreatedFields);
    const newsCreatedRows        = bucketRows(trades, newsCreatedBucket, ["Origin inside news window", "Detection inside news window", "Within 5 min of news", "Within 15 min of news", "Within 30 min of news", "Not news-created", "Limited Data"]);
    const newsComparisonRows     = bucketRows(trades, newsCreatedComparisonBucket, ["News-created", "Normal OBs", "Limited Data"]);
    const newsComparison         = buildNewsCreatedComparison(newsComparisonRows);
    const newsCreatedTaggedCount = newsCreatedRows
        .filter(row => row.label !== "Not news-created" && row.label !== "Limited Data")
        .reduce((sum, row) => sum + row.count, 0);

    const allRows = [
        ...structureRows, ...directionRows, ...originSessionRows, ...creationHourRows,
        ...widthRows, ...ageRows, ...penetrationRows, ...fastStopoutRows,
        ...distanceBeforeFillRows, ...dayOfWeekRows, ...newsCreatedRows,
    ];

    const lowSampleBuckets = allRows.filter(r => r.count > 0 && r.count < LOW_SAMPLE_N).length;
    const usableRows       = allRows.filter(r => r.count > 0 && r.label !== "Limited Data");
    const bestBucket       = usableRows.length ? usableRows.reduce((a, b) => b.netR > a.netR ? b : a) : null;
    const worstBucket      = usableRows.length ? usableRows.reduce((a, b) => b.netR < a.netR ? b : a) : null;

    const usableSessionRows = originSessionRows.filter(r => r.count > 0 && r.label !== "Limited Data" && r.label !== "Unknown" && r.label !== "Outside");
    const bestSession       = usableSessionRows.length ? usableSessionRows.reduce((a, b) => b.netR > a.netR ? b : a) : null;
    const worstSession      = usableSessionRows.length ? usableSessionRows.reduce((a, b) => b.netR < a.netR ? b : a) : null;

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
        linkedCount, unlinkedCount, lowSampleBuckets, bestBucket, worstBucket, bestSession, worstSession,
        structureRows, directionRows, originSessionRows, createdSessionRows, detectionFieldAvailable, creationHourRows,
        widthRows, ageRows, penetrationRows, catastrophicBreach,
        fastStopoutRows, distanceBeforeFillRows, dayOfWeekRows,
        newsFieldAvailable, newsCreatedRows, newsComparisonRows, newsComparison, newsCreatedTaggedCount,
        sessionMatrix, fieldCompleteness, rollingExpectancy, equityCurves,
        worstLosses, bestWins,
        bucketDefs,
    };
}

function buildNewsCreatedObPopulationAnalytics(orderBlocks, trades) {
    const obs = Array.isArray(orderBlocks) ? orderBlocks : [];
    const tradeLookup = buildTradeLookupForObs(trades);
    const enriched = obs.map((ob) => ({ ...ob, linkedTrade: linkedTradeForOb(ob, tradeLookup) }));
    const hasOrderBlocks = enriched.length > 0;
    const hasNewsFields = enriched.some(hasNewsCreatedFields);

    if (!hasOrderBlocks || !hasNewsFields) {
        return {
            hasOrderBlocks,
            hasNewsFields,
            totalCount: enriched.length,
            rows: [],
            newsSummary: finalizeObPopulationBucket(emptyObPopulationBucket("News-created OBs")),
            normalSummary: finalizeObPopulationBucket(emptyObPopulationBucket("Normal OBs")),
            insights: [],
        };
    }

    const newsObs = enriched.filter(isNewsCreatedTrade);
    const normalObs = enriched.filter((ob) => hasNewsCreatedFields(ob) && !isNewsCreatedTrade(ob));
    const newsSummary = summarizeObPopulation("News-created OBs", newsObs);
    const normalSummary = summarizeObPopulation("Normal OBs", normalObs);
    const rows = [
        summarizeObPopulation("Origin inside news window", enriched.filter((ob) => ob?.obOriginNewsWindow || ob?.obCreatedDuringNews)),
        summarizeObPopulation("Detection inside news window", enriched.filter((ob) => ob?.obDetectionNewsWindow || ob?.obDetectedDuringNews)),
        summarizeObPopulation("Origin or detection inside news window", enriched.filter((ob) => ob?.obOriginNewsWindow || ob?.obDetectionNewsWindow || ob?.obCreatedDuringNews || ob?.obDetectedDuringNews)),
        summarizeObPopulation("Within 5 min of news", enriched.filter((ob) => {
            const minutes = newsMinutesFromTrade(ob);
            return minutes != null && Math.abs(minutes) <= 5;
        })),
        summarizeObPopulation("Within 15 min of news", enriched.filter((ob) => {
            const minutes = newsMinutesFromTrade(ob);
            return minutes != null && Math.abs(minutes) <= 15;
        })),
        summarizeObPopulation("Within 30 min of news", enriched.filter((ob) => {
            const minutes = newsMinutesFromTrade(ob);
            return minutes != null && Math.abs(minutes) <= 30;
        })),
        summarizeObPopulation("Not news-created", normalObs),
    ];

    return {
        hasOrderBlocks,
        hasNewsFields,
        totalCount: enriched.length,
        rows,
        newsSummary,
        normalSummary,
        insights: buildObPopulationInsights(newsSummary, normalSummary),
    };
}

function buildTradeLookupForObs(trades) {
    const byTradeId = new Map();
    const byObId = new Map();
    (Array.isArray(trades) ? trades : []).forEach((trade) => {
        [trade?.id, trade?.rawTradeId, trade?.displayTradeId].filter(Boolean).forEach((id) => {
            byTradeId.set(normalizeEntityKey(id), trade);
        });
        [trade?.obId, trade?.displayObId].filter(Boolean).forEach((id) => {
            byObId.set(normalizeEntityKey(id), trade);
        });
    });
    return { byTradeId, byObId };
}

function linkedTradeForOb(ob, lookup) {
    const tradeIds = [ob?.linkedTradeId, ob?.tradeId, ob?.displayTradeId].filter(Boolean);
    for (const id of tradeIds) {
        const match = lookup.byTradeId.get(normalizeEntityKey(id));
        if (match) return match;
    }
    const obIds = [ob?.id, ob?.obId, ob?.displayObId].filter(Boolean);
    for (const id of obIds) {
        const match = lookup.byObId.get(normalizeEntityKey(id));
        if (match) return match;
    }
    return null;
}

function normalizeEntityKey(value) {
    return String(value || "").trim().toLowerCase();
}

function summarizeObPopulation(label, obs) {
    return finalizeObPopulationBucket(obs.reduce((bucket, ob) => {
        addObToPopulationBucket(bucket, ob);
        return bucket;
    }, emptyObPopulationBucket(label)));
}

function emptyObPopulationBucket(label) {
    return {
        label,
        count: 0,
        filledCount: 0,
        linkedCount: 0,
        wins: 0,
        losses: 0,
        invalidatedCount: 0,
        unfilledCount: 0,
        cancelledCount: 0,
        widthValues: [],
        ageValues: [],
    };
}

function addObToPopulationBucket(bucket, ob) {
    bucket.count += 1;
    const linked = ob?.linkedTrade || null;
    if (isObFilled(ob, linked)) bucket.filledCount += 1;
    if (linked) {
        bucket.linkedCount += 1;
        const r = Number(linked?.r);
        const outcome = normalizeStatus(linked?.outcome || linked?.result);
        if (Number.isFinite(r) ? r > 0 : outcome === "win") bucket.wins += 1;
        if (Number.isFinite(r) ? r < 0 : outcome === "loss") bucket.losses += 1;
    }
    if (isObInvalidated(ob)) bucket.invalidatedCount += 1;
    if (isObCancelled(ob)) bucket.cancelledCount += 1;
    if (isObUnfilled(ob, linked)) bucket.unfilledCount += 1;

    const width = obWidthPips(ob);
    if (Number.isFinite(width)) bucket.widthValues.push(width);
    const age = obAgeHours(ob, linked);
    if (Number.isFinite(age)) bucket.ageValues.push(age);
}

function finalizeObPopulationBucket(bucket) {
    const n = bucket.count;
    const linkedN = bucket.linkedCount;
    return {
        ...bucket,
        fillRate: n ? (bucket.filledCount / n) * 100 : 0,
        winRate: linkedN ? (bucket.wins / linkedN) * 100 : 0,
        lossRate: linkedN ? (bucket.losses / linkedN) * 100 : 0,
        invalidationRate: n ? (bucket.invalidatedCount / n) * 100 : 0,
        unfilledRate: n ? (bucket.unfilledCount / n) * 100 : 0,
        cancelledRate: n ? (bucket.cancelledCount / n) * 100 : 0,
        avgWidthPips: bucket.widthValues.length ? bucket.widthValues.reduce((sum, value) => sum + value, 0) / bucket.widthValues.length : null,
        avgAgeHours: bucket.ageValues.length ? bucket.ageValues.reduce((sum, value) => sum + value, 0) / bucket.ageValues.length : null,
    };
}

function buildObPopulationInsights(news, normal) {
    if (!news?.count || !normal?.count) {
        return ["Limited comparison: both news-created and normal OB cohorts are required."];
    }
    const insights = [];
    const fillDelta = news.fillRate - normal.fillRate;
    const invalidationDelta = news.invalidationRate - normal.invalidationRate;
    const winDelta = news.winRate - normal.winRate;
    if (Math.abs(fillDelta) >= 5) {
        insights.push(`News-created OBs filled ${Math.abs(round1(fillDelta)).toFixed(1)} percentage points ${fillDelta < 0 ? "less often" : "more often"} than normal OBs.`);
    }
    if (Math.abs(invalidationDelta) >= 5) {
        insights.push(`News-created OBs invalidated ${Math.abs(round1(invalidationDelta)).toFixed(1)} percentage points ${invalidationDelta > 0 ? "more often" : "less often"} than normal OBs.`);
    }
    if (!insights.length && Math.abs(winDelta) >= 5) {
        insights.push(`Linked news-created trades had a ${winDelta >= 0 ? "+" : ""}${round1(winDelta).toFixed(1)} percentage point win-rate delta versus normal OBs.`);
    }
    if (!insights.length) {
        insights.push("No meaningful OB-population underperformance detected in this sample.");
    }
    return insights.slice(0, 2);
}

function isObFilled(ob, linked) {
    if ((linked?.entry || linked?.fillTime) && linked?.missed_trade !== true) return true;
    if (ob?.fillTime) return true;
    const status = normalizeStatus(ob?.obFinalStatus || ob?.obFinalStatusLabel || ob?.lifecycleReason);
    return status.includes("fill") || status.includes("win") || status.includes("loss") || status.includes("trade");
}

function isObInvalidated(ob) {
    if (ob?.invalidationTime || ob?.ob_fully_breached === true) return true;
    const status = normalizeStatus(ob?.obFinalStatus || ob?.obFinalStatusLabel || ob?.lifecycleReason);
    return status.includes("invalid") || status.includes("breach") || status.includes("mitigat");
}

function isObCancelled(ob) {
    if (ob?.cancelTime || ob?.sessionCancelTime || ob?.newsBlackoutTriggerTime || ob?.reverseTouchTime) return true;
    const status = normalizeStatus(ob?.obFinalStatus || ob?.obFinalStatusLabel || ob?.lifecycleReason);
    return status.includes("cancel") || status.includes("filtered") || status.includes("news_touch") || status.includes("reverse_touch");
}

function isObUnfilled(ob, linked) {
    const status = normalizeStatus(ob?.obFinalStatus || ob?.obFinalStatusLabel || ob?.lifecycleReason);
    if (status.includes("unfilled") || status.includes("no_trade")) return true;
    return !isObFilled(ob, linked) && !isObCancelled(ob) && !isObInvalidated(ob);
}

function normalizeStatus(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function obWidthPips(ob) {
    const direct = Number(ob?.obWidthPips ?? ob?.ob_width_pips ?? ob?.width_pips);
    if (Number.isFinite(direct)) return direct;
    const top = Number(ob?.top ?? ob?.obTop);
    const bot = Number(ob?.bot ?? ob?.bottom ?? ob?.obBottom);
    if (!Number.isFinite(top) || !Number.isFinite(bot)) return null;
    return Math.abs(top - bot) / 0.0001;
}

function obAgeHours(ob, linked) {
    const from = parseDate(ob?.endTime || ob?.obDetectionTime || ob?.originTime || ob?.obOriginTime);
    const to = parseDate(ob?.fillTime || linked?.entry || linked?.fillTime);
    if (!from || !to) return null;
    const hours = (to.getTime() - from.getTime()) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? hours : null;
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

    if (analytics.newsComparison?.news?.count >= LOW_SAMPLE_N && analytics.newsComparison?.normal?.count >= LOW_SAMPLE_N) {
        const news = analytics.newsComparison.news;
        const normal = analytics.newsComparison.normal;
        const expDelta = news.expectancy - normal.expectancy;
        const wrDelta = news.winRate - normal.winRate;
        if (expDelta < 0 || wrDelta < 0) {
            results.push({
                tone: "warning",
                label: "News-Created OB Trades",
                text: `Executed news-created OB trades vs normal: ${formatSigned(round3(expDelta))}R expectancy / ${wrDelta >= 0 ? "+" : ""}${round1(wrDelta).toFixed(1)}% win rate.`,
            });
        } else {
            results.push({
                tone: "secondary",
                label: "News-Created OB Trades",
                text: "Executed news-created OB trades did not underperform in this sample.",
            });
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
    const breached = bucket.tradeRefs.filter(t => t?.ob_fully_breached === true).length;
    const penetrationValues = bucket.tradeRefs
        .map(t => Number(t?.max_ob_penetration_pct))
        .filter(Number.isFinite);
    const ageValues = bucket.tradeRefs
        .map(ageHours)
        .filter(Number.isFinite);
    const longCount = bucket.tradeRefs.filter(t => String(t?.direction || "").toLowerCase().startsWith("long")).length;
    const shortCount = bucket.tradeRefs.filter(t => String(t?.direction || "").toLowerCase().startsWith("short")).length;

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
        lossRate: n ? (bucket.losses / n) * 100 : 0,
        fullBreachRate: n ? (breached / n) * 100 : 0,
        avgPenetrationPct: penetrationValues.length ? penetrationValues.reduce((sum, value) => sum + value, 0) / penetrationValues.length : null,
        avgAgeHours: ageValues.length ? ageValues.reduce((sum, value) => sum + value, 0) / ageValues.length : null,
        longCount,
        shortCount,
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

function hasNewsCreatedFields(trade) {
    return trade?.hasNewsCreatedTagFields === true
        || trade?.obOriginNewsWindow === true
        || trade?.obDetectionNewsWindow === true
        || trade?.obCreatedDuringNews === true
        || trade?.obDetectedDuringNews === true
        || trade?.obOriginMinutesFromNews != null
        || trade?.obDetectionMinutesFromNews != null
        || trade?.ob_origin_minutes_from_news != null
        || trade?.ob_detection_minutes_from_news != null
        || !!trade?.obOriginNewsEvent
        || !!trade?.obDetectionNewsEvent
        || !!trade?.ob_origin_news_event
        || !!trade?.ob_detection_news_event;
}

function newsMinutesFromTrade(trade) {
    const values = [
        trade?.obOriginMinutesFromNews,
        trade?.obDetectionMinutesFromNews,
        trade?.ob_origin_minutes_from_news,
        trade?.ob_detection_minutes_from_news,
    ].map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    return values.reduce((best, value) => Math.abs(value) < Math.abs(best) ? value : best, values[0]);
}

function isNewsCreatedTrade(trade) {
    if (!hasNewsCreatedFields(trade)) return false;
    if (trade?.obOriginNewsWindow || trade?.obDetectionNewsWindow || trade?.obCreatedDuringNews || trade?.obDetectedDuringNews) return true;
    const minutes = newsMinutesFromTrade(trade);
    return minutes != null && Math.abs(minutes) <= 30;
}

function newsCreatedBucket(trade) {
    if (!hasNewsCreatedFields(trade)) return "Limited Data";
    if (trade?.obOriginNewsWindow || trade?.obCreatedDuringNews) return "Origin inside news window";
    if (trade?.obDetectionNewsWindow || trade?.obDetectedDuringNews) return "Detection inside news window";
    const minutes = newsMinutesFromTrade(trade);
    if (minutes == null) return "Not news-created";
    const abs = Math.abs(minutes);
    if (abs <= 5) return "Within 5 min of news";
    if (abs <= 15) return "Within 15 min of news";
    if (abs <= 30) return "Within 30 min of news";
    return "Not news-created";
}

function newsCreatedComparisonBucket(trade) {
    if (!hasNewsCreatedFields(trade)) return "Limited Data";
    return isNewsCreatedTrade(trade) ? "News-created" : "Normal OBs";
}

function buildNewsCreatedComparison(rows) {
    const news = rows.find(row => row.label === "News-created");
    const normal = rows.find(row => row.label === "Normal OBs");
    if (!news?.count || !normal?.count) return null;
    return { news, normal };
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

// detectionSessionForTrade — session when the algorithm first detected/tagged this OB.
// Distinct from originSessionForTrade which prioritises the pre-existing obOriginSession
// field (the price-structure candle session). Here we specifically prioritise
// obDetectionTime so runs that set detection time separately from origin time get
// distinct session buckets.
function detectionSessionForTrade(trade) {
    return deriveSessionFromTimestamp(trade?.obDetectionTime)
        || normalizeSession(trade?.obOriginSession)
        || deriveSessionFromTimestamp(trade?.obOriginTime)
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

function formatAgeHours(value) {
    if (!Number.isFinite(Number(value))) return "—";
    const hours = Number(value);
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${round1(hours)}h`;
    return `${round1(hours / 24)}d`;
}

function formatMaybePips(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return `${round1(value)} pips`;
}
