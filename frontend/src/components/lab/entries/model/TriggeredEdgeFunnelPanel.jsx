// ── TriggeredEdgeFunnelPanel.jsx ─────────────────────────────────────────────
// Lifecycle funnel waterfall for triggered-edge entry models.
// Visualises how setups progress (or are lost) from eligible → filled.
//
// Primary stages — "Setup Progression":
//   Eligible → Tapped → Triggered → Armed (if > 0) → Filled
//
// Loss sub-stages — "Funnel Losses":
//   Never Triggered | Cancelled After Trigger | Retrace Cancel (if > 0)
//
// Key rates at bottom: Trigger Rate | Fill / Trigger | Avg T→Fill

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

// ── SectionLabel ──────────────────────────────────────────────────────────────
// Lightweight label above a funnel stage group.

function SectionLabel({ label, tone = "default" }) {
    const cls = {
        default: "text-muted-lab",
        success: "text-[hsl(var(--success)/0.7)]",
        danger:  "text-[hsl(var(--danger)/0.7)]",
        warning: "text-[hsl(var(--warning)/0.65)]",
    }[tone];
    return (
        <div className={cn("text-[8.5px] font-ui uppercase tracking-[0.14em] mb-1.5", cls)}>
            {label}
        </div>
    );
}

// ── FunnelBar ─────────────────────────────────────────────────────────────────
// Single horizontal stage bar. Track fills proportionally to baseCount.

