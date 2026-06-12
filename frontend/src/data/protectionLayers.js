// protectionLayers.js — generic Trade-Universe protection / qualification layer.
//
// PROTECTION-LAYER-TRADE-UNIVERSE Phase 1. A layer is a PURE transform applied
// on top of a resolved base entry universe. It can:
//   • modify trade outcomes   (e.g. break_even: -1R → 0R)
//   • exclude trades          (future: ema_filter, ob_quality_filter)
//   • annotate/score trades   (future: liquidity_score, regime_score)
//   • leave trades unchanged + emit a warning (missing data, zero match)
//
// Layers are applied in sequence (each layer sees the previous layer's output as
// its base), so future stacks like "EMA gate → BE on CHoCH" compose naturally.
// Phase 1 ships exactly one adapter — `break_even` — but the contract and the
// resolver branch are layer-agnostic.
//
// No mutation: adapters never write to the base trades; the break_even adapter
// delegates to buildSelectiveBeUniverse (which clones rows). This module has no
// React/store imports so it can be unit-validated under plain node.

import { buildSelectiveBeUniverse, selectedFilterLabel } from "./selectiveBeUniverse";
import { findBeScenario, parseBeScenarioKey } from "./beResolve";

// ── small pure helpers ───────────────────────────────────────────────────────

