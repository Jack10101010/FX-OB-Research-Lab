// FftVerdictCard — the headline FFT ON − FFT OFF strategy-delta verdict.
// FFT-IA Phase 1: copied VERBATIM from RunDetail's inline verdict card. Display-only.
import React from "react";
import { formatAccountValue } from "@/components/lab/account/accountEquity";

export function FftVerdictCard({
    strategyDeltaR, strategyDeltaPnl, verdictTone, verdictText,
    controlNetR, onNetR, accountModeEnabled, accountCurrency, isAllowMulti,
}) {
    return (
        <div className={`rounded-[6px] border px-4 py-3.5 ${
            verdictTone === "success" ? "border-[hsl(var(--success)/0.45)] bg-[hsl(var(--success)/0.08)]"
            : verdictTone === "danger" ? "border-[hsl(var(--danger)/0.45)] bg-[hsl(var(--danger)/0.08)]"
            : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))]"
        }`}>
            <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
                <div>
                    <div className="text-[11px] font-ui font-medium uppercase tracking-[0.04em] text-[hsl(var(--text-1)/0.9)] mb-1.5">Strategy delta · FFT ON − FFT OFF</div>
                    <div className="flex items-baseline gap-2.5">
                        <span className={`text-[24px] font-num font-semibold tabular-nums leading-none ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-1))]"}`}>{strategyDeltaR >= 0 ? "+" : ""}{strategyDeltaR.toFixed(1)}R</span>
                        {accountModeEnabled && strategyDeltaPnl != null && (
                            <span className={`text-[16px] font-num font-semibold tabular-nums ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]"}`}>{formatAccountValue(strategyDeltaPnl, accountCurrency)}</span>
                        )}
                    </div>
                    <div className={`mt-2 text-[15px] font-ui font-semibold ${verdictTone === "success" ? "text-[hsl(var(--success))]" : verdictTone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]"}`}>{verdictText}</div>
                </div>
                <div className="text-[13px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    <div>FFT OFF control <span className="font-num font-semibold text-[hsl(var(--text-1))]">{controlNetR >= 0 ? "+" : ""}{controlNetR.toFixed(1)}R</span></div>
                    <div>FFT ON strategy <span className="font-num font-semibold text-[hsl(var(--text-1))]">{onNetR >= 0 ? "+" : ""}{onNetR.toFixed(1)}R</span></div>
                </div>
            </div>
            {!isAllowMulti && (
                <div className="mt-2.5 text-[10px] font-ui text-[hsl(var(--text-2))]">Whole-strategy delta may include second-order slot / position effects for this variant.</div>
            )}
        </div>
    );
}
