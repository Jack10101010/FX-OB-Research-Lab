// FftControlStrip — OFF/ON mini-strip for the FFT analysis surfaces.
// FFT-IA Phase 1: copied VERBATIM from RunDetail's inline ControlStrip
// (readability-first typography + WIN/LOSS dir×structure table). Display-only.
import React from "react";
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatAccountValue } from "@/components/lab/account/accountEquity";

export function FftControlStrip({ title, subtitle, tooltip, metrics, sanityRows, accountModeEnabled, accountCurrency, tone }) {
    const m = metrics || {};
    const acc = m.account || {};
    const rStr = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}R`);
    const cells = [
        { label: "Net R", value: rStr(m.netR) },
        ...(accountModeEnabled ? [{ label: "Net PnL", value: formatAccountValue(acc.netPnlAmount, accountCurrency) }] : []),
        { label: "Trades", value: String(m.tradeCount ?? 0) },
        { label: "Win Rate", value: m.winRate != null ? `${m.winRate.toFixed(1)}%` : "—" },
        { label: "PF", value: m.pf == null ? "—" : (isFinite(m.pf) ? m.pf.toFixed(2) : "∞") },
        { label: "Max DD", value: m.maxDdR != null ? `-${m.maxDdR.toFixed(1)}R` : "—" },
    ];
    return (
        <div className="rounded-[5px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-3.5 py-3">
            <div className="flex items-center gap-1.5">
                <span className={`text-[13px] font-ui font-semibold ${tone === "accent" ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-1))]"}`}>{title}</span>
                {tooltip && (
                    <UiTooltip>
                        <TooltipTrigger asChild><span className="text-[hsl(var(--text-2))] cursor-help text-[11px]">ⓘ</span></TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[300px] whitespace-normal leading-snug text-[11px] font-ui">{tooltip}</TooltipContent>
                    </UiTooltip>
                )}
            </div>
            <div className="text-[11px] font-ui text-[hsl(var(--text-2))] mt-0.5 mb-2.5">{subtitle}</div>
            <div className="flex items-stretch gap-4">
                <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 flex-1 min-w-0 content-start">
                    {cells.map((c) => (
                        <div key={c.label}>
                            <div className="text-[10.5px] font-ui font-medium uppercase tracking-[0.03em] text-[hsl(var(--text-1)/0.72)]">{c.label}</div>
                            <div className="text-[15px] font-num font-semibold tabular-nums text-[hsl(var(--text-1))] leading-tight">{c.value}</div>
                        </div>
                    ))}
                </div>
                {Array.isArray(sanityRows) && sanityRows.length > 0 && (
                    <div className="shrink-0 w-[190px] pl-4 border-l border-[hsl(var(--border-soft)/0.6)]">
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 items-baseline">
                            <span className="text-[10.5px] font-ui font-medium uppercase tracking-[0.03em] text-[hsl(var(--text-1)/0.72)]">Dir × Structure</span>
                            <span className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.03em] text-[hsl(var(--success))] text-right">Win</span>
                            <span className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.03em] text-[hsl(var(--danger))] text-right">Loss</span>
                            {sanityRows.map((r) => (
                                <React.Fragment key={r.label}>
                                    <span className="text-[12px] font-ui text-[hsl(var(--text-1))]">{r.label}</span>
                                    <span className="text-[13px] font-num font-semibold tabular-nums text-right text-[hsl(var(--success))]">{r.win}</span>
                                    <span className="text-[13px] font-num font-semibold tabular-nums text-right text-[hsl(var(--danger))]">{r.loss}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
