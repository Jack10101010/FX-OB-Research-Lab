// ── ExcursionAnalysis.jsx ────────────────────────────────────────────────────
// Failures Lab · "Distance to Stop" tab (V3 — interactive, raw-R-primary).
// Click a raw-R bucket → see which sessions / structures / directions / hours /
// setups created the losses inside it. Plus a single-factor failure-driver table
// and curated pair drivers. Everything ranks by DAMAGE (loss-R contribution).
//
// INTEGRITY: the break-even framing is an OPTIMISTIC UPPER BOUND (peak MFE only;
// no post-arm path, no winner cost). The bucket / driver tables describe realized
// losses. Gated on excursion field availability.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle } from "lucide-react";
import { TermTip } from "@/components/lab/TermTip";
import { isPerformanceTrade } from "@/data/tradeClassification";
import { filterWinners } from "../shared/failuresUtils";
import {
    buildRawRDistribution, buildBucketDrilldown, losersInRawBucket,
    buildFailureDrivers, buildPairDrivers,
    buildBeOpportunity, buildBeExclusiveRanges,
    buildLoserMfeReachTable, buildMfeByDimension, buildMaeByDimension, buildDistanceInsights,
    buildWinnerMaeDistribution,
} from "../shared/excursionAnalytics";
import { FailureExplorer, LiftCell } from "./FailureExplorer";
import { FalseLosersDeepDive } from "./FalseLosersDeepDive";

// Arm levels (R) tested by the Break-even Opportunity table. 0.25–1R always shown;
// 1.5R / 2R only when at least one loser reached them ("if useful").
const BE_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const BE_CORE_LEVELS = new Set([0.25, 0.5, 0.75, 1]);

const FLAG_TONE = { instant: "danger", almost: "success" };

// Compact lift value (shares the legend colours of the imported LiftCell).
function liftColor(lift) {
    return lift >= 1.5 ? "hsl(var(--danger))" : lift >= 1.15 ? "hsl(var(--warning))" : "hsl(var(--text-2))";
}

// One clickable bucket bar. Now carries a lift cell (PHASE E) — additive; click /
// selection behaviour is unchanged.
function BucketBar({ b, maxLossR, selected, onSelect }) {
    const w = maxLossR > 0 ? Math.min(100, (b.lossR / maxLossR) * 100) : 0;
    const color = b.flag === "instant" ? "hsl(var(--danger))"
        : b.flag === "almost" ? "hsl(var(--success))"
        : "hsl(var(--accent-secondary))";
    return (
        <button type="button" onClick={() => onSelect(b.key)}
            className={cn(
                "w-full flex items-center gap-3 px-2 py-1.5 clip-bevel-sm border transition-colors text-left",
                selected ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.10)]"
                    : "border-transparent hover:bg-[hsl(var(--panel-2)/0.5)]",
            )}>
            <span className="w-24 shrink-0 text-[11.5px] font-ui text-[hsl(var(--text))]">{b.label}</span>
            <div className="flex-1 h-2.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
            </div>
            <span className="w-8 text-right text-[11.5px] font-num tabular-nums text-white">{b.count}</span>
            <span className="w-12 text-right text-[11px] font-num tabular-nums text-[hsl(var(--text-2))]">{b.lossR}R</span>
            <span className="w-12 text-right text-[11px] font-num tabular-nums text-[hsl(var(--text-2))]">{b.contributionPct}%</span>
            <span className="w-12 text-right text-[11px] font-num tabular-nums" style={{ color: liftColor(b.lift ?? 0), fontWeight: (b.lift ?? 0) >= 1.15 ? 600 : 400 }}>{b.lift ?? 0}×</span>
            {b.flag
                ? <Pill tone={FLAG_TONE[b.flag]}>{b.flag === "instant" ? "instant" : "almost"}</Pill>
                : <span className="w-[52px]" />}
        </button>
    );
}

