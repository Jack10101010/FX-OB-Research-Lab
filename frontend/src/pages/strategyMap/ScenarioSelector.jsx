/**
 * ScenarioSelector — Phase 4 clean hierarchical scenario picker
 *
 * Replaces the raw Entry Model dropdown with:
 *   Family pills  →  Threshold pills  →  Fill Mode pills  →  Variant pills
 *   Viewing label + compact metrics strip
 *
 * Props
 * ─────
 *   resolvedScenario  {object}   Output of useResolvedScenario()
 *   onScenarioChange  {fn}       (patch) → calls setScenario(patch) in parent
 *   onVariantChange   {fn}       (variant) → calls setScenario + setSelectedTradeVariant
 */

import React from "react";
import { TradeSanityStrip } from "@/components/lab/TradeSanityStrip";
import { summarizeTradeSanity } from "@/data/tradeClassification";

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function PillBtn({ active, onClick, children, tone = "primary" }) {
    const base = [
        "px-2.5 py-[3px]",
        "text-[10px] font-mono uppercase tracking-wider",
        "border clip-bevel-sm",
        "transition-colors cursor-pointer select-none whitespace-nowrap",
    ].join(" ");

    const activeStyle = tone === "success"
        ? "bg-[hsl(var(--accent-success)/0.15)] border-[hsl(var(--accent-success)/0.55)] text-[hsl(var(--accent-success))]"
        : "bg-[hsl(var(--accent-primary)/0.15)] border-[hsl(var(--accent-primary)/0.55)] text-[hsl(var(--accent-primary))]";

    const inactiveStyle = [
        "bg-transparent border-[hsl(var(--border-soft))]",
        "text-[hsl(var(--text-muted))]",
        "hover:border-[hsl(var(--accent-primary)/0.4)]",
        "hover:text-[hsl(var(--text-base))]",
    ].join(" ");

    return (
        <button
            type="button"
            className={`${base} ${active ? activeStyle : inactiveStyle}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fmtThreshold(n) {
    if (n == null || !isFinite(Number(n))) return "";
    const num = Number(n);
    return Number.isInteger(num) ? `${num}%` : `${num}%`;
}

function variantShortLabel(variant) {
    if (!variant) return "—";
    const v = String(variant).toLowerCase();
    if (v.includes("multi")) return "Multi";
    if (v.includes("one_per") || v.includes("oneper") || v.includes("one per")) return "One/Dir";
    if (v.includes("single")) return "Single";
    // Generic fallback: title-case, strip underscores
    return String(variant)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\s+/g, " ")
        .trim();
}

function familyDisplayLabel(family) {
    if (family === "baseline") return "Baseline";
    if (family === "triggered_edge") return "Triggered Edge";
    if (family === "penetration") return "Penetration";
    return String(family).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fillModeDisplayLabel(fm) {
    if (fm === "both") return "Both";
    if (fm === "same") return "Same";
    if (fm === "next") return "Next";
    return String(fm);
}

function buildViewingLabel(resolvedFamily, resolvedThreshold, resolvedFillMode) {
    if (!resolvedFamily || resolvedFamily === "baseline") return "Viewing: Baseline";
    const thresh = resolvedThreshold != null ? ` · ${fmtThreshold(resolvedThreshold)}` : "";
    if (resolvedFamily === "triggered_edge") {
        const fill = resolvedFillMode === "same"
            ? " · Same"
            : resolvedFillMode === "next"
                ? " · Next"
                : " · Both";
        return `Viewing: Triggered Edge${thresh}${fill}`;
    }
    if (resolvedFamily === "penetration") {
        return `Viewing: Penetration${thresh}`;
    }
    return `Viewing: ${familyDisplayLabel(resolvedFamily)}${thresh}`;
}

// ---------------------------------------------------------------------------
// ScenarioSelector
// ---------------------------------------------------------------------------

/**
 * @param {object}   resolvedScenario  From useResolvedScenario()
 * @param {Function} onScenarioChange  (patch) => void  — wraps setScenario()
 * @param {Function} onVariantChange   (variant) => void
 */
export function ScenarioSelector({ resolvedScenario, onScenarioChange, onVariantChange }) {
    const {
        resolvedFamily,
        resolvedThreshold,
        resolvedFillMode,
        resolvedPositionVariant,
        availableFamilies,
        availableThresholds,
        availableFillModes,
        availablePositionVariants,
        // Phase 1 outputs from useResolvedScenario — drive Both gating + universe badge.
        hasCombinedFillMode = false,
        bothUnavailableReason = null,
        fillModeCoerced = false,
        universeSource = null,
        trades,
    } = resolvedScenario;

    // Canonical sanity roll-up for the trades currently driving the chart.
    // Replaces the old inline computeFills + computeProfitFactor pair, which
    // didn't understand protected / unfilled / news-flatten and so disagreed
    // with the rest of the app on the row-vs-fill count and PF denominator.
    const sanity = React.useMemo(() => summarizeTradeSanity(trades || []), [trades]);
    const viewLabel = buildViewingLabel(resolvedFamily, resolvedThreshold, resolvedFillMode);

    const showThreshold = resolvedFamily && resolvedFamily !== "baseline" && availableThresholds.length > 0;
    // Phase 1 "stop fake Both" — only render fill-mode pills that actually
    // have backing CSVs. Strip "both" when no combined CSV exists so the user
    // can't click into a 70-row union of two 35-row files.
    const displayFillModes = React.useMemo(() => (
        hasCombinedFillMode
            ? availableFillModes
            : availableFillModes.filter((fm) => fm !== "both")
    ), [availableFillModes, hasCombinedFillMode]);
    const showFillMode = resolvedFamily === "triggered_edge" && displayFillModes.length > 1;
    const showVariant = availablePositionVariants.length > 1;

    // Active fill mode for pill highlight: null in store = "both" in UI.
    // When the hook coerced the user's Both click to Next/Same, highlight
    // the actual resolved mode (not the original click).
    const activeFillMode = resolvedFillMode ?? "both";

    return (
        <div className="flex flex-col gap-2.5">
            {/* ── Row 1: hierarchical pickers ── */}
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">

                {/* Family */}
                {availableFamilies.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--text-muted))]">
                            Family
                        </span>
                        {availableFamilies.map((f) => (
                            <PillBtn
                                key={f}
                                active={resolvedFamily === f}
                                tone={f === "triggered_edge" ? "success" : "primary"}
                                onClick={() => onScenarioChange({
                                    family: f,
                                    threshold: null,
                                    fillMode: null,
                                })}
                            >
                                {familyDisplayLabel(f)}
                            </PillBtn>
                        ))}
                    </div>
                )}

                {/* Threshold */}
                {showThreshold && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--text-muted))]">
                            Threshold
                        </span>
                        {availableThresholds.map((t) => (
                            <PillBtn
                                key={t}
                                active={resolvedThreshold === t}
                                onClick={() => onScenarioChange({ threshold: t })}
                            >
                                {fmtThreshold(t)}
                            </PillBtn>
                        ))}
                    </div>
                )}

                {/* Fill Mode — only for Triggered Edge when multiple real modes exist.
                    The "Both" pill is gated on hasCombinedFillMode: if the run
                    exported same + next as separate CSVs with no combined file,
                    we deliberately hide Both rather than silently union them. */}
                {showFillMode && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--text-muted))]">
                            Fill
                        </span>
                        {displayFillModes.map((fm) => (
                            <PillBtn
                                key={fm}
                                active={activeFillMode === fm}
                                onClick={() => onScenarioChange({
                                    // "both" → store null; "same"/"next" → store as-is
                                    fillMode: fm === "both" ? null : fm,
                                })}
                            >
                                {fillModeDisplayLabel(fm)}
                            </PillBtn>
                        ))}
                    </div>
                )}

                {/* Position Variant */}
                {showVariant && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--text-muted))]">
                            Variant
                        </span>
                        {availablePositionVariants.map((v) => (
                            <PillBtn
                                key={v}
                                active={resolvedPositionVariant === v}
                                onClick={() => onVariantChange(v)}
                            >
                                {variantShortLabel(v)}
                            </PillBtn>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Row 2: viewing label + Both-unavailable note ── */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-mono text-[hsl(var(--text-muted))] shrink-0">
                    {viewLabel}
                </span>
                {bothUnavailableReason && (
                    <span
                        className="text-[10px] font-mono text-[hsl(var(--accent-secondary))]"
                        title="Same and Next were exported as separate CSVs; merging them would double-count each OB."
                    >
                        Both unavailable — {bothUnavailableReason}
                        {fillModeCoerced ? ` Showing ${fillModeDisplayLabel(activeFillMode)}.` : ""}
                    </span>
                )}
            </div>

            {/* ── Row 3: universe / source badge ──
                Compact identifier that always tells the user which CSV is
                actually driving the chart, list and sanity strip below. */}
            {universeSource && (
                <UniverseBadge
                    universe={universeSource.universe}
                    modelLabel={resolvedContextLabel({
                        resolvedFamily, resolvedThreshold, resolvedFillMode,
                    })}
                    variant={resolvedPositionVariant}
                    source={universeSource.filename || universeSource.modelKey}
                />
            )}

            {/* ── Row 4: canonical sanity strip ──
                Replaces the old sparse Rows / Fills / WR / Net R / Exp / PF
                row. Driven by summarizeTradeSanity so the numbers track every
                other strip in the app (Run Detail ledger, future labs). */}
            <TradeSanityStrip stats={sanity} showBreakdown={true} />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Universe / source badge — sits between the viewing label and the sanity
// strip. The whole point is that the user always knows which trade universe
// (baseline vs scenario) AND which exact CSV is in view, with one glance.
// ---------------------------------------------------------------------------
function UniverseBadge({ universe, modelLabel, variant, source }) {
    const isScenario = universe === "scenario";
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-2.5 py-1.5">
            <BadgeCell label="Universe" value={isScenario ? "Scenario trades" : "Baseline reference"}
                       tone={isScenario ? "success" : "muted"} />
            <BadgeCell label="Model" value={modelLabel} />
            {variant && <BadgeCell label="Variant" value={variantShortLabel(variant)} />}
            {source && (
                <BadgeCell label="Source" value={source} mono title={source} subtle />
            )}
        </div>
    );
}

function BadgeCell({ label, value, tone = "default", mono = false, subtle = false, title }) {
    const valueColor =
        tone === "success"
            ? "text-[hsl(var(--accent-success))]"
            : tone === "muted"
                ? "text-[hsl(var(--text-muted))]"
                : subtle
                    ? "text-[hsl(var(--text-2))]"
                    : "text-[hsl(var(--text-base))]";
    return (
        <div className="flex items-baseline gap-1.5" title={title}>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[hsl(var(--text-muted))]">
                {label}
            </span>
            <span
                className={`text-[10.5px] ${mono ? "font-mono" : "font-mono"} ${subtle ? "" : "font-semibold"} ${valueColor}`}
                style={mono ? { maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : undefined}
            >
                {value || "—"}
            </span>
        </div>
    );
}

function resolvedContextLabel({ resolvedFamily, resolvedThreshold, resolvedFillMode }) {
    if (!resolvedFamily || resolvedFamily === "baseline") return "Baseline";
    const thresh = resolvedThreshold != null ? ` ${fmtThreshold(resolvedThreshold)}` : "";
    const fill =
        resolvedFillMode === "same" ? " · Same"
        : resolvedFillMode === "next" ? " · Next"
        : " · Both";
    if (resolvedFamily === "triggered_edge") return `Triggered Edge${thresh}${fill}`;
    if (resolvedFamily === "penetration")    return `Penetration${thresh}`;
    return `${familyDisplayLabel(resolvedFamily)}${thresh}${fill}`;
}
