// ── CancelReasonPanel.jsx ────────────────────────────────────────────────────
// Phase 2: Cancel reason breakdown for triggered-edge models.
//
// Surfaces what happened to the setups that did NOT fill, grouped by reason:
//   1. Never triggered     — OB was never touched after setup
//   2. Cancelled (trig)    — order cancelled after trigger fired
//   3. Retrace cancel      — price retraced into cancel zone
//   4. Armed but unfilled  — armed but neither filled nor explicitly cancelled
//      (computed as: triggered - filled - cancelledAfterTrigger, if > 0)
//
// Net efficiency footer: "X fills of Y setups = Z% end-to-end"
//
// Note: The current exporter does not produce granular cancel-reason breakdowns.
// This panel shows only the reason fields already present in the funnel object.
// A future exporter extension can add per-reason rows without changing this panel.
//
// Data source: row.triggeredEdgeFunnel

import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { isFiniteNumber, num } from "../analytics/entryFormatters";
import { cn } from "@/lib/utils";

// ── CancelRow ─────────────────────────────────────────────────────────────────

function CancelRow({ label, count, base, dotColor, dimmed = false }) {
    const pct = base > 0 && isFiniteNumber(count) ? Math.min(100, (num(count) / base) * 100) : 0;

    return (
        <div className={cn("flex items-center gap-2 py-1", dimmed && "opacity-60")}>
            {/* Colored dot */}
            <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(${dotColor}))` }}
            />

            {/* Label */}
            <span className="text-[10px] font-ui text-[hsl(var(--text-2))] flex-1 min-w-0 truncate">
                {label}
            </span>

            {/* Mini bar */}
            <div className="w-[80px] h-[6px] bg-[hsl(var(--panel-2)/0.5)] rounded-[1px] overflow-hidden shrink-0">
                {pct > 0 && (
                    <div
                        className="h-full rounded-[1px]"
                        style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(var(${dotColor}))`,
                            opacity: dimmed ? 0.5 : 0.8,
                        }}
                    />
                )}
            </div>

            {/* Count */}
            <span className="text-[10px] font-num tabular-nums text-white w-[28px] text-right shrink-0">
                {isFiniteNumber(count) ? num(count) : "—"}
            </span>

            {/* Pct of base */}
            <span className="text-[9.5px] font-num tabular-nums text-muted-lab w-[38px] text-right shrink-0">
                {base > 0 && isFiniteNumber(count) ? `${pct.toFixed(1)}%` : ""}
            </span>
        </div>
    );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function CancelReasonPanel({ row }) {
    const funnel = row?.triggeredEdgeFunnel;

    if (!funnel || !isFiniteNumber(funnel.eligible) || funnel.eligible === 0) {
        return (
            <NeonPanel
                title="Cancel Reasons"
                action={<Pill tone="warning">NO FUNNEL DATA</Pill>}
            >
                <div className="py-8 text-center text-[11px] font-ui text-muted-lab">
                    No cancel reason data available.
                    <br />
                    <span className="opacity-70">
                        Requires triggered-edge exports with funnel fields.
                    </span>
                </div>
            </NeonPanel>
        );
    }

    const {
        eligible,
        triggeredCount,
        filledCount,
        cancelledAfterTrigger,
        retraceCancelCount,
        neverTriggeredCount,
    } = funnel;

    // Compute armed-but-unfilled: setups that triggered but didn't fill and
    // don't have an explicit cancel reason recorded.
    const explainedCancels =
        (isFiniteNumber(cancelledAfterTrigger) ? num(cancelledAfterTrigger) : 0) +
        (isFiniteNumber(retraceCancelCount)     ? num(retraceCancelCount)    : 0);

    const armedButUnfilled =
        isFiniteNumber(triggeredCount) && isFiniteNumber(filledCount)
            ? Math.max(0, num(triggeredCount) - num(filledCount) - explainedCancels)
            : null;

    const hasArmedButUnfilled = armedButUnfilled != null && armedButUnfilled > 0;

    // End-to-end efficiency
    const efficiency =
        isFiniteNumber(eligible) && num(eligible) > 0 && isFiniteNumber(filledCount)
            ? ((num(filledCount) / num(eligible)) * 100).toFixed(1)
            : null;

    const effTone = efficiency != null
        ? num(efficiency) >= 50 ? "success" : num(efficiency) >= 25 ? "warning" : "danger"
        : "default";

    const effClass = {
        success: "text-[hsl(var(--success))]",
        warning: "text-[hsl(var(--warning))]",
        danger:  "text-[hsl(var(--danger))]",
        default: "text-[hsl(var(--text-2))]",
    }[effTone];

    const modelLabel = row.label || row.mode || "Model";

    return (
        <NeonPanel
            title="Cancel Reasons"
            action={<Pill tone="success">BREAKDOWN</Pill>}
        >
            {/* Model label */}
            <div className="mb-4 text-[10.5px] font-ui text-[hsl(var(--text-2))] truncate">
                {modelLabel}
            </div>

            {/* ── Reason rows ─────────────────────────────────────────────── */}
            <div className="flex flex-col">
                {isFiniteNumber(neverTriggeredCount) && (
                    <CancelRow
                        label="Never triggered"
                        count={neverTriggeredCount}
                        base={eligible}
                        dotColor="--text-2"
                    />
                )}
                {isFiniteNumber(cancelledAfterTrigger) && num(cancelledAfterTrigger) > 0 && (
                    <CancelRow
                        label="Cancelled after trigger"
                        count={cancelledAfterTrigger}
                        base={eligible}
                        dotColor="--danger"
                    />
                )}
                {isFiniteNumber(retraceCancelCount) && num(retraceCancelCount) > 0 && (
                    <CancelRow
                        label="Retrace cancel"
                        count={retraceCancelCount}
                        base={eligible}
                        dotColor="--danger"
                        dimmed
                    />
                )}
                {hasArmedButUnfilled && (
                    <CancelRow
                        label="Armed, no fill (unexplained)"
                        count={armedButUnfilled}
                        base={eligible}
                        dotColor="--warning"
                        dimmed
                    />
                )}
                {/* Filled row for reference */}
                {isFiniteNumber(filledCount) && (
                    <CancelRow
                        label="Filled (entries)"
                        count={filledCount}
                        base={eligible}
                        dotColor="--success"
                    />
                )}
            </div>

            {/* ── Net efficiency ───────────────────────────────────────────── */}
            <div className="mt-4 pt-3 border-t border-[hsl(var(--border-soft)/0.3)]">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className={cn("text-[13px] font-num font-semibold tabular-nums", effClass)}>
                        {efficiency != null ? `${efficiency}%` : "—"}
                    </span>
                    <span className="text-[10px] font-ui text-muted-lab">
                        end-to-end efficiency
                    </span>
                    <span className="text-[9.5px] font-ui text-muted-lab opacity-70">
                        ({isFiniteNumber(filledCount) ? num(filledCount) : "?"} fills of{" "}
                        {isFiniteNumber(eligible) ? num(eligible) : "?"} setups)
                    </span>
                </div>
            </div>

            {/* ── Note ────────────────────────────────────────────────────── */}
            <p className="mt-3 text-[9px] font-ui text-muted-lab opacity-60 leading-relaxed">
                Counts above are derived from structural lifecycle fields.
                The <code>cancel_reason</code> string column is exported on all TE
                records and available for per-reason drill-down in future panels.
            </p>
        </NeonPanel>
    );
}
