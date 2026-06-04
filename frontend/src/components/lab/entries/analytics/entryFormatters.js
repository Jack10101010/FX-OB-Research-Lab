// ── entryFormatters.js ───────────────────────────────────────────────────────
// Pure formatting helpers shared across all entries sub-lab components.
// No React, no side-effects.

export const isFiniteNumber = (v) => v != null && Number.isFinite(Number(v));
export const num            = (v) => isFiniteNumber(v) ? Number(v) : 0;
export const round1         = (v) => Number(num(v).toFixed(1));
export const round2         = (v) => Number(num(v).toFixed(2));
export const round3         = (v) => Number(num(v).toFixed(3));

export const fmtR    = (v) => `${num(v) >= 0 ? "+" : ""}${round1(v).toFixed(1)}R`;
export const fmtPct  = (v) => isFiniteNumber(v) ? `${round1(v).toFixed(1)}%` : "—";
export const fmtMaybeR   = (v) => isFiniteNumber(v) ? fmtR(v)   : "—";
export const fmtMaybePct = (v) => isFiniteNumber(v) ? fmtPct(v) : "—";
export const fmtMaybeExp = (v) => isFiniteNumber(v) ? `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(3)}R` : "—";
export const fmtCount    = (v) => isFiniteNumber(v) ? String(Number(v)) : "—";
export const fmtDelta    = (v) => isFiniteNumber(v) ? `${num(v) >= 0 ? "+" : ""}${round1(v).toFixed(1)}R` : "—";

export const slug    = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const pad2    = (v) => String(v).padStart(2, "0");

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const HOURS    = Array.from({ length: 24 }, (_, h) => h);
export const dayIndex = (utcDay) => (utcDay + 6) % 7;

export function normalizeMode(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function prettyMode(value) {
    return String(value || "Unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function variantLabel(v) {
    return {
        single_position:      "Single position",
        allow_multi_position: "Allow multi",
        one_per_direction:    "One per direction",
        unknown:              "Trades",
    }[v] || v || "N/A";
}

export function normalizePct(value) {
    if (!isFiniteNumber(value)) return null;
    const n = Number(value);
    return n <= 1 ? n * 100 : n;
}

export function firstNumber(obj, ...keys) {
    for (const key of keys) {
        const v = obj?.[key];
        if (isFiniteNumber(v)) return Number(v);
    }
    return null;
}

export function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

export function sessionOf(value) {
    const d = parseDate(value);
    if (!d) return "Unknown";
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h < 7)  return "Asia";
    if (h < 10) return "London";
    if (h < 12) return "London Lull";
    if (h < 17) return "New York";
    return "Outside";
}

export const SESSIONS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];

// ── Directional scenario formatters ──────────────────────────────────────────

/**
 * Format a compact directional side key into a human-readable label.
 *   te25_same → "TE 25% Same"
 *   te25_next → "TE 25% Next"
 *   te25_d2   → "TE 25% Delay +2"
 *   te25_d3   → "TE 25% Delay +3"
 *   pen25     → "Pen 25%"
 *   baseline  → "Baseline"
 *   none      → "Disabled"
 */
export function formatDirectionalSideKey(key) {
    const k = String(key || "").trim().toLowerCase();
    if (!k || k === "none") return "Disabled";
    if (k === "baseline") return "Baseline";
    const penMatch = k.match(/^pen(\d+)$/);
    if (penMatch) return `Pen ${penMatch[1]}%`;
    const teMatch = k.match(/^te(\d+)_(same|next|d\d+)$/);
    if (teMatch) {
        const thr = teMatch[1];
        const mode = teMatch[2];
        if (mode === "same") return `TE ${thr}% Same`;
        if (mode === "next") return `TE ${thr}% Next`;
        const dn = mode.match(/^d(\d+)$/);
        if (dn) return `TE ${thr}% Delay +${dn[1]}`;
    }
    return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a full directional scenario ID into a human-readable label.
 *   "dir_long_te25_d2__short_te25_next" → "Long TE 25% Delay +2 / Short TE 25% Next"
 *   "dir_long_baseline__short_none"     → "Long Baseline / Short Disabled"
 *   Falls back gracefully for unknown formats.
 */
export function formatDirectionalScenarioLabel(scenarioId) {
    const s = String(scenarioId || "");
    const m = s.match(/^dir_long_(.+?)__short_(.+)$/);
    if (!m) return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
    return `Long ${formatDirectionalSideKey(m[1])} / Short ${formatDirectionalSideKey(m[2])}`;
}
