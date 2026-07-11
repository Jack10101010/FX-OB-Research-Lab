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
import { useDataset, getActiveBundle, getTradeUniverse, getRunData, rehydrateRunCandles, loadDailyRegimeCandles } from "@/data/store";
import { buildSessionResults, cohortFailureSummary, describeMissedReason, cohortOutcomeDistribution, cohortExcursionSnapshot, cohortTargetSuitability, cohortTargetEconomics, cohortBESuitability, cohortRiskReduction, cohortManagementRead, cohortResearchVerdict, cohortRegimeSnapshot, cohortFailureClusters, cohortHeaderCounts } from "@/data/sessionResults";
import { STATE_LENS_STATES, STATE_LENS_KEYS, STATE_LABELS, STATE_SHORT_LABELS, UNLABELLED_KEY, groupRowsByMarketState, stateCellStatus, stateSourceSummary, statePopulationScope, nativeCellStats, eraSplitStats, ERA_KEYS, plateauScore, executedStatePolicy, MIN_DECIDED_FOR_READ } from "@/data/marketStateLens";
import { getDraft, saveDraft, deleteDraft, subscribeDrafts, ALL_DRAFT_STATUSES, canTransition, buildStrategySignature } from "@/data/statePolicyDrafts";
import { TARGET_OPTIONS as STATE_TARGET_OPTIONS } from "@/data/stateTargetOverrides";
import { daily_regime_panel } from "@/data/marketState";
import { regimeCfgFromRunConfig } from "@/data/useMarketState";
import { loadPolicy } from "@/data/portfolioPolicy";
import { POLICY_LABELS, POLICY_TOOLTIPS } from "@/data/portfolioLabels";
import deployedPolicyDoc from "@/data/deployedPolicy.v1.json";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// ── Portfolio-Manager display tones (caution = orange/warning, NOT red). One place so
// the cohort card, the header badge and the drilldown status all agree. ────────────
const PM_STATE_TONE = {
    scenario_disabled: { text: "text-[hsl(var(--danger))]", border: "border-[hsl(var(--danger)/0.45)]", bg: "bg-[hsl(var(--danger)/0.05)]" },
    pm_disabled: { text: "text-[hsl(var(--warning))]", border: "border-[hsl(var(--warning)/0.5)]", bg: "bg-[hsl(var(--warning)/0.06)]" },
    pm_blocked: { text: "text-[hsl(var(--warning))]", border: "border-[hsl(var(--warning)/0.5)]", bg: "bg-[hsl(var(--warning)/0.06)]" },
    enabled_no_setups: { text: "text-[hsl(var(--text-3))]", border: "border-[hsl(var(--border-soft))]", bg: "bg-[hsl(var(--panel-2)/0.15)]" },
    enabled_no_fills: { text: "text-[hsl(var(--text-2))]", border: "border-[hsl(var(--border-soft))]", bg: "bg-[hsl(var(--panel-2)/0.15)]" },
    active: { text: "text-[hsl(var(--success))]", border: "border-[hsl(var(--border-soft))]", bg: "bg-[hsl(var(--panel-2)/0.15)]" },
    enabled: { text: "text-[hsl(var(--success))]", border: "border-[hsl(var(--border-soft))]", bg: "bg-[hsl(var(--panel-2)/0.15)]" },
};
const pmStateTone = (state) => PM_STATE_TONE[state] || PM_STATE_TONE.enabled;

// Friendly PM block reason (per the deployed policy classes) for a blocked candidate.
function pmBlockReason(t) {
    const raw = String(t.regime_block_reason || t.regimeBlockReason || t.portfolio_block_reason || t.portfolio_decision_reason || "").toLowerCase();
    if (/disabled/.test(raw)) return "NEVER TRADE";
    if (/direction/.test(raw)) return "FOLLOW TREND · direction mismatch";
    if (/state/.test(raw)) return "BLOCK CHOP · state not allowed";
    return raw ? raw.replace(/_/g, " ") : "Removed from portfolio";
}
const clockOf = (v) => { const s = String(v || "").trim(); return s ? s.slice(0, 16).replace("T", " ") : "—"; };

// PM-blocked "would-have-been" CANDIDATES the Portfolio Manager removed from the portfolio.
// AUDIT (Part 2): a REGIME_BLOCKED row carries a full candidate setup — planned entry / stop /
// target / RR + trigger & arm timing — but NO fill, NO exit, and NO MFE/MAE, so there is NO
// hypothetical outcome to show. We render the setup + timing and state that plainly rather
// than printing a fake 0R.
function PortfolioBlockedTable({ rows, showCohort = true, emptyText = "No Portfolio-Manager-blocked candidates in this cohort." }) {
    if (!rows.length) return <div className="text-[11.5px] font-ui text-muted-lab italic py-2">{emptyText}</div>;
    return (
        <div className="space-y-1.5">
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3"> </th>{showCohort && <th className="pr-3">Cohort</th>}<th className="pr-3">Dir</th><th className="pr-3 text-right">Entry</th><th className="pr-3 text-right">Stop</th><th className="pr-3 text-right">Target</th><th className="pr-3 text-right">RR</th><th className="pr-3">Trigger</th><th className="pr-3">Armed</th><th className="pr-3 text-right">Hyp. Net R</th><th>Blocked by PM</th>
                    </tr></thead>
                    <tbody>
                        {rows.map((t, i) => (
                            <tr key={t.id || i} className="border-t border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))]">
                                <td className="py-1 pr-3"><span className="clip-bevel-sm px-1.5 py-0.5 text-[8.5px] font-ui uppercase tracking-wider border border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]" title="Removed from the portfolio by the Portfolio Manager">Blocked by PM</span></td>
                                {showCohort && <td className="pr-3">{cohortLabel(t)}</td>}
                                <td className="pr-3">{t.direction || "—"}</td>
                                <td className="pr-3 text-right font-num">{fmtPx(t.planned_entry_price ?? t.entryPrice)}</td>
                                <td className="pr-3 text-right font-num">{fmtPx(t.stop)}</td>
                                <td className="pr-3 text-right font-num">{fmtPx(t.tp)}</td>
                                <td className="pr-3 text-right font-num">{rrText(t)}</td>
                                <td className="pr-3 font-num text-[hsl(var(--text-2))]">{clockOf(t.trigger_time ?? t.triggerTime)}</td>
                                <td className="pr-3 font-num text-[hsl(var(--text-2))]">{clockOf(t.armed_at ?? t.armedAt)}</td>
                                <td className="pr-3 text-right text-[9.5px] italic text-muted-lab">no outcome recorded</td>
                                <td className="text-[hsl(var(--warning))] uppercase text-[9.5px]">{pmBlockReason(t)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab italic" data-testid="blocked-rr-note">
                PM-blocked candidates are setup records only. They were blocked before fill and were not simulated after the block, so alternative RR / target / BE results are unavailable for them in this run.
            </p>
        </div>
    );
}

// Shared formatters for the Management decision-support surface.
const fmtR2 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);
const pfText = (pf, hasWins) => (pf == null ? (hasWins ? "∞" : "—") : pf);
const confToneOf = (cf, success, danger) => (cf === "High" ? success : cf === "Medium" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]");

// Plain-English column tooltip. Reuses the shared dark TooltipContent surface
// (same primitive TermTip uses) — wraps a header label with a dotted-underline
// "help" affordance and shows a short, jargon-free explanation on hover/focus.
function ColTip({ label, tip, side = "top" }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="underline decoration-dotted decoration-[hsl(var(--text-3)/0.6)] underline-offset-2 cursor-help outline-none focus-visible:decoration-[hsl(var(--accent-primary))]">{label}</span>
            </TooltipTrigger>
            <TooltipContent side={side} className="max-w-[250px] normal-case tracking-normal">
                <div className="font-ui font-semibold text-[12px] text-[hsl(var(--text))] mb-0.5">{label}</div>
                <div className="font-ui text-[11.5px] leading-[1.45] text-[hsl(var(--text-2))]">{tip}</div>
            </TooltipContent>
        </Tooltip>
    );
}

const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
// Parse "1.5R" / "1.5R (state override)" → 1.5; null when unparseable (Run Default etc.).
const parseTargetLevelSafe = (label) => {
    const m = /([0-9]*\.?[0-9]+)\s*R/i.exec(String(label ?? ""));
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 0 ? v : null;
};
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
                <span className="text-muted-lab"><ColTip label="Avg MFE" tip="Maximum Favourable Excursion — the average best-case profit (in R) each trade reached before it exited. How far price ran in your favour." /></span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.avgMFE)}</span>
                <span className="text-muted-lab"><ColTip label="Med MFE" tip="The middle value of best-case profit reached (in R): half of trades did better, half worse. Less skewed by a few big outliers than the average." /></span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.medianMFE)}</span>
                <span className="text-muted-lab"><ColTip label="Avg MAE" tip="Maximum Adverse Excursion — the average worst-case drawdown (in R) each trade saw. How far price moved against you before the result." /></span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.avgMAE)}</span>
                <span className="text-muted-lab"><ColTip label="Med MAE" tip="The middle value of worst-case drawdown (in R): half of trades dipped more, half less. Less skewed by outliers than the average." /></span><span className="font-num text-right text-[hsl(var(--text-1))]">{v(g.medianMAE)}</span>
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

// Recommendation card (Part 2) — structured read of the EXACT target economics.
function TargetRecommendationCard({ ts }) {
    const r = ts.recommendation;
    const wrap = (border, tone, title, body) => (
        <div className={`clip-bevel-sm border ${border} px-3 py-2`}>
            <div className={`text-[12px] font-ui font-semibold ${tone}`}>{title}</div>
            {body}
        </div>
    );
    const metrics = (m) => (
        <div className="text-[11px] font-num text-[hsl(var(--text-2))] mt-0.5">
            Est Net R <span className={m.estNetR >= 0 ? successTone : dangerTone}>{fmtR2(m.estNetR)}</span> · PF {pfText(m.estPF, m.estNetR != null)} · WR {m.estWR == null ? "—" : `${m.estWR}%`} · n {m.n}
        </div>
    );
    if (r.kind === "too_small") return wrap("border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)]", "text-muted-lab", "Sample Too Small", <div className="text-[11px] font-ui text-muted-lab mt-0.5">n = {r.n}. Target guidance suppressed.</div>);
    if (r.kind === "none") return wrap("border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)]", "text-[hsl(var(--text-2))]", "No Reliable Improvement Found", <div className="text-[11px] font-ui text-muted-lab mt-0.5">No Medium/High-confidence target beats the current one. n = {r.n}.</div>);
    if (r.kind === "current_best") return wrap("border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)]", "text-[hsl(var(--text-1))]", "Current Target Remains Best", (
        <>
            <div className="text-[11px] font-ui text-muted-lab mt-0.5">Current target ({r.level}R) has the strongest Medium/High confidence estimate. Confidence: {r.confidence}.</div>
            {metrics(r)}
        </>
    ));
    // recommend
    return wrap("border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.08)]", successTone, `Recommended Target: ${r.level}R`, (
        <>
            <div className={`text-[11.5px] font-num mt-0.5 ${r.deltaCurrent == null ? "text-[hsl(var(--text-2))]" : r.deltaCurrent >= 0 ? successTone : dangerTone}`}>{r.deltaCurrent == null ? "Δ vs current unavailable" : `${fmtR2(r.deltaCurrent)} vs Current`}</div>
            {metrics(r)}
            <div className="text-[10.5px] font-ui text-muted-lab mt-0.5">Confidence: {r.confidence}. Backend validation recommended.</div>
        </>
    ));
}

