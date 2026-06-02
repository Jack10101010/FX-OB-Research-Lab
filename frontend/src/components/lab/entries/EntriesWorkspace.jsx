import React, { useMemo } from "react";
import { useDataset } from "@/data/store";
import { useEntryWorkspace } from "./shared/useEntryWorkspace";
import { WorkspaceTabBar } from "./shared/WorkspaceTabBar";
import { GlobalFilterBar } from "./shared/GlobalFilterBar";
import { EntryWorkspaceHeader } from "./shared/EntryWorkspaceHeader";
import { buildEntryResultRows, buildExactSummary, buildEntryAnalytics } from "./analytics/entryAnalytics";
import { ModelAnalysis } from "./model/ModelAnalysis";
import { ExperimentCompare } from "./compare/ExperimentCompare";
import { EntryHypothesisLab } from "./hypothesis/EntryHypothesisLab";
import { RobustnessLab } from "./robustness/RobustnessLab";
import { PromotionDesk } from "./promotion/PromotionDesk";

const EMPTY_TRADES = [];

function resolveEntryResults(run) {
    const entryResults = run?.entryResults
        || run?.entry_results
        || run?.summary?.entryResults
        || run?.summary?.entry_results
        || {};
    return {
        ...entryResults,
        summary: entryResults.summary
            || entryResults.results
            || run?.summary?.entryResults
            || run?.summary?.entry_results
            || {},
        tradesByMode: entryResults.tradesByMode
            || entryResults.trades_by_mode
            || run?.summary?.entryResults?.tradesByMode
            || run?.summary?.entry_results?.trades_by_mode
            || {},
        equityCurveByMode: entryResults.equityCurveByMode
            || entryResults.equity_curve_by_mode
            || {},
        sourceFiles: entryResults.sourceFiles
            || entryResults.source_files
            || [],
    };
}

export function EntriesWorkspace() {
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
    const trades     = useMemo(() => Array.isArray(TRADES) ? TRADES : EMPTY_TRADES, [TRADES]);
    const activeRun  = activeRunId ? runs?.[activeRunId] : null;

    const {
        activeTab, setActiveTab,
        filters, toggleSession, toggleDirection, clearFilters, hasActiveFilters, applyFilters,
        colVis, setColVis,
        selectedModelKey, setSelectedModelKey,
        TABS,
    } = useEntryWorkspace();

    // Filtered trade list (respects global session/direction filters)
    const filteredTrades = useMemo(() => applyFilters(trades), [applyFilters, trades]);
    const entryResults = useMemo(() => resolveEntryResults(activeRun), [activeRun]);
    const runWithEntryResults = useMemo(() => (
        activeRun ? { ...activeRun, entryResults } : null
    ), [activeRun, entryResults]);

    // Core entry rows — always built from full trades + active run data
    const exactRows = useMemo(
        () => buildEntryResultRows(runWithEntryResults, filteredTrades, ACTIVE_TRADE_VARIANT),
        [runWithEntryResults, filteredTrades, ACTIVE_TRADE_VARIANT],
    );

    const summary = useMemo(() => buildExactSummary(exactRows), [exactRows]);

    const analytics = useMemo(
        () => buildEntryAnalytics(filteredTrades, exactRows),
        [filteredTrades, exactRows],
    );

    const tradesByMode = entryResults.tradesByMode || {};

    // Shared props passed down to every tab
    const sharedProps = {
        trades: filteredTrades,
        rawTrades: trades,
        exactRows,
        summary,
        analytics,
        tradesByMode,
        activeRun: runWithEntryResults,
        activeVariant: ACTIVE_TRADE_VARIANT,
        colVis, setColVis,
        selectedModelKey, setSelectedModelKey,
        filters,
    };

    return (
        <div className="pb-16">
            <EntryWorkspaceHeader
                trades={filteredTrades}
                activeVariant={ACTIVE_TRADE_VARIANT}
                exactRows={exactRows}
            />

            {/* Scope communication — Entries Workspace intentionally pins its
                base trade list to the run's baseline/primary-variant reference
                and is NOT governed by the active Strategy Map universe. The
                per-entry-model columns are the page's multi-model axis. This
                strip makes that contract explicit so KPIs here are never
                misread as the currently-selected scenario. (Static label — no
                universe resolution, no analytics dependency.) */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-1.5 text-[11px]">
                <span className="font-ui uppercase tracking-wider text-muted-lab">Scope</span>
                <span className="text-[hsl(var(--text-2))]">
                    Base list: <span className="text-[hsl(var(--accent-primary))]">Baseline reference</span> (fixed — not following active universe)
                </span>
                <span className="text-[hsl(var(--text-2))]">
                    Model columns: <span className="text-white">per-entry-model</span>
                </span>
            </div>

            <div className="mt-4">
                <WorkspaceTabBar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    hasActiveFilters={hasActiveFilters}
                />
                <GlobalFilterBar
                    filters={filters}
                    toggleSession={toggleSession}
                    toggleDirection={toggleDirection}
                    clearFilters={clearFilters}
                    hasActiveFilters={hasActiveFilters}
                />
            </div>

            <div className="mt-4">
                {activeTab === "model-analysis"     && <ModelAnalysis {...sharedProps} />}
                {activeTab === "experiment-compare" && <ExperimentCompare {...sharedProps} />}
                {activeTab === "entry-hypotheses"   && <EntryHypothesisLab exactRows={exactRows} />}
                {activeTab === "robustness"         && <RobustnessLab {...sharedProps} />}
                {activeTab === "promotion"          && <PromotionDesk {...sharedProps} />}
            </div>
        </div>
    );
}
