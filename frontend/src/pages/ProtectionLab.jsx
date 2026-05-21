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
];

export default function ProtectionLab() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId } = useDataset();
    const trades = Array.isArray(TRADES) ? TRADES : [];
    const p = React.useMemo(() => buildProtection(trades), [trades]);

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
                </NeonPanel>

                {/* A) Baseline */}
                <NeonPanel title="A · Baseline" action={<ConfidenceTag level="exact" />}>
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
                    title="B · Break-even Escape After Breach"
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
                <NeonPanel title="C · Immediate Exit After Full Breach" action={<ConfidenceTag level="estimated" />}>
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
                    title="D · Max Penetration Threshold"
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

// ── Analytics (pure, NaN-safe) ───────────────────────────────────────
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

    const breachKnown = list.filter((t) => t?.ob_fully_breached === true || t?.ob_fully_breached === false).length;
    const breachedTrades = list.filter((t) => t?.ob_fully_breached === true);
    const breached = breachedTrades.length;
    const nonBreached = list.filter((t) => t?.ob_fully_breached === false).length;
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
