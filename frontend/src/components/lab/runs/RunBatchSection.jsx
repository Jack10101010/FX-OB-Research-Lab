// RunBatchSection.jsx — Runs page "Cards" view (Phase 1).
//
// Corrected hierarchy: one run folder = a Run Batch SECTION; each internal scenario = a compact Scenario CARD.
// Read-only. Metrics come from summary.json → entry_results (via buildRunBatch). No fabricated values; missing
// per-scenario blocked counts render as "—". Intra-batch scenario comparison is inherently fair (same config).

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { buildRunBatch, CONTEXT_MODES, formatDate as fmtDate } from "@/data/runs/scenarioPresentation";

const LAYER_TONE = {
    market_state_gate: "accent-secondary",
    portfolio_manager: "warning",
    session_policy: "accent-primary",
};
const FAMILY_TONE = {
    baseline: "border-mid",
    triggered_entry: "accent-secondary",
    session_scenarios: "accent-primary", // prominent — the user must instantly see this
    fair_baseline: "success",
};
const CONTEXT_TONE = {
    [CONTEXT_MODES.WARMED]: "success",
    [CONTEXT_MODES.COLD]: "warning",
    [CONTEXT_MODES.PRELOAD]: "accent-secondary",
    [CONTEXT_MODES.UNKNOWN]: "border-mid",
};
const CONTEXT_LABEL = {
    [CONTEXT_MODES.WARMED]: "FULL-HISTORY WARMED",
    [CONTEXT_MODES.COLD]: "COLD WINDOW START",
    [CONTEXT_MODES.PRELOAD]: "WINDOW + PRELOAD",
    [CONTEXT_MODES.UNKNOWN]: "UNKNOWN CONTEXT",
};

