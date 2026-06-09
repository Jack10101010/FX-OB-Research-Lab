// FftOverviewCard — compact "did FFT help or hurt?" summary for RunDetail.
// FFT-IA Phase 2: RunDetail no longer hosts the full FFT cockpit. This card
// answers the verdict + headline numbers and links to the full analysis in
// Protection Lab. Display-only; all values come from useFftAnalysis (which
// reproduces the original RunDetail computation — no formula changes).
import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { fmtFftR } from "@/data/fftAnalytics";
import { formatAccountValue } from "@/components/lab/account/accountEquity";

const rStr = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);

function criteriaSummary(c) {
    if (!c || !c.enabled) return "FFT disabled";
    const parts = ["FFT enabled"];
    if (Number(c.minObWidthPips) > 0) parts.push(`OB ≥ ${Number(c.minObWidthPips)}p`);
    if (Number(c.moveAwayPips) > 0) parts.push(`move-away ≥ ${Number(c.moveAwayPips)} pips`);
    if (Number(c.moveAwayObMultiple) > 0) parts.push(`move-away ≥ ${Number(c.moveAwayObMultiple)}× OB`);
    if (parts.length === 1) parts.push("all OB widths");
    return parts.join(" · ");
}

function Metric({ label, value, tone }) {
    const toneCls = tone === "success" ? "text-[hsl(var(--success))]"
        : tone === "danger" ? "text-[hsl(var(--danger))]"
        : "text-[hsl(var(--text-1))]";
    return (
        <div>
            <div className="text-[10px] font-ui font-medium uppercase tracking-[0.03em] text-[hsl(var(--text-1)/0.72)]">{label}</div>
            <div className={`text-[14px] font-num font-semibold tabular-nums leading-tight ${toneCls}`}>{value}</div>
        </div>
    );
}

export function FftOverviewCard({ fa }) {
    if (!fa) return null;
    const { verdictTone, verdictText, strategyDeltaR, strategyDeltaPnl, accountModeEnabled, accountCurrency } = fa;
    const link = (
        <Link
            to="/protection-lab?tab=fft"
            className="inline-flex items-center gap-1 text-[11px] font-ui font-medium text-[hsl(var(--accent-primary))] hover:underline whitespace-nowrap"
        >
            Open full FFT Protection analysis <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
    );

    return (
        <div className="px-6 mt-6 mb-2.5">
            <div className={`rounded-[6px] border px-4 py-3.5 ${
                fa.hasPaired && verdictTone === "success" ? "border-[hsl(var(--success)/0.45)] bg-[hsl(var(--success)/0.08)]"
                : fa.hasPaired && verdictTone === "danger" ? "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.08)]"
                : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)]"
            }`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-[16px] font-ui font-semibold tracking-[0.01em] text-[hsl(var(--text-1))]">FFT Effect</h2>
                        {fa.scenarioLabel && (
                            <div className="mt-0.5 text-[11px] font-ui text-[hsl(var(--text-2))]">{fa.scenarioLabel}</div>
                        )}
                    </div>
                    {link}
                </div>

                {fa.hasPaired ? (
                    <>
                        {/* Verdict */}
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
                            <div>
                                <div className="text-[11px] font-ui font-medium uppercase tracking-[0.04em] text-[hsl(var(--text-1)/0.9)] mb-1">Strategy delta · FFT ON − FFT OFF</div>
                                <div className="flex items-baseline gap-2.5">
                                    <span className={`text-[24px] font-num font-semibold tabular-nums leading-none ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-1))]"}`}>{strategyDeltaR >= 0 ? "+" : ""}{strategyDeltaR.toFixed(1)}R</span>
                                    {accountModeEnabled && strategyDeltaPnl != null && (
                                        <span className={`text-[14px] font-num font-semibold tabular-nums ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]"}`}>{formatAccountValue(strategyDeltaPnl, accountCurrency)}</span>
                                    )}
                                </div>
                                <div className={`mt-1.5 text-[14px] font-ui font-semibold ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]"}`}>{verdictText}</div>
                            </div>
                            <div className="text-[12px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                                <div>FFT ON strategy <span className="font-num font-semibold text-[hsl(var(--text-1))]">{rStr(fa.onMetrics.netR)}</span></div>
                                <div>FFT OFF control <span className="font-num font-semibold text-[hsl(var(--text-1))]">{rStr(fa.controlMetrics.netR)}</span></div>
                            </div>
                        </div>

                        {/* Compact metrics */}
                        <div className="mt-3 pt-3 border-t border-[hsl(var(--border-soft)/0.6)] grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
                            <Metric label="FFT Cancels" value={String(fa.fft.fftCancels)} />
                            <Metric label="High-conf Impact"
                                value={fmtFftR(fa.paired.confirmedNetRImpact)}
                                tone={fa.paired.confirmedNetRImpact > 0.005 ? "success" : fa.paired.confirmedNetRImpact < -0.005 ? "danger" : "muted"} />
                            <Metric label="Known Paired" value={String(fa.paired.highConfCount)} />
                            <Metric label="Not Counted" value={String(fa.paired.lowConfCount)} />
                        </div>

                        {/* Criteria + pointer */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                            <span><span className="uppercase tracking-[0.04em] text-[hsl(var(--text-1)/0.72)]">Active FFT criteria:</span> {criteriaSummary(fa.criteria)}</span>
                            <span className="italic text-[hsl(var(--text-3))]">Width breakdown, OFF/ON strips & per-cancel detail → Protection Lab</span>
                        </div>
                    </>
                ) : (
                    <div className="mt-2 text-[12px] font-ui text-[hsl(var(--text-2))] leading-snug">
                        <span className="font-num font-semibold text-[hsl(var(--text-1))]">{fa.fft.fftCancels}</span> FFT cancels in this scenario.
                        FFT-OFF control unavailable — open/import a run with auto-control to compare.
                    </div>
                )}
            </div>
        </div>
    );
}
