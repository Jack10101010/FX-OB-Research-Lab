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
import { TriggeredEdgeFunnelPanel } from "./TriggeredEdgeFunnelPanel";
import { SameNextCandlePanel }    from "./SameNextCandlePanel";
import { CancelReasonPanel }      from "./CancelReasonPanel";
import { GhostOutcomePanel }      from "./GhostOutcomePanel";
import { FftProtectionPanel }     from "./FftProtectionPanel";
import { DirectionalScenariosPanel } from "./DirectionalScenariosPanel";
import { buildAllModelCurves }    from "../analytics/equityCurveAnalytics";
import { PROFILE_KEYS }           from "../analytics/entryRegistry";

// ── TierDivider ───────────────────────────────────────────────────────────────
// Lightweight horizontal rule with centered label. Signals a shift in analytical
// depth — subtle enough not to add visual noise but clear enough to aid scanning.

function TierDivider({ label, sub }) {
    return (
        <div className="flex items-center gap-4 py-1">
            <div className="flex-1 border-t border-[hsl(var(--border-soft)/0.28)]" />
            <div className="flex flex-col items-center gap-px">
                <span className="text-[8px] font-ui uppercase tracking-[0.38em] text-muted-lab opacity-50 px-2">
                    {label}
                </span>
                {sub && (
                    <span className="text-[7px] font-ui text-muted-lab opacity-30 tracking-wider px-2">
                        {sub}
                    </span>
                )}
            </div>
            <div className="flex-1 border-t border-[hsl(var(--border-soft)/0.28)]" />
        </div>
    );
}

// ── ResearchShell ─────────────────────────────────────────────────────────────
// Container for the Advanced Research tier. Open by default, collapsible.
// Dashed border + reduced fill signal "lab / draft / exploratory" rather than
// primary decision surfaces. Lowers cognitive pressure without hiding content.

