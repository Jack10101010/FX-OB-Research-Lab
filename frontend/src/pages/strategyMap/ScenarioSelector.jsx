/**
 * ScenarioSelector — hierarchical scenario picker
 *
 * Family pills  →  Threshold pills  →  Fill Mode pills  →  Variant pills
 * Viewing label + compact metrics strip
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
import { computeFftAnalytics, fmtFftR, fmtFftPips } from "@/data/fftAnalytics";

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function PillBtn({ active, onClick, children, tone = "primary" }) {
    const base = [
        "px-2.5 py-[3px]",
        "text-[10px] font-ui uppercase tracking-wider",
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
    if (fm === "same") return "Arm C0";
    if (fm === "next") return "Arm C1";
    // Delay variants: "d2" → "Arm C2", "d3" → "Arm C3", etc.
    const dm = typeof fm === "string" ? fm.match(/^d(\d+)$/) : null;
    if (dm) return `Arm C${dm[1]}`;
    return String(fm);
}

function buildViewingLabel(resolvedFamily, resolvedThreshold, resolvedFillMode) {
    if (!resolvedFamily || resolvedFamily === "baseline") return "Viewing: Baseline";
    const thresh = resolvedThreshold != null ? ` · ${fmtThreshold(resolvedThreshold)}` : "";
    if (resolvedFamily === "triggered_edge") {
        const fill = resolvedFillMode == null ? " · Both"
            : ` · ${fillModeDisplayLabel(resolvedFillMode)}`;
        return `Viewing: Triggered Edge${thresh}${fill}`;
    }
    if (resolvedFamily === "penetration") {
        return `Viewing: Penetration${thresh}`;
    }
    return `Viewing: ${familyDisplayLabel(resolvedFamily)}${thresh}`;
}

// ---------------------------------------------------------------------------
// FftChip — tiny inline stat tile for the FFT summary row.
// ---------------------------------------------------------------------------

function FftChip({ label, value, tone = "default", title }) {
    const toneClass = {
        success: "text-[hsl(var(--success))]",
        danger:  "text-[hsl(var(--danger))]",
        warning: "text-[hsl(var(--warning))]",
        muted:   "text-[hsl(var(--text-2))]",
        default: "text-[hsl(var(--text))]",
    }[tone] ?? "text-[hsl(var(--text))]";

    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel)/0.65)] clip-bevel-sm"
            title={title}
        >
            <span className="text-[9px] font-ui font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-1))]">
                {label}
            </span>
            <span className={`text-[11px] font-num font-semibold tabular-nums ${toneClass}`}>
                {value}
            </span>
        </span>
    );
}

// ---------------------------------------------------------------------------
// ScenarioSelector
// ---------------------------------------------------------------------------

/**
 * @param {object}   resolvedScenario  From useResolvedScenario()
 * @param {Function} onScenarioChange  (patch) => void  — wraps setScenario()
 * @param {Function} onVariantChange   (variant) => void
 */
