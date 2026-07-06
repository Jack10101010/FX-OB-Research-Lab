// RunBatchSection.jsx — Runs page "Cards" view (Phase 1).
//
// Corrected hierarchy: one run folder = a Run Batch SECTION; each internal scenario = a compact Scenario CARD.
// Read-only. Metrics come from summary.json → entry_results (via buildRunBatch). No fabricated values; missing
// per-scenario blocked counts render as "—". Intra-batch scenario comparison is inherently fair (same config).

import React, { useState } from "react";
import { Link } from "react-router-dom";
import { buildRunBatch, CONTEXT_MODES, formatDate as fmtDate } from "@/data/runs/scenarioPresentation";

// Distinct, high-contrast colours per family/layer so a run's composition is readable at a glance.
// Most use existing theme tokens; Triggered Entry (light purple) and Market State Gate (yellow) use fixed
// HSL values because no theme token renders reliably purple/yellow across every theme (requested explicitly).
// Fair Baseline shares Session Scenarios' colour because it only runs alongside session scenarios.
const FAMILY_TONE = {
    baseline: "accent-secondary",   // secondary accent blue
    session_scenarios: "success",   // green
    fair_baseline: "success",       // same as session scenarios (they run together)
};
const LAYER_TONE = {
    portfolio_manager: "danger",    // red
    session_policy: "success",      // green (session family)
};
// Fixed HSL triplets (theme-independent) for the two chips the user pinned to specific colours.
const FAMILY_COLOR = {
    triggered_entry: "270 90% 80%", // light purple
};
const LAYER_COLOR = {
    market_state_gate: "52 100% 60%", // yellow
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

function Chip({ tone = "accent-secondary", color = null, filled = false, muted = false, active = false, children }) {
    // `active`: RAN/enabled state — bright text on a faint tint of the same colour. Reads as clearly "on"/lit
    // and stays legible on the dark panel, without a solid-button look. Colour is either an explicit HSL triplet
    // (`color`, for the pinned purple/yellow chips) or a theme token (`tone`). `muted`: absent. `filled`: solid.
    const c = color ? color : `var(--${tone})`;
    let style;
    if (active) {
        style = {
            background: `hsl(${c} / 0.14)`,
            borderColor: `hsl(${c})`,
            color: `hsl(${c})`,
        };
    } else if (filled) {
        style = { background: `hsl(var(--${tone}))`, borderColor: `hsl(var(--${tone}))`, color: "hsl(var(--bg-0,var(--panel)))" };
    } else if (muted) {
        style = { borderColor: "hsl(var(--border-soft))", color: "hsl(var(--text-2))", opacity: 0.7 };
    } else {
        style = { borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` };
    }
    return (
        <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui font-medium" style={style}>
            {children}
        </span>
    );
}

const fmt = (v, d = 2) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
const rTone = (v) => (v === null || v === undefined ? "text-2" : v > 0 ? "success" : v < 0 ? "danger" : "text-2");

function Metric({ label, value, tone }) {
    return (
        <div>
            <span className="text-[9px] uppercase tracking-wide text-muted-lab font-ui">{label} </span>
            <span className="text-[11.5px] font-ui" style={{ color: tone ? `hsl(var(--${tone}))` : "hsl(var(--text-1))" }}>{value}</span>
        </div>
    );
}

function ScenarioCard({ s, storeId }) {
    const best = s.isBestNetRTE || s.isBestNetDdTE || s.isBestNetR || s.isBestNetDd;
    const ring = best ? "hsl(var(--accent-secondary))" : "hsl(var(--border-soft))";
    const scenarioParam = s.scenarioKey ? `?scenario=${encodeURIComponent(s.scenarioKey)}` : "";
    return (
        <Link
            to={`/runs/${encodeURIComponent(storeId)}${scenarioParam}`}
            className="block rounded-md border bg-[hsl(var(--panel))] p-2 hover:border-[hsl(var(--accent-primary))] transition-colors"
            style={{ borderColor: ring }}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="text-[12.5px] font-ui font-semibold text-[hsl(var(--text-1))]">{s.label}</span>
                <div className="flex gap-1">
                    {s.isBestNetRTE && <Chip active>Best Net R</Chip>}
                    {s.isBestNetDdTE && <Chip active>Best Net/DD</Chip>}
                </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
                <Metric label="Net R" value={fmt(s.netR)} tone={rTone(s.netR)} />
                <Metric label="Max DD" value={fmt(s.maxDd)} tone={s.maxDd === null || s.maxDd === undefined ? undefined : "danger"} />
                <Metric label="Net/DD" value={fmt(s.netDd)} />
                <Metric label="PF" value={s.profitFactor === null ? "—" : fmt(s.profitFactor)} />
                <Metric label="WR" value={s.winRate === null ? "—" : `${fmt(s.winRate, 1)}%`} />
                <Metric label="filled" value={s.filledTrades ?? "—"} />
                <Metric label="missed" value={s.missed ?? "—"} />
                <Metric label="blocked" value={s.blockedRegime === null ? "—" : s.blockedRegime} />
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
    const hasMsGate = batch.activeLayers.some((l) => l.layer === "market_state_gate");
    // The context mode (WARMED / PRELOAD / UNKNOWN) is a date-span heuristic and only carries meaning when a
    // context-sensitive layer (the Market State gate) actually ran. With no gate active, "FULL-HISTORY WARMED"
    // etc. is noise — de-emphasise the badge (muted, no "· heuristic" suffix). COLD stays prominent because its
    // OB/cold-window caveat is genuine regardless of the gate.
    const contextMuted = !hasMsGate && batch.contextMode !== CONTEXT_MODES.COLD;
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
                {/* The context mode is a date-span heuristic; it only means something when the Market State
                    gate ran (or a COLD window). Otherwise it's noise (WARMED vs UNKNOWN on equivalent runs),
                    so hide it entirely rather than show two confusing labels. */}
                {!contextMuted && (
                    <Chip tone={ctxTone}>
                        {CONTEXT_LABEL[batch.contextMode]}{batch.contextConfidence ? ` · ${batch.contextConfidence}` : ""}
                    </Chip>
                )}
                {batch.status && <Chip tone="border-mid">{batch.status}</Chip>}
                <span className="ml-auto text-[10px] text-muted-lab font-ui">
                    #{batch.shortRunId}{batch.configHashShort ? ` / cfg ${batch.configHashShort}` : ""}
                </span>
            </div>

            {/* Two-column header: details left, triggered-entry panel right.
                `items-start` keeps both columns top-aligned so the right panel never stretches, and the
                panel is kept compact so it isn't the tallest element — the scenario grid below then sits
                directly under the header without vertical dead space. */}
            <div className="mt-1 flex flex-col lg:flex-row lg:items-start lg:gap-4">
                {/* LEFT: window, families, config, warnings */}
                <div className="min-w-0 flex-1">
                    {/* prominent date range + span in months (│ separator) */}
                    <div className="text-[14px] font-ui text-[hsl(var(--text-1))]">
                        {batch.dateRange}
                        {batch.spanMonths ? (
                            <span className="text-[hsl(var(--text-2))]"> │ <span className="text-[12px]">{batch.spanMonths} months</span></span>
                        ) : null}
                    </div>
                    <div className="text-[10px] font-ui text-muted-lab">
                        {batch.warmupStart
                            ? <>context: preloaded from <span className="text-[hsl(var(--text-2))]">{fmtDate(batch.warmupStart)}</span></>
                            : (batch.contextMode === CONTEXT_MODES.COLD ? <span style={{ color: "hsl(var(--warning))" }}>cold start — no prior context loaded</span> : null)}
                    </div>

                    {/* RAN IN THIS BATCH (bright/active) */}
                    {(batch.ranFamilies.length > 0 || batch.activeLayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="text-[9px] uppercase tracking-wide text-[hsl(var(--success))] font-ui mr-1">Ran in this batch</span>
                            {batch.ranFamilies.map((f) => (
                                <Chip key={f.family} active tone={FAMILY_TONE[f.family] || "accent-secondary"} color={FAMILY_COLOR[f.family]}>
                                    ✓ {f.label}{f.count ? ` · ${f.count}${f.family === "triggered_entry" ? " variants" : (f.family === "session_scenarios" ? " cohorts" : "")}` : ""}
                                </Chip>
                            ))}
                            {batch.activeLayers.map((l) => (
                                <Chip key={l.layer} active tone={LAYER_TONE[l.layer] || "accent-secondary"} color={LAYER_COLOR[l.layer]}>
                                    ✓ {l.label}{l.directionAware ? " · dir-aware" : ""}
                                </Chip>
                            ))}
                        </div>
                    )}

                    {/* NOT RUN / ABSENT (muted) */}
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

                    {/* secondary config — a consistent slot set; unrecorded fields render muted ("n/a") */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[9px] uppercase tracking-wide text-muted-lab font-ui mr-1">Config</span>
                        {batch.baseConfigChips.map((c, i) => <Chip key={i} tone="accent-primary" muted={c.absent}>{c.text}</Chip>)}
                    </div>

                    {/* Context / warm-up warnings (structured, gated, per-warning tone) */}
                    {batch.contextWarnings.filter((w) => w.show).length > 0 && (
                        <div className="mt-2 space-y-0.5 text-[10px] font-ui">
                            {batch.contextWarnings.filter((w) => w.show).map((w, i) => (
                                <div key={w.type || i} style={{ color: `hsl(var(--${w.tone || ctxTone}))` }}>⚠ {w.text}</div>
                            ))}
                        </div>
                    )}
                    {batch.warnings.filter((w) => /No scenario/.test(w)).map((w, i) => (
                        <div key={i} className="mt-1 text-[10px] font-ui text-[hsl(var(--warning))]">⚠ {w}</div>
                    ))}
                </div>

                {/* RIGHT: compact triggered-entry variant panel (only when TE variants exist).
                    Kept short (inline-wrapped variants, single best line) so it never dominates header height. */}
                {batch.triggerVariantGroups.length > 0 && (
                    <div className="mt-3 lg:mt-0 lg:w-72 shrink-0 overflow-hidden rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-2 py-1.5">
                        <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wide text-[hsl(var(--accent-secondary))] font-ui">Triggered Entry</span>
                            <span className="text-[9px] font-ui text-muted-lab">{batch.teVariantCount} variant{batch.teVariantCount === 1 ? "" : "s"}</span>
                        </div>
                        {compact && bs.bestNetRLabel && (
                            <div className="mt-1 text-[10px] font-ui text-muted-lab leading-tight break-words">
                                Best: <span className="text-[hsl(var(--text-1))]">{bs.bestNetRLabel}</span>
                                {bs.bestNetRNetR !== null ? ` · ${bs.bestNetRNetR > 0 ? "+" : ""}${bs.bestNetRNetR}R` : ""}
                                {bs.bestNetDdLabel ? <span className="text-muted-lab"> · best Net/DD {bs.bestNetDdLabel}</span> : null}
                            </div>
                        )}
                        {/* one threshold per line; long arm lists WRAP inside the panel (never overflow right) */}
                        <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-ui text-muted-lab leading-tight">
                            {batch.triggerVariantGroups.slice(0, showAllGroups ? undefined : 4).map((g) => (
                                <div key={g.trigger} className="break-words">
                                    <span className="text-[hsl(var(--text-2))]">{g.trigger}:</span> {g.arms.join(" · ")}
                                </div>
                            ))}
                            {!showAllGroups && batch.triggerVariantGroups.length > 4 && (
                                <button type="button" onClick={() => setShowAllGroups(true)} className="self-start underline text-[hsl(var(--accent-secondary))] hover:text-white">
                                    +{batch.triggerVariantGroups.length - 4} more
                                </button>
                            )}
                        </div>
                        {batch.canCollapse && (
                            <button
                                type="button"
                                data-testid="runs-scenario-toggle"
                                onClick={() => setShowAll((v) => !v)}
                                className="mt-1 underline text-[10px] font-ui text-[hsl(var(--accent-secondary))] hover:text-white"
                            >
                                {showAll ? "Hide variants" : `Show all (${batch.scenarioCount})`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Scenario grid */}
            {shown.length > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {shown.map((s) => <ScenarioCard key={s.scenarioKey} s={s} storeId={storeId} />)}
                </div>
            )}
        </section>
    );
}
