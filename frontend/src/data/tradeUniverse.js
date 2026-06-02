/**
 * tradeUniverse — shared store-level trade universe resolver.
 *
 * Central abstraction for "given a run bundle + active scenario, which trades
 * am I currently looking at?" All scenario-aware pages consume this through
 * the `useTradeUniverse()` hook rather than reading raw variant slices.
 *
 * Exposes:
 *
 *   • resolveTradeUniverse({ bundle, scenario, fallbackVariant, legacyEntryModelHint })
 *       → fully-resolved TradeUniverse object (see shape below).
 *
 *   • resolveBaselineUniverse({ bundle, variant })
 *       → shortcut for the baseline/reference universe of a variant.
 *
 *   • describeTradeUniverse(universe)
 *       → one-line human-readable summary.
 *
 * Plus the pure helpers used to parse scenario keys and select trades;
 * `useResolvedScenario.js` imports these helpers directly.
 *
 * TradeUniverse shape:
 *
 *   {
 *     universeType: "baseline" | "scenario",
 *
 *     label:        "Baseline" | "Triggered Edge 25% · Next" | ...
 *
 *     sourceKey:    "baseline"
 *                   | "entry_triggered_edge_25p0"
 *                   | "entry_triggered_edge_25p0_same" | "..._next"
 *                   | "entry_penetration_10p0"
 *                   | ...
 *
 *     sourceFile:   best-effort CSV filename, e.g.
 *                   "trades_allow_multi_position__entry_triggered_edge_25p0_next.csv"
 *                   or `null` when no match could be derived.
 *
 *     variant:      "single_position" | "allow_multi_position" | "one_per_direction" | null
 *
 *     scenario:     {
 *                     family:    "baseline" | "triggered_edge" | "penetration" | null,
 *                     threshold: number | null,
 *                     fillMode:  "same" | "next" | null   // null = bare/combined CSV
 *                   }
 *
 *     trades:       Trade[]                      // the canonical trade list
 *     stats:        summarizeTradeSanity(trades) // canonical roll-up
 *
 *     warnings:     Warning[]                    // [{ code, message }]
 *
 *     canCompareToBaseline:  boolean
 *     baselineTrades:        Trade[]             // baseline universe's trades
 *                                                // (equals `trades` when this IS the baseline)
 *     baselineStats:         summarizeTradeSanity(baselineTrades)
 *   }
 *
 * Warnings codes:
 *   FILL_MODE_COERCED            — requested fillMode was coerced to a safe one
 *   BOTH_UNAVAILABLE_NO_COMBINED — same/next exist separately, no bare CSV
 *   NO_BUNDLE                    — called with no bundle (defensive)
 *   NO_TRADES_FOR_SCENARIO       — canonical key resolved but produced an empty list
 */

import { summarizeTradeSanity } from "./tradeClassification";

// ───────────────────────────────────────────────────────────────────────────────
// Pure helpers (extracted from useResolvedScenario.js so both consumers share
// one implementation; the hook now imports them from here).
// ───────────────────────────────────────────────────────────────────────────────