function TargetSuitability({ rows, tpLabel, baseLabel = null }) {
    const ts = cohortTargetEconomics(rows, tpLabel);
    if (ts.coverage.withMFE === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No MFE data available for target suitability.</div>;
    const tone = (p) => (p == null ? "text-[hsl(var(--text-2))]" : p >= 66 ? successTone : p >= 33 ? "text-[hsl(var(--warning))]" : dangerTone);
    const cell = (pct, count, den) => (
        <span className={`font-num ${tone(pct)}`}>{pct == null ? "—" : `${pct}%`} <span className="text-[hsl(var(--text-2))]">({count}/{den})</span></span>
    );
    const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
    const confTone = (cf) => confToneOf(cf, successTone, dangerTone);
    // Plateau score of the best level (STATE-TARGET-POLICY §ladder): contiguous levels
    // holding ≥80% of the best Est Net R — ≥3 = broad plateau, 1 = isolated spike.
    const plateau = plateauScore(ts.levels, ts.bestLevel);
    const baseLevel = parseTargetLevelSafe(baseLabel);
    // Candidate tag chips per row (★ Best · ◆ Conservative · ● Balanced · ▲ Aggressive · ● Executed · ◇ Base)
    const tagsFor = (lvl) => {
        const out = [];
        if (ts.bestLevel != null && lvl === ts.bestLevel) out.push({ t: "★ Best", c: "text-[hsl(var(--success))]" });
        if (ts.conservativeLevel != null && lvl === ts.conservativeLevel) out.push({ t: "◆ Conservative", c: "text-[hsl(var(--accent-secondary))]" });
        if (ts.balancedLevel != null && lvl === ts.balancedLevel) out.push({ t: "● Balanced", c: "text-[hsl(var(--text-1))]" });
        if (ts.aggressiveLevel != null && lvl === ts.aggressiveLevel) out.push({ t: ts.aggressiveIsLowConf ? "▲ Aggressive (low-conf)" : "▲ Aggressive", c: "text-[hsl(var(--warning))]" });
        if (ts.currentTarget != null && lvl === ts.currentTarget) out.push({ t: "● Executed", c: "text-[hsl(var(--accent-secondary))]" });
        if (baseLevel != null && lvl === baseLevel && baseLevel !== ts.currentTarget) out.push({ t: "◇ Base", c: "text-[hsl(var(--text-2))]" });
        return out;
    };
    return (
        <div className="space-y-1.5">
            <TargetRecommendationCard ts={ts} />
            <div className="flex flex-wrap items-center gap-2">
                <EvidenceBadge kind="RESCORE" title="This ladder is an MFE re-target ESTIMATE — exact for this fill set, but not native backend outcomes." />
                {ts.bestLevel != null && (
                    <span className={`clip-bevel-sm px-1.5 py-0.5 text-[9.5px] font-ui border ${plateau >= 3 ? "border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))]" : plateau <= 1 ? "border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                        title="Contiguous ladder levels holding ≥80% of the best Est Net R. ≥3 = broad plateau; 1 = isolated spike (artifact risk)." data-testid="plateau-score">
                        Plateau {plateau}{plateau <= 1 ? " · spike risk" : plateau >= 3 ? " · broad" : ""}
                    </span>
                )}
            </div>
            <p className="text-[10.5px] font-ui text-muted-lab italic">Exact for this fill set using exported MFE paths — changing the target does not change entry, stop, or fills. Confirm with backend scenario runs before adopting.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3"><ColTip label="Target" tip="The take-profit level being tested, in R (risk multiples). 1R = a profit equal to the amount you risked on the trade." /></th><th className="pr-3"><ColTip label="Reach %" tip="Share of all trades whose price reached this target at some point before exiting, based on the exported best-case (MFE) paths." /></th><th className="pr-3"><ColTip label="Winners" tip="Of the trades that actually won, the share that reached this target level." /></th><th className="pr-3"><ColTip label="Losers" tip="Of the trades that actually lost, the share that still touched this target before failing." /></th><th className="pr-3 text-right"><ColTip label="Est W" tip="Estimated wins if this target had been used — every decided trade whose peak (MFE) reached the target." /></th><th className="pr-3 text-right"><ColTip label="Est L" tip="Estimated losses if this target had been used — decided trades whose peak fell short of the target." /></th><th className="pr-3 text-right"><ColTip label="Est WR" tip="Estimated win rate at this target = Est W ÷ (Est W + Est L)." /></th><th className="pr-3 text-right"><ColTip label="Est PF" tip="Estimated profit factor at this target = total winning R ÷ total losing R. Above 1 is profitable; higher is better. ∞ means no losing R." /></th><th className="pr-3 text-right"><ColTip label="Est Net R" tip="Estimated total result in R if every trade had used this target instead of its actual one. Exact for this fill set — confirm in a backend run." /></th><th className="pr-3"><ColTip label="Strength" tip="A bar showing this target's Est Net R relative to the other rows — longer = stronger. Helps spot a broad plateau vs a single sharp peak." /></th><th className="pr-3 text-right"><ColTip label="Δ Current" tip="How much better or worse this target's Est Net R is versus the cohort's current target. '—' means the current target can't be read." /></th><th className="pr-3 text-right"><ColTip label="n" tip="Number of decided trades (wins + losses with excursion data) behind these estimates. Larger n = more trustworthy." /></th><th><ColTip label="Confidence" tip="How much to trust this row — High / Medium / Low — from sample size and how many trades reached the target. Small cohorts mostly read Low." /></th>
                    </tr></thead>
                    <tbody>
                        {ts.levels.map((l) => {
                            const isBest = ts.bestLevel != null && l.level === ts.bestLevel;
                            const rowCls = isBest ? "border-l-2 border-[hsl(var(--success))] bg-[hsl(var(--success)/0.07)]" : "border-l-2 border-transparent";
                            const barTone = l.estNetR == null ? "bg-[hsl(var(--border-mid))]" : l.estNetR >= 0 ? "bg-[hsl(var(--success)/0.55)]" : "bg-[hsl(var(--danger)/0.5)]";
                            return (
                                <tr key={l.level} className={`border-t border-[hsl(var(--border-soft))] ${rowCls}`}>
                                    <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num align-top">
                                        <div>{l.level}R</div>
                                        {tagsFor(l.level).map((g, i) => <span key={i} className={`block text-[9px] font-ui ${g.c}`}>{g.t}</span>)}
                                    </td>
                                    <td className="pr-3">{cell(l.reachedPct, l.reachedCount, ts.coverage.withMFE)}</td>
                                    <td className="pr-3">{cell(l.winnersReachedPct, l.winnersReachedCount, ts.winnersWithMFE)}</td>
                                    <td className="pr-3">{cell(l.losersReachedPct, l.losersReachedCount, ts.losersWithMFE)}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-1))]">{l.estW}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{l.estL}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{l.estWR == null ? "—" : `${l.estWR}%`}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{pfText(l.estPF, l.estW > 0)}</td>
                                    <td className={`pr-3 text-right font-num ${rTone(l.estNetR)}`}>{fmtR2(l.estNetR)}</td>
                                    <td className="pr-3"><div className="h-1.5 w-12 bg-[hsl(var(--panel-2)/0.5)] clip-bevel-sm overflow-hidden" title={`relative Est Net R ${l.netRBar}%`}><div className={`h-full ${barTone}`} style={{ width: `${l.netRBar}%` }} /></div></td>
                                    <td className={`pr-3 text-right font-num ${rTone(l.deltaCurrent)}`}>{l.deltaCurrent == null ? "—" : fmtR2(l.deltaCurrent)}</td>
                                    <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{l.n}</td>
                                    <td className={`font-ui ${confTone(l.confidence)}`}>{l.confidence}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled
                    title="Scenario staging not wired yet — use a backend scenario sweep to validate."
                    className="clip-bevel-sm px-2.5 py-1 text-[10.5px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] opacity-60 cursor-not-allowed"
                >
                    Stage Backend Test{ts.recommendation.kind === "recommend" ? ` (${ts.recommendation.level}R)` : ""}
                </button>
                <span className="text-[10px] font-ui text-muted-lab">Scenario staging not wired yet.</span>
            </div>
            <div className="text-[10.5px] font-ui text-muted-lab">
                Coverage: {ts.coverage.withMFE}/{ts.total} with MFE · {ts.decided} decided{ts.heldNetR !== 0 ? ` · held news-flatten ${fmtR2(ts.heldNetR)}` : ""} · current target {ts.currentTargetLabel || "—"}{ts.currentNetR != null ? ` (Est Net ${fmtR2(ts.currentNetR)})` : ""}
            </div>
        </div>
    );
}

const sigToneOf = (s) => (s === "Strong" ? successTone : s === "Mixed" ? "text-[hsl(var(--warning))]" : s === "Weak" ? dangerTone : "text-[hsl(var(--text-2))]");

function BESuitability({ rows }) {
    const be = cohortBESuitability(rows);
    if (be.totalLosers === 0 && be.totalWinners === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No MFE data available for BE suitability.</div>;
    const pctTone = (p) => (p == null ? "text-[hsl(var(--text-2))]" : p >= 66 ? successTone : p >= 33 ? "text-[hsl(var(--warning))]" : dangerTone);
    const cell = (pct, count, den) => (
        <span className={`font-num ${pctTone(pct)}`}>{pct == null ? "—" : `${pct}%`} <span className="text-[hsl(var(--text-2))]">({count}/{den})</span></span>
    );
    const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
    return (
        <div className="space-y-1.5">
            <p className="text-[10.5px] font-ui text-muted-lab italic">Exploratory reach-rate / bound analysis only. BE outcome depends on path order and must be validated with backend simulation.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3"><ColTip label="Level" tip="The profit level (in R) at which break-even would arm — i.e. move your stop to entry once price reaches this much profit." /></th><th className="pr-3"><ColTip label="Losers Reached" tip="Of losing trades, how many first reached this level — so a break-even stop could have saved them from a full loss." /></th><th className="pr-3"><ColTip label="Winners Reached" tip="Of winning trades, how many reached this level — these are the winners a break-even stop might protect, or cut short." /></th><th className="pr-3 text-right"><ColTip label="Net Benefit" tip="A simple reach-rate score (loser reach % minus winner give-back %). A ranking aid only — not a profit/loss figure." /></th><th className="pr-3 text-right"><ColTip label="Saved R (bound)" tip="Upper-bound R you might save by moving losers to break-even — a best case, not a simulated result." /></th><th className="pr-3 text-right"><ColTip label="Lost R (bound)" tip="Worst-case R you might give up if winners get stopped at break-even before they run. A pessimistic bound." /></th><th className="pr-3 text-right"><ColTip label="Net Impact (bound)" tip="Saved minus Lost — a rough range, not real P&L. It depends on the order price moved, so confirm with a backend run." /></th><th><ColTip label="Signal" tip="Quick read — Strong / Mixed / Weak — of whether break-even at this level looks worth testing." /></th>
                    </tr></thead>
                    <tbody>
                        {be.levels.map((l) => (
                            <tr key={l.level} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num">{l.level}R</td>
                                <td className="pr-3">{cell(l.losersReachedPct, l.losersReachedCount, be.totalLosers)}</td>
                                <td className="pr-3">{cell(l.winnersReachedPct, l.winnersReachedCount, be.totalWinners)}</td>
                                <td className={`pr-3 text-right font-num ${rTone(l.netBenefitScore)}`}>{l.netBenefitScore == null ? "—" : l.netBenefitScore}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--success))]">{l.savedRBound == null ? "—" : `+${l.savedRBound}R`}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--danger))]">{l.lostRBound == null ? "—" : `−${l.lostRBound}R`}</td>
                                <td className={`pr-3 text-right font-num ${rTone(l.netImpactBound)}`}>{l.netImpactBound == null ? "—" : fmtR2(l.netImpactBound)}</td>
                                <td className={`font-ui ${sigToneOf(l.signal)}`}>{l.signal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="text-[10.5px] font-ui text-muted-lab">
                {be.totalLosers} losers · {be.totalWinners} winners with MFE.{" "}
                {be.boundsAvailable ? "Saved/Lost/Net Impact are path-order BOUNDS, not simulated P&L." : "Saved is a count-based bound; Lost/Net Impact need mae-to-exit data (unavailable in this run)."}
            </div>
        </div>
    );
}

// Part 7 — Risk-Reduction Suitability (BOUND-only; separate from BE).
function RiskReduction({ rows }) {
    const rr = cohortRiskReduction(rows);
    if (rr.totalLosers === 0 && rr.totalWinners === 0) return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No MFE data available for risk-reduction analysis.</div>;
    const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
    return (
        <div className="space-y-1.5">
            <p className="text-[10.5px] font-ui text-muted-lab italic">Exploratory bound analysis only — "after Trigger R, move stop to New Stop". Saved/Lost/Net Impact are path-order BOUNDS, not simulated P&L. Validate with a backend run.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui whitespace-nowrap">
                    <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                        <th className="py-1 pr-3"><ColTip label="Trigger" tip="Once a trade reaches this much profit (in R), the stop is tightened to the New Stop level." /></th><th className="pr-3"><ColTip label="New Stop" tip="Where the stop moves to after the trigger is hit (e.g. −0.5R means your risk is cut roughly in half)." /></th><th className="pr-3 text-right"><ColTip label="Losers Reached" tip="Of losing trades, how many reached the trigger — so the tightened stop could have reduced their loss." /></th><th className="pr-3 text-right"><ColTip label="Winners Threatened" tip="Winners that reached the trigger but later dipped below the New Stop — they could have been stopped out early." /></th><th className="pr-3 text-right"><ColTip label="Saved R (bound)" tip="Upper-bound R saved on losers by tightening their stop. A best case, not a simulated result." /></th><th className="pr-3 text-right"><ColTip label="Lost R (bound)" tip="Worst-case R given up if threatened winners were stopped early instead of being left to run." /></th><th className="pr-3 text-right"><ColTip label="Net Impact (bound)" tip="Saved minus Lost — a rough range, not real P&L. Depends on the order price moved; validate with a backend run." /></th><th><ColTip label="Signal" tip="Quick read — Strong / Mixed / Weak — of whether this stop-tightening rule looks worth testing." /></th>
                    </tr></thead>
                    <tbody>
                        {rr.levels.map((l) => (
                            <tr key={l.trigger} className="border-t border-[hsl(var(--border-soft))]">
                                <td className="py-1 pr-3 text-[hsl(var(--text-1))] font-num">{l.trigger}R</td>
                                <td className="pr-3 font-num text-[hsl(var(--text-2))]">{l.newStop > 0 ? "+" : ""}{l.newStop}R</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-1))]">{l.losersReached}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{l.threatenedWinners == null ? "—" : l.threatenedWinners}</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--success))]">+{l.savedRBound}R</td>
                                <td className="pr-3 text-right font-num text-[hsl(var(--danger))]">{l.lostRBound == null ? "—" : `−${l.lostRBound}R`}</td>
                                <td className={`pr-3 text-right font-num ${rTone(l.netImpactBound)}`}>{l.netImpactBound == null ? "—" : fmtR2(l.netImpactBound)}</td>
                                <td className={`font-ui ${sigToneOf(l.signal)}`}>{l.signal}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!rr.boundsAvailable && <div className="text-[10.5px] font-ui text-muted-lab">Winners Threatened / Lost / Net Impact need mae-to-exit data (unavailable in this run); Saved R is a count-based upper bound.</div>}
        </div>
    );
}

// Part 8 — Entry Threshold Research (placeholder; honest — cannot be reconstructed
// from one cohort's MFE because a different entry changes the fill set/stop/R).
const ENTRY_THRESHOLD_PLACEHOLDER = [0, 10, 25, 40, 50, 60, 75, 90];
function EntryThresholdResearch() {
    const [open, setOpen] = useState(false);
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))]">
            <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2 flex items-center gap-2" data-testid="entry-threshold-toggle">
                <span className="text-muted-lab">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">Entry Threshold Research</span>
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-2">
                    <p className="text-[11px] font-ui text-muted-lab">Entry-threshold results require real entry-variant runs. They cannot be reconstructed safely from a single cohort.</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11.5px] font-ui">
                            <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                                <th className="py-1 pr-3">Entry %</th><th className="pr-3">Trades</th><th className="pr-3">WR</th><th className="pr-3">PF</th><th className="pr-3">Net R</th><th>Status</th>
                            </tr></thead>
                            <tbody>
                                {ENTRY_THRESHOLD_PLACEHOLDER.map((p) => (
                                    <tr key={p} className="border-t border-[hsl(var(--border-soft))]">
                                        <td className="py-1 pr-3 font-num text-[hsl(var(--text-1))]">{p}%</td>
                                        <td className="pr-3 text-[hsl(var(--text-2))]">—</td>
                                        <td className="pr-3 text-[hsl(var(--text-2))]">—</td>
                                        <td className="pr-3 text-[hsl(var(--text-2))]">—</td>
                                        <td className="pr-3 text-[hsl(var(--text-2))]">—</td>
                                        <td className="font-ui text-[hsl(var(--warning))]">Run required</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" disabled title="Use a backend entry-threshold sweep to populate this table." className="clip-bevel-sm px-2.5 py-1 text-[10.5px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] opacity-60 cursor-not-allowed">
                        Run Entry Threshold Sweep — use backend sweep
                    </button>
                </div>
            )}
        </div>
    );
}

// Part 10 — lightweight, factual Management callouts from existing helper outputs.
function ManagementCallouts({ rows, tpLabel }) {
    const ts = cohortTargetEconomics(rows, tpLabel);
    const be = cohortBESuitability(rows);
    const rr = cohortRiskReduction(rows);
    const out = [];
    const rec = ts.recommendation;
    if (rec.kind === "too_small") out.push({ tone: "muted", text: `Sample too small (n ${rec.n})` });
    else if (rec.kind === "recommend") out.push({ tone: "success", text: `Target candidate worth testing: ${rec.level}R` });
    else if (rec.kind === "current_best") out.push({ tone: "neutral", text: "Current target appears strongest" });
    else out.push({ tone: "neutral", text: "No reliable target improvement detected" });
    if (be.levels.some((l) => l.signal === "Strong")) out.push({ tone: "success", text: "BE candidate worth testing" });
    if (rr.boundsAvailable && rr.levels.some((l) => l.signal === "Strong")) out.push({ tone: "success", text: "Risk-reduction candidate worth testing" });
    if (out.length === 0) out.push({ tone: "neutral", text: "No reliable management improvement detected" });
    const tone = (t) => (t === "success" ? `border-[hsl(var(--success)/0.5)] ${successTone}` : t === "muted" ? "border-[hsl(var(--border-mid))] text-muted-lab" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]");
    return (
        <div className="flex flex-wrap gap-1.5" data-testid="management-callouts">
            {out.map((c, i) => (
                <span key={i} className={`clip-bevel-sm px-2 py-0.5 text-[10.5px] font-ui border ${tone(c.tone)}`}>{c.text}</span>
            ))}
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

// Phase 4D — rule-based failure clustering by how far the loss ran (MFE).
function FailureClusters({ rows }) {
    const fc = cohortFailureClusters(rows);
    if (fc.totalLosses === 0) {
        return <div className="text-[11.5px] font-ui text-muted-lab italic py-1">No failure clusters — no losses in this cohort.</div>;
    }
    const domKey = fc.dominantCluster?.key;
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-ui text-muted-lab">Dominant: <span className="text-[hsl(var(--accent-secondary))] font-semibold">{fc.dominantCluster?.label || "—"}</span></span>
                {fc.suggestedFocus && (
                    <span className="clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)] text-[hsl(var(--text-1))]">
                        <span className="uppercase text-[9.5px] tracking-wider text-muted-lab mr-1.5">Focus</span>{fc.suggestedFocus}
                    </span>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        <tr className="text-left text-muted-lab font-ui border-b border-[hsl(var(--border-mid))]">
                            <th className="py-1 pr-3 font-normal">Cluster</th>
                            <th className="pr-3 font-normal text-right">Count</th>
                            <th className="pr-3 font-normal text-right">%</th>
                            <th className="pr-3 font-normal text-right">Avg MFE</th>
                            <th className="pr-3 font-normal text-right">Avg Loss R</th>
                            <th className="font-normal">Read</th>
                        </tr>
                    </thead>
                    <tbody>
                        {fc.clusters.map((c) => (
                            <tr key={c.key} className={`border-b border-[hsl(var(--border-mid)/0.4)] ${c.key === domKey ? "bg-[hsl(var(--accent-secondary)/0.08)]" : ""}`}>
                                <td className="py-1 pr-3 font-ui text-[hsl(var(--accent-secondary))]">{c.label}</td>
                                <td className="pr-3 text-right text-[hsl(var(--text-1))] font-num">{c.count}</td>
                                <td className="pr-3 text-right text-[hsl(var(--text-2))] font-num">{c.pct}%</td>
                                <td className="pr-3 text-right text-[hsl(var(--text-2))] font-num">{c.avgMFE == null ? "—" : fmtR(c.avgMFE)}</td>
                                <td className={`pr-3 text-right font-num ${dangerTone}`}>{c.avgLossR == null ? "—" : fmtR(c.avgLossR)}</td>
                                <td className="text-muted-lab font-ui">{c.read}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
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

// ── Market-State lens UI (Phase 1) ──────────────────────────────────────────
// Read-only presentation over data/marketStateLens.js. SEMANTICS KEPT SEPARATE:
// PM action (existing chip), BASE TARGET (cohort tpLabel), live per-state EVIDENCE
// (these components), and STATE RECOMMENDATION (always "Not researched" until a
// versioned target-policy document exists — never invented from live numbers).

const STATE_GLYPH_TONE = {
    none: "text-[hsl(var(--text-3))]",
    insufficient: "text-[hsl(var(--text-3))]",
    evidence: "text-[hsl(var(--text-2))]",
};
const stateCellTitle = (k, st) => `${STATE_LABELS[k]} — ${st.executed} executed · ${st.decided} decided${st.kind === "insufficient" ? ` (n<8 — guidance suppressed)` : ""} · Recommendation: Not researched`;

// Compact per-state glyph strip for the cohort card header. DISPLAY ONLY (the header
// is a <button>, so no nested interactive elements): — no trades · • n<8 · number =
// decided rescore sample. Unlabelled shown only when present.
function StateGlyphStrip({ lens }) {
    if (!lens || !lens.total) return null;
    const keys = [...STATE_LENS_STATES, ...((lens.counts[UNLABELLED_KEY]?.executed || 0) > 0 ? [UNLABELLED_KEY] : [])];
    return (
        <span className="inline-flex items-center gap-1.5 ml-2" data-testid="state-glyph-strip">
            <span className="text-[8.5px] font-ui uppercase tracking-wider text-[hsl(var(--text-3))]">states</span>
            {keys.map((k) => {
                const st = stateCellStatus(lens.counts[k]);
                return (
                    <span key={k} title={stateCellTitle(k, st)}
                        className={`px-1 text-[9px] font-num border border-[hsl(var(--border-soft))] ${STATE_GLYPH_TONE[st.kind]}`}>
                        {STATE_SHORT_LABELS[k]} {st.glyph}
                    </span>
                );
            })}
        </span>
    );
}

// Provenance badge for resolved market states (engine-preferred doctrine).
function StateSourceBadge({ sources }) {
    const s = stateSourceSummary(sources);
    const tone = s.key === "engine" ? "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))]"
        : s.key === "none" ? "border-[hsl(var(--border-mid))] text-[hsl(var(--text-3))]"
        : "border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]";
    return (
        <span className={`clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border ${tone}`}
            title={s.detail || undefined} data-testid="state-source-badge">
            state source: {s.label}
        </span>
    );
}

// ── Active-universe provenance (TRADE-UNIVERSE-DIVERGENCE-AUDIT-1 Phase 3) ──────
// One compact factual line: which scenario/universe these results are computed from,
// the exact resolved source file, position mode, and the run-wide bucket counts —
// so Session Results / Management / market-state surfaces can never be mistaken for
// a different trade set than the headline (they all consume the SAME resolved rows).
function UniverseProvenance({ universe, positionMode, executed, pmBlocked, cohortDisabled, compact = false }) {
    if (!universe) return null;
    return (
        <div className={`font-ui text-muted-lab ${compact ? "text-[10px]" : "clip-bevel-sm border border-[hsl(var(--border-soft))] px-3 py-1.5 text-[10.5px]"}`}
            data-testid="universe-provenance">
            <span className="uppercase text-[9px] tracking-wider text-[hsl(var(--accent-secondary))] mr-2">Universe</span>
            <span className="text-[hsl(var(--text-1))]">{universe.label || universe.sourceKey || "—"}</span>
            <span className="mx-1.5">·</span>
            source <span className="font-num text-[hsl(var(--text-2))]" data-testid="universe-source-file">{universe.sourceFile || universe.sourceKey || "—"}</span>
            {positionMode ? <><span className="mx-1.5">·</span>{positionMode}</> : null}
            <span className="mx-1.5">·</span>
            <span className="font-num text-[hsl(var(--text-2))]">{executed}</span> executed
            <span className="mx-1.5">·</span>
            <span className={`font-num ${pmBlocked > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-3))]"}`}>{pmBlocked}</span> PM-blocked
            <span className="mx-1.5">·</span>
            <span className={`font-num ${cohortDisabled > 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-3))]"}`}>{cohortDisabled}</span> cohort-disabled
        </div>
    );
}

// Explicit unavailable/loading state for a selected scenario whose rows are absent —
// NEVER silently replaced with the baseline file. Names the requested scenario and
// the exact source file/key that was expected.
function UniverseUnavailable({ universe, universeStatus }) {
    const tone = universeStatus === "loading" ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--text-2))]" : "border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]";
    return (
        <div className={`clip-bevel-sm border bg-[hsl(var(--panel-2)/0.2)] px-3 py-2 text-[11.5px] font-ui ${tone}`} data-testid="universe-unavailable">
            <span className="uppercase text-[9.5px] tracking-wider mr-2">{universeStatus === "loading" ? "Universe loading" : "Universe unavailable"}</span>
            The selected result view <span className="text-[hsl(var(--text-1))]">{universe?.label || universe?.sourceKey || "—"}</span>{" "}
            {universeStatus === "loading" ? "is still hydrating" : "has no resolved trade rows"} — expected source{" "}
            <span className="font-num">{universe?.sourceFile || universe?.sourceKey || "—"}</span>.
            Session results are NOT substituted with the baseline file.
        </div>
    );
}

