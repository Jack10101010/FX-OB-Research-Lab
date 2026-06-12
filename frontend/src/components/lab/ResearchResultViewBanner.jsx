/**
 * ResearchResultViewBanner — shared, READ-ONLY RunDetail-style result-view banner
 * (RESEARCH-RESULT-VIEW-BANNER Phase 2).
 *
 * Reuses the Phase-1 primitives so it looks exactly like RunDetail's header band:
 *   • ResearchBannerShell      → the wide bordered premium shell + 2-col grid
 *   • CurrentResultViewPanel   → the dominant right "Current Result View" panel
 *
 * Left = a clean static breakdown (Model / Threshold / Fill Mode / Position Variant /
 * Source / Rows + optional run identity). It does NOT embed the narrow
 * TradeUniverseBadge — that caused a cluttered look and a DUPLICATE Arm C0/C1 warning
 * (once on the left via the badge, once on the right via the panel). Warnings now
 * render ONCE, only in the right-side CurrentResultViewPanel.
 *
 * Everything is derived from the resolved `universe` (single source of truth). This
 * is intentionally read-only: no interactive switching, no Master Controls Preview
 * Lens. The Arm C0/C1 double-count + FILL_MODE_COERCED warnings flow through the
 * CurrentResultViewPanel only.
 *
 * Terminology (Phase 14 Wave 1): the lens is "Model" under the "View" header; axis-1 is "Position Mode".
 *
 * The `interactive` / `resultViewOptions` / `onResultViewChange` props are RESERVED
 * for a future switching phase — accepted here but unused (the banner stays static).
 *
 * Contract (RESEARCH-RESULT-VIEW-BANNER-AUDIT-1 §5):
 *   universe                REQUIRED — from useTradeUniverse / useRunVariant
 *   run = null              run identity { id, name, symbol, timeframe, dateRange, basisLabel }
 *                           (build with buildBannerRunIdentity); shown by default when present
 *   showRunIdentity = true  show the run name + symbol·TF cell; set false to opt out
 *   baselineCount = null    OPTIONAL baseline reference count for the "Baseline: N" line
 *   compact = false         drop the Source cell on tight pages
 *   interactive / resultViewOptions / activeResultViewOption / onResultViewChange — reserved
 */

import React from "react";
import { Pill } from "@/components/lab/DataTable";
import { ResearchBannerShell } from "@/components/lab/researchBanner/ResearchBannerShell";
import { CurrentResultViewPanel } from "@/components/lab/researchBanner/CurrentResultViewPanel";
import BannerRunIdentity from "@/components/lab/researchBanner/BannerRunIdentity";

// Small label + value chip (mirrors ResearchRunHeader's ScopeRow within the
// AGENTS.md tracking ceiling). Local + lightweight for this read-only banner;
// can be centralised later if a third consumer appears.
function Field({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2)/0.8)]">{label}</span>
            {children}
        </span>
    );
}

function familyLabel(family) {
    if (family === "triggered_edge") return "Triggered Edge";
    if (family === "penetration") return "Penetration";
    if (family === "directional") return "Directional";
    return "Baseline";
}

function fillModeLabel(fm) {
    if (fm === "same") return "Same candle";
    if (fm === "next") return "Next candle";
    const dm = typeof fm === "string" ? fm.match(/^d(\d+)$/) : null;
    if (dm) return `Delay +${dm[1]}`;
    return "Both";
}

