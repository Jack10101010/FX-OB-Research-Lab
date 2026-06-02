import React from "react";
import { cn } from "@/lib/utils";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { buildDataQuality } from "./protectionAnalytics";

/**
 * ProtectionDataQualityPanel
 * ──────────────────────────
 * Shows per-field data-quality coverage for the active trade dataset.
 * Fields critical to Protection Lab analytics are highlighted; status badges
 * let researchers quickly gauge how reliable the analytics will be.
 *
 * Props
 * ─────
 * trades   — raw trades array from useDataset()
 */

// Status thresholds
function getStatus(pct) {
    if (pct >= 0.9) return "good";
    if (pct >= 0.5) return "partial";
    if (pct >= 0.1) return "limited";
    return "missing";
}

const STATUS_META = {
    good:    { label: "Good",    color: "text-[hsl(var(--success))]",   bg: "bg-[hsl(var(--success)/0.08)]",   border: "border-[hsl(var(--success)/0.35)]" },
    partial: { label: "Partial", color: "text-[hsl(var(--warning))]",   bg: "bg-[hsl(var(--warning)/0.08)]",   border: "border-[hsl(var(--warning)/0.35)]" },
    limited: { label: "Limited", color: "text-[hsl(var(--accent-primary))]", bg: "bg-[hsl(var(--accent-primary)/0.08)]", border: "border-[hsl(var(--accent-primary)/0.35)]" },
    missing: { label: "Missing", color: "text-[hsl(var(--danger))]",    bg: "bg-[hsl(var(--danger)/0.08)]",    border: "border-[hsl(var(--danger)/0.35)]" },
};

// Field metadata: key → {label, description, critical}
const FIELD_META = {
    ob_fully_breached: {
        label: "Hard Invalidation",
        description: "Whether the OB was fully consumed beyond its far-side threshold",
        critical: true,
    },
    max_ob_penetration_pct: {
        label: "OB Penetration %",
        description: "Maximum percentage of OB depth penetrated by price",
        critical: true,
    },
    close_confirmed_ob_breach: {
        label: "Close-Confirmed Invalidation",
        description: "Whether price closed beyond the OB, separating wick invalidations from confirmed closes",
        critical: false,
    },
    close_breach_time: {
        label: "Invalidation Timestamp",
        description: "When the close-confirmed invalidation occurred",
        critical: false,
    },
    minutes_to_exit: {
        label: "Minutes to Exit",
        description: "Trade duration in minutes for time-to-exit profiling",
        critical: false,
    },
    same_candle_exit: {
        label: "Same-Candle Exit",
        description: "Exited on the same candle that triggered — affects lifecycle flow",
        critical: false,
    },
    obWidthPips: {
        label: "OB Width (pips)",
        description: "Order-block width used for structural risk breakdowns",
        critical: true,
    },
    obOriginSession: {
        label: "OB Origin Session",
        description: "Session in which the OB formed — enables session-based breakdown",
        critical: false,
    },
    direction: {
        label: "Trade Direction",
        description: "Long / Short — required for directional analytics",
        critical: true,
    },
    structureTag: {
        label: "Structure Tag",
        description: "BOS / CHoCH structure context for protection segmentation",
        critical: false,
    },
};

function StatusBadge({ status }) {
    const m = STATUS_META[status];
    return (
        <span className={cn(
            "inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[10.5px] font-medium",
            m.bg, m.border, m.color,
        )}>
            {m.label}
        </span>
    );
}

function QualityBar({ pct }) {
    const status = getStatus(pct);
    const m = STATUS_META[status];
    const barPct = Math.max(3, Math.round(pct * 100));
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-1 h-1.5 bg-[hsl(var(--border-soft)/0.5)] rounded-full overflow-hidden">
                <div
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-all", m.color.replace("text-", "bg-"))}
                    style={{ width: `${barPct}%` }}
                />
            </div>
            <span className="shrink-0 w-10 text-right text-[10.5px] font-num tabular-nums text-[hsl(var(--text-2))]">
                {Math.round(pct * 100)}%
            </span>
        </div>
    );
}

