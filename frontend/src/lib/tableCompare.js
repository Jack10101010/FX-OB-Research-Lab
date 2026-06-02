// ─────────────────────────────────────────────────────────────────────────────
// tableCompare.js — Table Compare Layer 1 delta engine (Phase TC-1).
//
//   Trade Universe = "which trades?"      (data/tradeUniverse.js)
//   Results Basis  = "how measured?"      (data/resultsBasis.js)
//   Table Compare  = "vs what?"           (THIS MODULE — the pairwise delta kernel)
//
// Pure & framework-free. No React, no store import — trivially unit-testable and
// (per the Edge Explorer Layer-3 design) reusable as the inner cell-comparison
// kernel later. This module ONLY matches rows by a stable key and computes
// deltas; it does not resolve trades, fetch runs, or render anything.
//
// DELTA BASIS — Raw R only (Phase TC-1).
//   Per TABLE_COMPARE_BASIS_AUDIT.md §5.1, Compare defaults to Raw R even when a
//   page is displaying Current Equity, because comparison is fundamentally an
//   *edge* question and Raw R is the only basis where every column delta is
//   unconditionally valid. The metrics consumed here (netR, winRate, expectancy,
//   profitFactor, count) are the basis-invariant / Raw-R fields that the legacy
//   finalizeBucket rows already carry, so a delta over them is always Raw R.
//   Current-Equity *contribution* deltas are path-dependent and are intentionally
//   NOT computed here (the caller surfaces a caveat instead of a misleading Δ).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delta metric registry. `kind` drives formatting; `higherBetter` drives the
 * good/bad color decision (null = neutral, e.g. trade count).
 *   accessor(row) pulls the comparable scalar from a legacy bucket row
 *   (finalizeBucket output) OR a canonical bucket row.
 */
export const COMPARE_METRIC_DEFS = Object.freeze({
    netR:         { key: "netR",         label: "Net R", kind: "r",   higherBetter: true,  accessor: (r) => numOrNull(r?.netR) },
    winRate:      { key: "winRate",      label: "WR",    kind: "pp",  higherBetter: true,  accessor: (r) => numOrNull(r?.winRate) },
    expectancy:   { key: "expectancy",   label: "Exp",   kind: "exp", higherBetter: true,  accessor: (r) => numOrNull(r?.expectancy) },
    profitFactor: { key: "profitFactor", label: "PF",    kind: "pf",  higherBetter: true,  accessor: (r) => pfOrNull(r?.profitFactor) },
    count:        { key: "count",        label: "N",     kind: "int", higherBetter: null,  accessor: (r) => numOrNull(r?.count ?? r?.rows) },
});

export const DEFAULT_COMPARE_METRICS = Object.freeze(["netR", "winRate", "expectancy", "profitFactor", "count"]);

// ── number helpers ───────────────────────────────────────────────────────────

