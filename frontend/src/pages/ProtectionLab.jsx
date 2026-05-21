import React from "react";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { useDataset } from "@/data/store";
import {
    ShieldAlert, ShieldCheck, AlertTriangle, TrendingUp, Activity,
    Hash, Target, Clock, Newspaper, Ban, ListChecks,
} from "lucide-react";

// ── Protection Lab V1 ────────────────────────────────────────────────
// Read-only research surface for defensive-logic ideas derived from enriched
// OB trade analytics. Every estimate is explicitly labelled (Exact / Estimated
// / Requires exporter data). No strategy logic is executed, no store mutation,
// no backend. Estimated protections are optimistic upper bounds from flags
// only — they are NOT proven results and require candle-level simulation.

const PENETRATION_THRESHOLDS = [75, 90, 100];

const EMPTY_TRADES = [];

const FAST_STOPOUT_ORDER = ["same candle", "<15m", "15–60m", "1–4h", "4h+", "Limited Data"];

const PROTECTION_BACKLOG = [
    { title: "BE escape exact simulation", status: "Requires exporter data", body: "Intratrade return-to-entry timestamps needed to confirm a break-even exit actually triggered after breach." },
    { title: "Immediate breach exit exact simulation", status: "Requires exporter data", body: "Candle-level exit prices at the moment the far side of the OB is fully breached." },
    { title: "Penetration threshold sweep", status: "Requires exporter data", body: "Sweep exit thresholds with candle-level fills instead of capping flagged trades at 0R." },
    { title: "News blackout overlay", status: "Future data required", body: "High-impact news calendar to compare breach / fast-stopout rates inside news windows." },
    { title: "Pre-fill breach cancel", status: "Requires exporter data", body: "Pre-fill breach flags and pending-order lifecycle to model cancelling orders before entry." },
    { title: "Dynamic stop logic", status: "Future execution model", body: "Per-trade trailing / structure-based stops rather than a single run-level stop config." },
    { title: "Compare protection variants vs baseline", status: "Future simulation", body: "Run simulated protection variants side-by-side against the unprotected baseline." },
    { title: "Export protection configs to Python engine", status: "Requires exporter integration", body: "Serialize chosen protection rules back to the FX-OB backtester for exact re-simulation." },
    {
        title: "Confirmed OB Entry / Close-Inside Entry",
        status: "Future Entry Lab item",
        body: "Wait for a 1m candle to close inside the order block before triggering an entry model, instead of resting a passive limit at the OB edge. Intended to avoid straight-through blast fills. Variants: close-inside then market entry; close-inside then limit-at-edge retest; close-inside then stop/trigger entry; close-inside plus reaction/displacement confirmation. Caveat: may worsen spread/slippage or miss trades because entry becomes reactive rather than resting.",
    },
];