function OverallBadge({ good, partial, limited, missing }) {
    const total = good + partial + limited + missing;
    if (total === 0) return null;
    const criticalMissing = missing > 0;
    const tone = criticalMissing ? "danger" : good > total * 0.7 ? "success" : "warning";
    const toneClass = {
        success: "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)]",
        warning: "border-[hsl(var(--warning)/0.4)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)]",
        danger:  "border-[hsl(var(--danger)/0.4)]  text-[hsl(var(--danger))]  bg-[hsl(var(--danger)/0.06)]",
    }[tone];
    const label = tone === "success" ? "High Quality" : tone === "warning" ? "Moderate Quality" : "Limited Quality";
    return (
        <span className={cn("inline-flex items-center rounded-[3px] border px-2.5 py-1 text-[11px] font-medium", toneClass)}>
            {label}
        </span>
    );
}

export function ProtectionDataQualityPanel({ trades }) {
    const quality = React.useMemo(() => {
        if (!trades?.length) return null;
        return buildDataQuality(trades);
    }, [trades]);

    if (!trades?.length) {
        return (
            <NeonPanel title="Data Quality Coverage" defaultCollapsed={false} className="mx-6 mb-4">
                <div className="px-5 py-7 text-center text-[12px] leading-relaxed text-[hsl(var(--text-3))]">
                    No trade dataset loaded for protection research.
                </div>
            </NeonPanel>
        );
    }

    if (!quality) return null;

    // Group fields
    const rows = Object.entries(FIELD_META).map(([key, meta]) => {
        const pct = quality[key] ?? 0;
        const status = getStatus(pct);
        return { key, ...meta, pct, status };
    });

    const counts = rows.reduce(
        (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
        { good: 0, partial: 0, limited: 0, missing: 0 },
    );

    const criticalFields = rows.filter(r => r.critical);
    const allCriticalGood = criticalFields.every(r => r.status === "good" || r.status === "partial");

    return (
        <NeonPanel
            title="Data Quality Coverage"
            defaultCollapsed={allCriticalGood}
            collapsible
            className="mx-6 mb-4"
            action={
                <OverallBadge
                    good={counts.good}
                    partial={counts.partial}
                    limited={counts.limited}
                    missing={counts.missing}
                />
            }
        >
            <div className="px-5 pb-5 pt-1 space-y-4">
                {/* Summary row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11.5px] text-[hsl(var(--text-3))]">
                        <span className="font-num tabular-nums text-[hsl(var(--text-1))]">{trades.length}</span> trades assessed
                    </span>
                    {Object.entries(counts).filter(([, n]) => n > 0).map(([status, n]) => (
                        <span key={status} className={cn("text-[11px] font-medium", STATUS_META[status].color)}>
                            <span className="font-num tabular-nums">{n}</span> {STATUS_META[status].label.toLowerCase()}
                        </span>
                    ))}
                </div>

                {/* Critical fields first */}
                <div>
                    <div className="mb-2 text-[11.5px] font-semibold text-[hsl(var(--accent-primary))]">
                        Required protection fields
                    </div>
                    <div className="space-y-1.5">
                        {criticalFields.map(row => (
                            <FieldRow key={row.key} row={row} />
                        ))}
                    </div>
                </div>

                {/* Non-critical fields */}
                <div>
                    <div className="mb-2 text-[11.5px] font-semibold text-[hsl(var(--accent-primary))]">
                        Supporting research fields
                    </div>
                    <div className="space-y-1.5">
                        {rows.filter(r => !r.critical).map(row => (
                            <FieldRow key={row.key} row={row} />
                        ))}
                    </div>
                </div>

                {/* Caveat */}
                {counts.missing > 0 && (
                    <div className="rounded-md border border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger)/0.04)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[hsl(var(--danger)/0.9)]">
                        Some required protection fields are absent. Exact Protection Backtest panels remain unavailable until the exporter provides the required protection fields.
                    </div>
                )}
                {counts.missing === 0 && counts.limited > 0 && (
                    <div className="rounded-md border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning)/0.04)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[hsl(var(--warning)/0.9)]">
                        Some supporting fields have sparse coverage. Segmented analytics may be less reliable with small samples.
                    </div>
                )}
            </div>
        </NeonPanel>
    );
}

function FieldRow({ row }) {
    return (
        <div className="grid grid-cols-1 items-center gap-2 border-b border-[hsl(var(--border-soft)/0.25)] py-2.5 last:border-0 md:grid-cols-[minmax(0,1fr)_160px_auto] md:gap-3">
            <div className="min-w-0">
                <div className="text-[12px] font-medium text-[hsl(var(--text-1))]">
                    {row.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-[hsl(var(--text-3))]">
                    {row.description}
                </div>
            </div>
            <QualityBar pct={row.pct} />
            <StatusBadge status={row.status} />
        </div>
    );
}
