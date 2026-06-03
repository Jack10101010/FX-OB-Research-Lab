import React from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { RunConfigStrip } from "@/components/lab/RunConfigStrip";
import { HeroBadge, NeonButton } from "@/components/lab/controls";
import { getRunDisplayName, useDataset } from "@/data/store";
import { variantLabel } from "../analytics/entryFormatters";

export function EntryWorkspaceHeader({ trades, activeVariant, exactRows }) {
    const { ACTIVE_PROJECT, RUNS, ACTIVE_RUN, activeRunId, getRunData } = useDataset();
    const activeRun    = RUNS.find(r => r.id === activeRunId);
    // Prefer the full run bundle (has complete config) over the index-only list entry
    const activeRunData = getRunData?.(activeRunId) || activeRun;
    const projectName  = ACTIVE_PROJECT?.name || "";
    const projectId    = ACTIVE_PROJECT?.id || null;
    const runName      = activeRun ? getRunDisplayName(activeRun) : "";
    const hasExact     = exactRows?.some(r => r.exact && !r.isBaseline);
    const modelCount   = exactRows?.filter(r => r.exact && !r.isBaseline).length ?? 0;

    return (
        <>
            <LabRunHero
                pageLabel="Entries Research Workspace"
                title={projectName || runName || "No run selected"}
                runLine={[
                    runName && projectName ? `Run: ${runName}` : null,
                    trades.length ? `${trades.length} trades` : null,
                    variantLabel(activeVariant),
                ].filter(Boolean).join(" · ")}
                className="mt-4 mb-0"
                actions={(
                    <>
                        {!activeRunId && (
                            <Link to="/runs">
                                <NeonButton tone="ghost">Select a Run →</NeonButton>
                            </Link>
                        )}
                        {activeRunId && (
                            <Link to={`/runs/${encodeURIComponent(activeRunId)}`}>
                                <NeonButton tone="ghost">Run Detail</NeonButton>
                            </Link>
                        )}
                        {projectId && (
                            <Link to={`/projects/${encodeURIComponent(projectId)}`}>
                                <NeonButton tone="ghost">Open Project</NeonButton>
                            </Link>
                        )}
                        {activeRun && <HeroBadge tone="primary">Imported</HeroBadge>}
                        <HeroBadge tone={hasExact ? "success" : "warning"}>{hasExact ? `${modelCount} Models` : "Baseline Only"}</HeroBadge>
                        {trades.length > 0 && <HeroBadge tone="muted">{trades.length} trades</HeroBadge>}
                    </>
                )}
            />
            <RunConfigStrip run={activeRunData} dense />
        </>
    );
}
