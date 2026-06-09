// FftCriteriaPanel — read-only summary of the active FFT criteria for the run.
// FFT-IA Phase 1: reads display-only values resolved by useFftAnalysis from the
// run's config. No analytics. Future criteria render as placeholders.
import React from "react";
import { ShieldCheck, Ban } from "lucide-react";

function CriterionChip({ active, label }) {
    return (
        <span className={`px-2.5 py-1 rounded-[3px] text-[11px] font-ui font-medium border ${
            active
                ? "border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] text-[hsl(var(--text-2))]"
        }`}>{label}</span>
    );
}

export function FftCriteriaPanel({ criteria }) {
    const c = criteria || {};
    const enabled = !!c.enabled;
    return (
        <div className="rounded-[6px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
                {enabled
                    ? <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))]" />
                    : <Ban className="w-3.5 h-3.5 text-[hsl(var(--text-2))]" />}
                <h3 className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))]">Active FFT criteria</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <CriterionChip active={enabled} label={enabled ? "FFT enabled" : "FFT disabled"} />
                {enabled && Number(c.minObWidthPips) > 0 && (
                    <CriterionChip active label={`FFT only for OB ≥ ${Number(c.minObWidthPips)}p`} />
                )}
                {enabled && Number(c.moveAwayPips) > 0 && (
                    <CriterionChip active label={`Move-away ≥ ${Number(c.moveAwayPips)} pips`} />
                )}
                {enabled && Number(c.moveAwayObMultiple) > 0 && (
                    <CriterionChip active label={`Move-away ≥ ${Number(c.moveAwayObMultiple)}× OB width`} />
                )}
                {enabled
                    && !(Number(c.minObWidthPips) > 0)
                    && !(Number(c.moveAwayPips) > 0)
                    && !(Number(c.moveAwayObMultiple) > 0) && (
                    <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">Applies to all OBs (no width / move-away gate set)</span>
                )}
            </div>
            <div className="mt-2.5 text-[10px] font-ui text-[hsl(var(--text-3))] leading-snug">
                Future criteria (e.g. structure / session gates) will appear here as they are added to the engine.
            </div>
        </div>
    );
}
