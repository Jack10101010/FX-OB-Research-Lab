// ── useFailuresWorkspace.js ──────────────────────────────────────────────────
// Shared state hook for the Failures Research Workspace.
// Manages: active tab (URL-based), cohort filter state (localStorage).
// Pattern mirrors useEntryWorkspace.js exactly.

import { useSearchParams } from "react-router-dom";
import { useState, useCallback } from "react";
import { sessionOf } from "../../entries/analytics/entryFormatters";

const LS_FAILURES_FILTERS = "fxob_failures_workspace_filters_v1";
const LS_FAILURES_UI = "fxob_failures_workspace_ui_v1";
const LEGACY_FAILURES_FILTERS = "fxob_failures_filters_v1";

// ── Tab definitions ───────────────────────────────────────────────────────────

export const FAILURES_TABS = [
    { key: "overview",    label: "Overview",          short: "Overview"  },
    { key: "archetypes",  label: "DNA & Archetypes",  short: "DNA"       },
    { key: "temporal",    label: "Temporal",          short: "Temporal"  },
    { key: "direction",   label: "Direction",         short: "Direction" },
    { key: "sessions",    label: "Sessions",          short: "Sessions"  },
    { key: "streaks",     label: "Streaks",           short: "Streaks"   },
    { key: "excursion",   label: "Distance to Stop",  short: "Distance"  },
    { key: "discovery",   label: "Filter Discovery",  short: "Filters"   },
    { key: "prevention",  label: "Prevention",        short: "Prevent"   },
    { key: "drilldown",   label: "Drilldown",         short: "Drill"     },
    { key: "workspace",   label: "Views & Export",    short: "Export"    },
];

// ── Default filter state ──────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
    sessions:    [],   // [] = all sessions
    directions:  [],   // [] = all directions
    archetypes:  [],   // [] = all archetypes
    severityMin: null, // null = no min
};

const DEFAULT_UI = {
    activeTab: FAILURES_TABS[0].key,
    filtersExpanded: false,
};

// ── Persistence helpers ───────────────────────────────────────────────────────

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function sanitizeFilters(value) {
    const source = value && typeof value === "object" ? value : {};
    const severity = Number(source.severityMin);
    return {
        sessions: Array.isArray(source.sessions) ? source.sessions.filter((item) => typeof item === "string") : [],
        directions: Array.isArray(source.directions) ? source.directions.filter((item) => typeof item === "string") : [],
        archetypes: Array.isArray(source.archetypes) ? source.archetypes.filter((item) => typeof item === "string") : [],
        severityMin: Number.isFinite(severity) ? severity : null,
    };
}

function sanitizeUi(value) {
    const source = value && typeof value === "object" ? value : {};
    const activeTab = FAILURES_TABS.some((tab) => tab.key === source.activeTab) ? source.activeTab : DEFAULT_UI.activeTab;
    return {
        activeTab,
        filtersExpanded: typeof source.filtersExpanded === "boolean" ? source.filtersExpanded : DEFAULT_UI.filtersExpanded,
    };
}

function loadFilters() {
    const stored = readJson(LS_FAILURES_FILTERS, null) ?? readJson(LEGACY_FAILURES_FILTERS, null);
    return sanitizeFilters({ ...DEFAULT_FILTERS, ...(stored || {}) });
}

function saveFilters(f) {
    writeJson(LS_FAILURES_FILTERS, sanitizeFilters(f));
}

function loadUi() {
    return sanitizeUi(readJson(LS_FAILURES_UI, DEFAULT_UI));
}

function saveUi(value) {
    writeJson(LS_FAILURES_UI, sanitizeUi(value));
}

// ── applyFilter (pure) ────────────────────────────────────────────────────────

/**
 * applyFilter(trades, filters) → filtered trade array
 * Applied after classify+score pipeline. trades already have .archetype, .severity.
 */
export function applyFilter(trades, filters) {
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
    if (filters.archetypes.length) {
        list = list.filter(t => filters.archetypes.includes(t.archetype));
    }
    if (filters.severityMin != null) {
        list = list.filter(t => (t.severity ?? 0) >= filters.severityMin);
    }

    return list;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFailuresWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [ui, setUiState] = useState(loadUi);
    const requestedTab = searchParams.get("tab");
    const activeTab = FAILURES_TABS.some((tab) => tab.key === requestedTab)
        ? requestedTab
        : ui.activeTab;

    const setActiveTab = useCallback((key) => {
        if (!FAILURES_TABS.some((tab) => tab.key === key)) return;
        setSearchParams(prev => {
            const p = new URLSearchParams(prev);
            p.set("tab", key);
            return p;
        });
        setUiState((prev) => {
            const next = { ...prev, activeTab: key };
            saveUi(next);
            return next;
        });
    }, [setSearchParams]);

    const [filters, setFiltersState] = useState(loadFilters);

    const setFiltersExpanded = useCallback((expanded) => {
        setUiState((prev) => {
            const next = { ...prev, filtersExpanded: typeof expanded === "function" ? expanded(prev.filtersExpanded) : Boolean(expanded) };
            saveUi(next);
            return next;
        });
    }, []);

    const setFilters = useCallback((patch) => {
        setFiltersState(prev => {
            const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
            const clean = sanitizeFilters(next);
            saveFilters(clean);
            return clean;
        });
    }, []);

    const toggleSession = useCallback((session) => {
        setFilters(prev => {
            const has = prev.sessions.includes(session);
            return { ...prev, sessions: has ? prev.sessions.filter(s => s !== session) : [...prev.sessions, session] };
        });
    }, [setFilters]);

    const toggleDirection = useCallback((dir) => {
        setFilters(prev => {
            const has = prev.directions.includes(dir);
            return { ...prev, directions: has ? prev.directions.filter(d => d !== dir) : [...prev.directions, dir] };
        });
    }, [setFilters]);

    const toggleArchetype = useCallback((archetype) => {
        setFilters(prev => {
            const has = prev.archetypes.includes(archetype);
            return { ...prev, archetypes: has ? prev.archetypes.filter(a => a !== archetype) : [...prev.archetypes, archetype] };
        });
    }, [setFilters]);

    const setSeverityMin = useCallback((val) => {
        setFilters(prev => ({ ...prev, severityMin: val }));
    }, [setFilters]);

    const clearFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, [setFilters]);

    const hasActiveFilters = (
        filters.sessions.length > 0 ||
        filters.directions.length > 0 ||
        filters.archetypes.length > 0 ||
        filters.severityMin != null
    );

    return {
        // Tab state
        activeTab,
        setActiveTab,

        // Filter state + actions
        filters,
        setFilters,
        filtersExpanded: ui.filtersExpanded,
        setFiltersExpanded,
        toggleSession,
        toggleDirection,
        toggleArchetype,
        setSeverityMin,
        clearFilters,
        hasActiveFilters,

        // Tab definitions (for WorkspaceTabBar)
        FAILURES_TABS,
    };
}