export default function ResearchResultViewBanner({
    universe,
    run = null,
    // Run identity (run name + symbol·TF) shows by DEFAULT whenever `run` data is
    // supplied. Pages that already surface identity elsewhere can opt out with
    // showRunIdentity={false}. Render still gates on `run` being present.
    showRunIdentity = true,
    baselineCount = null,
    compact = false,
    // Optional shell-tone override ("active" | "neutral" | "warning"). When unset the
    // tone is derived from the universe (scenario→blue, baseline→neutral, empty→amber).
    // Pages that want the premium blue treatment regardless (e.g. baseline-only pages)
    // can force tone="active".
    tone = null,
    // ── Reserved for a future interactive-switching phase (accepted, not used) ──
    interactive = false,            // eslint-disable-line no-unused-vars
    resultViewOptions = [],         // eslint-disable-line no-unused-vars
    activeResultViewOption = null,
    onResultViewChange = null,      // eslint-disable-line no-unused-vars
}) {
    if (!universe) return null;

    // ── Derive everything from the resolved universe ───────────────────────────
    const isProtectedView = universe.universeType === "protected_result";
    const protectionLayer = isProtectedView ? universe.protection?.layers?.[0] : null;
    // A protected universe's `scenario` still carries the BASE entry view, so the
    // Model/Threshold/Fill cells describe the underlying entry universe; the
    // protection layer is surfaced as its own strip below.
    const isScenarioView = universe.universeType === "scenario" || isProtectedView;
    const family    = universe.scenario?.family ?? (isScenarioView ? "" : "baseline");
    const threshold = universe.scenario?.threshold ?? null;
    const fillMode  = universe.scenario?.fillMode ?? null;
    const isDirectionalView = family === "directional";

    const tradeCount = universe.stats?.total ?? 0;
    const hasTrades  = tradeCount > 0;
    const hasSelectedUniverseTrades = isScenarioView ? hasTrades : true;
    const selectedTradeCount = tradeCount;
    const legacyTradeCount = baselineCount
        ?? universe.baselineStats?.total
        ?? (isScenarioView ? 0 : tradeCount);

    // v1 tone standard: a selected scenario/model with trades → blue ("active");
    // BASELINE view → orange ("baseline") so it's instantly obvious you're not on a
    // selected variant; an empty selected scenario → orange "warning". Callers may
    // override via `tone`.
    const computedTone = isScenarioView
        ? (hasTrades ? "active" : "warning")
        : "baseline";
    const shellTone = tone || computedTone;
    const currentViewDisplay = universe.label || (isScenarioView ? "Scenario" : "Baseline Reference");
    const analyticsChipLabel = !isScenarioView
        ? "Baseline trades"
        : hasTrades ? "Scenario trades" : "Baseline fallback";

    const showThreshold = isScenarioView && family !== "baseline" && family !== "directional";
    const showFillMode  = family === "triggered_edge";

    // ── Left: static Result View breakdown (+ optional run identity + data strip) ──
    const left = (
        <div className="px-4 py-3">
            {showRunIdentity && run && <BannerRunIdentity run={run} />}
            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                View
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <Field label="Model">
                    <Pill tone={isScenarioView ? "secondary" : "muted"}>{familyLabel(family)}</Pill>
                </Field>
                {showThreshold && (
                    <Field label="Threshold">
                        <Pill tone="muted">{threshold != null ? `${threshold}%` : "—"}</Pill>
                    </Field>
                )}
                {showFillMode && (
                    <Field label="Fill Mode">
                        <Pill tone="muted">{fillModeLabel(fillMode)}</Pill>
                    </Field>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                <Field label="Position Mode">
                    <Pill tone="muted">{universe.variant || "Primary"}</Pill>
                </Field>
                {run?.basisLabel && (
                    <Field label="Basis">
                        <Pill tone="muted">{run.basisLabel}</Pill>
                    </Field>
                )}
                <Field label="Rows">
                    <span className="text-[11px] font-num tabular-nums font-semibold text-[hsl(var(--text-2))]">{tradeCount}</span>
                </Field>
                {!compact && (
                    <Field label="Source">
                        <span
                            className="text-[10.5px] font-code text-[hsl(var(--text-2)/0.7)] truncate max-w-[280px]"
                            title={universe.sourceFile || universe.sourceKey || "—"}
                        >
                            {universe.sourceFile || universe.sourceKey || "—"}
                        </span>
                    </Field>
                )}
            </div>
            {/* Protection layer strip (PROTECTION-LAYER Phase 2) — only when a
                protected Result View is active. */}
            {isProtectedView && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                    <Field label="Protection">
                        <Pill tone="secondary">{protectionLayer?.layerLabel || "Protection"}</Pill>
                    </Field>
                    <Pill tone="warning">EXPLORATORY</Pill>
                    {protectionLayer && (
                        <>
                            <Pill tone="muted">Applied {protectionLayer.appliedCount ?? 0}</Pill>
                            <Pill tone="success">Saved {protectionLayer.lossesSaved ?? 0}</Pill>
                            <Pill tone="danger">Cut {protectionLayer.winnersCut ?? 0}</Pill>
                            {protectionLayer.deltaNetR != null && (
                                <Field label="Δ Net R">
                                    <span className="text-[11px] font-num tabular-nums font-semibold text-[hsl(var(--text-2))]">
                                        {protectionLayer.deltaNetR > 0 ? "+" : ""}{protectionLayer.deltaNetR}
                                    </span>
                                </Field>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );

    // ── Right: the dominant Current Result View panel (warnings flow through it) ──
    const right = (
        <CurrentResultViewPanel
            currentViewDisplay={currentViewDisplay}
            isScenarioView={isScenarioView}
            isDirectionalView={isDirectionalView}
            isUnavailable={isScenarioView && !hasTrades}
            hasSelectedUniverseTrades={hasSelectedUniverseTrades}
            selectedTradeCount={selectedTradeCount}
            legacyTradeCount={legacyTradeCount}
            analyticsChipLabel={analyticsChipLabel}
            activeResultViewOption={activeResultViewOption}
            warnings={universe.warnings}
        />
    );

    return <ResearchBannerShell tone={shellTone} left={left} right={right} />;
}
