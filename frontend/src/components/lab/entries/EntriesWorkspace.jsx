import React, { useMemo } from "react";
import { useDataset } from "@/data/store";
import { extractOffTrades } from "@/data/fftPairingResolver";
import { computePairedFftAnalytics } from "@/data/fftPairingAnalytics";
import { useEntryWorkspace, useModelSelectionGuard } from "./shared/useEntryWorkspace";
import { WorkspaceTabBar } from "./shared/WorkspaceTabBar";
import { GlobalFilterBar } from "./shared/GlobalFilterBar";
import { EntryWorkspaceHeader } from "./shared/EntryWorkspaceHeader";
import ResearchContextBanner from "@/components/lab/ResearchContextBanner";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
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
    const { ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs, getRunData } = useDataset();
    const trades     = useMemo(() => Array.isArray(TRADES) ? TRADES : EMPTY_TRADES, [TRADES]);
    const activeRun  = activeRunId ? runs?.[activeRunId] : null;

    const pairedFftOffRunId = activeRun?.pairedFftOffRunId ?? null;
    const pairedOffBundle   = pairedFftOffRunId ? getRunData?.(pairedFftOffRunId) : null;

    const {
        activeTab, setActiveTab,
        filters, toggleSession, toggleDirection, clearFilters, hasActiveFilters, applyFilters,
        colVis, setColVis,
        selectedModelKey, setSelectedModelKey,
        TABS,
    } = useEntryWorkspace();

    // Paired FFT-OFF trades: prefer the active run's built-in auto-control trades
    // (priority 0, keyed by `${variant}:${scenario}`), then fall back to a
    // manually-selected FFT-OFF run. selectedModelKey identifies the active scenario.
    const offTrades = useMemo(
        () => extractOffTrades(activeRun, pairedOffBundle, ACTIVE_TRADE_VARIANT, selectedModelKey),
        [activeRun, pairedOffBundle, ACTIVE_TRADE_VARIANT, selectedModelKey],
    );

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

    // Selectable model keys for THIS run (what selectedModelKey is matched against
    // across the workspace) and the subset that has a built-in FFT-OFF control.
    const availableModelKeys = useMemo(
        () => (exactRows || []).filter((r) => r && !r.isBaseline && r.mode).map((r) => r.mode),
        [exactRows],
    );
    const controlBackedKeys = useMemo(() => {
        const map = activeRun?.controlTradesByScenario || {};
        return Object.keys(map)
            .filter((k) => Array.isArray(map[k]) && map[k].length > 0)
            // keys are `${variant}:${scenarioKey}` — strip the variant prefix.
            .map((k) => (k.includes(":") ? k.slice(k.indexOf(":") + 1) : k));
    }, [activeRun]);

    // Reconcile a stale persisted selection (e.g. a `..._d2` key carried over from
    // a previous run) against this run's actual models so FFT auto-control resolves.
    useModelSelectionGuard({
        runId: activeRunId,
        availableModelKeys,
        controlBackedKeys,
        selectedModelKey,
        setSelectedModelKey,
    });

    const summary = useMemo(() => buildExactSummary(exactRows), [exactRows]);

    const analytics = useMemo(
        () => buildEntryAnalytics(filteredTrades, exactRows),
        [filteredTrades, exactRows],
    );

    const tradesByMode = entryResults.tradesByMode || {};

    // FFT panels need the *active scenario* trades (where first_failed_tag cancels
    // live), not the base ACTIVE_TRADE_VARIANT list. Resolve the same scenario
    // source RunDetail uses (entryResults.tradesByMode keyed by selectedModelKey),
    // apply the global filters, and fall back to filteredTrades for older runs or
    // when no scenario is selected.
    const fftTrades = useMemo(() => {
        const tbm = tradesByMode || {};
        const scenarioTrades = selectedModelKey
            ? (tbm[`${ACTIVE_TRADE_VARIANT}__${selectedModelKey}`] || tbm[selectedModelKey])
            : null;
        return scenarioTrades && scenarioTrades.length
            ? applyFilters(scenarioTrades)
            : filteredTrades;
    }, [tradesByMode, selectedModelKey, ACTIVE_TRADE_VARIANT, applyFilters, filteredTrades]);

    // Per-row FFT paired-impact summaries for the Exact Results table.
    // EXACT-KEY control lookup only (no extractOffTrades/resolveAutoControlTrades —
    // their single-control fallback could attach the wrong control to another row).
    const fftByMode = useMemo(() => {
        const out = {};
        const tbm = tradesByMode || {};
        const ctrl = activeRun?.controlTradesByScenario;
        if (!ctrl || typeof ctrl !== "object") return out;
        for (const row of exactRows) {
            const mode = row?.mode;
            if (!mode) continue;
            const controlTrades = ctrl[`${ACTIVE_TRADE_VARIANT}:${mode}`];
            if (!Array.isArray(controlTrades) || controlTrades.length === 0) continue;
            const scenarioTrades = applyFilters(
                tbm[`${ACTIVE_TRADE_VARIANT}__${mode}`] || tbm[mode] || [],
            );
            const p = computePairedFftAnalytics(scenarioTrades, controlTrades);
            if (p.fftCancels > 0) {
                out[mode] = {
                    fftCancels: p.fftCancels,
                    netRImpact: p.confirmedNetRImpact,
                    winnersRemoved: p.confirmedWinsRemoved,
                    lossesAvoided: p.confirmedLossesAvoided,
                    lowConf: p.lowConfCount,
                    highConf: p.highConfCount,
                };
            }
        }
        return out;
    }, [exactRows, tradesByMode, activeRun, ACTIVE_TRADE_VARIANT, applyFilters]);

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
        offTrades,
        fftTrades,
        fftByMode,
    };

    return (
        <div className="pb-16">
            <EntryWorkspaceHeader
                trades={filteredTrades}
                activeVariant={ACTIVE_TRADE_VARIANT}
                exactRows={exactRows}
            />

            {/* RESEARCH-RESULT-VIEW-BANNER: multi-model page → truthful CONTEXT banner
                (NOT "Current Result View" — this page compares many entry models).
                Shows run identity + symbol/TF + date range + the comparison scope. */}
            {activeRun && (
                <div className="px-6 mt-2 mb-1">
                    <ResearchContextBanner
                        run={buildBannerRunIdentity(activeRun)}
                        tone={availableModelKeys.length > 0 ? "context" : "baseline"}
                        scopeTitle="Entry Model Comparison"
                        scopeSummary={
                            availableModelKeys.length > 0
                                ? `Comparing ${availableModelKeys.length} entry model${availableModelKeys.length === 1 ? "" : "s"} vs baseline`
                                : "Baseline only — no entry-model variants in this run"
                        }
                        facts={[
                            { label: "Models", value: availableModelKeys.length },
                            { label: "Variant", value: ACTIVE_TRADE_VARIANT || "Primary" },
                        ]}
                        chipsLabel="Models"
                        chips={(exactRows || []).map((r) => r.label || r.mode).filter(Boolean)}
                    />
                </div>
            )}

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
