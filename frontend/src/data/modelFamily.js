/**
 * modelFamily.js — single-run, all-family model comparison adapter (Phase 4b-1).
 *
 * Pure, node-testable. No React, no side effects. Flattens ONE run bundle into a flat,
 * ranked list of comparable "model-variant" rows spanning five families:
 *
 *   baseline · entry_model · directional · protection · fft_control
 *
 * Design refs: MODEL-FAMILY-COMPARISON-1.md (design) and -2A-PLAN.md (this commit, "Commit 1").
 * Scope is deliberately narrow — single run only. No cross-run collection, no Model Lab,
 * no Sharpe, no funded-account pass/fail, no promotion recommendation, no Research-Signals
 * change. Those are later phases.
 *
 * Metric conventions (match the shipped Enabled Variant Comparison / fillStateBreakdown so
 * the two tables agree to the last decimal where they overlap):
 *   Trades = count of performance trades (isPerformanceTrade)
 *   WR     = wins / (wins + losses)        — a FRACTION in [0,1]; breakevens excluded
 *   Net R  = Σ r over performance trades    — headline convention (NOT toCanonicalSummaryRow.netR)
 *   Avg R  = Σ r / count                    — breakevens included in the denominator
 *   Max DD = maxDrawdownFromCurve(curve)    — ≤ 0; reused from resultsBasis (probe-confirmed
 *                                             node-loadable; byte-for-byte the inline used by
 *                                             enabledVariantBreakdown)
 *   PF     = grossProfit / grossLoss        — over the SAME performance-trade set as Net R
 *                                             (self-consistent; null = no losses → ∞ display)
 *   Confidence = computeConfidence({count,wins,losses,avgR}) — reuses the researchSignals engine
 *
 * Net R / WR / Avg R / Trades / Max DD are derived to match `buildVariantRows`
 * (enabledVariantBreakdown.js) exactly for entry-model variants — locked by a parity
 * assertion in modelFamily.validate.mjs. PF and Confidence are the additive columns.
 */

import { buildTradeClassification } from "./tradeClassificationDims.js";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "./tradeClassification.js";
import { getTagMeta } from "./classificationRegistry.js";
import { computeConfidence, DEFAULT_SIGNALS_CONFIG } from "./researchSignals.js";
import { maxDrawdownFromCurve } from "./resultsBasis.js";
import { formatDirectionalScenarioLabel } from "../components/lab/entries/analytics/entryFormatters.js";
import { getAutoControlInfo } from "./fftPairingResolver.js";

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered family taxonomy. familyKey is stable/machine-usable; label is display text. */
export const MODEL_FAMILIES = Object.freeze([
    { key: "baseline",    label: "Baseline" },
    { key: "entry_model", label: "Entry Model" },
    { key: "directional", label: "Directional" },
    { key: "protection",  label: "Protection" },
    { key: "fft_control", label: "FFT Control" },
]);

const FAMILY_ORDER = { baseline: 0, entry_model: 1, directional: 2, protection: 3, fft_control: 4 };
const FAMILY_LABEL = Object.fromEntries(MODEL_FAMILIES.map((f) => [f.key, f.label]));
const familyLabelOf = (key) => FAMILY_LABEL[key] || key;

// Canonical entry-model display order (mirrors enabledVariantBreakdown.TAG_ORDER):
// baseline → TE C0..C3 → EP 25..100 → unknown/other.
const TAG_ORDER = {
    baseline: 0, te_same: 1, te_next: 2, te_d2: 3, te_d3: 4,
    ep_25: 5, ep_50: 6, ep_75: 7, ep_100: 8, unknown_model: 99,
};
const tagOrder = (tag) => (tag in TAG_ORDER ? TAG_ORDER[tag] : 90);

// ─────────────────────────────────────────────────────────────────────────────
// Small pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const numR = (t) => (Number.isFinite(Number(t?.r)) ? Number(t.r) : 0);

