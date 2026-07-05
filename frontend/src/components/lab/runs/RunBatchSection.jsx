// RunBatchSection.jsx — Runs page "Cards" view (Phase 1).
//
// Corrected hierarchy: one run folder = a Run Batch SECTION; each internal scenario = a compact Scenario CARD.
// Read-only. Metrics come from summary.json → entry_results (via buildRunBatch). No fabricated values; missing
// per-scenario blocked counts render as "—". Intra-batch scenario comparison is inherently fair (same config).

import React from "react";
import { Link } from "react-router-dom";
import { buildRunBatch, CONTEXT_MODES } from "@/data/runs/scenarioPresentation";

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

function Chip({ tone = "border-mid", children }) {
    return (
        <span
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}
        >
            {children}
        </span>
    );
}

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
const rTone = (v) => (v === null || v === undefined ? "text-2" : v > 0 ? "success" : v < 0 ? "danger" : "text-2");

function ScenarioCard({ s, storeId }) {
    const ring = s.isBestNetR || s.isBestNetDd ? "hsl(var(--accent-secondary))" : "hsl(var(--border-soft))";
    return (
        <Link
            to={`/runs/${encodeURIComponent(storeId)}`}
            className="block rounded-md border bg-[hsl(var(--panel))] p-2 hover:border-[hsl(var(--accent-primary))] transition-colors"
            style={{ borderColor: ring }}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-ui text-[hsl(var(--text-1))]">{s.label}</span>
                <div className="flex gap-1">
                    {s.isBestNetR && <Chip tone="accent-secondary">best NetR</Chip>}
                    {s.isBestNetDd && <Chip tone="accent-secondary">best N/DD</Chip>}
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
    const merged = { ...run, config: bundle?.config || run?.config, entryResults: bundle?.entryResults || run?.entryResults };
    const batch = buildRunBatch(merged);
    const ctxTone = CONTEXT_TONE[batch.contextMode] || "border-mid";

    return (
        <section className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-1,var(--panel)))] p-3">
            {/* Batch header */}
            <div className="flex flex-wrap items-center gap-2">
                <Link to={`/runs/${encodeURIComponent(storeId)}`} className="text-[12.5px] font-ui text-[hsl(var(--accent-primary))] hover:text-white">
                    {batch.title || batch.symbol || batch.shortRunId}
                </Link>
                <Chip tone="border-mid">{batch.scenarioType}</Chip>
                <Chip tone={ctxTone}>{CONTEXT_LABEL[batch.contextMode]}{batch.contextConfidence === "heuristic" ? " · heuristic" : ""}</Chip>
                {batch.status && <Chip tone="border-mid">{batch.status}</Chip>}
                <span className="ml-auto text-[10px] text-muted-lab font-ui">
                    {batch.scenarioCount} scenario{batch.scenarioCount === 1 ? "" : "s"} · #{batch.shortRunId}{batch.configHashShort ? ` / cfg ${batch.configHashShort}` : ""}
                </span>
            </div>

            {/* Base config chips (run-level) */}
            <div className="mt-1.5 flex flex-wrap gap-1">
                <Chip tone="border-mid">{batch.dateRange}</Chip>
                {batch.baseConfigChips.map((c, i) => <Chip key={i} tone="border-mid">{c}</Chip>)}
            </div>

            {/* Context / warm-up warnings (heuristic) */}
            {batch.contextWarning.length > 0 && (
                <div className="mt-2 text-[10px] font-ui" style={{ color: `hsl(var(--${ctxTone}))` }}>
                    {batch.contextWarning.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
            )}
            {batch.warnings.filter((w) => /No scenario/.test(w)).map((w, i) => (
                <div key={i} className="mt-1 text-[10px] font-ui text-[hsl(var(--warning))]">⚠ {w}</div>
            ))}

            {/* Scenario grid */}
            {batch.scenarios.length > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {batch.scenarios.map((s) => <ScenarioCard key={s.scenarioKey} s={s} storeId={storeId} />)}
                </div>
            )}
        </section>
    );
}
