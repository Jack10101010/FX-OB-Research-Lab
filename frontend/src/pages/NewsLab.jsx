import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { HeroBadge } from "@/components/lab/controls";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { RunConfigStrip } from "@/components/lab/RunConfigStrip";
import { useDataset } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
// Phase RB-5 — overlap breakdown tables route through the shared canonical
// bucket table (frozen RB-3.2 contract). Other NewsLab surfaces are unchanged.
import { useResultsLens } from "@/data/useResultsLens";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import {
    AlertTriangle, CalendarClock, Clipboard, Download, FileText,
    Globe2, ListChecks, Newspaper, ShieldAlert,
} from "lucide-react";

const EMPTY_EVENTS = [];
const TABLE_ROW_LIMIT = 500;
const OVERLAP_PREVIEW_LIMIT = 250;
const OVERLAP_IMPACT_OPTIONS = {
    high: { label: "High Impact", impacts: ["high"] },
    medium_high: { label: "Medium + High", impacts: ["medium", "high"] },
    all: { label: "All Impacts", impacts: null },
};
const CSV_TEMPLATE = "time,currency,impact,event\n2025-06-12 12:30:00,USD,high,CPI\n";

const EVENT_TYPES = ["CPI", "NFP", "FOMC", "Rate Decision", "PMI", "Other"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
const SESSIONS = ["Asia", "London", "London Lull", "New York", "Outside"];
const DEFAULT_COMPARISON_SCENARIOS = [
    { id: "scenario-15-15-high", beforeMinutes: 15, afterMinutes: 15, impactMode: "high" },
    { id: "scenario-30-30-high", beforeMinutes: 30, afterMinutes: 30, impactMode: "high" },
    { id: "scenario-60-60-high", beforeMinutes: 60, afterMinutes: 60, impactMode: "high" },
];

const BACKLOG = [
    "ForexFactory / Investing.com calendar import",
    "Manual event CSV parser",
    "High-impact only filter",
    "Currency relevance by symbol",
    "Before / after asymmetric windows",
    "Event-specific windows",
    "Blocked trade chart jump",
    "News event tags in Trade Inspector",
    "Exact Python rerun config export",
    "Live / sidecar calendar updater later",
];

export default function NewsLab() {
    const { ACTIVE_PROJECT, ACTIVE_RUN, activeRunId, runs } = useDataset();
    const universe = useTradeUniverse();
    const trades = universe.trades;
    // Phase 2G — TradeUniverseBadge handles user-facing warning filtering
    // internally; per-page derivation no longer needed.
    const [currencyFilter, setCurrencyFilter] = React.useState("ALL");
    const [impactFilter, setImpactFilter] = React.useState("ALL");
    const [searchFilter, setSearchFilter] = React.useState("");
    const [overlapEnabled, setOverlapEnabled] = React.useState(false);
    const [overlapBeforeMinutes, setOverlapBeforeMinutes] = React.useState(30);
    const [overlapAfterMinutes, setOverlapAfterMinutes] = React.useState(30);
    const [overlapImpactMode, setOverlapImpactMode] = React.useState("high");
    const [newsDateStart, setNewsDateStart] = React.useState("");
    const [newsDateEnd, setNewsDateEnd] = React.useState("");
    const [savedOverlapScenarios, setSavedOverlapScenarios] = React.useState([]);
    const [scenarioNameDraft, setScenarioNameDraft] = React.useState("Scenario 1");
    const [comparisonScenarios, setComparisonScenarios] = React.useState(DEFAULT_COMPARISON_SCENARIOS);
    const [comparisonRows, setComparisonRows] = React.useState([]);
    const [copiedConfigId, setCopiedConfigId] = React.useState("");
    const deferredSearchFilter = React.useDeferredValue(searchFilter);
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const newsResults = getNewsResults(activeRun, ACTIVE_RUN);
    const rawNewsEvents = activeRun?.newsEvents || ACTIVE_RUN?.newsEvents || EMPTY_EVENTS;
    const newsEvents = React.useMemo(() => normalizeNewsEvents(rawNewsEvents), [rawNewsEvents]);
    const hasNewsEvents = newsEvents.length > 0;
    const hasNewsResults = Boolean(newsResults);
    const hasNewsData = hasNewsResults || hasNewsEvents;
    const dateFilteredNewsEvents = React.useMemo(
        () => applyDateRange(newsEvents, newsDateStart, newsDateEnd),
        [newsEvents, newsDateStart, newsDateEnd],
    );
    const dateRangeActive = Boolean(newsDateStart || newsDateEnd);
    const eventSummary = React.useMemo(() => buildNewsEventSummary(dateFilteredNewsEvents), [dateFilteredNewsEvents]);
    const relevantCurrencies = React.useMemo(
        () => deriveSymbolCurrencies(ACTIVE_RUN?.symbol || activeRun?.summary?.symbol || activeRun?.config?.symbol),
        [ACTIVE_RUN, activeRun],
    );
    const filteredEvents = React.useMemo(
        () => filterNewsEvents(dateFilteredNewsEvents, { currencyFilter, impactFilter, searchFilter: deferredSearchFilter }),
        [dateFilteredNewsEvents, currencyFilter, impactFilter, deferredSearchFilter],
    );
    const visibleFilteredEvents = React.useMemo(() => filteredEvents.slice(0, TABLE_ROW_LIMIT), [filteredEvents]);
    const relevantEvents = React.useMemo(
        () => relevantCurrencies.length ? dateFilteredNewsEvents.filter((e) => relevantCurrencies.includes(e.currency)) : [],
        [dateFilteredNewsEvents, relevantCurrencies],
    );
    const visibleRelevantEvents = React.useMemo(() => relevantEvents.slice(0, TABLE_ROW_LIMIT), [relevantEvents]);
    const overlapSettings = React.useMemo(() => ({
        beforeMinutes: overlapBeforeMinutes,
        afterMinutes: overlapAfterMinutes,
        impactMode: overlapImpactMode,
    }), [overlapBeforeMinutes, overlapAfterMinutes, overlapImpactMode]);
    const dateRangeLabel = React.useMemo(
        () => formatDateRangeLabel(newsDateStart, newsDateEnd),
        [newsDateStart, newsDateEnd],
    );
    const overlapButtonLabel = React.useMemo(() => (
        `Calculate ${OVERLAP_IMPACT_OPTIONS[overlapImpactMode]?.label || "High Impact"} ${overlapBeforeMinutes}m / ${overlapAfterMinutes}m Preview`
    ), [overlapAfterMinutes, overlapBeforeMinutes, overlapImpactMode]);
    const overlapRows = React.useMemo(
        () => overlapEnabled ? buildTradeNewsOverlaps(trades, dateFilteredNewsEvents, relevantCurrencies, overlapSettings) : [],
        [overlapEnabled, trades, dateFilteredNewsEvents, relevantCurrencies, overlapSettings],
    );
    const visibleOverlapRows = React.useMemo(() => overlapRows.slice(0, OVERLAP_PREVIEW_LIMIT), [overlapRows]);
    const overlapAnalytics = React.useMemo(() => buildOverlapAnalytics(overlapRows), [overlapRows]);
    const overlapBreakdowns = React.useMemo(() => buildOverlapBreakdowns(overlapRows), [overlapRows]);
    // RB-5: adapted overlap rows for the canonical bucket table's Current-Equity path.
    const overlapTrades = React.useMemo(() => overlapRowsToTrades(overlapRows), [overlapRows]);
    const exactBlockedRows = React.useMemo(() => buildExactBlockedRows(trades), [trades]);
    const exactSummary = React.useMemo(() => buildExactNewsSummary(exactBlockedRows), [exactBlockedRows]);
    const blockedRows = React.useMemo(
        () => (exactBlockedRows.length ? exactBlockedRows : buildBlockedRows(newsResults)),
        [exactBlockedRows, newsResults],
    );
    const eventBreakdowns = React.useMemo(() => buildBreakdowns(newsResults), [newsResults]);

    const copyTemplate = async () => {
        try {
            await navigator.clipboard?.writeText(CSV_TEMPLATE);
        } catch {
            // Clipboard is optional in this frontend-only placeholder.
        }
    };
    const updateOverlapBefore = (value) => {
        setOverlapBeforeMinutes(clampMinutes(value));
        setOverlapEnabled(false);
    };
    const updateOverlapAfter = (value) => {
        setOverlapAfterMinutes(clampMinutes(value));
        setOverlapEnabled(false);
    };
    const updateOverlapImpact = (value) => {
        setOverlapImpactMode(value);
        setOverlapEnabled(false);
    };
    const updateNewsDateStart = (v) => { setNewsDateStart(v); setOverlapEnabled(false); setComparisonRows([]); };
    const updateNewsDateEnd = (v) => { setNewsDateEnd(v); setOverlapEnabled(false); setComparisonRows([]); };
    const updateComparisonScenario = (id, patch) => {
        setComparisonScenarios((rows) => rows.map((row) => (
            row.id === id ? { ...row, ...patch } : row
        )));
        setComparisonRows([]);
    };
    const applyFullCalendarRange = () => {
        const dated = newsEvents.filter((e) => e.ts != null);
        if (!dated.length) return;
        setNewsDateStart(tsToDateStr(dated[0].ts));
        setNewsDateEnd(tsToDateStr(dated[dated.length - 1].ts));
        setOverlapEnabled(false);
        setComparisonRows([]);
    };
    const applyActiveRunRange = () => {
        const range = deriveTradeRange(trades);
        if (range.start) setNewsDateStart(range.start);
        if (range.end) setNewsDateEnd(range.end);
        setOverlapEnabled(false);
        setComparisonRows([]);
    };
    const clearDateRange = () => { setNewsDateStart(""); setNewsDateEnd(""); setOverlapEnabled(false); setComparisonRows([]); };
    const saveOverlapScenario = () => {
        if (!overlapEnabled) return;
        const name = scenarioNameDraft.trim() || `Scenario ${savedOverlapScenarios.length + 1}`;
        const scenario = {
            id: `saved-${Date.now()}`,
            name,
            beforeMinutes: overlapBeforeMinutes,
            afterMinutes: overlapAfterMinutes,
            impactMode: overlapImpactMode,
            dateStart: newsDateStart,
            dateEnd: newsDateEnd,
            dateRange: dateRangeLabel,
            createdAt: new Date().toISOString(),
            metrics: overlapAnalytics,
        };
        setSavedOverlapScenarios((rows) => [...rows, scenario]);
        setScenarioNameDraft(`Scenario ${savedOverlapScenarios.length + 2}`);
    };
    const renameSavedScenario = (id, name) => {
        setSavedOverlapScenarios((rows) => rows.map((row) => (
            row.id === id ? { ...row, name } : row
        )));
    };
    const deleteSavedScenario = (id) => {
        setSavedOverlapScenarios((rows) => rows.filter((row) => row.id !== id));
    };
    const restoreSavedScenario = (scenario) => {
        setOverlapBeforeMinutes(scenario.beforeMinutes);
        setOverlapAfterMinutes(scenario.afterMinutes);
        setOverlapImpactMode(scenario.impactMode);
        setNewsDateStart(scenario.dateStart || "");
        setNewsDateEnd(scenario.dateEnd || "");
        setOverlapEnabled(true);
        setComparisonRows([]);
    };
    const addComparisonScenario = () => {
        setComparisonScenarios((rows) => [
            ...rows,
            { id: `scenario-${Date.now()}`, beforeMinutes: 30, afterMinutes: 30, impactMode: "high" },
        ]);
        setComparisonRows([]);
    };
    const removeComparisonScenario = (id) => {
        setComparisonScenarios((rows) => rows.filter((row) => row.id !== id));
        setComparisonRows([]);
    };
    const calculateScenarioComparison = () => {
        const rows = comparisonScenarios.map((scenario, index) => (
            buildScenarioComparisonRow(
                scenario,
                index,
                trades,
                dateFilteredNewsEvents,
                relevantCurrencies,
                { dateStart: newsDateStart, dateEnd: newsDateEnd, dateRange: dateRangeLabel },
            )
        ));
        setComparisonRows(rows);
    };
    const copyScenarioConfig = async (scenario) => {
        const payload = buildPythonConfigPayload(scenario, newsDateStart, newsDateEnd);
        try {
            await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
            setCopiedConfigId(scenario.id);
            window.setTimeout(() => setCopiedConfigId(""), 1600);
        } catch {
            setCopiedConfigId("");
        }
    };

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="News Lab"
                titleFallback="News Lab"
                description="Research high-impact economic event filters, blackout windows, and blocked trade quality."
                activeProject={ACTIVE_PROJECT}
                activeRun={activeRun}
                activeSummary={ACTIVE_RUN}
                activeRunId={activeRunId}
                tradeCount={trades.length}
                actions={(
                    <>
                        <HeroBadge tone="secondary">Frontend V1</HeroBadge>
                        <HeroBadge tone={hasNewsData ? "success" : "warning"}>
                            {hasNewsEvents ? "News CSV Ready" : hasNewsResults ? "Exact News Results" : "Limited Data"}
                        </HeroBadge>
                        <HeroBadge tone="primary">{trades.length} trades</HeroBadge>
                    </>
                )}
            />

            {/* Universe / source badge — shared component. Placement preserved.
                Warnings filtered inside the component (Phase 2G). */}
            {/* RESEARCH-RESULT-VIEW-BANNER Phase 4: read-only RunDetail-style banner.
                Hero page → run identity stays in LabRunHero. Same universe the page
                uses; Arm C0/C1 warning shown once (right panel). */}
            {activeRunId && (
                <div className="px-6 mt-2 mb-3">
                    <ResearchResultViewBanner universe={universe} />
                </div>
            )}
            <RunConfigStrip run={activeRun} />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <MetricChip label="Events Loaded" value={fmtMaybeCount(eventSummary.eventsLoaded ?? newsResults?.eventsLoaded)} sub={dateRangeActive ? "filtered range" : "calendar CSV"} tone={hasNewsEvents ? "primary" : "muted"} icon={Newspaper} />
                <MetricChip label="High Impact" value={fmtMaybeCount(eventSummary.highImpactEvents ?? newsResults?.highImpactEvents)} sub="filtered events" tone={hasNewsEvents ? "secondary" : "muted"} icon={ShieldAlert} />
                <MetricChip label="Medium Impact" value={fmtMaybeCount(eventSummary.mediumImpactEvents)} sub={dateRangeActive ? "filtered range" : "calendar CSV"} tone={hasNewsEvents ? "primary" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Currencies" value={eventSummary.currenciesCovered || "—"} sub="covered" tone={hasNewsEvents ? "secondary" : "muted"} icon={Globe2} />
                <MetricChip label="Date Range" value={eventSummary.dateRange || "—"} sub={dateRangeActive ? "UTC filtered" : "UTC"} tone={hasNewsEvents ? "primary" : "muted"} icon={CalendarClock} />
                <MetricChip label="Source" value={eventSummary.source || "—"} sub="calendar" tone={hasNewsEvents ? "success" : "muted"} icon={FileText} />
            </div>

            {hasNewsEvents && (
                <div className="px-6 mt-3">
                    <NeonPanel
                        title="News Date Range"
                        action={<Pill tone={dateRangeActive ? "warning" : "muted"}>{dateRangeActive ? "RANGE ACTIVE" : "FRONTEND ANALYSIS ONLY"}</Pill>}
                    >
                        <div className="mb-2 text-[11px] font-ui text-muted-lab">
                            Filters all tables and overlap preview to a date window. Does not affect Python backtest or exact blackout results.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
                            <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                Start date (UTC)
                                <input
                                    type="date"
                                    value={newsDateStart}
                                    onChange={(e) => updateNewsDateStart(e.target.value)}
                                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                />
                            </label>
                            <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                End date (UTC)
                                <input
                                    type="date"
                                    value={newsDateEnd}
                                    onChange={(e) => updateNewsDateEnd(e.target.value)}
                                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                />
                            </label>
                            <ActionButton onClick={applyActiveRunRange} icon={CalendarClock} disabled={!trades.length}>Match Active Run</ActionButton>
                            <ActionButton onClick={applyFullCalendarRange} icon={Globe2}>Full Calendar</ActionButton>
                            <ActionButton onClick={clearDateRange} icon={FileText} disabled={!dateRangeActive}>Clear</ActionButton>
                        </div>
                        {dateRangeActive && (
                            <div className="mt-2 text-[11px] font-ui text-muted-lab">
                                {dateFilteredNewsEvents.length} of {newsEvents.length} events in selected range.
                            </div>
                        )}
                    </NeonPanel>
                </div>
            )}

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <CollapsiblePanel
                    className="xl:col-span-3"
                    title="News Source · CSV Format"
                    action={<Pill tone="muted">NO LIVE API</Pill>}
                    defaultCollapsed
                >
                    <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
                        <div>
                            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.55)] p-3">
                                <pre className="text-[11.5px] font-code text-[hsl(var(--text-2))] overflow-x-auto whitespace-pre">{CSV_TEMPLATE}</pre>
                            </div>
                            <div className="mt-3 grid gap-1.5 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                                <div className="flex items-start gap-2"><CalendarClock className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> Time should be UTC unless explicitly configured.</div>
                                <div className="flex items-start gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> V1 supports manual CSV import / export from the Python backtester.</div>
                                <div className="flex items-start gap-2"><Globe2 className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> No live calendar API is connected yet.</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-[10px] font-ui uppercase tracking-[0.14em] text-title-lab">News Source Path</div>
                            <input
                                disabled
                                value="data/news/high_impact_events.csv"
                                readOnly
                                className="w-full clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-code text-muted-lab"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                <ActionButton disabled icon={FileText}>Import News CSV</ActionButton>
                                <ActionButton onClick={copyTemplate} icon={Clipboard}>Copy CSV Template</ActionButton>
                                <ActionButton disabled icon={Download}>Download Sample CSV</ActionButton>
                            </div>
                        </div>
                    </div>
                </CollapsiblePanel>

                {hasNewsEvents && (
                    <CollapsiblePanel
                        className="xl:col-span-3"
                        title="Event Explorer"
                        action={<Pill tone="success">{filteredEvents.length} EVENTS</Pill>}
                        defaultCollapsed
                    >
                        <div className="grid grid-cols-1 md:grid-cols-[0.7fr_0.7fr_1.6fr] gap-2 mb-3">
                            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                                <option value="ALL">All currencies</option>
                                {eventSummary.currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                            </select>
                            <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                                <option value="ALL">All impacts</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <input
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="Search events..."
                                className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))] placeholder:text-muted-lab"
                            />
                        </div>
                        <div className="mb-3 text-[11px] font-ui text-muted-lab">
                            Showing first {Math.min(TABLE_ROW_LIMIT, filteredEvents.length)} of {filteredEvents.length} filtered events.
                        </div>
                        <DataTable
                            testId="newslab-event-explorer"
                            maxHeight={380}
                            columns={[
                                { key: "time", label: "Time (UTC)" },
                                { key: "currency", label: "Currency" },
                                { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                { key: "event", label: "Event" },
                                { key: "country", label: "Country" },
                                { key: "source", label: "Source" },
                            ]}
                            rows={visibleFilteredEvents}
                        />
                    </CollapsiblePanel>
                )}

                {hasNewsEvents && (
                    <CollapsiblePanel
                        className="xl:col-span-3"
                        title="Relevant Events for Active Symbol"
                        action={<Pill tone={relevantCurrencies.length ? "primary" : "muted"}>{relevantCurrencies.length ? relevantCurrencies.join(" / ") : "NO SYMBOL"}</Pill>}
                        defaultCollapsed
                    >
                        {!relevantCurrencies.length && <LimitedData>Active run symbol is unavailable, so currency relevance cannot be derived.</LimitedData>}
                        <div className="mb-3 text-[11px] font-ui text-muted-lab">
                            Showing first {Math.min(TABLE_ROW_LIMIT, relevantEvents.length)} of {relevantEvents.length} relevant events.
                        </div>
                        <DataTable
                            testId="newslab-relevant-events"
                            maxHeight={260}
                            columns={[
                                { key: "time", label: "Time (UTC)" },
                                { key: "currency", label: "Currency" },
                                { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                { key: "event", label: "Event" },
                                { key: "source", label: "Source" },
                            ]}
                            rows={visibleRelevantEvents}
                        />
                    </CollapsiblePanel>
                )}

                {hasNewsEvents && (
                    <NeonPanel
                        className="xl:col-span-3"
                        title={`Trade Overlap Preview · ${overlapBeforeMinutes}m Before / ${overlapAfterMinutes}m After`}
                        action={<Pill tone={overlapRows.length ? "warning" : "muted"}>{overlapRows.length} OVERLAPS</Pill>}
                    >
                        <LimitedData>Frontend overlap preview only — exact blackout results require Python rerun.</LimitedData>
                        {!relevantCurrencies.length && (
                            <LimitedData>No active symbol — currency relevance unavailable; overlap preview disabled.</LimitedData>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                            <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                Minutes before event
                                <input
                                    type="number"
                                    min="0"
                                    max="1440"
                                    value={overlapBeforeMinutes}
                                    onChange={(e) => updateOverlapBefore(e.target.value)}
                                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                />
                            </label>
                            <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                Minutes after event
                                <input
                                    type="number"
                                    min="0"
                                    max="1440"
                                    value={overlapAfterMinutes}
                                    onChange={(e) => updateOverlapAfter(e.target.value)}
                                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                />
                            </label>
                            <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                Impact filter
                                <select
                                    value={overlapImpactMode}
                                    onChange={(e) => updateOverlapImpact(e.target.value)}
                                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                >
                                    <option value="high">High only</option>
                                    <option value="medium_high">Medium + High</option>
                                    <option value="all">All impacts</option>
                                </select>
                            </label>
                        </div>
                        {!overlapEnabled ? (
                            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
                                <div className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">Overlap preview is disabled until calculated to keep the page fast.</div>
                                <button
                                    type="button"
                                    onClick={() => setOverlapEnabled(true)}
                                    disabled={!relevantCurrencies.length}
                                    className="mt-3 inline-flex items-center justify-center px-3 py-2 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-45 disabled:cursor-not-allowed clip-bevel-sm"
                                >
                                    {overlapButtonLabel}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.32)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                                    Wins and losses shown here are the <strong>original outcomes</strong> of trades whose fill time fell inside the selected news window. This is a frontend overlap preview — not a simulated blackout result.
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mb-3">
                                    <MiniStat label="Overlapped" value={overlapAnalytics.total} tone="primary" />
                                    <MiniStat label="Wins" value={overlapAnalytics.wins} tone="primary" />
                                    <MiniStat label="Losses" value={overlapAnalytics.losses} tone="danger" />
                                    <MiniStat label="Win Rate" value={fmtMaybePct(overlapAnalytics.winRate)} tone="secondary" />
                                    <MiniStat label="Net R" value={fmtMaybeR(overlapAnalytics.netR)} tone={isFiniteNum(overlapAnalytics.netR) ? (Number(overlapAnalytics.netR) >= 0 ? "primary" : "danger") : "muted"} />
                                    <MiniStat label="Avg R" value={fmtMaybeExp(overlapAnalytics.avgR)} tone="secondary" />
                                    <MiniStatSmall label="Best Event" value={overlapAnalytics.bestEvent} tone="primary" />
                                    <MiniStatSmall label="Worst Event" value={overlapAnalytics.worstEvent} tone="warning" />
                                </div>
                                <div className="mb-3 clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.32)] p-3">
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                                        <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                            Scenario name
                                            <input
                                                value={scenarioNameDraft}
                                                onChange={(e) => setScenarioNameDraft(e.target.value)}
                                                className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                            />
                                        </label>
                                        <ActionButton onClick={saveOverlapScenario} icon={FileText}>Save Scenario</ActionButton>
                                        <ActionButton onClick={() => copyScenarioConfig({ id: "current-overlap", ...overlapSettings })} icon={Clipboard}>
                                            {copiedConfigId === "current-overlap" ? "Copied Config" : "Copy Python Config"}
                                        </ActionButton>
                                    </div>
                                </div>
                                <DataTable
                                    testId="newslab-overlap-preview"
                                    maxHeight={360}
                                    columns={[
                                        { key: "severity", label: "Severity", render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill> },
                                        { key: "tradeId", label: "Trade ID" },
                                        { key: "relation", label: "Relation", render: (r) => {
                                            const m = Number(r.minutesFromEvent);
                                            const label = m < -0.5 ? "Before" : m > 0.5 ? "After" : "Same min";
                                            const tone = m < -0.5 ? "warning" : m > 0.5 ? "secondary" : "danger";
                                            return <Pill tone={tone}>{label}</Pill>;
                                        }},
                                        { key: "minutesFromEvent", label: "Minutes", align: "right", render: (r) => fmtSignedMinutes(r.minutesFromEvent) },
                                        { key: "fillTime", label: "Fill Time (UTC)" },
                                        { key: "eventTime", label: "Event Time (UTC)" },
                                        { key: "event", label: "Event" },
                                        { key: "currency", label: "Currency" },
                                        { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                        { key: "originalOutcome", label: "Outcome" },
                                        { key: "originalR", label: "R", align: "right", render: (r) => fmtMaybeR(r.originalR) },
                                    ]}
                                    rows={visibleOverlapRows}
                                />
                                <div className="mt-4">
                                    <OverlapBasisNote />
                                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                                        <OverlapBreakdownTable title="By Impact" rows={overlapBreakdowns.byImpact} trades={overlapTrades} labelFn={(t) => t.impact || "unknown"} />
                                        <OverlapBreakdownTable title="By Event Name" rows={overlapBreakdowns.byEvent} trades={overlapTrades} labelFn={(t) => t.event || "Unknown"} />
                                        <OverlapBreakdownTable title="By Proximity" rows={overlapBreakdowns.byProximity} trades={overlapTrades} labelFn={overlapProximityLabel} />
                                    </div>
                                </div>
                            </>
                        )}
                        {savedOverlapScenarios.length > 0 && (
                            <div className="mt-4">
                                <div className="mb-2 text-[10px] font-ui uppercase tracking-[0.2em] text-title-lab">Saved Overlap Scenarios</div>
                                <DataTable
                                    testId="newslab-saved-overlap-scenarios"
                                    maxHeight={280}
                                    columns={[
                                        { key: "name", label: "Name", render: (r) => (
                                            <input
                                                value={r.name}
                                                onChange={(e) => renameSavedScenario(r.id, e.target.value)}
                                                className="w-44 clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-2 py-1 text-[11px] font-ui text-[hsl(var(--text-2))]"
                                            />
                                        ) },
                                        { key: "window", label: "Window", render: (r) => formatScenarioWindow(r) },
                                        { key: "impactMode", label: "Impact", render: (r) => OVERLAP_IMPACT_OPTIONS[r.impactMode]?.label || "High Impact" },
                                        { key: "dateRange", label: "Date Range" },
                                        { key: "total", label: "Overlaps", align: "right", render: (r) => fmtMaybeCount(r.metrics?.total) },
                                        { key: "wins", label: "Wins", align: "right", render: (r) => fmtMaybeCount(r.metrics?.wins) },
                                        { key: "losses", label: "Losses", align: "right", render: (r) => fmtMaybeCount(r.metrics?.losses) },
                                        { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.metrics?.winRate) },
                                        { key: "netR", label: "Net R", align: "right", render: (r) => r.metrics?.netR == null ? "—" : <ColoredR value={num(r.metrics.netR)} /> },
                                        { key: "avgR", label: "Avg R", align: "right", render: (r) => fmtMaybeExp(r.metrics?.avgR) },
                                        { key: "createdAt", label: "Created", render: (r) => shortDateTime(r.createdAt) },
                                        { key: "actions", label: "Actions", render: (r) => (
                                            <div className="flex flex-wrap gap-1.5">
                                                <TinyButton onClick={() => restoreSavedScenario(r)}>Restore</TinyButton>
                                                <TinyButton onClick={() => copyScenarioConfig(r)}>{copiedConfigId === r.id ? "Copied" : "Config"}</TinyButton>
                                                <TinyButton onClick={() => deleteSavedScenario(r.id)} tone="danger">Delete</TinyButton>
                                            </div>
                                        ) },
                                    ]}
                                    rows={savedOverlapScenarios}
                                />
                            </div>
                        )}
                    </NeonPanel>
                )}

                <NeonPanel
                    className="xl:col-span-3"
                    title="Exact News Blackout Results"
                    action={<Pill tone={exactBlockedRows.length ? "success" : "muted"}>{exactBlockedRows.length ? "HYDRATED" : "LIMITED DATA"}</Pill>}
                >
                    {!exactBlockedRows.length && <LimitedData>Import a Python news blackout run with news_blackout fields to hydrate exact blocked trade results.</LimitedData>}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                        <MetricChip label="News Blackout Skipped" value={fmtMaybeCount(exactSummary.skipped)} sub="exact engine" tone={exactBlockedRows.length ? "primary" : "muted"} icon={ShieldAlert} />
                        <MetricChip label="Blocked Winners" value={fmtLimitedCount(exactSummary.blockedWinners, exactSummary.canDeriveOutcome)} sub="if derivable" tone={exactSummary.canDeriveOutcome ? "danger" : "muted"} icon={AlertTriangle} />
                        <MetricChip label="Blocked Losers" value={fmtLimitedCount(exactSummary.blockedLosers, exactSummary.canDeriveOutcome)} sub="if derivable" tone={exactSummary.canDeriveOutcome ? "success" : "muted"} icon={ShieldAlert} />
                        <MetricChip label="Blocked Net R" value={fmtLimitedR(exactSummary.blockedNetR, exactSummary.canDeriveR)} sub="original impact" tone={exactSummary.canDeriveR ? "secondary" : "muted"} icon={FileText} />
                        <MetricChip label="Currencies Blocked" value={exactSummary.currenciesBlocked || "—"} sub="event currencies" tone={exactBlockedRows.length ? "primary" : "muted"} icon={Globe2} />
                        <MetricChip label="Event Types Blocked" value={exactSummary.eventTypesBlocked || "—"} sub="unique events" tone={exactBlockedRows.length ? "secondary" : "muted"} icon={Newspaper} />
                    </div>
                </NeonPanel>

                <NeonPanel
                    className="xl:col-span-3"
                    title="News Blackout Scenario Comparison"
                    action={<Pill tone={comparisonRows.length ? "warning" : "muted"}>{comparisonRows.length ? `${comparisonRows.length} CALCULATED` : "FRONTEND ONLY"}</Pill>}
                >
                    <LimitedData>Frontend overlap scenario comparison only — exact blackout results require Python rerun.</LimitedData>
                    {!relevantCurrencies.length && <LimitedData>No active symbol — currency relevance unavailable; scenario comparison disabled.</LimitedData>}
                    <div className="space-y-2 mb-3">
                        {comparisonScenarios.map((scenario) => (
                            <div key={scenario.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-end clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] p-2">
                                <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                    Before
                                    <input
                                        type="number"
                                        min="0"
                                        max="1440"
                                        value={scenario.beforeMinutes}
                                        onChange={(e) => updateComparisonScenario(scenario.id, { beforeMinutes: clampMinutes(e.target.value) })}
                                        className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                    />
                                </label>
                                <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                    After
                                    <input
                                        type="number"
                                        min="0"
                                        max="1440"
                                        value={scenario.afterMinutes}
                                        onChange={(e) => updateComparisonScenario(scenario.id, { afterMinutes: clampMinutes(e.target.value) })}
                                        className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                    />
                                </label>
                                <label className="grid gap-1 text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">
                                    Impact
                                    <select
                                        value={scenario.impactMode}
                                        onChange={(e) => updateComparisonScenario(scenario.id, { impactMode: e.target.value })}
                                        className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--text-2))]"
                                    >
                                        <option value="high">High only</option>
                                        <option value="medium_high">Medium + High</option>
                                        <option value="all">All impacts</option>
                                    </select>
                                </label>
                                <TinyButton onClick={() => removeComparisonScenario(scenario.id)} tone="danger" disabled={comparisonScenarios.length <= 1}>Remove</TinyButton>
                            </div>
                        ))}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <ActionButton onClick={addComparisonScenario} icon={FileText}>Add Scenario Row</ActionButton>
                        <ActionButton onClick={calculateScenarioComparison} icon={ShieldAlert} disabled={!relevantCurrencies.length || !comparisonScenarios.length}>Calculate Scenario Comparison</ActionButton>
                    </div>
                    <DataTable
                        testId="newslab-blackout-scenario-comparison"
                        maxHeight={320}
                        columns={[
                            { key: "window", label: "Window" },
                            { key: "eventsUsed", label: "Events Used", align: "right", render: (r) => fmtMaybeCount(r.eventsUsed) },
                            { key: "impactMode", label: "Impact", render: (r) => OVERLAP_IMPACT_OPTIONS[r.impactMode]?.label || "High Impact" },
                            { key: "overlappedTrades", label: "Overlaps", align: "right", render: (r) => fmtMaybeCount(r.overlappedTrades) },
                            { key: "wins", label: "Wins", align: "right", render: (r) => fmtMaybeCount(r.wins) },
                            { key: "losses", label: "Losses", align: "right", render: (r) => fmtMaybeCount(r.losses) },
                            { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                            { key: "netR", label: "Net R", align: "right", render: (r) => r.netR == null ? "—" : <ColoredR value={num(r.netR)} /> },
                            { key: "avgR", label: "Avg R", align: "right", render: (r) => fmtMaybeExp(r.avgR) },
                            { key: "dateRange", label: "Date Range" },
                            { key: "actions", label: "Config", render: (r) => (
                                <TinyButton onClick={() => copyScenarioConfig(r)}>{copiedConfigId === r.id ? "Copied" : "Copy Config"}</TinyButton>
                            ) },
                        ]}
                        rows={comparisonRows}
                    />
                    {!comparisonRows.length && (
                        <div className="mt-3 text-[11px] font-ui text-muted-lab">
                            Add or edit scenario rows, then calculate to compare frontend overlap metrics.
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel
                    className="xl:col-span-3"
                    title="Blocked Trades Verification"
                    action={<Pill tone={exactBlockedRows.length ? "success" : blockedRows.length ? "warning" : "muted"}>{blockedRows.length ? `${blockedRows.length} BLOCKED` : "LIMITED DATA"}</Pill>}
                >
                    {!blockedRows.length && <LimitedData>Run a news blackout backtest and import the output to inspect blocked trades.</LimitedData>}
                    {exactBlockedRows.length > 0 && <LimitedData>Exact News Blackout Results — these rows were exported by the Python backtester.</LimitedData>}
                    <DataTable
                        testId="newslab-blocked-trades"
                        maxHeight={360}
                        columns={[
                            { key: "tradeId", label: "Trade ID" },
                            { key: "fillTime", label: "Entry / Fill Time" },
                            { key: "eventTime", label: "Event Time" },
                            { key: "minutesFromEvent", label: "Min From Event", align: "right", render: (r) => fmtMaybeCount(r.minutesFromEvent) },
                            { key: "eventName", label: "Event" },
                            { key: "currency", label: "Currency" },
                            { key: "impact", label: "Impact" },
                            { key: "originalOutcome", label: "Original Outcome" },
                            { key: "originalR", label: "Original R", align: "right", render: (r) => fmtMaybeR(r.originalR) },
                            { key: "session", label: "Session" },
                            { key: "structure", label: "Structure" },
                            { key: "obId", label: "OB ID" },
                        ]}
                        rows={blockedRows}
                    />
                </NeonPanel>

                <EventTimeline newsResults={newsResults} />
                <BreakdownPanel title="Event Type Breakdown" rows={eventBreakdowns.eventTypes} />
                <BreakdownPanel title="Currency Breakdown" rows={eventBreakdowns.currencies} />
                <BreakdownPanel title="Session Breakdown" rows={eventBreakdowns.sessions} />
                <NewsDebugPanel activeRun={activeRun} />
                <ResearchBacklog />
            </div>
        </div>
    );
}

// ── Collapsible wrapper ──────────────────────────────────────────────────────

function CollapsiblePanel({ title, action, className, defaultCollapsed = false, children }) {
    const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
    const toggleAction = (
        <div className="flex items-center gap-2">
            {action}
            <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="text-[9px] font-ui uppercase tracking-[0.2em] text-muted-lab border border-[hsl(var(--border-soft))] px-2 py-1 clip-bevel-sm hover:text-[hsl(var(--text-2))]"
            >
                {collapsed ? "Show ▾" : "Hide ▴"}
            </button>
        </div>
    );
    return (
        <NeonPanel className={className} title={title} action={toggleAction}>
            {!collapsed && children}
        </NeonPanel>
    );
}

// ── Overlap breakdown table (RB-5: canonical bucket contract) ─────────────────
// These three breakdowns (By Impact / By Event / By Proximity) are NewsLab's
// only bucket-style WR tables. They now render through the shared
// CanonicalBucketTable in `bare` mode: Raw R preserves the existing
// Trades/W/L/Net R values and order (WR shifts to the canonical
// wins/(wins+losses)); Current Equity adds Contribution / Contrib %. The
// section-level basis chip + caveat live above the grid.

const OVERLAP_RAW_SCHEMA = [
    { key: "label",   label: "Bucket", kind: "label",  sortable: false },
    { key: "rows",    label: "Trades", align: "right", kind: "int" },
    { key: "wins",    label: "W",      align: "right", kind: "int" },
    { key: "losses",  label: "L",      align: "right", kind: "int" },
    { key: "winRate", label: "WR",     align: "right", kind: "pct", invariant: true },
    { key: "netR",    label: "Net R",  align: "right", kind: "rNet" },
];
const OVERLAP_CE_SCHEMA = [
    { key: "label",              label: "Bucket",       kind: "label",  sortable: false },
    { key: "rows",               label: "Trades",       align: "right", kind: "int" },
    { key: "winRate",            label: "WR",           align: "right", kind: "pct", invariant: true },
    { key: "contributionAmount", label: "Contribution", align: "right", kind: "money" },
    { key: "contributionPct",    label: "Contrib %",    align: "right", kind: "moneyPct" },
];

const OVERLAP_SCHEMA = { raw: OVERLAP_RAW_SCHEMA, ce: OVERLAP_CE_SCHEMA };

function overlapProximityLabel(row) {
    const abs = Math.abs(Number(row.minutesFromEvent));
    if (abs <= 5) return "0–5 min";
    if (abs <= 15) return "5–15 min";
    if (abs <= 30) return "15–30 min";
    return "30m+";
}

// Adapt trade×event overlap rows into trade-like objects so the canonical
// calculator can read R (`originalR` → `r`) and order by fill time for CE.
function overlapRowsToTrades(rows) {
    return (rows || []).map((row) => ({
        ...row,
        r: Number(row.originalR),
        outcome: row.originalOutcome,
        fill_time: row.fillTime,
        entry: row.fillTime,
    }));
}

function OverlapBreakdownTable({ title, rows, trades, labelFn }) {
    // CE bucket set is restricted to exactly the Raw R buckets (same labels +
    // order, including By Event's top-20), so the two bases stay aligned.
    const def = { labelFn, order: (rows || []).map((r) => r.label) };
    return (
        <div>
            <div className="text-[10px] font-ui uppercase tracking-[0.2em] text-title-lab mb-2">{title}</div>
            <CanonicalBucketTable
                bare
                compact
                testId={`newslab-overlap-breakdown-${slug(title)}`}
                rawRows={rows}
                trades={trades}
                def={def}
                schema={OVERLAP_SCHEMA}
                restrictToOrder
                defaultSortKey={null}
            />
        </div>
    );
}

// Section-level Results Basis chip + Current-Equity caveat for the overlap
// breakdowns (shown once above the 3-column grid).
function OverlapBasisNote() {
    const lens = useResultsLens();
    return (
        <div className="mb-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">Results Basis</span>
                <HeroBadge tone={lens.isCurrentEquity ? "secondary" : "muted"}>{lens.isCurrentEquity ? "Current Equity" : "Raw R"}</HeroBadge>
            </div>
            {lens.isCurrentEquity && (
                <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-2.5 py-1.5">
                    <span className="text-[10.5px] leading-relaxed text-[hsl(var(--text-2))]">
                        Current Equity overlap contribution is sequence-dependent and counts a trade once per
                        overlapping event — research view, not isolated edge.
                        {(lens.accountSettings?.mode || "r_only") === "r_only" && " Account model is Pure R — set an account mode in Settings → Results Basis for dollar contribution."}
                    </span>
                </div>
            )}
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function EventTimeline({ newsResults }) {
    const rows = Array.isArray(newsResults?.timeline) ? newsResults.timeline : [];
    return (
        <NeonPanel className="xl:col-span-3" title="Event Timeline" action={<Pill tone={rows.length ? "primary" : "muted"}>{rows.length ? `${rows.length} EVENTS` : "FUTURE STRUCTURE"}</Pill>}>
            {!rows.length && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        ["Events by date", "Group economic events by UTC date and impact."],
                        ["Blocked trades linked", "Attach blocked setups to the nearest relevant event."],
                        ["R saved / lost", "Aggregate blocked winners and losers around each event."],
                    ].map(([title, body]) => (
                        <div key={title} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] p-3">
                            <div className="text-[10px] font-ui uppercase tracking-[0.2em] text-title-lab">{title}</div>
                            <div className="mt-1 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{body}</div>
                        </div>
                    ))}
                </div>
            )}
        </NeonPanel>
    );
}

