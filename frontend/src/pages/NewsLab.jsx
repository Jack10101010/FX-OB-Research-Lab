import React from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset } from "@/data/store";
import {
    AlertTriangle, Ban, CalendarClock, Clipboard, Download, FileText,
    Globe2, ListChecks, Newspaper, ShieldAlert, Timer, TrendingUp,
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
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const newsResults = getNewsResults(activeRun, ACTIVE_RUN);
    const hasNewsResults = Boolean(newsResults);
    const sweepRows = React.useMemo(() => buildSweepRows(newsResults), [newsResults]);
    const blockedRows = React.useMemo(() => buildBlockedRows(newsResults), [newsResults]);
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
                        <Pill tone={hasNewsResults ? "success" : "warning"}>
                            {hasNewsResults ? "NEWS CSV READY" : "LIMITED DATA"}
                        </Pill>
                        <Pill tone="primary">{trades.length} TRADES</Pill>
                    </div>
                )}
            />

            <div className="px-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <MetricChip label="Events Loaded" value={fmtMaybeCount(newsResults?.eventsLoaded)} sub="manual CSV" tone={hasNewsResults ? "primary" : "muted"} icon={Newspaper} />
                <MetricChip label="High Impact" value={fmtMaybeCount(newsResults?.highImpactEvents)} sub="filtered events" tone={hasNewsResults ? "secondary" : "muted"} icon={ShieldAlert} />
                <MetricChip label="Trades Blocked" value={fmtMaybeCount(newsResults?.tradesBlocked)} sub="blackout skips" tone={hasNewsResults ? "danger" : "muted"} icon={Ban} />
                <MetricChip label="Net R Impact" value={fmtMaybeR(newsResults?.netRImpact)} sub="vs baseline" tone={num(newsResults?.netRImpact) >= 0 ? "success" : "danger"} icon={TrendingUp} />
                <MetricChip label="Best Window" value={newsResults?.bestBlackoutWindow || "—"} sub="by net R" tone={hasNewsResults ? "success" : "muted"} icon={Timer} />
                <MetricChip label="Worst Event" value={newsResults?.worstEventType || "—"} sub="event type" tone={hasNewsResults ? "danger" : "muted"} icon={AlertTriangle} />
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
                    action={<Pill tone={blockedRows.length ? "warning" : "muted"}>{blockedRows.length ? `${blockedRows.length} BLOCKED` : "LIMITED DATA"}</Pill>}
                >
                    {!blockedRows.length && <LimitedData>Run a news blackout backtest and import the output to inspect blocked trades.</LimitedData>}
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

function getNewsResults(activeRun, activeRunSummary) {
    return activeRun?.newsResults || activeRun?.news_results || activeRunSummary?.newsResults || activeRunSummary?.news_results || null;
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

function fmtMaybeExp(value) {
    return isFiniteNum(value) ? `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(3)}R` : "—";
}
