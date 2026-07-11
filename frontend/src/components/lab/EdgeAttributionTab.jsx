import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { buildEdgeAttribution, fmtPF, fmtR, DECISION_TONE } from "@/data/edgeAttribution";
import {
    TrendingUp, Activity, Target, Percent, ArrowDownRight, Hash,
    AlertTriangle, Lightbulb, Layers, Trash2, Stethoscope, FlaskConical, ChevronRight,
} from "lucide-react";

// ---------- shared bits ----------
function SectionNote({ children }) {
    return <div className="mb-3 font-ui text-[11px] text-muted-lab">{children}</div>;
}
const rTone = (v) => (v > 0 ? "text-[hsl(var(--accent-primary))]" : v < 0 ? "text-[hsl(var(--bear))]" : "text-muted-lab");
const round1 = (v) => (v == null ? "—" : Number(v).toFixed(1));

const TONE_CLS = {
    success: "bg-[hsl(var(--accent-primary)/0.16)] text-[hsl(var(--accent-primary))]",
    warning: "bg-[hsl(var(--warning,40_90%_55%)/0.16)] text-[hsl(var(--warning,40_90%_55%))]",
    danger: "bg-[hsl(var(--bear)/0.16)] text-[hsl(var(--bear))]",
    muted: "bg-[hsl(var(--muted)/0.20)] text-muted-lab",
    secondary: "bg-[hsl(var(--panel-2))] text-foreground",
};
function DecisionChip({ decision }) {
    if (!decision) return null;
    const tone = DECISION_TONE[decision] || "muted";
    return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9.5px] font-ui font-medium leading-none ${TONE_CLS[tone]}`}>{decision}</span>;
}
function ReasonTags({ reasons }) {
    if (!reasons || !reasons.length) return null;
    return (
        <div className="mt-0.5 flex flex-wrap justify-end gap-1">
            {reasons.map((r) => (
                <span key={r} className="rounded bg-[hsl(var(--muted)/0.18)] px-1 py-[1px] text-[8.5px] leading-none text-muted-lab">{r}</span>
            ))}
        </div>
    );
}
// green = gross win R, red = gross loss R, total width ∝ gross turnover → churny cohorts look wide & ~50/50
function QualityBar({ win, loss, maxTurnover, height = "h-2" }) {
    const turn = (win || 0) + (loss || 0);
    if (turn <= 0) return <div className={`${height} w-full rounded bg-[hsl(var(--muted)/0.12)]`} />;
    const widthPct = maxTurnover ? Math.max(8, Math.round((100 * turn) / maxTurnover)) : 100;
    const winShare = Math.round((100 * (win || 0)) / turn);
    return (
        <div className="w-full" title={`gross +${win} / −${loss}R · turnover ${round1(turn)}R`}>
            <div className={`${height} flex overflow-hidden rounded`} style={{ width: `${widthPct}%` }}>
                <div style={{ width: `${winShare}%`, background: "hsl(var(--accent-primary) / 0.8)" }} />
                <div style={{ width: `${100 - winShare}%`, background: "hsl(var(--bear) / 0.8)" }} />
            </div>
        </div>
    );
}
function cohortTip(c) {
    return [
        `Gross: +${c.grossWinR} / -${c.grossLossR} R · turnover ${c.turnover}R`,
        `Avg: win +${c.avgWinR}R / loss ${c.avgLossR}R`,
        `Cohort max DD: ${c.maxDD}R${c.ddPerNet != null ? ` (${c.ddPerNet}× net)` : ""}`,
        c.costR != null ? `Cost: ${c.costR}R${c.costPct != null ? ` (${c.costPct}% of gross)` : ""}` : null,
        `Contribution: ${c.contrib}% of net`,
        c.reasons && c.reasons.length ? `Reasons: ${c.reasons.join(", ")}` : null,
    ].filter(Boolean).join(" · ");
}

// ---------- cohort table: gross Win/Loss ALWAYS visible + quality bar + decision ----------
function CohortTable({ rows, label = "cohort" }) {
    const maxTurn = Math.max(1, ...rows.map((r) => r.turnover || 0));
    return (
        <table className="w-full text-[11px] font-num tabular-nums">
            <thead>
                <tr className="text-muted-lab text-left">
                    <th className="font-ui font-medium py-1 pr-2">{label}</th>
                    <th className="text-right pr-2">n</th>
                    <th className="text-right pr-2">Net R</th>
                    <th className="text-right pr-2" title="gross win R">Win R</th>
                    <th className="text-right pr-2" title="gross loss R">Loss R</th>
                    <th className="text-right pr-2" title="winning vs losing trades">W–L</th>
                    <th className="text-right pr-2">PF</th>
                    <th className="text-right pr-2" title="expectancy, R per trade">Exp</th>
                    <th className="pr-2" title="green win / red loss, width ∝ turnover">Quality</th>
                    <th className="text-right">Decision</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((c) => (
                    <tr key={c.key} className="border-t border-[hsl(var(--grid))] hover:bg-[hsl(var(--panel-2)/0.5)]" title={cohortTip(c)}>
                        <td className="font-ui py-1.5 pr-2 text-foreground">{c.key}</td>
                        <td className="text-right pr-2 text-muted-lab">{c.n}</td>
                        <td className={`text-right pr-2 text-[12px] font-semibold ${rTone(c.netR)}`}>{fmtR(c.netR)}</td>
                        <td className="text-right pr-2 text-[hsl(var(--accent-primary))]">+{c.grossWinR}</td>
                        <td className="text-right pr-2 text-[hsl(var(--bear))]">−{c.grossLossR}</td>
                        <td className="text-right pr-2 text-muted-lab">{c.winCount}–{c.lossCount}</td>
                        <td className="text-right pr-2">{fmtPF(c.pf)}</td>
                        <td className={`text-right pr-2 ${rTone(c.exp)}`}>{c.exp >= 0 ? "+" : ""}{c.exp}</td>
                        <td className="py-1 pr-2 align-middle" style={{ minWidth: 64 }}><QualityBar win={c.grossWinR} loss={c.grossLossR} maxTurnover={maxTurn} /></td>
                        <td className="py-1 text-right">
                            <DecisionChip decision={c.decision} />
                            <ReasonTags reasons={c.reasons} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ---------- session × direction matrix: Net R + gross pair + quality bar + decision ----------
function Matrix({ matrix }) {
    const cells = matrix.flatMap((r) => ["Long", "Short"].map((d) => r[d]));
    const maxAbs = Math.max(1, ...cells.map((c) => Math.abs(c.netR)));
    const maxTurn = Math.max(1, ...cells.map((c) => c.turnover || 0));
    const cellStyle = (v, n) => {
        if (!n) return { background: "hsl(var(--muted) / 0.05)" };
        const a = Math.min(0.85, 0.14 + (Math.abs(v) / maxAbs) * 0.71);
        const hue = v > 0 ? "var(--accent-primary)" : v < 0 ? "var(--bear)" : "var(--muted)";
        return { background: `hsl(${hue} / ${v === 0 ? 0.08 : a})` };
    };
    return (
        <table className="w-full text-[11px] font-num tabular-nums">
            <thead>
                <tr className="text-muted-lab">
                    <th className="text-left font-ui font-medium py-1">Session</th>
                    <th className="text-center px-2">Long</th>
                    <th className="text-center px-2">Short</th>
                </tr>
            </thead>
            <tbody>
                {matrix.map((r) => (
                    <tr key={r.session}>
                        <td className="font-ui text-foreground py-1 pr-2 align-middle">{r.session}</td>
                        {["Long", "Short"].map((d) => {
                            const c = r[d];
                            return (
                                <td key={d} className="px-1 py-1 align-top">
                                    {c.n === 0 ? (
                                        <div className="rounded px-2 py-4 text-center text-[10px] text-muted-lab" style={cellStyle(0, 0)}>—</div>
                                    ) : (
                                        <div className="rounded px-2 py-1.5" style={cellStyle(c.netR, c.n)} title={cohortTip(c)}>
                                            <div className="flex items-baseline justify-between">
                                                <span className={`text-[14px] font-semibold leading-tight ${rTone(c.netR)}`}>{fmtR(c.netR)}</span>
                                                <span className="font-num text-[9.5px]"><span className="text-[hsl(var(--accent-primary))]">+{c.grossWinR}</span> <span className="text-muted-lab">/</span> <span className="text-[hsl(var(--bear))]">−{c.grossLossR}</span></span>
                                            </div>
                                            <div className="my-1"><QualityBar win={c.grossWinR} loss={c.grossLossR} maxTurnover={maxTurn} height="h-1.5" /></div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-muted-lab">n {c.n} · {c.winCount}W–{c.lossCount}L · PF {fmtPF(c.pf)}</span>
                                                <DecisionChip decision={c.decision} />
                                            </div>
                                        </div>
                                    )}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ---------- "Where it leaks": drains + dead weight, folded into one Risks block ----------
function LeaksBlock({ negatives, deadWeight }) {
    const seen = new Set();
    const items = [];
    for (const c of negatives) { if (!seen.has(c.key)) { seen.add(c.key); items.push({ ...c, kind: "drain" }); } }
    for (const c of deadWeight) { if (!seen.has(c.key)) { seen.add(c.key); items.push({ ...c, kind: "dead" }); } }
    if (!items.length) return <div className="font-ui text-[11px] text-muted-lab">No material drains or dead-weight cohorts.</div>;
    const maxTurn = Math.max(1, ...items.map((i) => i.turnover || 0));
    return (
        <div className="space-y-1">
            {items.map((c) => (
                <div key={c.key} className="flex items-center gap-2 rounded bg-[hsl(var(--bear)/0.06)] px-2 py-1 font-num text-[11px]" title={cohortTip(c)}>
                    {c.kind === "dead"
                        ? <Trash2 className="h-3 w-3 shrink-0 text-muted-lab" />
                        : <ArrowDownRight className="h-3 w-3 shrink-0 text-[hsl(var(--bear))]" />}
                    <span className="font-ui text-foreground w-40 shrink-0 truncate">{c.key}</span>
                    <div className="w-24 shrink-0"><QualityBar win={c.grossWinR} loss={c.grossLossR} maxTurnover={maxTurn} /></div>
                    <span className={`shrink-0 font-semibold ${rTone(c.netR)}`}>{fmtR(c.netR)}</span>
                    <span className="text-muted-lab shrink-0">n {c.n} · turn {c.turnover}R</span>
                    <span className="ml-auto shrink-0"><DecisionChip decision={c.decision} /></span>
                </div>
            ))}
        </div>
    );
}

// ---------- health axis bars (transparent sub-scores) ----------
function scoreHue(s) { return s >= 70 ? "var(--accent-primary)" : s >= 45 ? "var(--warning,40_90%_55%)" : "var(--bear)"; }
function HealthAxes({ axes }) {
    return (
        <div className="space-y-1.5">
            {axes.map((a) => (
                <div key={a.axis} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 font-ui text-[10.5px] text-muted-lab">{a.axis}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-[hsl(var(--muted)/0.15)]">
                        <div className="h-full rounded" style={{ width: `${a.score}%`, background: `hsl(${scoreHue(a.score)} / 0.85)` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right font-num text-[10.5px] text-foreground">{a.score}</span>
                    <span className="hidden w-44 shrink-0 truncate font-num text-[9.5px] text-muted-lab sm:inline">{a.detail}</span>
                </div>
            ))}
        </div>
    );
}

const sevTone = { high: "text-[hsl(var(--bear))]", medium: "text-[hsl(var(--warning,40_90%_55%))]", info: "text-muted-lab" };
const prioTone = { High: "danger", Medium: "warning", Low: "muted" };

// ---------- diagnosis line helper ----------
function DxLine({ title, children, tone }) {
    return (
        <div className="rounded border border-[hsl(var(--grid))] bg-[hsl(var(--panel-2))] px-2.5 py-1.5">
            <div className="font-ui text-[10px] uppercase text-muted-lab">{title}</div>
            <div className={`mt-0.5 font-num text-[11.5px] ${tone || "text-foreground"}`}>{children}</div>
        </div>
    );
}

export default function EdgeAttributionTab({ trades, bundle }) {
    const ea = React.useMemo(() => buildEdgeAttribution(trades, { pipSize: bundle?.config?.pip_size }), [trades, bundle]);

    if (!ea.ok) {
        return (
            <NeonPanel className="xl:col-span-3" title="Run Intelligence — Strategy Doctor">
                <div className="py-10 text-center">
                    <div className="font-ui text-[13px] text-foreground">No filled trades to attribute.</div>
                    <div className="mt-1 font-ui text-[11px] text-muted-lab">
                        This run produced {ea.totalRows ?? 0} setups but 0 fills — there is no edge to break down.
                        Check the run's cohort scenario / news settings.
                    </div>
                </div>
            </NeonPanel>
        );
    }

    const s = ea.summary;
    const d = ea.diagnosis;
    const eng = d.primaryEngine, weak = d.primaryWeakness;
    const netPos = s.netR > 0; // %-of-net only meaningful when the run is net positive
    const gradeTone = d.health.score >= 70 ? "success" : d.health.score >= 45 ? "warning" : "danger";

    return (
        <NeonPanel className="xl:col-span-3" title="Run Intelligence — Strategy Doctor">

            {/* ============ TIER 1 · DIAGNOSIS ============ */}
            <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-[hsl(var(--accent-primary))]" />
                <h3 className="font-ui text-[13px] font-semibold text-foreground">Diagnosis</h3>
            </div>
            <SectionNote>An evidence-cited read of why this run makes or loses money — every line names the numbers behind it.</SectionNote>

            {/* health + KPIs */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-[hsl(var(--grid))] bg-[hsl(var(--panel-2))] p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="font-ui text-[11px] text-muted-lab">Overall health</span>
                        <span className="flex items-center gap-2">
                            <span className={`rounded px-2 py-0.5 font-num text-[13px] font-semibold ${TONE_CLS[gradeTone]}`}>{d.health.grade} · {d.health.score}</span>
                            <span className="font-ui text-[10px] text-muted-lab">conf. {d.confidence}</span>
                        </span>
                    </div>
                    <HealthAxes axes={d.health.axes} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MetricChip label="Net R" value={fmtR(s.netR)} sub={`+${s.grossWinR} / −${s.grossLossR}`} tone={s.netR >= 0 ? "success" : "danger"} icon={TrendingUp} size="compact" />
                    <MetricChip label="Profit Factor" value={fmtPF(s.pf)} tone={s.pf >= 1 ? "primary" : "danger"} icon={Activity} size="compact" />
                    <MetricChip label="Win Rate" value={`${s.winRate}%`} sub={`avg +${s.avgWinR} / ${s.avgLossR}`} tone="secondary" icon={Percent} size="compact" />
                    <MetricChip label="Expectancy" value={`${s.expectancy >= 0 ? "+" : ""}${s.expectancy}R`} tone={s.expectancy >= 0 ? "success" : "danger"} icon={Target} size="compact" />
                    <MetricChip label="Max DD" value={`${s.maxDD}R`} sub={d.drawdown.ratio != null ? `${d.drawdown.ratio}× net` : undefined} tone="danger" icon={ArrowDownRight} size="compact" />
                    <MetricChip label="Filled" value={s.filled} sub={s.costR != null ? `cost ${s.costR}R` : undefined} tone="muted" icon={Hash} size="compact" />
                </div>
            </div>

            {/* diagnosis lines (each cites numbers) */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <DxLine title="Primary engine" tone="text-[hsl(var(--accent-primary))]">
                    {eng ? <>{eng.key} {fmtR(eng.netR)} · PF {fmtPF(eng.pf)}{netPos ? ` · ${eng.contrib}% of net` : ""}</> : "—"}
                </DxLine>
                <DxLine title="Primary weakness" tone="text-[hsl(var(--bear))]">
                    {weak ? <>{weak.key} {fmtR(weak.netR)}{netPos ? ` · ${weak.contrib}% of net` : ""}</> : "no negative cohort"}
                </DxLine>
                <DxLine title="Edge concentration">
                    {d.concentration.pct != null ? <>top cell {d.concentration.pct}% of net <span className="text-muted-lab">({d.concentration.cell})</span></> : "—"}
                </DxLine>
                <DxLine title="Regime dependence">
                    {d.regime.pct != null ? <>top 2 of {d.regime.nYears} yrs = {d.regime.pct}% of net <span className="text-muted-lab">({d.regime.years.join(", ")})</span></> : "—"}
                </DxLine>
                <DxLine title="Cost drag">
                    {d.costDrag != null ? <>costs = {d.costDrag}% of gross edge</> : <span className="text-muted-lab">no cost data</span>}
                </DxLine>
                <DxLine title="Drawdown quality">
                    max DD {d.drawdown.maxDD}R{d.drawdown.ratio != null ? <> = {d.drawdown.ratio}× net</> : ""}
                </DxLine>
            </div>

            {/* profile of the engine */}
            <div className="mt-2 rounded-md border border-[hsl(var(--accent-primary)/0.3)] bg-[hsl(var(--accent-primary)/0.06)] px-3 py-2">
                <div className="font-ui text-[10px] uppercase text-muted-lab">Profile of the engine</div>
                {d.profile.ok ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {d.profile.facets.map((f, i) => (
                            <React.Fragment key={f.dim}>
                                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-lab" />}
                                <span className="rounded bg-[hsl(var(--accent-primary)/0.14)] px-1.5 py-0.5 font-num text-[11px] text-foreground" title={`${f.coverage}% of engine trades${f.lift != null ? ` · lift ×${f.lift}` : ""}`}>
                                    {f.value} <span className="text-muted-lab">{f.coverage}%</span>
                                </span>
                            </React.Fragment>
                        ))}
                        <span className="ml-1 font-ui text-[10px] text-muted-lab">— the {d.profile.n} trades making ≥60% of positive net</span>
                    </div>
                ) : (
                    <div className="mt-1 font-ui text-[11px] text-muted-lab">Engine set too small or undifferentiated to profile{d.profile.n != null ? ` (${d.profile.n} trades)` : ""}.</div>
                )}
            </div>

            {/* ============ TIER 2 · EVIDENCE ============ */}
            <div className="mt-6 flex items-center gap-2">
                <Layers className="h-4 w-4 text-[hsl(var(--accent-primary))]" />
                <h3 className="font-ui text-[13px] font-semibold text-foreground">Evidence</h3>
            </div>
            <SectionNote>Where the edge actually comes from. Gross win/loss is always shown; the quality bar's width is gross turnover.</SectionNote>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="lg:col-span-2">
                    <h4 className="font-ui text-[12px] font-semibold text-foreground">Session × Direction</h4>
                    <SectionNote>The one true 2-D view — which session-and-side cells generate vs destroy the edge.</SectionNote>
                    <Matrix matrix={ea.sessionDirection.matrix} />
                </div>
                <div>
                    <h4 className="font-ui text-[12px] font-semibold text-foreground">Direction</h4>
                    <SectionNote>Whether one side of the market carries the strategy.</SectionNote>
                    <CohortTable rows={ea.cohorts.direction} label="side" />
                </div>
                <div>
                    <h4 className="font-ui text-[12px] font-semibold text-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-[hsl(var(--bear))] -mt-0.5" />Where it leaks</h4>
                    <SectionNote>Drains and high-turnover dead weight, folded into one risk view.</SectionNote>
                    <LeaksBlock negatives={ea.engines.negatives} deadWeight={ea.deadWeight} />
                </div>
            </div>

            {/* ============ TIER 3 · DETAIL (collapsible) ============ */}
            <details className="group mt-6">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-ui text-[13px] font-semibold text-foreground">
                    <ChevronRight className="h-4 w-4 text-muted-lab transition-transform group-open:rotate-90" />
                    Detail — single-dimension breakdowns
                </summary>
                <SectionNote>Lower-level drill-downs. Collapsed by default to keep the diagnosis front-and-centre.</SectionNote>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                        <h4 className="font-ui text-[12px] font-semibold text-foreground">Weekday</h4>
                        <CohortTable rows={ea.cohorts.weekday} label="day" />
                    </div>
                    <div>
                        <h4 className="font-ui text-[12px] font-semibold text-foreground">OB Geometry</h4>
                        <CohortTable rows={ea.cohorts.obSize} label="OB width" />
                        <div className="mt-2"><CohortTable rows={ea.cohorts.structure} label="structure" /></div>
                    </div>
                    {ea.cohorts.stopBand.length > 0 && (
                        <div>
                            <h4 className="font-ui text-[12px] font-semibold text-foreground">Stop distance</h4>
                            <CohortTable rows={ea.cohorts.stopBand} label="stop band" />
                        </div>
                    )}
                    <div>
                        <h4 className="font-ui text-[12px] font-semibold text-foreground">Edge concentration (months)</h4>
                        <SectionNote>How much of the edge comes from a small subset of months.</SectionNote>
                        <div className="flex h-3 w-full overflow-hidden rounded">
                            {(ea.concentration.monthly.list || []).map((u, i) => {
                                const span = ea.concentration.monthly.posSum - ea.concentration.monthly.negSum || 1;
                                const wpct = (Math.abs(u.netR) / span) * 100;
                                const tone = u.netR >= 0 ? "var(--accent-primary)" : "var(--bear)";
                                return <div key={i} style={{ width: `${wpct}%`, background: `hsl(${tone} / ${0.4 + 0.5 * (i < (ea.concentration.monthly.list.length) * 0.2 ? 1 : 0.4)})` }} title={`${u.key}: ${fmtR(u.netR)}`} />;
                            })}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 font-num text-[11px]">
                            <div className="text-muted-lab">Top 10% months: <span className={rTone(ea.concentration.monthly.top10R)}>{fmtR(ea.concentration.monthly.top10R)} = {ea.concentration.monthly.top10Pct}%</span></div>
                            <div className="text-muted-lab">Top 20% months: <span className={rTone(ea.concentration.monthly.top20R)}>{fmtR(ea.concentration.monthly.top20R)} = {ea.concentration.monthly.top20Pct}%</span></div>
                            <div className="text-muted-lab">Best year: <span className={rTone(ea.concentration.yearly.best?.netR)}>{ea.concentration.yearly.best?.key} {fmtR(ea.concentration.yearly.best?.netR)}</span></div>
                            <div className="text-muted-lab">Worst year: <span className={rTone(ea.concentration.yearly.worst?.netR)}>{ea.concentration.yearly.worst?.key} {fmtR(ea.concentration.yearly.worst?.netR)}</span></div>
                        </div>
                    </div>
                </div>
            </details>

            {/* ============ TIER 4 · RESEARCH QUEUE ============ */}
            <div className="mt-6 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-[hsl(var(--warning,40_90%_55%))]" />
                <h3 className="font-ui text-[13px] font-semibold text-foreground">Research queue</h3>
            </div>
            <SectionNote>Next investigations, ranked by a transparent priority = 0.6·stakes + 0.4·uncertainty. Attribution, not trading filters.</SectionNote>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {ea.researchQueue.map((it) => (
                    <div key={it.id} className="rounded border border-[hsl(var(--grid))] bg-[hsl(var(--panel-2))] px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                            <div className="font-ui text-[11.5px] font-semibold text-foreground">{it.question}</div>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium leading-none ${TONE_CLS[prioTone[it.priority] || "muted"]}`}>{it.priority} · {it.priorityScore}</span>
                        </div>
                        <div className="mt-1 font-ui text-[10.5px] text-muted-lab">{it.why}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-num text-[10px] text-muted-lab">
                            <span>target: <span className="text-foreground">{it.target}</span></span>
                            {it.evidenceR != null && <span>R at stake: <span className={rTone(it.evidenceR)}>{fmtR(it.evidenceR)}</span></span>}
                            <span>confidence: {it.confidence}</span>
                        </div>
                        <div className="mt-1 font-ui text-[9.5px] italic text-muted-lab">{it.action}</div>
                    </div>
                ))}
            </div>

            {/* robustness flags */}
            <div className="mt-4">
                <h4 className="font-ui text-[12px] font-semibold text-foreground">Robustness flags</h4>
                <ul className="mt-1 space-y-1">
                    {ea.warnings.map((w, i) => (
                        <li key={i} className={`flex items-start gap-1.5 font-ui text-[11px] ${sevTone[w.severity] || "text-muted-lab"}`}>
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{w.message}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-4 border-t border-[hsl(var(--grid))] pt-2 font-ui text-[10px] text-muted-lab">
                Methodology: diagnosis, decisions and the engine profile are generated from settled Net R, gross win/loss R,
                turnover, expectancy, PF, execution-cost R and cohort drawdown over pre-trade cohorts (direction, session,
                weekday, OB width, structure, stop band). Decisions (Trade / Conditional / Avoid / Insufficient Evidence) are
                derived only from these visible metrics. Outcome-leaky fields (max_ob_penetration, MFE/MAE) are excluded.
                Cohort edges and the research queue are attribution, not tradable filters.
            </div>
        </NeonPanel>
    );
}