// Client-fallback availability note (legacy runs only — rows without engine state).
// Never shown when every executed row is engine-labelled. States are NEVER invented:
// while loading / when unavailable, unresolved rows simply sit in Unlabelled.
function ClientPanelNote({ status }) {
    if (!status || status.key === "not_needed" || status.key === "ready") return null;
    const msg = status.key === "loading"
        ? "Loading candles (stored copy or sidecar daily buckets) to reconstruct market states for rows without engine labels… until loaded those rows are Unlabelled."
        : status.key === "missing"
        ? "Candles could not be loaded (no stored copy; sidecar unavailable or missing candles.csv) — rows without engine market-state labels remain Unlabelled."
        : "This run has no engine market-state columns and no reachable candle source — those rows remain Unlabelled (no labels are invented).";
    return (
        <p className={`text-[10.5px] font-ui italic ${status.key === "loading" ? "text-[hsl(var(--text-2))]" : "text-muted-lab"}`} data-testid={`client-panel-${status.key}`}>
            {msg}
        </p>
    );
}

// Orange research-correctness warning: PM enforce / regime filter removed candidates
// BEFORE fill (no MFE), so per-state populations from this run are incomplete.
function PmScopeWarning({ scope, compact = false }) {
    if (!scope || !scope.filtered) return null;
    return (
        <div className={`clip-bevel-sm border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.06)] px-3 py-2 text-[11px] font-ui text-[hsl(var(--warning))] ${compact ? "" : "space-y-0.5"}`}
            data-testid="state-scope-warning">
            <span className="uppercase text-[9.5px] tracking-wider mr-2">State research scope</span>
            This run is filtered ({scope.reasons.join("; ")}). Removed candidates never filled and carry no MFE, so
            per-state target evidence here is an incomplete, conditioned sample. Use a run with Portfolio Manager in
            LABEL mode and the regime gate in LABEL mode for complete state-target research.
        </div>
    );
}

