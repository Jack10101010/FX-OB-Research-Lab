/**
 * CurrentResultViewPanel — the dominant right-hand "Current Result View" column,
 * extracted VERBATIM from ResearchRunHeader (RESEARCH-RESULT-VIEW-BANNER Phase 1).
 *
 * Pure presentational, no behavior. Renders the prominent Result View label, the
 * Trades / Analytics / Status row, the baseline / directional source line, and the
 * Arm C0/C1 (BOTH_UNAVAILABLE_NO_COMBINED) + FILL_MODE_COERCED warning chips. Shared
 * by the interactive ResearchRunHeader (RunDetail) and — later — the read-only
 * ResearchResultViewBanner.
 *
 * The caller passes the already-formatted `currentViewDisplay` string and the raw
 * `warnings` array (universe.warnings); this panel applies the same user-facing
 * warning filter it always has and never merges fill modes.
 */

import React from "react";

export function CurrentResultViewPanel({
    currentViewDisplay,
    isScenarioView = false,
    isDirectionalView = false,
    isUnavailable = false,
    hasSelectedUniverseTrades = false,
    selectedTradeCount = 0,
    legacyTradeCount = 0,
    analyticsChipLabel,
    activeResultViewOption = null,
    warnings = null,
}) {
    return (
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
                const list = (warnings || []).filter(
                    (w) => w?.code === "FILL_MODE_COERCED" || w?.code === "BOTH_UNAVAILABLE_NO_COMBINED",
                );
                return list.length > 0 ? (
                    <div className="mt-1.5 flex flex-col gap-1">
                        {list.map((w) => (
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
    );
}

export default CurrentResultViewPanel;
