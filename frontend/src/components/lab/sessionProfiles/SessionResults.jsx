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
import { buildSessionResults, cohortFailureSummary, describeMissedReason, cohortOutcomeDistribution, cohortExcursionSnapshot, cohortTargetSuitability, cohortBESuitability, cohortManagementRead, cohortResearchVerdict, cohortRegimeSnapshot } from "@/data/sessionResults";

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

function LossesTable({ rows }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">No losses for this cohort.</div>;
    const hasMfe = rows.some((t) => Number.isFinite(Number(t.mfeR ?? t.mfe_r)));
    const hasMae = rows.some((t) => Number.isFinite(Number(t.maeR ?? t.mae_r)));
    const reasonOf = (t) => String(t.cancel_reason || t.exit_reason || t.be_exit_reason || "").trim() || "—";
    const rOrDash = (v) => (Number.isFinite(Number(v)) ? `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}` : "—");
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Time</th><th className="pr-3">Outcome</th><th className="pr-3 text-right">R</th><th className="pr-3 text-right">Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">TP</th><th className="pr-3">Reason</th>{hasMfe && <th className="pr-3 text-right">MFE</th>}{hasMae && <th className="text-right">MAE</th>}
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3 text-[hsl(var(--text-2))] font-num">{String(t.fillTime || t.fill_time || t.entry || "").slice(0, 16) || "—"}</td>
                            <td className="pr-3">{t.outcome || t.outcomeRaw || "Loss"}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--danger))]">{fmtR(Number(t.netR ?? t.net_r ?? t.pnl_r ?? 0))}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.stop)}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{fmtPx(t.tp)}</td>
                            <td className="pr-3 text-[hsl(var(--text-2))]">{reasonOf(t)}</td>
                            {hasMfe && <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{rOrDash(t.mfeR ?? t.mfe_r)}</td>}
                            {hasMae && <td className="text-right font-num text-[hsl(var(--text-2))]">{rOrDash(t.maeR ?? t.mae_r)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CancelledTable({ rows, showSession = false, emptyText = "No cancelled or missed opportunities for this cohort." }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">{emptyText}</div>;
    const reasonOf = (t) => describeMissedReason(t);
    const sessionOf = (t) => String(t.fillSession || t.fill_session || t.session || "").trim() || "—";
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Outcome</th><th className="pr-3">Reason</th>{showSession && <th className="pr-3">Session</th>}<th className="pr-3">Setup</th><th className="pr-3">Dir</th><th className="pr-3 text-right">Planned Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">TP</th><th className="text-right">RR</th>
                </tr></thead>
                <tbody>
                    {rows.map((t, i) => (
                        <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]">
                            <td className="py-1 pr-3 text-[hsl(var(--text-1))]">{t.outcome || t.outcomeRaw || "—"}</td>
                            <td className="pr-3">{reasonOf(t)}</td>
                            {showSession && <td className="pr-3">{sessionOf(t)}</td>}
                            <td className="pr-3">{t.structure || "—"}</td>
                            <td className="pr-3">{t.direction || "—"}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.planned_entry_price ?? t.entryPrice)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.stop)}</td>
                            <td className="pr-3 text-right font-num">{fmtPx(t.tp)}</td>
                            <td className="text-right font-num">{rrText(t)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function OutcomeDistribution({ rows }) {
    const { total, buckets } = cohortOutcomeDistribution(rows);
    if (!total) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No executed outcomes for this cohort.</div>;
    const netTone = (b) => (b.key === "be" || b.key === "other" ? "text-[hsl(var(--text-2))]" : (b.netR > 0 ? successTone : b.netR < 0 ? dangerTone : "text-[hsl(var(--text-2))]"));
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11.5px] font-ui">
                <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                    <th className="py-1 pr-3">Outcome</th><th className="pr-3 text-right">Count</th><th className="pr-3 text-right">%</th><th className="pr-3 text-right">Net R</th><th className="text-right">Avg R</th>
                </tr></thead>
                <tbody>
                    {buckets.map((b) => (
                        <tr key={b.key} className="border-t border-[hsl(var(--border-soft))]">
                            <td className="py-1 pr-3 text-[hsl(var(--text-1))]">{b.label}</td>
                            <td className="pr-3 text-right font-num">{b.count}</td>
                            <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{b.percent}%</td>
                            <td className={`pr-3 text-right font-num ${netTone(b)}`}>{fmtR(b.netR)}</td>
                            <td className="text-right font-num text-[hsl(var(--text-2))]">{b.avgR == null ? "—" : fmtR(b.avgR)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ExcGroup({ title, g }) {
    const v = (x) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${Number(x).toFixed(2)}R`);
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-2">
            <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1">{title} ({g.count})</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-ui">
                <span className="text-muted-lab">Avg MFE</span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.avgMFE)}</span>
                <span className="text-muted-lab">Med MFE</span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.medianMFE)}</span>
                <span className="text-muted-lab">Avg MAE</span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.avgMAE)}</span>
                <span className="text-muted-lab">Med MAE</span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.medianMAE)}</span>
            </div>
        </div>
    );
}

function ExcursionSnapshot({ rows }) {
    const snap = cohortExcursionSnapshot(rows);
    if (snap.all.count === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No executed trades for this cohort.</div>;
    const noData = snap.all.avgMFE == null && snap.all.avgMAE == null;
    const pctTone = (p) => (p == null ? "text-[hsl(var(--text-2))]" : p >= 66 ? successTone : p >= 33 ? "text-[hsl(var(--warning))]" : dangerTone);
    return (
        <div className="space-y-2">
            {noData && <div className="text-[10.5px] font-ui text-muted-lab italic">No excursion (MFE/MAE) data in this run.</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <ExcGroup title="All Trades" g={snap.all} />
                <ExcGroup title="Winners" g={snap.winners} />
                <ExcGroup title="Losers" g={snap.losers} />
            </div>
            <div>
                <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1">Losses reaching before failure</div>
                {snap.losers.count === 0 ? (
                    <div className="text-[11px] font-ui text-muted-lab italic">No losses for this cohort.</div>
                ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {snap.thresholds.map((th) => (
                            <span key={th.level} className="inline-flex items-baseline gap-1">
                                <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">{th.level}R</span>
                                <span className={`text-[11.5px] font-num ${pctTone(th.reachedBeforeLossPct)}`}>{th.reachedBeforeLossPct == null ? "—" : `${th.reachedBeforeLossPct}%`}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function TargetSuitability({ rows }) {
    const ts = cohortTargetSuitability(rows);
    if (ts.coverage.withMFE === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No MFE data available for target suitability.</div>;
    const tone = (p) => (p == null ? "text-[hsl(var(--text-2))]" : p >= 66 ? successTone : p >= 33 ? "text-[hsl(var(--warning))]" : dangerTone);
    const cell = (pct, count, den) => (
        <span className={`font-num ${tone(pct)}`}>{pct == null ? "—" : `${pct}%`} <span className="text-[hsl(var(--text-2))]">({count}/{den})</span></span>
    );
    return (
        <div className="space-y-1.5">
            <p className="text-[10.5px] font-ui text-muted-lab italic">Exploratory MFE reach-rate only. Use backend scenario runs to confirm actual P&amp;L.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3">Target</th><th className="pr-3">All Reached</th><th className="pr-3">Winners</th><th>Losers</th>
                    </tr></thead>
                    <tbody>
                        {ts.levels.map((l) => (
                            <tr key={l.level} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num">{l.level}R</td>
                                <td className="pr-3">{cell(l.reachedPct, l.reachedCount, ts.coverage.withMFE)}</td>
                                <td className="pr-3">{cell(l.winnersReachedPct, l.winnersReachedCount, ts.winnersWithMFE)}</td>
                                <td>{cell(l.losersReachedPct, l.losersReachedCount, ts.losersWithMFE)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="text-[10.5px] font-ui text-muted-lab">Coverage: {ts.coverage.withMFE}/{ts.total} trades with MFE</div>
        </div>
    );
}

function BESuitability({ rows }) {
    const be = cohortBESuitability(rows);
    if (be.totalLosers === 0 && be.totalWinners === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No MFE data available for BE suitability.</div>;
    const pctTone = (p) => (p == null ? "text-[hsl(var(--text-2))]" : p >= 66 ? successTone : p >= 33 ? "text-[hsl(var(--warning))]" : dangerTone);
    const sigTone = (s) => (s === "Strong" ? successTone : s === "Mixed" ? "text-[hsl(var(--warning))]" : s === "Weak" ? dangerTone : "text-[hsl(var(--text-2))]");
    const cell = (pct, count, den) => (
        <span className={`font-num ${pctTone(pct)}`}>{pct == null ? "—" : `${pct}%`} <span className="text-[hsl(var(--text-2))]">({count}/{den})</span></span>
    );
    return (
        <div className="space-y-1.5">
            <p className="text-[10.5px] font-ui text-muted-lab italic">High loser reach-rates may indicate a useful BE candidate. Confirm with backend scenario testing.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3">Level</th><th className="pr-3">Losers Reached</th><th className="pr-3">Winners Reached</th><th>Signal</th>
                    </tr></thead>
                    <tbody>
                        {be.levels.map((l) => (
                            <tr key={l.level} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num">{l.level}R</td>
                                <td className="pr-3">{cell(l.losersReachedPct, l.losersReachedCount, be.totalLosers)}</td>
                                <td className="pr-3">{cell(l.winnersReachedPct, l.winnersReachedCount, be.totalWinners)}</td>
                                <td className={`font-ui ${sigTone(l.signal)}`}>{l.signal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ManagementRead({ rows }) {
    const mr = cohortManagementRead(rows);
    const biasTone = (t) => (t === "success" ? successTone : t === "warning" ? "text-[hsl(var(--warning))]" : t === "danger" ? dangerTone : "text-[hsl(var(--text-2))]");
    const biasBorder = (t) => (t === "success" ? "border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.08)]" : t === "warning" ? "border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.08)]" : t === "danger" ? "border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.08)]" : "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)]");
    const prioTone = (p) => (p === "high" ? successTone : p === "medium" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]");
    return (
        <div className="space-y-2">
            <p className="text-[10.5px] font-ui text-muted-lab italic">Rule-based next-test guidance, not a conclusion or prediction.</p>
            <div className="flex flex-wrap items-center gap-2">
                <span className={`clip-bevel-sm px-2.5 py-1 text-[11.5px] font-ui font-semibold border ${biasBorder(mr.bias.tone)} ${biasTone(mr.bias.tone)}`}>{mr.bias.label}</span>
                <span className="text-[11px] font-ui text-muted-lab">Sample: <span className="text-[hsl(var(--text-2))]">{mr.sample.label} ({mr.sample.count})</span></span>
            </div>
            <p className="text-[11.5px] font-ui text-[hsl(var(--text-1))]">{mr.bias.detail}</p>
            {mr.nextTests.length > 0 && (
                <div>
                    <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1">Next tests</div>
                    <ul className="space-y-0.5">
                        {mr.nextTests.map((nt, i) => (
                            <li key={i} className="text-[11.5px] font-ui text-[hsl(var(--text-1))]">
                                <span className={`uppercase text-[9.5px] font-ui mr-1.5 ${prioTone(nt.priority)}`}>{nt.priority}</span>
                                {nt.label}<span className="text-muted-lab"> — {nt.reason}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {mr.caveats.length > 0 && (
                <p className="text-[10px] font-ui text-muted-lab">{mr.caveats.join(" ")}</p>
            )}
        </div>
    );
}

// Phase 4B — fast rule-based "Research Verdict" at the top of the Overview tab.
// Synthesizes existing helpers; says what to investigate next, not what to trade.
function ResearchVerdict({ rows }) {
    const v = cohortResearchVerdict(rows);
    const tone = (t) => (t === "success" ? successTone : t === "warning" ? "text-[hsl(var(--warning))]" : t === "danger" ? dangerTone : "text-[hsl(var(--text-2))]");
    const prioTone = (p) => (p === "high" ? successTone : p === "medium" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]");
    const cells = [
        { k: "Sample", r: v.sample },
        { k: "Current", r: v.currentRead },
        { k: "Target", r: v.targetRead },
        { k: "BE", r: v.beRead },
        { k: "Failure", r: v.failureRead },
    ];
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)] p-2.5 space-y-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))]">Research verdict</span>
                <span className="text-[10px] font-ui text-muted-lab italic">rule-based — what to investigate next, not a trade signal</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5">
                {cells.map((c) => (
                    <div key={c.k}>
                        <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{c.k}</div>
                        <div className={`text-[11.5px] font-ui font-semibold ${tone(c.r.tone)}`}>{c.r.label}</div>
                    </div>
                ))}
            </div>
            <div className="border-t border-[hsl(var(--border-mid))] pt-1.5 text-[11.5px] font-ui text-[hsl(var(--text-1))]">
                <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab mr-1.5">Next test</span>
                <span className={`uppercase text-[9.5px] font-ui mr-1.5 ${prioTone(v.nextTest.priority)}`}>{v.nextTest.priority}</span>
                {v.nextTest.label}<span className="text-muted-lab"> — {v.nextTest.reason}</span>
            </div>
            <p className="text-[10px] font-ui text-muted-lab">{v.caveat}</p>
        </div>
    );
}

// Phase 4C — time-regime view (yearly + monthly performance + deterministic notes).
function RegimeSnapshot({ rows }) {
    const reg = cohortRegimeSnapshot(rows);
    const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v > 0 ? successTone : v < 0 ? dangerTone : "text-[hsl(var(--text-2))]");
    const wrTxt = (p) => (p == null ? "—" : `${p}%`);

    const Chip = ({ label, item }) => (
        <div className="clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)] px-2.5 py-1">
            <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{label}</div>
            {item ? (
                <div className="text-[11.5px] font-ui">
                    <span className="text-[hsl(var(--text-1))] font-semibold">{item.year ?? item.label}</span>
                    <span className={`ml-1.5 font-num ${rTone(item.netR)}`}>{fmtR(item.netR)}</span>
                </div>
            ) : <div className="text-[11.5px] font-ui text-muted-lab">—</div>}
        </div>
    );

    const Table = ({ head, list, keyOf, cellHead, best, worst }) => (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
                <thead>
                    <tr className="text-left text-muted-lab font-ui border-b border-[hsl(var(--border-mid))]">
                        <th className="py-1 pr-3 font-normal">{cellHead}</th>
                        <th className="pr-3 font-normal text-right">Trades</th>
                        <th className="pr-3 font-normal text-right">WR%</th>
                        <th className="pr-3 font-normal text-right">Net R</th>
                        <th className="font-normal text-right">Avg R</th>
                    </tr>
                </thead>
                <tbody>
                    {list.length === 0 && (
                        <tr><td colSpan={5} className="py-2 text-muted-lab font-ui">No dated executed trades.</td></tr>
                    )}
                    {list.map((x) => {
                        const k = keyOf(x);
                        const hi = best && k === keyOf(best) ? "bg-[hsl(var(--success)/0.08)]" : worst && k === keyOf(worst) ? "bg-[hsl(var(--danger)/0.08)]" : "";
                        return (
                            <tr key={k} className={`border-b border-[hsl(var(--border-mid)/0.4)] ${hi}`}>
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num">{head(x)}</td>
                                <td className="pr-3 text-right text-[hsl(var(--text-2))] font-num">{x.trades}</td>
                                <td className="pr-3 text-right text-[hsl(var(--text-2))] font-num">{wrTxt(x.winRate)}</td>
                                <td className={`pr-3 text-right font-num ${rTone(x.netR)}`}>{fmtR(x.netR)}</td>
                                <td className={`text-right font-num ${rTone(x.avgR)}`}>{x.avgR == null ? "—" : fmtR(x.avgR)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    // Deterministic regime notes (no AI, no narrative).
    const notes = [];
    if (reg.years.length) {
        const pos = reg.years.filter((y) => y.netR > 0).length;
        const neg = reg.years.filter((y) => y.netR < 0).length;
        const n = reg.years.length;
        notes.push(`Positive in ${pos}/${n} ${n === 1 ? "year" : "years"}.`);
        if (neg > 0) notes.push(`Negative in ${neg}/${n} ${n === 1 ? "year" : "years"}.`);
        if (n >= 2) {
            const totalT = reg.years.reduce((s, y) => s + y.trades, 0);
            const sorted = [...reg.years].sort((a, b) => b.trades - a.trades);
            let cum = 0, k = 0;
            for (const y of sorted) { cum += y.trades; k += 1; if (totalT && cum / totalT >= 0.7) break; }
            if (n >= 3 && k <= 2) notes.push(`Results concentrated in ${k} ${k === 1 ? "year" : "years"}.`);
            else if (n >= 3) notes.push("Fairly consistent across years.");
        }
    }
    if (reg.bestMonth) notes.push(`Strongest month: ${reg.bestMonth.label} (${fmtR(reg.bestMonth.netR)}).`);
    if (reg.worstMonth && (!reg.bestMonth || reg.worstMonth.month !== reg.bestMonth.month)) notes.push(`Weakest month: ${reg.worstMonth.label} (${fmtR(reg.worstMonth.netR)}).`);

    return (
        <div className="space-y-3">
            <div>
                <SubLabel>Yearly performance</SubLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                    <Chip label="Best year" item={reg.bestYear} />
                    <Chip label="Worst year" item={reg.worstYear} />
                </div>
                <Table cellHead="Year" list={reg.years} head={(x) => x.year} keyOf={(x) => x.year} best={reg.bestYear} worst={reg.worstYear} />
            </div>
            <div>
                <SubLabel>Monthly performance</SubLabel>
                <Table cellHead="Month" list={reg.months} head={(x) => x.label} keyOf={(x) => x.month} best={reg.bestMonth} worst={reg.worstMonth} />
            </div>
            <div>
                <SubLabel>Regime notes</SubLabel>
                {notes.length ? (
                    <ul className="space-y-0.5">
                        {notes.map((nt, i) => (
                            <li key={i} className="text-[11.5px] font-ui text-[hsl(var(--text-1))]">{nt}</li>
                        ))}
                    </ul>
                ) : <p className="text-[11px] font-ui text-muted-lab">No dated executed trades to summarize.</p>}
            </div>
        </div>
    );
}

const DRILL_TABS = [
    { key: "overview", label: "Overview" },
    { key: "management", label: "Management" },
    { key: "failures", label: "Failures" },
    { key: "trades", label: "Trades" },
    { key: "regimes", label: "Regimes" },
];
const SubLabel = ({ children }) => (
    <div className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1">{children}</div>
);

function CohortDrilldown({ sessionLabel, c }) {
    const s = c.summary;
    const disabled = c.status === "disabled";
    const fail = cohortFailureSummary(c.executedTrades);
    // Local to this expanded cohort. Mounted only while open, so it resets to
    // "overview" whenever a cohort (re-)expands; switching tabs never collapses it.
    const [tab, setTab] = useState("overview");
    return (
        <div className="mt-2 ml-2 border-l-2 border-[hsl(var(--border-mid))] pl-3 space-y-3">
            {/* Local drilldown tabs */}
            <div className="flex flex-wrap gap-1.5">
                {DRILL_TABS.map((t) => {
                    const sel = t.key === tab;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border transition-colors ${sel ? "border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.12)] text-[hsl(var(--accent-secondary))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"}`}
                            data-testid={`drill-tab-${t.key}`}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Overview: Cohort Summary · Management Read · Outcome Distribution ── */}
            {tab === "overview" && (
                <div className="space-y-3">
                    <ResearchVerdict rows={c.executedTrades} />
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
                    <div><SubLabel>Management read</SubLabel><ManagementRead rows={c.executedTrades} /></div>
                    <div><SubLabel>Outcome distribution</SubLabel><OutcomeDistribution rows={c.executedTrades} /></div>
                </div>
            )}

            {/* ── Management: Excursion · Target Suitability · BE Suitability ── */}
            {tab === "management" && (
                <div className="space-y-3">
                    <div><SubLabel>Excursion snapshot</SubLabel><ExcursionSnapshot rows={c.executedTrades} /></div>
                    <div><SubLabel>Target suitability</SubLabel><TargetSuitability rows={c.executedTrades} /></div>
                    <div><SubLabel>BE suitability</SubLabel><BESuitability rows={c.executedTrades} /></div>
                </div>
            )}

            {/* ── Failures: Failure Summary (+ losses) · Cancelled / Missed ── */}
            {tab === "failures" && (
                <div className="space-y-3">
                    <div>
                        <SubLabel>Failure summary</SubLabel>
                        {fail.totalLosses === 0 ? (
                            <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No losses for this cohort.</div>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
                                    <KV k="Total losses" v={fail.totalLosses} tone={dangerTone} />
                                    <KV k="Loss R" v={fmtR(fail.lossR)} tone={dangerTone} />
                                    <KV k="Avg loss R" v={fail.avgLossR == null ? "—" : fmtR(fail.avgLossR)} />
                                    <KV k="Largest loss R" v={fail.largestLossR == null ? "—" : fmtR(fail.largestLossR)} tone={dangerTone} />
                                    <KV k="Loss rate" v={fail.lossRate == null ? "—" : `${fail.lossRate}%`} />
                                    {fail.beExits > 0 && <KV k="BE exits" v={fail.beExits} />}
                                </div>
                                {fail.topReasons.length > 0 && (
                                    <div className="text-[11px] font-ui text-muted-lab mb-2">
                                        <span className="uppercase text-[10px] tracking-wider text-[hsl(var(--accent-secondary))] mr-2">Top reasons</span>
                                        {fail.topReasons.map((r, i) => <span key={r.reason} className="text-[hsl(var(--text-2))]">{i > 0 ? " · " : ""}{r.reason} ×{r.count}</span>)}
                                    </div>
                                )}
                                <LossesTable rows={fail.losses} />
                            </>
                        )}
                    </div>
                    <div><SubLabel>Cancelled / missed opportunities</SubLabel><CancelledTable rows={c.cancelledOrMissedOpportunities} /></div>
                </div>
            )}

            {/* ── Trades: Executed · Disabled ── */}
            {tab === "trades" && (
                <div className="space-y-3">
                    <div><SubLabel>Executed trades</SubLabel><ExecutedTable rows={c.executedTrades} showCohort={false} emptyText="No executed trades for this cohort." /></div>
                    <div><SubLabel>Disabled opportunities</SubLabel><DisabledTable rows={c.disabledOpportunities} showCohort={false} emptyText="No disabled opportunities for this cohort." /></div>
                </div>
            )}

            {/* ── Regimes: Yearly · Monthly · Regime notes ── */}
            {tab === "regimes" && (
                <RegimeSnapshot rows={c.executedTrades} />
            )}
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

    const { hasScenario, sessions, unassigned, unassignedCount } = buildSessionResults(trades, scenarioConfig);
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
                        <Stat label="Executed" value={active.summary.executed} />
                        <Stat label="Disabled" value={active.summary.disabledOpportunities} tone={active.summary.disabledOpportunities > 0 ? dangerTone : undefined} />
                        <Stat label="Cancelled/Missed" value={active.summary.cancelledMissed} />
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
                                const mCount = c.cancelledMissedCount;
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
                                                    <div className="text-[12px] font-num text-[hsl(var(--accent-secondary))]">{eCount}T{dCount > 0 ? <span className="text-[hsl(var(--danger))]"> • {dCount} blk</span> : null}{mCount > 0 ? <span className="text-[hsl(var(--text-2))]"> • {mCount} missed</span> : null}</div>
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

                    {/* E. Session-wide cancelled / missed opportunities */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Cancelled / missed — {active.label}</div>
                        <CancelledTable rows={active.cohorts.flatMap((c) => c.cancelledOrMissedOpportunities)} emptyText="No cancelled or missed opportunities in this session." />
                    </div>

                    {/* F. Unassigned — cancelled/missed rows with no recorded fill session (run-wide) */}
                    {unassignedCount > 0 && (
                        <div>
                            <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1">Unassigned — no fill session ({unassignedCount})</div>
                            <p className="text-[10.5px] font-ui text-muted-lab mb-2">These cancelled/missed rows never recorded a fill session, so they cannot be mapped to a session/cohort. Shown run-wide.</p>
                            <CancelledTable rows={unassigned} showSession emptyText="" />
                        </div>
                    )}
                </div>
            )}
        </NeonPanel>
    );
}
