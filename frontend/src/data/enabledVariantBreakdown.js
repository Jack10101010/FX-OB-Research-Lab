/**
 * enabledVariantBreakdown.js
 *
 * Pure aggregation for the Classification tab "Enabled Variant Comparison" section
 * (CLASSIFICATION-ENABLED-VARIANTS). No React, no side effects, node-testable.
 *
 * The run bundle stores per-entry-model-variant trades in its entry-results silo
 * (`bundle.entryResults.tradesByMode`), reachable via `entryTradesByMode()`. The
 * Classification tab's main Entry Model Breakdown only sees the *selected* scenario
 * (`displayTrades`); this helper aggregates *all enabled* entry-model variants so
 * they can be compared side by side (TE C0/C1/C2/C3, EP, baseline).
 *
 * Metrics match the rest of the tab (fillStateBreakdown / buildClassificationBreakdown):
 *   Trades = count of performance trades
 *   WR     = wins / (wins + losses)   — breakevens excluded from the denominator
 *   Net R  = Σ r
 *   Avg R  = Σ r / count              — breakevens included in the denominator
 *
 * Labels/tags come from the canonical classification system, so a variant reads the
 * same everywhere (e.g. "TE C2 (+2 Delay)").
 */

import { buildTradeClassification } from "./tradeClassificationDims.js";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "./tradeClassification.js";
import { getTagMeta } from "./classificationRegistry.js";

// Local mirror of tradeUniverse.resolveEntryResults / entryTradesByMode (read-only).
// Inlined deliberately: tradeUniverse.js uses an extensionless relative import that
// breaks raw-node ESM, which would make this pure helper non-testable. Behaviour
// matches entryTradesByMode minus key-normalization (deriveEntryModel already maps
// raw entry_model_key strings to the canonical tag).
function resolveEntryResults(bundle) {
    return bundle?.entryResults
        || bundle?.entry_results
        || bundle?.summary?.entryResults
        || bundle?.summary?.entry_results
        || {};
}