function ResearchShell({ children }) {
    const [open, setOpen] = React.useState(true);
    return (
        <div>
            {/* Section header / toggle */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 group mb-4 outline-none"
            >
                <div className="flex-1 border-t border-dashed border-[hsl(var(--border-soft)/0.35)]" />
                <div className="flex items-center gap-2.5 px-5 py-2.5 border border-dashed border-[hsl(var(--border-soft)/0.45)] bg-[hsl(var(--panel)/0.5)] group-hover:bg-[hsl(var(--panel-2)/0.6)] transition-colors">
                    <div className="text-left">
                        <div className="text-[9px] font-ui uppercase tracking-[0.3em] text-muted-lab group-hover:text-white transition-colors">
                            Advanced Research
                        </div>
                        <div className="text-[7.5px] font-ui text-muted-lab opacity-40 tracking-wider mt-0.5">
                            deep analysis · lab notes · experimental
                        </div>
                    </div>
                    <span className="text-[11px] text-muted-lab opacity-60 ml-1.5 group-hover:opacity-90 transition-opacity">
                        {open ? "▾" : "▸"}
                    </span>
                </div>
                <div className="flex-1 border-t border-dashed border-[hsl(var(--border-soft)/0.35)]" />
            </button>

            {open && (
                <div className="border border-dashed border-[hsl(var(--border-soft)/0.28)] bg-[hsl(var(--panel)/0.18)] px-4 pt-4 pb-2 space-y-4">
                    {children}
                </div>
            )}
        </div>
    );
}

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

    // Ghost data presence check — drives Trigger Behavior tier visibility.
    const hasGhostData = useMemo(() => {
        return (trades || []).some(t => t?.ghost_candidate === true);
    }, [trades]);

    // FFT cancel presence check — drives FftProtectionPanel visibility.
    // Checks cancel_reason (camelCase + snake_case) and outcome string.
    const hasFftCancels = useMemo(() => {
        return (trades || []).some(t => {
            const cr = String(t?.cancel_reason ?? t?.cancelReason ?? "").toLowerCase();
            if (cr === "first_failed_tag") return true;
            const oc = String(t?.outcome ?? "").toUpperCase();
            return oc === "FIRST_FAILED_TAG_CANCEL";
        });
    }, [trades]);

    // Phase 2: Lifecycle row — controls Tier 1.5 visibility.
    //
    // Three-way selection rule:
    //   (a) selectedModelKey set + row IS lifecycle  → return that row (panels show, scoped to selection)
    //   (b) selectedModelKey set + row NOT lifecycle → return null    (panels hidden — no context bleed)
    //   (c) no selectedModelKey                      → return first lifecycle row if any (default context)
    //
    // This prevents Baseline / Penetration selections from bleeding into the lifecycle panels.
    const lifecycleRow = useMemo(() => {
        const rows = exactRows || [];
        const isLifecycle = r =>
            r.exact && (
                r.metricsProfile === PROFILE_KEYS.TRIGGERED_EDGE ||
                r.requiresLifecycleFunnel === true
            );
        if (selectedModelKey) {
            // Case (a) / (b): honour the explicit selection — no fallback.
            const selectedRow = rows.find(r => r.mode === selectedModelKey);
            return selectedRow && isLifecycle(selectedRow) ? selectedRow : null;
        }
        // Case (c): nothing selected — use first lifecycle row as default context.
        return rows.find(isLifecycle) || null;
    }, [exactRows, selectedModelKey]);

    return (
        <div className="space-y-4">

            {/* KPI strip for selected / best model */}
            <ModelKPIStrip
                exactRows={exactRows || []}
                selectedModelKey={selectedModelKey}
                setSelectedModelKey={setSelectedModelKey}
            />

            {/* ════════════════════════════════════════════════════════════
                CORE MODEL RESULTS
                Primary decision surface: exact simulation results + lifecycle.
                ════════════════════════════════════════════════════════════ */}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <ExactResultsPanel
                    exactRows={exactRows || []}
                    colVis={colVis}
                    setColVis={setColVis}
                    selectedModelKey={selectedModelKey}
                    setSelectedModelKey={setSelectedModelKey}
                />
            </div>

            {/* Lifecycle funnel panels — triggered-edge only.
                Non-triggered datasets see nothing here — no empty space. */}
            {lifecycleRow && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <TriggeredEdgeFunnelPanel row={lifecycleRow} />
                    <SameNextCandlePanel
                        row={lifecycleRow}
                        exactRows={exactRows || []}
                    />
                    <CancelReasonPanel row={lifecycleRow} />
                </div>
            )}

            {/* Trigger Behavior tier — ghost outcomes + FFT protection analytics.
                Shown when:
                  (a) we are in a triggered-edge lifecycle context AND
                  (b) either ghost_candidate trades OR FFT cancels are present.
                Phase 0: observational data only — no cancellation logic. */}
            {lifecycleRow && (hasGhostData || hasFftCancels) && (
                <>
                    <TierDivider
                        label="Trigger Behavior"
                        sub="Ghost outcomes · FFT protection analytics · observational only"
                    />
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        {hasGhostData && <GhostOutcomePanel trades={trades} />}
                        {hasFftCancels && <FftProtectionPanel trades={trades} />}
                    </div>
                </>
            )}

            {/* ── Backend Directional Scenarios ─────────────────────────── */}
            {/* Shown only when directional results exist. Fully independent of
                PLANNED_ENTRY_MODES and the ExactResultsPanel row set. */}
            {activeRun?.directionalResults && (
                <div className="grid grid-cols-1 gap-4">
                    <DirectionalScenariosPanel activeRun={activeRun} />
                </div>
            )}

            {/* ── Section divider ───────────────────────────────────────── */}
            <TierDivider
                label="Decision Analytics"
                sub="Equity · Direction · Session · MAE / MFE"
            />

            {/* ════════════════════════════════════════════════════════════
                DECISION ANALYTICS
                Performance breakdown, directional edge, session patterns.
                ════════════════════════════════════════════════════════════ */}

            {/* Equity curve + Trade-off */}
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

            {/* MAE/MFE + Direction asymmetry + Session matrix */}
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

            {/* Sensitivity + Pareto */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <SensitivityPanel exactRows={exactRows || []} />
                <ParetoPanel      exactRows={exactRows || []} />
            </div>

            {/* ════════════════════════════════════════════════════════════
                ADVANCED RESEARCH
                Deeper comparison tools, model lifecycle, backlog.
                Visually recessed — still accessible, lower cognitive pressure.
                ════════════════════════════════════════════════════════════ */}
            <ResearchShell>

                {/* Dominance matrix */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <DominanceMatrix exactRows={exactRows || []} />
                </div>

                {/* Timing / toxicity heatmaps (conditional) */}
                {analytics?.timingGrid && (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <TimingHeatmapPanel   grid={analytics.timingGrid} />
                        <ToxicityHeatmapPanel grid={analytics.toxicityGrid} />
                    </div>
                )}

                {/* Trade diff explorer */}
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

                {/* Entry model lifecycle + future ideas + research backlog */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <LifecyclePanel />
                    <FutureModelsPanel />
                    <ResearchBacklogPanel />
                </div>

            </ResearchShell>

        </div>
    );
}