export function ScenarioSelector({ resolvedScenario, onScenarioChange, onVariantChange, directionalScenarios = [] }) {
    const {
        scenario,
        resolvedFamily,
        resolvedThreshold,
        resolvedFillMode,
        resolvedPositionVariant,
        availableFamilies,
        availableThresholds,
        availableFillModes,
        availablePositionVariants,
        // Outputs from useResolvedScenario — drive Both gating + universe badge.
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
    const sanity  = React.useMemo(() => summarizeTradeSanity(trades || []), [trades]);
    const fftStats = React.useMemo(() => computeFftAnalytics(trades || []), [trades]);

    // ── Directional scenario support ─────────────────────────────────────────
    const isDirectionalMode = scenario?.family === "directional";
    const activeDirectionalStorageKey = scenario?.directionalStorageKey;
    const activeDirectionalLabel = directionalScenarios.find(
        (s) => s.storageKey === activeDirectionalStorageKey,
    )?.label;
    const viewLabel = isDirectionalMode
        ? `Viewing: Directional · ${activeDirectionalLabel || "—"}`
        : buildViewingLabel(resolvedFamily, resolvedThreshold, resolvedFillMode);

    const showThreshold = resolvedFamily && resolvedFamily !== "baseline" && availableThresholds.length > 0;
    // Only render fill-mode pills that have backing CSVs. Strip "both" when no
    // combined CSV exists so the user can't click into a union of same + next rows.
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
                        <span className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-muted))]">
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
                        <span className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-muted))]">
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

                {/* Arm Mode — only for Triggered Edge when multiple real modes exist.
                    The "Both" pill is gated on hasCombinedFillMode: if the run
                    exported same + next as separate CSVs with no combined file,
                    we deliberately hide Both rather than silently union them. */}
                {showFillMode && (
                    <div className="flex items-center gap-1.5">
                        <span
                            className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-muted))] cursor-default"
                            title={"Arm timing = when the limit order becomes active after the trigger threshold is reached.\n\nArm C0 = order active on the trigger candle.\nArm C1 = order active at the start of the next candle.\nArm C2/C3 = order active at the start of the second/third candle after trigger.\n\nThis is not the same as fill timing. A trade can Arm C0 but still fill on a later candle."}
                        >
                            Arm
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
                        <span className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-muted))]">
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

                {/* Directional Scenarios — backend split-pass, separate from entry models */}
                {directionalScenarios.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-ui uppercase tracking-wider text-[hsl(var(--text-muted))]">
                            Directional
                        </span>
                        {directionalScenarios.map(({ storageKey, label }) => (
                            <PillBtn
                                key={storageKey}
                                active={isDirectionalMode && activeDirectionalStorageKey === storageKey}
                                onClick={() => onScenarioChange({
                                    family: "directional",
                                    directionalStorageKey: storageKey,
                                })}
                            >
                                {label}
                            </PillBtn>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Row 2: viewing label + Both-unavailable note ── */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-ui text-[hsl(var(--text-muted))] shrink-0">
                    {viewLabel}
                </span>
                {!isDirectionalMode && bothUnavailableReason && (
                    <span
                        className="text-[10px] font-ui text-[hsl(var(--accent-secondary))]"
                        title="Arm C0 and Arm C1 were exported as separate CSVs; merging them would double-count each OB."
                    >
                        Both unavailable — {bothUnavailableReason}
                        {fillModeCoerced ? ` Showing ${fillModeDisplayLabel(activeFillMode)}.` : ""}
                    </span>
                )}
            </div>

            {/* ── Row 3: universe / source badge ──
                Compact identifier that always tells the user which CSV is
                actually driving the chart, list and sanity strip below. */}
            {(universeSource || isDirectionalMode) && (
                <UniverseBadge
                    universe={isDirectionalMode ? "directional" : universeSource.universe}
                    modelLabel={isDirectionalMode
                        ? (activeDirectionalLabel || "Directional Scenario")
                        : resolvedContextLabel({ resolvedFamily, resolvedThreshold, resolvedFillMode })}
                    variant={resolvedPositionVariant}
                    source={isDirectionalMode
                        ? (activeDirectionalStorageKey || "—")
                        : (universeSource?.filename || universeSource?.modelKey)}
                />
            )}

            {/* ── Row 4: canonical sanity strip ──
                Replaces the old sparse Rows / Fills / WR / Net R / Exp / PF
                row. Driven by summarizeTradeSanity so the numbers track every
                other strip in the app (Run Detail ledger, other labs). */}
            <TradeSanityStrip stats={sanity} showBreakdown={true} variant="research" />

            {/* ── FFT summary row — shown only when FFT cancels are present ── */}
            {fftStats.fftCancels > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 px-2 py-1.5 border-l-[3px] border-[hsl(var(--warning)/0.85)] bg-[hsl(var(--warning)/0.09)] rounded-sm">
                    {/* Section label */}
                    <span
                        className="text-[11px] font-ui uppercase tracking-[0.1em] font-bold text-[hsl(var(--warning))] px-1.5 py-0.5 rounded-sm bg-[hsl(var(--warning)/0.2)] border border-[hsl(var(--warning)/0.6)] mr-0.5 shrink-0 cursor-default"
                        title="First Failed Tag cancel summary for the current scenario: setups where price tapped the OB but failed to reach the trigger, so the order was cancelled before entry. Ghost columns are simulated 'what-if' outcomes and are unverified."
                    >
                        FFT
                    </span>

                    {/* FFT Cancels */}
                    <FftChip
                        label="Cancels"
                        value={String(fftStats.fftCancels)}
                        tone="warning"
                    />

                    {/* Ghost outcomes — only when ghost sim data is present */}
                    {fftStats.hasGhostData && (
                        <>
                            <FftChip
                                label="Ghost W"
                                value={String(fftStats.ghostWins)}
                                tone="success"
                            />
                            <FftChip
                                label="Ghost L"
                                value={String(fftStats.ghostLosses)}
                                tone="danger"
                            />
                            {fftStats.ghostUnfilled > 0 && (
                                <FftChip
                                    label="Unfilled"
                                    value={String(fftStats.ghostUnfilled)}
                                    tone="muted"
                                />
                            )}
                            <FftChip
                                label="Ghost Net R"
                                value={fmtFftR(fftStats.ghostNetR)}
                                tone={fftStats.ghostNetR > 0.005 ? "success" : fftStats.ghostNetR < -0.005 ? "danger" : "muted"}
                                title="Ghost Net R is the hypothetical R result of the cancelled setups if FFT had not cancelled them (simulated, unverified). FFT Impact is the opposite: how much FFT helped or hurt this run by cancelling them."
                            />
                            {/* FFT Impact — display-only inverse of Ghost Net R.
                                Positive = FFT helped (cancelled net-losing setups). */}
                            <FftChip
                                label="FFT Impact"
                                value={fmtFftR(-fftStats.ghostNetR)}
                                tone={-fftStats.ghostNetR > 0.005 ? "success" : -fftStats.ghostNetR < -0.005 ? "danger" : "muted"}
                                title="Ghost Net R is the hypothetical R result of the cancelled setups if FFT had not cancelled them. FFT Impact is the opposite: how much FFT helped or hurt this run by cancelling them. (Inverse of Ghost Net R; simulated, unverified.)"
                            />
                        </>
                    )}

                    {/* Move-away distance — when threshold was used */}
                    {fftStats.hasMoveAwayData && (
                        <FftChip
                            label="Avg dist"
                            value={`${fmtFftPips(fftStats.avgMoveAwayAtCancel)}p`}
                            tone="muted"
                            title={`Average pips past OB edge at cancel. Max: ${fmtFftPips(fftStats.maxMoveAwayAtCancel)} pips.`}
                        />
                    )}
                </div>
            )}
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
    const isDirectional = universe === "directional";
    const universeLabel = isDirectional
        ? "Directional split-pass"
        : isScenario
            ? "Scenario trades"
            : "Baseline reference";
    const universeTone = isDirectional ? "primary" : isScenario ? "success" : "muted";
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-2.5 py-1.5">
            <BadgeCell label="Universe" value={universeLabel} tone={universeTone} />
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
            <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))]">
                {label}
            </span>
            <span
                className={`text-[10.5px] ${mono ? "font-ui" : "font-ui"} ${subtle ? "" : "font-semibold"} ${valueColor}`}
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
    const fill = resolvedFillMode == null ? " · Both"
        : ` · ${fillModeDisplayLabel(resolvedFillMode)}`;
    if (resolvedFamily === "triggered_edge") return `Triggered Edge${thresh}${fill}`;
    if (resolvedFamily === "penetration")    return `Penetration${thresh}`;
    return `${familyDisplayLabel(resolvedFamily)}${thresh}${fill}`;
}
