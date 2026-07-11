// RunPortfolioAttribution — "Portfolio Manager in this run" (READ-ONLY).
//
// Run-SPECIFIC PM attribution for the viewed run: what the Portfolio Manager actually did
// INSIDE this run (kept vs blocked, per-cohort action + status, kept-book metrics), as
// opposed to the Portfolio Manager PAGE which shows the deployed policy + frozen full-
// history research evidence. All numbers come from buildRunPortfolioAttribution() over the
// run's own imported rows — never the research dataset. Friendly labels (ALWAYS ALLOW /
// BLOCK CHOP / FOLLOW TREND / NEVER TRADE) primary, canonical enum muted. No writes.

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { useDataset, getActiveBundle, getTradeUniverse } from "@/data/store";
import { buildRunPortfolioAttribution } from "@/data/runPortfolioAttribution";
import { loadPolicy, policyCounts } from "@/data/portfolioPolicy";
import { POLICY_LABELS, POLICY_TOOLTIPS } from "@/data/portfolioLabels";
import deployedPolicyDoc from "@/data/deployedPolicy.v1.json";

const successTone = "text-[hsl(var(--success))]";
const dangerTone = "text-[hsl(var(--danger))]";
const warnTone = "text-[hsl(var(--warning))]";
const mutedTone = "text-[hsl(var(--text-3))]";
const fmtR = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);

// canonical → friendly label (primary) with the canonical code shown muted + tooltip.
function PmAction({ code }) {
    if (!code) return <span className={mutedTone}>—</span>;
    return (
        <span className="inline-flex items-baseline gap-1" title={POLICY_TOOLTIPS[code] || ""}>
            <span className="font-ui text-[hsl(var(--text-1))]">{POLICY_LABELS[code] || code}</span>
            <span className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-3))]">{code}</span>
        </span>
    );
}

function Card({ label, value, tone, sub, title }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.2)] px-3 py-2" title={title}>
            <div className="text-[10px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--accent-secondary))]">{label}</div>
            <div className={`text-[15px] font-num ${tone || "text-[hsl(var(--text-1))]"}`}>{value}</div>
            {sub != null && <div className="text-[10px] font-ui text-muted-lab mt-0.5">{sub}</div>}
        </div>
    );
}

// Row tint per cohort display state (amber = PM removed; green/red = actually traded).
function rowClass(state, netR) {
    if (state === "pm_disabled" || state === "pm_blocked") return "bg-[hsl(var(--warning)/0.07)]";
    if (state === "scenario_disabled") return "bg-[hsl(var(--danger)/0.06)]";
    if (state === "active") return netR > 0 ? "bg-[hsl(var(--success)/0.06)]" : netR < 0 ? "bg-[hsl(var(--danger)/0.05)]" : "";
    return ""; // no-data / no-setups / no-fills → muted (no tint)
}
function statusText(state, label) {
    switch (state) {
        case "pm_disabled": return { t: "Never trade (PM)", tone: warnTone };
        case "pm_blocked": return { t: "Blocked by PM", tone: warnTone };
        case "scenario_disabled": return { t: "Disabled (scenario)", tone: dangerTone };
        case "active": return { t: "Active", tone: successTone };
        case "enabled_no_setups": return { t: "No setups", tone: mutedTone };
        case "enabled_no_fills": return { t: "No fills", tone: mutedTone };
        default: return { t: label || "—", tone: mutedTone };
    }
}

// SECONDARY, collapsed-by-default deployed-policy reference. This is the FROZEN full-history
// policy — NOT this run. Hidden behind an explicit "Open policy reference" button so the tab
// never fills with reference data by default.
function PolicyReference() {
    const [open, setOpen] = useState(false);
    const counts = useMemo(() => {
        try { const t = loadPolicy(deployedPolicyDoc); return policyCounts(t.cohorts).byPolicy; } catch (_e) { return null; }
    }, []);
    if (!counts) return null;
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))]">
            <div className="px-3 py-2 flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-[11.5px] font-ui text-[hsl(var(--text-2))] hover:text-white" data-testid="pm-run-policy-ref-toggle">
                    <span className="text-muted-lab">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    Open policy reference
                </button>
                <span className="text-[10px] font-ui text-muted-lab">frozen deployed policy · full research — not this run</span>
                <Link to="/portfolio-manager" className="ml-auto text-[10.5px] font-ui text-[hsl(var(--accent-primary))] hover:underline" data-testid="pm-run-policy-page-link">Open Portfolio Manager page →</Link>
            </div>
            {open && (
                <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-[hsl(var(--border-soft))] pt-2">
                    {["LABEL", "STATE_ONLY", "DIRECTION_AWARE", "DISABLE"].map((k) => (
                        <div key={k} className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1" title={POLICY_TOOLTIPS[k]}>
                            <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">{POLICY_LABELS[k]}</div>
                            <div className="text-[13px] font-num text-[hsl(var(--text-1))]">{counts[k] || 0} <span className="text-[9px] text-[hsl(var(--text-3))]">{k}</span></div>
                        </div>
                    ))}
                    <div className="text-[10px] font-ui text-muted-lab self-center">Deployed-policy cohort counts across the full research dataset — reference only.</div>
                </div>
            )}
        </div>
    );
}

