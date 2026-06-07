/**
 * PairedRunSelector.jsx — Compact dropdown for selecting the paired FFT-OFF run.
 *
 * The selection is persisted to the run bundle via updateRunBundle so it
 * survives navigation within a session. It reads pairedFftOffRunId from the
 * active bundle and writes it back on change.
 *
 * Self-contained: reads from store via useDataset, no props required.
 * Renders nothing when there is only one run loaded (nothing to pair with).
 */

import React, { useMemo } from "react";
import { useDataset, updateRunBundle } from "@/data/store";
import { getPairableRunOptions, getAutoControlInfo } from "@/data/fftPairingResolver";

// ── status chip ───────────────────────────────────────────────────────────────

function StatusChip({ paired, missing }) {
    if (!paired) {
        return (
            <span className="text-[8px] font-ui px-1.5 py-[2px] rounded-[2px] bg-[hsl(var(--panel-2))] text-muted-lab opacity-60">
                None
            </span>
        );
    }
    if (missing) {
        return (
            <span className="text-[8px] font-ui px-1.5 py-[2px] rounded-[2px] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]">
                Missing
            </span>
        );
    }
    return (
        <span className="text-[8px] font-ui px-1.5 py-[2px] rounded-[2px] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]">
            Paired
        </span>
    );
}

// ── auto-control badge ──────────────────────────────────────────────────────────
// Informational only: shown when the active run carries backend-generated
// FFT-OFF control trades, which are auto-paired without any manual selection.

function AutoControlChip() {
    return (
        <span className="text-[8px] font-ui px-1.5 py-[2px] rounded-[2px] bg-[hsl(var(--accent-primary)/0.14)] text-[hsl(var(--accent-primary))]">
            Auto-paired control
        </span>
    );
}

// ── option label builder ──────────────────────────────────────────────────────

function optionText(opt) {
    const parts = [opt.label];
    if (opt.symbol)   parts.push(opt.symbol);
    if (opt.dateRange) parts.push(opt.dateRange);
    const tag = opt.isFftOff ? "FFT-OFF" : opt.isFftOn ? "FFT-ON" : null;
    if (tag) parts.push(tag);
    if (!opt.hasFullData) parts.push("(not loaded)");
    return parts.join(" · ");
}

// ── PairedRunSelector ─────────────────────────────────────────────────────────

export function PairedRunSelector() {
    const { activeRunId, runs, getRunData, ACTIVE_TRADE_VARIANT } = useDataset();

    const activeBundle      = activeRunId ? runs?.[activeRunId] : null;
    const pairedFftOffRunId = activeBundle?.pairedFftOffRunId || "";

    // Auto-control availability — when the active run carries backend FFT-OFF
    // control trades they are auto-paired, so the manual dropdown is demoted to
    // a fallback/override and an informational badge is shown instead.
    const autoControl = useMemo(
        () => getAutoControlInfo(activeBundle, ACTIVE_TRADE_VARIANT),
        [activeBundle, ACTIVE_TRADE_VARIANT],
    );

    const options = useMemo(
        () => getPairableRunOptions(runs || {}, activeRunId),
        [runs, activeRunId],
    );

    // No active run
    if (!activeRunId) return null;

    // No pairable runs loaded.
    if (options.length === 0) {
        // Auto-control present → informational badge; no manual run required.
        if (autoControl.available) {
            return (
                <div className="flex flex-col gap-1.5 min-w-[220px] max-w-xs">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-60 shrink-0">
                            Paired FFT-OFF run
                        </span>
                        <AutoControlChip />
                    </div>
                    <div className="w-full text-[11px] font-ui px-2 py-1.5 rounded-[3px] bg-[hsl(var(--accent-primary)/0.08)] border border-[hsl(var(--accent-primary)/0.25)] text-[hsl(var(--text-2))]">
                        Auto-paired from built-in control{autoControl.count > 1 ? ` · ${autoControl.count} scenarios` : ""}
                    </div>
                    <p className="text-[8.5px] font-ui text-muted-lab opacity-45 leading-snug">
                        FFT impact is computed automatically from this run's FFT-OFF control scenarios — no manual pairing required.
                    </p>
                </div>
            );
        }
        // Otherwise render the disabled state so the control stays discoverable.
        return (
            <div className="flex flex-col gap-1.5 min-w-[220px] max-w-xs opacity-50 pointer-events-none select-none">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-60 shrink-0">
                        Paired FFT-OFF run
                    </span>
                    <StatusChip paired={false} missing={false} />
                </div>
                <div className="w-full text-[11px] font-ui px-2 py-1.5 rounded-[3px] bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] text-muted-lab italic">
                    No pairable runs loaded
                </div>
                <p className="text-[8.5px] font-ui text-muted-lab opacity-45 leading-snug">
                    Load a second run (FFT-OFF) to enable authoritative cancel impact metrics.
                </p>
            </div>
        );
    }

    // Resolve paired bundle for status display
    const pairedBundle = pairedFftOffRunId ? getRunData?.(pairedFftOffRunId) : null;
    const isPaired     = Boolean(pairedFftOffRunId);
    const isMissing    = isPaired && !pairedBundle;

    const handleChange = (e) => {
        const selected = e.target.value || null;
        updateRunBundle(activeRunId, { pairedFftOffRunId: selected });
    };

    return (
        <div className="flex flex-col gap-1.5 min-w-[220px] max-w-xs">
            {/* Label row */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab opacity-60 shrink-0">
                    Paired FFT-OFF run
                </span>
                {autoControl.available
                    ? <AutoControlChip />
                    : <StatusChip paired={isPaired} missing={isMissing} />}
            </div>

            {/* Dropdown */}
            <select
                value={pairedFftOffRunId}
                onChange={handleChange}
                className={[
                    "w-full text-[11px] font-ui px-2 py-1.5 rounded-[3px]",
                    "bg-[hsl(var(--panel-2))] border text-[hsl(var(--text-2))]",
                    "focus:outline-none cursor-pointer",
                    "transition-colors",
                    isPaired && !isMissing
                        ? "border-[hsl(var(--success)/0.35)]"
                        : isMissing
                            ? "border-[hsl(var(--danger)/0.4)]"
                            : "border-[hsl(var(--border-soft))] hover:border-[hsl(var(--border-mid))]",
                ].join(" ")}
                title="Choose the FFT-OFF counterpart run for authoritative cancel impact metrics."
            >
                <option value="">— None —</option>
                {options.map(opt => (
                    <option
                        key={opt.runId}
                        value={opt.runId}
                        disabled={!opt.hasFullData}
                    >
                        {optionText(opt)}
                    </option>
                ))}
            </select>

            {/* Helper text */}
            <p className="text-[8.5px] font-ui text-muted-lab opacity-45 leading-snug">
                {autoControl.available
                    ? "Auto-paired from this run's built-in FFT-OFF control. Manual selection applies only to runs without control data."
                    : "Used for authoritative FFT impact metrics. Choose the matching FFT-OFF run."}
            </p>
        </div>
    );
}
