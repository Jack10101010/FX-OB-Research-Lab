// ─── Master Controls — instant filter lens (Phase 10A) ───────────────────────
//
// Pure utility (NO React, NO store, NO sidecar). Builds a temporary, bundle-shaped
// object whose trade collections are a SUBSET of an already-imported run, filtered
// by session / structure-direction / trade-direction. Fed through the same Preview
// Lens pipeline as the cost rescore (Phase 8/9A): `bundleFor()` overlays it for the
// active run at read time, so StrategyMap / RunDetail / TradeSanity / Equity all
// reflect the filter WITHOUT any change to scenario resolution, the store, the
// importer or the backend.
//
// Filtering is the first true "instant_filter" tier (configRegistry): every trade
// already carries the tags we need (session, structure, direction), so the subset
// is derivable locally — no rerun. Unlike the cost rescore, filtering legitimately
// changes the trade population, so wins/losses/equity are RECOMPUTED from the
// surviving subset (outcomes are not preserved counts — the rows themselves drop).
//
// Never mutates the source bundle. Empty results are safe (no throwing).

import {
    selectedAllowedSessions,
    buildAllowedStructureDirections,
    mapBuilderTradeDirection,
} from "@/data/configTranslator";
import { resolveSessionFromTimestamp } from "@/components/lab/session/config/sessionConfig";
import { equityFromTrades } from "./costRescore";

// Draft keys that, when dirty, mean "this is a pure instant filter change".
// Mirrors the configRegistry instant_filter overrides for session + structure-direction.
export const FILTER_KEYS = Object.freeze([
    "london",
    "lull",
    "newYork",
    "asia",
    "outside",
    "sessionFilter",
    "bosLong",
    "bosShort",
    "chochLong",
    "chochShort",
    "direction",
]);

// Filterable session toggles → canonical session count. "NY PM" has no toggle, so a
// trade in that band is only ever dropped when the user narrows sessions (see notes).
const FILTERABLE_SESSION_COUNT = 5;

// Raw session label (lower-cased) → canonical display label. Mirrors
// fillStateBreakdown.SESSION_CANON so explicit backend tags resolve identically.
const SESSION_CANON = {
    "new york":    "New York",
    "ny":          "New York",
    "new_york":    "New York",
    "london":      "London",
    "london lull": "London Lull",
    "london_lull": "London Lull",
    "lull":        "London Lull",
    "asia":        "Asia",
    "outside":     "Outside",
};

// ── tiny local helpers (kept local to avoid coupling to private internals) ──────

function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function obj(v) {
    return v && typeof v === "object" ? v : {};
}

function truthy(v) {
    if (v === true) return true;
    if (v === false || v == null || v === "") return false;
    return ["true", "1", "yes", "y"].includes(String(v).trim().toLowerCase());
}

