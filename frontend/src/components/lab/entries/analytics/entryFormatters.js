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