// Framing banner for a selected state: this is LIVE MFE-RESCORE EVIDENCE, not a
// validated recommendation. Recommendation is explicitly "Not researched" (Phase 1).
function StateEvidenceBanner({ stateKey, counts }) {
    const st = stateCellStatus(counts);
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--accent-secondary)/0.05)] px-3 py-2 space-y-0.5" data-testid="state-evidence-banner">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-ui font-semibold text-[hsl(var(--accent-secondary))]">{STATE_LABELS[stateKey]}</span>
                <span className="clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]">MFE rescore evidence · provisional</span>
                <span className="clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-3))]" data-testid="state-recommendation-status">State recommendation: Not researched</span>
            </div>
            <div className="text-[10.5px] font-ui text-muted-lab">
                {st.executed} executed · {st.decided} decided with MFE. Same panels and ladder as the whole cohort, filtered to this
                state's executed trades. Not backend-confirmed; not a deployed recommendation.
            </div>
        </div>
    );
}

// Market-State selector — a lens over the Management drilldown. "Whole Cohort" is the
// DEFAULT and passes the original rows through untouched (byte-identical behaviour).
function StateLensBar({ lens, stateKey, onSelect }) {
    const options = [{ key: "all", label: "Whole Cohort", count: lens.total }].concat(
        STATE_LENS_KEYS.map((k) => ({ key: k, label: STATE_LABELS[k], count: lens.counts[k]?.executed || 0 })),
    );
    return (
        <div className="flex flex-wrap gap-1.5 items-center" data-testid="state-lens-bar">
            <span className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mr-1">Market state</span>
            {options.map((o) => {
                const sel = o.key === stateKey;
                const empty = o.key !== "all" && o.count === 0;
                return (
                    <button key={o.key} type="button" onClick={() => onSelect(o.key)}
                        className={`clip-bevel-sm px-2 py-1 text-[10.5px] font-ui border transition-colors ${sel
                            ? "border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.12)] text-[hsl(var(--accent-secondary))]"
                            : empty ? "border-[hsl(var(--border-soft))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--border-mid))]"
                            : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"}`}
                        data-testid={`state-lens-${o.key === "all" ? "all" : o.key.replace(/\W+/g, "_").toLowerCase()}`}>
                        {o.label} · {o.count}
                    </button>
                );
            })}
        </div>
    );
}

// ── Evidence badges (STATE-TARGET-POLICY-UI-PLAN-1 §6) ──────────────────────────
// NATIVE = actual backend outcomes · RESCORE = MFE re-target estimate · BASE = the
// cohort base target applies · INSUFFICIENT = below the too_small gate · NOT TESTED
// = no data. Rescore estimates are NEVER presented as native.
const BADGE_TONES = {
    NATIVE: "border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))]",
    RESCORE: "border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))]",
    BASE: "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]",
    INSUFFICIENT: "border-[hsl(var(--border-mid))] text-[hsl(var(--text-3))]",
    "NOT TESTED": "border-[hsl(var(--border-soft))] text-[hsl(var(--text-3))]",
    BLOCK: "border-[hsl(var(--danger)/0.5)] text-[hsl(var(--danger))]",
};
function EvidenceBadge({ kind, title }) {
    return (
        <span className={`clip-bevel-sm px-1 py-0.5 text-[8.5px] font-ui uppercase tracking-wider border ${BADGE_TONES[kind] || BADGE_TONES.BASE}`}
            title={title} data-testid={`evidence-badge-${String(kind).toLowerCase().replace(/\W+/g, "_")}`}>
            {kind}
        </span>
    );
}

// Draft status glyph for matrix cells (research layer; never affects execution).
const DRAFT_GLYPH = {
    Inspect: "✎i", Candidate: "✎C", Confirmed: "✎✓", "Added to Run": "✎R",
    "Native Validated": "✎N", Approved: "✎A", Deployed: "✎D", Rejected: "✎✗",
};

// ── Run-level State Policy Matrix — one row per cohort, one column per state.
// Cells show COMPACT EVIDENCE (sample, executed policy, native Net R, badges) —
// never full curves. Clicking a cell deep-links into the existing Management
// drilldown focused on that cohort/state. Collapsed by default.
function StatePolicyCell({ rows, counts, policy, state, stateBlocked, draft, onOpen, testid }) {
    const st = stateCellStatus(counts);
    const ov = policy ? policy.states[state] : null;
    const isBlockPolicy = ov && ov.mode === "block";
    const nat = rows && rows.length ? nativeCellStats(rows) : null;
    const execLabel = isBlockPolicy ? "BLOCK"
        : ov && ov.mode === "custom" && ov.rr != null ? `RR${ov.rr}`
        : policy && policy.baseRR != null ? `RR${policy.baseRR}` : "base";
    const badge = isBlockPolicy || stateBlocked > 0 ? "BLOCK"
        : !counts || !counts.executed ? "NOT TESTED"
        : (counts.decided || 0) < MIN_DECIDED_FOR_READ ? "INSUFFICIENT"
        : "NATIVE";
    const netTone = nat == null ? "text-[hsl(var(--text-3))]" : nat.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]";
    return (
        <button type="button" onClick={onOpen} data-testid={testid}
            title={`${STATE_LABELS[state]} — ${st.executed} executed · ${st.decided} decided${stateBlocked ? ` · ${stateBlocked} state-blocked` : ""} · executed policy ${execLabel} · Recommendation: Not researched${draft ? ` · draft ${draft.status}` : ""}`}
            className="w-full px-1 py-0.5 border border-transparent hover:border-[hsl(var(--accent-secondary)/0.6)] text-center leading-tight">
            <div className="text-[9.5px] font-num text-[hsl(var(--text-2))]">
                {counts && counts.executed ? `n=${counts.decided}` : stateBlocked > 0 ? `⛔${stateBlocked}` : "—"}
                {draft && <span className="ml-1 text-[8.5px] text-[hsl(var(--accent-secondary))]" title={`Draft: ${draft.status}${draft.notes ? ` — ${draft.notes}` : ""}`}>{DRAFT_GLYPH[draft.status] || "✎"}</span>}
            </div>
            <div className={`text-[9px] font-ui ${isBlockPolicy ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-1))]"}`}>
                {counts && counts.executed ? execLabel : isBlockPolicy ? "BLOCK" : "·"}
            </div>
            {nat != null && counts.executed > 0 && (
                <div className={`text-[9px] font-num ${netTone}`}>{nat.netR >= 0 ? "+" : ""}{nat.netR.toFixed(1)}R</div>
            )}
            <div className="mt-0.5"><EvidenceBadge kind={badge} title={badge === "NATIVE" ? "Native backend outcomes at the executed target" : undefined} /></div>
        </button>
    );
}

