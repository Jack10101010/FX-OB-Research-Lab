import React, { useMemo } from "react";
import { ModelKPIStrip }          from "./ModelKPIStrip";
import { ExactResultsPanel }      from "./ExactResultsPanel";
import { EquityCurvePanel }       from "./EquityCurvePanel";
import { MaeAnalyticsPanel }      from "./MaeAnalyticsPanel";
import { TradeOffPanel }          from "./TradeOffPanel";
import { DirectionPanel }         from "./DirectionPanel";
import { SessionMatrixPanel }     from "./SessionMatrixPanel";
import { SensitivityPanel }       from "./SensitivityPanel";
import { ParetoPanel }            from "./ParetoPanel";
import { DominanceMatrix }        from "./DominanceMatrix";
import { TimingHeatmapPanel, ToxicityHeatmapPanel } from "./HeatmapPanels";
import { TradeDiffExplorer }      from "./TradeDiffExplorer";
import { LifecyclePanel, FutureModelsPanel, ResearchBacklogPanel } from "./LifecycleBacklogPanels";
import { buildAllModelCurves }    from "../analytics/equityCurveAnalytics";

export function ModelAnalysis({
    trades,
    rawTrades,
    exactRows,
    summary,
    analytics,
    tradesByMode,
    activeRun,
    activeVariant,
    colVis,
    setColVis,
    selectedModelKey,
    setSelectedModelKey,
    filters,
}) {
    // Build equity curves only when tradesByMode is available
    const curvesData = useMemo(() => {
        if (!tradesByMode || !exactRows?.length) return null;
        return buildAllModelCurves(exactRows, tradesByMode, activeVariant);
    }, [exactRows, tradesByMode, activeVariant]);

    // Resolve which model's trades to pass for per-model panels
    const nonBaselineRows = (exactRows || []).filter(r => r.exact && !r.isBaseline);

    return (
        <div className="space-y-4">

            {/* KPI strip for selected / best model */}
            <ModelKPIStrip
                exactRows={exactRows || []}
                selectedModelKey={selectedModelKey}
                setSelectedModelKey={setSelectedModelKey}
            />

            {/* ── Tier 1: Core results ─────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ExactResultsPanel
                    exactRows={exactRows || []}
                    colVis={colVis}
                    setColVis={setColVis}
                    selectedModelKey={selectedModelKey}
                    setSelectedModelKey={setSelectedModelKey}
                />
            </div>

            {/* ── Tier 2: Equity + Trade-off ───────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <EquityCurvePanel
                    exactRows={exactRows || []}
                    curvesData={curvesData}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                />
                <TradeOffPanel
                    exactRows={exactRows || []}
                    rawTrades={rawTrades || []}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                />
            </div>

            {/* ── Tier 3: MAE/MFE + Direction + Session ────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <MaeAnalyticsPanel
                    exactRows={exactRows || []}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                />
                <DirectionPanel
                    exactRows={exactRows || []}
                    trades={rawTrades || []}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                />
                <SessionMatrixPanel
                    exactRows={exactRows || []}
                    trades={rawTrades || []}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                />
            </div>

            {/* ── Tier 4: Sensitivity + Pareto ─────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <SensitivityPanel exactRows={exactRows || []} />
                <ParetoPanel      exactRows={exactRows || []} />
            </div>

            {/* ── Tier 5: Dominance matrix ──────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <DominanceMatrix exactRows={exactRows || []} />
            </div>

            {/* ── Tier 6: Timing heatmaps ───────────────────────────────── */}
            {analytics?.timingGrid && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <TimingHeatmapPanel   grid={analytics.timingGrid} />
                    <ToxicityHeatmapPanel grid={analytics.toxicityGrid} />
                </div>
            )}

            {/* ── Tier 7: Trade diff explorer ──────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <TradeDiffExplorer
                    exactRows={exactRows || []}
                    rawTrades={rawTrades || []}
                    tradesByMode={tradesByMode}
                    activeVariant={activeVariant}
                    selectedModelKey={selectedModelKey}
                    setSelectedModelKey={setSelectedModelKey}
                />
            </div>

            {/* ── Tier 8: Lifecycle + Backlog ───────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <LifecyclePanel />
                <FutureModelsPanel />
                <ResearchBacklogPanel />
            </div>

        </div>
    );
}