export default function ProtectionLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
    const trades = React.useMemo(() => (Array.isArray(TRADES) ? TRADES : EMPTY_TRADES), [TRADES]);
    const activeRun = activeRunId ? runs?.[activeRunId] : null;
    const closeTimingTrades = React.useMemo(() => tradesForCloseBreachTiming(trades, activeRun), [trades, activeRun]);
    const p = React.useMemo(() => buildProtection(trades), [trades]);
    const bt = React.useMemo(() => buildBreachTiming(trades, closeTimingTrades), [trades, closeTimingTrades]);
    const exactProtectionRows = React.useMemo(() => buildExactProtectionRows(activeRun, p.netR), [activeRun, p.netR]);
    const hasExactProtection = exactProtectionRows.length > 0;

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="PROTECTION LAB"
                title={ACTIVE_RUN?.id || "No active run"}
                subtitle={`${ACTIVE_RUN?.symbol || "Symbol"} · ${ACTIVE_RUN?.detectionTf || "TF"} · ${variantLabel(ACTIVE_TRADE_VARIANT)} — defensive logic on enriched OB analytics`}
                actions={(
                    <div className="flex items-center gap-2">
                        <Pill tone={activeRunId ? "primary" : "muted"}>{activeRunId ? "IMPORTED" : "MOCK"}</Pill>
                        <Pill tone="secondary">{p.n} TRADES</Pill>
                    </div>
                )}
            />

            {/* Baseline KPI row */}
            <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricChip label="Trades"       value={String(p.n)}              sub="active variant"               tone="primary"   icon={Hash} />
                <MetricChip label="Win Rate"     value={fmtPct(p.winRate)}        sub={`${p.wins}W / ${p.losses}L`}  tone="secondary" icon={Target} />
                <MetricChip label="Net R"        value={fmtR(p.netR)}             sub="cumulative"                   tone={p.netR >= 0 ? "primary" : "danger"} icon={TrendingUp} />
                <MetricChip label="Expectancy"   value={fmtExp(p.expectancy)}     sub="per trade"                    tone="primary"   icon={Activity} />
                <MetricChip label="Breached"     value={String(p.breached)}       sub={p.breachKnown ? `${p.breachKnown} flagged` : "no flags"} tone={p.breached ? "danger" : "muted"} icon={AlertTriangle} />
                <MetricChip label="Non-Breached" value={String(p.nonBreached)}    sub={`${p.breachUnknown} unknown`} tone={p.nonBreached ? "success" : "muted"} icon={ShieldCheck} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Research safety legend */}
                <NeonPanel
                    className="xl:col-span-3"
                    title="Research Safety · Estimate Confidence"
                    action={<div className="flex items-center gap-1.5"><ConfidenceTag level="exact" /><ConfidenceTag level="estimated" /><ConfidenceTag level="requires" /></div>}
                >
                    <div className="flex items-start gap-2 text-[11.5px] font-mono text-[hsl(var(--warning))]" data-testid="protlab-research-safety">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Estimated protections are optimistic upper bounds derived from breach / penetration flags only — not candle-level simulations, and not proven results.
                            Exact figures require exporter data: intratrade return-to-entry, candle-level exit prices, high-impact news windows, and pre-fill breach / pending lifecycle.
                        </span>
                    </div>
                    {hasExactProtection && (
                        <Note tone="muted">Exact results come from Python protection simulation. Estimated panels below are exploratory only.</Note>
                    )}
                </NeonPanel>

                {hasExactProtection && (
                    <NeonPanel
                        className="xl:col-span-3"
                        title="Exact Protection Simulation Results"
                        action={<Pill tone="success">{exactProtectionRows.length} MODES</Pill>}
                    >
                        <Note>Higher Net R and lower drawdown are better. Most protection modes currently underperform baseline.</Note>
                        <DataTable
                            testId="protlab-exact-protection"
                            columns={[
                                { key: "mode", label: "Mode", render: (r) => <ModeLabel row={r} /> },
                                { key: "threshold", label: "Threshold / Buffer", align: "right", render: (r) => r.thresholdLabel },
                                { key: "trades", label: "Trades", align: "right", render: (r) => fmtCount(r.trades) },
                                { key: "winRate", label: "WR", align: "right", render: (r) => fmtMaybePct(r.winRate) },
                                { key: "netR", label: "Net R", align: "right", render: (r) => (r.netR == null ? "—" : <ColoredR value={num(r.netR)} />) },
                                { key: "maxDD", label: "Max DD", align: "right", render: (r) => fmtMaybeR(r.maxDD) },
                                { key: "expectancy", label: "Expectancy", align: "right", render: (r) => fmtMaybeExp(r.expectancy) },
                                { key: "protectionExits", label: "Protection Exits", align: "right", render: (r) => fmtCount(r.protectionExits) },
                                { key: "avgProtectionExitR", label: "Avg Exit R", align: "right", render: (r) => fmtMaybeExp(r.avgProtectionExitR) },
                                { key: "totalProtectionExitR", label: "Total Exit R", align: "right", render: (r) => fmtMaybeR(r.totalProtectionExitR) },
                                { key: "winnersCut", label: "Winners Cut", align: "right", render: (r) => fmtCount(r.winnersCut) },
                                { key: "loserRSaved", label: "Loser R Saved", align: "right", render: (r) => fmtMaybeR(r.loserRSaved) },
                                { key: "netVsBaseline", label: "Net vs Baseline", align: "right", render: (r) => <DeltaVsBaseline row={r} /> },
                            ]}
                            rows={exactProtectionRows}
                            rowKey="mode"
                            selectedKey="baseline"
                        />
                        <Note>Baseline trade variants remain unchanged; protected trade CSVs are imported separately from normal variant switching.</Note>
                    </NeonPanel>
                )}

                {/* A) Baseline */}
                <NeonPanel title={hasExactProtection ? "A · Baseline · Exploratory Fallback" : "A · Baseline"} action={<ConfidenceTag level="exact" />}>
                    <Desc icon={ShieldCheck}>Original strategy result. No defensive intervention.</Desc>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11.5px] mt-3" data-testid="protlab-baseline">
                        {[
                            ["Trades", String(p.n)],
                            ["Wins", String(p.wins)],
                            ["Losses", String(p.losses)],
                            ["Win Rate", fmtPct(p.winRate)],
                            ["Net R", fmtR(p.netR)],
                            ["Expectancy", fmtExp(p.expectancy)],
                            ["Breached", String(p.breached)],
                            ["Non-Breached", String(p.nonBreached)],
                            ["Breach Unknown", String(p.breachUnknown)],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <div className="text-muted-lab uppercase tracking-wider text-[10px]">{k}</div>
                                <div className="text-right text-white">{v}</div>
                            </React.Fragment>
                        ))}
                    </div>
                </NeonPanel>

                {/* B) Break-even Escape After Breach */}
                <NeonPanel
                    title={hasExactProtection ? "B · Break-even Escape After Breach · Exploratory" : "B · Break-even Escape After Breach"}
                    action={<div className="flex items-center gap-1.5"><ConfidenceTag level="estimated" /><ConfidenceTag level="requires" /></div>}
                >
                    <Desc icon={AlertTriangle}>
                        If the OB fully breaches while the trade is active, arm a break-even escape. If price returns to entry, assume exit at 0R.
                    </Desc>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <MetricChip label="Breached Losses" value={String(p.breachedLossCount)} sub="flagged & losing" tone={p.breachedLossCount ? "danger" : "muted"} icon={AlertTriangle} />
                        <MetricChip label="Max R Saved" value={fmtR(p.maxSavedBreached)} sub="if all → BE (optimistic)" tone={p.maxSavedBreached > 0 ? "success" : "muted"} icon={ShieldCheck} />
                    </div>
                    <Note>Optimistic / not exact — assumes every breached loss returns to entry. Requires intratrade return-to-entry export for exact simulation.</Note>
                    <Note tone={p.breachKnown ? "muted" : "warning"}>
                        Breach flags present on {p.breachKnown} / {p.n} trades{p.breachKnown ? "" : " — requires exporter field ob_fully_breached"}.
                    </Note>
                </NeonPanel>

                {/* C) Immediate Exit After Full Breach */}
                <NeonPanel title={hasExactProtection ? "C · Immediate Exit After Full Breach · Exploratory" : "C · Immediate Exit After Full Breach"} action={<ConfidenceTag level="estimated" />}>
                    <Desc icon={ShieldAlert}>Exit immediately when the far side of the OB is fully breached.</Desc>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <MetricChip label="Affected" value={String(p.breached)} sub="breached trades" tone={p.breached ? "danger" : "muted"} icon={AlertTriangle} />
                        <MetricChip label="Current Net R" value={fmtR(p.breachedNetR)} sub="breached, as-is" tone={p.breachedNetR >= 0 ? "primary" : "danger"} icon={TrendingUp} />
                        <MetricChip label="If Capped 0R" value={fmtR(p.cappedBreachedNetR)} sub="losses → 0R" tone="secondary" icon={ShieldCheck} />
                        <MetricChip label="Improvement" value={fmtR(p.maxSavedBreached)} sub="theoretical" tone={p.maxSavedBreached > 0 ? "success" : "muted"} icon={TrendingUp} />
                    </div>
                    <Note>Rough estimate — caps breached losing trades at 0R; real exits may be better or worse. Needs candle-level exit price for exact figures.</Note>
                </NeonPanel>

                {/* D) Max Penetration Threshold */}
                <NeonPanel
                    className="xl:col-span-3"
                    title={hasExactProtection ? "D · Max Penetration Threshold · Exploratory" : "D · Max Penetration Threshold"}
                    action={<ConfidenceTag level="estimated" />}
                >
                    <Desc icon={Activity}>
                        Exit when OB penetration crosses a threshold. Theoretical saved R caps affected losing trades at 0R.
                    </Desc>
                    <DataTable
                        testId="protlab-penetration"
                        columns={[
                            { key: "threshold", label: "Threshold", render: (r) => `≥ ${r.threshold}%` },
                            { key: "count", label: "Affected", align: "right" },
                            { key: "curNet", label: "Current Net R", align: "right", render: (r) => <ColoredR value={r.curNet} /> },
                            { key: "savedR", label: "Theoretical Saved R", align: "right", render: (r) => <span className="text-[hsl(var(--success))]">{fmtR(r.savedR)}</span> },
                        ]}
                        rows={p.thresholds}
                        rowKey="threshold"
                    />
                    <Note tone="warning">Needs candle-level simulation for exact exit price.</Note>
                    <Note tone={p.penKnown ? "muted" : "warning"}>
                        Penetration data present on {p.penKnown} / {p.n} trades{p.penKnown ? "" : " — requires exporter field max_ob_penetration_pct"}.
                    </Note>
                </NeonPanel>

                {/* E) Fast Stopout Filter */}
                <NeonPanel
                    className="xl:col-span-3"
                    title="E · Fast Stopout Filter"
                    action={<div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" /><ConfidenceTag level="exact" /></div>}
                >
                    <Desc icon={Clock}>Descriptive only — distribution of trades by time-to-exit. No intervention applied.</Desc>
                    <DataTable
                        testId="protlab-fast-stopout"
                        columns={[
                            { key: "label", label: "Bucket" },
                            { key: "count", label: "Count", align: "right" },
                            { key: "netR", label: "Net R", align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "winRate", label: "Win Rate", align: "right", render: (r) => fmtPct(r.winRate) },
                        ]}
                        rows={p.fastBuckets}
                        rowKey="label"
                    />
                    {!p.hasFastData && <Note tone="warning">No time-to-exit data in current dataset — requires exporter fields same_candle_exit / minutes_to_exit.</Note>}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Fully Breached · Weekday × Hour (UTC)"
                    action={<Pill tone={bt.fullGrid.total ? "danger" : "muted"}>{bt.fullGrid.total} BREACHES</Pill>}>
                    <Desc icon={AlertTriangle}>Trades where the OB fully breached (or penetration ≥ 100%). Bucketed by entry / fill time (UTC).</Desc>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-2.5" data-testid="protlab-fullbreach-mini-chips">
                        <MetricChip label="Most Breached Hour"
                            value={bt.mostHour ? `${padH(bt.mostHour.hour)}:00 UTC` : "—"}
                            sub={bt.mostHour ? `${bt.mostHour.count} breach${bt.mostHour.count === 1 ? "" : "es"}` : "no breaches"}
                            tone={bt.mostHour ? "primary" : "muted"} icon={Clock} />
                        <MetricChip label="Worst Breach Hour"
                            value={bt.worstHour ? `${padH(bt.worstHour.hour)}:00 UTC` : "—"}
                            sub={bt.worstHour ? `${fmtR(bt.worstHour.netR)} net` : "by Net R"}
                            tone={bt.worstHour && bt.worstHour.netR < 0 ? "danger" : "muted"} icon={AlertTriangle} />
                        <MetricChip label="Most Breached Day"
                            value={bt.mostDay ? WEEKDAYS[bt.mostDay.day] : "—"}
                            sub={bt.mostDay ? `${bt.mostDay.count} breach${bt.mostDay.count === 1 ? "" : "es"}` : "no breaches"}
                            tone={bt.mostDay ? "primary" : "muted"} icon={Activity} />
                        <MetricChip label="Worst Breach Day"
                            value={bt.worstDay ? WEEKDAYS[bt.worstDay.day] : "—"}
                            sub={bt.worstDay ? `${fmtR(bt.worstDay.netR)} net` : "by Net R"}
                            tone={bt.worstDay && bt.worstDay.netR < 0 ? "danger" : "muted"} icon={AlertTriangle} />
                        <MetricChip label="Most Breached Session"
                            value={bt.mostSession && bt.mostSession.fullCount ? bt.mostSession.session : "—"}
                            sub={bt.mostSession && bt.mostSession.fullCount ? `${bt.mostSession.fullCount} breaches` : "no breaches"}
                            tone={bt.mostSession && bt.mostSession.fullCount ? "secondary" : "muted"} icon={Target} />
                        <MetricChip label="Worst Breach Session"
                            value={bt.worstSession ? bt.worstSession.session : "—"}
                            sub={bt.worstSession ? `${fmtR(bt.worstSession.netR)} net` : "by Net R"}
                            tone={bt.worstSession && bt.worstSession.netR < 0 ? "danger" : "muted"} icon={ShieldAlert} />
                        <MetricChip label="Breached Winners %"
                            value={bt.fullBreachCount ? fmtPct(bt.breachedWinnersPct) : "—"}
                            sub={bt.fullBreachCount ? `${bt.breachedWinners} / ${bt.fullBreachCount} breached` : "no breaches"}
                            tone={bt.fullBreachCount && bt.breachedWinnersPct > 0 ? "success" : "muted"} icon={ShieldCheck} />
                        <MetricChip label="Wick vs Close"
                            value={bt.hasBaselineCloseFields ? `${bt.fullBreachCount} / ${bt.closeConfirmed}` : "Limited Data"}
                            sub={bt.hasBaselineCloseFields ? `${fmtPct(bt.closeVsFullPct)} confirmed` : "baseline close fields missing"}
                            tone={bt.hasBaselineCloseFields ? "primary" : "muted"} icon={TrendingUp} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 2xl:grid-cols-[minmax(0,960px)_minmax(0,1fr)] gap-5 items-start">
                        <div className="min-w-0">
                            <WeekHourHeatmap grid={bt.fullGrid} testId="protlab-fullbreach-heatmap" />
                        </div>
                        <div className="min-w-0 space-y-3 self-start" data-testid="protlab-fullbreach-insights">
                            <InsightCluster>
                                <MiniInsightTable title="Session Distribution" rows={bt.sessionDistributionRows} columns={["session", "share"]} />
                                <MiniInsightTable title="Breach Rate by Session" rows={bt.sessionRateRows} columns={["session", "rate"]} />
                                <MiniInsightTable title="Breached Expectancy by Session" rows={bt.sessionExpectancyRows} columns={["session", "expectancy"]} />
                            </InsightCluster>
                            <InsightCluster>
                                <MiniInsightTable title="Top Toxic Hours" rows={bt.topToxicHours} columns={["hour", "netR"]} danger />
                                <InsightGroup title="Worst Day × Session">
                                    <InsightRow
                                        label={bt.worstDaySession ? bt.worstDaySession.label : "Limited Data"}
                                        value={bt.worstDaySession ? fmtR(bt.worstDaySession.netR) : "—"}
                                        sub={bt.worstDaySession ? `${bt.worstDaySession.count} breaches` : "no combo data"}
                                        tone="danger"
                                    />
                                </InsightGroup>
                                <InsightGroup title="Breached Losers">
                                    <InsightRow
                                        label="Loss Share"
                                        value={fmtPct(bt.breachedLosersPct)}
                                        sub={`${bt.breachedLosers} / ${bt.fullBreachCount}`}
                                        tone="danger"
                                    />
                                </InsightGroup>
                            </InsightCluster>
                        </div>
                    </div>
                    {bt.fullUndated > 0 && <Note tone="warning">{bt.fullUndated} fully-breached trade{bt.fullUndated === 1 ? "" : "s"} lack a parseable entry/fill time and are omitted from the grid.</Note>}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Close-Confirmed Breach · Weekday × Hour (UTC)"
                    action={<Pill tone={bt.hasCloseFields ? (bt.closeGrid.total ? "danger" : "muted") : "muted"}>{bt.hasCloseFields ? `${bt.closeGrid.total} CONFIRMED` : "LIMITED DATA"}</Pill>}>
                    {bt.hasCloseFields ? (
                        <>
                            <Desc icon={ShieldAlert}>Trades with a close-confirmed OB breach. Bucketed by close_breach_time (UTC).</Desc>
                            <div className="mt-3">
                                <WeekHourHeatmap grid={bt.closeGrid} testId="protlab-closebreach-heatmap" />
                            </div>
                            {bt.closeUndated > 0 && <Note tone="warning">{bt.closeUndated} close-confirmed breach{bt.closeUndated === 1 ? "" : "es"} lack a parseable close_breach_time and are omitted from the grid.</Note>}
                        </>
                    ) : (
                        <div data-testid="protlab-closebreach-heatmap">
                            <Note tone="warning">Limited Data — requires exporter fields close_confirmed_ob_breach / close_breach_time.</Note>
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Breach Session Breakdown (UTC)" action={<ConfidenceTag level={bt.hasBaselineCloseFields ? "exact" : "estimated"} />}>
                    <DataTable
                        testId="protlab-breach-session"
                        columns={[
                            { key: "session", label: "Session" },
                            { key: "fullCount", label: "Full Breach", align: "right" },
                            { key: "closeCount", label: "Close-Confirmed", align: "right", render: (r) => (bt.hasBaselineCloseFields ? String(r.closeCount) : "—") },
                            { key: "netR", label: "Net R", align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "avgR", label: "Avg R", align: "right", render: (r) => fmtExp(r.avgR) },
                            { key: "breachRate", label: "Breach Rate", align: "right", render: (r) => (r.breachRate == null ? "—" : fmtPct(r.breachRate)) },
                        ]}
                        rows={bt.sessionRows}
                        rowKey="session"
                    />
                    <Note>Net R / Avg R are over fully-breached trades per session (entry/fill session). Breach rate = full breaches ÷ trades in that session.</Note>
                </NeonPanel>

                <BreachSessionMatrix matrix={bt.matrix} />

                {/* F + G) Future protections */}
                <NeonPanel className="xl:col-span-3" title="Future Protections · Requires Exporter Data" action={<ConfidenceTag level="requires" />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="protlab-future">
                        <FutureCard icon={Newspaper} title="F · News Blackout"
                            body="Future filter to compare breach / fast-stopout rates around high-impact news windows."
                            status="Future data required" />
                        <FutureCard icon={Ban} title="G · Cancel Pending If Pre-Fill Breach"
                            body="Future rule: cancel a pending order if the OB is fully breached before entry."
                            status="Requires pre-fill breach export / pending lifecycle analytics" />
                    </div>
                </NeonPanel>

                {/* Protection backlog */}
                <NeonPanel className="xl:col-span-3" title="Protection Backlog" action={<div className="flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5 text-muted-lab" /><Pill tone="muted">{PROTECTION_BACKLOG.length} ITEMS</Pill></div>}>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5" data-testid="protlab-backlog">
                        {PROTECTION_BACKLOG.map((item) => (
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
            </div>
        </div>
    );
}

// ── Small presentational helpers ─────────────────────────────────────
function ConfidenceTag({ level }) {
    const map = {
        exact:     { tone: "success", text: "EXACT" },
        estimated: { tone: "warning", text: "ESTIMATED" },
        requires:  { tone: "muted",   text: "REQUIRES EXPORTER DATA" },
    };
    const c = map[level] || map.requires;
    return <Pill tone={c.tone}>{c.text}</Pill>;
}

function Desc({ icon: Icon, children }) {
    return (
        <p className="flex items-start gap-2 text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed">
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))]" />}
            <span>{children}</span>
        </p>
    );
}

function Note({ tone = "muted", children }) {
    const color = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-muted-lab";
    return <div className={`mt-2 text-[10.5px] font-mono leading-relaxed ${color}`}>{children}</div>;
}

function FutureCard({ icon: Icon, title, body, status }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-3 py-2.5">
            <div className="flex items-start gap-2 justify-between">
                <div className="flex items-center gap-2 text-[11.5px] font-display text-white leading-tight">
                    {Icon && <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />}
                    {title}
                </div>
                <Pill tone="muted">{status}</Pill>
            </div>
            <p className="mt-2 text-[11px] text-[hsl(var(--text-2))] leading-relaxed">{body}</p>
        </div>
    );
}

function InsightChip({ label, value, sub, tone = "primary" }) {
    const color = {
        primary: "text-[hsl(var(--accent-primary))]",
        secondary: "text-[hsl(var(--accent-secondary))]",
        danger: "text-[hsl(var(--danger))]",
        success: "text-[hsl(var(--success))]",
        muted: "text-white",
    }[tone] || "text-white";
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] clip-bevel-sm px-2.5 py-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-lab leading-tight">{label}</div>
            <div className={`font-display font-semibold tabular-nums text-[14px] leading-tight mt-1 ${color}`}>{value}</div>
            {sub && <div className="text-[9.5px] font-mono text-muted-lab mt-0.5">{sub}</div>}
        </div>
    );
}

