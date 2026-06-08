import React, { useMemo } from "react";
import { ChevronRight }        from "lucide-react";
import { NeonPanel }            from "@/components/lab/NeonPanel";
import { Pill }                 from "@/components/lab/DataTable";
import { cn }                   from "@/lib/utils";
import { RollingMetricsPanel }  from "./RollingMetricsPanel";
import { ConfidencePanel }      from "./ConfidencePanel";
import {
    buildRollingMetrics,
    buildMonthlyStability,
    buildHalfSplitConsistency,
    buildOutlierDependency,
    calcRobustnessScore,
} from "../analytics/robustnessAnalytics";
import { isFiniteNumber, num } from "../analytics/entryFormatters";
import { LOW_SAMPLE_N } from "../analytics/entryRegistry";

const ROLLING_WINDOW = 20;

// ── Verdict (UI-layer decision support) ───────────────────────────────────────
// Composes ALREADY-COMPUTED per-model signals into a plain-language trust verdict.
// No new statistics and no threshold changes: it reuses the existing robustness
// score bands (70 / 45), the LOW_SAMPLE_N sample floor, the half-split `stable`
// flag, the outlier `risk` standing, and `deltaVsBaseline`. Pure presentation —
// analytics are untouched.
const VERDICT_TOKEN = {
    success:   "--success",
    warning:   "--warning",
    danger:    "--danger",
    secondary: "--accent-secondary",
    muted:     "--text-2",
};

function deriveVerdict({ score, trades, stable, outlierRisk, delta, hasTradeData }) {
    if (!hasTradeData)               return { key: "unknown",    label: "Not enough info", tone: "muted",     reason: "No trade-level data loaded",     action: "Load this model's trade file" };
    if (trades < LOW_SAMPLE_N)       return { key: "needs",      label: "Needs more data", tone: "secondary", reason: `Only ${trades} trades so far`,   action: "Gather more trades" };
    if (outlierRisk === "HIGH")      return { key: "fragile",    label: "Fragile",         tone: "danger",    reason: "Driven by a few big trades",     action: "Don't size up — investigate" };
    if (stable === false)            return { key: "fragile",    label: "Fragile",         tone: "danger",    reason: "Edge breaks between halves",     action: "Don't size up — investigate" };
    if (delta != null && delta <= 0) return { key: "reject",     label: "Reject",          tone: "danger",    reason: "No edge vs baseline",            action: "Drop it" };
    if (score != null && score >= 70) return { key: "ready",     label: "Trade-ready",     tone: "success",   reason: "Strong, stable, beats baseline", action: "Candidate for promotion" };
    if (score != null && score >= 45) return { key: "promising", label: "Promising",       tone: "warning",   reason: "Some edge; keep validating",     action: "Keep trading small; gather more" };
    return                                  { key: "reject",     label: "Reject",          tone: "danger",    reason: "Weak overall score",             action: "Drop it" };
}

function resolveModelTrades(mode, tradesByMode, activeVariant) {
    if (!tradesByMode || !mode) return null;
    const modeKey = String(mode).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return tradesByMode[`${activeVariant}__${modeKey}`] || tradesByMode[modeKey] || null;
}

