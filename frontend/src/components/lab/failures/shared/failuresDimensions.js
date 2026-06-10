// ── failuresDimensions.js ────────────────────────────────────────────────────
// Shared dimension registry for Failures Lab (V4). Single source of truth for how
// a trade maps to a categorical value, so every research surface (drivers, pairs,
// drilldowns, the future Failure Explorer, Overview migration) uses the SAME
// accessors instead of re-implementing them.
//
// No React. Pure data + accessor functions.
//
// Convention: an accessor returns a display string, or `null` when the trade
// carries no real signal for that dimension. The aggregation engine renders null
// as an "Unknown" bucket (or drops it when requireKnown). `dimensionAvailable`
// detects genuinely-unexported dimensions (e.g. FFT) so they aren't hidden behind
// fake Unknowns.

import {
    sessionOf, directionOf, structureOf, obWidthOf,
    entryHour, entryWeekday, WEEKDAYS, isFiniteNumber,
} from "./failuresUtils";
import { archetypeLabel } from "./failuresRegistry";

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

function structureLabel(t) {
    const s = structureOf(t);
    return s === "choch" ? "CHoCH" : s === "bos" ? "BOS" : null;
}
function hourLabel(t) {
    const h = entryHour(t);
    return h == null ? null : `${String(h).padStart(2, "0")}:00 UTC`;
}
function weekdayLabel(t) {
    const d = entryWeekday(t);
    if (d == null || d < 0) return null;
    return Array.isArray(WEEKDAYS) ? (WEEKDAYS[d] ?? `D${d}`) : `D${d}`;
}
function obWidthBucket(t) {
    const w = obWidthOf(t);
    if (!isFiniteNumber(w)) return null;
    if (w <= 3) return "0–3 pips";
    if (w <= 6) return "3–6 pips";
    if (w <= 10) return "6–10 pips";
    if (w <= 15) return "10–15 pips";
    return ">15 pips";
}
// How deeply price penetrated / breached the order block before the trade failed.
// Prefers max OB penetration % (maxObPenetrationPct / max_ob_penetration_pct), falls
// back to fill penetration %. null when neither is present → dropped as Unknown, and
// dimensionAvailable hides the whole dimension for runs that never export it.
function penetrationBucket(t) {
    const raw = t?.maxObPenetrationPct ?? t?.max_ob_penetration_pct
        ?? t?.fillPenetrationPct ?? t?.fill_penetration_pct;
    if (!isFiniteNumber(raw)) return null;
    const pct = Number(raw);
    if (pct < 50) return "Shallow <50%";
    if (pct < 100) return "Mid 50–100%";
    if (pct <= 110) return "Full breach 100–110%";
    return "Deep breach >110%";
}
function severityBucket(t) {
    const v = t?.severity;
    if (!isFiniteNumber(v)) return null;
    const n = Number(v);
    if (n < 3) return "Low (0–3)";
    if (n < 5) return "Moderate (3–5)";
    if (n < 7) return "High (5–7)";
    return "Critical (7+)";
}

// tier mirrors failuresDataQuality: 0 = always derivable, 1 = exporter-backed,
// 2 = needs exporter upgrade (may be absent).
export const FAILURE_DIMENSIONS = [
    { key: "session",    label: "Session",     tier: 0, accessor: (t) => { const s = sessionOf(t?.entry); return s && s !== "Unknown" ? s : null; } },
    { key: "direction",  label: "Direction",   tier: 0, accessor: (t) => { const d = directionOf(t); return d && d !== "unknown" ? cap(d) : null; } },
    { key: "structure",  label: "Structure",   tier: 0, accessor: structureLabel },
    { key: "weekday",    label: "Weekday",     tier: 0, accessor: weekdayLabel },
    { key: "hour",       label: "Hour (UTC)",  tier: 0, accessor: hourLabel },
    { key: "archetype",  label: "Archetype",   tier: 0, accessor: (t) => (t?.archetype ? archetypeLabel(t.archetype) : null) },
    { key: "severity",   label: "Severity",    tier: 0, accessor: severityBucket, numeric: true },
    { key: "obwidth",    label: "OB Width",    tier: 0, accessor: obWidthBucket, numeric: true },
    { key: "penetration", label: "OB Penetration", tier: 0, numeric: true, accessor: penetrationBucket,
      description: "How deeply price penetrated / breached the order block before the trade failed (max OB penetration %, fill % fallback)." },
    { key: "entryModel", label: "Entry Model", tier: 1, accessor: (t) => (t?.entry_model_key || t?.entryModelKey) || null },
    { key: "ghost",      label: "Ghost",       tier: 1, accessor: (t) => (t?.ghost_outcome || t?.ghostOutcome) || null },
    { key: "fft",        label: "FFT",         tier: 2, accessor: (t) => (t?.first_failed_tag || t?.firstFailedTag) || null },
];

export const DIMENSION_BY_KEY = Object.fromEntries(FAILURE_DIMENSIONS.map((d) => [d.key, d]));

export function resolveDimension(dim) {
    if (!dim) return null;
    return typeof dim === "string" ? (DIMENSION_BY_KEY[dim] ?? null) : dim;
}

// A dimension is "available" if a meaningful fraction of a sample carries a known
// value. Detects genuinely-unexported dimensions (e.g. FFT → false) rather than
// presenting an all-Unknown column.
export function dimensionAvailable(dim, trades, { sampleSize = 20, threshold = 0.5 } = {}) {
    const d = resolveDimension(dim);
    if (!d || !Array.isArray(trades) || trades.length === 0) return false;
    const sample = trades.slice(0, sampleSize);
    const known = sample.filter((t) => d.accessor(t) != null).length;
    return known / sample.length >= threshold;
}

export function availableDimensions(trades) {
    return FAILURE_DIMENSIONS.filter((d) => dimensionAvailable(d, trades));
}