function TargetPolicyMatrix({ sessions, lensMap, scope, onOpen, panelStatus = null, provenance = null, scenarioConfig = null, draftTick = 0, signature = null }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))]" data-testid="target-policy-matrix">
            <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2 flex items-center gap-2" data-testid="target-policy-matrix-toggle">
                <span className="text-muted-lab">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))]">Target policy matrix</span>
                <span className="text-[10px] font-ui text-muted-lab italic">navigation / status — evidence lives in each cohort's Management tab</span>
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-2">
                    {provenance}
                    <PmScopeWarning scope={scope} compact />
                    <ClientPanelNote status={panelStatus} />
                    <div className="text-[10px] font-ui text-muted-lab">
                        Cells: decided n · EXECUTED policy for the cell (state override, BLOCK, or the cohort base) · native Net R ·
                        evidence badge (NATIVE backend outcomes / INSUFFICIENT n&lt;8 / NOT TESTED / BLOCK). ✎ = research draft
                        (Inspect/Candidate/Confirmed/Rejected/Applied — drafts never affect execution). Recommendations remain
                        <span className="text-[hsl(var(--text-2))]"> Not researched</span> until drafted. Click a cell to open the evidence drilldown.
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-ui whitespace-nowrap">
                            <thead>
                                <tr className="text-[hsl(var(--accent-secondary))] uppercase text-[9.5px] tracking-wider text-left">
                                    <th className="py-1 pr-3">Cohort</th>
                                    {STATE_LENS_STATES.map((k) => <th key={k} className="pr-2 text-center" title={STATE_LABELS[k]}>{STATE_SHORT_LABELS[k]}</th>)}
                                    <th className="pr-2 text-right">Base</th>
                                    <th className="text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map((s) => s.cohorts.map((c) => {
                                    const lens = lensMap.get(`${s.key}|${c.key}`);
                                    const policy = executedStatePolicy(scenarioConfig, s.key, c.structure, c.direction);
                                    const disabledCohort = c.status === "disabled" || (c.display && (c.display.state === "pm_disabled"));
                                    return (
                                        <tr key={`${s.key}|${c.key}`} className={`border-t border-[hsl(var(--border-soft))] ${disabledCohort ? "opacity-50" : ""}`} data-testid={`tpm-row-${s.key}-${c.key}`}>
                                            <td className="py-1 pr-3">
                                                <button type="button" onClick={() => onOpen(s.key, c.key, "all")}
                                                    className="text-[hsl(var(--text-1))] hover:text-[hsl(var(--accent-secondary))] underline decoration-dotted decoration-[hsl(var(--text-3)/0.5)] underline-offset-2">
                                                    {s.label} {c.label}
                                                </button>
                                            </td>
                                            {STATE_LENS_STATES.map((k) => {
                                                const stateBlocked = (c.cancelledOrMissedOpportunities || []).filter(
                                                    (t) => String(t.outcomeRaw || t.outcome).toUpperCase() === "STATE_BLOCKED"
                                                        && (t.regimeEmit?.marketState || t.market_state) === k,
                                                ).length;
                                                return (
                                                    <td key={k} className="pr-1 text-center align-top">
                                                        <StatePolicyCell
                                                            rows={lens ? lens.byState.get(k) : []}
                                                            counts={lens ? lens.counts[k] : null}
                                                            policy={policy}
                                                            state={k}
                                                            stateBlocked={stateBlocked}
                                                            draft={signature ? getDraft(signature, `${s.key}|${c.key}`, k) : null}
                                                            onOpen={() => onOpen(s.key, c.key, k)}
                                                            testid={`tpm-cell-${s.key}-${c.key}-${k.replace(/\W+/g, "_").toLowerCase()}`}
                                                        />
                                                    </td>
                                                );
                                            })}
                                            <td className="pr-2 text-right font-num text-[hsl(var(--text-2))]">{c.tpLabel}</td>
                                            <td className="text-right text-[9.5px] uppercase tracking-wider text-[hsl(var(--text-3))]">{draftTick >= 0 ? "Not researched" : ""}</td>
                                        </tr>
                                    );
                                }))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Native stats strip (state drilldown) — ACTUAL backend outcomes only ─────────
function NativeStatsStrip({ rows, pmBlocked = 0, stateBlocked = 0, executedLabel = null, sourceFile = null }) {
    const s = nativeCellStats(rows);
    // SB-V2 eligibility provenance: fills that exist only via a state-level rescue.
    const rescued = (Array.isArray(rows) ? rows : []).filter((t) => String(t.stateEligibility || t.state_eligibility || "") === "rescued").length;
    const rTone = (v) => (v == null ? "text-[hsl(var(--text-2))]" : v >= 0 ? successTone : dangerTone);
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center" data-testid="native-stats-strip">
            <EvidenceBadge kind="NATIVE" title="Actual backend outcomes at the executed target — not estimates." />
            {executedLabel && <KV k="Executed target" v={executedLabel} />}
            <KV k="Executed" v={s.n} />
            <KV k="W/L/NF" v={`${s.w}/${s.l}/${s.nf}`} />
            <KV k="WR" v={s.wr == null ? "—" : `${s.wr}%`} />
            <KV k="PF" v={s.pf == null ? (s.w > 0 && s.l === 0 ? "∞" : "—") : s.pf} />
            <KV k="Net R" v={fmtR2(s.netR)} tone={rTone(s.netR)} />
            <KV k="Max DD" v={`${s.maxDD}R`} tone={dangerTone} />
            <KV k="Longest loss streak" v={s.worstLossStreak} />
            <KV k="PM-blocked" v={pmBlocked} tone={pmBlocked > 0 ? "text-[hsl(var(--warning))]" : undefined} />
            <KV k="State-blocked" v={stateBlocked} tone={stateBlocked > 0 ? dangerTone : undefined} />
            <KV k="State-rescued" v={rescued} tone={rescued > 0 ? successTone : undefined} />
            {sourceFile && <KV k="Source" v={sourceFile} />}
        </div>
    );
}

// ── Era panel — ALWAYS visible in the Management drilldown (never buried) ───────
function EraPanel({ rows }) {
    const eras = eraSplitStats(rows);
    const rTone = (v) => (v >= 0 ? successTone : dangerTone);
    return (
        <div data-testid="era-panel">
            <SubLabel>Era durability (native)</SubLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ERA_KEYS.map((k) => {
                    const e = eras[k];
                    return (
                        <div key={k} className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
                            <div className="text-[9.5px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">{k}{k === "2025+" ? " · low sample" : ""}</div>
                            <div className="text-[11.5px] font-num">
                                <span className={e.n ? rTone(e.netR) : "text-[hsl(var(--text-3))]"}>{e.n ? fmtR2(e.netR) : "—"}</span>
                                <span className="text-muted-lab"> · n {e.n}</span>
                                {e.wr != null && <span className="text-[hsl(var(--text-2))]"> · WR {e.wr}%</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Evidence summary (correction 5) — native / rescore / draft are IMPOSSIBLE to
// confuse: each value carries its own badge; drafts are explicitly "not deployed".
function StateEvidenceSummary({ rows, executedLabel, draft, econ }) {
    const nat = nativeCellStats(rows);
    const draftLabel = draft ? (draft.block ? "BLOCK" : draft.target != null ? `RR${draft.target}` : "—") : null;
    const draftLevel = draft && !draft.block && draft.target != null ? draft.target : null;
    const est = draftLevel != null && econ ? econ.levels.find((x) => x.level === draftLevel) : null;
    const nativeConfirmed = Boolean(draft && (draft.evidence === "native"
        || ["Native Validated", "Approved", "Deployed"].includes(draft.status)));
    const Item = ({ k, children }) => (
        <div><div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{k}</div><div className="text-[12px] font-num flex items-center gap-1.5">{children}</div></div>
    );
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.2)] px-3 py-2 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1.5" data-testid="state-evidence-summary">
            <Item k="Executed target"><span className="text-[hsl(var(--text-1))]">{executedLabel}</span></Item>
            <Item k="Native result">
                <span className={nat.netR >= 0 ? successTone : dangerTone}>{fmtR2(nat.netR)}</span>
                <EvidenceBadge kind="NATIVE" title="Actual backend outcomes at the executed target." />
            </Item>
            <Item k="Draft recommendation">
                {draftLabel ? (
                    <>
                        <span className="text-[hsl(var(--accent-secondary))]">{draftLabel}</span>
                        <span className="text-[8.5px] font-ui text-muted-lab uppercase" title="A research draft — NOT deployed, NOT executing.">draft · not deployed</span>
                    </>
                ) : <span className="text-[hsl(var(--text-3))]">—</span>}
            </Item>
            <Item k="Rescore estimate">
                {est && est.estNetR != null ? (
                    <>
                        <span className={est.estNetR >= 0 ? successTone : dangerTone}>{fmtR2(est.estNetR)}</span>
                        <EvidenceBadge kind="RESCORE" title="MFE re-target ESTIMATE at the draft target — not native." />
                    </>
                ) : <span className="text-[hsl(var(--text-3))]">{draftLevel != null ? "not estimable" : "—"}</span>}
            </Item>
            <Item k="Native confirmation">
                <span className={nativeConfirmed ? successTone : "text-[hsl(var(--text-3))]"}>{nativeConfirmed ? "Available" : "Not yet tested"}</span>
            </Item>
        </div>
    );
}

// ── Draft editor (research layer; NEVER touches execution settings) ─────────────
function StateDraftEditor({ signature, cohortKey, state }) {
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => subscribeDrafts(force), []);
    const draft = getDraft(signature, cohortKey, state);
    const [notes, setNotes] = React.useState(draft?.notes || "");
    React.useEffect(() => { setNotes(getDraft(signature, cohortKey, state)?.notes || ""); }, [signature, cohortKey, state]);
    const set = (patch) => saveDraft(signature, cohortKey, state, patch);
    const statusOptions = ALL_DRAFT_STATUSES.filter((s) => canTransition(draft ? draft.status : null, s) || (draft && s === draft.status));
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.35)] px-3 py-2 space-y-1.5" data-testid="state-draft-editor">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">Research draft</span>
                <span className="text-[10px] font-ui text-muted-lab italic">stored separately from execution — reaches a run only via the Strategy Builder apply action</span>
            </div>
            <div className="text-[9.5px] font-ui text-muted-lab" data-testid="draft-signature">
                <span className="uppercase tracking-wider mr-1">Universe</span>
                <span className="font-num text-[hsl(var(--text-2))]">{signature}</span>
                {draft?.migrated && <span className="ml-1.5 text-[hsl(var(--warning))]" title="Migrated from the unscoped v1 draft store into this signature.">migrated</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-ui">
                <label className="text-muted-lab">Target
                    <select className="ml-1 bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-1 py-0.5 text-[11px]"
                        value={draft?.target ?? ""} data-testid="draft-target"
                        onChange={(e) => set({ target: e.target.value === "" ? null : Number(e.target.value), block: false })}>
                        <option value="">—</option>
                        {STATE_TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t}R</option>)}
                    </select>
                </label>
                <label className="text-muted-lab">Block
                    <input type="checkbox" className="ml-1 align-middle" checked={Boolean(draft?.block)} data-testid="draft-block"
                        onChange={(e) => set({ block: e.target.checked, ...(e.target.checked ? { target: null } : {}) })} />
                </label>
                <label className="text-muted-lab">Confidence
                    <select className="ml-1 bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-1 py-0.5 text-[11px]"
                        value={draft?.confidence ?? ""} onChange={(e) => set({ confidence: e.target.value || null })}>
                        <option value="">—</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
                    </select>
                </label>
                <label className="text-muted-lab" title="Lifecycle: Inspect → Candidate → Confirmed → Added to Run → Native Validated → Approved → Deployed (Rejected from anywhere). Only legal transitions are offered.">Status
                    <select className="ml-1 bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-1 py-0.5 text-[11px]"
                        value={draft?.status ?? "Inspect"} data-testid="draft-status"
                        onChange={(e) => set({ status: e.target.value })}>
                        {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <label className="text-muted-lab">Evidence
                    <select className="ml-1 bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-1 py-0.5 text-[11px]"
                        value={draft?.evidence ?? ""} onChange={(e) => set({ evidence: e.target.value || null })}>
                        <option value="">—</option><option value="native">native</option><option value="rescore">rescore</option>
                    </select>
                </label>
                {draft && (
                    <button type="button" className="text-[10px] text-[hsl(var(--danger))] underline decoration-dotted"
                        onClick={() => deleteDraft(signature, cohortKey, state)} data-testid="draft-delete">delete draft</button>
                )}
            </div>
            <input type="text" placeholder="Notes (e.g. native +16.83R confirmed 2026-07-11; rescore gap 0.00R)"
                value={notes} data-testid="draft-notes"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => set({ notes })}
                className="w-full bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-2 py-1 text-[11px] font-ui text-[hsl(var(--text-1))]" />
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

// Generic collapsible trade-detail section (collapsed by default). Keeps trade tables out of
// the way of the Management suitability panels; the count/badge stays visible when collapsed.
function CollapsibleSection({ title, count, tone = "neutral", testid, children }) {
    const [open, setOpen] = useState(false);
    const badge = tone === "warning"
        ? "border-[hsl(var(--warning)/0.55)] text-[hsl(var(--warning))]"
        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]";
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))]" data-testid={testid}>
            <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2 flex items-center gap-2" data-testid={`${testid}-toggle`}>
                <span className="text-muted-lab">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span className={`text-[11.5px] font-ui ${tone === "warning" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-1))]"}`}>{title}</span>
                {count != null && <span className={`clip-bevel-sm px-1.5 py-0.5 text-[9px] font-ui border ${badge}`}>{count}</span>}
            </button>
            {open && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
}

