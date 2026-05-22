import React from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset } from "@/data/store";
import {
    AlertTriangle, CalendarClock, Clipboard, Download, FileText,
    Globe2, ListChecks, Newspaper, ShieldAlert,
} from "lucide-react";

const EMPTY_TRADES = [];
const CSV_TEMPLATE = "time,currency,impact,event\n2025-06-12 12:30:00,USD,high,CPI\n";

const PLACEHOLDER_WINDOWS = [
    { window: "15m before / 15m after" },
    { window: "30m before / 30m after" },
    { window: "60m before / 60m after" },
    { window: "120m before / 60m after" },
];

const EVENT_TYPES = ["CPI", "NFP", "FOMC", "Rate Decision", "PMI", "Other"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
const SESSIONS = ["Asia", "London", "London Lull", "New York", "Outside"];

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
    const { ACTIVE_RUN, TRADES, activeRunId, runs } = useDataset();
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const [currencyFilter, setCurrencyFilter] = React.useState("ALL");
    const [impactFilter, setImpactFilter] = React.useState("ALL");
    const [searchFilter, setSearchFilter] = React.useState("");
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const newsResults = getNewsResults(activeRun, ACTIVE_RUN);
    const newsEvents = React.useMemo(() => normalizeNewsEvents(activeRun?.newsEvents || ACTIVE_RUN?.newsEvents || []), [activeRun, ACTIVE_RUN]);
    const hasNewsEvents = newsEvents.length > 0;
    const hasNewsResults = Boolean(newsResults);
    const hasNewsData = hasNewsResults || hasNewsEvents;
    const eventSummary = React.useMemo(() => buildNewsEventSummary(newsEvents), [newsEvents]);
    const relevantCurrencies = React.useMemo(() => deriveSymbolCurrencies(ACTIVE_RUN?.symbol || activeRun?.summary?.symbol || activeRun?.config?.symbol), [ACTIVE_RUN, activeRun]);
    const filteredEvents = React.useMemo(
        () => filterNewsEvents(newsEvents, { currencyFilter, impactFilter, searchFilter }),
        [newsEvents, currencyFilter, impactFilter, searchFilter],
    );
    const relevantEvents = React.useMemo(
        () => relevantCurrencies.length ? newsEvents.filter((event) => relevantCurrencies.includes(event.currency)) : [],
        [newsEvents, relevantCurrencies],
    );
    const overlapRows = React.useMemo(
        () => buildTradeNewsOverlaps(trades, newsEvents, relevantCurrencies),
        [trades, newsEvents, relevantCurrencies],
    );
    const overlapSummary = React.useMemo(() => buildOverlapSummary(overlapRows), [overlapRows]);
    const exactBlockedRows = React.useMemo(() => buildExactBlockedRows(trades), [trades]);
    const exactSummary = React.useMemo(() => buildExactNewsSummary(exactBlockedRows), [exactBlockedRows]);
    const sweepRows = React.useMemo(() => buildSweepRows(newsResults), [newsResults]);
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

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="NEWS LAB"
                title="News Lab"
                subtitle="Research high-impact economic event filters, blackout windows, and blocked trade quality."
                actions={(
                    <div className="flex items-center gap-2">
                        <Pill tone="secondary">FRONTEND V1</Pill>
                        <Pill tone={hasNewsData ? "success" : "warning"}>
                            {hasNewsEvents ? "NEWS CSV READY" : hasNewsResults ? "EXACT NEWS RESULTS" : "LIMITED DATA"}
                        </Pill>
                        <Pill tone="primary">{trades.length} TRADES</Pill>
                    </div>
                )}
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <MetricChip label="Events Loaded" value={fmtMaybeCount(eventSummary.eventsLoaded ?? newsResults?.eventsLoaded)} sub="calendar CSV" tone={hasNewsEvents ? "primary" : "muted"} icon={Newspaper} />
                <MetricChip label="High Impact" value={fmtMaybeCount(eventSummary.highImpactEvents ?? newsResults?.highImpactEvents)} sub="filtered events" tone={hasNewsEvents ? "secondary" : "muted"} icon={ShieldAlert} />
                <MetricChip label="Medium Impact" value={fmtMaybeCount(eventSummary.mediumImpactEvents)} sub="calendar CSV" tone={hasNewsEvents ? "primary" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Currencies" value={eventSummary.currenciesCovered || "—"} sub="covered" tone={hasNewsEvents ? "secondary" : "muted"} icon={Globe2} />
                <MetricChip label="Date Range" value={eventSummary.dateRange || "—"} sub="UTC" tone={hasNewsEvents ? "primary" : "muted"} icon={CalendarClock} />
                <MetricChip label="Source" value={eventSummary.source || "—"} sub="calendar" tone={hasNewsEvents ? "success" : "muted"} icon={FileText} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel
                    className="xl:col-span-3"
                    title="News Source · CSV Format"
                    action={<Pill tone="muted">NO LIVE API</Pill>}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
                        <div>
                            <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.55)] p-3">
                                <pre className="text-[11.5px] font-mono text-[hsl(var(--text-2))] overflow-x-auto whitespace-pre">{CSV_TEMPLATE}</pre>
                            </div>
                            <div className="mt-3 grid gap-1.5 text-[11.5px] font-mono text-[hsl(var(--text-2))]">
                                <div className="flex items-start gap-2"><CalendarClock className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> Time should be UTC unless explicitly configured.</div>
                                <div className="flex items-start gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> V1 supports manual CSV import / export from the Python backtester.</div>
                                <div className="flex items-start gap-2"><Globe2 className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))]" /> No live calendar API is connected yet.</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-title-lab">News Source Path</div>
                            <input
                                disabled
                                value="data/news/high_impact_events.csv"
                                readOnly
                                className="w-full clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-mono text-muted-lab"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                <ActionButton disabled icon={FileText}>Import News CSV</ActionButton>
                                <ActionButton onClick={copyTemplate} icon={Clipboard}>Copy CSV Template</ActionButton>
                                <ActionButton disabled icon={Download}>Download Sample CSV</ActionButton>
                            </div>
                        </div>
                    </div>
                </NeonPanel>

                {hasNewsEvents && (
                    <NeonPanel
                        className="xl:col-span-3"
                        title="Event Explorer"
                        action={<Pill tone="success">{filteredEvents.length} EVENTS</Pill>}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-[0.7fr_0.7fr_1.6fr] gap-2 mb-3">
                            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-mono text-[hsl(var(--text-2))]">
                                <option value="ALL">All currencies</option>
                                {eventSummary.currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                            </select>
                            <select value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-mono text-[hsl(var(--text-2))]">
                                <option value="ALL">All impacts</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <input
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="Search events..."
                                className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11.5px] font-mono text-[hsl(var(--text-2))] placeholder:text-muted-lab"
                            />
                        </div>
                        <DataTable
                            testId="newslab-event-explorer"
                            maxHeight={380}
                            columns={[
                                { key: "time", label: "Time" },
                                { key: "currency", label: "Currency" },
                                { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                { key: "event", label: "Event" },
                                { key: "country", label: "Country" },
                                { key: "source", label: "Source" },
                            ]}
                            rows={filteredEvents}
                        />
                    </NeonPanel>
                )}

                {hasNewsEvents && (
                    <NeonPanel
                        className="xl:col-span-3"
                        title="Relevant Events for Active Symbol"
                        action={<Pill tone={relevantCurrencies.length ? "primary" : "muted"}>{relevantCurrencies.length ? relevantCurrencies.join(" / ") : "NO SYMBOL"}</Pill>}
                    >
                        {!relevantCurrencies.length && <LimitedData>Active run symbol is unavailable, so currency relevance cannot be derived.</LimitedData>}
                        <DataTable
                            testId="newslab-relevant-events"
                            maxHeight={260}
                            columns={[
                                { key: "time", label: "Time" },
                                { key: "currency", label: "Currency" },
                                { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                { key: "event", label: "Event" },
                                { key: "source", label: "Source" },
                            ]}
                            rows={relevantEvents}
                        />
                    </NeonPanel>
                )}

                {hasNewsEvents && (
                    <NeonPanel
                        className="xl:col-span-3"
                        title="Trade Overlap Preview · 30m Before / 30m After"
                        action={<Pill tone={overlapRows.length ? "warning" : "muted"}>{overlapRows.length} OVERLAPS</Pill>}
                    >
                        <LimitedData>Frontend overlap preview only — exact blackout results require Python rerun.</LimitedData>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                            <MiniStat label="Critical overlaps" value={overlapSummary.critical} tone="danger" />
                            <MiniStat label="High overlaps" value={overlapSummary.high} tone="warning" />
                            <MiniStat label="Medium overlaps" value={overlapSummary.medium} tone="secondary" />
                            <MiniStat label="Total overlaps" value={overlapSummary.total} tone="primary" />
                        </div>
                        <DataTable
                            testId="newslab-overlap-preview"
                            maxHeight={360}
                            columns={[
                                { key: "severity", label: "Severity", render: (r) => <Pill tone={severityTone(r.severity)}>{r.severity}</Pill> },
                                { key: "tradeId", label: "Trade ID" },
                                { key: "fillTime", label: "Fill Time" },
                                { key: "eventTime", label: "Event Time" },
                                { key: "event", label: "Event" },
                                { key: "currency", label: "Currency" },
                                { key: "impact", label: "Impact", render: (r) => <Pill tone={impactTone(r.impact)}>{r.impact || "—"}</Pill> },
                                { key: "minutesFromEvent", label: "Min From Event", align: "right", render: (r) => fmtSignedMinutes(r.minutesFromEvent) },
                                { key: "originalOutcome", label: "Outcome" },
                                { key: "originalR", label: "Original R", align: "right", render: (r) => fmtMaybeR(r.originalR) },
                            ]}
                            rows={overlapRows}
                        />
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
                    title="Blackout Sweep Results"
                    action={<Pill tone={hasNewsResults ? "success" : "muted"}>{hasNewsResults ? "HYDRATED" : "LIMITED DATA"}</Pill>}
                >
                    {!hasNewsResults && <LimitedData>Run a news blackout backtest and import the output to compare blackout windows.</LimitedData>}
                    <DataTable
                        testId="newslab-blackout-sweep"
                        columns={[
                            { key: "window", label: "Window" },
                            { key: "eventsUsed", label: "Events Used", align: "right", render: (r) => fmtMaybeCount(r.eventsUsed) },
                            { key: "tradesBlocked", label: "Blocked", align: "right", render: (r) => fmtMaybeCount(r.tradesBlocked) },
                            { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                            { key: "netR", label: "Net R", align: "right", render: (r) => r.netR == null ? "—" : <ColoredR value={num(r.netR)} /> },
                            { key: "maxDD", label: "Max DD", align: "right", render: (r) => fmtMaybeR(r.maxDD) },
                            { key: "expectancy", label: "Expectancy", align: "right", render: (r) => fmtMaybeExp(r.expectancy) },
                            { key: "deltaVsBaseline", label: "Δ Baseline", align: "right", render: (r) => fmtMaybeR(r.deltaVsBaseline) },
                            { key: "blockedWinners", label: "Blocked Winners", align: "right", render: (r) => fmtMaybeCount(r.blockedWinners) },
                            { key: "blockedLosers", label: "Blocked Losers", align: "right", render: (r) => fmtMaybeCount(r.blockedLosers) },
                        ]}
                        rows={sweepRows}
                    />
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
                <ResearchBacklog />
            </div>
        </div>
    );
}

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
                            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-title-lab">{title}</div>
                            <div className="mt-1 text-[11.5px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{body}</div>
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

function ResearchBacklog() {
    return (
        <NeonPanel className="xl:col-span-3" title="Research Notes · Backlog" action={<Pill tone="secondary">{BACKLOG.length} ITEMS</Pill>}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {BACKLOG.map((item) => (
                    <div key={item} className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.32)] p-2.5">
                        <div className="flex items-start gap-2 text-[11px] font-mono text-[hsl(var(--text-2))]">
                            <ListChecks className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--accent-secondary))] shrink-0" />
                            <span>{item}</span>
                        </div>
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

function ActionButton({ children, icon: Icon, disabled = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 px-2.5 py-2 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.55)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-45 disabled:cursor-not-allowed clip-bevel-sm"
        >
            <Icon className="w-3.5 h-3.5" />
            {children}
        </button>
    );
}

function LimitedData({ children }) {
    return (
        <div className="mb-3 flex items-start gap-2 text-[11.5px] font-mono text-[hsl(var(--warning))]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{children}</span>
        </div>
    );
}

function MiniStat({ label, value, tone = "primary" }) {
    return (
        <div className={`clip-bevel-sm border px-3 py-2 bg-[hsl(var(--panel-2)/0.38)] ${toneBorderClass(tone)}`}>
            <div className="text-[9.5px] font-mono uppercase tracking-[0.2em] text-muted-lab">{label}</div>
            <div className={`mt-1 font-display text-[18px] ${toneTextClass(tone)}`}>{value}</div>
        </div>
    );
}

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
        dateRange: first && last ? `${shortDate(first.time)} → ${shortDate(last.time)}` : null,
        source: sources.length === 1 ? sources[0] : sources.length ? `${sources.length} sources` : null,
    };
}