/** Direction bucket from a trade — mirrors tradeClassification.directionBucket. */
function directionOf(trade) {
    const raw = String(trade?.direction ?? trade?.side ?? trade?.bias ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (raw === "long" || raw === "buy" || raw.startsWith("bull")) return "long";
    if (raw === "short" || raw === "sell" || raw.startsWith("bear")) return "short";
    return null;
}

/** Structure token ("bos" | "choch" | null) from a trade. */
function structureOf(trade) {
    const raw = String(trade?.structure ?? trade?.structure_type ?? "").trim().toUpperCase();
    if (raw === "BOS") return "bos";
    if (raw === "CHOCH") return "choch";
    return null;
}

/** Combined structure-direction tag ("bos_long" | "choch_short" | …) or null. */
function structDirTagOf(trade) {
    const s = structureOf(trade);
    const d = directionOf(trade);
    return s && d ? `${s}_${d}` : null;
}

/**
 * Canonical session for a trade. Prefers an explicit backend tag; falls back to
 * deriving from the entry/fill timestamp via the Session Lab UTC bands. Returns
 * "Unknown" when neither is available.
 */
function sessionOf(trade) {
    const explicit = trade?.fillSession
        || trade?.fill_session
        || trade?.session
        || trade?.trade_session
        || trade?.entry_session;
    const s = String(explicit ?? "").trim();
    if (s && s !== "—") return SESSION_CANON[s.toLowerCase()] ?? s;

    // Fallback: derive from timestamp (UTC band). Old runs may lack a session tag.
    const ts = trade?.entry ?? trade?.entry_time ?? trade?.entryTime
        ?? trade?.fill_time ?? trade?.fillTime ?? trade?.time ?? null;
    if (ts == null || ts === "") return "Unknown";
    return resolveSessionFromTimestamp(ts);
}

// ── filter-only dirty test ──────────────────────────────────────────────────

/** True iff at least one field is dirty and EVERY dirty field is a filter key. */
export function isFilterOnlyDirty(dirtyFieldList) {
    const list = Array.isArray(dirtyFieldList) ? dirtyFieldList : [...(dirtyFieldList || [])];
    if (!list.length) return false;
    return list.every((k) => FILTER_KEYS.includes(k));
}

// ── predicate ────────────────────────────────────────────────────────────────

/**
 * Build a trade predicate descriptor from an effective config. Each of the three
 * sub-filters is only "active" when it represents a real restriction, so a default
 * (all-on) config is a no-op rather than silently dropping untagged rows.
 *
 *   • Session — active when the master `sessionFilter` is on AND a strict subset of
 *     the five filterable sessions is selected. Matches canonical session labels.
 *   • Structure-direction — active when `buildAllowedStructureDirections` yields a
 *     strict subset of the four bos/choch × long/short tags.
 *   • Direction — active when `cfg.direction` resolves to long or short (not both).
 *
 * @param {object} cfg  effectiveConfig
 * @returns {{ active, sessionActive, sessionSet, structDirActive, structDirSet,
 *             directionActive, directionMode, notes }}
 */
export function buildTradePredicate(cfg = {}) {
    const allowedSessions = selectedAllowedSessions(cfg) || [];
    const sessionActive = truthy(cfg.sessionFilter)
        && allowedSessions.length > 0
        && allowedSessions.length < FILTERABLE_SESSION_COUNT;

    const allowedStructDirs = buildAllowedStructureDirections(cfg) || [];
    const structDirActive = allowedStructDirs.length > 0 && allowedStructDirs.length < 4;

    const directionMode = mapBuilderTradeDirection(cfg.direction);
    const directionActive = directionMode === "long" || directionMode === "short";

    const notes = [];
    if (sessionActive) {
        notes.push("Session filter uses the trade's session tag, falling back to its UTC entry hour when untagged.");
    }

    return {
        active: sessionActive || structDirActive || directionActive,
        sessionActive,
        sessionSet: allowedSessions,
        structDirActive,
        structDirSet: allowedStructDirs,
        directionActive,
        directionMode,
        notes,
    };
}

/** Apply a predicate to one trade. A null/inactive predicate keeps everything. */
export function tradeMatches(trade, predicate) {
    if (!predicate || !predicate.active) return true;

    if (predicate.sessionActive) {
        if (!predicate.sessionSet.includes(sessionOf(trade))) return false;
    }
    if (predicate.structDirActive) {
        const tag = structDirTagOf(trade);
        if (!tag || !predicate.structDirSet.includes(tag)) return false;
    }
    if (predicate.directionActive) {
        if (directionOf(trade) !== predicate.directionMode) return false;
    }
    return true;
}

// ── bundle builder ───────────────────────────────────────────────────────────

/** Primary trade list of a bundle: primary variant → bundle.trades → largest variant. */
function pickPrimaryTrades(bundle) {
    if (!bundle || typeof bundle !== "object") return [];
    const tbv = obj(bundle.tradesByVariant);
    const primary = bundle.primaryVariant;
    if (primary && Array.isArray(tbv[primary])) return tbv[primary];
    if (Array.isArray(bundle.trades) && bundle.trades.length) return bundle.trades;
    const arrays = Object.values(tbv).filter(Array.isArray);
    return arrays.slice().sort((a, b) => b.length - a.length)[0] || [];
}

function filterArray(arr, predicate) {
    return (Array.isArray(arr) ? arr : []).filter((t) => tradeMatches(t, predicate));
}

/**
 * Filter every array in a trade map, recomputing the paired equity map. Source is
 * never mutated. `sourceEquity === null` means the collection has no equity map.
 */
function filterTradeMap(sourceTrades, sourceEquity, predicate) {
    const srcTrades = obj(sourceTrades);
    const tradesMap = { ...srcTrades };
    const equityMap = { ...obj(sourceEquity) };
    const hasEquity = sourceEquity !== null && sourceEquity !== undefined;
    for (const [key, arr] of Object.entries(srcTrades)) {
        if (!Array.isArray(arr)) continue;
        const filtered = filterArray(arr, predicate);
        tradesMap[key] = filtered;
        if (hasEquity) equityMap[key] = equityFromTrades(filtered);
    }
    return { tradesMap, equityMap };
}

/** Filter a nested results object (entryResults / protectionResults / directionalResults). */
function filterNested(sourceNested, tradesKey, equityKey, predicate) {
    if (!sourceNested || typeof sourceNested !== "object") return null;
    const { tradesMap, equityMap } = filterTradeMap(
        sourceNested[tradesKey], sourceNested[equityKey], predicate,
    );
    return { ...sourceNested, [tradesKey]: tradesMap, [equityKey]: equityMap };
}

/** Roll up the summary fields a filtered subset needs. Outcomes recomputed (rows drop). */
function summarizeFiltered(trades) {
    const list = Array.isArray(trades) ? trades : [];
    let netR = 0;
    let wins = 0;
    let losses = 0;
    let cum = 0;
    let peak = 0;
    let maxDd = 0;
    for (const t of list) {
        const r = num(t?.r ?? t?.netR ?? t?.net_r) ?? 0;
        netR += r;
        cum += r;
        if (cum > peak) peak = cum;
        const dd = peak - cum;
        if (dd > maxDd) maxDd = dd;
        const o = String(t?.outcome ?? "").toLowerCase();
        if (o === "win") { wins += 1; continue; }
        if (o === "loss") { losses += 1; continue; }
        if (r > 0) wins += 1;
        else if (r < 0) losses += 1;
    }
    const n = list.length;
    const denom = wins + losses;
    return {
        netR,
        avgR: n > 0 ? netR / n : null,
        wins,
        losses,
        winRate: denom > 0 ? (wins / denom) * 100 : null,
        trades: n,
        maxDd: n > 0 ? maxDd : null,
    };
}

/**
 * Build a temporary, bundle-shaped object whose trade collections are filtered by
 * `predicate`. Mirrors costRescore.buildRescoredBundle but applies a subset filter
 * (and recomputes outcomes) instead of a cost rescore. NOT a store run — never
 * added to state.runs, never persisted; the caller holds it and feeds it to the
 * Preview Lens. Does NOT mutate `sourceBundle`.
 *
 * @param {object} sourceBundle    the active run bundle (raw, lens-immune).
 * @param {object} predicate       output of buildTradePredicate.
 * @param {{ filters?, dirtyFields?, rerunTier? }} [options]
 * @returns {object|null}
 */
export function buildFilteredBundle(sourceBundle, predicate, options = {}) {
    if (!sourceBundle || typeof sourceBundle !== "object") return null;
    if (!predicate) return null;

    const { dirtyFields = null, rerunTier = null } = options;
    const primaryVariant = sourceBundle.primaryVariant;

    const sourcePrimary = pickPrimaryTrades(sourceBundle);
    const beforeCount = sourcePrimary.length;

    // tradesByVariant + equityCurveByVariant
    const sourceTbv = obj(sourceBundle.tradesByVariant);
    const { tradesMap: tradesByVariant, equityMap: equityCurveByVariant } =
        filterTradeMap(sourceTbv, sourceBundle.equityCurveByVariant, predicate);

    // Top-level primary trades + equity (reuse the filtered variant array when present).
    const filteredPrimary = primaryVariant && Array.isArray(tradesByVariant[primaryVariant])
        ? tradesByVariant[primaryVariant]
        : filterArray(sourcePrimary, predicate);
    if (primaryVariant && !Array.isArray(sourceTbv[primaryVariant])) {
        tradesByVariant[primaryVariant] = filteredPrimary;
        equityCurveByVariant[primaryVariant] = equityFromTrades(filteredPrimary);
    }
    const equityCurve = equityFromTrades(filteredPrimary);

    // Nested results objects.
    const entryResults = filterNested(
        sourceBundle.entryResults, "tradesByMode", "equityCurveByMode", predicate,
    );
    const protectionResults = filterNested(
        sourceBundle.protectionResults, "tradesByMode", "equityCurveByMode", predicate,
    );
    const directionalResults = filterNested(
        sourceBundle.directionalResults, "tradesByScenario", "equityCurveByScenario", predicate,
    );

    // controlTradesByScenario (no paired equity map).
    const hasControl = sourceBundle.controlTradesByScenario
        && typeof sourceBundle.controlTradesByScenario === "object";
    const { tradesMap: controlTradesByScenario } = filterTradeMap(
        sourceBundle.controlTradesByScenario, null, predicate,
    );

    const summary = summarizeFiltered(filteredPrimary);
    const afterCount = filteredPrimary.length;

    const filters = options.filters ?? {
        sessions: predicate.sessionActive ? predicate.sessionSet : "all",
        structureDirs: predicate.structDirActive ? predicate.structDirSet : "all",
        direction: predicate.directionActive ? predicate.directionMode : "both",
    };

    const out = {
        ...sourceBundle,
        id: `${sourceBundle.id}__filtered`,
        isTemporary: true,
        derivedFrom: sourceBundle.id,
        meta: {
            ...(sourceBundle.meta || {}),
            temporary: true,
            source: "master_controls_instant_filter",
            filterScope: "all_trade_sets",
            filters,
            dirtyFields,
            rerunTier,
            beforeCount,
            afterCount,
        },
        trades: filteredPrimary,
        tradesByVariant,
        equityCurve,
        equityCurveByVariant,
        summary: {
            ...(sourceBundle.summary || {}),
            netR: summary.netR,
            wins: summary.wins,
            losses: summary.losses,
            winRate: summary.winRate,
            trades: summary.trades,
            maxDd: summary.maxDd,
            avgR: summary.avgR,
        },
    };

    if (entryResults) out.entryResults = entryResults;
    if (protectionResults) out.protectionResults = protectionResults;
    if (directionalResults) out.directionalResults = directionalResults;
    if (hasControl) out.controlTradesByScenario = controlTradesByScenario;

    return out;
}