function BreakdownPanel({ title, rows }) {
    const hydrated = rows.some((row) => row.events != null || row.blockedTrades != null || row.netRImpact != null);
    return (
        <NeonPanel title={title} action={<Pill tone={hydrated ? "primary" : "muted"}>{hydrated ? "HYDRATED" : "LIMITED DATA"}</Pill>}>
            <DataTable
                testId={`newslab-${slug(title)}`}
                maxHeight={260}
                columns={[
                    { key: "label", label: "Bucket" },
                    { key: "events", label: "Events", align: "right", render: (r) => fmtMaybeCount(r.events) },
                    { key: "blockedTrades", label: "Blocked", align: "right", render: (r) => fmtMaybeCount(r.blockedTrades) },
                    { key: "netRImpact", label: "Net R Impact", align: "right", render: (r) => r.netRImpact == null ? "—" : <ColoredR value={num(r.netRImpact)} /> },
                    { key: "avgRImpact", label: "Avg R Impact", align: "right", render: (r) => fmtMaybeExp(r.avgRImpact) },
                ]}
                rows={rows}
            />
        </NeonPanel>
    );
}

// ── Per-OB news debug trace panel ───────────────────────────────────────────
// Surfaces `news_debug` from summary.json when the Python backtester was run
// with `news_debug_ob_ids` — e.g. ["32"] to trace OB-032.