// ── Distance-to-Stop insights (Command Center) — data-driven, no hardcoded text ──
const INSIGHT_DOT = {
    cohort_lift: "hsl(var(--danger))",
    cohort_delta: "hsl(var(--danger))",
    contribution: "hsl(var(--danger))",
    bucket_driver: "hsl(var(--danger))",
    reach: "hsl(var(--accent-secondary))",
    lift: "hsl(var(--warning))",
    overrep: "hsl(var(--warning))",
    mfe: "hsl(var(--success))",
};
function InsightsCard({ insights }) {
    if (!insights || !insights.length) return null;
    return (
        <NeonPanel
            title={<TermTip termKey="distance_before_stop">Distance to Stop insights</TermTip>}
            tone="primary"
            action={<Pill tone="muted">{insights.length} findings · from this run's data</Pill>}
        >
            <ul className="p-3 space-y-1.5">
                {insights.map((it) => (
                    <li key={it.id} className="flex items-start gap-2.5 text-[12px] font-ui text-[hsl(var(--text))] leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: INSIGHT_DOT[it.kind] ?? "hsl(var(--text-2))" }} />
                        <span>{it.text}</span>
                    </li>
                ))}
            </ul>
            <p className="px-3 pb-3 text-[10px] font-ui text-[hsl(var(--text-3))]">
                Generated from computed metrics (contribution, lift, reach) — no estimates, no break-even claim.
            </p>
        </NeonPanel>
    );
}

// ── MFE-by-dimension outcome panel (Structure×MFE / Session×MFE) ────────────────
function MfeOutcomePanel({ data, title, question }) {
    if (!data || !data.available || !data.rows.length) return null;
    const maxLossR = Math.max(...data.rows.map((r) => r.lossR), 1);
    return (
        <NeonPanel
            title={title}
            action={<Pill tone="muted">avg <TermTip termKey="mfe">MFE</TermTip> +{data.avgMfe}R · {data.eligible} losers</Pill>}
        >
            <p className="px-3 pt-3 text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">{question} Ranked by <TermTip termKey="contribution_pct">contribution</TermTip>; % columns are that group's losers reaching each level in favour (peak <TermTip termKey="mfe">MFE</TermTip>).</p>
            <div className="p-3 overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui border-collapse">
                    <thead>
                        <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                            <th className="text-left font-medium py-1.5 pr-2">{data.dimLabel}</th>
                            <th className="text-right font-medium py-1.5 px-2">Count</th>
                            <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></th>
                            <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="contribution_pct">Contrib</TermTip></th>
                            <th className="text-right font-medium py-1.5 px-2">Avg MFE</th>
                            {data.reachLevels.map((L) => (
                                <th key={L} className="text-right font-medium py-1.5 px-2">≥{L}R</th>
                            ))}
                            <th className="text-right font-medium py-1.5 pl-2"><TermTip termKey="lift">Lift</TermTip></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((r) => (
                            <tr key={r.value} className={cn("border-b border-[hsl(var(--border-soft)/0.5)]", r.lowSample && "opacity-50")}>
                                <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[150px]">{r.value}{r.lowSample && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[hsl(var(--warning))]">low n</span>}</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-white">{r.count}</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{r.lossR}R</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text))]">{r.contributionPct}%</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--accent-secondary))]">+{r.avgMfe}R</td>
                                {data.reachLevels.map((L) => (
                                    <td key={L} className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{r.reach[L]}%</td>
                                ))}
                                <td className="text-right py-1.5 pl-2"><LiftCell lift={r.lift} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// MAE-by-dimension (Phase 3B): which cohorts' WINNERS came closest to the stop before
// winning. Mirrors MfeOutcomePanel but winner/MAE-based. Self-gates on MAE availability
// (does NOT block the rest of the tab) and surfaces the to-exit/legacy fallback warning.
function MaeOutcomePanel({ data, title, question }) {
    if (!data) return null;
    if (!data.available || !data.rows.length) {
        return (
            <NeonPanel title={title}>
                <div className="p-4 flex items-start gap-3 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                    <div>Requires <span className="font-num text-[hsl(var(--text))]">maeR</span> / <span className="font-num text-[hsl(var(--text))]">mae_r_to_original_exit</span> — no winners with adverse-excursion data for this dimension.</div>
                </div>
            </NeonPanel>
        );
    }
    return (
        <NeonPanel
            title={title}
            action={<Pill tone="muted">avg <TermTip termKey="mae">MAE</TermTip> {data.avgMaeR}R · {data.eligible} winners</Pill>}
        >
            {data.warning && (
                <div className={cn(
                    "mx-3 mt-3 flex items-start gap-2 clip-bevel-sm border p-2",
                    data.source === "stop_anchored_fallback"
                        ? "border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)]"
                        : "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)]",
                )}>
                    <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", data.source === "stop_anchored_fallback" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]")} />
                    <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        {data.warning}
                        {data.source === "mixed" && <span className="text-[hsl(var(--text-3))]"> ({data.fallbackCount}/{data.eligible} · {data.fallbackPct}%)</span>}
                    </p>
                </div>
            )}
            <p className="px-3 pt-3 text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                {question} Ranked by <span className="text-[hsl(var(--text))]">near-stop %</span> — a deeper avg <TermTip termKey="mae">MAE</TermTip> means that cohort's winners came closer to the stop before winning.
            </p>
            <div className="p-3 overflow-x-auto">
                <table className="w-full text-[11.5px] font-ui border-collapse">
                    <thead>
                        <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                            <th className="text-left font-medium py-1.5 pr-2">{data.dimLabel}</th>
                            <th className="text-right font-medium py-1.5 px-2">Winners</th>
                            <th className="text-right font-medium py-1.5 px-2">Avg MAE</th>
                            <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="stop_pressure">Near-stop</TermTip> ≤-0.75R</th>
                            <th className="text-right font-medium py-1.5 px-2">≤ -1R</th>
                            <th className="text-right font-medium py-1.5 pl-2">Avg Win R</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((r) => (
                            <tr key={r.key} className={cn("border-b border-[hsl(var(--border-soft)/0.5)]", r.lowSample && "opacity-50")}>
                                <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[150px]">{r.label}{r.lowSample && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[hsl(var(--warning))]">low n</span>}</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-white">{r.eligible}{r.totalWinners !== r.eligible && <span className="text-[hsl(var(--text-3))]">/{r.totalWinners}</span>}</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text))]">{r.avgMaeR}R</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--warning))]">{r.nearStopPct}%</td>
                                <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--danger))]">{r.anomalyPct}%</td>
                                <td className="text-right py-1.5 pl-2 font-num tabular-nums text-[hsl(var(--success))]">+{r.avgWinR}R</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}

