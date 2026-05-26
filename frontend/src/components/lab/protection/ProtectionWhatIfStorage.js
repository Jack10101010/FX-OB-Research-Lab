// ── ProtectionWhatIfStorage.js ────────────────────────────────────────────────
// localStorage persistence helpers for the Protection Lab What-If simulator
// and Hypothesis Workbench. All keys are scoped by runId so data does not
// bleed across backtests.

const PREFIX_WHATIF = "protlab_whatif_";
const PREFIX_HYPO   = "protlab_hypotheses_";
const MAX_ENTRIES   = 100; // safety cap per run

function _key(prefix, runId) {
    return prefix + (runId ?? "default");
}

function _safeRead(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function _safeWrite(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

// ── What-If Simulations ───────────────────────────────────────────────────────
// Each simulation entry:
// {
//   id: string (UUID-ish, Date.now + random),
//   savedAt: ISO string,
//   filters: { ... },   // copy of activeFilters at save time
//   result: { ... },    // copy of whatIfResult at save time
//   notes: string,
//   label: string,      // user-editable short name
//   pinned: boolean,
// }

export function loadWhatIfSimulations(runId) {
    const data = _safeRead(_key(PREFIX_WHATIF, runId));
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_ENTRIES);
}

export function saveWhatIfSimulations(runId, simulations) {
    const trimmed = Array.isArray(simulations)
        ? simulations.slice(0, MAX_ENTRIES)
        : [];
    _safeWrite(_key(PREFIX_WHATIF, runId), trimmed);
}

export function addWhatIfSimulation(runId, filters, result, notes = "", label = "") {
    const existing = loadWhatIfSimulations(runId);
    const entry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        savedAt: new Date().toISOString(),
        filters: { ...filters },
        result: { ...result },
        notes: notes ?? "",
        label: label || `Sim #${existing.length + 1}`,
        pinned: false,
    };
    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    saveWhatIfSimulations(runId, updated);
    return entry;
}

export function updateWhatIfSimulation(runId, id, patch) {
    const existing = loadWhatIfSimulations(runId);
    const updated = existing.map(s => s.id === id ? { ...s, ...patch } : s);
    saveWhatIfSimulations(runId, updated);
}

export function deleteWhatIfSimulation(runId, id) {
    const existing = loadWhatIfSimulations(runId);
    saveWhatIfSimulations(runId, existing.filter(s => s.id !== id));
}

export function clearWhatIfSimulations(runId) {
    try { localStorage.removeItem(_key(PREFIX_WHATIF, runId)); } catch { /* noop */ }
}

// ── Hypothesis Workbench ──────────────────────────────────────────────────────
// Each hypothesis entry:
// {
//   id: string,
//   createdAt: ISO string,
//   updatedAt: ISO string,
//   title: string,
//   description: string,
//   status: "open" | "confirmed" | "refuted" | "deferred",
//   linkedSimId: string | null,   // id from what-if sims
//   tags: string[],
//   notes: string,
// }

const VALID_STATUSES = new Set(["open", "confirmed", "refuted", "deferred"]);

export function loadHypotheses(runId) {
    const data = _safeRead(_key(PREFIX_HYPO, runId));
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_ENTRIES);
}

export function saveHypotheses(runId, hypotheses) {
    const trimmed = Array.isArray(hypotheses)
        ? hypotheses.slice(0, MAX_ENTRIES)
        : [];
    _safeWrite(_key(PREFIX_HYPO, runId), trimmed);
}

export function addHypothesis(runId, { title, description = "", status = "open", linkedSimId = null, tags = [], notes = "" } = {}) {
    const existing = loadHypotheses(runId);
    const now = new Date().toISOString();
    const entry = {
        id: `hypo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
        updatedAt: now,
        title: title || "Untitled hypothesis",
        description,
        status: VALID_STATUSES.has(status) ? status : "open",
        linkedSimId: linkedSimId ?? null,
        tags: Array.isArray(tags) ? tags : [],
        notes: notes ?? "",
    };
    const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
    saveHypotheses(runId, updated);
    return entry;
}

export function updateHypothesis(runId, id, patch) {
    const existing = loadHypotheses(runId);
    const updated = existing.map(h =>
        h.id === id
            ? { ...h, ...patch, updatedAt: new Date().toISOString() }
            : h
    );
    saveHypotheses(runId, updated);
}

export function deleteHypothesis(runId, id) {
    const existing = loadHypotheses(runId);
    saveHypotheses(runId, existing.filter(h => h.id !== id));
}

export function clearHypotheses(runId) {
    try { localStorage.removeItem(_key(PREFIX_HYPO, runId)); } catch { /* noop */ }
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function exportSimulationsAsCSV(simulations) {
    if (!simulations.length) return "";
    const headers = ["Label", "Saved At", "Net R", "Trades", "Win Rate", "Notes"];
    const rows = simulations.map(s => [
        `"${(s.label ?? "").replace(/"/g, '""')}"`,
        `"${s.savedAt ?? ""}"`,
        s.result?.netR ?? "",
        s.result?.tradeCount ?? "",
        s.result?.winRate != null ? `${(s.result.winRate * 100).toFixed(1)}%` : "",
        `"${(s.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function exportHypothesesAsCSV(hypotheses) {
    if (!hypotheses.length) return "";
    const headers = ["Title", "Status", "Created At", "Tags", "Notes"];
    const rows = hypotheses.map(h => [
        `"${(h.title ?? "").replace(/"/g, '""')}"`,
        h.status ?? "",
        h.createdAt ?? "",
        `"${(h.tags ?? []).join("; ")}"`,
        `"${(h.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function triggerCSVDownload(csv, filename) {
    try {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { /* noop */ }
}
