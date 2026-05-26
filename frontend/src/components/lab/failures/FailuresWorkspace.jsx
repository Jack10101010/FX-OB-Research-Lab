// ── FailuresWorkspace.jsx ────────────────────────────────────────────────────
// Main coordinator for the Failures Research Lab.
// Pattern: useDataset → data pipeline (useMemo chain) → sharedProps → tab switch.
// Mirrors EntriesWorkspace.jsx architecture exactly.

import React, { useMemo } from "react";
import { useDataset } from "@/data/store";
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
import { PreventionEngine }      from "./prevention/PreventionEngine";
import { FailureDrilldown }      from "./drilldown/FailureDrilldown";
import { ViewManager }           from "./workspace/ViewManager";

// Pure pipeline functions
import { filterLosers }  from "./shared/failuresUtils";
import { classifyAll }   from "./shared/archetypeClassifier";
import { scoreAll }      from "./shared/severityScorer";

const EMPTY_TRADES = [];

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
                <p className="text-[11px] font-mono text-[hsl(var(--text-2))] mt-1.5 max-w-xs leading-relaxed">
                    Import a backtest run from the Projects page to begin your failure forensics session.
                </p>
            </div>
        </div>
    );
}

// ── Workspace ─────────────────────────────────────────────────────────────────

function resolveActiveTrades(dataset) {
    if (Array.isArray(dataset?.TRADES)) return dataset.TRADES;
    if (Array.isArray(dataset?.trades)) return dataset.trades;

    const activeRunId = dataset?.activeRunId;
    const activeRun = activeRunId ? dataset?.runs?.[activeRunId] : null;
    const variant = dataset?.ACTIVE_TRADE_VARIANT;

    if (variant && Array.isArray(activeRun?.tradesByVariant?.[variant])) {
        return activeRun.tradesByVariant[variant];
    }
    if (variant && Array.isArray(dataset?.ACTIVE_RUN?.tradesByVariant?.[variant])) {
        return dataset.ACTIVE_RUN.tradesByVariant[variant];
    }
    if (Array.isArray(activeRun?.trades)) return activeRun.trades;
    if (Array.isArray(dataset?.ACTIVE_RUN?.trades)) return dataset.ACTIVE_RUN.trades;
    if (Array.isArray(dataset?.activeRun?.trades)) return dataset.activeRun.trades;
    if (Array.isArray(dataset?.runData?.trades)) return dataset.runData.trades;
    return EMPTY_TRADES;
}

function resolveActiveConfig(dataset) {
    const activeRun = dataset?.activeRunId ? dataset?.runs?.[dataset.activeRunId] : null;
    return activeRun?.config
        || dataset?.ACTIVE_RUN?.config
        || dataset?.activeRun?.config
        || dataset?.runData?.config
        || dataset?.config
        || {};
}

export function FailuresWorkspace() {
    const dataset = useDataset();
    const trades = useMemo(() => resolveActiveTrades(dataset), [dataset]);
    const config = useMemo(() => resolveActiveConfig(dataset), [dataset]);

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
    } = useFailuresWorkspace();

    // ── Data pipeline ─────────────────────────────────────────────────────────
    // Pure useMemo chain — mirrors EntriesWorkspace pattern.
    // Each step only re-computes when its input changes.

    // Step 1: Extract losers from all trades
    const allLosers = useMemo(() => filterLosers(trades), [trades]);

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
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (!trades.length) {
        return <NoDataState />;
    }

    return (
        <div className="flex flex-col min-h-0">
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
            />

            {/* Module render switch */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === "overview"   && <FailuresOverview     {...sharedProps} />}
                {activeTab === "archetypes" && <FailureDNA           {...sharedProps} />}
                {activeTab === "temporal"   && <FailuresTemporal     {...sharedProps} />}
                {activeTab === "direction"  && <DirectionalAsymmetry {...sharedProps} />}
                {activeTab === "sessions"   && <SessionFailures      {...sharedProps} />}
                {activeTab === "streaks"    && <StreakAnalysis        {...sharedProps} />}
                {activeTab === "prevention" && <PreventionEngine     {...sharedProps} />}
                {activeTab === "drilldown"  && <FailureDrilldown     {...sharedProps} />}
                {activeTab === "workspace"  && <ViewManager          {...sharedProps} />}
            </div>
        </div>
    );
}
