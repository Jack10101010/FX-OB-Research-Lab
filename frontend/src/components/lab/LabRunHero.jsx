import React from "react";
import { Link } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroBadge } from "@/components/lab/controls";
import { buildLabHeroContent } from "@/components/lab/labHeroUtils";

function OpenProjectLink({ projectId }) {
    return (
        <Link
            to={`/projects/${encodeURIComponent(projectId)}`}
            className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--accent-secondary)/0.45)] bg-[hsl(var(--accent-secondary)/0.08)] px-3 py-1.5 text-[12px] font-medium text-[hsl(var(--accent-secondary))] transition-colors hover:border-[hsl(var(--accent-secondary)/0.7)] hover:bg-[hsl(var(--accent-secondary)/0.13)] hover:text-white"
        >
            <FolderOpen className="h-3.5 w-3.5" />
            Open Project
        </Link>
    );
}

function useDataDrivenMode(props) {
    return props.titleFallback != null
        || props.activeProject != null
        || props.activeRun != null
        || props.activeSummary != null
        || props.activeRunId != null;
}

/**
 * Canonical run-scoped lab hero (Protection / Order Block / News Lab).
 * Presentational props (title, runLine, …) or data-driven run context props.
 */
export function LabRunHero({
    pageLabel,
    title: titleProp,
    runLine: runLineProp,
    configLine: configLineProp,
    dateRangeLine: dateRangeLineProp,
    description,
    badges = [],
    actions,
    className,
    testId,
    titleFallback,
    activeProject,
    activeRun,
    activeSummary,
    activeRunId,
    tradeCount,
    variant,
    includeVariant = true,
    showOpenProject = true,
    showDefaultStatusBadges = true,
    showTradeCountBadge = false,
}) {
    const dataDriven = useDataDrivenMode({
        titleFallback,
        activeProject,
        activeRun,
        activeSummary,
        activeRunId,
    });

    const derived = React.useMemo(() => {
        if (!dataDriven) return null;
        return buildLabHeroContent({
            activeProject,
            activeRun,
            activeSummary,
            activeRunId,
            tradeCount,
            variant,
            includeVariant,
            titleFallback: titleFallback ?? "Lab",
        });
    }, [
        dataDriven,
        activeProject,
        activeRun,
        activeSummary,
        activeRunId,
        tradeCount,
        variant,
        includeVariant,
        titleFallback,
    ]);

    const title = dataDriven ? derived?.title : titleProp;
    const runLine = dataDriven ? derived?.runLine : runLineProp;
    const configLine = dataDriven ? derived?.configLine : configLineProp;
    const dateRangeLine = dataDriven ? derived?.dateRangeLine : dateRangeLineProp;
    const projectId = dataDriven ? derived?.projectId : null;
    const hasRun = dataDriven ? derived?.hasRun : false;

    const showRail = Boolean(
        actions
        || badges.length > 0
        || showTradeCountBadge
        || (showOpenProject && projectId)
        || (showDefaultStatusBadges && (hasRun || projectId)),
    );

    return (
        <section
            data-testid={testId}
            className={cn("mx-6 mb-5 px-1 py-4", className)}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    {pageLabel && (
                        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--accent-secondary))]">
                            <span className="h-px w-9 bg-[hsl(var(--accent-secondary)/0.78)]" />
                            {pageLabel}
                        </div>
                    )}
                    {title != null && title !== "" && (
                        <h1 className="mt-2 truncate text-3xl font-semibold tracking-[-0.01em] text-[hsl(var(--text-1))]">
                            {title}
                        </h1>
                    )}
                    {runLine && (
                        <div className="mt-2 text-[13px] font-medium text-[hsl(var(--accent-primary))]">
                            {runLine}
                        </div>
                    )}
                    {configLine && (
                        <div className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--text-2))]">
                            {configLine}
                        </div>
                    )}
                    {dateRangeLine && (
                        <div className="text-[12px] leading-relaxed text-[hsl(var(--text-3))]">
                            {dateRangeLine}
                        </div>
                    )}
                    {description && (
                        <div className="mt-2 max-w-4xl text-[12px] leading-relaxed text-[hsl(var(--text-2))]">
                            {description}
                        </div>
                    )}
                </div>
                {showRail && (
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {showOpenProject && projectId && <OpenProjectLink projectId={projectId} />}
                        {showDefaultStatusBadges && hasRun && <HeroBadge tone="primary">Imported</HeroBadge>}
                        {showDefaultStatusBadges && hasRun && <HeroBadge tone="success">Active Run</HeroBadge>}
                        {showDefaultStatusBadges && projectId && <HeroBadge tone="secondary">Project Active</HeroBadge>}
                        {showTradeCountBadge && (
                            <HeroBadge tone="muted">{tradeCount} trades</HeroBadge>
                        )}
                        {badges.map((badge, index) => (
                            <HeroBadge key={badge.key ?? `${badge.tone}-${index}`} tone={badge.tone}>
                                {badge.label}
                            </HeroBadge>
                        ))}
                        {actions}
                    </div>
                )}
            </div>
        </section>
    );
}

export { LabRunHero as LabHero };
