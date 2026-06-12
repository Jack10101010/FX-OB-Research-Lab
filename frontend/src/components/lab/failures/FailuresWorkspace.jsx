// ── FailuresWorkspace.jsx ────────────────────────────────────────────────────
// Main coordinator for the Failures Research Lab.
// Pattern: useDataset → data pipeline (useMemo chain) → sharedProps → tab switch.
// Mirrors EntriesWorkspace.jsx architecture exactly.

import React, { useMemo } from "react";
import { getRunDisplayName, useDataset } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { summarizeTradeClassifications } from "@/data/tradeClassification";
import { evaluateSampleGuardrail } from "@/data/sampleGuardrail";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { WorkspaceTabBar } from "../entries/shared/WorkspaceTabBar";
import { useFailuresWorkspace, FAILURES_TABS, applyFilter } from "./shared/useFailuresWorkspace";
import { FailuresCohortFilter } from "./global/FailuresCohortFilter";
import { FailuresDataQualityBanner } from "./global/FailuresDataQualityBanner";

// Module assemblers
import { FailuresOverview }      from "./overview/FailuresOverview";
import { FailureDNA }            from "./archetypes/FailureDNA";
import { FailuresTemporal }      from "./temporal/FailuresTemporal";
import { DirectionalAsymmetry }  from "./direction/DirectionalAsymmetry";
import { SessionFailures }       from "./sessions/SessionFailures";
import { StreakAnalysis }         from "./streaks/StreakAnalysis";
import { ExcursionAnalysis }     from "./excursion/ExcursionAnalysis";
import { FilterDiscovery }       from "./discovery/FilterDiscovery";
import { PreventionEngine }      from "./prevention/PreventionEngine";
import { FailureDrilldown }      from "./drilldown/FailureDrilldown";
import { ViewManager }           from "./workspace/ViewManager";

// Pure pipeline functions
import { filterLosers }  from "./shared/failuresUtils";
import { classifyAll }   from "./shared/archetypeClassifier";
import { scoreAll }      from "./shared/severityScorer";

// ── Empty state ───────────────────────────────────────────────────────────────

function NoDataState() {
    return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center px-8">
            <div className="w-14 h-14 clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.4)] to-[hsl(var(--accent-secondary)/0.3)]">
                <div className="w-full h-full clip-bevel bg-[hsl(var(--panel))] flex items-center justify-center">
                    <span className="text-2xl">🔬</span>
                </div>
            </div>
            <div>
                <p className="font-display text-[15px] text-white">No trade data loaded</p>
                <p className="text-[11px] font-ui text-[hsl(var(--text-2))] mt-1.5 max-w-xs leading-relaxed">
                    Import a backtest run from the Projects page to begin your failure forensics session.
                </p>
            </div>
        </div>
    );
}

// ── Workspace ─────────────────────────────────────────────────────────────────
//
// Trade source: useTradeUniverse() — the canonical scenario-aware resolver
// from data/useTradeUniverse.js. The legacy `resolveActiveTrades(dataset)`
// fallback chain (TRADES → runs[active].tradesByVariant → ACTIVE_RUN.… →
// activeRun.trades → runData.trades) was removed in Phase 2C; it was
// baseline-only and silently ignored the user's selected scenario.

function resolveActiveConfig(dataset) {
    const activeRun = dataset?.activeRunId ? dataset?.runs?.[dataset.activeRunId] : null;
    return activeRun?.config
        || dataset?.ACTIVE_RUN?.config
        || dataset?.activeRun?.config
        || dataset?.runData?.config
        || dataset?.config
        || {};
}

function resolveActiveRun(dataset) {
    const activeRunId = dataset?.activeRunId;
    const runCollection = dataset?.runs;
    const keyedRun = activeRunId && runCollection && !Array.isArray(runCollection) ? runCollection[activeRunId] : null;
    const listedRun = activeRunId && Array.isArray(dataset?.RUNS) ? dataset.RUNS.find((run) => run?.id === activeRunId) : null;
    return dataset?.ACTIVE_RUN || dataset?.activeRun || keyedRun || listedRun || dataset?.runData || null;
}