function InsightGroup({ title, children, icon: Icon = Activity, tone = "primary" }) {
    const style = metricCardStyle(tone);
    return (
        <div className={`relative min-w-0 overflow-hidden border ${style.border} bg-[hsl(var(--panel-2)/0.52)] clip-bevel-sm px-4 py-3.5 ${style.glow}`}>
            <div className={`absolute left-3.5 top-3.5 h-1.5 w-1.5 rounded-full ${style.accent} shadow-[0_0_10px_currentColor]`} />
            {Icon && <Icon className="absolute right-3.5 top-3.5 w-4 h-4 text-muted-lab" />}
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-lab leading-tight truncate pl-4 pr-6 mb-3">{title}</div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function InsightCluster({ children }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {children}
        </div>
    );
}

function InsightRow({ label, value, sub, tone = "primary" }) {
    const color = {
        primary: "text-white",
        secondary: "text-[hsl(var(--accent-secondary))]",
        danger: "text-[hsl(var(--danger))]",
        success: "text-[hsl(var(--success))]",
        muted: "text-muted-lab",
    }[tone] || "text-white";
    return (
        <div className="flex items-start justify-between gap-3 font-mono text-[11.5px]">
            <span className="text-[hsl(var(--text-2))] leading-snug">{label}</span>
            <span className="text-right leading-tight shrink-0">
                <span className={`block text-[15px] font-semibold tabular-nums ${color}`}>{value}</span>
                {sub && <span className="block text-[10px] text-muted-lab mt-0.5">{sub}</span>}
            </span>
        </div>
    );
}

