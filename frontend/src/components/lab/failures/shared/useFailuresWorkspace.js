// ── useFailuresWorkspace.js ──────────────────────────────────────────────────
// Shared state hook for the Failures Research Workspace.
// Manages: active tab (URL-based), cohort filter state (localStorage).
// Pattern mirrors useEntryWorkspace.js exactly.

import { useSearchParams } from "react-router-dom";
import { useState, useCallback } from "react";
import { sessionOf } from "../../entries/analytics/entryFormatters";

const LS_FAILURES_FILTERS = "fxob_failures_filters_v1";

// ── Tab definitions ───────────────────────────────────────────────────────────

export const FAILURES_TABS = [
    { key: "overview",    label: "Overview",          short: "Overview"  },
    { key: "archetypes",  label: "DNA & Archetypes",  short: "DNA"       },
    { key: "temporal",    label: "Temporal",          short: "Temporal"  },
    { key: "direction",   label: "Direction",         short: "Direction" },
    { key: "sessions",    label: "Sessions",          short: "Sessions"  },
    { key: "streaks",     label: "Streaks",           short: "Streaks"   },
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

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadFilters() {
    try {
        return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(LS_FAILURES_FILTERS) || "{}") };
    } catch {
        return DEFAULT_FILTERS;
    }
}

function saveFilters(f) {
    try { localStorage.setItem(LS_FAILURES_FILTERS, JSON.stringify(f)); } catch {}
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
    const activeTab = searchParams.get("tab") || FAILURES_TABS[0].key;

    const setActiveTab = useCallback((key) => {
        setSearchParams(prev => {
            const p = new URLSearchParams(prev);
            p.set("tab", key);
            return p;
        });
    }, [setSearchParams]);

    const [filters, setFiltersState] = useState(loadFilters);

    const setFilters = useCallback((patch) => {
        setFiltersState(prev => {
            const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
            saveFilters(next);
            return next;
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
