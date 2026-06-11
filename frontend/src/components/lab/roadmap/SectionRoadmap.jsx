// ── SectionRoadmap.jsx ───────────────────────────────────────────────────────
// Reusable per-section research roadmap. Drop a [Roadmap] button into any section
// header:  <SectionRoadmap sectionKey="distance-to-stop" />.  Clicking opens a modal
// with Current Ideas / Planned / In Progress / Complete columns. Click an item to
// advance its status; changes persist via roadmapStore (localStorage).
//
// Standard pattern for the platform — every major lab/section can own its roadmap
// so ideas stay attached to the feature they belong to (no single giant global list).

import React, { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Map as MapIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoadmap, setRoadmapStatus, ROADMAP_STATUSES, ROADMAP_NEXT_STATUS } from "@/data/roadmapStore";

const STATUS_TONE = {
    idea:        "text-[hsl(var(--text-2))] border-[hsl(var(--border-soft))]",
    planned:     "text-[hsl(var(--accent-secondary))] border-[hsl(var(--accent-secondary)/0.45)]",
    in_progress: "text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.45)]",
    complete:    "text-[hsl(var(--success))] border-[hsl(var(--success)/0.45)]",
};

export function SectionRoadmap({ sectionKey, label = "Roadmap" }) {
    const [open, setOpen] = useState(false);
    const [tick, setTick] = useState(0); // bump to re-read after a status change

    const rm = useMemo(() => getRoadmap(sectionKey), [sectionKey, tick]);
    const cycle = useCallback((id, cur) => {
        setRoadmapStatus(sectionKey, id, ROADMAP_NEXT_STATUS[cur] || "idea");
        setTick((t) => t + 1);
    }, [sectionKey]);

    // Active (in-progress) count badge — keeps the trigger informative without
    // dominating the header.
    const activeCount = rm.items.filter((it) => it.status === "in_progress").length;
    const trigger = (
        <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-ui clip-bevel-sm border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--panel-2)/0.5)] transition-colors">
            <MapIcon className="w-3 h-3" /> {label}
            {activeCount > 0 && (
                <span className="ml-0.5 px-1 text-[9.5px] font-num clip-bevel-sm border border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))]">
                    {activeCount}
                </span>
            )}
        </button>
    );
    if (!open) return trigger;

    const byStatus = (s) => rm.items.filter((it) => it.status === s);
    const colLabel = (col) => rm.labels?.[col.key] || col.label;

    const modal = (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}>
            <div className="w-full max-w-4xl max-h-[82vh] overflow-y-auto clip-bevel border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel))] p-5"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-[15px] text-white">{rm.title}</h3>
                    <button type="button" onClick={() => setOpen(false)} className="text-[hsl(var(--text-2))] hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-3))] mb-4 leading-relaxed">
                    Research ideas attached to this section. Click an item to advance its status. Status is saved locally on this machine.
                </p>
                {rm.findings?.length > 0 && (
                    <div className="mb-4">
                        <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">
                            Key Findings <span className="text-[hsl(var(--text-3))]">({rm.findings.length})</span>
                        </div>
                        <div className="space-y-1">
                            {rm.findings.map((f) => (
                                <div key={f.id} className="flex items-start justify-between gap-3 px-2 py-1.5 text-[11px] font-ui leading-snug clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)]">
                                    <span className="text-[hsl(var(--text-2))]">
                                        {f.stat}
                                        {f.runId && <span className="text-[hsl(var(--text-3))]"> · {f.runId}</span>}
                                    </span>
                                    {f.status === "requires_validation" && (
                                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.05em] clip-bevel-sm border border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))]">
                                            requires cross-run validation
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {ROADMAP_STATUSES.map((col) => {
                        const items = byStatus(col.key);
                        return (
                            <div key={col.key}>
                                <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2">
                                    {colLabel(col)} <span className="text-[hsl(var(--text-3))]">({items.length})</span>
                                </div>
                                <div className="space-y-1.5">
                                    {items.map((it) => (
                                        <button key={it.id} type="button" onClick={() => cycle(it.id, it.status)}
                                            title="Click to advance status"
                                            className={cn(
                                                "w-full text-left px-2 py-1.5 text-[11px] font-ui leading-snug clip-bevel-sm border bg-[hsl(var(--panel-2)/0.4)] hover:bg-[hsl(var(--panel-2))] transition-colors",
                                                STATUS_TONE[it.status],
                                            )}>
                                            {it.label}
                                            {it.note && (
                                                <span className="block mt-0.5 text-[9.5px] text-[hsl(var(--text-3))] normal-case leading-snug">{it.note}</span>
                                            )}
                                        </button>
                                    ))}
                                    {!items.length && <div className="text-[10px] font-ui text-[hsl(var(--text-3))] italic px-1">—</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {trigger}
            {typeof document !== "undefined" ? createPortal(modal, document.body) : modal}
        </>
    );
}

export default SectionRoadmap;
