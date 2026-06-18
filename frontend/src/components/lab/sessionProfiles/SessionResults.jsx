// SessionResults — Session Results / Scenario Impact (READ-ONLY).
//
// Always shows every session and every cohort of an imported scenario run:
// executed trades, scenario-disabled opportunities, and enabled-but-empty cohorts.
// Each cohort is expandable into a per-cohort drilldown (summary + executed +
// disabled tables). Pure read of the run-specific props passed by RunDetail
// (falls back to the active store when used standalone). No writes, no backend.

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Ban } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { useDataset, getActiveBundle, getTradeUniverse } from "@/data/store";
import { buildSessionResults } from "@/data/sessionResults";

const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const fmtPx = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(5));
const rrText = (t) => (Number.isFinite(Number(t?.rr_multiple ?? t?.rr)) ? `${Number(t.rr_multiple ?? t.rr)}R` : "—");
const cohortLabel = (t) => `${t?.structure || ""} ${t?.direction || ""}`.trim() || "—";
const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";

function Stat({ label, value, tone }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
            <div className="text-[10px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--accent-secondary))]">{label}</div>
            <div className={`text-[14px] font-num ${tone || "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
}

function KV({ k, v, tone }) {
    return (
        <span className="inline-flex items-baseline gap-1">
            <span className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">{k}</span>
            <span className={`text-[11.5px] font-ui ${tone || "text-[hsl(var(--text-1))]"}`}>{v}</span>
        </span>
    );
}

function ExecutedTable({ rows, showCohort = true, emptyText = "No executed trades in this session." }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">{emptyText}</div>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Time</th>{showCohort && <th className="pr-3">Cohort</th>}<th className="pr-3">Dir</th><th className="pr-3">Outcome</th><th className="pr-3 text-right">R</th><th className="pr-3 text-right">Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">TP</th><th className="text-right">RR</th>
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3 text-[hsl(var(--text-2))] font-num">{String(t.fillTime || t.fill_time || t.entry || "").slice(0, 16) || "—"}</td>
                            {showCohort && <td className="pr-3">{cohortLabel(t)}</td>}
                            <td className="pr-3">{t.direction || "—"}</td>
                            <td className="pr-3">{t.outcome || t.outcomeRaw || "—"}</td>
                            <td className={`pr-3 text-right font-num ${Number(t.netR ?? t.net_r ?? 0) >= 0 ? successTone : dangerTone}`}>{fmtR(Number(t.netR ?? t.net_r ?? t.pnl_r ?? 0))}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.stop)}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.tp)}</td>
                            <td className="text-right font-num text-[hsl(var(--text-2))]">{rrText(t)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DisabledTable({ rows, showCohort = true, emptyText = "No scenario-blocked opportunities in this session." }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">{emptyText}</div>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    {showCohort && <th className="py-1 pr-3">Cohort</th>}<th className="py-1 pr-3">Dir</th><th className="pr-3 text-right">Planned Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">TP</th><th className="pr-3 text-right">RR</th><th>Reason</th>
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]">
                            {showCohort && <td className="py-1 pr-3">{cohortLabel(t)}</td>}
                            <td className="py-1 pr-3">{t.direction || "—"}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.planned_entry_price ?? t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.stop)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.tp)}</td>
                            <td className="pr-3 text-right font-num">{rrText(t)}</td>
                            <td className="text-[hsl(var(--danger))] uppercase text-[9.5px]">Blocked by scenario</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CohortDrilldown({ sessionLabel, c }) {
    const s = c.summary;
    const disabled = c.status === "disabled";
    return (
        <div className="mt-2 ml-2 border-l-2 border-[hsl(var(--border-mid))] pl-3 space-y-3">
            {/* A. Cohort summary */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <KV k="Session" v={sessionLabel} />
                <KV k="Cohort" v={c.label} />
                <KV k="Status" v={disabled ? "Disabled" : "Enabled"} tone={disabled ? dangerTone : successTone} />
                <KV k="Entry Model" v={c.entryLabel} />
                <KV k="BE" v={c.beLabel} />
                <KV k="TP" v={c.tpLabel} />
                <KV k="Executed" v={s.count} />
                <KV k="Disabled" v={c.disabledCount} tone={c.disabledCount > 0 ? dangerTone : undefined} />
                <KV k="W/L/BE" v={`${s.wins}/${s.losses}/${s.be}`} />
                <KV k="Net R" v={s.count ? fmtR(s.netR) : "—"} tone={s.count ? (s.netR >= 0 ? successTone : dangerTone) : undefined} />
                <KV k="Avg R" v={s.avgR == null ? "—" : fmtR(s.avgR)} />
                <KV k="Win rate" v={s.winRate == null ? "—" : `${s.winRate}%`} />
            </div>
            {/* B. Executed trades for this cohort */}
            <div>
                <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1">Executed trades</div>
                <ExecutedTable rows={c.executedTrades} showCohort={false} emptyText="No executed trades for this cohort." />
            </div>
            {/* C. Disabled opportunities for this cohort */}
            <div>
                <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1">Disabled opportunities</div>
                <DisabledTable rows={c.disabledOpportunities} showCohort={false} emptyText="No disabled opportunities for this cohort." />
            </div>
        </div>
    );
}

// Props are the explicit per-run data (used by RunDetail so it analyses the
// VIEWED run, not whatever happens to be active). When omitted, falls back to the
// active store — so the component still works standalone elsewhere.
export default function SessionResults({ trades: tradesProp, bundle: bundleProp } = {}) {
    useDataset();
    const bundle = bundleProp ?? getActiveBundle();
    const trades = Array.isArray(tradesProp) ? tradesProp : (getTradeUniverse()?.trades || []);
    const scenarioConfig = bundle?.config?.session_strategy_scenario || null;

    const [sessionKey, setSessionKey] = useState("london");
    const [expanded, setExpanded] = useState({}); // key: "session|cell"

    const { hasScenario, sessions } = buildSessionResults(trades, scenarioConfig);
    const active = sessions.find((s) => s.key === sessionKey) || sessions[0];

    return (
        <NeonPanel title="Session Results">
            {!trades.length ? (
                <p className="text-[12px] font-ui text-muted-lab">No trades in this run. Import a run to see session results.</p>
            ) : (
                <div className="space-y-4">
                    {!hasScenario && (
                        <div className="clip-bevel-sm border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--warning))]">
                            No Session Scenario was applied to this run — all cohorts shown as enabled.
                        </div>
                    )}

                    {/* Session tabs (always all six) */}
                    <div className="flex flex-wrap gap-1.5">
                        {sessions.map((s) => {
                            const sel = s.key === active.key;
                            const flag = s.summary.disabledOpportunities > 0;
                            return (
                                <button key={s.key} onClick={() => setSessionKey(s.key)}
                                    className={`clip-bevel-sm px-3 py-1.5 text-[11.5px] font-ui border inline-flex items-center gap-1.5 transition-colors ${sel ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.12)] text-white" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"}`}
                                    data-testid={`results-tab-${s.key}`}>
                                    {s.label}
                                    {flag && <Ban size={11} className="text-[hsl(var(--danger))]" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* A. Session summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        <Stat label="Executed" value={active.summary.executed} />
                        <Stat label="Disabled" value={active.summary.disabledOpportunities} tone={active.summary.disabledOpportunities > 0 ? dangerTone : undefined} />
                        <Stat label="W / L / BE" value={`${active.summary.wins}/${active.summary.losses}/${active.summary.be}`} />
                        <Stat label="Net R" value={fmtR(active.summary.netR)} tone={active.summary.netR >= 0 ? successTone : dangerTone} />
                        <Stat label="Avg R" value={active.summary.avgR == null ? "—" : fmtR(active.summary.avgR)} />
                        <Stat label="Win rate" value={active.summary.winRate == null ? "—" : `${active.summary.winRate}%`} />
                        <Stat label="Active cohorts" value={active.summary.activeCohorts} />
                        <Stat label="Disabled cohorts" value={active.summary.disabledCohorts} tone={active.summary.disabledCohorts > 0 ? dangerTone : undefined} />
                    </div>

                    {/* B. Cohort breakdown — expandable drilldown per cohort */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Cohort breakdown — click to drill in</div>
                        <div className="space-y-2">
                            {active.cohorts.map((c) => {
                                const ekey = `${active.key}|${c.key}`;
                                const isOpen = !!expanded[ekey];
                                const disabled = c.status === "disabled";
                                const eCount = c.executedCount;
                                const dCount = c.disabledCount;
                                const wr = c.summary ? c.summary.winRate : null;
                                const sample = eCount > 0 && eCount < 10 ? (eCount < 5 ? "low sample" : "small sample") : null;
                                return (
                                    <div key={c.key} className={`clip-bevel-sm border ${disabled ? "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.05)]" : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)]"}`}>
                                        <button
                                            type="button"
                                            onClick={() => setExpanded((m) => ({ ...m, [ekey]: !m[ekey] }))}
                                            className="w-full text-left px-3 py-2 flex items-center justify-between gap-3"
                                            data-testid={`cohort-row-${c.key}`}
                                        >
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className="text-muted-lab">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                                <div className="min-w-0">
                                                    <div className={`text-[12.5px] font-ui font-semibold ${disabled ? "text-[hsl(var(--text-2))]" : "text-[hsl(var(--text-1))]"}`}>{c.label}</div>
                                                    <div className="text-[11px] font-ui text-muted-lab">
                                                        {disabled
                                                            ? (c.disabledCount > 0 ? <span className="text-[hsl(var(--danger))]">Blocked by scenario · {c.disabledCount} opportunit{c.disabledCount === 1 ? "y" : "ies"}</span> : <span className="text-[hsl(var(--danger))]">Disabled</span>)
                                                            : (c.executedCount === 0 ? "No trades occurred" : `${c.executedCount} trade${c.executedCount === 1 ? "" : "s"}`)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                                                <div>
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Trades</div>
                                                    <div className="text-[12px] font-num text-[hsl(var(--accent-secondary))]">{eCount}T{dCount > 0 ? <span className="text-[hsl(var(--danger))]"> • {dCount} blk</span> : null}</div>
                                                </div>
                                                {sample && (
                                                    <span
                                                        className={`clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${eCount < 5 ? "border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                                                        title="Small sample size — interpret with caution"
                                                    >
                                                        {sample}
                                                    </span>
                                                )}
                                                <div>
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Net</div>
                                                    <div className={`text-[13px] font-num font-semibold ${eCount === 0 ? "text-[hsl(var(--text-2))]" : (c.netR >= 0 ? successTone : dangerTone)}`}>{eCount === 0 ? "—" : fmtR(c.netR)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Win</div>
                                                    <div className="text-[12px] font-num text-[hsl(var(--text-1))]">{eCount > 0 && wr != null ? `${wr}%` : "—"}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Status</div>
                                                    <div className={`text-[11px] font-ui ${disabled ? dangerTone : successTone}`}>{disabled ? "Disabled" : "Enabled"}</div>
                                                </div>
                                                <div className="hidden lg:block"><div className="text-[9.5px] font-ui uppercase text-muted-lab">TP</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.tpLabel}</div></div>
                                                <div className="hidden lg:block"><div className="text-[9.5px] font-ui uppercase text-muted-lab">BE</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.beLabel}</div></div>
                                            </div>
                                        </button>
                                        {isOpen && (
                                            <div className="px-3 pb-3">
                                                <CohortDrilldown sessionLabel={active.label} c={c} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* C. Session-wide executed trades */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Executed trades — {active.label}</div>
                        <ExecutedTable rows={active.cohorts.flatMap((c) => c.executedTrades)} />
                    </div>

                    {/* D. Session-wide disabled opportunities */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Disabled opportunities — {active.label}</div>
                        <DisabledTable rows={active.cohorts.flatMap((c) => c.disabledOpportunities)} />
                    </div>
                </div>
            )}
        </NeonPanel>
    );
}