export function numericOrNull(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

export function truthyFlag(value) {
    if (value === true) return true;
    if (value === false || value == null || value === "") return false;
    return ["true", "1", "yes", "y"].includes(String(value).trim().toLowerCase());
}

/**
 * `"entry_triggered_edge_25p0_same"` → `"triggered_edge"`
 * `"entry_penetration_10p0"`         → `"penetration"`
 * `"baseline"` / `"entry_baseline"`  → `"baseline"`
 */
export function familyFromKey(key) {
    const k = String(key || "").trim();
    if (!k || k === "baseline" || k === "entry_baseline") return "baseline";
    if (k.startsWith("entry_triggered_edge")) return "triggered_edge";
    if (k.startsWith("entry_penetration")) return "penetration";
    return null;
}

/**
 * Encode a numeric threshold as a key fragment.
 * 25 → "25p0"   2.5 → "2p5"   5.25 → "5p25"
 */
export function thresholdToKeyPart(n) {
    if (n == null || !isFinite(Number(n))) return null;
    const num = Number(n);
    const intPart = Math.floor(num);
    const fracPart = Math.round((num - intPart) * 100);
    if (fracPart === 0) return `${intPart}p0`;
    if (fracPart % 10 === 0) return `${intPart}p${fracPart / 10}`;
    return `${intPart}p${fracPart}`;
}

export function keyPartToThreshold(part) {
    if (!part) return null;
    const text = String(part).replace("p", ".");
    const n = Number(text);
    return isFinite(n) ? n : null;
}

/**
 * Parse threshold from a full key string.
 * `"entry_triggered_edge_25p0_same"` → 25
 * `"entry_penetration_10p0"`         → 10
 */
export function extractThreshold(key) {
    const k = String(key || "");
    const m = k.match(/entry_(?:triggered_edge|penetration)_([0-9]+p[0-9]+)/i);
    if (!m) return null;
    return keyPartToThreshold(m[1]);
}

/**
 * Extract fill-mode from key suffix.
 * `"..._same"` → `"same"`, `"..._next"` → `"next"`, otherwise → `null` (= combined).
 */
export function fillModeFromKey(key) {
    const k = String(key || "");
    if (/_same$/i.test(k)) return "same";
    if (/_next$/i.test(k)) return "next";
    return null;
}

export function normalizeEntryModelKey(value) {
    const key = String(value || "").trim();
    if (!key) return "";
    if (key === "entry_baseline") return "baseline";
    return key;
}

export function resolveEntryResults(bundle = {}) {
    return bundle?.entryResults
        || bundle?.entry_results
        || bundle?.summary?.entryResults
        || bundle?.summary?.entry_results
        || {};
}

export function entryTradesByMode(bundle = {}) {
    const results = resolveEntryResults(bundle);
    const raw = results?.tradesByMode || results?.trades_by_mode || {};
    const out = {};
    Object.entries(raw || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            out[normalizeEntryModelKey(key)] = value;
            return;
        }
        if (value && typeof value === "object") {
            Object.entries(value).forEach(([nk, nv]) => {
                if (Array.isArray(nv)) out[normalizeEntryModelKey(nk)] = nv;
            });
        }
    });
    return out;
}

export function entrySummaryKeys(bundle = {}) {
    const results = resolveEntryResults(bundle);
    const summary = results?.summary || results?.results || results?.rows || [];
    if (Array.isArray(summary)) {
        return summary
            .map((row) => normalizeEntryModelKey(
                row.entry_model_key || row.entryModelKey || row.model_key || row.modelKey || row.mode || row.key || row.label,
            ))
            .filter(Boolean);
    }
    if (summary && typeof summary === "object") {
        const keys = [];
        Object.entries(summary).forEach(([key, value]) => {
            const nk = normalizeEntryModelKey(key);
            if (nk === "baseline" || nk.startsWith("entry_")) keys.push(nk);
            if (value && typeof value === "object") {
                const rk = normalizeEntryModelKey(
                    value.entry_model_key || value.entryModelKey || value.model_key || value.modelKey || value.mode || value.key,
                );
                if (rk) keys.push(rk);
                Object.keys(value).forEach((nestedKey) => {
                    const nn = normalizeEntryModelKey(nestedKey);
                    if (nn === "baseline" || nn.startsWith("entry_")) keys.push(nn);
                });
            }
        });
        return [...new Set(keys)].filter(Boolean);
    }
    return [];
}

/**
 * Dedup trades by (entry_model_key, id/trade_id/ob_id).
 *
 * NOTE: This dedup key intentionally includes `entry_model_key` so the
 * "show every scenario stacked" view (canonical key `__all__`) gives each
 * (scenario, OB) row a unique key. It is NOT a dedup for the same-vs-next
 * union — that union is disabled at the resolver level because same and next
 * carry different `entry_model_key` strings and never dedup against each other.
 */
export function uniqueTrades(trades = []) {
    const seen = new Set();
    const out = [];
    for (const trade of trades || []) {
        const key = [
            trade.entry_model_key || trade.entryModelKey || "baseline",
            trade.id || trade.trade_id || trade.tradeId || trade.base_trade_id || trade.baseTradeId || trade.ob_id || trade.obId || out.length,
        ].join("::");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trade);
    }
    return out;
}

