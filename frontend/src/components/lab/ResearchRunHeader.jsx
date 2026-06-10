/**
 * ResearchRunHeader — the Run Detail "Result View" header, extracted verbatim
 * into a reusable, fully CONTROLLED component (RUN-VARIANT-HEADER Phase 2).
 *
 * This is the premium research-cockpit band that shows the entry-model controls
 * on the left and the dominant "Current Result View" panel on the right. It owns
 * NO state: the parent passes the current `resultView` + derived option lists and
 * receives lens changes through `onResultViewChange` (which the parent routes to
 * the canonical store scenario via `useRunVariant`). Pull it out of RunDetail so
 * Strategy Map / Hypothesis Lab can adopt the exact same surface in a later phase.
 *
 * User-facing terminology (locked, RUN-VARIANT-HEADER-AUDIT-1 §7):
 *   • the lens itself stays "Result View"
 *   • axis-1 (the exported position slice) is labelled "Position Variant"
 *
 * The Arm C0 / Arm C1 double-count warning is surfaced unchanged — this component
 * never merges fill modes; it only displays the resolver's warnings.
 *
 * Props contract (RUN-VARIANT-HEADER-AUDIT-1 §5):
 *   resultView              { family, threshold, fillMode, directionalStorageKey }
 *   onResultViewChange      (next) => void
 *   resultViewOptions       ResultViewOption[]      (from buildAvailableOptions)
 *   activeResultViewOption  ResultViewOption | null
 *   universe                TradeUniverse           (for warnings + label)
 *   isScenarioView          boolean
 *   isDirectionalView       boolean
 *   directionalStorageKey   string | null
 *   hasSelectedUniverseTrades boolean
 *   selectedTradeCount      number                  (selected universe trade count)
 *   legacyTradeCount        number                  (baseline/legacy trade count)
 *   scopeChip               { isIndexOnly, variantLabel, globalBasisLabel,
 *                             accountSimulation, accountViewSub }
 *   baselineParityAudit     { match, legacyCount, universeCount } | null (dev only)
 */

import React from "react";
import { Pill } from "@/components/lab/DataTable";
import { formatDirectionalScenarioLabel } from "@/components/lab/entries/analytics/entryFormatters";

// Local presentational helper (mirrors RunDetail's ScopeRow — uppercase metadata
// eyebrow + inline value, within the AGENTS.md tracking ceiling).
function ScopeRow({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab">
                {label}
            </span>
            {children}
        </span>
    );
}