function filterNewsEvents(events, { currencyFilter, impactFilter, searchFilter }) {
    const search = String(searchFilter || "").trim().toLowerCase();
    return events.filter((event) => {
        if (currencyFilter !== "ALL" && event.currency !== currencyFilter) return false;
        if (impactFilter !== "ALL" && event.impact !== impactFilter) return false;
        if (search && !`${event.event} ${event.country} ${event.source}`.toLowerCase().includes(search)) return false;
        return true;
    });
}

function deriveSymbolCurrencies(symbol) {
    const clean = String(symbol || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.length < 6) return [];
    const pair = [clean.slice(0, 3), clean.slice(3, 6)];
    return pair.every((currency) => CURRENCIES.includes(currency)) ? pair : [];
}

function buildTradeNewsOverlaps(trades, events, relevantCurrencies) {
    if (!trades.length || !events.length) return [];
    const currencies = relevantCurrencies.length ? new Set(relevantCurrencies) : null;
    const windowSec = 30 * 60;
    const relevantEvents = events.filter((event) => event.ts != null && (!currencies || currencies.has(event.currency)));
    const rows = [];
    trades.forEach((trade) => {
        const fillTs = parseTime(trade.entry || trade.fillTime || trade.fill_time);
        if (fillTs == null) return;
        relevantEvents.forEach((event) => {
            const deltaSec = fillTs - event.ts;
            if (Math.abs(deltaSec) > windowSec) return;
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
    return rows.sort((a, b) => Math.abs(a.minutesFromEvent) - Math.abs(b.minutesFromEvent)).slice(0, 250);
}

function buildOverlapSummary(rows) {
    return {
        critical: rows.filter((row) => row.severity === "Critical").length,
        high: rows.filter((row) => row.severity === "High").length,
        medium: rows.filter((row) => row.severity === "Medium").length,
        total: rows.length,
    };
}

function buildSweepRows(newsResults) {
    const source = newsResults?.sweeps || newsResults?.blackoutSweeps || newsResults?.blackout_sweeps;
    if (Array.isArray(source) && source.length) {
        return source.map((row, idx) => ({
            id: row.id || row.window || `sweep-${idx}`,
            window: row.window || row.label || formatWindow(row),
            eventsUsed: row.eventsUsed ?? row.events_used,
            tradesBlocked: row.tradesBlocked ?? row.trades_blocked,
            winRate: row.winRate ?? row.win_rate,
            netR: row.netR ?? row.net_r,
            maxDD: row.maxDD ?? row.max_dd ?? row.max_drawdown_r,
            expectancy: row.expectancy ?? row.expectancy_r,
            deltaVsBaseline: row.deltaVsBaseline ?? row.delta_vs_baseline ?? row.net_vs_baseline,
            blockedWinners: row.blockedWinners ?? row.blocked_winners,
            blockedLosers: row.blockedLosers ?? row.blocked_losers,
        }));
    }
    return PLACEHOLDER_WINDOWS.map((row) => ({ id: row.window, ...row }));
}

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

function formatWindow(row) {
    const before = row.minutesBefore ?? row.before ?? row.before_minutes;
    const after = row.minutesAfter ?? row.after ?? row.after_minutes;
    if (before != null && after != null) return `${before}m before / ${after}m after`;
    return "—";
}

function slug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseTime(value) {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function shortDate(value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "—";
    return new Date(ms).toISOString().slice(0, 10);
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