function Chip({ tone = "border-mid", filled = false, muted = false, children }) {
    const style = filled
        ? { background: `hsl(var(--${tone}))`, borderColor: `hsl(var(--${tone}))`, color: "hsl(var(--bg-0,var(--panel)))" }
        : muted
            ? { borderColor: "hsl(var(--border-soft))", color: "hsl(var(--text-2))", opacity: 0.7 }
            : { borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` };
    return (
        <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui" style={style}>
            {children}
        </span>
    );
}

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
const rTone = (v) => (v === null || v === undefined ? "text-2" : v > 0 ? "success" : v < 0 ? "danger" : "text-2");

function ScenarioCard({ s, storeId }) {
    const best = s.isBestNetRTE || s.isBestNetDdTE || s.isBestNetR || s.isBestNetDd;
    const ring = best ? "hsl(var(--accent-secondary))" : "hsl(var(--border-soft))";
    return (
        <Link
            to={`/runs/${encodeURIComponent(storeId)}`}
            className="block rounded-md border bg-[hsl(var(--panel))] p-2 hover:border-[hsl(var(--accent-primary))] transition-colors"
            style={{ borderColor: ring }}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-ui text-[hsl(var(--text-1))]">{s.label}</span>
                <div className="flex gap-1">
                    {s.isBestNetRTE && <Chip tone="accent-secondary">Best Net R</Chip>}
                    {s.isBestNetDdTE && <Chip tone="accent-secondary">Best Net/DD</Chip>}
                </div>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] font-ui">
                <div>Net R <span style={{ color: `hsl(var(--${rTone(s.netR)}))` }}>{fmt(s.netR)}</span></div>
                <div className="text-muted-lab">Max DD {fmt(s.maxDd)}</div>
                <div className="text-muted-lab">Net/DD {fmt(s.netDd)}</div>
                <div className="text-muted-lab">PF {s.profitFactor === null ? "—" : fmt(s.profitFactor)}</div>
                <div className="text-muted-lab">WR {s.winRate === null ? "—" : `${fmt(s.winRate, 1)}%`}</div>
                <div className="text-muted-lab">filled {s.filledTrades ?? "—"}</div>
                <div className="text-muted-lab">missed {s.missed ?? "—"}</div>
                <div className="text-muted-lab">blocked {s.blockedRegime === null ? "—" : s.blockedRegime}</div>
            </div>
            {s.deltaVsBaseline && (
                <div className="mt-1 text-[10px] font-ui text-muted-lab">
                    Δ vs baseline: Net R{" "}
                    <span style={{ color: `hsl(var(--${rTone(s.deltaVsBaseline.netR)}))` }}>
                        {s.deltaVsBaseline.netR > 0 ? "+" : ""}{fmt(s.deltaVsBaseline.netR)}
                    </span>{" "}
                    <span className="opacity-70">(fair · same config)</span>
                </div>
            )}
        </Link>
    );
}

export default function RunBatchSection({ run, getRunData }) {
    const storeId = run?._bundleId || run?.id;
    const bundle = typeof getRunData === "function" ? getRunData(storeId) : null;
    const merged = {
        ...run,
        config: bundle?.config || run?.config,
        entryResults: bundle?.entryResults || run?.entryResults,
        scenarioBaselineResults: bundle?.scenarioBaselineResults || run?.scenarioBaselineResults,
        runMetadata: run?.runMetadata || run?.run_metadata || bundle?.runMetadata || bundle?.run_metadata,
    };
    const batch = buildRunBatch(merged);
    const ctxTone = CONTEXT_TONE[batch.contextMode] || "border-mid";
    const [showAll, setShowAll] = useState(false);
    const [showAllGroups, setShowAllGroups] = useState(false);

    const shown = showAll ? batch.scenarios : batch.defaultScenarios;
    const compact = batch.canCollapse && !showAll;
    const bs = batch.bestSummary;

    return (
        <section className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-1,var(--panel)))] p-3">
            {/* ROW 1: title + status/context */}
            <div className="flex flex-wrap items-center gap-2">
                <Link to={`/runs/${encodeURIComponent(storeId)}`} className="text-[12.5px] font-ui text-[hsl(var(--accent-primary))] hover:text-white">
                    {batch.symbol} · {batch.scenarioType}
                </Link>
                <Chip tone={ctxTone}>{CONTEXT_LABEL[batch.contextMode]}{batch.contextConfidence ? ` · ${batch.contextConfidence}` : ""}</Chip>
                {batch.status && <Chip tone="border-mid">{batch.status}</Chip>}
                <span className="ml-auto text-[10px] text-muted-lab font-ui">
                    #{batch.shortRunId}{batch.configHashShort ? ` / cfg ${batch.configHashShort}` : ""}
                </span>
            </div>

            {/* ROW 2: prominent date range */}
            <div className="mt-1 text-[14px] font-ui text-[hsl(var(--text-1))]">{batch.dateRange}</div>
            <div className="text-[10px] font-ui text-muted-lab">
                {batch.warmupStart
                    ? <>context: preloaded from <span className="text-[hsl(var(--text-2))]">{fmtDate(batch.warmupStart)}</span></>
                    : (batch.contextMode === CONTEXT_MODES.COLD ? <span style={{ color: "hsl(var(--warning))" }}>cold start — no prior context loaded</span> : null)}
            </div>

            {/* ROW 3: RAN IN THIS BATCH (bright/active) */}
            {(batch.ranFamilies.length > 0 || batch.activeLayers.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] uppercase tracking-wide text-[hsl(var(--success))] font-ui mr-1">Ran in this batch</span>
                    {batch.ranFamilies.map((f) => (
                        <Chip key={f.family} filled tone={FAMILY_TONE[f.family] || "success"}>
                            ✓ {f.label}{f.count ? ` · ${f.count}${f.family === "triggered_entry" ? " variants" : (f.family === "session_scenarios" ? " cohorts" : "")}` : ""}
                        </Chip>
                    ))}
                    {batch.activeLayers.map((l) => (
                        <Chip key={l.layer} filled tone={LAYER_TONE[l.layer] || "accent-secondary"}>
                            ✓ {l.label}{l.directionAware ? " · dir-aware" : ""}
                        </Chip>
                    ))}
                </div>
            )}

            {/* ROW 4: NOT RUN / ABSENT (muted) */}
            {batch.notRunMajor.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] uppercase tracking-wide text-muted-lab font-ui mr-1">Not run</span>
                    {batch.notRunMajor.map((m) => (
                        <Chip key={m.key} muted>
                            {m.label}: {m.status === "no_output" ? "no eligible output" : "not run"}
                        </Chip>
                    ))}
                </div>
            )}

            {/* ROW 5: secondary config (demoted) */}
            <div className="mt-1.5 flex flex-wrap gap-1 opacity-60">
                {batch.baseConfigChips.map((c, i) => <Chip key={i} muted>{c}</Chip>)}
            </div>

            {/* Context / warm-up warnings (only when heuristic/cold) */}
            {batch.contextWarning.length > 0 && (
                <div className="mt-2 text-[10px] font-ui" style={{ color: `hsl(var(--${ctxTone}))` }}>
                    {batch.contextWarning.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
            )}
            {batch.warnings.filter((w) => /No scenario/.test(w)).map((w, i) => (
                <div key={i} className="mt-1 text-[10px] font-ui text-[hsl(var(--warning))]">⚠ {w}</div>
            ))}

            {/* Compact summary + expand control (only when trigger×arm variants are collapsed) */}
            {batch.canCollapse && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-ui text-muted-lab">
                    <span>
                        {batch.teVariantCount} triggered-entry variant{batch.teVariantCount === 1 ? "" : "s"} tested
                        {compact ? " · showing best" : " · showing all"}
                    </span>
                    {compact && bs.bestNetRLabel && (
                        <span>· Best Net R: <span className="text-[hsl(var(--text-1))]">{bs.bestNetRLabel}</span>
                            {bs.bestNetRNetR !== null ? ` · ${bs.bestNetRNetR > 0 ? "+" : ""}${bs.bestNetRNetR}R` : ""}</span>
                    )}
                    {compact && bs.bestNetDdLabel && (
                        <span>· Best Net/DD: <span className="text-[hsl(var(--text-1))]">{bs.bestNetDdLabel}</span></span>
                    )}
                    <button
                        type="button"
                        data-testid="runs-scenario-toggle"
                        onClick={() => setShowAll((v) => !v)}
                        className="underline text-[hsl(var(--accent-primary))] hover:text-white"
                    >
                        {showAll ? "Hide variants" : `Show all variants (${batch.scenarioCount})`}
                    </button>
                </div>
            )}
            {compact && batch.triggerVariantGroups.length > 0 && (
                <div className="mt-1 text-[10px] font-ui text-muted-lab">
                    <span className="uppercase tracking-wide mr-1">Variants tested</span>
                    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5 align-top">
                        {batch.triggerVariantGroups.slice(0, showAllGroups ? undefined : 4).map((g) => (
                            <span key={g.trigger}>
                                <span className="text-[hsl(var(--text-2))]">{g.trigger}:</span> {g.arms.join(" · ")}
                            </span>
                        ))}
                        {!showAllGroups && batch.triggerVariantGroups.length > 4 && (
                            <button type="button" onClick={() => setShowAllGroups(true)} className="underline text-[hsl(var(--accent-primary))] hover:text-white">
                                + {batch.triggerVariantGroups.length - 4} more
                            </button>
                        )}
                    </span>
                </div>
            )}

            {/* Scenario grid */}
            {shown.length > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {shown.map((s) => <ScenarioCard key={s.scenarioKey} s={s} storeId={storeId} />)}
                </div>
            )}
        </section>
    );
}