export function RobustnessLab({
    exactRows,
    rawTrades,
    tradesByMode,
    activeRun,
    activeVariant,
    selectedModelKey,
    setSelectedModelKey,
}) {
    const nonBaselineRows = (exactRows || []).filter(r => r.exact && !r.isBaseline);
    const selected = selectedModelKey || nonBaselineRows[0]?.mode || null;
    const selectedRow = (exactRows || []).find(r => r.mode === selected);

    const modeTrades = useMemo(() => resolveModelTrades(selected, tradesByMode, activeVariant), [selected, tradesByMode, activeVariant]);

    const rollingData = useMemo(() => {
        if (!modeTrades?.length) return null;
        return buildRollingMetrics(modeTrades, ROLLING_WINDOW);
    }, [modeTrades]);

    const halfSplitData = useMemo(() => {
        if (!nonBaselineRows.length || !tradesByMode) return [];
        return nonBaselineRows.map(row => {
            const trades = resolveModelTrades(row.mode, tradesByMode, activeVariant);
            if (!trades?.length) return null;
            const hs = buildHalfSplitConsistency(trades);
            if (!hs) return null;
            return {
                mode:          row.mode,
                label:         row.label,
                firstHalfExp:  hs.first.expectancy,
                secondHalfExp: hs.last.expectancy,
                stable:        hs.stable,
                wrDelta:       hs.wrDelta,
            };
        }).filter(Boolean);
    }, [nonBaselineRows, tradesByMode, activeVariant]);

    const robustnessScores = useMemo(() => {
        if (!nonBaselineRows.length || !tradesByMode) return [];
        return nonBaselineRows.map(row => {
            const trades = resolveModelTrades(row.mode, tradesByMode, activeVariant);
            const outlier = trades?.length ? buildOutlierDependency(trades) : null;
            const score = calcRobustnessScore(row, outlier);
            return { mode: row.mode, label: row.label, score };
        });
    }, [nonBaselineRows, tradesByMode, activeVariant]);

    // Outlier dependency per model — surfaces the already-computed
    // buildOutlierDependency output (top-5 share of Net R + risk standing) so the
    // ConfidencePanel can render it. No analytics change; container-level wiring only.
    const outlierData = useMemo(() => {
        if (!nonBaselineRows.length || !tradesByMode) return [];
        return nonBaselineRows.map(row => {
            const trades = resolveModelTrades(row.mode, tradesByMode, activeVariant);
            if (!trades?.length) return null;
            const o = buildOutlierDependency(trades);
            if (!o) return null;
            return {
                mode:            row.mode,
                label:           row.label,
                top5Pct:         o.top5Pct,
                withoutBestNetR: o.withoutBestNetR,
                totalNetR:       o.totalNetR,
                risk:            o.outlierRisk,
            };
        }).filter(Boolean);
    }, [nonBaselineRows, tradesByMode, activeVariant]);

    // Per-model verdict — joins the already-computed signals and ranks by trust.
    const verdicts = useMemo(() => {
        const scoreByMode = Object.fromEntries((robustnessScores || []).map(r => [r.mode, r.score]));
        const hsByMode    = Object.fromEntries((halfSplitData || []).map(r => [r.mode, r]));
        const olByMode    = Object.fromEntries((outlierData || []).map(r => [r.mode, r]));
        return nonBaselineRows.map(row => {
            const score = scoreByMode[row.mode] ?? null;
            const hs    = hsByMode[row.mode] || null;
            const ol    = olByMode[row.mode] || null;
            const trades = Number(row.trades ?? row.fills ?? 0) || 0;
            const delta  = isFiniteNumber(row.deltaVsBaseline) ? num(row.deltaVsBaseline) : null;
            const hasTradeData = !!hs || !!ol || score != null;
            const verdict = deriveVerdict({ score, trades, stable: hs?.stable, outlierRisk: ol?.risk, delta, hasTradeData });
            return { mode: row.mode, label: row.label, score, trades, delta, verdict };
        }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }, [nonBaselineRows, robustnessScores, halfSplitData, outlierData]);

    const selectedVerdict = verdicts.find(v => v.mode === selected) || null;
    const bestScore = robustnessScores.length ? Math.max(...robustnessScores.map(r => r.score)) : null;

    return (
        <div className="space-y-6">

            {/* Page intro — what this page answers */}
            <div>
                <div className="text-[11px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--accent-primary))] mb-1.5">
                    Robustness Lab
                </div>
                <h2 className="font-display text-[19px] font-semibold leading-tight text-[hsl(var(--text))]">
                    Can you trust each model enough to act on it?
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[hsl(var(--text-2))] max-w-2xl">
                    Each verdict combines how much data you have, whether the edge holds over time, and whether
                    it leans on a few outlier trades. Pick a model to inspect its detail below.
                </p>
            </div>

            {/* ── ZONE A — all models ─────────────────────────────────────────── */}
            <section className="space-y-3">
                <ZoneHeader
                    zone="A"
                    title="All models — ranked by trust"
                    subtitle="Compare every model. Click a row to inspect it below."
                    right={
                        <div className="flex gap-1.5">
                            <Pill tone="secondary">{nonBaselineRows.length} MODELS</Pill>
                            {bestScore != null && (
                                <Pill tone={bestScore >= 70 ? "success" : bestScore >= 45 ? "warning" : "danger"}>
                                    BEST {bestScore}/100
                                </Pill>
                            )}
                        </div>
                    }
                />

                <VerdictTable rows={verdicts} selected={selected} onSelect={setSelectedModelKey} />

                {/* Supporting evidence (the detail behind each verdict) */}
                <div>
                    <div className="mb-2 text-[11px] font-ui font-semibold uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                        Supporting evidence
                    </div>
                    <ConfidencePanel
                        exactRows={exactRows || []}
                        halfSplitData={halfSplitData}
                        outlierData={outlierData}
                        robustnessScores={robustnessScores}
                    />
                </div>
            </section>

            {/* ── ZONE B — inspecting the selected model ───────────────────────── */}
            <section className="space-y-3">
                <ZoneHeader
                    zone="B"
                    title={`Inspecting: ${selectedRow?.label ?? "—"}`}
                    subtitle="Deep dive into the selected model."
                />

                {selectedVerdict && <VerdictBanner v={selectedVerdict} />}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <RollingMetricsPanel
                        rollingData={rollingData}
                        modelLabel={selectedRow?.label}
                        window={ROLLING_WINDOW}
                    />

                    {/* Monthly stability panel inline */}
                    {modeTrades?.length > 0 && (() => {
                        const monthly = buildMonthlyStabilityRows(modeTrades);
                        return (
                            <NeonPanel title="Monthly Stability" className="xl:col-span-1"
                                action={<Pill tone="secondary">{monthly.length} MONTHS</Pill>}
                            >
                                <p className="mb-2.5 text-[11px] font-ui text-[hsl(var(--text-2))]">Month-by-month expectancy. Consistent positive months = stable edge.</p>
                                {monthly.length > 0 ? (
                                    <div className="overflow-y-auto max-h-[220px] scrollbar-thin">
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr>
                                                    {["Month", "Trades", "WR", "Expectancy", "Net R"].map(h => (
                                                        <th key={h} className="text-left text-[10px] font-ui font-semibold uppercase tracking-[0.05em] text-[hsl(var(--text-2))] px-2 py-1.5">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {monthly.map(m => (
                                                    <tr key={m.month} className="border-t border-[hsl(var(--border-soft)/0.2)]">
                                                        <td className="px-2 py-1.5 font-ui text-[hsl(var(--text))]">{m.month}</td>
                                                        <td className="px-2 py-1.5 font-num tabular-nums text-white">{m.count}</td>
                                                        <td className="px-2 py-1.5 font-num tabular-nums text-white">{m.winRate.toFixed(0)}%</td>
                                                        <td className={cn("px-2 py-1.5 font-num tabular-nums", m.expectancy >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                                            {m.expectancy >= 0 ? "+" : ""}{m.expectancy.toFixed(3)}R
                                                        </td>
                                                        <td className={cn("px-2 py-1.5 font-num tabular-nums", m.netR >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>
                                                            {m.netR >= 0 ? "+" : ""}{m.netR.toFixed(1)}R
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="py-4 text-[11px] font-ui text-[hsl(var(--text-2))]">No monthly data (check trade entry timestamps).</div>
                                )}
                            </NeonPanel>
                        );
                    })()}
                </div>
            </section>

        </div>
    );
}

// ── Zone header — readable section anchor (not a NeonPanel; sits above panels) ──
function ZoneHeader({ zone, title, subtitle, right }) {
    return (
        <div className="flex items-end justify-between gap-3 border-b border-[hsl(var(--border-soft))] pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-6 h-6 rounded-[3px] bg-[hsl(var(--accent-primary)/0.14)] border border-[hsl(var(--accent-primary)/0.4)] text-[hsl(var(--accent-primary))] text-[11px] font-display font-semibold shrink-0">
                    {zone}
                </span>
                <div className="min-w-0">
                    <div className="font-display text-[14px] font-semibold leading-tight text-[hsl(var(--text))] truncate">{title}</div>
                    {subtitle && <div className="text-[11px] text-[hsl(var(--text-2))] leading-snug">{subtitle}</div>}
                </div>
            </div>
            {right && <div className="shrink-0">{right}</div>}
        </div>
    );
}

// ── Verdict badge / table / banner (UI-layer decision support) ─────────────────
function VerdictBadge({ verdict, lg = false }) {
    const tok = VERDICT_TOKEN[verdict.tone] || "--text-2";
    return (
        <span
            className={cn(
                "inline-flex items-center font-ui font-semibold rounded-[2px] whitespace-nowrap",
                lg ? "text-[14px] px-3 py-1" : "text-[12.5px] px-2.5 py-1",
            )}
            style={{ color: `hsl(var(${tok}))`, background: `hsl(var(${tok})/0.14)`, border: `1px solid hsl(var(${tok})/0.40)` }}
        >
            {verdict.label}
        </span>
    );
}

function scoreColorOf(score) {
    if (score == null) return "hsl(var(--text-2))";
    return score >= 70 ? "hsl(var(--success))" : score >= 45 ? "hsl(var(--warning))" : "hsl(var(--danger))";
}

function VerdictTable({ rows, selected, onSelect }) {
    if (!rows?.length) {
        return (
            <NeonPanel title="Model Verdicts">
                <div className="py-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                    No models to evaluate yet. Load per-model trade files to see verdicts.
                </div>
            </NeonPanel>
        );
    }
    return (
        <NeonPanel title="Model Verdicts" action={<Pill tone="secondary">{rows.length} MODELS</Pill>}>
            <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full border-separate border-spacing-0">
                    <thead>
                        <tr>
                            {[["Model", "left"], ["Verdict", "left"], ["Robustness", "right"], ["Why", "left"], ["", "right"]].map(([h, align], i) => (
                                <th key={i} className={cn("text-[10.5px] font-ui font-semibold uppercase tracking-[0.05em] text-[hsl(var(--text-2))] px-3 py-2.5", align === "right" ? "text-right" : "text-left")}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => {
                            const isSel = r.mode === selected;
                            const tok = VERDICT_TOKEN[r.verdict.tone] || "--text-2";
                            return (
                                <tr key={r.mode} onClick={() => onSelect(r.mode)}
                                    className={cn(
                                        "group cursor-pointer transition-colors border-t border-[hsl(var(--border-soft)/0.4)]",
                                        isSel ? "bg-[hsl(var(--accent-primary)/0.12)]" : "hover:bg-[hsl(var(--panel-2)/0.6)]",
                                    )}
                                >
                                    <td className="px-3 py-4 text-[13.5px] font-ui text-[hsl(var(--text))] whitespace-nowrap">
                                        <span className="inline-flex items-center gap-2.5">
                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `hsl(var(${tok}))` }} />
                                            {r.label}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4"><VerdictBadge verdict={r.verdict} /></td>
                                    <td className="px-3 py-4 text-right font-num tabular-nums text-[18px] font-semibold leading-none" style={{ color: scoreColorOf(r.score) }}>
                                        {r.score == null ? "—" : r.score}
                                    </td>
                                    <td className="px-3 py-4 text-[12.5px] font-ui text-[hsl(var(--text-2))]">{r.verdict.reason}</td>
                                    <td className="px-3 py-4 text-right">
                                        <ChevronRight className={cn(
                                            "w-4 h-4 inline-block transition-colors",
                                            isSel ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-3))] group-hover:text-[hsl(var(--text))]",
                                        )} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// Hero verdict — the answer. Large label + large score, the reason, and the
// recommended next action. Built to be readable in under 2 seconds.
function VerdictBanner({ v }) {
    const tok = VERDICT_TOKEN[v.verdict.tone] || "--text-2";
    return (
        <div
            className="clip-bevel-sm border px-6 py-5"
            style={{ borderColor: `hsl(var(${tok})/0.50)`, background: `hsl(var(${tok})/0.07)` }}
        >
            <div className="flex items-start justify-between gap-6 flex-wrap">
                {/* Verdict — the headline */}
                <div className="min-w-0">
                    <div className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.08em] text-[hsl(var(--text-2))] mb-2">
                        Verdict
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="w-1.5 h-9 rounded-full shrink-0" style={{ background: `hsl(var(${tok}))` }} />
                        <span className="font-display font-semibold text-[30px] leading-none uppercase tracking-tight" style={{ color: `hsl(var(${tok}))` }}>
                            {v.verdict.label}
                        </span>
                    </div>
                    <div className="mt-3 text-[13px] leading-snug text-[hsl(var(--text-2))]">{v.verdict.reason}</div>
                </div>

                {/* Robustness score — the supporting number */}
                <div className="text-right shrink-0">
                    <div className="font-num tabular-nums text-[44px] font-semibold leading-none" style={{ color: scoreColorOf(v.score) }}>
                        {v.score == null ? "—" : v.score}
                    </div>
                    <div className="mt-1.5 text-[10.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2))]">
                        robustness / 100
                    </div>
                </div>
            </div>

            {/* Recommended action */}
            <div className="mt-4 pt-3 flex items-center gap-2.5 border-t border-[hsl(var(--border-soft))]">
                <span className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--text-2))] shrink-0">
                    Do next
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13.5px] font-ui font-semibold text-[hsl(var(--text))]">
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: `hsl(var(${tok}))` }} />
                    {v.verdict.action}
                </span>
            </div>
        </div>
    );
}

// Helper: thin wrapper so JSX inline calls are clear
function buildMonthlyStabilityRows(trades) {
    return buildMonthlyStability(trades);
}
