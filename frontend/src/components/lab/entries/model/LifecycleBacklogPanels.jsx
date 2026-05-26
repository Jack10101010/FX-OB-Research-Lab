import React from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { PLANNED_ENTRY_MODES, ENTRY_BACKLOG, LIFECYCLE_IDEAS, ENTRY_FAMILIES, FAMILY_TONE } from "../analytics/entryRegistry";

// ─── Lifecycle Panel ──────────────────────────────────────────────────────────

const STATUS_STYLE = {
    live:     { label: "LIVE",     cls: "text-[hsl(var(--success))]    border-[hsl(var(--success)/0.4)]    bg-[hsl(var(--success)/0.08)]" },
    testing:  { label: "TESTING",  cls: "text-[hsl(var(--warning))]    border-[hsl(var(--warning)/0.4)]    bg-[hsl(var(--warning)/0.08)]" },
    tested:   { label: "TESTED",   cls: "text-[hsl(var(--accent-primary))] border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.06)]" },
    planned:  { label: "PLANNED",  cls: "text-[hsl(var(--text-2))]     border-[hsl(var(--border-soft))]    bg-[hsl(var(--panel-2)/0.4)]" },
    backlog:  { label: "BACKLOG",  cls: "text-[hsl(var(--text-2))]     border-[hsl(var(--border-soft))]    bg-[hsl(var(--panel-2)/0.5)]" },
    rejected: { label: "REJECTED", cls: "text-[hsl(var(--danger))]     border-[hsl(var(--danger)/0.4)]     bg-[hsl(var(--danger)/0.06)]" },
    promoted: { label: "PROMOTED", cls: "text-[hsl(var(--accent-secondary))] border-[hsl(var(--accent-secondary)/0.4)] bg-[hsl(var(--accent-secondary)/0.08)]" },
};

function FamilySection({ familyKey, models }) {
    const tone  = FAMILY_TONE[familyKey] || "secondary";
    const count = models.length;

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-1.5">
                <Pill tone={tone}>{familyKey.toUpperCase()}</Pill>
                <span className="text-[9.5px] font-mono text-muted-lab">{count} model{count !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid gap-1">
                {models.map(m => {
                    const style = STATUS_STYLE[m.status] || STATUS_STYLE.planned;
                    return (
                        <div key={m.mode}
                            className="flex items-center gap-3 px-3 py-1.5 rounded-[1px] border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.3)]"
                        >
                            <span className={cn("px-1.5 py-0.5 text-[8.5px] font-mono uppercase tracking-wider border rounded-[1px]", style.cls)}>
                                {style.label}
                            </span>
                            <span className="text-[10.5px] font-mono text-white flex-1">{m.label}</span>
                            {m.threshold != null && (
                                <span className="text-[9.5px] font-mono text-muted-lab">thr {m.threshold}</span>
                            )}
                            <span className="text-[9px] font-mono text-muted-lab opacity-60">{m.mode}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function LifecyclePanel() {
    const byFamily = ENTRY_FAMILIES.reduce((acc, f) => {
        acc[f.key] = PLANNED_ENTRY_MODES.filter(m => m.family === f.key);
        return acc;
    }, {});

    const liveCount    = PLANNED_ENTRY_MODES.filter(m => m.status === "live" || m.status === "tested").length;
    const testingCount = PLANNED_ENTRY_MODES.filter(m => m.status === "testing").length;

    return (
        <NeonPanel title="Entry Model Lifecycle" className="xl:col-span-2"
            action={
                <div className="flex gap-1.5">
                    <Pill tone="success">{liveCount} TESTED</Pill>
                    {testingCount > 0 && <Pill tone="warning">{testingCount} TESTING</Pill>}
                </div>
            }
        >
            <p className="mb-3 text-[10px] font-mono text-muted-lab">All planned entry models by family. Status reflects current research stage.</p>
            {ENTRY_FAMILIES.map(f => byFamily[f.key]?.length > 0
                ? <FamilySection key={f.key} familyKey={f.key} models={byFamily[f.key]} />
                : null
            )}
        </NeonPanel>
    );
}

// ─── Future Models Panel ──────────────────────────────────────────────────────

export function FutureModelsPanel() {
    return (
        <NeonPanel title="Future Model Ideas" className="xl:col-span-1"
            action={<Pill tone="secondary">{LIFECYCLE_IDEAS.length} IDEAS</Pill>}
        >
            <p className="mb-3 text-[10px] font-mono text-muted-lab">Entry lifecycle concepts not yet formalised into testable models.</p>
            <div className="flex flex-col gap-1.5">
                {LIFECYCLE_IDEAS.map((idea, i) => (
                    <div key={i} className="px-2.5 py-2 border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.25)] rounded-[1px]">
                        <div className="text-[10.5px] font-mono text-white">{idea.title}</div>
                        {idea.body && (
                            <div className="mt-0.5 text-[9.5px] font-mono text-muted-lab">{idea.body}</div>
                        )}
                        {idea.status && (
                            <div className="mt-0.5 text-[8.5px] font-mono text-muted-lab opacity-60 uppercase tracking-wider">{idea.status}</div>
                        )}
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

// ─── Research Backlog Panel ───────────────────────────────────────────────────

export function ResearchBacklogPanel() {
    return (
        <NeonPanel title="Research Backlog" className="xl:col-span-1"
            action={<Pill tone="secondary">{ENTRY_BACKLOG.length} ITEMS</Pill>}
        >
            <p className="mb-3 text-[10px] font-mono text-muted-lab">Open research questions and improvement vectors for the next iteration.</p>
            <div className="flex flex-col gap-1">
                {ENTRY_BACKLOG.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-2.5 py-2 border border-[hsl(var(--border-soft)/0.4)] bg-[hsl(var(--panel-2)/0.25)] rounded-[1px]">
                        <div>
                            <div className="text-[10.5px] font-mono text-white leading-snug">{item.title}</div>
                            {item.status && (
                                <div className="mt-0.5 text-[9px] font-mono text-muted-lab opacity-60 uppercase tracking-wider">{item.status}</div>
                            )}
                            {item.body && (
                                <div className="mt-0.5 text-[9px] font-mono text-muted-lab">{item.body}</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}
