// FftProtectionTab — dedicated FFT Protection research surface for Protection Lab.
// FFT-IA Phase 1: scenario-specific (NOT baseline-wide). Composes the shared FFT
// display components + the existing prop-driven deep panels. All numbers come from
// useFftAnalysis (which reproduces RunDetail's computation exactly).
import React from "react";
import { getRunData } from "@/data/store";
import { TooltipProvider } from "@/components/lab/TermTip";
import { useFftAnalysis } from "@/data/useFftAnalysis";
import { FftVerdictCard } from "./FftVerdictCard";
import { FftControlStrip } from "./FftControlStrip";
import { FftWidthBreakdown } from "./FftWidthBreakdown";
import { FftActivitySummary } from "./FftActivitySummary";
import { FftCriteriaPanel } from "./FftCriteriaPanel";
import { FftProtectionPanel } from "@/components/lab/entries/model/FftProtectionPanel";
import { FftClassificationPanel } from "@/components/lab/entries/model/FftClassificationPanel";

// Parse the run's control scenario keys into selectable triggered-edge scenarios.
// Key format: "{variant}:entry_triggered_edge_{thr}p{frac}_{fillMode}".
function buildScenarioOptions(runData) {
    const map = runData?.controlTradesByScenario;
    if (!map || typeof map !== "object") return [];
    const seen = new Set();
    const opts = [];
    for (const key of Object.keys(map)) {
        const arr = map[key];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const [variant, scenarioKey = ""] = key.split(":");
        const m = scenarioKey.match(/triggered_edge_(\d+)p(\d+)_(.+)$/);
        if (!m) continue;
        const threshold = Number(`${m[1]}.${m[2]}`);
        const fillMode = m[3];
        const id = `${variant}|${threshold}|${fillMode}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const fillLabel = fillMode === "same" ? "Same Candle"
            : fillMode === "next" ? "Next Candle"
            : /^d(\d+)$/.test(fillMode) ? `Delay +${fillMode.slice(1)}`
            : fillMode;
        opts.push({ id, variant, threshold, fillMode, label: `Triggered Edge ${threshold}% · ${fillLabel}` });
    }
    // Stable order: by threshold, then same/next/dN.
    const fillRank = (f) => (f === "same" ? 0 : f === "next" ? 1 : 2);
    opts.sort((a, b) => a.threshold - b.threshold || fillRank(a.fillMode) - fillRank(b.fillMode));
    return opts;
}

export function FftProtectionTab({ runId }) {
    const runData = getRunData(runId);
    const options = React.useMemo(() => buildScenarioOptions(runData), [runData]);

    // Default to a "next" scenario if present, else the first available.
    const defaultId = (options.find((o) => o.fillMode === "next") || options[0])?.id || null;
    const [selectedId, setSelectedId] = React.useState(defaultId);
    React.useEffect(() => { setSelectedId(defaultId); }, [defaultId]);

    const selected = options.find((o) => o.id === selectedId) || options[0] || null;
    const resultView = React.useMemo(
        () => (selected ? { family: "triggered_edge", threshold: selected.threshold, fillMode: selected.fillMode } : null),
        [selected],
    );
    const fa = useFftAnalysis(runId, resultView);

    if (!runId) {
        return <div className="px-6 py-8 text-[12px] font-ui text-[hsl(var(--text-2))]">Select a run to view FFT protection analysis.</div>;
    }
    if (options.length === 0) {
        return (
            <div className="px-6 py-8 text-[12px] font-ui text-[hsl(var(--text-2))] leading-snug">
                This run has no auto-control FFT scenarios. FFT Protection analysis needs a triggered-edge run exported with its FFT-OFF control CSVs.
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={150}>
            <div className="flex flex-col gap-3">
                {/* Scope banner + scenario selector */}
                <div className="rounded-[6px] border border-[hsl(var(--accent-primary)/0.3)] bg-[hsl(var(--accent-primary)/0.06)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))]">FFT Protection</div>
                            <div className="mt-0.5 text-[11px] font-ui text-[hsl(var(--text-2))]">
                                FFT analysis is <span className="font-semibold text-[hsl(var(--text-1))]">scenario-specific, not baseline-wide</span>.
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-[11px] font-ui text-[hsl(var(--text-2))]">
                            Scenario
                            <select
                                value={selected?.id || ""}
                                onChange={(e) => setSelectedId(e.target.value)}
                                className="px-2 py-1 rounded-[3px] text-[11px] font-ui bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] text-[hsl(var(--text-1))]"
                            >
                                {options.map((o) => (
                                    <option key={o.id} value={o.id}>{o.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {fa?.scenarioLabel && (
                        <div className="mt-2 text-[12px] font-ui text-[hsl(var(--text-1))]">{fa.scenarioLabel}</div>
                    )}
                </div>

                {fa && fa.fftCancels === 0 ? (
                    <div className="px-1 py-4 text-[12px] font-ui text-[hsl(var(--text-2))]">
                        No FFT cancels in this scenario.
                    </div>
                ) : fa ? (
                    <>
                        {/* Verdict */}
                        {fa.hasPaired ? (
                            <FftVerdictCard
                                strategyDeltaR={fa.strategyDeltaR}
                                strategyDeltaPnl={fa.strategyDeltaPnl}
                                verdictTone={fa.verdictTone}
                                verdictText={fa.verdictText}
                                controlNetR={fa.controlMetrics.netR}
                                onNetR={fa.onMetrics.netR}
                                accountModeEnabled={fa.accountModeEnabled}
                                accountCurrency={fa.accountCurrency}
                                isAllowMulti={fa.isAllowMulti}
                            />
                        ) : (
                            <div className="rounded-[6px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-4 py-3 text-[11px] font-ui text-[hsl(var(--text-2))] italic">
                                FFT-OFF control unavailable for this scenario — verdict and OFF/ON comparison hidden.
                            </div>
                        )}

                        {/* OFF vs ON mini-strips */}
                        {fa.hasPaired && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                <FftControlStrip title="Control (FFT OFF)" subtitle="Same configuration with FFT disabled"
                                    tooltip="This is the exact same strategy configuration with FFT disabled — same symbol, date range, entry model, arm mode, sessions, news, risk settings, and variant."
                                    metrics={fa.controlMetrics} sanityRows={fa.controlSanityRows}
                                    accountModeEnabled={fa.accountModeEnabled} accountCurrency={fa.accountCurrency} tone="muted" />
                                <FftControlStrip title="Strategy (FFT ON)" subtitle="Selected result view with FFT enabled"
                                    metrics={fa.onMetrics} sanityRows={fa.onSanityRows}
                                    accountModeEnabled={fa.accountModeEnabled} accountCurrency={fa.accountCurrency} tone="accent" />
                            </div>
                        )}

                        {/* Active FFT criteria */}
                        <FftCriteriaPanel criteria={fa.criteria} />

                        {/* Activity + counterfactual */}
                        <div className="rounded-[6px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-4 py-3.5">
                            <FftActivitySummary fft={fa.fft} paired={fa.paired} fftBuckets={fa.fftBuckets} />
                        </div>

                        {/* Width breakdown */}
                        {fa.hasPaired && (
                            <FftWidthBreakdown pairs={fa.paired.pairs} onPerf={fa.onPerf} offPerf={fa.offPerf} />
                        )}

                        {/* Deep panels (existing, prop-driven) */}
                        <FftProtectionPanel trades={fa.onTrades} offTrades={fa.offTrades} />
                        <FftClassificationPanel trades={fa.onTrades} offTrades={fa.offTrades} />
                    </>
                ) : null}
            </div>
        </TooltipProvider>
    );
}
