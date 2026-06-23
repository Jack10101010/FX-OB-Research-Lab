// entryVariantOverlap.js — DEEP-DELAY AUDIT: entry-variant OB overlap (read-only).
//
// Compares two exported entry variants (e.g. baseline / C0 vs a deep delay C30)
// by which ORDER BLOCKS each one actually traded, so we can tell whether deep
// arms are improving the SAME setups (high overlap, better ΔR) or selecting a
// DIFFERENT subset (low overlap). Pure: no store/React/backend, no mutation.
//
// Trade source = bundle.entryResults.tradesByMode[entryKey] (the per-variant
// exported trade lists), filtered to EXECUTED performance trades only via
// classifyTrade — so COHORT_DISABLED / UNFILLED / NEWS_TOUCH_CANCEL / cancelled
// / missed rows are excluded (they live in EXCLUDED_CATEGORIES, never in
// PERFORMANCE_CATEGORIES). Disabled/cancelled overlap is intentionally out of
// scope for this first version.

import { entryTradesByMode, familyFromKey, extractThreshold, fillModeFromKey } from "./tradeUniverse";
import { classifyTrade, PERFORMANCE_CATEGORIES } from "./tradeClassification";

const EPS = 0.005;

function tradeR(t) {
    const v = Number(t?.netR ?? t?.net_r ?? t?.pnl_r ?? t?.r ?? 0);
    return Number.isFinite(v) ? v : 0;
}

const isExecuted = (t) => PERFORMANCE_CATEGORIES.has(classifyTrade(t));
const isWinCat = (c) => c === "WIN" || c === "NEWS_FLATTEN_WIN";
const isLossCat = (c) => c === "LOSS" || c === "NEWS_FLATTEN_LOSS";

/**
 * Stable OB key for matching the SAME order block across variants. Prefers the
 * explicit ob_id; falls back to detection_time | structure_tag | direction when
 * ob_id is absent (older bundles). Returns null when nothing identifies the OB.
 */
export function obMatchKey(t) {
    const id = t?.ob_id ?? t?.obId ?? null;
    if (id != null && String(id).trim() !== "") return `id:${String(id).trim()}`;
    const det = t?.detection_time ?? t?.detectionTime ?? t?.detected ?? null;
    const struct = t?.structure_tag ?? t?.structure ?? null;
    const dir = t?.direction ?? null;
    if (det == null && struct == null && dir == null) return null;
    return `k:${det ?? ""}|${struct ?? ""}|${dir ?? ""}`;
}

const cap = (s) => (s == null ? "" : String(s));
function armLabelFromFill(fm) {
    if (fm === "same") return "C0";
    if (fm === "next") return "C1";
    const m = typeof fm === "string" ? fm.match(/^d(\d+)$/) : null;
    return m ? `C${m[1]}` : null;
}

/** Compact human label for an entry_model_key (dropdowns / headers). */
export function entryVariantLabel(key) {
    const k = String(key || "");
    if (!k || k === "baseline") return "Baseline";
    const fam = familyFromKey(k);
    const thr = extractThreshold(k);
    const thrStr = thr != null ? `${thr}%` : "";
    if (fam === "triggered_edge") {
        const arm = armLabelFromFill(fillModeFromKey(k));
        return `TE ${thrStr}${arm ? ` ${arm}` : ""}`.trim();
    }
    if (fam === "penetration") return `Pen ${thrStr}`.trim();
    return k;
}

/**
 * List the selectable entry variants in a bundle (executed-trade-bearing only).
 * Returns [{ key, label, count }] sorted: baseline first, then TE by threshold
 * then arm depth, then penetration. `count` = executed trades for that variant.
 */
export function listEntryVariants(bundle) {
    const byMode = entryTradesByMode(bundle || {});
    const rows = Object.entries(byMode).map(([key, trades]) => ({
        key,
        label: entryVariantLabel(key),
        count: (Array.isArray(trades) ? trades : []).filter(isExecuted).length,
    }));
    const armDepth = (k) => {
        const fm = fillModeFromKey(k);
        if (fm === "same") return 0;
        if (fm === "next") return 1;
        const m = typeof fm === "string" ? fm.match(/^d(\d+)$/) : null;
        return m ? Number(m[1]) : -1;
    };
    const rank = (k) => (k === "baseline" ? [0] : familyFromKey(k) === "triggered_edge" ? [1, extractThreshold(k) ?? 0, armDepth(k)] : [2, extractThreshold(k) ?? 0, 0]);
    rows.sort((a, b) => {
        const ra = rank(a.key), rb = rank(b.key);
        for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
            const d = (ra[i] ?? 0) - (rb[i] ?? 0);
            if (d) return d;
        }
        return a.key.localeCompare(b.key);
    });
    return rows;
}