// Compact ranked section for one dimension inside the drilldown.
// ── Selected Bucket Overview (composition, NOT setup scorecard) ─────────────────
// Answers "what makes up this bucket?" — bucket-level composition by dimension.
// Setup-level win/loss & expectancy live in the Failure Explorer (do not duplicate).
const BUCKET_OVERVIEW_DEFAULT_DIMS = ["session", "direction", "structure"];

function SummaryStat({ label, value, tone, big }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">{label}</span>
            <span className={cn(big ? "text-[15px]" : "text-[13px]", "font-num tabular-nums leading-none", tone || "text-[hsl(var(--text))]")}>{value}</span>
        </div>
    );
}

// One dimension group inside the overview: Count · Loss-R · % bucket · Avg Loss-R.
function OverviewDimGroup({ section }) {
    const max = Math.max(...section.rows.map((r) => r.lossR), 1);
    return (
        <div>
            <div className="text-[10.5px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-2 pb-1.5 border-b border-[hsl(var(--border-soft)/0.6)]">{section.label}</div>
            <div className="flex items-center gap-2 px-0.5 mb-1.5 text-[9px] font-ui uppercase tracking-[0.04em] text-[hsl(var(--text-3))]">
                <span className="w-28 shrink-0" />
                <span className="flex-1" />
                <span className="w-8 text-right">n</span>
                <span className="w-12 text-right">Loss-R</span>
                <span className="w-12 text-right">% bkt</span>
                <span className="w-12 text-right">avg</span>
            </div>
            <div className="space-y-1.5">
                {section.rows.map((r) => {
                    const avg = r.count ? Math.round((r.lossR / r.count) * 100) / 100 : 0;
                    return (
                        <div key={r.value} className="flex items-center gap-2 text-[11.5px] font-ui">
                            <span className="w-28 shrink-0 truncate text-[hsl(var(--text))]">{r.value}</span>
                            <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[hsl(var(--danger)/0.7)]" style={{ width: `${Math.min(100, (r.lossR / max) * 100)}%` }} />
                            </div>
                            <span className="w-8 text-right font-num tabular-nums text-white">{r.count}</span>
                            <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.lossR}R</span>
                            <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.contributionPct}%</span>
                            <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{avg}R</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function BucketOverview({ drill, bucketDef }) {
    const [showMore, setShowMore] = useState(false);
    if (!drill || !bucketDef) return null;
    const defaults = drill.sections.filter((s) => BUCKET_OVERVIEW_DEFAULT_DIMS.includes(s.key));
    const more = drill.sections.filter((s) => !BUCKET_OVERVIEW_DEFAULT_DIMS.includes(s.key));
    const shown = showMore ? [...defaults, ...more] : defaults;
    const avgLoss = drill.trades ? Math.round((drill.lossR / drill.trades) * 100) / 100 : 0;
    return (
        <NeonPanel
            title={<span className="text-[14px]">Selected Bucket Overview</span>}
            tone="secondary"
            action={<Pill tone="secondary">Viewing bucket: {bucketDef.label}</Pill>}
        >
            {/* Summary strip — immediate context before reading dimensions */}
            <div className="px-4 pt-4">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-4 py-3">
                    <SummaryStat label="Selected bucket" value={bucketDef.label} tone="text-[hsl(var(--accent-primary))]" big />
                    <SummaryStat label="Losses" value={drill.trades} tone="text-white" />
                    <SummaryStat label="Damage" value={`${drill.lossR}R`} tone="text-[hsl(var(--danger))]" />
                    <SummaryStat label="% of total loss-R" value={`${drill.contributionPct}%`} tone="text-[hsl(var(--accent-secondary))]" />
                    <SummaryStat label="Avg loss" value={`${avgLoss}R`} tone="text-[hsl(var(--text))]" />
                </div>
                <p className="text-[10.5px] font-ui text-[hsl(var(--text-3))] mt-2 leading-relaxed">
                    What makes up this bucket — composition by dimension. For setup-level win/loss &amp; expectancy, use the <span className="text-[hsl(var(--text-2))]">Failure Explorer</span> below.
                </p>
            </div>

            {defaults.length ? (
                <>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-6">
                        {shown.map((s) => <OverviewDimGroup key={s.key} section={s} />)}
                    </div>
                    {more.length > 0 && (
                        <div className="px-4 pb-4 -mt-1">
                            <button type="button" onClick={() => setShowMore((v) => !v)}
                                className="px-2.5 py-1 text-[10.5px] font-ui clip-bevel-sm border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--panel-2)/0.5)] transition-colors">
                                {showMore ? "Show less" : `Show more (${more.length})`}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No dimension data for this bucket.</div>
            )}
        </NeonPanel>
    );
}

// ── Loser MFE reach table (realized losses — how far losers got) ───────────────
// Cumulative count of losing trades that reached ≥ each R level in favour before
// failing. Describes realized losses (no break-even claim — the BE panel owns that).
function ReachTable({ reach }) {
    if (!reach || !reach.rows.length) return null;
    const maxReached = Math.max(...reach.rows.map((r) => r.reachedCount), 1);
    return (
        <NeonPanel
            title={<TermTip termKey="mfe_reach">How many losers reached profit before failing</TermTip>}
            action={<Pill tone="muted">{reach.eligible} losers w/ MFE</Pill>}
        >
            <div className="p-3 space-y-1">
                <p className="px-2 text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    Losing trades that reached <span className="text-[hsl(var(--text))]">at least</span> each level in favour
                    (peak <TermTip termKey="mfe">MFE</TermTip>) before stopping out. These are
                    <span className="text-[hsl(var(--text))]"> realized losses</span> — it describes how far losers travelled, not a break-even claim.
                </p>
                <div className="flex items-center gap-3 px-2 pt-1 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                    <span className="w-16">Reached ≥</span>
                    <span className="flex-1" />
                    <span className="w-20 text-right">Losers</span>
                    <span className="w-16 text-right">% losers</span>
                    <span className="w-16 text-right"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></span>
                    <span className="w-16 text-right"><TermTip termKey="contribution_pct">% loss-R</TermTip></span>
                    <span className="w-16 text-right">Sample</span>
                </div>
                {reach.rows.map((r) => (
                    <div key={r.levelR} className={cn("flex items-center gap-3 px-2 py-1.5 text-[11.5px] font-ui", r.lowSample && "opacity-55")}>
                        <span className="w-16 shrink-0 text-[hsl(var(--text))] font-num tabular-nums">{r.label}</span>
                        <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[hsl(var(--accent-secondary)/0.7)]" style={{ width: `${Math.min(100, (r.reachedCount / maxReached) * 100)}%` }} />
                        </div>
                        <span className="w-20 text-right font-num tabular-nums text-white">{r.reachedCount}</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.reachedPct}%</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text))]">{r.lossR}R</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.contributionPct}%</span>
                        <span className="w-16 text-right">{r.lowSample ? <Pill tone="warning">low n</Pill> : <Pill tone="muted">ok</Pill>}</span>
                    </div>
                ))}
            </div>
        </NeonPanel>
    );
}

// ── Break-even opportunity by arm level (OPTIMISTIC UPPER BOUND) ───────────────
const BAND_COLOR = (flag) => (
    flag === "instant" ? "hsl(var(--danger)/0.7)"
    : flag === "almost" ? "hsl(var(--success)/0.7)"
    : "hsl(var(--accent-secondary)/0.7)"
);

function BeTab({ active, disabled, onClick, children }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            className={cn(
                "px-2.5 py-1 text-[11px] font-ui clip-bevel-sm border transition-colors",
                disabled ? "opacity-40 cursor-not-allowed border-[hsl(var(--border-soft))] text-[hsl(var(--text-3))]"
                    : active ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--text))]"
                    : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--panel-2)/0.5)]",
            )}>
            {children}
        </button>
    );
}

