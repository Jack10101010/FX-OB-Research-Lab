// dataRanges.js — candle-dataset presets for Strategy Builder (PURE, dependency-free).
//
// The frontend NEVER bundles raw candles; it only submits a `candle_file` name + a date
// window to the Lux sidecar, which reads the CSV from data/candles/. This module is the
// single source of truth for the two known EURUSD datasets + the "Custom" escape hatch, so
// the Strategy Builder control, the run-name label, and the validators all agree.
//
// Backend contract (confirmed): configTranslator emits `candle_file` (bare filename via
// normalizeCandleFile) + `start_date` / `end_date`. Lux loads `CANDLES_DIR / candle_file`.
// Files live under data/candles/; we store the full `data/candles/…` path in cfg.dataFile
// (matching the existing default) and let the translator strip it.

export const DATA_RANGES = {
    recent: {
        key: "recent",
        label: "Recent / UI default",
        short: "Recent/UI range",
        file: "data/candles/EURUSD_1m.csv",
        from: "2020-01-02",
        to: "2026-06-18",
        // date-picker clamp bounds = the file's own extent
        min: "2020-01-01",
        max: "2026-06-19",
        help: "Matches existing 2020-start UI runs. Useful for comparing with previous UI results.",
    },
    full: {
        key: "full",
        label: "Full available history",
        short: "Full history",
        file: "data/candles/EURUSD_1m_extended_2015_2026.csv",
        from: "2015-01-01",
        to: "2026-06-19",
        min: "2015-01-01",
        max: "2026-06-19",
        help: "Uses the full 2015→2026 candle file used by research. Slower, but aligns UI runs with full-history research.",
    },
};

export const DATA_RANGE_ORDER = ["recent", "full", "custom"];

/**
 * Deterministic "Full History" resolution: the widest known dataset, with BOTH dates
 * pinned to that file's actual earliest/latest candle extent. This is the single entry
 * point for the "Full history" preset and the "Max Range" button — neither may hardcode
 * a start (the old bug forced 2020-01-02) nor depend on an async market-data status
 * (which caused the 2026-06-18 vs -19 A/B drift). Pure + constant → two A/B runs get
 * byte-identical dates.
 *   → { dataFile: extended 2015→2026 file, dateFrom: earliest, dateTo: latest }
 */
export function resolveFullHistory() {
    const dr = DATA_RANGES.full;
    return { dataFile: dr.file, dateFrom: dr.from, dateTo: dr.to };
}

/** Bare filename (strip any path/prefix), lower-cased for comparison. */
export function bareCandleFile(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    const parts = s.split(/[\\/]/).filter(Boolean);
    return (parts[parts.length - 1] || "").toLowerCase();
}

const d10 = (v) => String(v || "").slice(0, 10);

/**
 * Which preset does a UI cfg currently match? "recent" | "full" | "custom".
 * A preset matches only when BOTH the candle file AND the exact from/to dates match, so an
 * edited date inside a dataset reads as "custom" (accurate — the user diverged from a preset).
 */
export function resolveDataRangeKey(cfg = {}) {
    const file = bareCandleFile(cfg.dataFile ?? cfg.candle_file);
    const from = d10(cfg.dateFrom ?? cfg.start_date);
    const to = d10(cfg.dateTo ?? cfg.end_date);
    for (const k of ["recent", "full"]) {
        const dr = DATA_RANGES[k];
        if (bareCandleFile(dr.file) === file && from === dr.from && to === dr.to) return k;
    }
    return "custom";
}

/**
 * Human data-range label from the EMITTED backend config (candle_file authoritative).
 * "Full history" | "Recent/UI range" | null (unknown/custom file). Used by deriveRunName.
 */
export function dataRangeLabel(config = {}) {
    const file = bareCandleFile(config.candle_file ?? config.dataFile);
    if (!file) return null;
    if (file === bareCandleFile(DATA_RANGES.full.file)) return "Full history";
    if (file === bareCandleFile(DATA_RANGES.recent.file)) return "Recent/UI range";
    return null;
}

/** cfg patch applied when the user picks a preset (never applied silently on load). */
export function dataRangePatch(key) {
    const dr = DATA_RANGES[key];
    if (!dr) return null;
    return { dataFile: dr.file, dateFrom: dr.from, dateTo: dr.to };
}

/**
 * Date-picker bounds for the SELECTED CANDLE FILE (not the exact-date preset match).
 * This is the source of truth for min/max: whichever dataset file is chosen drives the
 * selectable range, so editing a date (which makes cfg no longer match a preset exactly,
 * i.e. "Custom") does NOT re-clamp the calendar to the fetched 2020 manifest bounds.
 *   • extended 2015 file  → { 2015-01-01, 2026-06-19 } (unlocks 2015–2019)
 *   • 2020 file           → { 2020-01-01, 2026-06-19 }
 *   • unknown file        → null (caller falls back to fetched market-data bounds)
 */
export function fileBounds(cfg = {}) {
    const file = bareCandleFile(cfg.dataFile ?? cfg.candle_file);
    if (!file) return null;
    if (file === bareCandleFile(DATA_RANGES.full.file)) return { min: DATA_RANGES.full.min, max: DATA_RANGES.full.max };
    if (file === bareCandleFile(DATA_RANGES.recent.file)) return { min: DATA_RANGES.recent.min, max: DATA_RANGES.recent.max };
    return null;
}