// Included (kept) portfolio trades — collapsible, collapsed by default. Normal styling.
// `rows` defaults to the cohort's full executed set; the Management state lens passes
// the state-filtered subset so the table matches the panels above it.
function IncludedTradesSection({ c, rows = null, title = "Included portfolio trades" }) {
    const list = Array.isArray(rows) ? rows : c.executedTrades;
    return (
        <CollapsibleSection title={title} count={list.length} tone="neutral" testid="included-trades">
            <ExecutedTable rows={list} showCohort={false} emptyText="No included (kept) trades in this cohort." />
        </CollapsibleSection>
    );
}

// PM-blocked candidates — collapsible, collapsed by default, orange. Only rendered when this
// cohort actually has PM-blocked rows. The table carries the compact "setup records only" note.
function PmBlockedSection({ c }) {
    if (!c.pmEnabled || (c.portfolioBlockedCount || 0) === 0) return null;
    return (
        <CollapsibleSection title="PM-blocked candidates" count={c.portfolioBlockedCount} tone="warning" testid="pm-blocked-candidates">
            <PortfolioBlockedTable rows={c.portfolioBlockedOpportunities} showCohort={false} />
        </CollapsibleSection>
    );
}

function CohortDrilldown({ sessionLabel, sessionKey = null, c, lens = null, scope = null, focus = null, panelStatus = null, provenance = null, scenarioConfig = null, sourceFile = null, signature = null }) {
    const s = c.summary;
    const hc = cohortHeaderCounts(c);
    const disabled = c.status === "disabled";
    const disp = c.display || { state: "enabled", label: "Enabled", tone: "ok" };
    const fail = cohortFailureSummary(c.executedTrades);
    // Local to this expanded cohort. Mounted only while open, so it resets to
    // "overview" whenever a cohort (re-)expands; switching tabs never collapses it.
    // A matrix deep-link (`focus`) opens straight into Management at the target state.
    const [tab, setTab] = useState(focus ? "management" : "overview");
    // Market-State lens (Phase 1). "all" = Whole Cohort — the DEFAULT — and passes the
    // ORIGINAL executedTrades array through untouched (identical behaviour to before).
    const [stateKey, setStateKey] = useState(focus && focus.state ? focus.state : "all");
    React.useEffect(() => {
        if (focus) { setTab("management"); setStateKey(focus.state || "all"); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus && focus.nonce]);
    const stateSelected = stateKey !== "all";
    const stateRows = React.useMemo(
        () => (!stateSelected ? c.executedTrades : ((lens && lens.byState.get(stateKey)) || [])),
        [stateSelected, stateKey, c.executedTrades, lens],
    );
    const stateSuffix = stateSelected ? ` — ${STATE_LABELS[stateKey]}` : "";
    // Executed state policy for THIS run (scenario state_overrides): what target the
    // selected state's trades ACTUALLY ran at (state override / BLOCK / cohort base).
    const execPolicy = React.useMemo(
        () => executedStatePolicy(scenarioConfig, sessionKey, c.structure, c.direction),
        [scenarioConfig, sessionKey, c.structure, c.direction],
    );
    const stateOv = stateSelected && execPolicy && stateKey !== UNLABELLED_KEY ? execPolicy.states[stateKey] : null;
    const executedTargetLabel = stateOv && stateOv.mode === "custom" && stateOv.rr != null
        ? `${stateOv.rr}R (state override)`
        : stateOv && stateOv.mode === "block" ? "BLOCK (state)"
        : c.tpLabel;
    const stateBlockedCount = React.useMemo(() => {
        if (!stateSelected || stateKey === UNLABELLED_KEY) {
            return (c.cancelledOrMissedOpportunities || []).filter(
                (t) => String(t.outcomeRaw || t.outcome).toUpperCase() === "STATE_BLOCKED").length;
        }
        return (c.cancelledOrMissedOpportunities || []).filter(
            (t) => String(t.outcomeRaw || t.outcome).toUpperCase() === "STATE_BLOCKED"
                && (t.regimeEmit?.marketState || t.market_state) === stateKey).length;
    }, [stateSelected, stateKey, c.cancelledOrMissedOpportunities]);
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
                        <KV k="Status" v={disp.label} tone={disp.tone === "danger" ? dangerTone : disp.tone === "caution" ? "text-[hsl(var(--warning))]" : disp.tone === "muted" ? "text-[hsl(var(--text-3))]" : disp.tone === "ok" ? successTone : "text-[hsl(var(--text-2))]"} />
                        {c.pmEnabled && <KV k="PM Action" v={c.pmActionLabel || "—"} tone={c.pmAction === "DISABLE" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-1))]"} />}
                        <KV k="Entry Model" v={c.entryLabel} />
                        <KV k="BE" v={c.beLabel} />
                        <KV k="TP" v={c.tpLabel} />
                        <KV k="Executed" v={s.count} />
                        <KV k="Scenario-disabled" v={c.disabledCount} tone={c.disabledCount > 0 ? dangerTone : undefined} />
                        {c.pmEnabled && <KV k="PM-blocked" v={c.portfolioBlockedCount} tone={c.portfolioBlockedCount > 0 ? "text-[hsl(var(--warning))]" : undefined} />}
                        <KV k="W/L/BE" v={`${s.wins}/${s.losses}/${s.be}`} />
                        <KV k="NF" v={hc.newsFlat} />
                        <KV k="INV" v={hc.invalidated} tone={hc.invalidated > 0 ? dangerTone : undefined} />
                        <KV k="Net R" v={s.count ? fmtR(s.netR) : "—"} tone={s.count ? (s.netR >= 0 ? successTone : dangerTone) : undefined} />
                        <KV k="Avg R" v={s.avgR == null ? "—" : fmtR(s.avgR)} />
                        <KV k="PF" v={s.pf == null ? (s.wins > 0 && s.losses === 0 ? "∞" : "—") : s.pf} />
                        <KV k="Win rate" v={s.winRate == null ? "—" : `${s.winRate}%`} />
                    </div>
                    <div><SubLabel>Management read</SubLabel><ManagementRead rows={c.executedTrades} /></div>
                    <div><SubLabel>Outcome distribution</SubLabel><OutcomeDistribution rows={c.executedTrades} /></div>
                </div>
            )}

            {/* ── Management: State Lens · Callouts · Excursion · Target · BE · Risk Reduction · Entry Threshold ── */}
            {tab === "management" && (
                <TooltipProvider delayDuration={150}>
                <div className="space-y-3">
                    {/* Market-State lens (Phase 1): a filter over the EXISTING panels below.
                        Whole Cohort (default) renders exactly what this tab always rendered. */}
                    {lens && (
                        <div className="space-y-2" data-testid="state-lens-block">
                            {provenance}
                            <div className="flex flex-wrap items-center gap-2">
                                <StateLensBar lens={lens} stateKey={stateKey} onSelect={setStateKey} />
                                <StateSourceBadge sources={lens.sources} />
                            </div>
                            <PmScopeWarning scope={scope} compact />
                            <ClientPanelNote status={panelStatus} />
                            {stateSelected && <StateEvidenceBanner stateKey={stateKey} counts={lens.counts[stateKey]} />}
                            <NativeStatsStrip
                                rows={stateRows}
                                pmBlocked={c.portfolioBlockedCount || 0}
                                stateBlocked={stateBlockedCount}
                                executedLabel={executedTargetLabel}
                                sourceFile={sourceFile}
                            />
                            {stateSelected && stateKey !== UNLABELLED_KEY && (
                                <StateEvidenceSummary
                                    rows={stateRows}
                                    executedLabel={executedTargetLabel}
                                    draft={signature ? getDraft(signature, `${sessionKey || ""}|${c.key}`, stateKey) : null}
                                    econ={stateRows.length ? cohortTargetEconomics(stateRows, executedTargetLabel) : null}
                                />
                            )}
                            <EraPanel rows={stateRows} />
                            {stateSelected && stateKey !== UNLABELLED_KEY && signature && (
                                <StateDraftEditor signature={signature} cohortKey={`${sessionKey || ""}|${c.key}`} state={stateKey} />
                            )}
                            {stateSelected && stateKey === UNLABELLED_KEY && (
                                <p className="text-[10.5px] font-ui text-muted-lab italic" data-testid="unlabelled-note">
                                    Unlabelled = executed trades with no resolvable market state (no engine columns and no client
                                    panel coverage for the fill day). They are shown so state buckets always sum to the whole cohort.
                                </p>
                            )}
                        </div>
                    )}
                    {/* Suitability panels FIRST — computed from included/kept trades only. */}
                    <ManagementCallouts rows={stateRows} tpLabel={c.tpLabel} />
                    {c.pmEnabled && (c.portfolioBlockedCount || 0) > 0 && (
                        <p className="text-[10px] font-ui text-muted-lab italic" data-testid="suitability-scope-note">Computed from included portfolio trades only.</p>
                    )}
                    <div><SubLabel>Excursion snapshot{stateSuffix}</SubLabel><ExcursionSnapshot rows={stateRows} /></div>
                    <div><SubLabel>Target suitability{stateSuffix}</SubLabel><TargetSuitability rows={stateRows} tpLabel={executedTargetLabel} baseLabel={c.tpLabel} /></div>
                    <div><SubLabel>BE suitability{stateSuffix}</SubLabel><BESuitability rows={stateRows} /></div>
                    <div><SubLabel>Risk reduction suitability{stateSuffix}</SubLabel><RiskReduction rows={stateRows} /></div>
                    <div><SubLabel>Entry threshold research</SubLabel><EntryThresholdResearch /></div>
                    {/* Trade-detail sections LAST — collapsed by default, never mixed. */}
                    <IncludedTradesSection c={c} rows={stateRows} title={`Included portfolio trades${stateSuffix}`} />
                    <PmBlockedSection c={c} />
                    {stateSelected && c.pmEnabled && (c.portfolioBlockedCount || 0) > 0 && (
                        <p className="text-[10px] font-ui text-muted-lab italic" data-testid="pm-blocked-state-note">
                            PM-blocked candidates are never state-filtered here: they were removed before fill, carry no MFE, and
                            cannot contribute to any state's target evidence.
                        </p>
                    )}
                </div>
                </TooltipProvider>
            )}

            {/* ── Failures: Failure Summary · Failure Clusters · Losses · Cancelled / Missed ── */}
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
                                    <div className="text-[11px] font-ui text-muted-lab">
                                        <span className="uppercase text-[10px] tracking-wider text-[hsl(var(--accent-secondary))] mr-2">Top reasons</span>
                                        {fail.topReasons.map((r, i) => <span key={r.reason} className="text-[hsl(var(--text-2))]">{i > 0 ? " · " : ""}{r.reason} ×{r.count}</span>)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div><SubLabel>Failure clusters</SubLabel><FailureClusters rows={c.executedTrades} /></div>
                    {fail.totalLosses > 0 && <div><SubLabel>Losses</SubLabel><LossesTable rows={fail.losses} /></div>}
                    <div><SubLabel>Cancelled / missed opportunities</SubLabel><CancelledTable rows={c.cancelledOrMissedOpportunities} /></div>
                    {c.pmEnabled && c.portfolioBlockedCount > 0 && (
                        <div><SubLabel>Blocked by Portfolio Manager (excluded from portfolio)</SubLabel><PortfolioBlockedTable rows={c.portfolioBlockedOpportunities} showCohort={false} emptyText="No Portfolio-Manager-blocked trades for this cohort." /></div>
                    )}
                </div>
            )}

            {/* ── Trades: Executed · Scenario-disabled · PM-blocked ── */}
            {tab === "trades" && (
                <div className="space-y-3">
                    <div><SubLabel>Executed trades</SubLabel><ExecutedTable rows={c.executedTrades} showCohort={false} emptyText="No executed trades for this cohort." /></div>
                    <div><SubLabel>Scenario-disabled opportunities</SubLabel><DisabledTable rows={c.disabledOpportunities} showCohort={false} emptyText="No scenario-disabled opportunities for this cohort." /></div>
                    {c.pmEnabled && (
                        <div><SubLabel>Blocked by Portfolio Manager — would-have-been trades (excluded from portfolio)</SubLabel><PortfolioBlockedTable rows={c.portfolioBlockedOpportunities} showCohort={false} emptyText="No Portfolio-Manager-blocked trades for this cohort." /></div>
                    )}
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
export default function SessionResults({ trades: tradesProp, bundle: bundleProp, universe = null, universeStatus = "ok" } = {}) {
    useDataset();
    // Re-read the viewed run from the store when it has an id so a background candle
    // rehydration (IndexedDB → bundle.candles, see below) is picked up on the next
    // render even though the PARENT passed a pre-rehydration bundle object.
    const bundle = bundleProp && bundleProp.id
        ? (getRunData(bundleProp.id) || bundleProp)
        : (bundleProp ?? getActiveBundle());
    const trades = Array.isArray(tradesProp) ? tradesProp : (getTradeUniverse()?.trades || []);
    const cfg = bundle?.config || {};
    const scenarioConfig = cfg.session_strategy_scenario || null;

    // Portfolio Manager context for this run. When PM was ON, cohort status becomes
    // PM-aware; the deployed policy mirror is the fallback source for a cohort's action
    // (covers NEVER-TRADE cohorts that produced zero rows). PM OFF ⇒ ctx null ⇒ legacy.
    const portfolioCtx = React.useMemo(() => {
        const enabled = cfg.portfolio_policy_enabled === true || cfg.portfolio_policy_enabled === "true";
        if (!enabled) return null;
        const instrument = cfg.symbol || cfg.instrument || trades.find((t) => t.symbol || t.instrument)?.symbol || trades.find((t) => t.symbol || t.instrument)?.instrument || "";
        let policyByKey = null;
        try { policyByKey = loadPolicy(deployedPolicyDoc).byKey; } catch (_e) { policyByKey = null; }
        return { enabled: true, instrument, version: cfg.portfolio_policy_version || null, policyByKey };
    }, [cfg, trades]);

    const [sessionKey, setSessionKey] = useState("london");
    const [expanded, setExpanded] = useState({}); // key: "session|cell"
    // Matrix deep-link target: { sessionKey, cohortKey, state, nonce }. Passed to the
    // matching CohortDrilldown so it opens on Management with that state selected.
    const [drillFocus, setDrillFocus] = useState(null);
    // Research-draft store subscription (drafts render as ✎ badges in the matrix;
    // they NEVER affect execution — apply happens only in the Strategy Builder).
    const [draftTick, forceDraftTick] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => subscribeDrafts(forceDraftTick), []);

    // buildSessionResults is pure; memoized so the state-lens map below only rebuilds
    // when the run actually changes (identical output to the previous per-render call).
    const built = React.useMemo(
        () => buildSessionResults(trades, scenarioConfig, portfolioCtx),
        [trades, scenarioConfig, portfolioCtx],
    );
    const { hasScenario, portfolioEnabled, sessions, portfolioSummary, unassigned, unassignedCount } = built;
    const active = sessions.find((s) => s.key === sessionKey) || sessions[0];

    // ── Market-State lens inputs (Phase 1) ───────────────────────────────────
    // Engine-preferred doctrine: the client reconstruction is considered ONLY for
    // executed rows that carry no engine market-state columns.
    const executedRows = React.useMemo(
        () => sessions.flatMap((s) => s.cohorts.flatMap((c) => c.executedTrades)),
        [sessions],
    );
    const anyMissingEngine = React.useMemo(
        () => executedRows.some((t) => !(t && t.regimeEmit && t.regimeEmit.marketState)),
        [executedRows],
    );

    // Candle sources for the client panel, in priority order (all background, all
    // fail-soft — unresolved rows stay Unlabelled, states are never invented):
    //   1. bundle.candles      — in memory (eager folder import)
    //   2. IndexedDB           — imported once, dropped from memory (rehydrate)
    //   3. sidecar 1D buckets  — sidecar result-bundle imports EXCLUDE candles.csv by
    //      design, so bundles like the PM-enforce full-history run have NO candles
    //      anywhere client-side; the daily regime panel only needs UTC-day OHLC, so
    //      we fetch epoch-aligned 1D buckets (~1 row/day) from the sidecar.
    const hasCandlesInMemory = !!bundle?.candles?.length;
    const dailyCandles = bundle?.regimeDailyCandles;
    const hasDailyCandles = Array.isArray(dailyCandles) && dailyCandles.length > 0;
    const candlesInIndexedDb = !!bundle?.hasCandles && bundle?.candlesStorage === "indexeddb" && !hasCandlesInMemory;
    const [candleLoadState, setCandleLoadState] = React.useState("idle");
    const [sidecarDailyState, setSidecarDailyState] = React.useState("idle");
    React.useEffect(() => { setCandleLoadState("idle"); setSidecarDailyState("idle"); }, [bundle?.id]);
    React.useEffect(() => {
        let cancelled = false;
        if (!bundle?.id || !anyMissingEngine || !candlesInIndexedDb || candleLoadState !== "idle") return undefined;
        setCandleLoadState("loading");
        rehydrateRunCandles(bundle.id)
            .then((okLoaded) => { if (!cancelled) setCandleLoadState(okLoaded ? "loaded" : "missing"); })
            .catch(() => { if (!cancelled) setCandleLoadState("missing"); });
        return () => { cancelled = true; };
    }, [bundle?.id, anyMissingEngine, candlesInIndexedDb, candleLoadState]);
    React.useEffect(() => {
        let cancelled = false;
        if (!bundle?.id || !anyMissingEngine || sidecarDailyState !== "idle") return undefined;
        if (hasCandlesInMemory || hasDailyCandles || candlesInIndexedDb) return undefined; // better source exists
        setSidecarDailyState("loading");
        loadDailyRegimeCandles(bundle.id)
            .then((c) => { if (!cancelled) setSidecarDailyState(c && c.length ? "loaded" : "missing"); })
            .catch(() => { if (!cancelled) setSidecarDailyState("missing"); });
        return () => { cancelled = true; };
    }, [bundle?.id, anyMissingEngine, hasCandlesInMemory, hasDailyCandles, candlesInIndexedDb, sidecarDailyState]);

    // Honest availability read for the client fallback, rendered next to the state
    // selector and in the matrix. "not_needed" = every executed row is engine-labelled.
    const clientPanelStatus = React.useMemo(() => {
        if (!anyMissingEngine) return { key: "not_needed" };
        if (hasCandlesInMemory || hasDailyCandles) return { key: "ready" };
        const idb = candlesInIndexedDb ? candleLoadState : "na";
        const sc = bundle?.id ? sidecarDailyState : "na";
        if (idb === "idle" || idb === "loading" || sc === "idle" || sc === "loading") return { key: "loading" };
        if (idb === "missing" || sc === "missing") return { key: "missing" };
        return { key: "unavailable" };
    }, [anyMissingEngine, hasCandlesInMemory, hasDailyCandles, candlesInIndexedDb, candleLoadState, sidecarDailyState, bundle]);

    // Client daily-regime panel: built ONLY when some executed row lacks engine
    // market-state columns AND a candle source is available. Full-resolution candles
    // take precedence; sidecar 1D buckets are equivalent for the DAILY panel (it
    // resamples to UTC-day OHLC either way).
    const regimePanel = React.useMemo(() => {
        if (!anyMissingEngine) return null;
        const candles = hasCandlesInMemory ? bundle.candles : (hasDailyCandles ? dailyCandles : null);
        if (!Array.isArray(candles) || !candles.length) return null;
        return daily_regime_panel(candles, regimeCfgFromRunConfig(cfg), cfg.symbol || cfg.instrument || "EURUSD");
    }, [bundle, anyMissingEngine, hasCandlesInMemory, hasDailyCandles, dailyCandles, cfg]);

    // One state-lens per cohort ("session|cell" → groupRowsByMarketState result).
    // Single pass over executed rows; feeds the matrix, the header glyph strips and
    // each drilldown's state selector (no per-drilldown recompute).
    const cohortStateLens = React.useMemo(() => {
        const m = new Map();
        for (const s of sessions) for (const c of s.cohorts) m.set(`${s.key}|${c.key}`, groupRowsByMarketState(c.executedTrades, regimePanel));
        return m;
    }, [sessions, regimePanel]);

    // Research-correctness scope: PM enforce / regime filter ⇒ state populations
    // incomplete for target research (removed candidates have no MFE).
    const populationScope = React.useMemo(
        () => statePopulationScope(cfg, { portfolioBlockedTotal: portfolioSummary ? portfolioSummary.total : 0 }),
        [cfg, portfolioSummary],
    );

    const openCohortAtState = React.useCallback((sKey, cKey, stateKey) => {
        setSessionKey(sKey);
        setExpanded((m) => ({ ...m, [`${sKey}|${cKey}`]: true }));
        setDrillFocus({ sessionKey: sKey, cohortKey: cKey, state: stateKey === "all" ? "all" : stateKey, nonce: Date.now() });
    }, []);

    // ── Variant switching (canonical-universe contract) ───────────────────────
    // When the ACTIVE universe identity changes (family / threshold / delay /
    // penetration / directional / position variant), clear cross-variant UI state so
    // no stale cohort expansion, matrix deep-link, or per-state selection survives
    // into a different trade set (drilldowns unmount ⇒ their state lens resets too).
    const universeKey = `${bundle?.id || "active"}|${universe ? (universe.sourceKey || universe.sourceFile || universe.label || "") : "legacy"}`;
    const lastUniverseKey = React.useRef(universeKey);
    React.useEffect(() => {
        if (lastUniverseKey.current === universeKey) return;
        lastUniverseKey.current = universeKey;
        setExpanded({});
        setDrillFocus(null);
    }, [universeKey]);

    // Run-wide counts for the provenance line (same buckets every surface uses).
    const runwideCounts = React.useMemo(() => {
        let executed = 0, disabled = 0;
        for (const s of sessions) { executed += s.summary.executed; disabled += s.summary.disabledOpportunities; }
        return { executed, disabled, pmBlocked: portfolioSummary ? portfolioSummary.total : 0 };
    }, [sessions, portfolioSummary]);
    // Research-universe STRATEGY SIGNATURE (correction 2): drafts are scoped to the
    // active universe (instrument|detection_tf|family|threshold|delay|variant) so
    // research from one strategy can never contaminate another.
    const strategySignature = React.useMemo(() => buildStrategySignature({
        instrument: cfg.symbol || cfg.instrument,
        detectionTf: cfg.detection_timeframe || cfg.detection_tf,
        family: universe?.scenario?.family ?? (universe ? "baseline" : null),
        threshold: universe?.scenario?.threshold,
        delay: universe?.scenario?.fillMode,
        variant: universe?.variant || bundle?.primaryVariant,
    }), [cfg, universe, bundle]);

    const provenanceLine = universe ? (
        <UniverseProvenance
            universe={universe}
            positionMode={universe.variant || bundle?.primaryVariant || null}
            executed={runwideCounts.executed}
            pmBlocked={runwideCounts.pmBlocked}
            cohortDisabled={runwideCounts.disabled}
            compact
        />
    ) : null;

    return (
        <NeonPanel title="Session Results">
            {!trades.length ? (
                universe ? (
                    // Canonical-universe mode: a selected scenario with no resolved rows is
                    // an explicit loading/unavailable state — NEVER a silent baseline swap.
                    <UniverseUnavailable universe={universe} universeStatus={universeStatus === "ok" ? "empty" : universeStatus} />
                ) : (
                    <p className="text-[12px] font-ui text-muted-lab">No trades in this run. Import a run to see session results.</p>
                )
            ) : (
                <div className="space-y-4">
                    {!hasScenario && (
                        <div className="clip-bevel-sm border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] px-3 py-2 text-[11.5px] font-ui text-[hsl(var(--warning))]" data-testid="no-scenario-banner">
                            No Session Scenario was applied to this run — cohorts are not disabled by the scenario layer.{portfolioEnabled ? " Portfolio Manager was ON: cohort status below reflects the PM action." : " All cohorts shown as enabled."}
                        </div>
                    )}
                    {portfolioEnabled && (
                        <div className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.35)] bg-[hsl(var(--accent-primary)/0.06)] px-3 py-2 text-[11px] font-ui text-[hsl(var(--text-1))]" data-testid="pm-active-banner">
                            <span className="uppercase text-[9.5px] tracking-wider text-[hsl(var(--accent-primary))] mr-2">Portfolio Manager ON</span>
                            Cohort status shows the PM action (Always Allow / Block Chop / Follow Trend / Never Trade). PM-removed candidates are shown as <span className="text-[hsl(var(--warning))]">blocked</span>, separate from unfilled/missed.
                        </div>
                    )}

                    {/* Active-universe provenance — identical rows to the headline KPIs. */}
                    {universe && (
                        <UniverseProvenance
                            universe={universe}
                            positionMode={universe.variant || bundle?.primaryVariant || null}
                            executed={runwideCounts.executed}
                            pmBlocked={runwideCounts.pmBlocked}
                            cohortDisabled={runwideCounts.disabled}
                        />
                    )}

                    {/* Run-level Target Policy Matrix (Phase 1) — navigation/status only. */}
                    <TargetPolicyMatrix sessions={sessions} lensMap={cohortStateLens} scope={populationScope} onOpen={openCohortAtState} panelStatus={clientPanelStatus} provenance={provenanceLine} scenarioConfig={scenarioConfig} draftTick={draftTick} signature={strategySignature} />

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
                        <Stat label={portfolioEnabled ? "PM-disabled cohorts" : "Disabled cohorts"} value={portfolioEnabled ? active.summary.pmDisabledCohorts : active.summary.disabledCohorts} tone={(portfolioEnabled ? active.summary.pmDisabledCohorts : active.summary.disabledCohorts) > 0 ? (portfolioEnabled ? "text-[hsl(var(--warning))]" : dangerTone) : undefined} />
                    </div>
                    {portfolioEnabled && (active.summary.portfolioBlocked > 0 || active.summary.pmBlockedCohorts > 0) && (
                        <div className="text-[11px] font-ui text-muted-lab" data-testid="pm-blocked-summary">
                            <span className="uppercase text-[9.5px] tracking-wider text-[hsl(var(--warning))] mr-2">PM blocked · {active.label}</span>
                            {active.summary.portfolioBlocked} would-have-been trade{active.summary.portfolioBlocked === 1 ? "" : "s"} removed across {active.summary.pmBlockedCohorts} cohort{active.summary.pmBlockedCohorts === 1 ? "" : "s"} — counted separately from unfilled/missed.
                        </div>
                    )}
                    {/* Run-level PM-blocked aggregate across ALL sessions + reason split. */}
                    {portfolioEnabled && portfolioSummary && portfolioSummary.total > 0 && (
                        <div className="clip-bevel-sm border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] px-3 py-2 text-[11px] font-ui text-[hsl(var(--text-1))]" data-testid="pm-blocked-run-summary">
                            <span className="uppercase text-[9.5px] tracking-wider text-[hsl(var(--warning))] mr-2">PM blocked · whole run</span>
                            <span className="font-num text-[hsl(var(--warning))]" data-testid="pm-blocked-run-total">{portfolioSummary.total}</span> candidate{portfolioSummary.total === 1 ? "" : "s"} rejected before execution
                            <span className="text-muted-lab"> · </span>
                            <span data-testid="pm-blocked-run-direction">Follow-trend / direction mismatch: <span className="font-num">{portfolioSummary.directionMismatch}</span></span>
                            <span className="text-muted-lab"> · </span>
                            <span data-testid="pm-blocked-run-state">Block-chop / state not allowed: <span className="font-num">{portfolioSummary.stateNotAllowed}</span></span>
                            <span className="text-muted-lab"> · </span>
                            <span data-testid="pm-blocked-run-disabled">Never-trade / policy disabled: <span className="font-num">{portfolioSummary.policyDisabled}</span></span>
                            {portfolioSummary.other > 0 && <><span className="text-muted-lab"> · </span><span>Other: <span className="font-num">{portfolioSummary.other}</span></span></>}
                        </div>
                    )}

                    {/* B. Cohort breakdown — expandable drilldown per cohort */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Cohort breakdown — click to drill in</div>
                        <div className="space-y-2">
                            {active.cohorts.map((c) => {
                                const ekey = `${active.key}|${c.key}`;
                                const isOpen = !!expanded[ekey];
                                const disp = c.display || { state: "enabled", label: "Enabled", tone: "ok" };
                                const disabled = c.status === "disabled";                 // scenario-disabled (legacy)
                                const isPmDisabled = disp.state === "pm_disabled";
                                const isPmBlocked = disp.state === "pm_blocked";
                                const cardTone = pmStateTone(disp.state);
                                const eCount = c.executedCount;
                                const dCount = c.disabledCount;
                                const mCount = c.cancelledMissedCount;
                                const blkCount = c.portfolioBlockedCount;
                                const wr = c.summary ? c.summary.winRate : null;
                                const sample = eCount > 0 && eCount < 10 ? (eCount < 5 ? "low sample" : "small sample") : null;
                                return (
                                    <div key={c.key} className={`clip-bevel-sm border ${cardTone.border} ${cardTone.bg}`} data-testid={`cohort-card-${c.key}`} data-cohort-state={disp.state}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                // Manual toggle clears any matrix deep-link focus for this cohort so a
                                                // later re-expand opens at the normal Overview default, not a stale state.
                                                setDrillFocus((f) => (f && f.sessionKey === active.key && f.cohortKey === c.key ? null : f));
                                                setExpanded((m) => ({ ...m, [ekey]: !m[ekey] }));
                                            }}
                                            className="w-full text-left px-3 py-2 flex items-center justify-between gap-3"
                                            data-testid={`cohort-row-${c.key}`}
                                        >
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className="text-muted-lab">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center">
                                                        <span className={`text-[12.5px] font-ui font-semibold ${eCount > 0 ? "text-[hsl(var(--text-1))]" : "text-[hsl(var(--text-2))]"}`}>{c.label}</span>
                                                        <span className="clip-bevel-sm px-1.5 py-0.5 ml-2 text-[9px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]" title="Cohort BASE TARGET (session-scenario rule) — distinct from any state-specific target and from the PM action" data-testid={`cohort-base-target-${c.key}`}>Base {c.tpLabel}</span>
                                                        <span className="hidden md:inline-flex"><StateGlyphStrip lens={cohortStateLens.get(`${active.key}|${c.key}`)} /></span>
                                                    </div>
                                                    <div data-testid={`cohort-counts-${c.key}`}>
                                                        {disabled
                                                            ? (<div className="text-[11px] font-ui text-muted-lab">{c.disabledCount > 0 ? <span className="text-[hsl(var(--danger))]">Blocked by scenario · {c.disabledCount} opportunit{c.disabledCount === 1 ? "y" : "ies"}</span> : <span className="text-[hsl(var(--danger))]">Disabled by scenario</span>}</div>)
                                                            : isPmDisabled
                                                            ? (<div className="text-[11px] font-ui"><span className="text-[hsl(var(--warning))]">Disabled by Portfolio Manager</span>{blkCount > 0 ? <span className="text-muted-lab"> · {blkCount} would-have-been</span> : null}</div>)
                                                            : isPmBlocked
                                                            ? (<div className="text-[11px] font-ui"><span className="text-[hsl(var(--warning))]">Blocked by PM — {blkCount} would-have-been trade{blkCount === 1 ? "" : "s"} available</span></div>)
                                                            : (c.executedCount === 0
                                                                ? <div className="text-[11px] font-ui text-muted-lab">{disp.label}</div>
                                                                : (() => {
                                                                    const hc = cohortHeaderCounts(c);
                                                                    const s = c.summary || {};
                                                                    const pfText = s.pf == null ? (s.wins > 0 && s.losses === 0 ? "∞" : "—") : s.pf;
                                                                    return (
                                                                        <>
                                                                            <div className="text-[11px] font-ui text-muted-lab">
                                                                                <span className="font-num text-[hsl(var(--text-1))]">{hc.trades}T</span> · {hc.won}W · {hc.lost}L · {hc.newsFlat}NF · <span className={hc.invalidated > 0 ? "text-[hsl(var(--danger))]" : ""}>{hc.invalidated}INV</span>
                                                                            </div>
                                                                            <div className="text-[10.5px] font-ui text-muted-lab" data-testid={`cohort-stats-${c.key}`}>
                                                                                Net <span className={`font-num ${s.netR >= 0 ? successTone : dangerTone}`}>{fmtR(s.netR)}</span> · PF <span className="font-num text-[hsl(var(--text-2))]">{pfText}</span> · Exp <span className="font-num text-[hsl(var(--text-2))]">{s.avgR == null ? "—" : fmtR(s.avgR)}</span> · WR <span className="font-num text-[hsl(var(--text-2))]">{s.winRate == null ? "—" : `${s.winRate}%`}</span>
                                                                            </div>
                                                                        </>
                                                                    );
                                                                })())}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                                                <div>
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Trades</div>
                                                    <div className="text-[12px] font-num text-[hsl(var(--accent-secondary))]">{eCount}T{dCount > 0 ? <span className="text-[hsl(var(--danger))]"> • {dCount} scn</span> : null}{blkCount > 0 ? <span className="text-[hsl(var(--warning))]"> • {blkCount} PM</span> : null}{mCount > 0 ? <span className="text-[hsl(var(--text-2))]"> • {mCount} missed</span> : null}</div>
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
                                                {c.pmEnabled && (
                                                    <div title="Candidate trades rejected by Portfolio Manager before execution.">
                                                        <div className="text-[9.5px] font-ui uppercase text-muted-lab">PM Blocked</div>
                                                        <div
                                                            className={`text-[12px] font-num ${blkCount > 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-3))]"}`}
                                                            data-testid={`cohort-pm-blocked-${c.key}`}
                                                        >
                                                            {blkCount}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="min-w-[92px]">
                                                    <div className="text-[9.5px] font-ui uppercase text-muted-lab">Status</div>
                                                    <div className={`text-[11px] font-ui ${cardTone.text}`} data-testid={`cohort-status-${c.key}`} title={c.pmActionLabel && POLICY_TOOLTIPS[c.pmAction] ? POLICY_TOOLTIPS[c.pmAction] : undefined}>
                                                        {isPmDisabled ? "Disabled by PM"
                                                            : isPmBlocked ? "Blocked by PM"
                                                            : disabled ? "Disabled (scenario)"
                                                            : c.pmActionLabel ? c.pmActionLabel
                                                            : disp.label}
                                                    </div>
                                                </div>
                                                <div className="hidden lg:block"><div className="text-[9.5px] font-ui uppercase text-muted-lab">TP</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.tpLabel}</div></div>
                                                <div className="hidden lg:block"><div className="text-[9.5px] font-ui uppercase text-muted-lab">BE</div><div className="text-[11px] font-ui text-[hsl(var(--text-2))]">{c.beLabel}</div></div>
                                            </div>
                                        </button>
                                        {isOpen && (
                                            <div className="px-3 pb-3">
                                                <CohortDrilldown
                                                    sessionLabel={active.label}
                                                    sessionKey={active.key}
                                                    c={c}
                                                    lens={cohortStateLens.get(ekey)}
                                                    scope={populationScope}
                                                    panelStatus={clientPanelStatus}
                                                    provenance={provenanceLine}
                                                    scenarioConfig={scenarioConfig}
                                                    sourceFile={universe ? (universe.sourceFile || universe.sourceKey || null) : null}
                                                    signature={strategySignature}
                                                    focus={drillFocus && drillFocus.sessionKey === active.key && drillFocus.cohortKey === c.key ? drillFocus : null}
                                                />
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

                    {/* D. Session-wide scenario-disabled opportunities */}
                    <div>
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">Scenario-disabled opportunities — {active.label}</div>
                        <DisabledTable rows={active.cohorts.flatMap((c) => c.disabledOpportunities)} />
                    </div>

                    {/* D2. Session-wide PM-blocked would-have-been trades (only when PM ON) */}
                    {portfolioEnabled && (
                        <div>
                            <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--warning))] mb-2">Blocked by Portfolio Manager — {active.label} <span className="text-muted-lab normal-case tracking-normal">(excluded from portfolio; shown for analysis)</span></div>
                            <PortfolioBlockedTable rows={active.cohorts.flatMap((c) => c.portfolioBlockedOpportunities)} />
                        </div>
                    )}

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