function BeOpportunityTable({ be, ranges }) {
    const [view, setView] = useState("cumulative");
    if (!be || !be.rows.length) return null;
    // Cumulative: 0.25–1R always; 1.5R / 2R only when someone reached them.
    const cumRows = be.rows.filter((r) => BE_CORE_LEVELS.has(r.level) || r.reached > 0);
    const maxReached = cumRows[0]?.reached || 1;
    const hasRanges = !!(ranges && ranges.rows && ranges.rows.length);
    const maxTrades = hasRanges ? Math.max(...ranges.rows.map((r) => r.trades), 1) : 1;
    const showExclusive = view === "exclusive" && hasRanges;

    return (
        <NeonPanel
            title={<TermTip termKey="be_opportunity">Break-even opportunity by arm level</TermTip>}
            tone="secondary"
            action={<Pill tone="muted">{be.consideredN} losers w/ MFE · upper bound</Pill>}
        >
            <div className="px-3 pt-3">
                <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                    <p className="text-[11px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        An <span className="text-[hsl(var(--text))]">optimistic upper bound</span>: it counts losers that <em>reached</em> a level (could have armed BE) using peak <TermTip termKey="mfe">MFE</TermTip> only.
                        It does <span className="text-[hsl(var(--text))]">not</span> model whether price retraced to trigger the BE exit, nor the winners such a rule would cut. Figures are <span className="text-[hsl(var(--text))]">potentially savable</span>, not realized BE profit — <span className="text-[hsl(var(--text))]">validate with an exact BE backtest</span>.
                    </p>
                </div>
            </div>

            {/* view tabs */}
            <div className="px-3 pt-3 flex items-center gap-1.5">
                <BeTab active={!showExclusive} onClick={() => setView("cumulative")}>Cumulative reach</BeTab>
                <BeTab active={showExclusive} disabled={!hasRanges} onClick={() => setView("exclusive")}>Exclusive ranges</BeTab>
            </div>

            {!showExclusive ? (
                /* ── Cumulative reach (≥ level) ── */
                <div className="p-3 space-y-1">
                    <p className="px-2 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                        Counts losing trades that reached <span className="text-[hsl(var(--text))]">at least</span> each arm level before stopping out.
                    </p>
                    <div className="flex items-center gap-3 px-2 pt-1 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                        <span className="w-16">Arm level</span>
                        <span className="flex-1" />
                        <span className="w-28 text-right">Reached ≥ Level</span>
                        <span className="w-16 text-right">% losers</span>
                        <span className="w-24 text-right">Savable R*</span>
                        <span className="w-16 text-right">% loss-R</span>
                        <span className="w-16 text-right">Sample</span>
                    </div>
                    {cumRows.map((r) => (
                        <div key={r.level} className={cn("flex items-center gap-3 px-2 py-1.5 text-[11.5px] font-ui", r.lowSample && "opacity-55")}>
                            <span className="w-16 shrink-0 text-[hsl(var(--text))] font-num tabular-nums">{r.label}</span>
                            <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[hsl(var(--accent-secondary)/0.7)]" style={{ width: `${Math.min(100, (r.reached / maxReached) * 100)}%` }} />
                            </div>
                            <span className="w-28 text-right font-num tabular-nums text-white">{r.reached}</span>
                            <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.reachedPct}%</span>
                            <span className="w-24 text-right font-num tabular-nums text-[hsl(var(--text))]">≤ {r.savableLossRUpperBound}R</span>
                            <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.contributionPct}%</span>
                            <span className="w-16 text-right">{r.lowSample ? <Pill tone="warning">low n</Pill> : <Pill tone="muted">ok</Pill>}</span>
                        </div>
                    ))}
                    <p className="px-2 pt-1 text-[10px] font-ui text-[hsl(var(--text-3))]">
                        * potentially savable loss-R — <span className="text-[hsl(var(--text-2))]">upper bound</span>, not realized BE profit.
                    </p>
                </div>
            ) : (
                /* ── Exclusive ranges (each loser counted once) ── */
                <div className="p-3 space-y-1">
                    <p className="px-2 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                        Where losers <span className="text-[hsl(var(--text))]">topped out</span> before failing — each trade counted once, by its peak <TermTip termKey="mfe">MFE</TermTip>.
                    </p>
                    <div className="flex items-center gap-3 px-2 pt-1 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                        <span className="w-24"><TermTip termKey="raw_r_bucket">Range</TermTip></span>
                        <span className="flex-1" />
                        <span className="w-16 text-right">Trades</span>
                        <span className="w-16 text-right">% losers</span>
                        <span className="w-16 text-right"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></span>
                        <span className="w-16 text-right"><TermTip termKey="contribution_pct">% loss-R</TermTip></span>
                    </div>
                    {ranges.rows.map((r) => (
                        <div key={r.key} className="flex items-center gap-3 px-2 py-1.5 text-[11.5px] font-ui">
                            <span className="w-24 shrink-0 text-[hsl(var(--text))] font-num tabular-nums">{r.label}</span>
                            <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.trades / maxTrades) * 100)}%`, background: BAND_COLOR(r.flag) }} />
                            </div>
                            <span className="w-16 text-right font-num tabular-nums text-white">{r.trades}</span>
                            <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.pctOfLosers}%</span>
                            <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text))]">{r.lossR}R</span>
                            <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.contributionPct}%</span>
                        </div>
                    ))}
                </div>
            )}

            {/* future note — clear but light */}
            <p className="px-3 pb-3 text-[10px] font-ui text-[hsl(var(--text-3))] leading-relaxed">
                Actual BE results require a BE replay/backtest — MFE doesn't tell us whether price returned to entry after arming.
            </p>
        </NeonPanel>
    );
}

// ── Winner MAE / stop-pressure (how close winners came to the stop) ────────────
// Gated independently on maeR: renders its own inline "Requires maeR" state without
// blocking the MFE panels above. The ≤ -1R band is a stop-touch tie / same-candle path
// anomaly (full stop distance reached yet booked a win) — flagged, not read casually.
const MAE_BAND_COLOR = (flag) => (
    flag === "anomaly" ? "hsl(var(--danger)/0.7)"
    : flag === "near_stop" ? "hsl(var(--warning)/0.7)"
    : "hsl(var(--success)/0.6)"
);

function MaeStopPressurePanel({ mae }) {
    if (!mae) return null;

    // ── MAE-only unavailable state (does NOT block the rest of the tab) ──
    if (!mae.eligible) {
        return (
            <NeonPanel title={<TermTip termKey="stop_pressure">Winner MAE / Stop Pressure</TermTip>}>
                <div className="p-4 flex items-start gap-3 text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                    <div>
                        <div className="text-[hsl(var(--text))] font-medium mb-1">Requires maeR (adverse excursion).</div>
                        This run's winners don't carry per-trade <span className="font-num text-[hsl(var(--text))]">maeR</span> data.
                        Re-export with the adverse-excursion field to see stop-pressure analysis. (MFE panels above are unaffected.)
                    </div>
                </div>
            </NeonPanel>
        );
    }

    const maxCount = Math.max(...mae.rows.map((r) => r.count), 1);

    return (
        <NeonPanel
            title={<TermTip termKey="stop_pressure">Winner MAE / Stop Pressure</TermTip>}
            tone="secondary"
            action={<Pill tone="muted">{mae.eligible} winners w/ MAE</Pill>}
        >
            <div className="p-3 space-y-1">
                <p className="px-2 text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    How close did <span className="text-[hsl(var(--text))]">winning</span> trades come to the stop before succeeding?
                    Winners bucketed by worst <TermTip termKey="mae">adverse excursion</TermTip> (MAE) — deeper = nearer the stop.
                </p>
                {/* Source provenance — to-original-exit vs legacy stop-anchored fallback (Phase 2B). */}
                {mae.warning && (
                    <div className={cn(
                        "mx-2 mt-1 flex items-start gap-2 clip-bevel-sm border p-2",
                        mae.source === "stop_anchored_fallback"
                            ? "border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)]"
                            : "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)]",
                    )}>
                        <AlertTriangle className={cn(
                            "w-3.5 h-3.5 shrink-0 mt-0.5",
                            mae.source === "stop_anchored_fallback" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]",
                        )} />
                        <p className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                            {mae.warning}
                            {mae.source === "mixed" && (
                                <span className="text-[hsl(var(--text-3))]"> ({mae.fallbackCount}/{mae.eligible} · {mae.fallbackPct}%)</span>
                            )}
                        </p>
                    </div>
                )}
                {mae.nearStopCount > 0 && (
                    <p className="px-2 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                        <span className="text-[hsl(var(--warning))] font-semibold">{mae.nearStopCount}</span> winner{mae.nearStopCount === 1 ? "" : "s"} nearly failed (≤ -0.75R)
                        {mae.anomalyCount > 0 && (
                            <> · <span className="text-[hsl(var(--danger))] font-semibold">{mae.anomalyCount}</span> at ≤ -1R (stop-touch tie / same-candle path — verify)</>
                        )}.
                    </p>
                )}
                <div className="flex items-center gap-3 px-2 pt-1 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                    <span className="w-28"><TermTip termKey="mae">MAE</TermTip> band</span>
                    <span className="flex-1" />
                    <span className="w-16 text-right">Winners</span>
                    <span className="w-16 text-right">% winners</span>
                    <span className="w-16 text-right">Win-R</span>
                    <span className="w-16 text-right">Avg R</span>
                    <span className="w-16 text-right">Sample</span>
                </div>
                {mae.rows.map((r) => (
                    <div key={r.key} className={cn("flex items-center gap-3 px-2 py-1.5 text-[11.5px] font-ui", r.lowSample && "opacity-55")}>
                        <span className="w-28 shrink-0 text-[hsl(var(--text))] font-num tabular-nums">{r.label}</span>
                        <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.count / maxCount) * 100)}%`, background: MAE_BAND_COLOR(r.flag) }} />
                        </div>
                        <span className="w-16 text-right font-num tabular-nums text-white">{r.count}</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.pctOfWinners}%</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.winR}R</span>
                        <span className="w-16 text-right font-num tabular-nums text-[hsl(var(--text))]">{r.avgWinR}R</span>
                        <span className="w-16 text-right">
                            {r.flag === "anomaly" && r.count > 0 ? <Pill tone="danger">verify</Pill>
                                : r.lowSample ? <Pill tone="warning">low n</Pill>
                                : r.count > 0 ? <Pill tone="muted">ok</Pill>
                                : <span className="text-[hsl(var(--text-3))]">—</span>}
                        </span>
                    </div>
                ))}
                <p className="px-2 pt-1 text-[10px] font-ui text-[hsl(var(--text-3))] leading-relaxed">
                    This helps judge <TermTip termKey="stop_buffer_sensitivity">stop-buffer sensitivity</TermTip>. It does not prove a tighter
                    stop would still win — winners that dipped deep would likely have been stopped under a tighter stop. Validate with a replay.
                </p>
            </div>
        </NeonPanel>
    );
}

