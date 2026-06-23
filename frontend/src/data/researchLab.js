// researchLab.js — Research Lab cohort model (Phase 1, pure).
//
// The universal cohort layer for the Research Lab: resolve the active run into a
// valid performance universe, turn a dimension selection into a cohort (membership
// predicate + resolved trade subset), and summarise a cohort with EXACT metrics.
// All compute reuses the Phase-0 neutral modules (cohortDimensions +
// cohortFilterSimulator). No React, no store, no mutation.
//
// Universe choice: the VALID PERFORMANCE universe (isPerformanceTrade) — the same
// gate FilterDiscovery and the Run-Detail KPIs use, so cohort numbers reconcile.

import { isPerformanceTrade } from "./tradeClassification";
import { resolveDimension } from "./cohortDimensions";
import { metricsOf } from "./cohortFilterSimulator";

const round2 = (v) => Number(Number(v).toFixed(2));
const MAX_DIMS = 2; // Phase 1: single- and pair-dimension cohorts only.

// Valid performance universe. Accepts a trades array, or a bundle/resolved object
// carrying `.trades` (or `.resolved.trades`). Never mutates the input.
export function buildResearchUniverse(tradesOrBundle) {
    const trades = Array.isArray(tradesOrBundle)
        ? tradesOrBundle
        : (Array.isArray(tradesOrBundle?.trades) ? tradesOrBundle.trades
            : Array.isArray(tradesOrBundle?.resolved?.trades) ? tradesOrBundle.resolved.trades
                : []);
    return trades.filter((t) => isPerformanceTrade(t));
}

// selection = { dims: [{ dim, value }, …] }. Empty / absent → Whole Run. Entries
// with an unresolvable dimension or a missing value are IGNORED (safer than erroring
// on an incomplete second dimension); capped at MAX_DIMS. Matching is string-equality
// on accessor output. Returns { id, label, dims, predicate, trades }.
export function resolveResearchCohort(universe, selection = {}) {
    const list = Array.isArray(universe) ? universe : [];
    const rawDims = Array.isArray(selection?.dims) ? selection.dims : [];

    const dims = [];
    for (const d of rawDims) {
        if (dims.length >= MAX_DIMS) break;
        const reg = resolveDimension(d?.dim);
        if (!reg || d?.value == null || d.value === "") continue; // incomplete → ignored
        dims.push({ dim: reg.key, value: String(d.value), reg });
    }

    const predicate = dims.length === 0
        ? () => true
        : (t) => dims.every(({ reg, value }) => { const v = reg.accessor(t); return v != null && String(v) === value; });

    const trades = list.filter(predicate);
    const label = dims.length === 0
        ? "Whole Run"
        : dims.map((d) => `${d.reg.label || d.reg.key} ${d.value}`).join(" × ");
    const id = dims.length === 0 ? "whole-run" : dims.map((d) => `${d.dim}:${d.value}`).join("|");

    return { id, label, dims: dims.map(({ dim, value }) => ({ dim, value })), predicate, trades };
}

// EXACT cohort summary (computed from actual trade R via metricsOf).
export function cohortSummary(cohort) {
    const trades = Array.isArray(cohort?.trades) ? cohort.trades : (Array.isArray(cohort) ? cohort : []);
    const m = metricsOf(trades);
    return {
        label: cohort?.label ?? "Cohort",
        trades: m.trades,
        winners: m.winners,
        losers: m.losers,
        netR: m.netR,
        pf: m.profitFactor,                       // null ⇒ no losing R (render ∞ upstream)
        winRate: m.winRate,
        expectancy: m.trades ? round2(m.netR / m.trades) : null,
        posR: m.posR,
        negR: m.negR,
    };
}

// Observed values of a dimension over a universe — sorted ascending, nulls excluded.
// Drives the cohort builder's value dropdown.
export function observedValuesFor(universe, dimKey) {
    const reg = resolveDimension(dimKey);
    if (!reg) return [];
    const seen = new Set();
    for (const t of (Array.isArray(universe) ? universe : [])) {
        const v = reg.accessor(t);
        if (v != null) seen.add(String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
