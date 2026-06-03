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
    // When "right", the run/config/date info rows move from the left column into
    // a compact card in the right column. Left shows only label + title + description.
    // Default "inline" preserves existing behaviour for all other pages.
    infoCardPosition = "inline",
    // Optional panel rendered below the action buttons in the right column.
    // Lets pages (e.g. OrderBlockLab) co-locate RunConfigStrip + UniverseBadge
    // alongside the title without pulling them out into a separate stacked row.
    sidePanel = null,
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

    const infoRight = infoCardPosition === "right";
    const hasInfoRows = !!(runLine || configLine || dateRangeLine);

    const showRail = Boolean(
        (infoRight && hasInfoRows)
        || actions
        || badges.length > 0
        || showTradeCountBadge
        || (showOpenProject && projectId)
        || (showDefaultStatusBadges && (hasRun || projectId))
        || sidePanel,
    );

    return (
        <section
            data-testid={testId}
            className={cn("mx-6 mb-5 px-1 py-4", className)}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                {/* Left column — always shows label + title + description.
                    Info rows (runLine/configLine/dateRangeLine) are shown here
                    only when infoCardPosition is "inline" (default). */}
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
                    {!infoRight && runLine && (
                        <div className="mt-2 text-[13px] font-medium text-[hsl(var(--accent-primary))]">
                            {runLine}
                        </div>
                    )}
                    {!infoRight && configLine && (
                        <div className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--text-2))]">
                            {configLine}
                        </div>
                    )}
                    {!infoRight && dateRangeLine && (
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

                {/* Right column — two variants depending on infoCardPosition.
                    "inline" (default): flat flex row of action buttons — identical
                      to the original structure, zero layout change for other pages.
                    "right": flex-col with action buttons above the info card. */}
                {showRail && !infoRight && (
                    <div className={cn(
                        sidePanel
                            ? "flex flex-col gap-3 shrink-0 lg:items-end lg:max-w-[400px] w-full"
                            : "flex flex-wrap items-center gap-2 lg:justify-end",
                    )}>
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
                        {sidePanel && <div className="w-full">{sidePanel}</div>}
                    </div>
                )}
                {infoRight && (
                    <div className="flex flex-col gap-3 lg:items-end shrink-0">
                        {/* Action buttons row */}
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
                        {/* Info card */}
                        {hasInfoRows && (
                            <div className="clip-bevel-sm border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] px-3 py-2.5 flex flex-col gap-1 max-w-xs xl:max-w-sm w-full">
                                {runLine && (
                                    <div className="text-[11px] font-medium text-[hsl(var(--accent-primary))] leading-snug break-words">
                                        {runLine}
                                    </div>
                                )}
                                {configLine && (
                                    <div className="text-[10.5px] leading-relaxed text-[hsl(var(--text-2))]">
                                        {configLine}
                                    </div>
                                )}
                                {dateRangeLine && (
                                    <div className="text-[10.5px] text-[hsl(var(--text-3))]">
                                        {dateRangeLine}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

export { LabRunHero as LabHero };
