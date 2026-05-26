// ── failuresFormatters.js ────────────────────────────────────────────────────
// Display formatting helpers for Failures Lab.
// Imports numeric/R formatters from entryFormatters — never duplicates them.

export {
    fmtR,
    fmtPct,
    fmtMaybeR,
    fmtMaybePct,
    round1,
    round2,
} from "@/components/lab/entries/analytics/entryFormatters";

import { archetypeColour, archetypeTone, archetypeLabel } from "./failuresRegistry";

// ── Duration ─────────────────────────────────────────────────────────────────

export function fmtDuration(mins) {
    if (mins == null || !Number.isFinite(Number(mins))) return "—";
    const m = Math.round(Number(mins));
    if (m < 60)  return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

// ── Severity ─────────────────────────────────────────────────────────────────

export function fmtSeverity(score) {
    if (score == null || !Number.isFinite(Number(score))) return "—";
    return Number(score).toFixed(1);
}

export function severityLabel(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return "—";
    if (s >= 8) return "CRITICAL";
    if (s >= 6) return "HIGH";
    if (s >= 4) return "MODERATE";
    return "LOW";
}

export function severityTone(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return "muted";
    if (s >= 8) return "danger";
    if (s >= 6) return "warning";
    if (s >= 4) return "secondary";
    return "muted";
}

export function severityColour(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return "hsl(var(--text-2))";
    if (s >= 8) return "hsl(var(--danger))";
    if (s >= 6) return "hsl(var(--warning))";
    if (s >= 4) return "hsl(var(--accent-secondary))";
    return "hsl(var(--text-2))";
}

// ── Classification confidence ─────────────────────────────────────────────────

export function confidenceLabel(conf) {
    const map = {
        HIGH:          "HIGH",
        MEDIUM:        "MED",
        LOW:           "LOW",
        BORDERLINE:    "BORDERLINE",
        UNCLASSIFIED:  "UNCLASSIFIED",
    };
    return map[conf] ?? conf ?? "—";
}

export function confidenceTone(conf) {
    const map = {
        HIGH:         "success",
        MEDIUM:       "secondary",
        LOW:          "warning",
        BORDERLINE:   "danger",
        UNCLASSIFIED: "muted",
    };
    return map[conf] ?? "muted";
}

// ── Archetype display helpers ─────────────────────────────────────────────────

export function archetypePillProps(id) {
    return {
        label:  archetypeLabel(id),
        tone:   archetypeTone(id),
        colour: archetypeColour(id),
    };
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export function fmtCount(n) {
    return Number.isFinite(Number(n)) ? String(Math.round(Number(n))) : "—";
}

export function fmtLossRate(lossCount, totalCount) {
    if (!totalCount) return "—";
    return `${((lossCount / totalCount) * 100).toFixed(1)}%`;
}

export function fmtDelta(v) {
    if (!Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}