function MiniInsightTable({ title, rows, columns, danger = false, icon: Icon = Activity }) {
    const style = metricCardStyle(danger ? "danger" : "primary");
    return (
        <div className={`relative min-w-0 overflow-hidden border ${style.border} bg-[hsl(var(--panel-2)/0.52)] clip-bevel-sm px-4 py-3.5 ${style.glow}`}>
            <div className={`absolute left-3.5 top-3.5 h-1.5 w-1.5 rounded-full ${style.accent} shadow-[0_0_10px_currentColor]`} />
            {Icon && <Icon className="absolute right-3.5 top-3.5 w-4 h-4 text-muted-lab" />}
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-lab leading-tight mb-3 truncate pl-4 pr-6">{title}</div>
            <div className="space-y-2">
                {rows.length ? rows.map((row) => (
                    <div key={`${title}-${row[columns[0]]}`} className="flex items-center justify-between gap-3 font-mono text-[12px]">
                        <span className="text-[hsl(var(--text-2))] truncate leading-snug">{row[columns[0]]}</span>
                        <span className={`tabular-nums leading-snug shrink-0 ${danger ? "text-[hsl(var(--danger))]" : "text-white"}`}>{row[columns[1]]}</span>
                    </div>
                )) : (
                    <div className="text-[12px] font-mono text-muted-lab">Limited Data</div>
                )}
            </div>
        </div>
    );
}

function metricCardStyle(tone = "primary") {
    return {
        primary: {
            border: "border-[hsl(var(--accent-primary)/0.46)]",
            accent: "bg-[hsl(var(--accent-primary))]",
            value: "text-white",
            glow: "shadow-[0_0_24px_hsl(var(--accent-primary)/0.08)]",
        },
        secondary: {
            border: "border-[hsl(var(--accent-secondary)/0.46)]",
            accent: "bg-[hsl(var(--accent-secondary))]",
            value: "text-[hsl(var(--accent-secondary))]",
            glow: "shadow-[0_0_24px_hsl(var(--accent-secondary)/0.08)]",
        },
        danger: {
            border: "border-[hsl(var(--danger)/0.52)]",
            accent: "bg-[hsl(var(--danger))]",
            value: "text-[hsl(var(--danger))]",
            glow: "shadow-[0_0_24px_hsl(var(--danger)/0.08)]",
        },
        success: {
            border: "border-[hsl(var(--success)/0.52)]",
            accent: "bg-[hsl(var(--success))]",
            value: "text-[hsl(var(--success))]",
            glow: "shadow-[0_0_24px_hsl(var(--success)/0.08)]",
        },
        muted: {
            border: "border-[hsl(var(--border-soft))]",
            accent: "bg-[hsl(var(--border-soft))]",
            value: "text-muted-lab",
            glow: "",
        },
    }[tone] || metricCardStyle("primary");
}

