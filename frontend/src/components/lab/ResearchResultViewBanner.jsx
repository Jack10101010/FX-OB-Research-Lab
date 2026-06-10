/**
 * ResearchResultViewBanner — shared, READ-ONLY RunDetail-style result-view banner
 * (RESEARCH-RESULT-VIEW-BANNER Phase 2).
 *
 * Reuses the Phase-1 primitives so it looks exactly like RunDetail's header band:
 *   • ResearchBannerShell      → the wide bordered premium shell + 2-col grid
 *   • CurrentResultViewPanel   → the dominant right "Current Result View" panel
 *   • TradeUniverseBadge       → the compact inner data strip (Universe / Result
 *                                View / Position Variant / Source / Rows + warnings)
 *
 * Everything is derived from the resolved `universe` (single source of truth). This
 * is intentionally read-only: no interactive switching, no Master Controls Preview
 * Lens. The Arm C0/C1 double-count + FILL_MODE_COERCED warnings flow through the
 * CurrentResultViewPanel and the embedded TradeUniverseBadge unchanged.
 *
 * Terminology is locked: the lens is "Result View"; axis-1 is "Position Variant".
 *
 * The `interactive` / `resultViewOptions` / `onResultViewChange` props are RESERVED
 * for a future switching phase — accepted here but unused (the banner stays static).
 *
 * Contract (RESEARCH-RESULT-VIEW-BANNER-AUDIT-1 §5):
 *   universe                REQUIRED — from useTradeUniverse / useRunVariant
 *   run = null              OPTIONAL { id, name, symbol, timeframe, dateRange, basisLabel }
 *   showRunIdentity = false show the run name + symbol·TF cell (hero-less pages only)
 *   baselineCount = null    OPTIONAL baseline reference count for the "Baseline: N" line
 *   compact = false         drop the embedded data strip on tight pages
 *   interactive / resultViewOptions / activeResultViewOption / onResultViewChange — reserved
 */

import React from "react";
import { Pill } from "@/components/lab/DataTable";
import { TradeUniverseBadge } from "@/components/lab/TradeUniverseBadge";
import { ResearchBannerShell } from "@/components/lab/researchBanner/ResearchBannerShell";
import { CurrentResultViewPanel } from "@/components/lab/researchBanner/CurrentResultViewPanel";

// Small label + value chip (mirrors ResearchRunHeader's ScopeRow within the
// AGENTS.md tracking ceiling). Local + lightweight for this read-only banner;
// can be centralised later if a third consumer appears.
function Field({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab">{label}</span>
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
    showRunIdentity = false,
    baselineCount = null,
    compact = false,
    // ── Reserved for a future interactive-switching phase (accepted, not used) ──
    interactive = false,            // eslint-disable-line no-unused-vars
    resultViewOptions = [],         // eslint-disable-line no-unused-vars
    activeResultViewOption = null,
    onResultViewChange = null,      // eslint-disable-line no-unused-vars
}) {
    if (!universe) return null;

    // ── Derive everything from the resolved universe ───────────────────────────
    const isScenarioView = universe.universeType === "scenario";
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

    const tone = !isScenarioView ? "neutral" : hasTrades ? "active" : "warning";
    const currentViewDisplay = universe.label || (isScenarioView ? "Scenario" : "Baseline Reference");
    const analyticsChipLabel = !isScenarioView
        ? "Baseline trades"
        : hasTrades ? "Scenario trades" : "Baseline fallback";

    const showThreshold = isScenarioView && family !== "baseline" && family !== "directional";
    const showFillMode  = family === "triggered_edge";

    // ── Left: static Result View breakdown (+ optional run identity + data strip) ──
    const left = (
        <div className="px-4 py-3">
            {showRunIdentity && run && (
                <div className="mb-2.5 pb-2 border-b border-[hsl(var(--border-soft)/0.25)]">
                    <div className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))] truncate">
                        {run.name || run.id || "Run"}
                    </div>
                    {(run.symbol || run.timeframe || run.dateRange) && (
                        <div className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                            {[run.symbol, run.timeframe, run.dateRange].filter(Boolean).join(" · ")}
                        </div>
                    )}
                </div>
            )}
            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                Result View
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
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                <Field label="Position Variant">
                    <Pill tone="muted">{universe.variant || "Primary"}</Pill>
                </Field>
                {run?.basisLabel && (
                    <Field label="Basis">
                        <Pill tone="muted">{run.basisLabel}</Pill>
                    </Field>
                )}
            </div>
            {!compact && (
                <div className="mt-2.5">
                    <TradeUniverseBadge universe={universe} compact />
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

    return <ResearchBannerShell tone={tone} left={left} right={right} />;
}
