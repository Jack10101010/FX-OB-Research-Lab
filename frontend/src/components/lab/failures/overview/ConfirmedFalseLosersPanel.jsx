// ── ConfirmedFalseLosersPanel.jsx ────────────────────────────────────────────
// Overview-level decision surface for false-loser research. Extracted from
// ViewManager (V5 Phase 2B IA move) so it lives on the Overview page, not buried
// in Views & Export.
//
// Self-gating: when the post-stop continuation export is present it renders the
// confirmed / candidate / genuine breakdown (buildConfirmedFalseLosers); when it
// is absent it falls back to the legacy candidates-only heuristic
// (computeFalseLosserCandidates). All copy says "reached", never "would have
// profited" — post-stop MFE is a peak, not a path.

import React, { useMemo } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { Info, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { computeFalseLosserCandidates, buildConfirmedFalseLosers } from "../shared/failuresAnalytics";

// ── Legacy candidate signal labels ─────────────────────────────────────────────

const SIGNAL_TYPE_LABELS = {
    fast_stopout:         "Fast Stopout",
    low_conf_timing:      "Low-Conf Timing",
    marginal_breach:      "Marginal Breach",
    close_conf_no_breach: "Stop Too Tight",
};

// ── Confirmed-class presentation helpers ────────────────────────────────────────

const CLASS_META = {
    confirmed: { label: "Confirmed",  tone: "success", color: "success" },
    candidate: { label: "Candidate",  tone: "warning", color: "warning" },
    genuine:   { label: "Genuine",    tone: "muted",   color: "text-2"  },
};

function StatTile({ label, count, pct, color }) {
    return (
        <div className="flex-1 min-w-[96px] px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))]">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">{label}</div>
            <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-[18px] font-num text-[hsl(var(--${color}))]`}>{count}</span>
                {pct != null && <span className="text-[10px] font-num text-muted-lab">{pct}%</span>}
            </div>
        </div>
    );
}

function CohortBreakdown({ title, rows }) {
    if (!rows.length) return null;
    return (
        <div className="space-y-1.5">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-muted-lab">{title}</div>
            <div className="space-y-1">
                {rows.map(row => (
                    <div key={row.key} className="flex items-center gap-2 text-[10px] font-ui">
                        <span className="w-24 shrink-0 text-[hsl(var(--text-2))] truncate">{row.key}</span>
                        <span className="font-num text-[hsl(var(--success))] w-8 text-right">{row.confirmed}</span>
                        <span className="font-num text-muted-lab w-12 text-right">{row.confirmedPct}%</span>
                        <span className="font-ui text-muted-lab">of {row.total}</span>
                        {row.avgPostStopMfeR != null && (
                            <span className="font-num text-muted-lab ml-auto">avg reached {row.avgPostStopMfeR.toFixed(2)}R</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Confirmed panel (post-stop continuation present) ────────────────────────────

function ConfirmedPanel({ report, totalLosses }) {
    const { counts, rates, confirmed, candidate, horizon, confirmR, candidateR, cohorts } = report;
    const horizonLabel = horizon != null ? `${horizon} bars` : "the export horizon";

    return (
        <NeonPanel title="Confirmed False Losers" tone="secondary"
            action={<span className="text-[11px] font-ui text-[hsl(var(--text-2))]">Which losses recovered after the stop?</span>}>
            <div className="p-4 space-y-4">
                {/* Methodology banner — "reached", never "would have profited" */}
                <div className="border border-[hsl(var(--accent-secondary)/0.3)] bg-[hsl(var(--accent-secondary)/0.04)] clip-bevel p-2.5 flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))] shrink-0 mt-0.5" />
                    <p className="text-[10px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="text-[hsl(var(--accent-secondary))] font-semibold">Confirmed</span> = price <em>reached</em> ≥ {confirmR}R
                        or the original target within {horizonLabel} after the stop;{" "}
                        <span className="text-[hsl(var(--warning))] font-semibold">Candidate</span> = reached ≥ {candidateR}R but below confirm;{" "}
                        <span className="font-semibold">Genuine</span> = never recovered. Post-stop MFE is a <em>peak</em>, not a path — it cannot
                        prove a breakeven or trailing stop would have held.
                    </p>
                </div>

                <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                    {counts.confirmed} confirmed false loser{counts.confirmed !== 1 ? "s" : ""} of {totalLosses} losses
                    {report.model ? <> · model <code className="text-[hsl(var(--accent-secondary))]">{report.model}</code></> : null}
                    {" "}· horizon <span className="font-num">{horizon ?? "—"}</span> bars.
                </p>

                {/* Class tiles */}
                <div className="flex flex-wrap gap-2">
                    <StatTile label="Confirmed" count={counts.confirmed} pct={rates.confirmedPct} color={CLASS_META.confirmed.color} />
                    <StatTile label="Candidate" count={counts.candidate} pct={rates.candidatePct} color={CLASS_META.candidate.color} />
                    <StatTile label="Genuine"   count={counts.genuine}   pct={rates.genuinePct}   color={CLASS_META.genuine.color} />
                </div>

                {/* Cohort breakdowns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CohortBreakdown title="Confirmed by session"   rows={cohorts.session} />
                    <CohortBreakdown title="Confirmed by direction" rows={cohorts.direction} />
                    <CohortBreakdown title="Confirmed by structure" rows={cohorts.structure} />
                    <CohortBreakdown title="Confirmed by archetype" rows={cohorts.archetype} />
                </div>

                {/* Confirmed + candidate list */}
                {(confirmed.length > 0 || candidate.length > 0) && (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                        {[...confirmed, ...candidate].map((c, i) => {
                            const meta = CLASS_META[c.class] ?? CLASS_META.genuine;
                            return (
                                <div
                                    key={c.id ?? i}
                                    className="px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))]"
                                >
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {c.class === "confirmed"
                                            ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--success))] shrink-0" />
                                            : <AlertTriangle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />}
                                        <Pill tone={meta.tone}>{meta.label}</Pill>
                                        <span className="text-[10.5px] font-code text-white">
                                            {c.entry ? String(c.entry).slice(0, 16) : "—"}
                                        </span>
                                        <Pill tone={c.direction === "long" ? "success" : c.direction === "short" ? "danger" : "muted"}>
                                            {c.direction.toUpperCase()}
                                        </Pill>
                                        <Pill tone="muted">{c.session}</Pill>
                                        <span className="text-[10px] font-num text-[hsl(var(--danger))]">{c.r.toFixed(2)}R</span>
                                        {c.postStopMfeR != null && (
                                            <span className="text-[10px] font-num text-[hsl(var(--success))]">reached +{c.postStopMfeR.toFixed(2)}R</span>
                                        )}
                                        {c.barsTo1R != null && (
                                            <span className="text-[9px] font-num text-muted-lab">+1R in {c.barsTo1R} bars</span>
                                        )}
                                        {c.reachedOriginalTp === true && (
                                            <span className="text-[9px] font-ui text-[hsl(var(--success))]">hit original TP</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}

// ── Candidates-only fallback (no post-stop export) ──────────────────────────────

function CandidatesPanel({ candidates, totalLosses }) {
    return (
        <NeonPanel title="False Loser Detection" tone="secondary"
            action={<span className="text-[11px] font-ui text-[hsl(var(--text-2))]">Which losses might be false?</span>}>
            <div className="p-4 space-y-3">
                {/* Honesty banner — no post-stop export yet */}
                <div className="border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)] clip-bevel p-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                    <p className="text-[10px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <span className="text-[hsl(var(--warning))] font-semibold">Candidates only — not confirmed false losers.</span>{" "}
                        Definitive detection requires post-stop continuation data
                        (<code className="text-[hsl(var(--accent-secondary))]">post_stop_mfe_r</code>).
                        These trades have signals consistent with false losers using currently-available fields only.
                    </p>
                </div>

                {candidates.length === 0 ? (
                    <p className="text-[10px] font-ui text-muted-lab">
                        No candidates detected in current data. Candidates require: fast stopout (&lt;10 min),
                        marginal OB breach (100–110%), or close-confirmed without full breach.
                    </p>
                ) : (
                    <>
                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                            {candidates.length} trade{candidates.length !== 1 ? "s" : ""} with false loser signals
                            detected from {totalLosses} total losses.
                        </p>

                        <div className="space-y-2 max-h-72 overflow-y-auto">
                            {candidates.map((c, i) => (
                                <div
                                    key={c.id ?? i}
                                    className="px-3 py-2.5 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel-2))] space-y-1.5"
                                >
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <AlertTriangle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />
                                        <span className="text-[10.5px] font-code text-white">
                                            {c.entry ? String(c.entry).slice(0, 16) : "—"}
                                        </span>
                                        <Pill tone={c.direction === "long" ? "success" : c.direction === "short" ? "danger" : "muted"}>
                                            {c.direction.toUpperCase()}
                                        </Pill>
                                        <Pill tone="muted">{c.session}</Pill>
                                        <span className="text-[10px] font-num text-[hsl(var(--danger))]">{c.r.toFixed(2)}R</span>
                                        {c.severity != null && (
                                            <span className="text-[9px] font-num text-muted-lab">sev {c.severity.toFixed(1)}</span>
                                        )}
                                    </div>

                                    <div className="space-y-0.5">
                                        {c.signals.map((sig, si) => (
                                            <div key={si} className="flex items-start gap-1.5 text-[9.5px] font-ui">
                                                <span className="text-[hsl(var(--accent-secondary))] shrink-0">
                                                    {SIGNAL_TYPE_LABELS[sig.type] ?? sig.type}:
                                                </span>
                                                <span className="text-[hsl(var(--text-2))]">{sig.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </NeonPanel>
    );
}

// ── Public component ────────────────────────────────────────────────────────────

export function ConfirmedFalseLosersPanel({ allLosers = [] }) {
    const report = useMemo(() => buildConfirmedFalseLosers(allLosers), [allLosers]);
    const candidates = useMemo(
        () => (report.available ? [] : computeFalseLosserCandidates(allLosers)),
        [report.available, allLosers],
    );

    if (report.available) {
        return <ConfirmedPanel report={report} totalLosses={allLosers.length} />;
    }
    return <CandidatesPanel candidates={candidates} totalLosses={allLosers.length} />;
}

export default ConfirmedFalseLosersPanel;