export function FailuresWorkspace() {
    // Phase 2C — the canonical hook handles store subscription + memoization
    // in one place; consumers no longer hand-roll
    // `useMemo(() => getTradeUniverse(), [dataset])`. We still call useDataset
    // alongside because config / activeRun derive from non-trade fields of the
    // dataset (the run's config block + the RUNS index).
    const universe = useTradeUniverse();
    const dataset = useDataset();
    const trades = universe.trades;
    // Phase 2G — universeWarnings filtering moved into TradeUniverseBadge so
    // the same five-line filter no longer lives in every consumer.
    const config = useMemo(() => resolveActiveConfig(dataset), [dataset]);
    const activeRun = useMemo(() => resolveActiveRun(dataset), [dataset]);

    const {
        activeTab,
        setActiveTab,
        filters,
        toggleSession,
        toggleDirection,
        toggleArchetype,
        setSeverityMin,
        clearFilters,
        hasActiveFilters,
        filtersExpanded,
        setFiltersExpanded,
    } = useFailuresWorkspace();

    // ── Data pipeline ─────────────────────────────────────────────────────────
    // Pure useMemo chain — mirrors EntriesWorkspace pattern.
    // Each step only re-computes when its input changes.

    // Step 1: Extract losers from all trades
    const allLosers = useMemo(() => filterLosers(trades), [trades]);

    // PROTECTION-LAYER Phase 3 — protected-universe awareness. When the active
    // universe is a protected_result, BE-exit rows are mixed into the trade list;
    // surface their counts so a BE-saved loss is never silently dropped, and
    // gate strong conclusions on the loser sample size.
    const isProtectedUniverse = universe.universeType === "protected_result";
    const exitTypeRollup = useMemo(() => summarizeTradeClassifications(trades), [trades]);
    const failuresGuardrail = useMemo(
        () => evaluateSampleGuardrail({ sampleSize: allLosers.length }),
        [allLosers.length],
    );

    // Step 2: Classify each loser into a failure archetype
    const classifiedLosers = useMemo(
        () => classifyAll(allLosers, config),
        [allLosers, config],
    );

    // Step 3: Compute severity scores (requires chronological order — preserved from filterLosers)
    const scoredLosers = useMemo(
        () => scoreAll(classifiedLosers),
        [classifiedLosers],
    );

    // Step 4: Apply cohort filter (direction / session / archetype / severity)
    const filteredLosers = useMemo(
        () => applyFilter(scoredLosers, filters),
        [scoredLosers, filters],
    );

    // ── Shared props ──────────────────────────────────────────────────────────
    // All modules receive the same prop shape. Extra props passed per module needs.

    const sharedProps = {
        losers:     filteredLosers,     // filtered + scored + classified losers
        allLosers:  scoredLosers,       // unfiltered scored losers (for cohort compare)
        allTrades:  trades,             // full trade list (needed for equity curve, streaks)
        config,                         // backtest config (executionTf etc.)
        filters,                        // current cohort filter state (for ViewManager saved views)
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (!trades.length) {
        return <NoDataState />;
    }

    return (
        <div className="flex flex-col min-h-0">
            <LabRunHero
                pageLabel="Failures Lab"
                title={activeRun ? getRunDisplayName(activeRun) : "Failure Research Workspace"}
                runLine={`${trades.length} trades · ${scoredLosers.length} losses`}
                description="Failure forensics across losing trades, invalidation patterns, sessions, streaks, and prevention candidates."
                className="mt-4 mb-0"
            />

            {/* RESEARCH-RESULT-VIEW-BANNER Phase 5: read-only RunDetail-style banner.
                Hero (LabRunHero) above carries run identity; same universe the failures
                analytics use; Arm C0/C1 warning shown once (right panel). Not interactive. */}
            <div className="px-6 mt-2 mb-2">
                <ResearchResultViewBanner universe={universe} run={buildBannerRunIdentity(activeRun)} />
            </div>

            {/* PROTECTION-LAYER Phase 3 — protected-universe notice: exit-type
                counts + low-sample caution so failure analytics on a protected
                (exploratory) universe are never read as the real strategy. */}
            {isProtectedUniverse && (
                <div className="px-6 mb-2">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-[4px] border border-[hsl(var(--accent-secondary)/0.5)] bg-[hsl(var(--accent-secondary)/0.08)]">
                        <span className="text-[10px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))]">Protected universe</span>
                        <span className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                            Failure analytics below run on a protected, exploratory universe — not the raw strategy.
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--text-muted)/0.4)] text-[hsl(var(--text-2))]">BE Exit {exitTypeRollup.beExitCount ?? 0}</span>
                        <span className="px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--text-muted)/0.4)] text-[hsl(var(--text-2))]">Protection Applied {exitTypeRollup.protectionAppliedCount ?? 0}</span>
                        {failuresGuardrail.message && (
                            <span className="px-2 py-0.5 text-[10px] font-ui border border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))]">{failuresGuardrail.message}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Tab rail */}
            <WorkspaceTabBar
                tabs={FAILURES_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                hasActiveFilters={hasActiveFilters}
            />

            {/* Data quality banner */}
            <FailuresDataQualityBanner trades={allLosers} />

            {/* Cohort filter bar */}
            <FailuresCohortFilter
                filters={filters}
                toggleSession={toggleSession}
                toggleDirection={toggleDirection}
                toggleArchetype={toggleArchetype}
                clearFilters={clearFilters}
                hasActiveFilters={hasActiveFilters}
                totalLosers={scoredLosers.length}
                filteredLosers={filteredLosers.length}
                expanded={filtersExpanded}
                onExpandedChange={setFiltersExpanded}
            />

            {/* Module render switch */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "overview"   && <FailuresOverview     {...sharedProps} />}
                {activeTab === "archetypes" && <FailureDNA           {...sharedProps} />}
                {activeTab === "temporal"   && <FailuresTemporal     {...sharedProps} />}
                {activeTab === "direction"  && <DirectionalAsymmetry {...sharedProps} />}
                {activeTab === "sessions"   && <SessionFailures      {...sharedProps} />}
                {activeTab === "streaks"    && <StreakAnalysis        {...sharedProps} />}
                {activeTab === "excursion"  && <ExcursionAnalysis    {...sharedProps} />}
                {activeTab === "discovery"  && <FilterDiscovery      {...sharedProps} />}
                {activeTab === "prevention" && <PreventionEngine     {...sharedProps} />}
                {activeTab === "drilldown"  && <FailureDrilldown     {...sharedProps} />}
                {activeTab === "workspace"  && <ViewManager          {...sharedProps} filters={filters} />}
            </div>
        </div>
    );
}

// Local FailuresUniverseBadge + FailuresBadgeCell removed in Phase 2F —
// replaced by the shared @/components/lab/TradeUniverseBadge component.
// See the import at the top of this file.