export function collectAllEntryKeys(bundle = {}, baseTrades = []) {
    const keys = new Set(["baseline"]);
    Object.keys(entryTradesByMode(bundle)).forEach((key) => keys.add(normalizeEntryModelKey(key)));
    entrySummaryKeys(bundle).forEach((key) => keys.add(key));
    for (const trade of baseTrades || []) {
        const key = normalizeEntryModelKey(
            trade.entry_model_key || trade.entryModelKey || trade.entry_model || trade.entryModel,
        );
        if (key) keys.add(key);
    }
    return [...keys].filter(Boolean);
}

/**
 * Build the family → threshold → fillMode option tree from all known keys.
 * "both" is only added when a real bare/combined key exists (no `_same`/`_next`
 * suffix). If only same+next keys exist, "both" is omitted so the UI never
 * silently unions two separate CSVs.
 */
export function buildAvailableOptions(allKeys = []) {
    const families = new Set();
    const thresholdsByFamily = {};
    const fillModesByFamilyThreshold = {};
    const combinedFlagByFamilyThreshold = {};

    for (const key of allKeys) {
        const family = familyFromKey(key);
        if (!family) continue;
        families.add(family);

        const threshold = extractThreshold(key);
        if (threshold != null) {
            if (!thresholdsByFamily[family]) thresholdsByFamily[family] = new Set();
            thresholdsByFamily[family].add(threshold);

            const fillMode = fillModeFromKey(key);
            const ftKey = `${family}::${threshold}`;
            if (!fillModesByFamilyThreshold[ftKey]) fillModesByFamilyThreshold[ftKey] = new Set();
            if (fillMode === "same" || fillMode === "next") {
                fillModesByFamilyThreshold[ftKey].add(fillMode);
            } else {
                combinedFlagByFamilyThreshold[ftKey] = true;
                fillModesByFamilyThreshold[ftKey].add("both");
            }
        }
    }

    const FILL_ORDER = ["both", "same", "next"];
    const sortFillModes = (modes) => [...modes].sort(
        (a, b) => FILL_ORDER.indexOf(a) - FILL_ORDER.indexOf(b),
    );

    return {
        availableFamilies: [...families],
        thresholdsByFamily: Object.fromEntries(
            Object.entries(thresholdsByFamily).map(([fam, set]) => [fam, [...set].sort((a, b) => a - b)]),
        ),
        fillModesByFamilyThreshold: Object.fromEntries(
            Object.entries(fillModesByFamilyThreshold).map(([k, set]) => [k, sortFillModes(set)]),
        ),
        hasCombinedByFamilyThreshold: combinedFlagByFamilyThreshold,
    };
}

export function safeFillModeWhenNoCombined(availableModesForFT) {
    if (!availableModesForFT) return null;
    const modes = Array.isArray(availableModesForFT) ? availableModesForFT : [...availableModesForFT];
    if (modes.includes("next")) return "next";
    if (modes.includes("same")) return "same";
    return null;
}

export function buildCanonicalKey(family, threshold, fillMode) {
    if (!family || family === "baseline") return "baseline";
    const thresholdPart = thresholdToKeyPart(threshold);
    if (!thresholdPart) return null;
    const base = `entry_${family}_${thresholdPart}`;
    if (fillMode === "same" || fillMode === "next") return `${base}_${fillMode}`;
    return base; // both / null
}