export default function ResearchRunHeader({
    resultView,
    onResultViewChange,
    resultViewOptions = [],
    activeResultViewOption = null,
    universe = null,
    isScenarioView = false,
    isDirectionalView = false,
    directionalStorageKey = null,
    hasSelectedUniverseTrades = false,
    selectedTradeCount = 0,
    legacyTradeCount = 0,
    scopeChip = {},
    baselineParityAudit = null,
}) {
    const setResultView = onResultViewChange || (() => {});

    return (
        <div className="px-6 mb-2">
            {scopeChip.isIndexOnly ? (
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                    <ScopeRow label="Status"><Pill tone="warning">Index-only metadata</Pill></ScopeRow>
                </div>
            ) : (
                <>
                    {(() => {
                        // ── Derived selection state ───────────────────────────────────────
                        const selModel     = (!resultView?.family || resultView.family === "baseline") ? "baseline" : resultView.family;
                        const selThreshold = resultView?.threshold ?? null;
                        const selFillMode  = resultView?.fillMode  ?? null;

                        const availFamilies = new Set(resultViewOptions.map((o) => o.family));

                        const ALL_HINT_THRESHOLDS = [10, 25, 50, 75];
                        const modelThresholds = [...new Set([
                            ...resultViewOptions
                                .filter((o) => o.family === selModel)
                                .map((o) => o.threshold)
                                .filter((t) => t != null),
                            ...ALL_HINT_THRESHOLDS,
                        ])].sort((a, b) => a - b);
                        const availModelThresholds = new Set(
                            resultViewOptions
                                .filter((o) => o.family === selModel)
                                .map((o) => o.threshold),
                        );

                        const availFillModes = new Set(
                            resultViewOptions
                                .filter((o) => o.family === selModel && o.threshold === selThreshold)
                                .map((o) => o.fillMode),
                        );

                        const pickFillMode = (family, threshold, preferFm) => {
                            const opts = resultViewOptions
                                .filter((o) => o.family === family && o.threshold === threshold)
                                .map((o) => o.fillMode);
                            if (opts.includes(preferFm)) return preferFm;
                            if (opts.includes(null))    return null;
                            if (opts.includes("same"))  return "same";
                            if (opts.includes("next"))  return "next";
                            return null;
                        };
                        const pickThreshold = (family, preferThresh) => {
                            const opts = resultViewOptions
                                .filter((o) => o.family === family)
                                .map((o) => o.threshold)
                                .filter((t) => t != null)
                                .sort((a, b) => a - b);
                            if (opts.includes(preferThresh)) return preferThresh;
                            return opts[0] ?? null;
                        };

                        const ENTRY_MODELS = [
                            { key: "baseline",       label: "Baseline" },
                            { key: "penetration",    label: "Penetration" },
                            { key: "triggered_edge", label: "Triggered Edge" },
                        ];
                        const FILL_MODE_SLOTS = [
                            { fillMode: null,   label: "Both" },
                            { fillMode: "same", label: "Same candle" },
                            { fillMode: "next", label: "Next candle" },
                            { fillMode: "d2",   label: "Delay +2" },
                            { fillMode: "d3",   label: "Delay +3" },
                        ];

                        const showThresholdRow = selModel !== "baseline";
                        const showFillModeRow  = selModel === "triggered_edge" && selThreshold != null; // RW-11A: penetration has no fill mode

                        const btnActive = "bg-[hsl(var(--accent-primary)/0.15)] border-[hsl(var(--accent-primary)/0.55)] text-[hsl(var(--accent-primary))]";
                        const btnIdle   = "bg-transparent border-[hsl(var(--border-soft))] text-[hsl(var(--text-muted))] hover:border-[hsl(var(--accent-primary)/0.4)] hover:text-[hsl(var(--text-base))]";
                        const btnDim    = "border-[hsl(var(--border-soft)/0.3)] text-[hsl(var(--text-muted)/0.35)] cursor-default";
                        const btnBase   = "px-2.5 py-[3px] text-[11px] font-ui tracking-[0.02em] border clip-bevel-sm transition-colors select-none whitespace-nowrap";
                        const btnSm     = "px-2 py-[2px] text-[11px] font-ui tracking-[0.02em] border clip-bevel-sm transition-colors select-none whitespace-nowrap";

                        // ── Summary vars ─────────────────────────────────────────────────
                        const identityLabel = !isScenarioView
                            ? (activeResultViewOption?.label || "Baseline Reference")
                            : (activeResultViewOption?.label || universe?.label || String(resultView?.family || ""));
                        const analyticsChipLabel = !isScenarioView ? "Baseline trades"
                            : isDirectionalView ? (hasSelectedUniverseTrades ? "Backend · Split-pass" : "Baseline fallback")
                            : hasSelectedUniverseTrades ? "Scenario trades"
                            : "Baseline fallback";
                        const isUnavailable = isScenarioView && !hasSelectedUniverseTrades;

                        // ── RW-13: prominent current view string ──────────────────────────
                        const currentViewDisplay = (() => {
                            if (!isScenarioView) return "Baseline Reference";
                            const fam = resultView?.family;
                            const thr = resultView?.threshold;
                            if (fam === "directional") {
                                const sk = resultView?.directionalStorageKey || "";
                                const scenarioId = sk.replace(/^[^_]+__/, "");
                                return formatDirectionalScenarioLabel(scenarioId) || identityLabel;
                            }
                            if (fam === "penetration") return thr != null ? `Penetration ${thr}%` : "Penetration";
                            if (fam === "triggered_edge") {
                                const base = thr != null ? `Triggered Edge ${thr}%` : "Triggered Edge";
                                const mode = selFillMode === "same" ? " · Same Candle"
                                           : selFillMode === "next" ? " · Next Candle"
                                           : selFillMode === "d2"   ? " · Delay +2"
                                           : selFillMode === "d3"   ? " · Delay +3"
                                           : " · Both";
                                return base + mode;
                            }
                            return identityLabel;
                        })();

                        return (
                            <div className={[
                                "clip-bevel-sm border mb-2 preview-surface",
                                isScenarioView
                                    ? hasSelectedUniverseTrades
                                        ? "border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.05)]"
                                        : "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.05)]"
                                    : "border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.2)]",
                            ].join(" ")}>
                                <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] divide-y xl:divide-y-0 xl:divide-x divide-[hsl(var(--border-soft)/0.3)]">

                                    {/* Left col: Entry Model controls + scope row */}
                                    <div className="px-4 py-3">
                                        <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                                            Entry Model
                                        </div>
                                        {/* Row A — Model selector */}
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            {ENTRY_MODELS.map(({ key, label }) => {
                                                const isAvail  = availFamilies.has(key);
                                                const isActive = selModel === key;
                                                return isAvail ? (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => {
                                                            if (key === "baseline") {
                                                                setResultView({ family: "baseline", threshold: null, fillMode: null });
                                                            } else {
                                                                const t  = pickThreshold(key, selThreshold);
                                                                const fm = pickFillMode(key, t, selFillMode);
                                                                setResultView({ family: key, threshold: t, fillMode: fm });
                                                            }
                                                        }}
                                                        className={[btnBase, isActive ? btnActive : btnIdle].join(" ")}
                                                    >
                                                        {label}
                                                    </button>
                                                ) : (
                                                    <span
                                                        key={key}
                                                        className={[btnBase, btnDim].join(" ")}
                                                        title="No data for this entry model in this run."
                                                    >
                                                        {label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        {/* Row B — Threshold (only for non-baseline models) */}
                                        {showThresholdRow && (
                                            <div className="flex flex-wrap items-center gap-2 mb-2 pl-3 border-l border-[hsl(var(--border-soft)/0.3)]">
                                                <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] shrink-0 mr-0.5">Threshold</span>
                                                {modelThresholds.map((t) => {
                                                    const isAvail  = availModelThresholds.has(t);
                                                    const isActive = selThreshold === t;
                                                    return isAvail ? (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            onClick={() => {
                                                                const fm = pickFillMode(selModel, t, selFillMode);
                                                                setResultView({ family: selModel, threshold: t, fillMode: fm });
                                                            }}
                                                            className={[btnSm, isActive ? btnActive : btnIdle].join(" ")}
                                                        >
                                                            {t}%
                                                        </button>
                                                    ) : (
                                                        <span
                                                            key={t}
                                                            className={[btnSm, btnDim].join(" ")}
                                                            title="No data for this threshold in this run."
                                                        >
                                                            {t}%
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* Row C — Fill Mode (only once model + threshold selected) */}
                                        {showFillModeRow && (
                                            <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-[hsl(var(--border-soft)/0.3)]">
                                                <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] shrink-0 mr-0.5">Fill Mode</span>
                                                {FILL_MODE_SLOTS.map(({ fillMode: fm, label }) => {
                                                    const isAvail  = availFillModes.has(fm);
                                                    const isActive = selFillMode === fm;
                                                    return isAvail ? (
                                                        <button
                                                            key={label}
                                                            type="button"
                                                            onClick={() => setResultView({
                                                                family: selModel,
                                                                threshold: selThreshold,
                                                                fillMode: fm,
                                                            })}
                                                            className={[btnSm, isActive ? btnActive : btnIdle].join(" ")}
                                                        >
                                                            {label}
                                                        </button>
                                                    ) : (
                                                        <span
                                                            key={label}
                                                            className={[btnSm, btnDim].join(" ")}
                                                            title="No data for this fill mode in this run."
                                                        >
                                                            {label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* RW-4A: Directional Backend Scenarios */}
                                        {(() => {
                                            const dirOpts = resultViewOptions.filter((o) => o.family === "directional");
                                            if (!dirOpts.length) return null;
                                            return (
                                                <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft)/0.2)]">
                                                    <span className="text-[9.5px] font-ui uppercase tracking-[0.07em] text-[hsl(var(--text-2)/0.65)] block mb-1.5">Directional Scenarios</span>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {dirOpts.map((opt) => {
                                                            const isActive = isDirectionalView && directionalStorageKey === opt.directionalStorageKey;
                                                            return (
                                                                <button
                                                                    key={opt.key}
                                                                    type="button"
                                                                    onClick={() => setResultView({
                                                                        family: "directional",
                                                                        directionalStorageKey: opt.directionalStorageKey,
                                                                        threshold: null,
                                                                        fillMode: null,
                                                                    })}
                                                                    className={[btnBase, isActive ? btnActive : btnIdle].join(" ")}
                                                                    title={opt.executionMode ? `Execution: ${opt.executionMode.replace(/_/g, " ")}` : undefined}
                                                                >
                                                                    {opt.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* Scope chips */}
                                        <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                                            <ScopeRow label="Position Variant">
                                                <Pill tone="muted">{scopeChip.variantLabel || "Primary"}</Pill>
                                            </ScopeRow>
                                            <ScopeRow label="Basis">
                                                <Pill tone="muted">{scopeChip.globalBasisLabel}</Pill>
                                            </ScopeRow>
                                            <ScopeRow label="Account">
                                                <Pill tone={scopeChip.accountSimulation ? "secondary" : "muted"}>
                                                    {scopeChip.accountSimulation ? "Sim" : "R"}
                                                </Pill>
                                                {scopeChip.accountViewSub && (
                                                    <span className="text-[9.5px] text-muted-lab opacity-70">{scopeChip.accountViewSub}</span>
                                                )}
                                            </ScopeRow>
                                            {/* Dev parity audit — baseline path only, hidden in production */}
                                            {process.env.NODE_ENV !== "production" && !isScenarioView && baselineParityAudit && (
                                                <span className={[
                                                    "text-[9.5px] font-ui ml-2",
                                                    baselineParityAudit.match
                                                        ? "text-[hsl(var(--text-muted))] opacity-60"
                                                        : "text-[hsl(var(--warning))]",
                                                ].join(" ")}>
                                                    Parity: {baselineParityAudit.match ? "✓" : "⚠"}
                                                    {" "}legacy {baselineParityAudit.legacyCount} / universe {baselineParityAudit.universeCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right col: Current Result View — dominant element */}
                                    <div className="px-3 py-2">
                                        <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-1">
                                            Current Result View
                                        </div>
                                        {/* Dominant view label */}
                                        <div className={[
                                            "font-ui font-bold leading-tight mb-2",
                                            isUnavailable
                                                ? "text-[hsl(var(--warning))] text-[20px]"
                                                : isScenarioView
                                                    ? "text-[hsl(var(--accent-primary))] text-[20px]"
                                                    : "text-white text-[20px]",
                                        ].join(" ")}>
                                            {currentViewDisplay}
                                        </div>
                                        {/* Inline stats row */}
                                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1.5">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Trades</span>
                                                <span className="text-[13px] font-num tabular-nums font-semibold text-[hsl(var(--text-2))]">
                                                    {isScenarioView && hasSelectedUniverseTrades
                                                        ? selectedTradeCount
                                                        : legacyTradeCount}
                                                </span>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Analytics</span>
                                                <span className={[
                                                    "text-[12px] font-semibold",
                                                    !isScenarioView
                                                        ? "text-[hsl(var(--text-2))]"
                                                        : hasSelectedUniverseTrades
                                                            ? "text-[hsl(var(--accent-secondary))]"
                                                            : "text-[hsl(var(--warning))]",
                                                ].join(" ")}>{analyticsChipLabel}</span>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-2)/0.55)]">Status</span>
                                                <span className={[
                                                    "text-[12px] font-semibold",
                                                    isUnavailable ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]",
                                                ].join(" ")}>
                                                    {isUnavailable ? "Unavailable" : "Available"}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Scenario baseline count / directional source info */}
                                        {isScenarioView && hasSelectedUniverseTrades && (
                                            <div className="text-[10px] text-[hsl(var(--text-2)/0.55)]">
                                                {isDirectionalView ? (
                                                    <>
                                                        <span className="text-[hsl(var(--text-2))]">Backend · Split-pass</span>
                                                        {activeResultViewOption?.executionMode && (
                                                            <span className="ml-1.5 opacity-55">· {activeResultViewOption.executionMode.replace(/_/g, " ")}</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        Baseline: <span className="tabular-nums text-[hsl(var(--text-2))]">{legacyTradeCount}</span>
                                                        {activeResultViewOption?.fromCombinedPool && (
                                                            <span className="ml-1.5 opacity-55">split from combined pool</span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {/* Warnings (entry model scenarios only; directional bypasses universe) */}
                                        {isScenarioView && !isDirectionalView && (() => {
                                            const warnings = (universe?.warnings || []).filter(
                                                (w) => w?.code === "FILL_MODE_COERCED" || w?.code === "BOTH_UNAVAILABLE_NO_COMBINED",
                                            );
                                            return warnings.length > 0 ? (
                                                <div className="mt-1.5 flex flex-col gap-1">
                                                    {warnings.map((w) => (
                                                        <span
                                                            key={w.code}
                                                            className={[
                                                                "px-1.5 py-0.5 text-[9.5px] border clip-bevel-sm",
                                                                w.code === "FILL_MODE_COERCED"
                                                                    ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))]"
                                                                    : "border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))]",
                                                            ].join(" ")}
                                                            title={w.code}
                                                        >
                                                            {w.message}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>

                                </div>
                            </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
}