export function ExcursionAnalysis({ losers = [], allLosers = [], allTrades = [], config = {} }) {
    const source = losers.length ? losers : allLosers;
    // VALID TRADE UNIVERSE — the Explorer / cohort denominators must match the
    // "valid trades" KPI on Run Detail (e.g. 165), NOT the raw imported rows (e.g.
    // 330). `allTrades` (= useTradeUniverse().trades) is the unfiltered row list;
    // we gate it through the canonical performance classifier — the SAME predicate
    // Run Detail uses (isValidExecutedTrade → isPerformanceTrade) — so winners,
    // totals, loss rate, baseline and lift all use the active trade universe.
    const validTrades = useMemo(
        () => (Array.isArray(allTrades) ? allTrades.filter(isPerformanceTrade) : []),
        [allTrades],
    );
    // Explorer runs over a winners-inclusive population so loss-rate / lift are real.
    const explorerSource = validTrades.length ? validTrades : source;
    // MAE / stop-pressure runs over WINNERS (valid universe, cohort-independent like
    // the Explorer) — "how close did winners come to the stop before succeeding?".
    const winners = useMemo(() => filterWinners(validTrades), [validTrades]);
    const mae = useMemo(() => buildWinnerMaeDistribution(winners), [winners]);
    const reach = useMemo(() => buildLoserMfeReachTable(source), [source]);
    const dist = useMemo(() => buildRawRDistribution(source), [source]);
    const be = useMemo(() => buildBeOpportunity(source, BE_LEVELS, { config, mode: "raw" }), [source, config]);
    const beRanges = useMemo(() => buildBeExclusiveRanges(source, { config }), [source, config]);
    const drivers = useMemo(() => buildFailureDrivers(source), [source]);
    const pairs = useMemo(() => buildPairDrivers(source), [source]);

    // Default-select the highest-contribution non-empty bucket so a drilldown shows immediately.
    const defaultBucket = useMemo(() => {
        const ranked = [...(dist.buckets || [])].filter((b) => b.count > 0).sort((a, b) => b.lossR - a.lossR);
        return ranked[0]?.key ?? null;
    }, [dist]);
    const [selected, setSelected] = useState(null);
    const activeBucket = selected ?? defaultBucket;
    const drill = useMemo(
        () => (activeBucket ? buildBucketDrilldown(source, activeBucket) : null),
        [source, activeBucket],
    );
    const activeBucketDef = dist.buckets?.find((b) => b.key === activeBucket) || null;

    // Insight synthesis (Command Center) — bucket-aware so the headline tracks the
    // selected bucket. MFE-by-dimension outcomes for Structure / Session panels.
    const insights = useMemo(
        () => buildDistanceInsights(source, { config, activeBucketKey: activeBucket, allTrades: validTrades }),
        [source, config, activeBucket, validTrades],
    );
    const mfeByStructure = useMemo(() => buildMfeByDimension(source, "structure"), [source]);
    const mfeBySession = useMemo(() => buildMfeByDimension(source, "session"), [source]);
    // MAE-by-dimension (Phase 3B) — winner-based; reuses the `winners` set derived for the
    // Stop-Pressure panel. "Which cohorts' winners came closest to the stop before winning?"
    const maeByStructure = useMemo(() => buildMaeByDimension(winners, "structure"), [winners]);
    const maeBySession = useMemo(() => buildMaeByDimension(winners, "session"), [winners]);

    // Bucket object handed to the Explorer so it can scope to "what caused THIS bucket".
    const explorerBucket = useMemo(() => {
        if (!activeBucket || !activeBucketDef || !drill) return null;
        return {
            key: activeBucket,
            label: activeBucketDef.label,
            trades: drill.trades,
            lossR: drill.lossR,
            contributionPct: drill.contributionPct,
            losers: losersInRawBucket(source, activeBucket),
        };
    }, [activeBucket, activeBucketDef, drill, source]);

    // ── Gated empty state ──────────────────────────────────────────────────────
    // Phase 2: gate on MFE only. A run carrying mfeR renders the MFE panels even when
    // maeR is absent; the MAE / Stop-Pressure panel gates itself separately below.
    if (dist.coverage.withMfe === 0) {
        return (
            <div className="p-6">
                <NeonPanel title={<TermTip termKey="distance_before_stop">Distance to Stop</TermTip>}>
                    <div className="p-6 flex items-start gap-3 text-[12px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <div>
                            <div className="text-[hsl(var(--text))] font-medium mb-1">Requires MFE fields from the exporter.</div>
                            This run doesn't carry per-trade favourable-excursion data. Re-export with these fields:
                            {" "}<span className="font-num text-[hsl(var(--text))]">mfeR</span>,
                            {" "}<span className="font-num text-[hsl(var(--text))]">maeR</span>,
                            {" "}<span className="font-num text-[hsl(var(--text))]">rIfNoTarget</span>.
                        </div>
                    </div>
                </NeonPanel>
            </div>
        );
    }

    const maxLossR = Math.max(...dist.buckets.map((b) => b.lossR), 1);

    return (
        <div className="p-6 space-y-5">
            {/* Caveat (BE framing only) */}
            <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                <p className="text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    Buckets and drivers below describe <span className="text-[hsl(var(--text))]">realized losses</span>, ranked by{" "}
                    <TermTip termKey="contribution_pct">damage</TermTip>. Any break-even read is an{" "}
                    <span className="text-[hsl(var(--text))]">upper bound</span> — peak{" "}
                    <TermTip termKey="mfe">MFE</TermTip> only; it doesn't model whether BE would trigger or how many winners it would cut.
                </p>
            </div>

            {/* ── Insight synthesis (Command Center) ────────────────────────── */}
            <InsightsCard insights={insights.insights} />

            {/* ── 2. How far losers moved (clickable bucket chooser) ────────── */}
            <NeonPanel
                title={<TermTip termKey="distance_before_stop">How far losers moved in favour</TermTip>}
                action={<Pill tone="muted">{dist.coverage.withMfe}/{dist.coverage.total} losers · {dist.coverage.pct}% have MFE</Pill>}
            >
                <div className="p-3 space-y-1.5">
                    <div className="flex items-center gap-3 px-2 text-[9.5px] font-ui uppercase tracking-[0.05em] text-[hsl(var(--text-2))]">
                        <span className="w-24"><TermTip termKey="raw_r_bucket">Raw R bucket</TermTip></span>
                        <span className="flex-1" />
                        <span className="w-8 text-right">n</span>
                        <span className="w-12 text-right"><TermTip termKey="loss_r_contribution">Loss-R</TermTip></span>
                        <span className="w-12 text-right"><TermTip termKey="contribution_pct">Contrib</TermTip></span>
                        <span className="w-12 text-right"><TermTip termKey="lift">Lift</TermTip></span>
                        <span className="w-[52px]" />
                    </div>
                    {dist.buckets.map((b) => (
                        <BucketBar key={b.key} b={b} maxLossR={maxLossR} selected={b.key === activeBucket} onSelect={setSelected} />
                    ))}
                    <div className="flex items-center gap-4 px-2 pt-1 text-[10px] font-ui text-[hsl(var(--text-2))]">
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(var(--danger))]" /><TermTip termKey="dist_instant_failure">instant failure</TermTip></span>
                        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" /><TermTip termKey="dist_almost_worked">almost worked</TermTip></span>
                        <span className="ml-auto">click a bucket to see what caused it ↓</span>
                    </div>
                </div>
            </NeonPanel>

            {/* ── How many losers reached profit (companion to the chart) ───── */}
            <ReachTable reach={reach} />

            {/* ── 3. Selected Bucket Overview (composition; not a scorecard) ── */}
            <BucketOverview drill={drill} bucketDef={activeBucketDef} />

            {/* ── 4. MFE Bucket Explorer (setup scorecard; bucket-aware) ────── */}
            <FailureExplorer
                allTrades={explorerSource}
                allLosers={source}
                bucket={explorerBucket}
                title="MFE Bucket Explorer"
                intro="Inside this MFE bucket, which setups explain these failures?"
            />

            {/* ── 5. Break-even opportunity by arm level (upper bound) ──────── */}
            <BeOpportunityTable be={be} ranges={beRanges} />

            {/* ── 5b. False Losers Deep Dive (MFE-band BE opportunity, upper bound) ── */}
            <FalseLosersDeepDive losers={source} config={config} onExploreBucket={setSelected} />

            {/* ── 6. Winner MAE / Stop Pressure (gates on maeR separately) ──── */}
            <MaeStopPressurePanel mae={mae} />

            {/* ── Structure × MAE / Session × MAE outcomes (Phase 3B) ───────── */}
            <MaeOutcomePanel
                data={maeByStructure}
                title={<TermTip termKey="stop_pressure">Structure vs stop pressure</TermTip>}
                question="Which structures produce winners that came closest to the stop before winning?"
            />
            <MaeOutcomePanel
                data={maeBySession}
                title={<TermTip termKey="stop_pressure">Session vs stop pressure</TermTip>}
                question="Which sessions produce winners that nearly stopped out before winning?"
            />

            {/* ── Structure × MFE / Session × MFE outcomes ──────────────────── */}
            <MfeOutcomePanel
                data={mfeByStructure}
                title={<TermTip termKey="distance_before_stop">Structure vs MFE outcome</TermTip>}
                question="Which structures tend to move far before failing?"
            />
            <MfeOutcomePanel
                data={mfeBySession}
                title={<TermTip termKey="distance_before_stop">Session vs MFE outcome</TermTip>}
                question="Which sessions produce losers that nearly work?"
            />

            {/* ── Top failure drivers (single factor, all losers) ───────────── */}
            <NeonPanel
                title="Top failure drivers"
                action={
                    <span className="flex items-center gap-2 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                        <TermTip termKey="lift">×</TermTip> = lift · ranked by loss-R · min {drivers.minSample} trades
                    </span>
                }
            >
                <p className="px-3 pt-3 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                    Columns: count · loss-R · contribution % · <TermTip termKey="lift">lift</TermTip>.
                    Lift &gt; 1× = the factor loses <span className="text-[hsl(var(--text))]">more than its share</span> of trades (a real driver, not just high volume).
                </p>
                {drivers.drivers.length ? (
                    <div className="p-3 space-y-1.5">
                        {drivers.drivers.map((d, i) => {
                            const max = drivers.drivers[0]?.lossR || 1;
                            return (
                                <div key={`${d.dimKey}-${d.value}`} className="flex items-center gap-2.5 text-[12px] font-ui">
                                    <span className="w-5 text-right font-num text-[hsl(var(--text-3))]">{i + 1}</span>
                                    <span className="w-40 shrink-0 truncate text-[hsl(var(--text))]">{d.value}</span>
                                    <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-[hsl(var(--text-2))]">{d.dimLabel}</span>
                                    <div className="flex-1 h-2 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-[hsl(var(--danger)/0.7)]" style={{ width: `${Math.min(100, (d.lossR / max) * 100)}%` }} />
                                    </div>
                                    <span className="w-8 text-right font-num tabular-nums text-white">{d.count}</span>
                                    <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{d.lossR}R</span>
                                    <span className="w-12 text-right font-num tabular-nums font-semibold text-[hsl(var(--text))]">{d.contributionPct}%</span>
                                    <LiftCell lift={d.lift} />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">Not enough data per factor (min {drivers.minSample} trades).</div>
                )}
            </NeonPanel>

            {/* ── Curated pair drivers ──────────────────────────────────────── */}
            <NeonPanel
                title="Top pair drivers"
                action={<Pill tone="muted">curated pairs · min {pairs.minSample} trades</Pill>}
            >
                <p className="px-3 pt-3 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                    A fixed set of two-factor combinations (no open combination mining). Ranked by loss-R contribution.
                </p>
                {pairs.pairs.length ? (
                    <div className="p-3 pt-2 space-y-1">
                        {pairs.pairs.map((p, i) => (
                            <div key={`${p.pairLabel}-${p.valueLabel}`} className="flex items-center gap-2.5 px-2 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm text-[12px] font-ui">
                                <span className="w-5 text-right font-num text-[hsl(var(--text-3))]">{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-[hsl(var(--text))]">{p.valueLabel}</span>
                                <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-2))] shrink-0">{p.pairLabel}</span>
                                <span className="w-8 text-right font-num tabular-nums text-white">{p.count}</span>
                                <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{p.lossR}R</span>
                                <span className="w-12 text-right font-num tabular-nums font-semibold text-[hsl(var(--text))]">{p.contributionPct}%</span>
                                <LiftCell lift={p.lift} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No pair reached the {pairs.minSample}-trade minimum.</div>
                )}
            </NeonPanel>
        </div>
    );
}
