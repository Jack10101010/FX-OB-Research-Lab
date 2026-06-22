// ── useEntryWorkspace.js ─────────────────────────────────────────────────────
// Shared state hook for the Entries Research Workspace.
// Manages: active tab, global filters, column visibility, selected model.
// Persists tab + filters to localStorage so state survives navigation.

import { useSearchParams } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
import { sessionOf } from "../analytics/entryFormatters";
import { canonicalEntryMode } from "../analytics/entryAnalytics";

const LS_FILTERS  = "fxob_entries_workspace_filters_v1";
const LS_COLS     = "fxob_entries_workspace_exact_columns_v1";
const LS_MODEL    = "fxob_entries_workspace_model_selection_v1";
const LS_TAB      = "fxob_entries_workspace_tab_state_v1";
const LS_VARIANTS = "fxob_entries_selected_variants_v1";

const DEFAULT_FILTERS = {
    sessions:   [],    // [] = all sessions
    directions: [],    // [] = all directions
};

const DEFAULT_COLS = {
    avgMAE:        false,
    avgMFE:        false,
    avgTimeToTP:   false,
    avgTimeToSL:   false,
    profitFactor:  true,
    triggeredEdge: false,
    fftImpact:     false,
};

export const TABS = [
    { key: "model-analysis",    label: "Model Analysis",    short: "Analysis" },
    { key: "experiment-compare", label: "Experiment Compare", short: "Compare"  },
    { key: "entry-hypotheses",  label: "Entry Hypotheses",  short: "Hypotheses" },
    { key: "robustness",        label: "Robustness Lab",    short: "Robustness" },
    { key: "promotion",         label: "Promotion Desk",    short: "Promotion"  },
];

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function useLocalStorageState(key, initialValue) {
    const [value, setValueState] = useState(() => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : initialValue;
        } catch {
            return initialValue;
        }
    });

    const setValue = useCallback((patch) => {
        setValueState(prev => {
            const next = typeof patch === "function" ? patch(prev) : patch;
            writeJson(key, next);
            return next;
        });
    }, [key]);

    return [value, setValue];
}

// PHASE 2 — pinned entry-variant keys (canonical). Persisted as a string[]. When no
// pinned set exists yet, seed from the single highlight key (LS_MODEL) so a Phase-1
// selection carries over. Non-destructive: LS_MODEL is left untouched.
function loadSelectedVariants() {
    try {
        const raw = localStorage.getItem(LS_VARIANTS);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
            const arr = parsed.filter((k) => typeof k === "string" && k);
            if (arr.length) return arr;
        }
    } catch {}
    try {
        const rawModel = localStorage.getItem(LS_MODEL);
        const model = rawModel ? JSON.parse(rawModel) : null;
        if (typeof model === "string" && model) return [model];
    } catch {}
    return [];
}

function loadFilters() {
    return readJson(LS_FILTERS, DEFAULT_FILTERS);
}
function loadCols() {
    return readJson(LS_COLS, DEFAULT_COLS);
}
function saveFilters(f) { writeJson(LS_FILTERS, f); }
function saveCols(c)    { writeJson(LS_COLS, c); }