function NewsDebugPanel({ activeRun }) {
    const debugRows = React.useMemo(() => {
        const raw = activeRun?.summary?.news_debug ?? activeRun?.news_debug;
        return Array.isArray(raw) ? raw : [];
    }, [activeRun]);

    if (!debugRows.length) return null;

    return (
        <NeonPanel
            className="xl:col-span-3"
            title="News Debug Trace"
            action={<Pill tone="warning">{debugRows.length} OB{debugRows.length !== 1 ? "s" : ""} TRACED</Pill>}
        >
            <div className="mb-2 text-[10.5px] font-ui text-muted-lab">
                Per-OB flatten trace — exported when <code>news_debug_ob_ids</code> is set in config. Use to verify why a specific OB did or did not flatten.
            </div>
            <div className="space-y-3">
                {debugRows.map((row, idx) => {
                    const flattenFired = row.flatten_fired ?? row.flattened ?? false;
                    const activeAtTarget = row.active_at_flatten_target ?? row.was_active ?? null;
                    return (
                        <div key={idx} className={`clip-bevel-sm border p-3 font-ui text-[11px] ${flattenFired ? "border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.06)]" : "border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.06)]"}`}>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="font-code text-[12px] font-bold text-white">{row.ob_id ?? `OB-${idx + 1}`}</span>
                                <Pill tone={flattenFired ? "success" : "warning"}>{flattenFired ? "FLATTENED" : "NOT FLATTENED"}</Pill>
                                {activeAtTarget === true && <Pill tone="secondary">ACTIVE AT FLATTEN TARGET</Pill>}
                                {activeAtTarget === false && <Pill tone="muted">NOT ACTIVE AT TARGET</Pill>}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-1 text-[10.5px]">
                                <DebugField label="Fill Time" value={row.fill_time} />
                                <DebugField label="Entry" value={row.entry} />
                                <DebugField label="Stop" value={row.stop} />
                                <DebugField label="Loss Time" value={row.loss_time} />
                                <DebugField label="News Event" value={row.news_event} />
                                <DebugField label="News Event Time" value={row.news_event_time} />
                                <DebugField label="Blackout Start" value={row.blackout_start} />
                                <DebugField label="Blackout End" value={row.blackout_end} />
                                <DebugField label="Flatten Target" value={row.flatten_target} />
                                <DebugField label="Flatten Candle Open" value={row.flatten_candle_open} />
                                <DebugField label="Flatten R" value={row.flatten_r} />
                                <DebugField label="Late Flatten" value={row.late_flatten != null ? String(row.late_flatten) : null} />
                                {row.flatten_reason && (
                                    <div className="col-span-2 xl:col-span-4 text-[hsl(var(--warning))]">
                                        <span className="text-muted-lab">Reason: </span>{row.flatten_reason}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </NeonPanel>
    );
}

function DebugField({ label, value }) {
    if (value == null || value === "") return null;
    return (
        <div>
            <span className="text-muted-lab">{label}: </span>
            <span className="text-[hsl(var(--text-2))]">{String(value)}</span>
        </div>
    );
}

function ResearchBacklog() {
    return (
        <NeonPanel className="xl:col-span-3" title="Research Notes · Backlog" action={<Pill tone="secondary">{BACKLOG.length} ITEMS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {BACKLOG.map((item) => (
                    <div key={item} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.32)] p-2.5">
                        <div className="flex items-start gap-2 text-[11px] font-ui text-[hsl(var(--text-2))]">
                            <ListChecks className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))] shrink-0" />
                            <span>{item}</span>
                        </div>
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

// Local NewsLabUniverseBadge + NewsLabBadgeCell removed in Phase 2F —
// replaced by the shared @/components/lab/TradeUniverseBadge component.

function ActionButton({ children, icon: Icon, disabled = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 px-2.5 py-2 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-45 disabled:cursor-not-allowed clip-bevel-sm"
        >
            <Icon className="w-3.5 h-3.5" />
            {children}
        </button>
    );
}

function TinyButton({ children, disabled = false, onClick, tone = "secondary" }) {
    const toneClass = tone === "danger"
        ? "border-[hsl(var(--danger)/0.45)] text-[hsl(var(--danger))] bg-[hsl(var(--danger)/0.06)] hover:bg-[hsl(var(--danger)/0.12)]"
        : "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)]";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`px-2 py-1 text-[9.5px] font-ui uppercase tracking-wider disabled:opacity-45 disabled:cursor-not-allowed clip-bevel-sm border ${toneClass}`}
        >
            {children}
        </button>
    );
}

function LimitedData({ children }) {
    return (
        <div className="mb-3 flex items-start gap-2 text-[11.5px] font-ui text-[hsl(var(--warning))]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{children}</span>
        </div>
    );
}

function MiniStat({ label, value, tone = "primary" }) {
    return (
        <div className={`clip-bevel-sm border px-3 py-2 bg-[hsl(var(--panel-2)/0.38)] ${toneBorderClass(tone)}`}>
            <div className="text-[9.5px] font-ui uppercase tracking-[0.2em] text-muted-lab">{label}</div>
            <div className={`mt-1 font-display text-[18px] ${toneTextClass(tone)}`}>{value}</div>
        </div>
    );
}

function MiniStatSmall({ label, value, tone = "primary" }) {
    return (
        <div className={`clip-bevel-sm border px-3 py-2 bg-[hsl(var(--panel-2)/0.38)] ${toneBorderClass(tone)}`}>
            <div className="text-[9.5px] font-ui uppercase tracking-[0.2em] text-muted-lab">{label}</div>
            <div className={`mt-1 font-ui text-[11px] leading-snug ${toneTextClass(tone)}`}>{value || "—"}</div>
        </div>
    );
}

// ── Data normalisation ───────────────────────────────────────────────────────

function normalizeNewsEvents(events) {
    return (Array.isArray(events) ? events : [])
        .map((event, index) => ({
            id: event.id || `news-${index}`,
            time: String(event.time || ""),
            currency: String(event.currency || "").toUpperCase(),
            impact: String(event.impact || "").toLowerCase(),
            event: String(event.event || ""),
            source: String(event.source || ""),
            country: String(event.country || ""),
            searchText: `${event.event || ""} ${event.country || ""} ${event.source || ""}`.toLowerCase(),
            ts: parseTime(event.time),
        }))
        .filter((event) => event.time && event.currency && event.event)
        .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

function getNewsResults(activeRun, activeRunSummary) {
    return activeRun?.newsResults || activeRun?.news_results || activeRunSummary?.newsResults || activeRunSummary?.news_results || null;
}

function buildNewsEventSummary(events) {
    if (!events.length) return { currencyOptions: [] };
    const currencies = [...new Set(events.map((event) => event.currency).filter(Boolean))].sort();
    const sources = [...new Set(events.map((event) => event.source).filter(Boolean))].sort();
    const dated = events.filter((event) => event.ts != null);
    const first = dated[0];
    const last = dated[dated.length - 1];
    return {
        eventsLoaded: events.length,
        highImpactEvents: events.filter((event) => event.impact === "high").length,
        mediumImpactEvents: events.filter((event) => event.impact === "medium").length,
        currenciesCovered: currencies.length ? String(currencies.length) : null,
        currencyOptions: currencies,
        dateRange: first && last ? `${shortDateCompact(first.time)} → ${shortDateCompact(last.time)}` : null,
        source: sources.length === 1 ? sources[0] : sources.length ? `${sources.length} sources` : null,
    };
}

function filterNewsEvents(events, { currencyFilter, impactFilter, searchFilter }) {
    const search = String(searchFilter || "").trim().toLowerCase();
    return events.filter((event) => {
        if (currencyFilter !== "ALL" && event.currency !== currencyFilter) return false;
        if (impactFilter !== "ALL" && event.impact !== impactFilter) return false;
        if (search && !event.searchText.includes(search)) return false;
        return true;
    });
}

function applyDateRange(events, startStr, endStr) {
    if (!startStr && !endStr) return events;
    const startTs = startStr ? parseTime(startStr + "T00:00:00Z") : null;
    const endTs = endStr ? parseTime(endStr + "T23:59:59Z") : null;
    return events.filter((e) => {
        if (e.ts == null) return false;
        if (startTs != null && e.ts < startTs) return false;
        if (endTs != null && e.ts > endTs) return false;
        return true;
    });
}

function deriveSymbolCurrencies(symbol) {
    const clean = String(symbol || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.length < 6) return [];
    const pair = [clean.slice(0, 3), clean.slice(3, 6)];
    return pair.every((currency) => CURRENCIES.includes(currency)) ? pair : [];
}

function deriveTradeRange(trades) {
    const tss = trades
        .map((t) => parseTime(t.entry || t.fillTime || t.fill_time || t.detectionTime || t.detection_time))
        .filter(Boolean);
    if (!tss.length) return { start: "", end: "" };
    return { start: tsToDateStr(Math.min(...tss)), end: tsToDateStr(Math.max(...tss)) };
}

function clampMinutes(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(1440, Math.round(parsed)));
}

// ── Overlap calculation ──────────────────────────────────────────────────────

function buildTradeNewsOverlaps(trades, events, relevantCurrencies, settings = {}, limit = null) {
    if (!relevantCurrencies.length) return [];
    if (!trades.length || !events.length) return [];
    const currencies = new Set(relevantCurrencies);
    const beforeSec = clampMinutes(settings.beforeMinutes ?? 30) * 60;
    const afterSec = clampMinutes(settings.afterMinutes ?? 30) * 60;
    const impactOption = OVERLAP_IMPACT_OPTIONS[settings.impactMode] || OVERLAP_IMPACT_OPTIONS.high;
    const impacts = impactOption.impacts ? new Set(impactOption.impacts) : null;
    const relevantEvents = events.filter((event) => (
        event.ts != null
        && (!impacts || impacts.has(event.impact))
        && currencies.has(event.currency)
    ));
    const rows = [];
    trades.forEach((trade) => {
        const fillTs = parseTime(trade.entry || trade.fillTime || trade.fill_time);
        if (fillTs == null) return;
        relevantEvents.forEach((event) => {
            const deltaSec = fillTs - event.ts;
            if (deltaSec < -beforeSec || deltaSec > afterSec) return;
            rows.push({
                id: `${trade.id}-${event.id}`,
                tradeId: trade.id,
                fillTime: trade.entry || trade.fillTime || trade.fill_time || "—",
                eventTime: event.time,
                event: event.event,
                currency: event.currency,
                impact: event.impact,
                minutesFromEvent: deltaSec / 60,
                severity: overlapSeverity(deltaSec / 60),
                originalOutcome: trade.outcome || "—",
                originalR: trade.r,
            });
        });
    });
    const sorted = rows.sort((a, b) => Math.abs(a.minutesFromEvent) - Math.abs(b.minutesFromEvent));
    return limit ? sorted.slice(0, limit) : sorted;
}

function buildOverlapAnalytics(rows) {
    if (!rows.length) {
        return { total: 0, wins: 0, losses: 0, winRate: null, netR: null, avgR: null, bestEvent: "—", worstEvent: "—" };
    }
    const uniqueRows = [...new Map(rows.map((row) => [row.tradeId || row.id, row])).values()];
    const rRows = uniqueRows.filter((r) => isFiniteNum(r.originalR));
    const wins = uniqueRows.filter((r) => r.originalOutcome === "Win" || (isFiniteNum(r.originalR) && Number(r.originalR) > 0)).length;
    const losses = uniqueRows.filter((r) => r.originalOutcome === "Loss" || (isFiniteNum(r.originalR) && Number(r.originalR) < 0)).length;
    const netR = rRows.length ? rRows.reduce((s, r) => s + Number(r.originalR), 0) : null;
    const avgR = rRows.length && netR != null ? netR / rRows.length : null;
    const winRate = uniqueRows.length ? wins / uniqueRows.length : null;
    const eventMap = {};
    rRows.forEach((r) => {
        const key = r.event || "Unknown";
        if (!eventMap[key]) eventMap[key] = 0;
        eventMap[key] += Number(r.originalR);
    });
    const eventList = Object.entries(eventMap);
    const bestEntry = eventList.length ? eventList.reduce((a, b) => b[1] > a[1] ? b : a) : null;
    const worstEntry = eventList.length ? eventList.reduce((a, b) => b[1] < a[1] ? b : a) : null;
    const fmtEvent = ([name, r]) => `${name} (${r >= 0 ? "+" : ""}${r.toFixed(1)}R)`;
    return {
        total: uniqueRows.length,
        wins,
        losses,
        winRate,
        netR,
        avgR,
        bestEvent: bestEntry ? fmtEvent(bestEntry) : "—",
        worstEvent: worstEntry ? fmtEvent(worstEntry) : "—",
    };
}

function buildOverlapBreakdowns(rows) {
    const toRows = (groups) => Object.entries(groups).map(([label, items]) => {
        const rItems = items.filter((r) => isFiniteNum(r.originalR));
        const wins = items.filter((r) => r.originalOutcome === "Win" || (isFiniteNum(r.originalR) && Number(r.originalR) > 0)).length;
        const losses = items.filter((r) => r.originalOutcome === "Loss" || (isFiniteNum(r.originalR) && Number(r.originalR) < 0)).length;
        const netR = rItems.length ? rItems.reduce((s, r) => s + Number(r.originalR), 0) : null;
        return {
            id: label,
            label,
            count: items.length,
            wins,
            losses,
            winRate: items.length ? wins / items.length : null,
            netR,
        };
    });

    const impactGroups = {};
    const eventGroups = {};
    const proximityGroups = { "0–5 min": [], "5–15 min": [], "15–30 min": [], "30m+": [] };

    rows.forEach((r) => {
        const imp = r.impact || "unknown";
        if (!impactGroups[imp]) impactGroups[imp] = [];
        impactGroups[imp].push(r);

        const ev = r.event || "Unknown";
        if (!eventGroups[ev]) eventGroups[ev] = [];
        eventGroups[ev].push(r);

        const abs = Math.abs(Number(r.minutesFromEvent));
        if (abs <= 5) proximityGroups["0–5 min"].push(r);
        else if (abs <= 15) proximityGroups["5–15 min"].push(r);
        else if (abs <= 30) proximityGroups["15–30 min"].push(r);
        else proximityGroups["30m+"].push(r);
    });

    const IMPACT_ORDER = ["high", "medium", "low", "unknown"];
    const byImpact = IMPACT_ORDER.filter((k) => impactGroups[k]).map((k) => toRows({ [k]: impactGroups[k] })[0]);
    const byEvent = toRows(eventGroups).sort((a, b) => b.count - a.count).slice(0, 20);
    const byProximity = toRows(proximityGroups);

    return { byImpact, byEvent, byProximity };
}

function buildScenarioComparisonRow(scenario, index, trades, events, relevantCurrencies, dateRange) {
    const settings = {
        beforeMinutes: scenario.beforeMinutes,
        afterMinutes: scenario.afterMinutes,
        impactMode: scenario.impactMode,
    };
    const rows = buildTradeNewsOverlaps(trades, events, relevantCurrencies, settings);
    const metrics = buildOverlapAnalytics(rows);
    return {
        id: scenario.id,
        name: `Scenario ${index + 1}`,
        beforeMinutes: settings.beforeMinutes,
        afterMinutes: settings.afterMinutes,
        impactMode: settings.impactMode,
        dateStart: dateRange.dateStart,
        dateEnd: dateRange.dateEnd,
        dateRange: dateRange.dateRange,
        window: formatScenarioWindow(settings),
        eventsUsed: countScenarioEvents(events, relevantCurrencies, settings),
        overlappedTrades: metrics.total,
        wins: metrics.wins,
        losses: metrics.losses,
        winRate: metrics.winRate,
        netR: metrics.netR,
        avgR: metrics.avgR,
    };
}

function countScenarioEvents(events, relevantCurrencies, settings = {}) {
    if (!relevantCurrencies.length) return 0;
    const currencies = new Set(relevantCurrencies);
    const impactOption = OVERLAP_IMPACT_OPTIONS[settings.impactMode] || OVERLAP_IMPACT_OPTIONS.high;
    const impacts = impactOption.impacts ? new Set(impactOption.impacts) : null;
    return events.filter((event) => (
        event.ts != null
        && currencies.has(event.currency)
        && (!impacts || impacts.has(event.impact))
    )).length;
}

function buildPythonConfigPayload(scenario, fallbackStart, fallbackEnd) {
    const impactOption = OVERLAP_IMPACT_OPTIONS[scenario.impactMode] || OVERLAP_IMPACT_OPTIONS.high;
    return {
        news_blackout_enabled: true,
        news_blackout_minutes_before: clampMinutes(scenario.beforeMinutes ?? 30),
        news_blackout_minutes_after: clampMinutes(scenario.afterMinutes ?? 30),
        news_blackout_impacts: impactOption.impacts || ["low", "medium", "high"],
        selected_date_range: {
            date_from: scenario.dateStart || fallbackStart || null,
            date_to: scenario.dateEnd || fallbackEnd || null,
        },
    };
}

// ── Exact blackout helpers ──────────────────────────────────────────────────

function buildBlockedRows(newsResults) {
    const source = newsResults?.blockedTrades || newsResults?.blocked_trades;
    if (!Array.isArray(source)) return [];
    return source.map((row, idx) => ({
        id: row.id || row.tradeId || row.trade_id || `blocked-${idx}`,
        tradeId: row.tradeId || row.trade_id || row.id || "—",
        fillTime: row.fillTime || row.fill_time || row.entryTime || row.entry_time || "—",
        eventTime: row.eventTime || row.event_time || row.news_time || "—",
        minutesFromEvent: row.minutesFromEvent ?? row.minutes_from_event,
        eventName: row.eventName || row.event || row.news_event || "—",
        currency: row.currency || "—",
        impact: row.impact || "—",
        originalOutcome: row.originalOutcome || row.original_outcome || row.outcome || "—",
        originalR: row.originalR ?? row.original_r ?? row.pnl_r,
        session: row.session || row.fillSession || row.fill_session || "—",
        structure: row.structure || row.structureTag || row.structure_tag || "—",
        obId: row.obId || row.ob_id || "—",
    }));
}

function buildExactBlockedRows(trades) {
    return (Array.isArray(trades) ? trades : [])
        .filter((trade) => isExactNewsBlockedTrade(trade))
        .map((trade, idx) => {
            const outcome = normalizeOutcome(trade.outcome);
            const rValue = isFiniteNum(trade.r) ? Number(trade.r) : null;
            const originalOutcome = outcome === "NEWS_BLACKOUT" ? "Limited Data" : trade.outcome || "—";
            const originalR = outcome === "NEWS_BLACKOUT" && (rValue == null || rValue === 0) ? null : rValue;
            return {
                id: trade.id || `exact-news-${idx}`,
                tradeId: trade.id || "—",
                fillTime: trade.news_blackout_trigger_time || trade.entry || trade.fillTime || trade.fill_time || "—",
                eventTime: trade.news_blackout_event_time || "—",
                minutesFromEvent: trade.news_blackout_minutes_from_event,
                eventName: trade.news_blackout_event || "—",
                currency: trade.news_blackout_currency || "—",
                impact: trade.news_blackout_impact || "—",
                originalOutcome,
                originalR,
                session: trade.session || "—",
                structure: trade.structure || "—",
                obId: trade.obId || trade.ob_id || "—",
            };
        });
}

function buildExactNewsSummary(rows) {
    const derivableRRows = rows.filter((row) => isFiniteNum(row.originalR));
    const derivableOutcomeRows = rows.filter((row) => ["Win", "Loss"].includes(String(row.originalOutcome)) || isFiniteNum(row.originalR));
    const currencies = new Set(rows.map((row) => row.currency).filter((value) => value && value !== "—"));
    const events = new Set(rows.map((row) => row.eventName).filter((value) => value && value !== "—"));
    return {
        skipped: rows.length,
        canDeriveOutcome: derivableOutcomeRows.length > 0,
        canDeriveR: derivableRRows.length > 0,
        blockedWinners: derivableOutcomeRows.filter((row) => row.originalOutcome === "Win" || Number(row.originalR) > 0).length,
        blockedLosers: derivableOutcomeRows.filter((row) => row.originalOutcome === "Loss" || Number(row.originalR) < 0).length,
        blockedNetR: derivableRRows.reduce((sum, row) => sum + Number(row.originalR), 0),
        currenciesBlocked: currencies.size ? String(currencies.size) : null,
        eventTypesBlocked: events.size ? String(events.size) : null,
    };
}

function isExactNewsBlockedTrade(trade) {
    return trade?.news_blackout === true || normalizeOutcome(trade?.outcome) === "NEWS_BLACKOUT";
}

function normalizeOutcome(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function buildBreakdowns(newsResults) {
    return {
        eventTypes: hydrateBreakdown(EVENT_TYPES, newsResults?.eventTypeBreakdown || newsResults?.event_type_breakdown),
        currencies: hydrateBreakdown(CURRENCIES, newsResults?.currencyBreakdown || newsResults?.currency_breakdown),
        sessions: hydrateBreakdown(SESSIONS, newsResults?.sessionBreakdown || newsResults?.session_breakdown),
    };
}

function hydrateBreakdown(labels, source) {
    const lookup = Array.isArray(source)
        ? Object.fromEntries(source.map((row) => [String(row.label || row.event || row.currency || row.session || row.name), row]))
        : source || {};
    return labels.map((label) => {
        const row = lookup[label] || {};
        return {
            id: label,
            label,
            events: row.events ?? row.event_count,
            blockedTrades: row.blockedTrades ?? row.blocked_trades,
            netRImpact: row.netRImpact ?? row.net_r_impact,
            avgRImpact: row.avgRImpact ?? row.avg_r_impact,
        };
    });
}

// ── Pure utilities ───────────────────────────────────────────────────────────

function formatScenarioWindow(row) {
    return `${clampMinutes(row.beforeMinutes)}m before / ${clampMinutes(row.afterMinutes)}m after`;
}

function formatDateRangeLabel(start, end) {
    if (start && end) return `${start} → ${end}`;
    if (start) return `${start} → open`;
    if (end) return `start → ${end}`;
    return "All calendar dates";
}

function slug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseTime(value) {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function tsToDateStr(ts) {
    return new Date(ts * 1000).toISOString().slice(0, 10);
}

function shortDateCompact(value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toISOString().slice(2, 10); // "YY-MM-DD"
}

function shortDateTime(value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function impactTone(impact) {
    if (impact === "high") return "danger";
    if (impact === "medium") return "warning";
    if (impact === "low") return "muted";
    return "muted";
}

function overlapSeverity(minutesFromEvent) {
    const abs = Math.abs(Number(minutesFromEvent));
    if (abs <= 5) return "Critical";
    if (abs <= 15) return "High";
    if (abs <= 30) return "Medium";
    return "Low";
}

function severityTone(severity) {
    if (severity === "Critical") return "danger";
    if (severity === "High") return "warning";
    if (severity === "Medium") return "secondary";
    return "muted";
}

function toneBorderClass(tone) {
    if (tone === "danger") return "border-[hsl(var(--danger)/0.5)]";
    if (tone === "warning") return "border-[hsl(var(--warning)/0.5)]";
    if (tone === "secondary") return "border-[hsl(var(--accent-secondary)/0.45)]";
    return "border-[hsl(var(--accent-primary)/0.45)]";
}

function toneTextClass(tone) {
    if (tone === "danger") return "text-[hsl(var(--danger))]";
    if (tone === "warning") return "text-[hsl(var(--warning))]";
    if (tone === "secondary") return "text-[hsl(var(--accent-secondary))]";
    return "text-[hsl(var(--accent-primary))]";
}

function isFiniteNum(value) {
    return value != null && value !== "" && Number.isFinite(Number(value));
}

function num(value) {
    return isFiniteNum(value) ? Number(value) : 0;
}

function fmtMaybeCount(value) {
    return isFiniteNum(value) ? String(Math.round(Number(value))) : "—";
}

function fmtMaybePct(value) {
    return isFiniteNum(value) ? `${(Number(value) * (Math.abs(Number(value)) <= 1 ? 100 : 1)).toFixed(1)}%` : "—";
}

function fmtMaybeR(value) {
    return isFiniteNum(value) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}R` : "—";
}

function fmtLimitedCount(value, available) {
    return available ? fmtMaybeCount(value) : "Limited Data";
}

function fmtLimitedR(value, available) {
    return available ? fmtMaybeR(value) : "Limited Data";
}

function fmtMaybeExp(value) {
    return isFiniteNum(value) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(3)}R` : "—";
}

function fmtSignedMinutes(value) {
    return isFiniteNum(value) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(0)}m` : "—";
}