/** Rebuild a cumulative-R equity curve from a trade list — only `netR` is needed for Max DD. */
function rebuildEquityCurve(trades) {
    let cum = 0;
    return (Array.isArray(trades) ? trades : []).map((t, i) => {
        cum += numR(t);
        return { i, netR: Number(cum.toFixed(2)) };
    });
}

/** Resolve the entry-results silo (camel/snake/summary nesting), read-only. */
function resolveEntryResults(bundle) {
    return bundle?.entryResults
        || bundle?.entry_results
        || bundle?.summary?.entryResults
        || bundle?.summary?.entry_results
        || {};
}

/**
 * Flatten a tradesByMode-shaped map: arrays kept as-is; one level of object nesting
 * unwrapped (mirrors enabledVariantBreakdown.readEntryTradesByMode). Returns { key: trades[] }.
 */
function flattenTradesByMode(raw) {
    const out = {};
    for (const [key, value] of Object.entries(raw || {})) {
        if (Array.isArray(value)) {
            out[key] = value;
        } else if (value && typeof value === "object") {
            for (const [nk, nv] of Object.entries(value)) {
                if (Array.isArray(nv)) out[nk] = nv;
            }
        }
    }
    return out;
}

/** Pick only array-valued curves from an equityCurveByMode-shaped map. */
function pickCurves(raw) {
    const out = {};
    for (const [key, value] of Object.entries(raw || {})) {
        if (Array.isArray(value)) out[key] = value;
    }
    return out;
}

// The importer stores each entry-model variant under TWO keys (bare `<mode>` and
// `<positionVariant>__<mode>`, same trades). Stripping the position-variant prefix
// collapses those into one canonical entry-model key, preventing duplicate rows and
// letting `..__entry_baseline` resolve to Baseline. Mirrors
// enabledVariantBreakdown.canonicalEntryKey (locked by a parity assertion in validation).
const POSITION_VARIANT_PREFIXES = ["single_position", "allow_multi_position", "one_per_direction"];
function canonicalEntryKey(key) {
    let k = String(key || "");
    for (const p of POSITION_VARIANT_PREFIXES) {
        if (k.startsWith(`${p}__`)) { k = k.slice(p.length + 2); break; }
    }
    if (k === "entry_baseline") k = "baseline";
    return k;
}

/**
 * Collapse a raw {key: trades[]} map into canonical entry-model variants.
 * Bare key wins; never concatenate (the shipped double-count fix). Tracks provenance.
 * @returns {Map<string, { trades: object[], sourceKeys: string[] }>}
 */
function dedupEntryTrades(tradesByMode) {
    const byCanon = new Map();
    for (const [key, trades] of Object.entries(tradesByMode || {})) {
        if (!Array.isArray(trades)) continue;
        const canon = canonicalEntryKey(key);
        const isBare = key === canon;
        const existing = byCanon.get(canon);
        if (!existing) {
            byCanon.set(canon, { trades, sourceKeys: [key] });
        } else {
            existing.sourceKeys.push(key);
            if (isBare) existing.trades = trades; // prefer the bare key's array
        }
    }
    return byCanon;
}

/** Same canonicalization for curves (bare key wins). @returns {Map<string, object[]>} */
function dedupEntryCurves(curveByMode) {
    const byCanon = new Map();
    for (const [key, curve] of Object.entries(curveByMode || {})) {
        if (!Array.isArray(curve)) continue;
        const canon = canonicalEntryKey(key);
        const isBare = key === canon;
        if (isBare || !byCanon.has(canon)) byCanon.set(canon, curve);
    }
    return byCanon;
}

/** Safe entry-model tag from a canonical key (mirrors enabledVariantBreakdown). */
function entryTagOf(canon) {
    try { return buildTradeClassification({ entry_model_key: canon }).entry_model; }
    catch { return "unknown_model"; }
}

