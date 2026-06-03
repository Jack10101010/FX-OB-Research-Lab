/**
 * TradeUniverseBadge — shared scope chip used by every page that consumes
 * the canonical TradeUniverse (via `useTradeUniverse()`).
 *
 * Before this component, the same "Universe / Model / Variant / Source / Rows"
 * strip + warning-chip row was copy-pasted into:
 *   - FailuresWorkspace.jsx
 *   - HypothesisLab.jsx
 *   - TradeInspector.jsx
 *   - NewsLab.jsx
 *   - OrderBlockLab.jsx
 * Five near-identical implementations meant any visual tweak had to land five
 * times, and inevitably the copies were drifting (slight color, padding, and
 * label tweaks already differed in places). This file is the single source.
 *
 * Strategy Map's ScenarioSelector still owns its own badge — that one is
 * intentionally specialized (no Rows cell, no warning chip row, uses a short
 * variant label, takes decomposed props from the hook) — and remains separate.
 *
 * Props
 *   universe   {object}    A TradeUniverse object from `useTradeUniverse()`.
 *                          See `data/tradeUniverse.js` for the shape.
 *                          The component reads: universeType, label, variant,
 *                          sourceFile, sourceKey, stats.total, warnings.
 *
 *   warnings   {Array<{code,message}>}
 *                          OPTIONAL override. When provided, the array is
 *                          rendered as-is (no further filtering). When NOT
 *                          provided, the component derives the warning list
 *                          from `universe.warnings` and filters it down to
 *                          `showCodes`. This filtering lives in the component
 *                          so the same five-line `useMemo` doesn't have to
 *                          live in every consumer page.
 *
 *   showCodes  {Array<string>}
 *                          OPTIONAL. Set of warning `code` values to surface
 *                          when deriving warnings from `universe.warnings`.
 *                          Defaults to the two user-facing codes that explain
 *                          "why are the numbers different from what I clicked
 *                          in Strategy Map": BOTH_UNAVAILABLE_NO_COMBINED and
 *                          FILL_MODE_COERCED. Ignored when an explicit
 *                          `warnings` prop is supplied.
 *
 *   compact    {boolean}   (Optional, default false.) Renders a tighter strip
 *                          for narrow sidebars: smaller cells, no "Source"
 *                          (filename can be long).
 *
 *   className  {string}    (Optional.) Extra classes applied to the outer
 *                          wrapper. Pages use this to set their page-level
 *                          horizontal padding + vertical margins so badge
 *                          placement on each page is preserved exactly.
 *
 * Warning chip palette (matches every prior copy of this UI):
 *   FILL_MODE_COERCED            → violet (accent-secondary)
 *   BOTH_UNAVAILABLE_NO_COMBINED → amber (warning)
 *   (any other code)             → amber (warning)
 */

import React, { useMemo } from "react";

const OUTER_DEFAULT = "flex flex-col gap-1.5";

// Default set of warning codes that are user-facing and worth showing as
// chips. Codes outside this set (e.g. NO_BUNDLE, NO_TRADES_FOR_SCENARIO) are
// diagnostic — pages typically handle them via their own empty-state UI.
export const DEFAULT_USER_FACING_WARNING_CODES = Object.freeze([
    "BOTH_UNAVAILABLE_NO_COMBINED",
    "FILL_MODE_COERCED",
]);

export function TradeUniverseBadge({
    universe,
    warnings,
    showCodes = DEFAULT_USER_FACING_WARNING_CODES,
    compact = false,
    className = "",
}) {
    // Derive the warnings list once per (universe.warnings, override, showCodes)
    // change. If the caller passes `warnings`, we trust them and render the
    // array verbatim. Otherwise we filter `universe.warnings` by `showCodes`.
    // The `showCodes` membership check uses a Set so callers passing a long
    // showCodes array don't pay O(n*m) on every render.
    const resolvedWarnings = useMemo(() => {
        if (Array.isArray(warnings)) return warnings;
        const source = universe?.warnings;
        if (!Array.isArray(source) || source.length === 0) return [];
        const codeSet = new Set(showCodes || []);
        return source.filter((w) => codeSet.has(w?.code));
    }, [warnings, universe, showCodes]);

    if (!universe) return null;

    const isScenario = universe.universeType === "scenario";
    const source = universe.sourceFile || universe.sourceKey || "—";

    return (
        <div className={`${OUTER_DEFAULT} ${className}`.trim()}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-2.5 py-1.5">
                <BadgeCell
                    label="Universe"
                    value={isScenario ? "Scenario trades" : "Baseline reference"}
                    tone={isScenario ? "success" : "muted"}
                />
                <BadgeCell label="Model" value={universe.label || "—"} />
                {universe.variant && (
                    <BadgeCell label="Variant" value={universe.variant} />
                )}
                {/* Source CSV is the most useful field for debugging "why are
                    the numbers different than I expected" but it's also the
                    widest field, so in `compact` mode we drop it. */}
                {!compact && (
                    <BadgeCell label="Source" value={source} mono subtle title={source} />
                )}
                <BadgeCell label="Rows" value={`${universe.stats?.total ?? 0}`} subtle />
            </div>
            {resolvedWarnings.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-ui">
                    {resolvedWarnings.map((w) => (
                        <span
                            key={w.code}
                            className={`px-2 py-1 clip-bevel-sm border ${
                                w.code === "FILL_MODE_COERCED"
                                    ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))]"
                                    : "border-[hsl(var(--warning)/0.45)] text-[hsl(var(--warning))]"
                            }`}
                            title={w.code}
                        >
                            {w.message}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Cell ─────────────────────────────────────────────────────────────────────
// One labelled chip inside the badge strip. Identical across the five prior
// page-local copies; consolidated here.
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
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
                {label}
            </span>
            <span
                className={`text-[10.5px] ${mono ? "font-code" : "font-ui"} ${subtle ? "" : "font-semibold"} ${valueColor}`}
                style={mono ? { maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : undefined}
            >
                {value || "—"}
            </span>
        </div>
    );
}

export default TradeUniverseBadge;
