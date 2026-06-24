import React from "react";
import { getScenarioBaselineUniverse } from "@/data/store";
import { summarizeTradeClassifications } from "@/data/tradeClassification";

// ── Fair Baseline comparison (Session-First P2.5) ────────────────────────────────
// Run Workspace–only, read-only "Custom Strategy vs Fair Baseline" KPI card. It reads
// the backend Fair Baseline output via getScenarioBaselineUniverse(runId) — a PARALLEL
// universe that is never the selected Result View and never mixes into the custom
// universe. KPI trio only (Net R / Trades / Win rate); no equity-curve comparison yet.
//
// Props:
//   runId        — the active run id (string)
//   customTrades — the SELECTED custom-universe trades (selectedUniverseTrades)
//   customLabel  — label for the custom side (e.g. universe.label); defaults "Custom Strategy"

const fmtR = (v) => (v == null || !isFinite(Number(v)) ? "—" : `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`);
const fmtPct = (v) => (v == null || !isFinite(Number(v)) ? "—" : `${Number(v).toFixed(1)}%`);
const fmtInt = (v) => (v == null || !isFinite(Number(v)) ? "—" : String(Math.round(Number(v))));

function describeBaselineBe(be) {
    if (be == null || be === "none") return "None";
    if (typeof be === "object") {
        const trig = be.trigger || "wick";
        const arm = be.arm_r ?? be.armR;
        return arm != null ? `${trig} ${Number(arm)}R` : trig;
    }
    return String(be);
}

function describeBaselineTp(rr) {
    if (rr == null || !isFinite(Number(rr))) return "Run nominal";
    return `${Number(rr)}R`;
}

function KpiCol({ label, netR, trades, winRate, tone }) {
    const accent = tone === "baseline" ? "text-[hsl(var(--text-2))]" : "text-[hsl(var(--text))]";
    return (
        <div className="flex-1 min-w-[120px]">
            <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab leading-snug mb-2">{label}</div>
            <div className="grid grid-cols-1 gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Net R</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${accent}`}>{fmtR(netR)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Trades</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${accent}`}>{fmtInt(trades)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] font-ui uppercase tracking-widest text-muted-lab">Win rate</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${accent}`}>{fmtPct(winRate)}</span>
                </div>
            </div>
        </div>
    );
}

export default function FairBaselineComparison({ runId, customTrades = [], customLabel = "Custom Strategy" }) {
    const baseline = getScenarioBaselineUniverse(runId);
    const customStats = summarizeTradeClassifications(Array.isArray(customTrades) ? customTrades : []);

    // ── Empty state (old runs / no baseline_comparison emitted) ──────────────────
    if (!baseline || !baseline.available) {
        return (
            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm p-3">
                <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab leading-snug">Custom vs Fair Baseline</div>
                <div className="mt-2 text-[11px] leading-relaxed text-muted-lab">
                    No Fair Baseline output for this run. Enable a Fair Baseline comparison in the run
                    config (<span className="font-mono text-[10px]">baseline_comparison</span>) to compare the custom
                    strategy against a same-universe baseline.
                </div>
            </div>
        );
    }

    const p = baseline.provenance || {};
    const baselineStats = baseline.stats || summarizeTradeClassifications(baseline.trades || []);
    const riskWarn = (baseline.warnings || []).find((w) => /risk_reduction/i.test(String(w)));

    return (
        <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] font-ui uppercase tracking-widest text-muted-lab leading-snug">Custom vs Fair Baseline</div>
                <div className="shrink-0 text-[9px] font-ui uppercase tracking-widest text-muted-lab">
                    {p.mode === "eligible" ? "Eligible universe" : (p.mode || "")}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
                <KpiCol
                    label={customLabel || "Custom Strategy"}
                    netR={customStats.netRPerformance}
                    trades={customStats.performanceTrades}
                    winRate={customStats.winRate}
                    tone="custom"
                />
                <div className="self-stretch w-px bg-[hsl(var(--border-soft)/0.6)] hidden sm:block" />
                <KpiCol
                    label="Fair Baseline"
                    netR={baselineStats.netRPerformance}
                    trades={baselineStats.performanceTrades}
                    winRate={baselineStats.winRate}
                    tone="baseline"
                />
            </div>

            {/* Provenance row */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 font-ui text-[10.5px]">
                <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-lab">Baseline TP</div>
                    <div className="mt-0.5 tabular-nums text-[hsl(var(--text-2))]">{describeBaselineTp(p.baseline_target_rr)}</div>
                </div>
                <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-lab">Baseline BE</div>
                    <div className="mt-0.5 text-[hsl(var(--text-2))]">{describeBaselineBe(p.baseline_be)}</div>
                </div>
                <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-lab">Eligible cohorts</div>
                    <div className="mt-0.5 tabular-nums text-[hsl(var(--text-2))]">{fmtInt(p.eligible_cohort_count)}</div>
                </div>
            </div>

            {riskWarn ? (
                <div className="mt-3 border border-[hsl(var(--warn)/0.4)] bg-[hsl(var(--warn)/0.08)] clip-bevel-sm px-2.5 py-1.5 text-[10px] leading-snug text-[hsl(var(--warn))]">
                    {String(riskWarn)}
                </div>
            ) : null}

            <div className="mt-3 text-[10px] leading-relaxed text-muted-lab">
                Same eligible cohort universe, baseline entry — a fair comparison, not a portfolio/union equity curve.
            </div>
        </div>
    );
}