function readEntryTradesByMode(bundle) {
    const results = resolveEntryResults(bundle || {});
    const raw = results?.tradesByMode || results?.trades_by_mode || {};
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

// Per-variant equity curves: entryResults.equityCurveByMode[<mode>] = computeEquityCurve(trades)
// (importer) → ordered points { i, date, label, netR } where netR is cumulative R. Keyed
// identically to tradesByMode (dual bare + positionVariant__mode), so canonicalEntryKey aligns.
function readEquityCurveByMode(bundle) {
    const results = resolveEntryResults(bundle || {});
    const raw = results?.equityCurveByMode || results?.equity_curve_by_mode || {};
    const out = {};
    for (const [key, value] of Object.entries(raw || {})) {
        if (Array.isArray(value)) out[key] = value;
    }
    return out;
}

// Max drawdown (in R) from an equity curve's cumulative `netR` points — byte-for-byte the
// canonical resultsBasis.maxDrawdownFromCurve (inlined to keep this module node-testable).
// Returns ≤ 0, or null when the curve is empty/absent.
function maxDrawdownFromCurve(equityCurve) {
    if (!Array.isArray(equityCurve) || equityCurve.length === 0) return null;
    let peak = -Infinity;
    let maxDd = 0;
    for (const p of equityCurve) {
        const v = Number(p && p.netR);
        if (!isFinite(v)) continue;
        if (v > peak) peak = v;
        const dd = v - peak; // ≤ 0
        if (dd < maxDd) maxDd = dd;
    }
    return maxDd;
}

// Canonical display order: baseline → TE C0..C3 → EP 25..100 → unknown/other.
const TAG_ORDER = {
    baseline:      0,
    te_same:       1,  // C0
    te_next:       2,  // C1
    te_d2:         3,  // C2
    te_d3:         4,  // C3
    ep_25:         5,
    ep_50:         6,
    ep_75:         7,
    ep_100:        8,
    unknown_model: 99,
};
const orderOf = (tag) => (tag in TAG_ORDER ? TAG_ORDER[tag] : 90); // unrecognized → before unknown_model

// The importer stores each variant's trades under TWO keys (see importer
// `entryTradesByMode`): a bare `<mode>` key and a `<positionVariant>__<mode>` key,
// both referencing the SAME trades. Stripping the position-variant prefix collapses
// those into one canonical entry-model key, which (a) prevents duplicate rows and
// (b) lets a prefixed `..__baseline` resolve to Baseline rather than Unknown Model.
const POSITION_VARIANT_PREFIXES = ["single_position", "allow_multi_position", "one_per_direction"];
function canonicalEntryKey(key) {
    let k = String(key || "");
    for (const p of POSITION_VARIANT_PREFIXES) {
        if (k.startsWith(`${p}__`)) { k = k.slice(p.length + 2); break; }
    }
    // The importer keys baseline as `entry_baseline` (filename `..__entry_baseline.csv`);
    // deriveEntryModel only recognizes the literal "baseline", so map it here — mirrors
    // tradeUniverse.normalizeEntryModelKey's `entry_baseline → baseline` rule.
    if (k === "entry_baseline") k = "baseline";
    return k;
}

/**
 * Aggregate per-entry-model-variant trade lists into comparison rows.
 *
 * @param {Object<string, object[]>} tradesByMode — { entryModelKey: trades[] }
 * @returns {Array<{ key:string, tag:string, label:string, tooltipKey:string,
 *   count:number, wins:number, losses:number, winRate:number|null, netR:number, avgR:number }>}
 *   Sorted canonically; variants with no performance trades are dropped.
 */
export function buildVariantRows(tradesByMode, equityCurveByMode) {
    const map = tradesByMode && typeof tradesByMode === "object" ? tradesByMode : {};

    // Collapse position-variant-prefixed aliases into one canonical entry-model key.
    // Bare and prefixed keys reference the SAME trades, so we keep one (preferring the
    // bare key) — never concatenate, which would double-count.
    const byCanon = new Map();
    for (const [key, trades] of Object.entries(map)) {
        if (!Array.isArray(trades)) continue;
        const canon = canonicalEntryKey(key);
        const isBare = key === canon;
        if (isBare || !byCanon.has(canon)) byCanon.set(canon, trades);
    }

    // Per-variant equity curves, canonicalized the same way (optional → maxDdR is null
    // when no curve is available for a variant).
    const curveByCanon = new Map();
    for (const [key, curve] of Object.entries(equityCurveByMode || {})) {
        if (!Array.isArray(curve)) continue;
        const canon = canonicalEntryKey(key);
        const isBare = key === canon;
        if (isBare || !curveByCanon.has(canon)) curveByCanon.set(canon, curve);
    }

    const rows = [];
    for (const [canon, trades] of byCanon) {
        let count = 0, wins = 0, losses = 0, sumR = 0;
        for (const trade of trades) {
            if (!isPerformanceTrade(trade)) continue;
            const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
            count += 1;
            if (isWinTrade(trade))  wins += 1;
            if (isLossTrade(trade)) losses += 1;
            sumR += r;
        }
        if (count === 0) continue; // drop empty / non-performance-only variants

        let tag;
        try { tag = buildTradeClassification({ entry_model_key: canon }).entry_model; }
        catch { tag = "unknown_model"; }
        const wl = wins + losses;

        const curve = curveByCanon.get(canon);

        rows.push({
            key:        canon,
            tag,
            label:      getTagMeta(tag).label,
            tooltipKey: tag,
            count,
            wins,
            losses,
            winRate: wl > 0 ? wins / wl : null,
            netR:    sumR,
            avgR:    count > 0 ? sumR / count : 0,
            maxDdR:  curve ? maxDrawdownFromCurve(curve) : null,
        });
    }

    rows.sort((a, b) => {
        const d = orderOf(a.tag) - orderOf(b.tag);
        return d !== 0 ? d : a.label.localeCompare(b.label);
    });
    return rows;
}

/**
 * Build the enabled-variant comparison rows from a run bundle.
 * Reads the entry-results silo (read-only); returns [] when no per-variant data.
 *
 * @param {object} runData — the run bundle
 * @returns {object[]} variant rows (see buildVariantRows)
 */
export function buildEnabledVariantBreakdown(runData) {
    return buildVariantRows(readEntryTradesByMode(runData), readEquityCurveByMode(runData));
}