function normTokens(arr) {
    return [...new Set((Array.isArray(arr) ? arr : [])
        .map((v) => String(v).trim().toLowerCase())
        .filter(Boolean))].sort();
}
function normLevels(arr) {
    return [...new Set((Array.isArray(arr) ? arr : [])
        .map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
}
/** 1 → "1p0", 0.5 → "0p5", 0.25 → "0p25", 2 → "2p0". */
function armToken(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    const s = num % 1 === 0 ? `${num}.0` : String(num);
    return s.replace(".", "p");
}
function titleArm(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return Number.isInteger(num) ? `${num}R` : `${num}R`;
}

// ── filter / layer key serialization (deterministic, debug-readable) ──────────
//
// Keys are identity/debug strings, NOT a reversible encoding — the authoritative
// filter set lives on the layer object. Group order is fixed (dir, str, ses, mfe)
// and values within a group are sorted, so the same layer always yields the same
// key (Phase I: source key deterministic).

export function serializeLayerFilters(filters = {}) {
    const segs = [];
    const dirs = normTokens(filters.directions);
    const structs = normTokens(filters.structures);
    const sessions = normTokens(filters.sessions).map((s) => s.replace(/\s+/g, "_"));
    const levels = normLevels(filters.armLevels);
    if (dirs.length) segs.push(`dir-${dirs.join("_")}`);
    if (structs.length) segs.push(`str-${structs.join("_")}`);
    if (sessions.length) segs.push(`ses-${sessions.join("_")}`);
    if (levels.length) segs.push(`mfe-${levels.map(armToken).join("_")}`);
    return segs.join("-");
}

/** Layer-only key, e.g. "protection-break_even-be_wick_1p00R-str-choch". */
export function buildLayerKey(layer = {}) {
    const type = String(layer.type || "unknown");
    const parts = ["protection", type];
    if (type === "break_even") {
        const key = layer.params?.beScenarioKey;
        if (key) parts.push(String(key));
    }
    if (layer.mode === "all") {
        parts.push("all");
    } else {
        const f = serializeLayerFilters(layer.filters);
        if (f) parts.push(f);
    }
    return parts.filter(Boolean).join("-");
}

/** Full universe source key: "{baseEntryVariantKey}__{layer1Key}[__{layer2Key}]". */
export function buildProtectedSourceKey(baseEntryVariantKey, layers = []) {
    const base = String(baseEntryVariantKey || "baseline");
    const tail = (Array.isArray(layers) ? layers : []).map(buildLayerKey).filter(Boolean).join("__");
    return tail ? `${base}__${tail}` : base;
}

/** Human protection label, e.g. "BE 1R Wick · CHoCH + London" or "BE 1R Wick · All Trades". */
export function buildProtectionLabel(layer = {}) {
    if (layer.label) return String(layer.label);
    if (layer.type === "break_even") {
        const p = layer.params || {};
        let { armLevelR, triggerBasis } = p;
        if ((armLevelR == null || !triggerBasis) && p.beScenarioKey) {
            const parsed = parseBeScenarioKey(p.beScenarioKey);
            if (armLevelR == null) armLevelR = parsed?.armLevelR;
            if (!triggerBasis) triggerBasis = parsed?.triggerBasis;
        }
        const trig = triggerBasis === "close" ? "Close" : "Wick";
        const cohort = layer.mode === "all"
            ? "All Trades"
            : (selectedFilterLabel(layer.filters || {}) || "All Trades");
        const cohortLabel = cohort === "None" ? "All Trades" : cohort;
        return `BE ${titleArm(armLevelR)} ${trig} · ${cohortLabel}`;
    }
    return `${String(layer.type || "layer")}`;
}

// ── layer adapters ────────────────────────────────────────────────────────────

const passthrough = (baseUniverse, layer, warningCode, extra = {}) => ({
    trades: baseUniverse.trades || [],
    metadata: {
        layerType: layer.type || null,
        layerLabel: buildProtectionLabel(layer),
        applied: false,
        appliedCount: 0,
        modifiedCount: 0,
        excludedCount: 0,
        annotatedCount: 0,
        originalNetR: null,
        transformedNetR: null,
        deltaNetR: 0,
        exploratory: layer.exploratory !== false,
        ...extra,
    },
    warnings: warningCode ? [{ code: warningCode, message: warningMessage(warningCode, layer) }] : [],
});

function warningMessage(code, layer) {
    switch (code) {
        case "NO_BE_DATA": return "This run has no exact break-even scenarios; protection not applied.";
        case "NO_MATCHING_VARIANT": return "No exact break-even data for this entry variant (baseline BE is never substituted); protection not applied.";
        case "NO_MATCHING_SCENARIO": return `No break-even scenario "${layer?.params?.beScenarioKey ?? "?"}" for this variant; protection not applied.`;
        case "LAYER_ZERO_MATCH": return "Protection layer matched zero trades in this universe.";
        case "LAYER_LOW_SAMPLE": return "Protection cohort sample is small; treat results as exploratory.";
        case "UNKNOWN_LAYER_TYPE": return `Unknown protection layer type "${layer?.type ?? "?"}"; ignored.`;
        default: return code;
    }
}

/**
 * break_even adapter. Variant-aware, EXACT-only (no baseline fallback for a
 * variant — that integrity rule lives in findBeScenario). Missing data → base
 * universe + warning.
 */
function applyBreakEvenLayer({ baseUniverse, bundle, layer }) {
    const params = layer.params || {};
    let { beScenarioKey, armLevelR, triggerBasis } = params;
    if ((armLevelR == null || !triggerBasis) && beScenarioKey) {
        const parsed = parseBeScenarioKey(beScenarioKey);
        if (armLevelR == null) armLevelR = parsed?.armLevelR;
        if (!triggerBasis) triggerBasis = parsed?.triggerBasis;
    }

    const executionMode = baseUniverse.variant || null;
    const entryVariantKey = baseUniverse.sourceKey || "baseline";

    const found = findBeScenario(bundle?.beResults, bundle?.beTradesByMode, {
        executionMode, entryVariantKey, triggerBasis, armLevelR,
    });

    if (!found || !Array.isArray(found.trades)) {
        // Reason precedence mirrors resolveBeScenarioSource.
        const hasAny = bundleHasAnyExactBe(bundle);
        const code = !hasAny ? "NO_BE_DATA"
            : !entryVariantHasBe(bundle, executionMode, entryVariantKey) ? "NO_MATCHING_VARIANT"
            : "NO_MATCHING_SCENARIO";
        return passthrough(baseUniverse, layer, code);
    }

    const built = buildSelectiveBeUniverse({
        originalTrades: baseUniverse.trades || [],
        beTrades: found.trades,
        filters: layer.filters || {},
        scenario: { beScenarioKey: found.scenarioKey },
        applyToAll: layer.mode === "all",
    });

    const warnings = [];
    if (built.matched === 0) warnings.push({ code: "LAYER_ZERO_MATCH", message: warningMessage("LAYER_ZERO_MATCH", layer) });
    if (built.summary.lowSample) warnings.push({ code: "LAYER_LOW_SAMPLE", message: warningMessage("LAYER_LOW_SAMPLE", layer) });
    if (built.skippedMissingBe > 0) warnings.push({ code: "LAYER_UNMATCHED_BE", message: `${built.skippedMissingBe} cohort trades had no paired BE row (kept original).` });

    const cohortLabel = layer.mode === "all" ? "All Trades" : built.selectedFilterLabel;
    const metadata = {
        layerType: "break_even",
        layerLabel: buildProtectionLabel(layer),
        applied: built.applied > 0,
        beScenarioKey: found.scenarioKey,
        armLevelR, triggerBasis,
        executionMode: found.executionMode,
        entryVariantKey: found.entryVariantKey,
        mode: layer.mode === "all" ? "all" : "selective",
        filters: built.meta.filters,
        filterLabel: cohortLabel,
        appliedCount: built.applied,
        modifiedCount: built.applied,
        excludedCount: 0,
        annotatedCount: 0,
        matched: built.matched,
        skippedMissingBe: built.skippedMissingBe,
        lossesSaved: built.summary.lossesSaved,
        winnersCut: built.summary.winnersCut,
        beExits: built.summary.beExits,
        originalNetR: built.summary.originalNetR,
        transformedNetR: built.summary.protectedNetR,
        deltaNetR: built.summary.deltaNetR,
        sampleSize: built.summary.sampleSize,
        lowSample: built.summary.lowSample,
        exploratory: layer.exploratory !== false,
    };

    return { trades: built.trades, metadata, warnings };
}

// Local BE-availability probes (avoid importing more from beResolve than needed).
function bundleHasAnyExactBe(bundle) {
    const has = (m) => !!(m && typeof m === "object"
        && Object.values(m).some((byEntry) => byEntry && typeof byEntry === "object"
            && Object.values(byEntry).some((byBe) => byBe && typeof byBe === "object" && Object.keys(byBe).length)));
    return has(bundle?.beResults) || has(bundle?.beTradesByMode);
}
function entryVariantHasBe(bundle, executionMode, entryVariantKey) {
    const pick = (m) => {
        if (!m || typeof m !== "object") return {};
        const modeKey = executionMode && m[executionMode] ? executionMode : Object.keys(m)[0];
        const byEntry = modeKey ? m[modeKey] : null;
        return (byEntry && byEntry[entryVariantKey]) || {};
    };
    return Object.keys(pick(bundle?.beResults)).length > 0
        || Object.keys(pick(bundle?.beTradesByMode)).length > 0;
}

const LAYER_ADAPTERS = {
    break_even: applyBreakEvenLayer,
};

/**
 * Apply ONE layer to a base universe. Pure.
 * @returns {{ trades, metadata, warnings }}
 */
export function applyTradeUniverseLayer({ baseUniverse, bundle, layer }) {
    if (!layer || typeof layer !== "object" || !layer.type) {
        return passthrough(baseUniverse || { trades: [] }, layer || {}, null);
    }
    const adapter = LAYER_ADAPTERS[layer.type];
    if (!adapter) return passthrough(baseUniverse, layer, "UNKNOWN_LAYER_TYPE");
    return adapter({ baseUniverse, bundle, layer });
}

/**
 * Fold an ordered list of layers over a base universe. Each layer transforms the
 * previous layer's output (variant/sourceKey are preserved from the base entry
 * universe so BE resolution stays variant-correct across the stack).
 * @returns {{ trades, layers: object[], warnings: object[] }}
 */
export function applyProtectionLayers({ baseUniverse, bundle, layers = [] }) {
    const list = Array.isArray(layers) ? layers.filter((l) => l && l.type) : [];
    let cur = baseUniverse;
    const layerMeta = [];
    const warnings = [];
    for (const layer of list) {
        const res = applyTradeUniverseLayer({ baseUniverse: cur, bundle, layer });
        layerMeta.push(res.metadata);
        for (const w of res.warnings) warnings.push(w);
        cur = { ...cur, trades: res.trades };
    }
    return { trades: cur.trades || [], layers: layerMeta, warnings };
}

// Layer-resolution warning codes (a layer that could not be applied to a run).
const LAYER_RESOLUTION_WARNINGS = new Set(["NO_BE_DATA", "NO_MATCHING_VARIANT", "NO_MATCHING_SCENARIO"]);

/**
 * Describe a (possibly protected) universe for cross-run comparison + banners.
 * A protected universe is ALWAYS universeType "protected_result" even when the
 * layer could not be applied to a given run (resolver returns base trades + a
 * resolution warning) — so `resolved` means "the protection layer actually
 * applied here", which is what Comparison Lab needs to avoid mixing a protected
 * run against an unprotected fallback. Pure.
 *
 * @returns {{ isProtected, resolved, baseLabel, layerLabel, appliedCount, deltaNetR, unresolvedWarnings }}
 */
export function describeProtectedUniverse(universe) {
    const isProtected = universe?.universeType === "protected_result";
    const layer0 = isProtected ? universe?.protection?.layers?.[0] : null;
    const unresolvedWarnings = (Array.isArray(universe?.warnings) ? universe.warnings : [])
        .filter((w) => w && LAYER_RESOLUTION_WARNINGS.has(w.code));
    return {
        isProtected,
        // Resolved iff protected AND the layer applied (no resolution warning, ≥1 trade).
        resolved: Boolean(isProtected && unresolvedWarnings.length === 0 && (universe?.trades?.length || 0) > 0),
        baseLabel: universe?.protection?.baseLabel ?? null,
        layerLabel: layer0?.layerLabel ?? null,
        appliedCount: layer0?.appliedCount ?? 0,
        deltaNetR: layer0?.deltaNetR ?? null,
        unresolvedWarnings,
    };
}

/**
 * Normalize a scenario's protection selection into an ordered layer array.
 * Accepts `scenario.layers` (array, preferred) OR `scenario.protection` (single
 * layer convenience). Old scenarios with neither → [] (base universe unchanged).
 */
export function normalizeLayers(scenario = {}) {
    if (Array.isArray(scenario?.layers)) return scenario.layers.filter((l) => l && l.type);
    if (scenario?.protection && scenario.protection.type) return [scenario.protection];
    return [];
}