export function resolveHierarchy(scenario, legacyEntryModelHint, allKeys, availableOptions) {
    const hasCombined = (family, threshold) => {
        if (family == null || threshold == null) return false;
        const ftKey = `${family}::${threshold}`;
        return Boolean(availableOptions?.hasCombinedByFamilyThreshold?.[ftKey]);
    };
    const modesFor = (family, threshold) => {
        if (family == null || threshold == null) return [];
        const ftKey = `${family}::${threshold}`;
        return availableOptions?.fillModesByFamilyThreshold?.[ftKey] || [];
    };
    const coerceFillMode = (family, threshold, requested) => {
        if (family === "baseline") return null;
        if (requested === "same" || requested === "next") return requested;
        if (hasCombined(family, threshold)) return null;
        return safeFillModeWhenNoCombined(modesFor(family, threshold));
    };

    if (scenario?.family) {
        const family = scenario.family;
        if (scenario.threshold != null) {
            return {
                resolvedFamily: family,
                resolvedThreshold: scenario.threshold,
                resolvedFillMode: coerceFillMode(family, scenario.threshold, scenario.fillMode),
            };
        }
        const familyKeys = allKeys.filter((k) => familyFromKey(k) === family);
        const combinedKey = familyKeys.find((k) => !/_same$|_next$/.test(k));
        const autoKey = combinedKey || familyKeys[0] || null;
        const autoThreshold = autoKey ? extractThreshold(autoKey) : null;
        const requestedFillMode = scenario.fillMode !== undefined
            ? scenario.fillMode
            : fillModeFromKey(autoKey || "");
        return {
            resolvedFamily: family,
            resolvedThreshold: autoThreshold,
            resolvedFillMode: coerceFillMode(family, autoThreshold, requestedFillMode),
        };
    }

    const hint = legacyEntryModelHint
        ? normalizeEntryModelKey(legacyEntryModelHint)
        : null;
    if (hint && hint !== "baseline" && hint !== "__all__") {
        const hf = familyFromKey(hint);
        const ht = extractThreshold(hint);
        return {
            resolvedFamily: hf,
            resolvedThreshold: ht,
            resolvedFillMode: coerceFillMode(hf, ht, fillModeFromKey(hint)),
        };
    }

    const teKey = allKeys.find((k) => k.startsWith("entry_triggered_edge"));
    if (teKey) {
        const teFam = "triggered_edge";
        const teThr = extractThreshold(teKey);
        return {
            resolvedFamily: teFam,
            resolvedThreshold: teThr,
            resolvedFillMode: coerceFillMode(teFam, teThr, undefined),
        };
    }

    return { resolvedFamily: "baseline", resolvedThreshold: null, resolvedFillMode: null };
}

/**
 * Pick the concrete trade list for a resolved canonical key.
 *
 * No-fake-Both invariant: when `resolvedFillMode` is null but no real combined
 * CSV exists, this function prefers `_next` then `_same` over unioning.
 * resolveHierarchy coerces away from null-fillMode before we get here; the
 * defensive fallback is for callers that bypass `resolveHierarchy`.
 */
export function selectTrades(canonicalKey, resolvedFillMode, bundle, baseTrades) {
    if (!canonicalKey || canonicalKey === "__all__") {
        return uniqueTrades([
            ...(baseTrades || []),
            ...Object.values(entryTradesByMode(bundle)).flat(),
        ]);
    }

    const byMode = entryTradesByMode(bundle);
    const selected = normalizeEntryModelKey(canonicalKey);

    if (selected === "baseline") {
        return byMode.entry_baseline || byMode.baseline || baseTrades || [];
    }

    if (byMode[selected]) return byMode[selected];

    if (!resolvedFillMode) {
        const nextKeyFb = `${selected}_next`;
        const sameKeyFb = `${selected}_same`;
        if (byMode[nextKeyFb]) return byMode[nextKeyFb];
        if (byMode[sameKeyFb]) return byMode[sameKeyFb];
        return [];
    }

    if (resolvedFillMode === "same" || resolvedFillMode === "next") {
        const baseKey = selected.replace(/_(same|next)$/, "");
        const pool = byMode[baseKey]
            || (baseTrades || []).filter((t) => {
                const k = normalizeEntryModelKey(
                    t.entry_model_key || t.entryModelKey || t.entry_model || t.entryModel,
                );
                return k === baseKey || k === selected;
            });
        return pool.filter((trade) => {
            const cancelled = truthyFlag(trade.cancelled_before_entry) || truthyFlag(trade.cancelledBeforeEntry);
            if (cancelled) return true;
            if (resolvedFillMode === "same") {
                return truthyFlag(trade.filled_on_trigger_candle) || truthyFlag(trade.filledOnTriggerCandle);
            }
            return trade.filled_on_trigger_candle === false
                || trade.filledOnTriggerCandle === false
                || String(trade.filled_on_trigger_candle).toLowerCase() === "false"
                || String(trade.filledOnTriggerCandle).toLowerCase() === "false";
        });
    }

    return (baseTrades || []).filter((trade) => normalizeEntryModelKey(
        trade.entry_model_key || trade.entryModelKey || trade.entry_model || trade.entryModel,
    ) === selected);
}

// ───────────────────────────────────────────────────────────────────────────────
// Source filename + label
// ───────────────────────────────────────────────────────────────────────────────

