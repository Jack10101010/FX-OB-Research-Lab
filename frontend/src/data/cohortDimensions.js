// cohortDimensions.js — neutral cohort/dimension registry (Research Lab Phase 0).
//
// The single source of truth for "trade → categorical value" accessors, extracted
// from components/lab/failures/shared/failuresDimensions.js so non-Failures
// consumers (the future Research Lab, timing work) can import the registry from
// the data layer instead of reaching across a component/workstream boundary.
//
// BACK-COMPAT: failuresDimensions.js now re-exports CORE_DIMENSIONS as its
// FAILURE_DIMENSIONS (scoped, NOT including the new month/year dims) so Failures
// Lab behavior is byte-identical. The new month/year dims live only in the wider
// DIMENSIONS list used by Research Lab.
//
// No React. Pure data + accessor functions. The CORE accessors still source from
// the Failures shared utils (the canonical implementations); relocating those is a
// later phase — see RESEARCH-LAB-ARCHITECTURE-AUDIT-1.md.

import {
    sessionOf, directionOf, structureOf, obWidthOf,
    entryHour, entryWeekday, WEEKDAYS, isFiniteNumber,
} from "@/components/lab/failures/shared/failuresUtils";
import { archetypeLabel } from "@/components/lab/failures/shared/failuresRegistry";

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

// ── New timing dimensions (Research Lab) — self-contained UTC parse so they carry
// no dependency on the Failures utils. Semantics mirror timingAnalytics.
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseEntryDate(t) {
    const raw = t?.entry ?? t?.entryTime ?? t?.fill_time ?? t?.fillTime ?? t?.entry_time;
    if (raw == null || raw === "") return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
}
function monthLabel(t) { const d = parseEntryDate(t); return d ? MONTH_LABELS[d.getUTCMonth()] : null; }
function yearLabel(t) { const d = parseEntryDate(t); return d ? String(d.getUTCFullYear()) : null; }

// tier mirrors failuresDataQuality: 0 = always derivable, 1 = exporter-backed,
// 2 = needs exporter upgrade (may be absent).
// CORE_DIMENSIONS is the exact legacy FAILURE_DIMENSIONS set (unchanged), so the
// back-compat export and every Failures consumer behave identically.
export const CORE_DIMENSIONS = [
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

// Timing dimensions — only in the wider DIMENSIONS list (NOT in CORE), so Failures
// discovery never enumerates them and its UI dimension picker is unchanged.
export const TIMING_DIMENSIONS = [
    { key: "month", label: "Month", tier: 0, accessor: monthLabel },
    { key: "year",  label: "Year",  tier: 0, accessor: yearLabel },
];

// Full neutral registry for Research Lab.
export const DIMENSIONS = [...CORE_DIMENSIONS, ...TIMING_DIMENSIONS];

export function byKey(dims) {
    return Object.fromEntries((Array.isArray(dims) ? dims : []).map((d) => [d.key, d]));
}

export const DIMENSION_BY_KEY = byKey(DIMENSIONS);

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

// Defaults to the full registry; callers (e.g. the Failures back-compat shim) may
// pass a scoped dim list to preserve their original behavior.
export function availableDimensions(trades, dims = DIMENSIONS) {
    return (Array.isArray(dims) ? dims : []).filter((d) => dimensionAvailable(d, trades));
}