function FunnelBar({ label, count, base, colorVar, dimmed = false }) {
    const pct      = base > 0 ? Math.min(100, (count / base) * 100) : 0;
    const pctLabel = base > 0 ? `${pct.toFixed(1)}%` : null;

    return (
        <div className={cn("flex items-center gap-2.5", dimmed && "opacity-55")}>
            {/* Label */}
            <span
                className="text-[10.5px] font-ui text-[hsl(var(--text-2))] shrink-0 text-right"
                style={{ width: 152 }}
            >
                {label}
            </span>

            {/* Track */}
            <div className="flex-1 h-[12px] bg-[hsl(var(--panel-2)/0.5)] rounded-[1px] overflow-hidden">
                {pct > 0 && (
                    <div
                        className="h-full rounded-[1px] transition-all duration-300"
                        style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(var(${colorVar}))`,
                            opacity: dimmed ? 0.45 : 1,
                        }}
                    />
                )}
            </div>

            {/* Count */}
            <span className="text-[10px] font-num tabular-nums shrink-0 w-[28px] text-right text-white">
                {count ?? "—"}
            </span>

            {/* Pct of eligible */}
            {pctLabel ? (
                <span className="text-[9.5px] font-num tabular-nums text-muted-lab shrink-0 w-[42px]">
                    {pctLabel}
                </span>
            ) : (
                <span className="w-[42px] shrink-0" />
            )}
        </div>
    );
}

// ── KeyRate ───────────────────────────────────────────────────────────────────

function KeyRate({ label, value, tone = "default" }) {
    const toneClass = {
        success: "text-[hsl(var(--success))]",
        warning: "text-[hsl(var(--warning))]",
        danger:  "text-[hsl(var(--danger))]",
        default: "text-[hsl(var(--text-2))]",
    }[tone] ?? "text-[hsl(var(--text-2))]";

    return (
        <div className="flex flex-col items-center gap-0.5 px-3 py-2.5 border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.3)] rounded-[1px] flex-1">
            <span className={cn("text-[14px] font-num font-semibold tabular-nums", toneClass)}>
                {value}
            </span>
            <span className="text-[8.5px] font-ui uppercase tracking-[0.15em] text-muted-lab text-center">
                {label}
            </span>
        </div>
    );
}

function rateTone(pct) {
    if (!isFiniteNumber(pct)) return "default";
    const n = num(pct);
    if (n >= 60) return "success";
    if (n >= 35) return "warning";
    return "danger";
}

function fmtPct(v) {
    if (!isFiniteNumber(v)) return "—";
    return `${num(v).toFixed(1)}%`;
}

// ── StageDivider ─────────────────────────────────────────────────────────────
// Visual break between primary progression and loss sub-stages.

function StageDivider({ label }) {
    return (
        <div className="flex items-center gap-3 my-1">
            <div className="flex-1 border-t border-[hsl(var(--border-soft)/0.35)]" />
            <span className="text-[7.5px] font-ui uppercase tracking-[0.2em] text-muted-lab opacity-50 px-1">
                {label}
            </span>
            <div className="flex-1 border-t border-[hsl(var(--border-soft)/0.35)]" />
        </div>
    );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export function TriggeredEdgeFunnelPanel({ row }) {
    const funnel = row?.triggeredEdgeFunnel;

    // ── No data ───────────────────────────────────────────────────────────────
    if (!funnel || !isFiniteNumber(funnel.eligible) || funnel.eligible === 0) {
        return (
            <NeonPanel
                title="Lifecycle Funnel"
                action={<Pill tone="warning">NO FUNNEL DATA</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    No lifecycle data available.
                    <br />
                    <span className="opacity-70">
                        Ensure triggered-edge trade exports include funnel fields.
                    </span>
                </div>
            </NeonPanel>
        );
    }

    const {
        eligible,
        tappedCount,
        triggeredCount,
        armedCount,
        filledCount,
        cancelledAfterTrigger,
        retraceCancelCount,
        neverTriggeredCount,
        firstFailedTagCount,
        triggerRate,
        fillAfterTriggerRate,
        avgTriggerToEntry,
    } = funnel;

    const hasTapped = isFiniteNumber(tappedCount) && tappedCount > 0;
    const hasArmed  = isFiniteNumber(armedCount)  && armedCount  > 0;
    const noTriggers = !isFiniteNumber(triggeredCount) || triggeredCount === 0;

    const modelLabel = row.label || row.mode || "Model";

    const actionPill = noTriggers
        ? <Pill tone="warning">NO TRIGGERS</Pill>
        : <Pill tone="success">FUNNEL</Pill>;

    // Compute "unaccounted loss" for the progression note
    const lostCount = isFiniteNumber(eligible) && isFiniteNumber(filledCount)
        ? num(eligible) - num(filledCount)
        : null;
    const lostPct = lostCount != null && num(eligible) > 0
        ? ((lostCount / num(eligible)) * 100).toFixed(1)
        : null;

    return (
        <NeonPanel title="Lifecycle Funnel" action={actionPill}>

            {/* Model name */}
            <div className="mb-4 text-[10.5px] font-ui text-[hsl(var(--text-2))] truncate">
                {modelLabel}
                {row.family && (
                    <span className="ml-2 text-muted-lab opacity-70 uppercase text-[9px] tracking-wider">
                        {row.family}
                    </span>
                )}
            </div>

            {/* Tapped-data absent warning */}
            {!hasTapped && (
                <p className="mb-3 text-[9.5px] font-ui text-muted-lab opacity-75">
                    ⚠ Tapped count unavailable — requires v2 exporter.
                </p>
            )}

            {/* ── SETUP PROGRESSION ────────────────────────────────────── */}
            <SectionLabel label="Setup Progression" tone="default" />
            <div className="flex flex-col gap-2.5 mb-1">
                <FunnelBar
                    label="Eligible setups"
                    count={eligible}
                    base={eligible}
                    colorVar="--border-soft"
                />
                {hasTapped && (
                    <FunnelBar
                        label="Tapped OB"
                        count={tappedCount}
                        base={eligible}
                        colorVar="--accent-secondary"
                    />
                )}
                <FunnelBar
                    label="Triggered"
                    count={triggeredCount}
                    base={eligible}
                    colorVar="--accent-primary"
                />
                {hasArmed && (
                    <FunnelBar
                        label="Armed"
                        count={armedCount}
                        base={eligible}
                        colorVar="--warning"
                    />
                )}
                <FunnelBar
                    label="Filled (entries)"
                    count={filledCount}
                    base={eligible}
                    colorVar="--success"
                />
            </div>

            {/* ── Stage divider ─────────────────────────────────────────── */}
            <StageDivider label="Funnel Losses" />

            {/* ── WHERE SETUPS WERE LOST ────────────────────────────────── */}
            <SectionLabel label="Where Setups Were Lost" tone="danger" />
            <div className="flex flex-col gap-2 mb-4">
                {isFiniteNumber(neverTriggeredCount) && (
                    <FunnelBar
                        label="Never triggered"
                        count={neverTriggeredCount}
                        base={eligible}
                        colorVar="--text-2"
                        dimmed
                    />
                )}
                {isFiniteNumber(cancelledAfterTrigger) && cancelledAfterTrigger > 0 && (
                    <FunnelBar
                        label="Cancelled (after trig)"
                        count={cancelledAfterTrigger}
                        base={eligible}
                        colorVar="--danger"
                        dimmed
                    />
                )}
                {isFiniteNumber(firstFailedTagCount) && firstFailedTagCount > 0 && (
                    <FunnelBar
                        label="First failed tag"
                        count={firstFailedTagCount}
                        base={eligible}
                        colorVar="--warning"
                        dimmed
                    />
                )}
                {isFiniteNumber(retraceCancelCount) && retraceCancelCount > 0 && (
                    <FunnelBar
                        label="Retrace cancel"
                        count={retraceCancelCount}
                        base={eligible}
                        colorVar="--danger"
                        dimmed
                    />
                )}
                {/* Net loss summary */}
                {lostPct != null && (
                    <div className="mt-1 text-[9.5px] font-ui text-muted-lab opacity-65">
                        {lostCount} setups lost ({lostPct}% of eligible) before reaching fill.
                    </div>
                )}
            </div>

            {/* ── Key rates ────────────────────────────────────────────── */}
            <div className="flex gap-2">
                <KeyRate
                    label="Trigger Rate"
                    value={fmtPct(triggerRate)}
                    tone={rateTone(triggerRate)}
                />
                <KeyRate
                    label="Fill / Trigger"
                    value={fmtPct(fillAfterTriggerRate)}
                    tone={rateTone(fillAfterTriggerRate)}
                />
                {isFiniteNumber(avgTriggerToEntry) && (
                    <KeyRate
                        label="Avg T→Fill"
                        value={
                            num(avgTriggerToEntry) < 60
                                ? `${Math.round(num(avgTriggerToEntry))}m`
                                : `${(num(avgTriggerToEntry) / 60).toFixed(1)}h`
                        }
                        tone="default"
                    />
                )}
            </div>
        </NeonPanel>
    );
}
