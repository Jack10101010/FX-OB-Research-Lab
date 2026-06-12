// BeVerificationPanel — compact trade-by-trade Break-even verification.
//
// BE-STRATEGY-MAP-VISUAL-VERIFICATION P1. Trust/debugging, not presentation.
// Renders the pure buildBreakEvenTimeline() output: classification, event
// timeline (entry → BE armed → stop moved → BE exit / final exit), and the
// original/BE/Δ R when a baseline pairing exists.
import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { classificationLabel } from "@/data/protectionTimeline";
import { X, ArrowDown } from "lucide-react";

const CLASS_TONE = {
    loss_saved: "success",
    winner_cut: "danger",
    be_exit: "secondary",
    armed_not_triggered: "warning",
    never_armed: "muted",
    unknown: "muted",
};

function fmtTime(t) {
    if (!t) return "—";
    const s = String(t).replace("T", " ").replace(/\+00:00$|Z$/, "");
    return s.length > 16 ? s.slice(0, 16) : s;
}
function fmtPrice(p) { return p != null && Number.isFinite(Number(p)) ? Number(p).toFixed(5) : "—"; }
function fmtR(r) {
    if (r == null || !Number.isFinite(Number(r))) return "—";
    const n = Math.round(Number(r) * 100) / 100;
    return `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function StatCell({ label, value, tone = "muted" }) {
    const color = tone === "success" ? "text-[hsl(var(--success))]"
        : tone === "danger" ? "text-[hsl(var(--danger))]"
        : "text-[hsl(var(--text-1))]";
    return (
        <div className="flex flex-col">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">{label}</span>
            <span className={cn("text-[13px] font-num tabular-nums", color)}>{value}</span>
        </div>
    );
}

export function BeVerificationPanel({
    timeline,
    resultViewLabel = "Baseline",
    scenarioLabel,
    source = "EXACT",
    coarseCandles = false,
    onClose,
}) {
    if (!timeline) return null;
    const { classification, events = [], originalR, beR, deltaR, warnings = [] } = timeline;
    const isExact = source === "EXACT";
    const classTone = CLASS_TONE[classification] || "muted";
    const hasBaseline = originalR != null;

    return (
        <NeonPanel
            title="BE Verification"
            action={
                <div className="flex items-center gap-1.5">
                    <Pill tone={isExact ? "success" : "secondary"}>{isExact ? "EXACT" : "REPLAY"}</Pill>
                    {scenarioLabel ? <Pill tone="muted">{scenarioLabel}</Pill> : null}
                    {onClose ? (
                        <button type="button" onClick={onClose} aria-label="Close BE verification"
                            className="ml-1 text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    ) : null}
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {/* Provenance + classification */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                        Visualising backend {isExact ? "exact" : "replay"} BE data for{" "}
                        <span className="font-semibold text-[hsl(var(--text-1))]">{resultViewLabel}</span>.
                    </span>
                    <Pill tone={classTone}>{classificationLabel(classification)}</Pill>
                </div>

                {/* R comparison */}
                <div className="grid grid-cols-3 gap-3 rounded-[4px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] px-3 py-2">
                    <StatCell label="Original R" value={hasBaseline ? fmtR(originalR) : "—"} tone={originalR >= 0 ? "success" : "danger"} />
                    <StatCell label="BE R" value={fmtR(beR)} tone={beR >= 0 ? "success" : "danger"} />
                    <StatCell label="Δ R" value={hasBaseline ? fmtR(deltaR) : "—"} tone={deltaR != null && deltaR >= 0 ? "success" : "danger"} />
                </div>
                {!hasBaseline && (
                    <p className="text-[10.5px] font-ui text-[hsl(var(--warning))] leading-snug">
                        No baseline pairing for this trade — shown as neutral BE Exit (cannot confirm loss-saved / winner-cut).
                    </p>
                )}

                {/* Event timeline */}
                <div className="flex flex-col">
                    {events.map((ev, i) => (
                        <div key={`${ev.type}-${i}`}>
                            <div className="flex items-start gap-3 py-1.5">
                                <div className="w-[92px] shrink-0">
                                    <div className="text-[11.5px] font-ui font-semibold text-[hsl(var(--text-1))]">{ev.label}</div>
                                    {ev.note ? <div className="text-[9.5px] font-ui text-[hsl(var(--text-2)/0.8)] leading-snug">{ev.note}</div> : null}
                                </div>
                                <div className="flex-1 grid grid-cols-3 gap-2 text-[11px] font-num tabular-nums">
                                    <span className="text-[hsl(var(--text-2))]">{fmtTime(ev.time)}</span>
                                    <span className="text-[hsl(var(--text-1))]">{fmtPrice(ev.price)}</span>
                                    <span className={cn(ev.r > 0 ? "text-[hsl(var(--success))]" : ev.r < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-2))]")}>
                                        {fmtR(ev.r)}{ev.derived ? <span className="text-[hsl(var(--text-2)/0.6)] text-[9px]"> (derived)</span> : null}
                                    </span>
                                </div>
                            </div>
                            {i < events.length - 1 && (
                                <div className="flex items-center pl-[34px] text-[hsl(var(--text-2)/0.4)]">
                                    <ArrowDown className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Column legend */}
                <div className="flex items-center gap-2 pl-[104px] text-[9px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.6)]">
                    <span className="flex-1">time</span><span className="flex-1">price</span><span className="flex-1">R</span>
                </div>

                {coarseCandles && (
                    <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-snug">
                        BE events are from 1-minute execution; the chart may display aggregated candles, so arm/exit markers snap to the enclosing bar.
                    </p>
                )}
                {warnings.includes("missing_be_arm_time") || warnings.includes("missing_be_exit_time") ? (
                    <p className="text-[10.5px] font-ui text-[hsl(var(--warning))] leading-snug">
                        Some BE timestamps are missing on this trade row; affected markers are omitted.
                    </p>
                ) : null}
            </div>
        </NeonPanel>
    );
}