function deriveSourceFile({ bundle, variant, canonicalKey, isBaseline }) {
    if (isBaseline) {
        return variant ? `trades_${variant}.csv` : null;
    }
    if (!canonicalKey) return null;
    const guess = variant
        ? `trades_${variant}__${canonicalKey}.csv`
        : `${canonicalKey}.csv`;
    const sources =
        bundle?.entryResults?.sourceFiles
        || bundle?.entryResults?.source_files
        || [];
    const matched = sources.find((name) => {
        const lower = String(name).toLowerCase();
        return lower.endsWith(`__${canonicalKey}.csv`) || lower.endsWith(`${canonicalKey}.csv`);
    });
    return matched || guess;
}

function formatThreshold(n) {
    if (n == null || !isFinite(Number(n))) return "";
    const num = Number(n);
    return Number.isInteger(num) ? `${num}%` : `${num}%`;
}

function describeUniverseLabel({ universeType, resolvedFamily, resolvedThreshold, resolvedFillMode }) {
    if (universeType === "baseline" || !resolvedFamily || resolvedFamily === "baseline") {
        return "Baseline";
    }
    const thresh = resolvedThreshold != null ? ` ${formatThreshold(resolvedThreshold)}` : "";
    const fill = resolvedFillMode === "same" ? " · Same"
              : resolvedFillMode === "next" ? " · Next"
              : " · Both";
    if (resolvedFamily === "triggered_edge") return `Triggered Edge${thresh}${fill}`;
    if (resolvedFamily === "penetration")    return `Penetration${thresh}`;
    return `${resolvedFamily}${thresh}${fill}`;
}

// ───────────────────────────────────────────────────────────────────────────────
// High-level resolvers
// ───────────────────────────────────────────────────────────────────────────────

function pickVariant(bundle, scenario, fallbackVariant) {
    const explicit = scenario?.positionVariant;
    if (explicit && bundle?.tradesByVariant?.[explicit]) return explicit;
    if (fallbackVariant && bundle?.tradesByVariant?.[fallbackVariant]) return fallbackVariant;
    if (bundle?.primaryVariant) return bundle.primaryVariant;
    const variants = Object.keys(bundle?.tradesByVariant || {});
    return variants[0] || null;
}

function getBaseVariantTrades(bundle, variant) {
    if (variant && Array.isArray(bundle?.tradesByVariant?.[variant])) {
        return bundle.tradesByVariant[variant];
    }
    return Array.isArray(bundle?.trades) ? bundle.trades : [];
}

function getBaselineEntryTrades(bundle, baseVariantTrades) {
    const byMode = entryTradesByMode(bundle);
    return byMode.entry_baseline || byMode.baseline || baseVariantTrades || [];
}

/**
 * Resolve the active TradeUniverse from a bundle + scenario.
 *
 * @param {object} params
 * @param {object|null} params.bundle              The full run bundle.
 * @param {object|null} [params.scenario]          { family, threshold, fillMode, positionVariant }
 * @param {string|null} [params.fallbackVariant]   Variant to use when scenario.positionVariant is unset.
 * @param {string|null} [params.legacyEntryModelHint]  Initial model hint passed by StrategyMap
 *                                                      when a persisted entry-model selection
 *                                                      exists but no explicit scenario object yet.
 * @returns {object} TradeUniverse
 */
