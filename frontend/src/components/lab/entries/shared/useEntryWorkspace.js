// ── useEntryWorkspace.js ─────────────────────────────────────────────────────
// Shared state hook for the Entries Research Workspace.
// Manages: active tab, global filters, column visibility, selected model.
// Persists tab + filters to localStorage so state survives navigation.

import { useSearchParams } from "react-router-dom";
import { useState, useCallback } from "react";
import { sessionOf } from "../analytics/entryFormatters";

const LS_FILTERS = "fxob_entries_workspace_filters_v1";
const LS_COLS    = "fxob_entries_workspace_exact_columns_v1";
const LS_MODEL   = "fxob_entries_workspace_model_selection_v1";
const LS_TAB     = "fxob_entries_workspace_tab_state_v1";

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
        TABS,
    };
}
