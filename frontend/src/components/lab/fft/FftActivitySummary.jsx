// FftActivitySummary — "what FFT did" (activity) + "what the control did"
// (counterfactual) KPI chips. FFT-IA Phase 1: values copied VERBATIM from
// RunDetail's inline KPI strip. Display-only, read-only (per-cancel drilldown
// lives in FftProtectionPanel; the click-through modal is deferred to Phase 2/3).
import React from "react";
import { MetricChip } from "@/components/lab/MetricChip";
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { XIcon, Target, AlertTriangle, TrendingUp, Activity, Hash } from "lucide-react";
import { fmtFftR, fmtFftPips } from "@/data/fftAnalytics";
import { FFT_TIPS } from "./fftDisplay";

function FftKpi({ hint, children }) {
    return (
        <UiTooltip>
            <TooltipTrigger asChild><div className="cursor-help">{children}</div></TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] whitespace-normal leading-snug text-[10.5px] font-ui">{hint}</TooltipContent>
        </UiTooltip>
    );
}

export function FftActivitySummary({ fft, paired, fftBuckets }) {
    const pairedNetRTone = paired.confirmedNetRImpact > 0.005 ? "success"
        : paired.confirmedNetRImpact < -0.005 ? "danger" : "muted";
    return (
        <div>
            {/* Group A — FFT activity: what FFT did */}
            <div className="mb-0.5 text-[8.5px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text-2))]">FFT activity · what FFT did</div>
            <div className="kpi-strip">
                <FftKpi hint={FFT_TIPS.cancels}>
                    <MetricChip size="compact" label="FFT Cancels" value={String(fft.fftCancels)}
                        sub="pre-trigger cancels" tone="warning" icon={XIcon} />
                </FftKpi>
                {fft.hasMoveAwayData && (
                    <FftKpi hint={FFT_TIPS.moveAway}>
                        <MetricChip size="compact" label="Avg Move-Away" value={`${fmtFftPips(fft.avgMoveAwayAtCancel)} pips`}
                            sub="past OB edge at cancel" tone="muted" icon={Target} />
                    </FftKpi>
                )}
            </div>
            <div className="mt-0.5 mb-2 text-[8.5px] font-ui text-muted-lab opacity-70 leading-snug">These are setups FFT cancelled before trigger. This is what FFT did.</div>

            {/* Group B — FFT-OFF counterfactual: what the same setups did in the control */}
            <div className="mb-0.5 text-[8.5px] font-ui uppercase tracking-[0.12em] text-[hsl(var(--text-2))]">FFT-OFF counterfactual · what the control did</div>
            <div className="kpi-strip">
                <FftKpi hint={FFT_TIPS.winsRemoved}>
                    <MetricChip size="compact" label="Cost: Winners Removed" value={String(paired.confirmedWinsRemoved)}
                        sub="counterfactual · FFT-OFF control" tone="danger" icon={AlertTriangle} />
                </FftKpi>
                <FftKpi hint={FFT_TIPS.lossesAvoided}>
                    <MetricChip size="compact" label="Benefit: Losses Avoided" value={String(paired.confirmedLossesAvoided)}
                        sub="counterfactual · FFT-OFF control" tone="success" icon={TrendingUp} />
                </FftKpi>
                <FftKpi hint={FFT_TIPS.netR}>
                    <MetricChip size="compact" label="High-conf Attributed Impact" value={fmtFftR(paired.confirmedNetRImpact)}
                        sub="HIGH-confidence paired · not the strategy delta" tone={pairedNetRTone} icon={Activity} />
                </FftKpi>
                <FftKpi hint={FFT_TIPS.known}>
                    <MetricChip size="compact" label="Known Paired Outcomes" value={String(paired.highConfCount)}
                        sub="trustworthy paired rows" tone="muted" icon={Hash} />
                </FftKpi>
                <FftKpi hint={FFT_TIPS.unknown}>
                    <MetricChip size="compact" label="Not counted (excl.)" value={String(paired.lowConfCount)}
                        sub={`${fftBuckets.selfInvalidated} self-inval · ${fftBuckets.timingDivergent} timing · ${fftBuckets.otherLow} other`}
                        tone="muted" icon={Hash} />
                </FftKpi>
            </div>
            <div className="mt-0.5 text-[8.5px] font-ui text-muted-lab opacity-70 leading-snug">
                These are what the same cancelled setups did in the FFT-OFF control — this depends on the entry model / arm mode.
            </div>
        </div>
    );
}