// First card on the tab — makes the run-vs-reference distinction unmissable.
function ScopeBanner({ pmOn }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.07)] px-3 py-2" data-testid="pm-run-scope-banner">
            <div className="text-[11px] font-ui text-[hsl(var(--text-1))]">
                <span className="uppercase text-[9.5px] tracking-wider text-[hsl(var(--accent-primary))] mr-2">This run</span>
                This is <span className="font-semibold">run-specific attribution</span> — what the Portfolio Manager actually did inside this run. It is <span className="font-semibold">not</span> the frozen research policy page.
                {pmOn ? " Numbers below come from this run's own trades." : ""}
            </div>
        </div>
    );
}

export default function RunPortfolioAttribution({ trades: tradesProp, bundle: bundleProp } = {}) {
    useDataset();
    const bundle = bundleProp ?? getActiveBundle();
    const trades = Array.isArray(tradesProp) ? tradesProp : (getTradeUniverse()?.trades || []);
    const cfg = bundle?.config || {};

    const attribution = useMemo(() => {
        let policyByKey = null;
        try { policyByKey = loadPolicy(deployedPolicyDoc).byKey; } catch (_e) { policyByKey = null; }
        const instrument = cfg.symbol || cfg.instrument || "";
        return buildRunPortfolioAttribution(trades, cfg, { policyByKey, instrument });
    }, [trades, cfg]);

    // All hooks BEFORE any early return (Rules of Hooks). bySession is empty when PM is off.
    const [expandSessions, setExpandSessions] = useState(false);
    const bySession = useMemo(() => {
        const map = new Map();
        for (const c of attribution.cohorts) {
            if (!map.has(c.session)) map.set(c.session, { label: c.sessionLabel, rows: [] });
            map.get(c.session).rows.push(c);
        }
        return [...map.values()];
    }, [attribution]);

    // ── PM OFF ────────────────────────────────────────────────────────────────
    if (!attribution.enabled) {
        return (
            <NeonPanel title="PM · This Run">
                <div className="space-y-3">
                    <ScopeBanner pmOn={false} />
                    <div className="clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.25)] px-3 py-2 text-[12px] font-ui text-[hsl(var(--text-1))]" data-testid="pm-run-off">
                        Portfolio Manager was <span className="font-semibold">OFF</span> for this run — no trades were kept or blocked by policy. Every eligible trade entered the portfolio.
                    </div>
                    <PolicyReference />
                </div>
            </NeonPanel>
        );
    }

    // ── PM ON ─────────────────────────────────────────────────────────────────
    const s = attribution.summary;
    const br = s.blockReasonCounts;
    const pfText = s.pfKeptInfinite ? "∞" : (s.pfKept == null ? "—" : s.pfKept);

    return (
        <NeonPanel title="PM · This Run">
            <div className="space-y-4">
                <ScopeBanner pmOn={true} />

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    <Card label="Policy version" value={attribution.version || "—"} sub={attribution.mode ? `mode: ${attribution.mode}` : null} />
                    <Card label="PM kept" value={`${s.keptCount}T`} tone={successTone} sub={`${s.keptWins}W · ${s.keptLosses}L · ${s.keptBe}BE`} />
                    <Card label="PM blocked" value={`${s.blockedCount}T`} tone={s.blockedCount > 0 ? warnTone : undefined} sub="removed from portfolio" />
                    <Card label="Block reasons" value={`${br.portfolio_disabled}/${br.state_not_allowed}/${br.direction_mismatch}`} sub="NeverTrade / State / Direction" title="Blocked candidates by reason: portfolio_disabled / state_not_allowed / direction_mismatch" />
                    <Card label="Kept Net R" value={fmtR(s.netRKept)} tone={s.netRKept >= 0 ? successTone : dangerTone} />
                    <Card label="Kept win rate" value={s.winRateKept == null ? "—" : `${s.winRateKept}%`} />
                    <Card label="Kept PF" value={pfText} />
                    <Card label="Kept Max DD" value={s.maxDrawdownRKept == null ? "—" : fmtR(s.maxDrawdownRKept)} tone={dangerTone} />
                    <Card
                        label="Blocked would-be Net R"
                        value={s.blockedWouldBeAvailable ? fmtR(s.blockedWouldBeNetR) : "not recorded"}
                        tone={s.blockedWouldBeAvailable ? (s.blockedWouldBeNetR >= 0 ? successTone : dangerTone) : mutedTone}
                        sub={s.blockedWouldBeAvailable ? "hypothetical R on blocked trades" : "backend emits no R for blocked rows"}
                    />
                    <Card
                        label="Net effect vs control"
                        value={s.netEffectAvailable ? `${fmtR(s.controlNetR)} → ${fmtR(s.netRKept)}` : "n/a in this run"}
                        tone={mutedTone}
                        sub={s.netEffectAvailable ? "control (kept+blocked) → after PM" : "needs would-have-been R"}
                    />
                    <Card label="Cohorts" value={`${s.cohortsActive} active`} sub={`${s.cohortsPmDisabled} never-trade · ${s.cohortsBlocked} blocked · ${s.cohortsNoSetup + s.cohortsNoFill} idle`} />
                </div>

                {/* Cohort table */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))]">Cohort attribution — Session × Structure × Direction</div>
                        <button type="button" onClick={() => setExpandSessions((v) => !v)} className="text-[10.5px] font-ui text-muted-lab hover:text-white" data-testid="pm-run-toggle-idle">
                            {expandSessions ? "Hide idle cohorts" : "Show idle cohorts"}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11.5px] font-ui whitespace-nowrap" data-testid="pm-run-cohort-table">
                            <thead><tr className="text-[hsl(var(--accent-secondary))] uppercase text-[10px] tracking-wider text-left">
                                <th className="py-1 pr-3">Cohort</th><th className="pr-3">PM Action</th><th className="pr-3 text-right">Kept</th><th className="pr-3 text-right">Blocked</th><th className="pr-3 text-right">W/L/BE</th><th className="pr-3 text-right">Net R kept</th><th className="pr-3 text-right">Would-be</th><th>Status</th>
                            </tr></thead>
                            <tbody>
                                {bySession.map((sess) => {
                                    const rows = expandSessions
                                        ? sess.rows
                                        : sess.rows.filter((c) => c.keptCount > 0 || c.blockedCount > 0 || c.state === "pm_disabled");
                                    if (!rows.length) return null;
                                    return (
                                        <React.Fragment key={sess.label}>
                                            <tr className="border-t border-[hsl(var(--border-mid))]"><td colSpan={8} className="py-1 text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-2))]">{sess.label}</td></tr>
                                            {rows.map((c) => {
                                                const st = statusText(c.state, c.statusLabel);
                                                return (
                                                    <tr key={c.cell} className={`border-t border-[hsl(var(--border-soft))] ${rowClass(c.state, c.netRKept)}`} data-testid={`pm-run-row-${c.session}-${c.cell}`} data-cohort-state={c.state}>
                                                        <td className="py-1 pr-3 text-[hsl(var(--text-1))]">{c.structure} {c.direction}</td>
                                                        <td className="pr-3"><PmAction code={c.pmAction} /></td>
                                                        <td className="pr-3 text-right font-num">{c.keptCount}</td>
                                                        <td className={`pr-3 text-right font-num ${c.blockedCount > 0 ? warnTone : "text-[hsl(var(--text-2))]"}`}>{c.blockedCount}</td>
                                                        <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{c.keptCount > 0 ? `${c.wins}/${c.losses}/${c.be}` : "—"}</td>
                                                        <td className={`pr-3 text-right font-num ${c.keptCount === 0 ? "text-[hsl(var(--text-2))]" : c.netRKept >= 0 ? successTone : dangerTone}`}>{c.keptCount > 0 ? fmtR(c.netRKept) : "—"}</td>
                                                        <td className="pr-3 text-right font-num text-[hsl(var(--text-2))]">{c.blockedWouldBeNetR == null ? "—" : fmtR(c.blockedWouldBeNetR)}</td>
                                                        <td className={`font-ui ${st.tone}`}>{st.t}</td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[10.5px] font-ui text-muted-lab mt-2">
                        Amber = removed by the Portfolio Manager (never-trade or blocked); green/red = actually traded and kept. PM-disabled cohorts are never shown as "enabled". Blocked trades are counted separately from unfilled/missed and remain visible in Session Results → Management for analysis.
                    </p>
                </div>

                {/* Secondary: the frozen deployed policy, collapsed. */}
                <PolicyReference />
            </div>
        </NeonPanel>
    );
}