export function resolveTradeUniverse(params = {}) {
    const {
        bundle = null,
        scenario = null,
        fallbackVariant = null,
        legacyEntryModelHint = null,
    } = params;

    const warnings = [];

    if (!bundle) {
        warnings.push({ code: "NO_BUNDLE", message: "No run bundle supplied." });
        return emptyUniverse(warnings);
    }

    const variant = pickVariant(bundle, scenario, fallbackVariant);
    const baseVariantTrades = getBaseVariantTrades(bundle, variant);

    const allKeys = collectAllEntryKeys(bundle, baseVariantTrades);
    const availableOptions = buildAvailableOptions(allKeys);

    const { resolvedFamily, resolvedThreshold, resolvedFillMode } =
        resolveHierarchy(scenario || {}, legacyEntryModelHint, allKeys, availableOptions);

    const isBaseline = !resolvedFamily || resolvedFamily === "baseline";
    const universeType = isBaseline ? "baseline" : "scenario";
    const canonicalKey = buildCanonicalKey(resolvedFamily, resolvedThreshold, resolvedFillMode);

    const trades = isBaseline
        ? getBaselineEntryTrades(bundle, baseVariantTrades)
        : selectTrades(canonicalKey, resolvedFillMode, bundle, baseVariantTrades);

    // Coercion detection
    const ftKey = resolvedFamily && resolvedThreshold != null
        ? `${resolvedFamily}::${resolvedThreshold}`
        : null;
    const hasCombined = ftKey
        ? Boolean(availableOptions.hasCombinedByFamilyThreshold?.[ftKey])
        : false;
    const ftModes = ftKey ? (availableOptions.fillModesByFamilyThreshold[ftKey] || []) : [];

    if (scenario && scenario.fillMode !== undefined) {
        const wanted = scenario.fillMode === null ? "both" : scenario.fillMode;
        const got = resolvedFillMode === null ? "both" : resolvedFillMode;
        if (wanted !== got) {
            warnings.push({
                code: "FILL_MODE_COERCED",
                message: `Requested fill mode "${wanted}" coerced to "${got}".`,
            });
        }
    }
    if (resolvedFamily && resolvedFamily !== "baseline" && !hasCombined
        && ftModes.includes("same") && ftModes.includes("next")) {
        warnings.push({
            code: "BOTH_UNAVAILABLE_NO_COMBINED",
            message: "Same and Next were exported as separate CSVs; merging them would double-count each OB.",
        });
    }
    if (!isBaseline && (!trades || trades.length === 0)) {
        warnings.push({
            code: "NO_TRADES_FOR_SCENARIO",
            message: `No trades found for "${canonicalKey}" on variant "${variant ?? "—"}".`,
        });
    }

    const sourceFile = deriveSourceFile({ bundle, variant, canonicalKey, isBaseline });
    const label = describeUniverseLabel({
        universeType, resolvedFamily, resolvedThreshold, resolvedFillMode,
    });

    const baselineTrades = isBaseline
        ? trades
        : getBaselineEntryTrades(bundle, baseVariantTrades);

    const stats = summarizeTradeSanity(trades || []);
    const baselineStats = isBaseline ? stats : summarizeTradeSanity(baselineTrades || []);

    return {
        universeType,
        label,
        sourceKey: canonicalKey || "baseline",
        sourceFile,
        variant,
        scenario: {
            family:    resolvedFamily,
            threshold: resolvedThreshold,
            fillMode:  resolvedFillMode,
        },
        trades: trades || [],
        stats,
        warnings,
        canCompareToBaseline: !isBaseline,
        baselineTrades: baselineTrades || [],
        baselineStats,
    };
}

/**
 * Shortcut: the baseline universe of the given (or primary) variant. Useful
 * for pages like RunDetail that intentionally show baseline numbers and want
 * the same TradeUniverse contract as scenario-aware pages.
 */
export function resolveBaselineUniverse({ bundle, variant = null } = {}) {
    return resolveTradeUniverse({
        bundle,
        scenario: { family: "baseline", positionVariant: variant },
        fallbackVariant: variant,
    });
}

/**
 * One-line description of a universe, suitable for chip / log strings.
 *   "Baseline · allow_multi_position · 35 rows"
 *   "Triggered Edge 25% · Next · allow_multi_position · 35 rows"
 */
export function describeTradeUniverse(universe) {
    if (!universe) return "—";
    const parts = [universe.label];
    if (universe.variant) parts.push(universe.variant);
    parts.push(`${universe.stats?.total ?? 0} rows`);
    return parts.join(" · ");
}

// ───────────────────────────────────────────────────────────────────────────────
// Internal — empty / default universe
// ───────────────────────────────────────────────────────────────────────────────

function emptyUniverse(extraWarnings = []) {
    const stats = summarizeTradeSanity([]);
    return {
        universeType: "baseline",
        label: "No run",
        sourceKey: "baseline",
        sourceFile: null,
        variant: null,
        scenario: { family: null, threshold: null, fillMode: null },
        trades: [],
        stats,
        warnings: [...extraWarnings],
        canCompareToBaseline: false,
        baselineTrades: [],
        baselineStats: stats,
    };
}