function ModeLabel({ row }) {
    const labelClass = row.isBaseline
        ? "text-[hsl(var(--accent-secondary))]"
        : row.isBest
            ? "text-[hsl(var(--success))]"
            : row.underperforms
                ? "text-[hsl(var(--danger))]"
            : "text-white";
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-mono font-semibold ${labelClass}`}>{prettyMode(row.mode)}</span>
            {row.isBaseline && <Pill tone="secondary">BASELINE</Pill>}
            {row.isBest && <Pill tone="success">BEST NET R</Pill>}
            {row.underperforms && <Pill tone="danger">UNDERPERFORMS</Pill>}
        </div>
    );
}

function DeltaVsBaseline({ row }) {
    if (row.isBaseline) {
        return <span className="font-mono text-[hsl(var(--accent-secondary))]">BASELINE</span>;
    }
    if (row.netVsBaseline == null || !isFiniteNumber(row.netVsBaseline)) return "—";
    const value = Number(row.netVsBaseline);
    const color = value >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    return <span className={`font-mono font-semibold tabular-nums ${color}`}>{fmtR(value)}</span>;
}

// ── Analytics (pure, NaN-safe) ───────────────────────────────────────
function tradesForCloseBreachTiming(trades, run) {
    const base = Array.isArray(trades) ? trades : [];
    if (base.some(hasCloseBreachFields)) return base;
    const protectedTrades = Object.values(run?.protectionResults?.tradesByMode || {}).flat().filter(Boolean);
    const withCloseFields = protectedTrades.filter(hasCloseBreachFields);
    return withCloseFields.length ? withCloseFields : base;
}

function hasCloseBreachFields(trade) {
    return trade?.close_confirmed_ob_breach === true || !!trade?.close_breach_time;
}

function buildExactProtectionRows(run, fallbackBaselineNetR) {
    const pr = run?.protectionResults;
    if (!pr) return [];
    const summaryRows = flattenProtectionSummary(pr.summary);
    const summaryByMode = new Map(summaryRows.map((row) => [canonicalProtectionModeKey(row.mode || row.protection_mode, row), row]));
    const tradesByMode = normalizeProtectionTradesByMode(pr.tradesByMode || {});
    const modes = new Set([
        ...summaryRows.map((row) => canonicalProtectionModeKey(row.mode || row.protection_mode, row)).filter(Boolean),
        ...Object.keys(tradesByMode),
    ]);
    if (!modes.size) return [];

    const rows = [...modes].map((mode) => {
        const normalizedMode = canonicalProtectionModeKey(mode, summaryByMode.get(normalizeProtectionModeKey(mode)));
        const summary = summaryByMode.get(normalizedMode) || {};
        const trades = tradesByMode[normalizedMode] || [];
        return exactProtectionRow(mode, summary, trades);
    });

    const baseline = rows.find((row) => row.isBaseline);
    const baselineNetR = isFiniteNumber(baseline?.netR) ? Number(baseline.netR) : Number(fallbackBaselineNetR || 0);
    rows.forEach((row) => {
        if (!isFiniteNumber(row.netVsBaseline) && isFiniteNumber(row.netR)) {
            row.netVsBaseline = Number((Number(row.netR) - baselineNetR).toFixed(2));
        }
        row.underperforms = !row.isBaseline && isFiniteNumber(row.netR) && Number(row.netR) < baselineNetR;
    });
    const bestNetR = rows.reduce((best, row) => (
        isFiniteNumber(row.netR) && (!best || Number(row.netR) > Number(best.netR)) ? row : best
    ), null);
    if (bestNetR) bestNetR.isBest = true;

    return rows.sort((a, b) => {
        if (a.isBaseline !== b.isBaseline) return a.isBaseline ? -1 : 1;
        if (a.isBest !== b.isBest) return a.isBest ? -1 : 1;
        return Number(b.netR || 0) - Number(a.netR || 0);
    });
}

function exactProtectionRow(mode, summary, trades) {
    const protectionExitTrades = (trades || []).filter((t) => String(t?.protection_exit_reason || "").trim());
    const wins = (trades || []).filter((t) => Number(t?.r) > 0 || t?.outcome === "Win").length;
    const netR = (trades || []).reduce((sum, t) => sum + (Number(t?.r) || 0), 0);
    const protectionExitR = protectionExitTrades.reduce((sum, t) => sum + (Number(t?.r) || 0), 0);
    const summaryNetR = firstNumber(summary, "net_r", "netR", "net_r_total", "total_net_r", "net");
    const tradesCount = firstNumber(summary, "trades", "trade_count", "filled_trades", "total_trades", "count", "n_trades");
    const protectionExits = firstNumber(summary, "protection_exits", "protection_exit_count", "protection_exit_trades", "exits", "protection_exit_trades_count");
    const summaryWins = firstNumber(summary, "wins", "winning_trades");
    const summaryLosses = firstNumber(summary, "losses", "losing_trades");
    const summaryWinRate = firstNumber(summary, "win_rate", "winRate", "wr");
    const derivedWinRate = (trades || []).length ? (wins / trades.length) * 100 : null;
    return {
        mode: canonicalProtectionModeKey(mode || summary.protection_mode || summary.mode, summary),
        thresholdLabel: thresholdLabel(summary, mode),
        trades: tradesCount ?? (trades || []).length,
        winRate: normalizeWinRate(summaryWinRate) ?? (tradesCount && isFiniteNumber(summaryWins) ? (Number(summaryWins) / Number(tradesCount)) * 100 : null) ?? derivedWinRate,
        netR: summaryNetR ?? ((trades || []).length ? Number(netR.toFixed(2)) : null),
        maxDD: firstNumber(summary, "max_drawdown", "max_drawdown_r", "max_dd", "maxDD", "drawdown", "dd"),
        expectancy: firstNumber(summary, "expectancy", "avg_r", "average_r", "expectancy_r") ?? ((trades || []).length ? netR / trades.length : null),
        protectionExits: protectionExits ?? protectionExitTrades.length,
        avgProtectionExitR: firstNumber(summary, "avg_protection_exit_r", "average_protection_exit_r", "mean_protection_exit_r")
            ?? (protectionExitTrades.length ? protectionExitR / protectionExitTrades.length : null),
        totalProtectionExitR: firstNumber(summary, "total_protection_exit_r", "protection_exit_r", "protection_exits_r")
            ?? (protectionExitTrades.length ? Number(protectionExitR.toFixed(2)) : null),
        winnersCut: firstNumber(summary, "baseline_winners_cut", "winners_cut", "winning_trades_cut", "baseline_winners_converted"),
        loserRSaved: firstNumber(summary, "loser_r_saved", "loser_saved_r", "total_saved_r", "saved_r_from_losers", "total_saved_r_from_losers"),
        netVsBaseline: firstNumber(summary, "net_vs_baseline", "net_r_vs_baseline", "delta_net_r", "net_difference_vs_baseline", "r_saved_vs_baseline"),
        isBaseline: isBaselineMode(mode, summary),
        losses: summaryLosses,
    };
}

function flattenProtectionSummary(summary) {
    if (!summary || typeof summary !== "object") return [];
    if (Array.isArray(summary)) return summary.flatMap((row, i) => {
        if (!row || typeof row !== "object") return [];
        if (hasProtectionMetrics(row)) return [{ ...row, mode: canonicalProtectionModeKey(row.mode || row.protection_mode || `mode_${i + 1}`, row) }];
        return flattenProtectionSummary(row);
    });
    const nested = [];
    Object.entries(summary).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            nested.push(...flattenProtectionSummary(value));
        } else if (value && typeof value === "object") {
            if (["results", "modes", "variants", "protection_results"].includes(key) || !hasProtectionMetrics(value)) {
                nested.push(...flattenProtectionSummary(value));
            } else {
                nested.push({ ...value, mode: canonicalProtectionModeKey(value.mode || value.protection_mode || key, value) });
            }
        }
    });
    if (nested.length) return nested;
    return hasProtectionMetrics(summary) || summary.mode || summary.protection_mode
        ? [{ ...summary, mode: canonicalProtectionModeKey(summary.mode || summary.protection_mode, summary) }]
        : [];
}

function thresholdLabel(summary, mode) {
    const threshold = firstNumber(summary, "protection_threshold_pct", "protection_threshold", "threshold_pct", "threshold", "threshold_percent");
    const buffer = firstNumber(summary, "buffer_pips", "protection_buffer_pips", "close_breach_buffer_pips", "close_confirmed_buffer_pips", "buffer");
    if (isFiniteNumber(threshold)) return `${Number(threshold).toFixed(Number(threshold) % 1 ? 1 : 0)}%`;
    if (isFiniteNumber(buffer)) return `${Number(buffer).toFixed(Number(buffer) % 1 ? 1 : 0)} pips`;
    const m = String(mode || "");
    const pen = m.match(/penetration_(\d+)p?(\d+)?/);
    if (pen) return `${pen[1]}${pen[2] ? `.${pen[2]}` : ""}%`;
    const buf = m.match(/buffer_(\d+)p?(\d+)?/);
    if (buf) return `${buf[1]}${buf[2] ? `.${buf[2]}` : ""} pips`;
    return "—";
}

function isBaselineMode(mode, summary) {
    const text = canonicalProtectionModeKey(summary?.protection_mode || summary?.mode || mode || "", summary);
    return text === "baseline" || text === "none" || text === "no_protection";
}

function firstNumber(obj, ...keys) {
    for (const key of keys) {
        const value = obj?.[key];
        if (isFiniteNumber(value)) return Number(value);
    }
    return null;
}

function normalizeWinRate(value) {
    if (!isFiniteNumber(value)) return null;
    const n = Number(value);
    return n <= 1 ? n * 100 : n;
}

function isFiniteNumber(value) {
    return value != null && Number.isFinite(Number(value));
}

function normalizeProtectionTradesByMode(tradesByMode) {
    return Object.entries(tradesByMode || {}).reduce((acc, [mode, trades]) => {
        acc[canonicalProtectionModeKey(mode, Array.isArray(trades) ? trades[0] : null)] = Array.isArray(trades) ? trades : [];
        return acc;
    }, {});
}

function canonicalProtectionModeKey(value, row) {
    const norm = normalizeProtectionModeKey(value || row?.protection_mode || row?.mode || "");
    const threshold = firstNumber(row, "protection_threshold_pct", "protection_threshold", "threshold_pct", "threshold", "threshold_percent");
    const buffer = firstNumber(row, "buffer_pips", "protection_buffer_pips", "close_breach_buffer_pips", "close_confirmed_buffer_pips", "buffer");
    if (norm === "baseline" || norm === "none" || norm === "no_protection") return "baseline";
    if (norm.includes("full") && norm.includes("breach")) return "full_ob_breach_exit";
    if (norm.includes("penetration") && isFiniteNumber(threshold)) return `penetration_${numberToken(threshold)}`;
    if (norm.includes("close_confirmed") && isFiniteNumber(buffer)) return `close_confirmed_breach_buffer_${numberToken(buffer)}`;
    if (norm.includes("close_confirmed")) return "close_confirmed_breach";
    return norm;
}

function normalizeProtectionModeKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^trades_(single_position|allow_multi_position|one_per_direction)__/, "")
        .replace(/\.csv$/, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function numberToken(value) {
    return Number(value).toFixed(1).replace(".", "p");
}

function hasProtectionMetrics(row) {
    return firstNumber(row, "net_r", "netR", "filled_trades", "trade_count", "trades", "win_rate", "wr", "expectancy", "protection_exits") != null;
}

function prettyMode(mode) {
    return normalizeProtectionModeKey(mode || "unknown")
        .replace(/^trades_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildProtection(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const n = list.length;
    const rOf = (t) => (Number.isFinite(Number(t?.r)) ? Number(t.r) : 0);
    const isWin = (t) => rOf(t) > 0 || t?.outcome === "Win";
    const isLoss = (t) => rOf(t) < 0 || t?.outcome === "Loss";

    const wins = list.filter(isWin).length;
    const losses = list.filter(isLoss).length;
    const rawNet = list.reduce((s, t) => s + rOf(t), 0);
    const winRate = n ? (wins / n) * 100 : 0;
    const expectancy = n ? rawNet / n : 0;

    const breachKnown = list.filter((t) => t?.ob_fully_breached === true || t?.ob_fully_breached === false || Number.isFinite(Number(t?.max_ob_penetration_pct))).length;
    const breachedTrades = list.filter(isFullBreachTrade);
    const breached = breachedTrades.length;
    const nonBreached = list.filter((t) => !isFullBreachTrade(t) && (t?.ob_fully_breached === false || Number.isFinite(Number(t?.max_ob_penetration_pct)))).length;
    const breachUnknown = n - breachKnown;

    const breachedLosses = breachedTrades.filter((t) => rOf(t) < 0);
    const breachedNetR = breachedTrades.reduce((s, t) => s + rOf(t), 0);
    const maxSavedBreached = breachedLosses.reduce((s, t) => s - rOf(t), 0); // -Σ(negatives) ≥ 0
    const cappedBreachedNetR = breachedTrades.reduce((s, t) => s + Math.max(rOf(t), 0), 0);

    const penKnown = list.filter((t) => Number.isFinite(Number(t?.max_ob_penetration_pct))).length;
    const thresholds = PENETRATION_THRESHOLDS.map((threshold) => {
        const affected = list.filter((t) => Number.isFinite(Number(t?.max_ob_penetration_pct)) && Number(t.max_ob_penetration_pct) >= threshold);
        const curNet = affected.reduce((s, t) => s + rOf(t), 0);
        const savedR = affected.reduce((s, t) => s + (rOf(t) < 0 ? -rOf(t) : 0), 0);
        return { threshold, count: affected.length, curNet: round1(curNet), savedR: round1(savedR) };
    });

    const fastOf = (t) => {
        if (t?.same_candle_exit === true) return "same candle";
        const m = Number(t?.minutes_to_exit);
        if (!Number.isFinite(m)) return "Limited Data";
        if (m < 15) return "<15m";
        if (m < 60) return "15–60m";
        if (m < 240) return "1–4h";
        return "4h+";
    };
    const fastAll = FAST_STOPOUT_ORDER.map((label) => {
        const rows = list.filter((t) => fastOf(t) === label);
        const c = rows.length;
        const net = rows.reduce((s, t) => s + rOf(t), 0);
        const w = rows.filter(isWin).length;
        return { label, count: c, netR: round1(net), winRate: c ? (w / c) * 100 : 0 };
    });
    const hasFastData = fastAll.some((b) => b.label !== "Limited Data" && b.count > 0);
    // Hide the empty "Limited Data" bucket; keep named buckets for a stable view.
    const fastBuckets = fastAll.filter((b) => b.label !== "Limited Data" || b.count > 0);

    return {
        n, wins, losses, netR: round1(rawNet), winRate, expectancy,
        breachKnown, breached, nonBreached, breachUnknown,
        breachedLossCount: breachedLosses.length,
        breachedNetR: round1(breachedNetR),
        maxSavedBreached: round1(maxSavedBreached),
        cappedBreachedNetR: round1(cappedBreachedNetR),
        penKnown, thresholds,
        fastBuckets, hasFastData,
    };
}

function variantLabel(v) {
    return {
        single_position: "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction: "One per direction",
        unknown: "Trades",
    }[v] || v || "N/A";
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v) => Number(num(v).toFixed(1));
const fmtR = (v) => `${num(v) >= 0 ? "+" : ""}${round1(v).toFixed(1)}R`;
const fmtPct = (v) => `${round1(v).toFixed(1)}%`;
const fmtExp = (v) => `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(3)}R`;
const fmtCount = (v) => (isFiniteNumber(v) ? String(Number(v)) : "—");
const fmtMaybeR = (v) => (isFiniteNumber(v) ? fmtR(v) : "—");
const fmtMaybePct = (v) => (isFiniteNumber(v) ? fmtPct(v) : "—");
const fmtMaybeExp = (v) => (isFiniteNumber(v) ? fmtExp(v) : "—");

// ── Breach timing constants + helpers ────────────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const BREACH_SESSIONS = ["Asia", "London", "London Lull", "New York", "Outside"];
const dayIndex = (utcDay) => (utcDay + 6) % 7; // Sun(0)→6 … Sat(6)→5, so Mon=0
const padH = (h) => String(h).padStart(2, "0");
const cellR = (v) => `${num(v) >= 0 ? "+" : ""}${round1(v).toFixed(1)}`;

function rMulti(t) {
    if (Number.isFinite(Number(t?.r))) return Number(t.r);
    if (Number.isFinite(Number(t?.pnl_r))) return Number(t.pnl_r);
    return 0;
}

function isFullBreachTrade(t) {
    return t?.ob_fully_breached === true ||
        (Number.isFinite(Number(t?.max_ob_penetration_pct)) && Number(t.max_ob_penetration_pct) >= 100);
}

function buildBreachTiming(trades, closeSourceTrades = trades) {
    const list = Array.isArray(trades) ? trades : [];
    const closeList = Array.isArray(closeSourceTrades) ? closeSourceTrades : list;

    const fullBreach = list.filter(isFullBreachTrade);

    const baselineCloseKnown = list.filter((t) => t?.close_confirmed_ob_breach === true || t?.close_confirmed_ob_breach === false || !!t?.close_breach_time).length;
    const baselineCloseConfirmedTrades = list.filter((t) => t?.close_confirmed_ob_breach === true || !!t?.close_breach_time);
    const closeHeatmapKnown = closeList.filter((t) => t?.close_confirmed_ob_breach === true || t?.close_confirmed_ob_breach === false || !!t?.close_breach_time).length;
    const closeHeatmapTrades = closeList.filter((t) => t?.close_confirmed_ob_breach === true || !!t?.close_breach_time);

    const tradeTime = (t) => parseDate(t?.fill_time || t?.entry);
    const tradeSession = (t) => deriveSessionFromTimestamp(tradeTime(t)) || "Unknown";
    const breachSession = (t) =>
        normalizeSession(t?.close_breach_session) ||
        deriveSessionFromTimestamp(parseDate(t?.close_breach_time)) ||
        "Unknown";
    const originSession = (t) =>
        normalizeSession(t?.obOriginSession) ||
        deriveSessionFromTimestamp(parseDate(t?.obOriginTime || t?.obDetectionTime)); // null when absent

    // Full-breach grid — by entry/fill time (UTC)
    const fullEvents = fullBreach
        .map((t) => { const d = tradeTime(t); return d ? { day: dayIndex(d.getUTCDay()), hour: d.getUTCHours(), r: rMulti(t) } : null; })
        .filter(Boolean);
    const fullGrid = buildGrid(fullEvents);
    const fullUndated = fullBreach.length - fullEvents.length;

    // Close-confirmed grid — by close_breach_time (UTC)
    const closeEvents = closeHeatmapTrades
        .map((t) => { const d = parseDate(t?.close_breach_time); return d ? { day: dayIndex(d.getUTCDay()), hour: d.getUTCHours(), r: rMulti(t) } : null; })
        .filter(Boolean);
    const closeGrid = buildGrid(closeEvents);
    const closeUndated = closeHeatmapTrades.length - closeEvents.length;
    const hasCloseFields = closeEvents.length > 0;

    // Session breakdown
    const sessionRows = BREACH_SESSIONS.map((s) => breachSessionRow(s, list, fullBreach, baselineCloseConfirmedTrades, tradeSession, breachSession));
    const unknownRow = breachSessionRow("Unknown", list, fullBreach, baselineCloseConfirmedTrades, tradeSession, breachSession);
    if (unknownRow.fullCount || unknownRow.closeCount) sessionRows.push(unknownRow);

    // Summary chips
    let mostHour = null, worstHour = null;
    Object.entries(fullGrid.byHour).forEach(([h, v]) => {
        const e = { hour: Number(h), count: v.count, netR: round1(v.netR) };
        if (mostHour == null || e.count > mostHour.count) mostHour = e;
        if (worstHour == null || v.netR < worstHour.netR) worstHour = e;
    });
    let mostSession = null;
    sessionRows.forEach((r) => { if (mostSession == null || r.fullCount > mostSession.fullCount) mostSession = r; });
    let worstSession = null;
    sessionRows.forEach((r) => { if (r.fullCount && (worstSession == null || r.netR < worstSession.netR)) worstSession = r; });

    let mostDay = null, worstDay = null;
    Object.entries(fullGrid.byDay).forEach(([d, v]) => {
        const e = { day: Number(d), count: v.count, netR: round1(v.netR) };
        if (mostDay == null || e.count > mostDay.count) mostDay = e;
        if (worstDay == null || v.netR < worstDay.netR) worstDay = e;
    });

    const sessionByName = (name) => sessionRows.find((r) => r.session === name) || null;
    const newYork = sessionByName("New York");
    const london = sessionByName("London");

    const closeRate = baselineCloseKnown ? (baselineCloseConfirmedTrades.length / baselineCloseKnown) * 100 : null;
    const fullBreachCount = fullBreach.length;
    const breachedWinners = fullBreach.filter((t) => rMulti(t) > 0).length;
    const breachedLosers = fullBreach.filter((t) => rMulti(t) < 0).length;
    const hasBaselineCloseFields = baselineCloseKnown > 0;
    const sessionDistributionRows = sessionRows
        .filter((row) => BREACH_SESSIONS.includes(row.session))
        .map((row) => ({
            session: `${row.session} · ${row.fullCount}`,
            share: fullBreachCount ? fmtPct((row.fullCount / fullBreachCount) * 100) : "0.0%",
        }));
    const sessionRateRows = sessionRows
        .filter((row) => BREACH_SESSIONS.includes(row.session))
        .map((row) => ({
            session: row.session,
            rate: row.breachRate == null ? "Limited Data" : fmtPct(row.breachRate),
        }));
    const sessionExpectancyRows = sessionRows
        .filter((row) => BREACH_SESSIONS.includes(row.session))
        .map((row) => ({
            session: row.session,
            expectancy: row.fullCount ? fmtExp(row.avgR) : "—",
        }));
    const topToxicHours = Object.entries(fullGrid.byHour)
        .map(([h, v]) => ({ hour: `${padH(Number(h))}:00 UTC · ${v.count}`, netR: fmtR(v.netR), rawNetR: v.netR }))
        .sort((a, b) => a.rawNetR - b.rawNetR)
        .slice(0, 3);
    const worstDaySession = buildWorstDaySession(fullBreach, tradeTime, tradeSession);

    // Origin × breach-session matrix (over full-breach population)
    const hasOrigin = fullBreach.some((t) => originSession(t) != null);
    const matrix = hasOrigin ? buildBreachMatrix(fullBreach, originSession, tradeSession) : null;

    return {
        fullGrid, fullUndated,
        closeGrid, closeUndated, hasCloseFields,
        closeConfirmed: baselineCloseConfirmedTrades.length,
        closeHeatmapConfirmed: closeHeatmapTrades.length,
        closeKnown: baselineCloseKnown,
        closeHeatmapKnown,
        hasBaselineCloseFields,
        fullBreachCount,
        breachedWinners,
        breachedLosers,
        breachedWinnersPct: fullBreachCount ? (breachedWinners / fullBreachCount) * 100 : 0,
        breachedLosersPct: fullBreachCount ? (breachedLosers / fullBreachCount) * 100 : 0,
        closeVsFullPct: fullBreachCount ? (baselineCloseConfirmedTrades.length / fullBreachCount) * 100 : 0,
        sessionDistributionRows,
        sessionRateRows,
        sessionExpectancyRows,
        topToxicHours,
        worstDaySession,
        sessionRows, mostHour, worstHour, mostSession, worstSession,
        mostDay, worstDay, newYork, london, closeRate, matrix,
    };
}

function buildWorstDaySession(fullBreach, tradeTime, tradeSession) {
    const groups = {};
    fullBreach.forEach((trade) => {
        const d = tradeTime(trade);
        if (!d) return;
        const session = tradeSession(trade);
        const label = `${WEEKDAYS[dayIndex(d.getUTCDay())]} · ${session}`;
        if (!groups[label]) groups[label] = { label, count: 0, netR: 0 };
        groups[label].count += 1;
        groups[label].netR += rMulti(trade);
    });
    const rows = Object.values(groups);
    if (!rows.length) return null;
    const worst = rows.reduce((acc, row) => (!acc || row.netR < acc.netR ? row : acc), null);
    return { ...worst, netR: round1(worst.netR) };
}

function breachSessionRow(session, list, fullBreach, closeConfirmedTrades, tradeSession, breachSession) {
    const fullInS = fullBreach.filter((t) => tradeSession(t) === session);
    const closeInS = closeConfirmedTrades.filter((t) => breachSession(t) === session);
    const totalInS = list.filter((t) => tradeSession(t) === session).length;
    const netR = fullInS.reduce((acc, t) => acc + rMulti(t), 0);
    return {
        session,
        fullCount: fullInS.length,
        closeCount: closeInS.length,
        netR: round1(netR),
        avgR: fullInS.length ? netR / fullInS.length : 0,
        breachRate: totalInS ? (fullInS.length / totalInS) * 100 : null,
    };
}

function buildGrid(events) {
    const cells = {};
    const byHour = {};
    const byDay = {};
    let total = 0;
    events.forEach(({ day, hour, r }) => {
        const rv = Number.isFinite(Number(r)) ? Number(r) : 0;
        const key = `${day}-${hour}`;
        if (!cells[key]) cells[key] = { count: 0, netR: 0 };
        cells[key].count += 1; cells[key].netR += rv;
        if (!byHour[hour]) byHour[hour] = { count: 0, netR: 0 };
        byHour[hour].count += 1; byHour[hour].netR += rv;
        if (!byDay[day]) byDay[day] = { count: 0, netR: 0 };
        byDay[day].count += 1; byDay[day].netR += rv;
        total += 1;
    });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    return { cells, byHour, byDay, total, maxAbs };
}

function buildBreachMatrix(events, rowFn, colFn) {
    const cols = [...BREACH_SESSIONS, "Unknown"];
    const cells = {};
    const rowSet = new Set();
    const rows = [];
    events.forEach((t) => {
        const row = rowFn(t) || "Unknown";
        const col = colFn(t) || "Unknown";
        if (!rowSet.has(row)) { rowSet.add(row); rows.push(row); }
        const key = `${row}|||${col}`;
        if (!cells[key]) cells[key] = { count: 0, netR: 0 };
        cells[key].count += 1;
        cells[key].netR += rMulti(t);
    });
    const maxAbs = Object.values(cells).reduce((m, c) => Math.max(m, Math.abs(c.netR)), 0) || 1;
    Object.values(cells).forEach((c) => { c.netR = round1(c.netR); });
    return { rows: rows.length ? rows : ["Unknown"], cols, cells, maxAbs, total: events.length };
}

function parseDate(value) {
    if (value == null || value === "") return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
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
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return null;
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hour >= 0 && hour < 7) return "Asia";
    if (hour >= 7 && hour < 10) return "London";
    if (hour >= 10 && hour < 12) return "London Lull";
    if (hour >= 12 && hour < 17) return "New York";
    return "Outside";
}

function WeekHourHeatmap({ grid, testId }) {
    if (!grid.total) {
        return <div data-testid={testId} className="py-6 text-center text-muted-lab font-mono text-[12px]">No breaches recorded for this view.</div>;
    }
    return (
        <div className="overflow-x-auto scrollbar-thin" data-testid={testId}>
            <table className="min-w-[820px] font-mono text-[10.5px] border-separate border-spacing-1">
                <thead>
                    <tr>
                        <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider whitespace-nowrap">Day / Hr (UTC)</th>
                        {HOURS.map((h) => (
                            <th key={h} className="text-muted-lab px-1 py-1 text-[9px] tabular-nums">{padH(h)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {WEEKDAYS.map((wd, di) => (
                        <tr key={wd}>
                            <td className="text-muted-lab px-2 py-1">{wd}</td>
                            {HOURS.map((h) => {
                                const c = grid.cells[`${di}-${h}`];
                                if (!c || !c.count) {
                                    return (
                                        <td key={h}>
                                            <div className="clip-bevel-sm px-1 py-1 text-center text-muted-lab bg-[hsl(var(--panel-2)/0.4)]">·</div>
                                        </td>
                                    );
                                }
                                const alpha = (0.16 + 0.5 * (Math.abs(c.netR) / grid.maxAbs)).toFixed(3);
                                const bg = c.netR >= 0 ? `hsl(var(--accent-primary) / ${alpha})` : `hsl(var(--bear) / ${alpha})`;
                                return (
                                    <td key={h}>
                                        <div className="clip-bevel-sm px-1 py-1 text-center text-white tabular-nums leading-tight"
                                            style={{ background: bg }}
                                            title={`${wd} ${padH(h)}:00 UTC · ${c.count} breach${c.count === 1 ? "" : "es"} · ${fmtR(c.netR)}`}>
                                            <div>{c.count}</div>
                                            <div className="text-[8px] text-white/70">{cellR(c.netR)}</div>
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BreachSessionMatrix({ matrix }) {
    if (!matrix) {
        return (
            <NeonPanel className="xl:col-span-3" title="Origin Session × Breach Session (UTC)" action={<Pill tone="muted">LIMITED DATA</Pill>}>
                <div data-testid="protlab-breach-matrix">
                    <Note tone="warning">Limited Data — origin session unavailable (requires obOriginSession / obOriginTime). Cannot build the origin × breach matrix.</Note>
                </div>
            </NeonPanel>
        );
    }
    return (
        <NeonPanel className="xl:col-span-3" title="Origin Session × Breach Session (UTC)" action={<Pill tone="muted">{matrix.total} BREACHES</Pill>}>
            <div className="overflow-x-auto scrollbar-thin" data-testid="protlab-breach-matrix">
                <table className="w-full min-w-[640px] font-mono text-[11px] border-separate border-spacing-1">
                    <thead>
                        <tr>
                            <th className="text-muted-lab text-left px-2 py-1 text-[10px] uppercase tracking-wider whitespace-nowrap">Origin / Breach</th>
                            {matrix.cols.map((c) => (
                                <th key={c} className="text-muted-lab px-2 py-1 text-[10px] uppercase tracking-wider">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map((row) => (
                            <tr key={row}>
                                <td className="text-muted-lab px-2 py-1 whitespace-nowrap">{row}</td>
                                {matrix.cols.map((col) => {
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
                                            <div className="clip-bevel-sm px-2 py-1.5 text-center text-white tabular-nums leading-tight" style={{ background: bg }}>
                                                <div>{cell.count}</div>
                                                <div className="text-[9px] text-white/70">{cellR(cell.netR)}</div>
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
