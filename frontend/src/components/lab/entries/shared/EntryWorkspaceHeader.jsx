import React from "react";
import { Link } from "react-router-dom";
import { MousePointerClick, FolderOpen } from "lucide-react";
import { Pill } from "@/components/lab/DataTable";
import { compactTimeframe, getRunDisplayName, useDataset } from "@/data/store";
import { variantLabel } from "../analytics/entryFormatters";

export function EntryWorkspaceHeader({ trades, activeVariant, exactRows }) {
    const { ACTIVE_PROJECT, RUNS, ACTIVE_RUN, activeRunId } = useDataset();
    const activeRun    = RUNS.find(r => r.id === activeRunId);
    const projectName  = ACTIVE_PROJECT?.name || "";
    const projectId    = ACTIVE_PROJECT?.id || null;
    const runName      = activeRun ? getRunDisplayName(activeRun) : "";
    const symbol       = activeRun?.symbol || ACTIVE_RUN?.symbol || "—";
    const timeframe    = compactTimeframe(activeRun?.detectionTf || ACTIVE_RUN?.detectionTf);
    const hasExact     = exactRows?.some(r => r.exact && !r.isBaseline);
    const modelCount   = exactRows?.filter(r => r.exact && !r.isBaseline).length ?? 0;

    return (
        <div className="mx-6 mt-4 mb-0 clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.42)] via-[hsl(var(--border-soft))] to-[hsl(var(--accent-secondary)/0.32)]">
            <div className="clip-bevel bg-[hsl(var(--panel)/0.96)] px-5 py-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[hsl(var(--accent-secondary))] flex items-center gap-1.5">
                            <MousePointerClick className="w-3 h-3" />
                            Entries Research Workspace
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-display text-[hsl(var(--text-1))] truncate">
                                {projectName || runName || "No run selected"}
                            </h1>
                            {projectId && (
                                <Link
                                    to={`/projects/${encodeURIComponent(projectId)}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.45)] bg-[hsl(var(--accent-secondary)/0.06)] text-[10px] font-mono uppercase tracking-[0.14em] text-[hsl(var(--accent-secondary))] hover:text-white transition-colors"
                                >
                                    <FolderOpen className="w-3 h-3" />
                                    Project
                                </Link>
                            )}
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono text-[hsl(var(--accent-secondary)/0.8)]">
                            {[runName && projectName ? `Run: ${runName}` : null, symbol, timeframe, trades.length ? `${trades.length} trades` : null, variantLabel(activeVariant)]
                                .filter(Boolean).join(" · ")}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {activeRun && <Pill tone="primary">Imported</Pill>}
                        <Pill tone={hasExact ? "success" : "warning"}>{hasExact ? `${modelCount} Models` : "Baseline Only"}</Pill>
                        {trades.length > 0 && <Pill tone="muted">{trades.length} trades</Pill>}
                    </div>
                </div>
            </div>
        </div>
    );
}
