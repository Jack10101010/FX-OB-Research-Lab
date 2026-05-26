import React, { useEffect, useMemo } from "react";
import { useDataset }              from "@/data/store";
import { NeonPanel }               from "@/components/lab/NeonPanel";
import { Pill }                    from "@/components/lab/DataTable";
import { RunSelectorBar }          from "./RunSelectorBar";
import { EntryDeltaTable }         from "./EntryDeltaTable";
import { ExperimentEquityOverlay } from "./ExperimentEquityOverlay";
import { useLocalStorageState }    from "../shared/useEntryWorkspace";

export function ExperimentCompare({ activeRun, activeVariant }) {
    const { RUNS: runs = [], getRunData } = useDataset();
    const fullRuns = useMemo(() => {
        return runs.map((run) => normalizeEntryRun(getRunData?.(run.id) || run));
    }, [runs, getRunData]);

    const [selectedRunIds, setSelectedRunIds] = useLocalStorageState("fxob_entries_workspace_compare_selected_runs_v1", []);
    const selectedIds = Array.isArray(selectedRunIds) ? selectedRunIds : [];

    const selectedRuns = useMemo(() => {
        return selectedIds
            .map(id => normalizeEntryRun(getRunData?.(id) || fullRuns.find(r => r.id === id)))
            .filter(Boolean);
    }, [selectedIds, fullRuns, getRunData]);

    const runsWithEntries = fullRuns.filter(hasEntrySummary);

    useEffect(() => {
        const available = new Set(runsWithEntries.map(run => run.id));
        const valid = selectedIds.filter(id => available.has(id));
        if (!valid.length && activeRun?.id && available.has(activeRun.id)) {
            setSelectedRunIds([activeRun.id]);
        } else if (valid.length !== selectedIds.length) {
            setSelectedRunIds(valid);
        }
    }, [activeRun?.id, runsWithEntries, selectedIds, setSelectedRunIds]);

    return (
        <div className="space-y-4">

            {/* Summary */}
            <NeonPanel title="Experiment Compare" className="xl:col-span-3"
                action={
                    <div className="flex gap-1.5">
                        <Pill tone="secondary">{runsWithEntries.length} RUNS WITH ENTRY DATA</Pill>
                        {selectedRuns.length > 0 && (
                            <Pill tone="success">{selectedRuns.length} SELECTED</Pill>
                        )}
                    </div>
                }
            >
                <p className="mb-3 text-[10px] font-mono text-muted-lab">
                    Compare entry model performance across multiple runs — different date ranges, symbols, or parameter sets.
                    Select up to 4 runs. Deltas are computed relative to your chosen base.
                </p>
                <RunSelectorBar
                    runs={runsWithEntries}
                    selectedRunIds={selectedIds}
                    setSelectedRunIds={setSelectedRunIds}
                />
            </NeonPanel>

            {/* Delta table */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <EntryDeltaTable selectedRuns={selectedRuns} />
            </div>

            {/* Equity overlay */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ExperimentEquityOverlay
                    selectedRuns={selectedRuns}
                    activeVariant={activeVariant}
                />
            </div>

        </div>
    );
}

function normalizeEntryRun(run) {
    if (!run) return null;
    const entryResults = resolveEntryResults(run);
    return { ...run, entryResults };
}

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

function hasEntrySummary(run) {
    const summary = run?.entryResults?.summary;
    const tradesByMode = run?.entryResults?.tradesByMode || run?.entryResults?.trades_by_mode;
    return !!(
        (summary && typeof summary === "object" && Object.keys(summary).length)
        || (tradesByMode && typeof tradesByMode === "object" && Object.keys(tradesByMode).length)
    );
}
