// ── failuresExporter.js ──────────────────────────────────────────────────────
// CSV export builders and HypothesisLab bridge for Failures Lab.
// No React. No side effects.

import { rOf, durationMinutes, directionOf, structureOf, obWidthOf } from "./failuresUtils";
import { fmtDuration, severityLabel } from "./failuresFormatters";

// ── HypothesisLab bridge ──────────────────────────────────────────────────────
// Schema verified from EntryHypothesisLab.jsx — STORAGE_KEY = "fxob_entry_hypotheses_v1"
// Card schema: { id, title, description, rationale, linkedMode, status, tags[], createdAt, updatedAt }

const HYPO_STORAGE_KEY = "fxob_entry_hypotheses_v1";

function genHypoId() {
    return `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function buildHypothesisCard({ title, description = "", rationale = "" }) {
    const now = new Date().toISOString();
    return {
        id:          genHypoId(),
        title:       String(title || "").trim(),
        description: String(description || "").trim(),
        rationale:   String(rationale || "").trim(),
        linkedMode:  null,
        status:      "pending",
        tags:        ["failures-lab"],
        createdAt:   now,
        updatedAt:   now,
    };
}

/**
 * writeHypothesisToStorage(card) → boolean
 * Appends a hypothesis card to the HypothesisLab localStorage list.
 * Never throws — returns false on failure.
 */
export function writeHypothesisToStorage(card) {
    try {
        const raw  = localStorage.getItem(HYPO_STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return false;
        // Avoid duplicates by title
        if (list.some(h => h.title === card.title)) return true;
        list.unshift(card); // newest first (matches EntryHypothesisLab.jsx ordering)
        localStorage.setItem(HYPO_STORAGE_KEY, JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

/**
 * writeBatchHypotheses(cards[]) → { written, skipped }
 */
export function writeBatchHypotheses(cards) {
    let written = 0, skipped = 0;
    for (const card of cards) {
        const ok = writeHypothesisToStorage(card);
        ok ? written++ : skipped++;
    }
    return { written, skipped };
}

// ── CSV export ────────────────────────────────────────────────────────────────

export const CSV_COLUMNS = {
    id:                { label: "ID",             get: t => t?.id ?? t?.trade_id ?? "" },
    entry:             { label: "Entry",           get: t => t?.entry ?? "" },
    direction:         { label: "Direction",       get: t => directionOf(t) },
    session:           { label: "Session",         get: t => t?.session ?? "" },
    structure:         { label: "Structure",       get: t => structureOf(t) },
    r:                 { label: "R",               get: t => rOf(t).toFixed(2) },
    ob_width:          { label: "OB Width (pips)", get: t => obWidthOf(t) ?? "" },
    archetype:         { label: "Archetype",       get: t => t?.archetype ?? "" },
    confidence:        { label: "Confidence",      get: t => t?.confidence ?? "" },
    severity:          { label: "Severity",        get: t => t?.severity != null ? t.severity.toFixed(1) : "" },
    severity_label:    { label: "Severity Level",  get: t => t?.severity != null ? severityLabel(t.severity) : "" },
    duration_mins:     { label: "Duration (min)",  get: t => { const d = durationMinutes(t); return d != null ? Math.round(d) : ""; } },
    duration_fmt:      { label: "Duration",        get: t => fmtDuration(durationMinutes(t)) },
    manual_tag:        { label: "Manual Tag",      get: t => t?._manualArchetype ?? "" },
    manual_note:       { label: "Note",            get: t => (t?._manualNote ?? "").replace(/"/g, '""') },
    mae:               { label: "MAE (R)",         get: t => t?.mae ?? "" },
    mfe:               { label: "MFE (R)",         get: t => t?.mfe ?? "" },
};

export const CSV_PRESETS = {
    "Full forensic export": Object.keys(CSV_COLUMNS),
    "Archetype summary":    ["id", "entry", "direction", "session", "archetype", "confidence", "severity", "severity_label", "r"],
    "Prevention candidates":["id", "direction", "session", "structure", "archetype", "r", "manual_tag", "manual_note"],
};

/**
 * buildCSV(trades, selectedFields) → CSV string
 * selectedFields defaults to "Full forensic export" preset.
 */
export function buildCSV(trades, selectedFields) {
    const fields = selectedFields || CSV_PRESETS["Full forensic export"];
    const cols   = fields.map(f => CSV_COLUMNS[f]).filter(Boolean);
    if (!cols.length || !Array.isArray(trades)) return "";

    const header = cols.map(c => `"${c.label}"`).join(",");
    const rows   = trades.map(t => cols.map(c => {
        const val = c.get(t);
        const str = String(val ?? "");
        // Quote if contains comma, quote, or newline
        return (str.includes(",") || str.includes('"') || str.includes("\n"))
            ? `"${str.replace(/"/g, '""')}"`
            : str;
    }).join(","));

    return [header, ...rows].join("\n");
}

/**
 * downloadCSV(filename, csvText) → void
 * Triggers a browser file download.
 */
export function downloadCSV(filename, csvText) {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