function statsFor(trades) {
    let wins = 0, losses = 0, netR = 0;
    for (const t of trades) {
        const c = classifyTrade(t);
        if (isWinCat(c)) wins += 1;
        else if (isLossCat(c)) losses += 1;
        netR += tradeR(t);
    }
    return { trades: trades.length, netR: Number(netR.toFixed(2)), wins, losses };
}

// Map obKey → first executed trade for that OB within a variant (one OB ≈ one
// trade per variant; if duplicates appear, the first is authoritative).
function indexByOb(trades) {
    const m = new Map();
    for (const t of trades) {
        const k = obMatchKey(t);
        if (k == null || m.has(k)) continue;
        m.set(k, t);
    }
    return m;
}

/**
 * Compare two entry variants by OB overlap.
 * @param {object} bundle      run bundle (entryResults.tradesByMode)
 * @param {string} variantAKey entry_model_key for A (e.g. "baseline")
 * @param {string} variantBKey entry_model_key for B (e.g. "entry_triggered_edge_25p0_d30")
 */
export function buildEntryVariantOverlap(bundle, variantAKey, variantBKey) {
    const byMode = entryTradesByMode(bundle || {});
    const aTrades = (Array.isArray(byMode[variantAKey]) ? byMode[variantAKey] : []).filter(isExecuted);
    const bTrades = (Array.isArray(byMode[variantBKey]) ? byMode[variantBKey] : []).filter(isExecuted);

    const a = statsFor(aTrades);
    const b = statsFor(bTrades);
    const aIdx = indexByOb(aTrades);
    const bIdx = indexByOb(bTrades);

    const matchedRows = [];
    let netRA = 0, netRB = 0, sameOutcomeCount = 0, improvedCount = 0, worsenedCount = 0;
    for (const [key, aTrade] of aIdx) {
        const bTrade = bIdx.get(key);
        if (!bTrade) continue;
        const aR = tradeR(aTrade);
        const bR = tradeR(bTrade);
        const deltaR = Number((bR - aR).toFixed(4));
        const aOutcome = classifyTrade(aTrade);
        const bOutcome = classifyTrade(bTrade);
        netRA += aR; netRB += bR;
        if (aOutcome === bOutcome) sameOutcomeCount += 1;
        if (deltaR > EPS) improvedCount += 1;
        else if (deltaR < -EPS) worsenedCount += 1;
        matchedRows.push({
            key,
            aTrade,
            bTrade,
            aR: Number(aR.toFixed(4)),
            bR: Number(bR.toFixed(4)),
            deltaR,
            aOutcome,
            bOutcome,
            session: bTrade.fill_session ?? bTrade.fillSession ?? aTrade.fill_session ?? aTrade.fillSession ?? "",
            structure: bTrade.structure_tag ?? bTrade.structure ?? aTrade.structure_tag ?? aTrade.structure ?? "",
            direction: bTrade.direction ?? aTrade.direction ?? "",
        });
    }
    // Stable, useful ordering: biggest absolute change first.
    matchedRows.sort((x, y) => Math.abs(y.deltaR) - Math.abs(x.deltaR));

    const obCount = matchedRows.length;
    const sharedAKeys = new Set(matchedRows.map((r) => r.key));
    let onlyAcount = 0, onlyAnet = 0;
    for (const [key, t] of aIdx) { if (!sharedAKeys.has(key)) { onlyAcount += 1; onlyAnet += tradeR(t); } }
    let onlyBcount = 0, onlyBnet = 0;
    for (const [key, t] of bIdx) { if (!sharedAKeys.has(key)) { onlyBcount += 1; onlyBnet += tradeR(t); } }

    const pct = (n, d) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : null);

    return {
        variantAKey,
        variantBKey,
        a,
        b,
        overlap: {
            obCount,
            pctOfA: pct(obCount, aIdx.size),
            pctOfB: pct(obCount, bIdx.size),
            netRA: Number(netRA.toFixed(2)),
            netRB: Number(netRB.toFixed(2)),
            sameOutcomeCount,
            improvedCount,
            worsenedCount,
        },
        onlyA: { count: onlyAcount, netR: Number(onlyAnet.toFixed(2)) },
        onlyB: { count: onlyBcount, netR: Number(onlyBnet.toFixed(2)) },
        matchedRows,
    };
}