/** Effective date-picker bounds: the selected file's extent, else the fetched fallback. */
export function dataRangeBounds(cfg = {}, fallback = null) {
    return fileBounds(cfg) || fallback;
}

// Union of all known EURUSD datasets — the widest selectable window. The date pickers use THIS
// (not a single file's extent) so a 2015 date is ALWAYS reachable; picking a pre-2020 date then
// auto-switches the candle file to the one that covers it (candleFileForStart). This removes the
// chicken-and-egg where you had to find the "Full history" toggle before 2015 became selectable.
export const UNION_BOUNDS = { min: DATA_RANGES.full.min, max: DATA_RANGES.full.max }; // 2015-01-01 → 2026-06-19
export function unionBounds() { return { min: UNION_BOUNDS.min, max: UNION_BOUNDS.max }; }

/**
 * The candle file that actually covers a chosen start date. If the start predates the 2020
 * file's coverage, upgrade to the extended 2015 file; otherwise keep the current file (never
 * silently downgrade a Full/extended selection). Returns a `data/candles/…` path.
 */
export function candleFileForStart(dateFrom, currentFile) {
    const from = d10(dateFrom);
    if (from && from < DATA_RANGES.recent.min) return DATA_RANGES.full.file; // needs pre-2020 → extended
    return currentFile || DATA_RANGES.recent.file;
}

/**
 * Warmed vs cold context for the chosen dataset + start date.
 *   full + start at file head  → "warmed"  (11.5y of prior structure/market-state)
 *   recent                      → "cold"    (2020-start file has no pre-2020 warmup)
 *   custom with start > file head→ "cold"    (earlier OBs / market-state unavailable)
 * Returns { mode, note }.
 */
export function dataRangeContext(cfg = {}) {
    const b = fileBounds(cfg);
    if (!b) return { mode: "warmed", note: "" };            // unknown file → make no claim
    const from = d10(cfg.dateFrom ?? cfg.start_date);
    const isFull = bareCandleFile(cfg.dataFile ?? cfg.candle_file) === bareCandleFile(DATA_RANGES.full.file);
    // Start later than the file's own head → cold window regardless of dataset.
    if (from && from > b.min) {
        return { mode: "cold", note: "Cold-window runs can differ from warmed full-history runs because earlier order blocks and market-state context are unavailable." };
    }
    // Start at the file head: full = warmed full history; the 2020 file is inherently cold pre-2020.
    if (isFull) return { mode: "warmed", note: "Full-history warmed context." };
    return { mode: "cold", note: "2020-start dataset — the earliest window has no pre-2020 warmup context." };
}

/**
 * Pre-launch date summary — the exact resolved values a run WILL submit, so the user can
 * confirm before launching. Pure; derives everything from cfg + the known dataset extents.
 *   {
 *     candleFile,          // bare filename actually sent to the backtester
 *     earliest, latest,    // the selected dataset's true candle extent (null if unknown file)
 *     submittedStart,      // start_date that will be submitted
 *     submittedEnd,        // end_date that will be submitted
 *     isFullHistory,       // true iff file is the extended dataset AND dates == its extent
 *     startTruncated,      // true iff start is later than the dataset's earliest (e.g. 2020 vs 2015)
 *     endTruncated,        // true iff end is earlier than the dataset's latest
 *     warnings: [ ... ],   // human-readable mismatch notes (empty when clean)
 *   }
 * `startTruncated` is exactly the defect that produced 2020-start "Full history" runs.
 */
export function preLaunchDateSummary(cfg = {}) {
    const candleFile = bareCandleFile(cfg.dataFile ?? cfg.candle_file);
    const b = fileBounds(cfg);                    // { min, max } for known files, else null
    const earliest = b ? b.min : null;
    const latest = b ? b.max : null;
    const submittedStart = d10(cfg.dateFrom ?? cfg.start_date) || null;
    const submittedEnd = d10(cfg.dateTo ?? cfg.end_date) || null;
    const isExtended = candleFile === bareCandleFile(DATA_RANGES.full.file);

    const startTruncated = !!(earliest && submittedStart && submittedStart > earliest);
    const endTruncated = !!(latest && submittedEnd && submittedEnd < latest);
    const isFullHistory = isExtended && !startTruncated && !endTruncated
        && submittedStart === earliest && submittedEnd === latest;

    const warnings = [];
    if (startTruncated) {
        warnings.push(`Start date ${submittedStart} is later than the dataset's earliest candle ${earliest} — ${countYears(earliest, submittedStart)} of history are excluded. Use "Full history" / "Max Range" for the complete ${earliest}→${latest} span.`);
    }
    if (endTruncated) {
        warnings.push(`End date ${submittedEnd} is earlier than the dataset's latest candle ${latest}.`);
    }
    if (isExtended && startTruncated) {
        warnings.push(`This run uses the extended 2015 dataset file but starts in ${String(submittedStart).slice(0, 4)}; the run name may still read "Full history" even though it is not.`);
    }
    return { candleFile, earliest, latest, submittedStart, submittedEnd, isFullHistory, startTruncated, endTruncated, warnings };
}

/** Whole-year gap between two YYYY-MM-DD dates (for the truncation message). */
function countYears(a, b) {
    const ya = Number(String(a).slice(0, 4));
    const yb = Number(String(b).slice(0, 4));
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) return "several years";
    const n = Math.max(0, yb - ya);
    return n === 1 ? "~1 year" : `~${n} years`;
}
