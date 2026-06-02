import React from "react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/lab/DataTable";
import { getRunDisplayName, compactTimeframe } from "@/data/store";

const SLOT_LABELS = ["A", "B", "C", "D"];
const SLOT_COLORS = [
    "hsl(var(--accent-secondary))",
    "hsl(var(--accent-primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
];

function runLabel(run) {
    if (!run) return "No run";
    if (typeof run === "string") return run;
    const label = getRunDisplayName(run);
    if (label && typeof label !== "object") return String(label);
    const fallback = [run.displayName, run.name, run.summary?.displayName, run.summary?.name, run.id]
        .find(value => value && typeof value !== "object");
    return fallback ? String(fallback) : "Untitled run";
}

function runTimeframe(run) {
    if (!run || typeof run !== "object") return "";
    const value = compactTimeframe(
        run.detectionTf
        || run.detection_tf
        || run.summary?.detectionTf
        || run.summary?.detection_tf
        || run.config?.detection_tf
        || run.config?.detection_timeframe
        || run.timeframe
    );
    return value && typeof value !== "object" ? String(value) : "";
}

export function RunSelectorBar({ runs = [], selectedRunIds, setSelectedRunIds }) {
    // Toggle a run into the next empty slot, or remove if already selected
    function handleToggle(runId) {
        if (selectedRunIds.includes(runId)) {
            setSelectedRunIds(selectedRunIds.filter(id => id !== runId));
        } else if (selectedRunIds.length < 4) {
            setSelectedRunIds([...selectedRunIds, runId]);
        }
    }

    const availableRuns = runs.filter(r => r.entryResults?.summary);

    if (!availableRuns.length) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.3)] rounded-[1px]">
                <Pill tone="warning">NO RUNS WITH ENTRY DATA</Pill>
                <span className="text-[10px] font-ui text-muted-lab">Import entry results to compare runs.</span>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Slot indicators */}
            <div className="flex items-center gap-2 mb-1">
                <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Selected slots:</span>
                {SLOT_LABELS.map((slot, i) => {
                    const runId  = selectedRunIds[i];
                    const run    = runId ? availableRuns.find(r => r.id === runId) : null;
                    const active = !!run;
                    return (
                        <div key={slot}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui border rounded-[1px] transition-colors",
                                active
                                    ? "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.6)] text-white"
                                    : "border-[hsl(var(--border-soft)/0.4)] text-muted-lab"
                            )}
                        >
                            <span className="w-2 h-2 rounded-full" style={{ background: active ? SLOT_COLORS[i] : "hsl(var(--border-soft))" }} />
                            <span className="font-semibold">{slot}:</span>
                            <span className="max-w-[100px] truncate">
                                {run ? runLabel(run) : "empty"}
                            </span>
                        </div>
                    );
                })}
                {selectedRunIds.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setSelectedRunIds([])}
                        className="ml-2 text-[9.5px] font-ui text-muted-lab hover:text-white transition-colors"
                    >
                        clear all
                    </button>
                )}
            </div>

            {/* Run list */}
            <div className="flex flex-wrap gap-1.5">
                {availableRuns.map(run => {
                    const idx    = selectedRunIds.indexOf(run.id);
                    const active = idx !== -1;
                    const color  = active ? SLOT_COLORS[idx] : null;
                    const tf     = runTimeframe(run);
                    const label  = runLabel(run);
                    const trades = run.entryResults?.summary?.total ?? "?";
                    const canAdd = !active && selectedRunIds.length < 4;

                    return (
                        <button key={run.id} type="button"
                            onClick={() => handleToggle(run.id)}
                            disabled={!active && !canAdd}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-ui border rounded-[1px] transition-colors",
                                active
                                    ? "border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.5)] text-white"
                                    : canAdd
                                        ? "border-[hsl(var(--border-soft)/0.6)] text-muted-lab hover:text-white hover:border-[hsl(var(--border-mid))]"
                                        : "border-[hsl(var(--border-soft)/0.3)] text-muted-lab/40 cursor-not-allowed"
                            )}
                        >
                            {active && (
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            )}
                            <span className="font-semibold">{label}</span>
                            {tf && <span className="opacity-60">{tf}</span>}
                            <span className="opacity-40">{trades}t</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export { SLOT_COLORS, SLOT_LABELS };
