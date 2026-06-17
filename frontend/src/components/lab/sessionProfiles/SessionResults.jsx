// SessionResults — Session Results / Scenario Impact (Phase 1, READ-ONLY).
//
// Always shows every session and every cohort of an imported scenario run:
// executed trades, scenario-disabled opportunities, and enabled-but-empty cohorts.
// Pure read: getTradeUniverse() + getActiveBundle().config.session_strategy_scenario,
// crossed by the pure buildSessionResults() helper. No writes, no backend.

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Ban } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { useDataset, getActiveBundle, getTradeUniverse } from "@/data/store";
import { buildSessionResults } from "@/data/sessionResults";

const CYAN = "text-[hsl(190_85%_70%)]";
const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
const fmtPx = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(5));
const cohortLabel = (t) => `${t?.structure || ""} ${t?.direction || ""}`.trim() || "—";

function Stat({ label, value, tone }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
            <div className="text-[10px] font-ui uppercase tracking-[0.05em] text-muted-lab">{label}</div>
            <div className={`text-[14px] font-num ${tone || "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
}

function CohortRow({ c }) {
    const disabled = c.status === "disabled";
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.15)] px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-[12.5px] font-ui font-semibold text-[hsl(var(--text-1))]">{c.label}</div>
                <div className="text-[11px] font-ui text-muted-lab">
                    {disabled
                        ? (c.disabledCount > 0 ? <span className="text-[hsl(var(--danger))]">Blocked by scenario · {c.disabledCount} opportunit{c.disabledCount === 1 ? "y" : "ies"}</span> : <span className="text-[hsl(var(--danger))]">Disabled</span>)
                        : (c.executedCount === 0 ? "No trades occurred" : `${c.executedCount} trade${c.executedCount === 1 ? "" : "s"}`)}
                </div>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
                <div><div className="text-[9.5px] font-ui uppercase text-muted-lab">Status</div><div className={`text-[11px] font-ui ${disabled ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]"}`}>{disabled ? "Disabled" : "Enabled"}</div></div>
                <div><div className="text-[9.5px] font-ui uppercase text-muted-lab">Net</div><div className={`text-[12px] font-num ${c.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}`}>{disabled && c.executedCount === 0 ? "—" : fmtR(c.netR)}</div></div>
                <div><div className="text-[9.5px] font-ui uppercase text-muted-lab">TP</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.tpLabel}</div></div>
                <div><div className="text-[9.5px] font-ui uppercase text-muted-lab">BE</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.beLabel}</div></div>
            </div>
        </div>
    );
}

function ExecutedTable({ rows }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">No executed trades in this session.</div>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-muted-lab uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Time</th><th className="pr-3">Cohort</th><th className="pr-3">Dir</th><th className="pr-3">Outcome</th><th className="pr-3 text-right">R</th><th className="pr-3 text-right">Entry</th><th className="pr-3 text-right">Stop</th><th className="text-right">TP</th>
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3 text-[hsl(var(--text-2))] font-num">{String(t.fillTime || t.fill_time || t.entry || "").slice(0, 16) || "—"}</td>
                            <td className="pr-3">{cohortLabel(t)}</td>
                            <td className="pr-3">{t.direction || "—"}</td>
                            <td className="pr-3">{t.outcome || t.outcomeRaw || "—"}</td>
                            <td className={`pr-3 text-right font-num ${Number(t.netR ?? t.net_r ?? 0) >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}`}>{fmtR(Number(t.netR ?? t.net_r ?? t.pnl_r ?? 0))}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.stop)}</td>
                            <td className="text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.tp)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DisabledTable({ rows }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">No scenario-blocked opportunities in this session.</div>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-muted-lab uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Cohort</th><th className="pr-3">Dir</th><th className="pr-3 text-right">Planned Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">TP</th><th className="text-right">RR</th>
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]">
                            <td className="py-1 pr-3">{cohortLabel(t)} <span className="ml-1 text-[9.5px] uppercase text-[hsl(var(--danger))]">blocked by scenario</span></td>
                            <td className="pr-3">{t.direction || "—"}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.planned_entry_price ?? t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.stop)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.tp)}</td>
                            <td className="text-right font-num">{Number.isFinite(Number(t.rr_multiple ?? t.rr)) ? `${Number(t.rr_multiple ?? t.rr)}R` : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
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

    const [open, setOpen] = useState(false);
    const [sessionKey, setSessionKey] = useState("london");

    const { hasScenario, sessions } = buildSessionResults(trades, scenarioConfig);
    const active = sessions.find((s) => s.key === sessionKey) || sessions[0];

    const toggleBtn = "clip-bevel-sm px-3 py-1.5 text-[11px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-1))] hover:border-[hsl(var(--accent-secondary))] inline-flex items-center gap-1.5";

    return (
        <NeonPanel
            title="Session Results"
            action={<button onClick={() => setOpen((v) => !v)} className={toggleBtn} data-testid="session-results-toggle">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{open ? "Hide" : "Show"}</button>}
        >
            {!open ? (
                <p className="text-[12px] font-ui text-muted-lab">Per-session, per-cohort breakdown of the active run — executed trades and scenario-blocked opportunities.</p>
            ) : !trades.length ? (
                <p className="text-[12px] font-ui text-muted-lab">No trades in the active run. Import a run to see session results.</p>
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

                    {/* A. Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        <Stat label="Executed" value={active.summary.executed} />
                        <Stat label="Disabled" value={active.summary.disabledOpportunities} tone={active.summary.disabledOpportunities > 0 ? "text-[hsl(var(--danger))]" : undefined} />
                        <Stat label="W / L / BE" value={`${active.summary.wins}/${active.summary.losses}/${active.summary.be}`} />
                        <Stat label="Net R" value={fmtR(active.summary.netR)} tone={active.summary.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"} />
                        <Stat label="Avg R" value={active.summary.avgR == null ? "—" : fmtR(active.summary.avgR)} />
                        <Stat label="Win rate" value={active.summary.winRate == null ? "—" : `${active.summary.winRate}%`} />
                        <Stat label="Active cohorts" value={active.summary.activeCohorts} />
                        <Stat label="Disabled cohorts" value={active.summary.disabledCohorts} tone={active.summary.disabledCohorts > 0 ? "text-[hsl(var(--danger))]" : undefined} />
                    </div>

                    {/* B. Cohort breakdown (always all four) */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Cohort breakdown</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {active.cohorts.map((c) => <CohortRow key={c.key} c={c} />)}
                        </div>
                    </div>

                    {/* C. Executed trades */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Executed trades — {active.label}</div>
                        <ExecutedTable rows={active.cohorts.flatMap((c) => c.executed)} />
                    </div>

                    {/* D. Disabled opportunities */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-muted-lab mb-2">Disabled opportunities — {active.label}</div>
                        <DisabledTable rows={active.cohorts.flatMap((c) => c.disabled)} />
                    </div>
                </div>
            )}
        </NeonPanel>
    );
}