/** Prettify a raw protection-mode key into a label (protection modes are NOT entry tags). */
function prettifyMode(mode) {
    const s = String(mode || "").replace(/[_-]+/g, " ").trim();
    if (!s) return "Protection";
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant collection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect every model variant present in a single run bundle, across all five families.
 * Returns a flat list of pre-row descriptors; metric computation happens in buildRow.
 *
 * @param {object} bundle — the run bundle
 * @returns {Array<{ familyKey, variantKey, label, tooltipKey, tag, trades, curve,
 *                    syntheticCurve, sourceKeys }>}
 */
export function collectModelVariants(bundle) {
    const out = [];
    if (!bundle || typeof bundle !== "object") return out;

    // ── Entry-model variants (deduped) — gathered first so baseline collision can resolve.
    const er = resolveEntryResults(bundle);
    const entryByCanon = dedupEntryTrades(flattenTradesByMode(er?.tradesByMode || er?.trades_by_mode || {}));
    const entryCurves = dedupEntryCurves(pickCurves(er?.equityCurveByMode || er?.equity_curve_by_mode || {}));

    // ── Baseline (§4.1 + §4.2 collision rule). Primary trades anchor the table; if the
    //    primary has no performance trades but the entry silo carries a `baseline`, promote it.
    const primaryVariant = bundle.primaryVariant || null;
    const primaryTrades = (Array.isArray(bundle.trades) && bundle.trades.length)
        ? bundle.trades
        : (primaryVariant && Array.isArray(bundle.tradesByVariant?.[primaryVariant]) ? bundle.tradesByVariant[primaryVariant] : []);
    const primaryHasPerf = (primaryTrades || []).some((t) => isPerformanceTrade(t));

    let baselineTrades = null;
    let baselineCurve = null;
    let baselineSourceKeys = [];
    if (primaryHasPerf) {
        baselineTrades = primaryTrades;
        baselineCurve = Array.isArray(bundle.equityCurve) ? bundle.equityCurve : null;
        baselineSourceKeys = [primaryVariant || "trades"];
    } else if (entryByCanon.has("baseline")) {
        const eb = entryByCanon.get("baseline");
        baselineTrades = eb.trades;
        baselineCurve = entryCurves.get("baseline") || null;
        baselineSourceKeys = eb.sourceKeys;
    }
    // Baseline is owned by the baseline family — never double-emit it as an entry-model row.
    entryByCanon.delete("baseline");

    if (baselineTrades) {
        out.push({
            familyKey: "baseline", variantKey: "baseline", tag: "baseline",
            label: getTagMeta("baseline").label, tooltipKey: "baseline",
            trades: baselineTrades, curve: baselineCurve, syntheticCurve: false,
            sourceKeys: baselineSourceKeys,
        });
    }

    // ── Entry-model variants.
    for (const [canon, { trades, sourceKeys }] of entryByCanon) {
        const tag = entryTagOf(canon);
        out.push({
            familyKey: "entry_model", variantKey: canon, tag,
            label: getTagMeta(tag).label, tooltipKey: tag,
            trades, curve: entryCurves.get(canon) || null, syntheticCurve: false,
            sourceKeys,
        });
    }

    // ── Directional variants.
    const dr = bundle.directionalResults || bundle.directional_results || {};
    const dTrades = dr.tradesByScenario || dr.trades_by_scenario || {};
    const dCurves = pickCurves(dr.equityCurveByScenario || dr.equity_curve_by_scenario || {});
    const dMeta = dr.scenarioMeta || dr.scenario_meta || {};
    for (const [storageKey, trades] of Object.entries(dTrades)) {
        if (!Array.isArray(trades)) continue;
        const scenarioId = dMeta[storageKey]?.scenarioId || storageKey.replace(/^[^_]+__/, "") || storageKey;
        let curve = dCurves[storageKey];
        let synthetic = false;
        if (!Array.isArray(curve) || curve.length === 0) { curve = rebuildEquityCurve(trades); synthetic = true; }
        out.push({
            familyKey: "directional", variantKey: storageKey, tag: null,
            label: formatDirectionalScenarioLabel(scenarioId), tooltipKey: null,
            trades, curve, syntheticCurve: synthetic, sourceKeys: [storageKey],
        });
    }

    // ── Protection variants.
    const pr = bundle.protectionResults || bundle.protection_results || {};
    const pTrades = flattenTradesByMode(pr.tradesByMode || pr.trades_by_mode || {});
    const pCurves = pickCurves(pr.equityCurveByMode || pr.equity_curve_by_mode || {});
    for (const [mode, trades] of Object.entries(pTrades)) {
        if (!Array.isArray(trades)) continue;
        out.push({
            familyKey: "protection", variantKey: mode, tag: null,
            label: prettifyMode(mode), tooltipKey: null,
            trades, curve: pCurves[mode] || null, syntheticCurve: false,
            sourceKeys: [mode],
        });
    }

    // ── FFT control variants (FFT-OFF auto-control). No stored curve → rebuild from trades.
    const controlMap = bundle.controlTradesByScenario || {};
    const info = getAutoControlInfo(bundle, primaryVariant);
    // Prefer the resolver's variant-scoped keys; fall back to every populated control key
    // so the single-run view never hides control data on a variant-name mismatch.
    let controlKeys = Array.isArray(info?.scenarioKeys) ? info.scenarioKeys : [];
    if (controlKeys.length === 0) {
        controlKeys = Object.keys(controlMap).filter((k) => Array.isArray(controlMap[k]) && controlMap[k].length > 0);
    }
    for (const fullKey of controlKeys) {
        const trades = controlMap[fullKey];
        if (!Array.isArray(trades) || trades.length === 0) continue;
        const scenarioKey = fullKey.includes(":") ? fullKey.slice(fullKey.indexOf(":") + 1) : fullKey;
        out.push({
            familyKey: "fft_control", variantKey: fullKey, tag: null,
            label: `FFT OFF · ${scenarioKey}`, tooltipKey: null,
            trades, curve: rebuildEquityCurve(trades), syntheticCurve: true,
            sourceKeys: [fullKey],
        });
    }

    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reduce a collected variant to a metric row. Returns null when the variant has no
 * performance trades (dropped — matches buildVariantRows).
 */
function buildRow(v, confidenceConfig) {
    let count = 0, wins = 0, losses = 0, sumR = 0, grossProfit = 0, grossLoss = 0;
    for (const t of (v.trades || [])) {
        if (!isPerformanceTrade(t)) continue;
        const r = numR(t);
        count += 1;
        if (isWinTrade(t)) wins += 1;
        if (isLossTrade(t)) losses += 1;
        sumR += r;
        if (r > 0) grossProfit += r;
        else if (r < 0) grossLoss += -r;
    }
    if (count === 0) return null;

    const decided = wins + losses;
    const avgR = sumR / count;
    const winRate = decided > 0 ? wins / decided : null;          // FRACTION in [0,1] (matches buildVariantRows)
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null; // null = no losses → ∞ display
    const maxDdR = (Array.isArray(v.curve) && v.curve.length) ? maxDrawdownFromCurve(v.curve) : null;
    const confidence = computeConfidence({ count, wins, losses, avgR }, confidenceConfig);

    return {
        familyKey: v.familyKey,
        familyLabel: familyLabelOf(v.familyKey),
        variantKey: v.variantKey,
        rowId: `${v.familyKey}:${v.variantKey}`,
        label: v.label,
        tooltipKey: v.tooltipKey ?? null,
        tag: v.tag ?? null,
        sourceKeys: Array.isArray(v.sourceKeys) ? v.sourceKeys : [],
        count,
        wins,
        losses,
        winRate,
        netR: sumR,
        avgR,
        maxDdR,
        profitFactor,
        confidence,
        hasOwnData: count > 0,
        syntheticCurve: Boolean(v.syntheticCurve),
    };
}

function compareRows(a, b) {
    const fd = (FAMILY_ORDER[a.familyKey] ?? 9) - (FAMILY_ORDER[b.familyKey] ?? 9);
    if (fd !== 0) return fd;
    if (a.familyKey === "entry_model") {
        const td = tagOrder(a.tag) - tagOrder(b.tag);
        if (td !== 0) return td;
        return String(a.label).localeCompare(String(b.label));
    }
    // Non-entry families: strongest Net R first, then label for stability.
    const nd = (Number.isFinite(b.netR) ? b.netR : -Infinity) - (Number.isFinite(a.netR) ? a.netR : -Infinity);
    if (nd !== 0) return nd;
    return String(a.label).localeCompare(String(b.label));
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparability guard (single-run: light but present; extensible for cross-run V2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-run comparability report. Always `comparable: true` (one symbol/TF/date/RR/cost
 * by construction). Emits non-blocking disclosure warnings. The fingerprint `key` is
 * computed now so the cross-run V2 only has to compare keys across bundles.
 *
 * @param {object[]} rows   — built model-variant rows
 * @param {object}   bundle — the run bundle
 * @returns {{ comparable: boolean, key: string, warnings: Array<{code,severity,message}> }}
 */
export function evaluateComparability(rows, bundle) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const s = bundle?.summary || {};
    const key = [s.symbol, s.detectionTf, s.dateRange, s.rr, s.stopBuffer]
        .map((x) => (x == null ? "" : String(x)))
        .join("|");

    const warnings = [];

    if (safeRows.some((r) => r.syntheticCurve)) {
        warnings.push({
            code: "SYNTHETIC_CURVE",
            severity: "info",
            message: "Max Drawdown for rows without a stored equity curve (FFT control / "
                + "directional) is reconstructed from trade R, not backend-emitted.",
        });
    }

    const minDecided = DEFAULT_SIGNALS_CONFIG.minDecidedForSignal;
    if (safeRows.some((r) => (r.wins + r.losses) < minDecided)) {
        warnings.push({
            code: "LOW_SAMPLE",
            severity: "info",
            message: `One or more variants have fewer than ${minDecided} decided trades; `
                + "their confidence reflects this — treat as directional.",
        });
    }

    // Mixed execution mode: FFT control keys are `${executionMode}:${scenarioKey}`.
    const runMode = s.executionMode || bundle?.primaryVariant || null;
    const controlMap = bundle?.controlTradesByScenario || {};
    const controlModes = Object.keys(controlMap)
        .map((k) => (k.includes(":") ? k.slice(0, k.indexOf(":")) : null))
        .filter(Boolean);
    if (runMode && controlModes.some((m) => m !== runMode)) {
        warnings.push({
            code: "MIXED_EXECUTION_MODE",
            severity: "warn",
            message: "An FFT control scenario was generated under a different execution mode "
                + "than this run's primary; compare those rows with care.",
        });
    }

    return { comparable: true, key, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the single-run, all-family model comparison.
 *
 * @param {object} bundle — the run bundle
 * @param {object} [opts]
 * @param {object} [opts.confidenceConfig] — pass-through to computeConfidence (defaults to engine defaults)
 * @returns {{ rows: object[], families: object[], comparability: object }}
 *   rows           — ranked ModelVariantRow[] (see buildRow), empties dropped
 *   families       — FamilyMeta[] { familyKey, label, variantCount, present }
 *   comparability  — see evaluateComparability
 */
export function buildModelFamilyComparison(bundle, opts = {}) {
    const confidenceConfig = opts.confidenceConfig || DEFAULT_SIGNALS_CONFIG;
    const variants = collectModelVariants(bundle);

    const rows = [];
    for (const v of variants) {
        const row = buildRow(v, confidenceConfig);
        if (row) rows.push(row);
    }
    rows.sort(compareRows);

    const families = MODEL_FAMILIES.map((f) => {
        const variantCount = rows.filter((r) => r.familyKey === f.key).length;
        return { familyKey: f.key, label: f.label, variantCount, present: variantCount > 0 };
    });

    const comparability = evaluateComparability(rows, bundle);

    return { rows, families, comparability };
}
