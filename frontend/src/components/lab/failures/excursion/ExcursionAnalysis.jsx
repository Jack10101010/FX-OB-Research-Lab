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
import { isModuleAvailable } from "../shared/failuresDataQuality";
import {
    buildRawRDistribution, buildBucketDrilldown,
    buildFailureDrivers, buildPairDrivers,
} from "../shared/excursionAnalytics";

const FLAG_TONE = { instant: "danger", almost: "success" };

function Contribution({ pct }) {
    return <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{pct}%</span>;
}

// One clickable bucket bar.
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
            {b.flag
                ? <Pill tone={FLAG_TONE[b.flag]}>{b.flag === "instant" ? "instant" : "almost"}</Pill>
                : <span className="w-[52px]" />}
        </button>
    );
}

// Compact ranked section for one dimension inside the drilldown.
function DrillSection({ section }) {
    const max = Math.max(...section.rows.map((r) => r.lossR), 1);
    return (
        <div>
            <div className="text-[10px] font-ui font-semibold uppercase tracking-[0.06em] text-[hsl(var(--accent-secondary))] mb-1.5">{section.label}</div>
            <div className="space-y-1">
                {section.rows.map((r) => (
                    <div key={r.value} className="flex items-center gap-2 text-[11.5px] font-ui">
                        <span className="w-28 shrink-0 truncate text-[hsl(var(--text))]">{r.value}</span>
                        <div className="flex-1 h-1.5 bg-[hsl(var(--panel-2))] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[hsl(var(--danger)/0.7)]" style={{ width: `${Math.min(100, (r.lossR / max) * 100)}%` }} />
                        </div>
                        <span className="w-7 text-right font-num tabular-nums text-white">{r.count}</span>
                        <span className="w-12 text-right font-num tabular-nums text-[hsl(var(--text-2))]">{r.lossR}R</span>
                        <span className="w-10 text-right"><Contribution pct={r.contributionPct} /></span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ExcursionAnalysis({ losers = [], allLosers = [], config = {} }) {
    const source = losers.length ? losers : allLosers;
    const available = useMemo(() => isModuleAvailable("excursion", source), [source]);
    const dist = useMemo(() => buildRawRDistribution(source), [source]);
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

    // ── Gated empty state ──────────────────────────────────────────────────────
    if (!available || dist.coverage.withMfe === 0) {
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

            {/* ── Bucket distribution (clickable) ───────────────────────────── */}
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

            {/* ── Selected-bucket drilldown ─────────────────────────────────── */}
            {drill && activeBucketDef && (
                <NeonPanel
                    title={<>Selected bucket: <span className="text-[hsl(var(--accent-primary))]">{activeBucketDef.label}</span></>}
                    tone="secondary"
                    action={
                        <div className="flex items-center gap-1.5">
                            <Pill tone="muted">{drill.trades} trades</Pill>
                            <Pill tone="danger">{drill.lossR}R</Pill>
                            <Pill tone="secondary">{drill.contributionPct}% of loss-R</Pill>
                        </div>
                    }
                >
                    {drill.sections.length ? (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
                            {drill.sections.map((s) => <DrillSection key={s.key} section={s} />)}
                        </div>
                    ) : (
                        <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No trades in this bucket.</div>
                    )}
                </NeonPanel>
            )}

            {/* ── Top failure drivers (single factor, all losers) ───────────── */}
            <NeonPanel
                title="Top failure drivers"
                action={<Pill tone="muted">ranked by loss-R · min {drivers.minSample} trades</Pill>}
            >
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