export function useEntryWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams();
    const storedTab = (() => {
        try {
            const raw = localStorage.getItem(LS_TAB);
            const parsed = raw ? JSON.parse(raw) : null;
            return TABS.some(tab => tab.key === parsed) ? parsed : null;
        } catch {
            return null;
        }
    })();
    const activeTab = searchParams.get("tab") || storedTab || TABS[0].key;

    const setActiveTab = useCallback((key) => {
        setSearchParams(prev => { const p = new URLSearchParams(prev); p.set("tab", key); return p; });
        writeJson(LS_TAB, key);
    }, [setSearchParams]);

    const [filters, setFiltersState] = useState(loadFilters);
    const [colVis,  setColVisState]  = useState(loadCols);
    const [selectedModelKey, setSelectedModelKeyState] = useState(() => {
        try {
            const raw = localStorage.getItem(LS_MODEL);
            const parsed = raw ? JSON.parse(raw) : null;
            return typeof parsed === "string" ? parsed : null;
        } catch {
            return null;
        }
    });

    const setFilters = useCallback((patch) => {
        setFiltersState(prev => {
            const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
            saveFilters(next);
            return next;
        });
    }, []);

    const setColVis = useCallback((patch) => {
        setColVisState(prev => {
            const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
            saveCols(next);
            return next;
        });
    }, []);

    const setSelectedModelKey = useCallback((key) => {
        setSelectedModelKeyState(key || null);
        try {
            if (key) localStorage.setItem(LS_MODEL, JSON.stringify(key));
            else localStorage.removeItem(LS_MODEL);
        } catch {}
    }, []);

    // PHASE 2 — pinned variant keys (the comparison set shown in the table). `selectedModelKey`
    // stays the highlight/focus key; this array is the multi-select set.
    const [selectedVariantKeys, setSelectedVariantKeysState] = useState(loadSelectedVariants);

    const setSelectedVariantKeys = useCallback((patch) => {
        setSelectedVariantKeysState(prev => {
            const base = Array.isArray(prev) ? prev : [];
            const raw  = typeof patch === "function" ? patch(base) : patch;
            // canonical de-dupe, drop falsy — keep first occurrence (stable order)
            const seen = new Set();
            const next = (Array.isArray(raw) ? raw : []).filter((k) => {
                if (!k) return false;
                const c = canonicalEntryMode(k);
                if (seen.has(c)) return false;
                seen.add(c);
                return true;
            });
            try { localStorage.setItem(LS_VARIANTS, JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const addVariantKey = useCallback((key) => {
        if (!key) return;
        setSelectedVariantKeys(prev => {
            const c = canonicalEntryMode(key);
            return (prev || []).some(k => canonicalEntryMode(k) === c) ? prev : [...(prev || []), key];
        });
    }, [setSelectedVariantKeys]);

    const removeVariantKey = useCallback((key) => {
        if (!key) return;
        setSelectedVariantKeys(prev => {
            const c = canonicalEntryMode(key);
            return (prev || []).filter(k => canonicalEntryMode(k) !== c);
        });
    }, [setSelectedVariantKeys]);

    const clearVariantKeys = useCallback(() => setSelectedVariantKeys([]), [setSelectedVariantKeys]);

    const toggleSession = useCallback((session) => {
        setFilters(prev => {
            const has  = prev.sessions.includes(session);
            return { ...prev, sessions: has ? prev.sessions.filter(s => s !== session) : [...prev.sessions, session] };
        });
    }, [setFilters]);

    const toggleDirection = useCallback((dir) => {
        setFilters(prev => {
            const has = prev.directions.includes(dir);
            return { ...prev, directions: has ? prev.directions.filter(d => d !== dir) : [...prev.directions, dir] };
        });
    }, [setFilters]);

    const clearFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, [setFilters]);

    const hasActiveFilters = filters.sessions.length > 0 || filters.directions.length > 0;

    // Apply global filters to a trade list
    const applyFilters = useCallback((trades) => {
        let list = Array.isArray(trades) ? trades : [];
        if (filters.sessions.length) {
            list = list.filter(t => filters.sessions.includes(sessionOf(t.entry)));
        }
        if (filters.directions.length) {
            list = list.filter(t => {
                const d = (t.direction || t.bias || "").toLowerCase();
                return filters.directions.some(dir => d.includes(dir.toLowerCase()));
            });
        }
        return list;
    }, [filters]);

    return {
        activeTab, setActiveTab,
        filters, setFilters, toggleSession, toggleDirection, clearFilters, hasActiveFilters, applyFilters,
        colVis, setColVis,
        selectedModelKey, setSelectedModelKey,
        selectedVariantKeys, addVariantKey, removeVariantKey, clearVariantKeys,
        TABS,
    };
}

// ── useModelSelectionGuard ───────────────────────────────────────────────────
// Keeps `selectedModelKey` valid for the active run. `selectedModelKey` is
// persisted in localStorage and shared across runs, so a key chosen in a
// previous run (e.g. a delay scenario like `..._d2`) can be stale for the
// current run — leaving FFT auto-control / paired analytics resolving to an
// absent scenario. This guard reconciles the persisted selection against the
// run's actual model keys (`exactRows[].mode`).
//
// Rules:
//   • selection is valid for this run            → keep it.
//   • selection is a stale, non-empty key        → reset (prefer a control-backed
//                                                   scenario, else first available).
//   • selection is null on run change / init     → auto-pick (same preference),
//                                                   so a model + paired analytics
//                                                   show by default.
//   • selection is null within the same run       → leave null (intentional
//                                                   in-session deselect is preserved).
//
// @param {object}   p
// @param {string}   p.runId               active run id (detects run change / init)
// @param {string[]} p.availableModelKeys   non-baseline `exactRows[].mode` values
// @param {string[]} p.controlBackedKeys    scenario keys that have an FFT-OFF control
// @param {string}   p.selectedModelKey
// @param {Function} p.setSelectedModelKey
export function useModelSelectionGuard({
    runId,
    availableModelKeys,
    controlBackedKeys,
    selectedModelKey,
    setSelectedModelKey,
    discoveredModelKeys = [],
}) {
    const lastRunRef = useRef(null);
    useEffect(() => {
        const available = (Array.isArray(availableModelKeys) ? availableModelKeys : []).filter(Boolean);
        if (available.length === 0) return; // run not loaded yet — don't touch the selection

        const runChanged = lastRunRef.current !== runId;
        // A variant chosen from the metadata selector may not have RESIDENT rows yet, so
        // it is valid if present in the discovered universe even when not in `available`.
        const discovered = Array.isArray(discoveredModelKeys) ? discoveredModelKeys : [];

        // Valid selection for this run — keep it.
        if (selectedModelKey && (available.includes(selectedModelKey) || discovered.includes(selectedModelKey))) {
            lastRunRef.current = runId;
            return;
        }

        // Reset only for a stale non-empty key, or on run-change/init with no valid
        // selection. An in-session deselect (null within the same run) is left alone.
        if (selectedModelKey || runChanged) {
            const controlBacked = Array.isArray(controlBackedKeys) ? controlBackedKeys : [];
            const preferred = controlBacked.find((k) => available.includes(k));
            const next = preferred || available[0] || null;
            if (next && next !== selectedModelKey) setSelectedModelKey(next);
        }
        lastRunRef.current = runId;
    }, [runId, availableModelKeys, controlBackedKeys, selectedModelKey, setSelectedModelKey, discoveredModelKeys]);
}