function numOrNull(v) {
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

// Profit Factor: legacy rows use `null` to mean "undefined / ∞ (no losses)".
// Either an explicit null OR a non-finite number is treated as undefined so a
// Δ against it is never computed (renders "—" rather than ±∞).
function pfOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function rowKeyOf(row, rowKey) {
    const v = row?.[rowKey];
    return v == null ? "—" : String(v);
}

/**
 * Resolve a metric-key list (strings) to metric defs, dropping unknown keys.
 */
export function resolveCompareMetrics(metrics) {
    const list = Array.isArray(metrics) && metrics.length ? metrics : DEFAULT_COMPARE_METRICS;
    return list.map((m) => (typeof m === "string" ? COMPARE_METRIC_DEFS[m] : m)).filter(Boolean);
}

/**
 * Compute one metric's delta between a current and compared row.
 * @returns {{ value:number|null, dir:"up"|"down"|"flat"|null, better:boolean|null,
 *             current:number|null, compared:number|null }}
 */
export function computeMetricDelta(def, currentRow, comparedRow) {
    const cur = currentRow ? def.accessor(currentRow) : null;
    const cmp = comparedRow ? def.accessor(comparedRow) : null;
    if (cur == null || cmp == null) {
        return { value: null, dir: null, better: null, current: cur, compared: cmp };
    }
    const value = cur - cmp;
    const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
    let better = null;
    if (def.higherBetter === true) better = value > 0 ? true : value < 0 ? false : null;
    else if (def.higherBetter === false) better = value < 0 ? true : value > 0 ? false : null;
    return { value, dir, better, current: cur, compared: cmp };
}

/**
 * Format a metric delta for display. Pure string output; the renderer decides
 * color from `better`. Win-rate / proportion deltas are in pp (percentage
 * points), never %.
 */
export function formatCompareDelta(def, delta) {
    if (!delta || delta.value == null || !Number.isFinite(delta.value)) return "—";
    const n = delta.value;
    const sign = n >= 0 ? "+" : "";
    switch (def.kind) {
        case "r":   return `${sign}${n.toFixed(1)}R`;
        case "pp":  return `${sign}${n.toFixed(1)}pp`;
        case "exp": return `${sign}${n.toFixed(3)}`;
        case "pf":  return `${sign}${n.toFixed(2)}`;
        case "int": return `${sign}${Math.round(n)}`;
        default:    return `${sign}${n}`;
    }
}

/**
 * buildTableComparison — match two row sets by `rowKey` and compute per-metric
 * deltas (current − compared).
 *
 * @param {object} args
 *   @param {Array<object>} args.currentRows   Side A rows (legacy bucket rows).
 *   @param {Array<object>} args.comparedRows  Side B rows (same builder/shape).
 *   @param {string} [args.rowKey="label"]     stable matching key.
 *   @param {string[]} [args.metrics]          metric keys (COMPARE_METRIC_DEFS).
 *
 * @returns {{
 *   metrics: Array<MetricDef>,
 *   rows: Array<{
 *     key, status:"matched"|"only_current"|"only_compared",
 *     current:object|null, compared:object|null,
 *     deltas: { [metricKey]: Delta },
 *   }>,
 *   summary: { matched, onlyCurrent, onlyCompared, total,
 *              countCurrent, countCompared, countDivergencePct },
 * }}
 *
 * Matching rules (per TABLE_COMPARE_DRAWER_DESIGN.md §5.5):
 *   • key present on both           → status "matched", deltas computed.
 *   • key present on current only   → "only_current", deltas null ("only in current").
 *   • key present on compared only  → "only_compared", appended after current order.
 *   • a missing side never coerces to 0 — the metric delta is null → renders "—".
 *   • current-row order is preserved; compared-only rows are appended in their order.
 */
export function buildTableComparison({
    currentRows = [],
    comparedRows = [],
    rowKey = "label",
    metrics = DEFAULT_COMPARE_METRICS,
} = {}) {
    const defs = resolveCompareMetrics(metrics);
    const curList = Array.isArray(currentRows) ? currentRows : [];
    const cmpList = Array.isArray(comparedRows) ? comparedRows : [];

    const cmpByKey = new Map();
    for (const row of cmpList) cmpByKey.set(rowKeyOf(row, rowKey), row);

    const rows = [];
    const seen = new Set();

    // 1) current rows, in their own order
    for (const cur of curList) {
        const key = rowKeyOf(cur, rowKey);
        seen.add(key);
        const cmp = cmpByKey.get(key) || null;
        rows.push(makeComparisonRow(key, cur, cmp, defs));
    }
    // 2) compared-only rows, appended
    for (const cmp of cmpList) {
        const key = rowKeyOf(cmp, rowKey);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(makeComparisonRow(key, null, cmp, defs));
    }

    const matched      = rows.filter((r) => r.status === "matched").length;
    const onlyCurrent  = rows.filter((r) => r.status === "only_current").length;
    const onlyCompared = rows.filter((r) => r.status === "only_compared").length;

    const countCurrent  = curList.reduce((s, r) => s + (numOrNull(r?.count ?? r?.rows) || 0), 0);
    const countCompared = cmpList.reduce((s, r) => s + (numOrNull(r?.count ?? r?.rows) || 0), 0);
    const denom = Math.max(countCurrent, countCompared);
    const countDivergencePct = denom > 0
        ? Math.round((Math.abs(countCurrent - countCompared) / denom) * 1000) / 10
        : 0;

    return {
        metrics: defs,
        rows,
        summary: {
            matched,
            onlyCurrent,
            onlyCompared,
            total: rows.length,
            countCurrent,
            countCompared,
            countDivergencePct,
        },
    };
}

function makeComparisonRow(key, cur, cmp, defs) {
    const status = cur && cmp ? "matched" : cur ? "only_current" : "only_compared";
    const deltas = {};
    for (const def of defs) {
        deltas[def.key] = (status === "matched")
            ? computeMetricDelta(def, cur, cmp)
            : { value: null, dir: null, better: null, current: cur ? def.accessor(cur) : null, compared: cmp ? def.accessor(cmp) : null };
    }
    return { key, status, current: cur, compared: cmp, deltas };
}

/**
 * compareBucketRows — thin convenience over buildTableComparison that returns
 * just the matched rows (the common case for a bucket Δ table).
 */
export function compareBucketRows(currentRows, comparedRows, options = {}) {
    return buildTableComparison({
        currentRows,
        comparedRows,
        rowKey: options.rowKey || "label",
        metrics: options.metrics || DEFAULT_COMPARE_METRICS,
    }).rows;
}

export default {
    COMPARE_METRIC_DEFS,
    DEFAULT_COMPARE_METRICS,
    resolveCompareMetrics,
    computeMetricDelta,
    formatCompareDelta,
    buildTableComparison,
    compareBucketRows,
};
