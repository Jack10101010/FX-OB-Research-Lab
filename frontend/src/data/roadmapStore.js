// ── roadmapStore.js ──────────────────────────────────────────────────────────
// Per-section research roadmap, persisted in localStorage. Reusable across labs:
// each major section owns its own roadmap keyed by `sectionKey`, so future ideas
// stay attached to the exact feature they belong to (instead of one giant global
// roadmap). Pure data layer — no React.
//
// Persistence model: we store ONLY status overrides ({ [sectionKey]: { [itemId]:
// status } }) so that new seed items added in code automatically appear, and the
// user's status changes survive reloads. Degrades gracefully if localStorage is
// unavailable.

const STORAGE_KEY = "fxob_section_roadmaps_v1";

export const ROADMAP_STATUSES = [
    { key: "idea", label: "Current Ideas" },
    { key: "planned", label: "Planned" },
    { key: "in_progress", label: "In Progress" },
    { key: "complete", label: "Complete" },
];

// Click-to-advance order.
export const ROADMAP_NEXT_STATUS = {
    idea: "planned",
    planned: "in_progress",
    in_progress: "complete",
    complete: "idea",
};

// Seed defaults per section. Each item: { id, label, status, note? }.
export const ROADMAP_SEEDS = {
    "distance-to-stop": {
        title: "Distance to Stop Roadmap",
        items: [
            // ── High priority (shipped in the scorecard expectancy pass) ──
            { id: "overall-pos-r", label: "Overall +R", status: "complete" },
            { id: "overall-neg-r", label: "Overall −R", status: "complete" },
            { id: "net-r", label: "Net R", status: "complete" },
            { id: "profit-factor", label: "Profit Factor", status: "complete" },
            // ── Future research ──
            { id: "be-replay", label: "Break-even replay backtesting", status: "planned" },
            { id: "winner-cost", label: "Winner-cost modelling", status: "planned" },
            { id: "be-trigger", label: "Actual BE trigger modelling", status: "planned" },
            { id: "mfe-structure", label: "MFE by structure", status: "planned" },
            { id: "mfe-session", label: "MFE by session", status: "planned" },
            { id: "mfe-entry-model", label: "MFE by entry model", status: "planned" },
            { id: "struct-x-mfe", label: "Structure × MFE comparison", status: "planned" },
            { id: "session-x-mfe", label: "Session × MFE comparison", status: "planned" },
            // ── Data-integrity checks ──
            { id: "mfe-strategy-map-sanity", label: "Sanity-check MFE renders as expected on the Strategy Map", status: "idea" },
            // ── Funded-account survival (roadmap only — not implemented) ──
            { id: "max-loss-streak", label: "Setup: Max Loss Streak", status: "idea" },
            { id: "worst-dd-cluster", label: "Setup: Worst Consecutive Drawdown Cluster (R)", status: "idea" },
            { id: "avg-dd-cluster", label: "Setup: Average Drawdown Cluster (R)", status: "idea" },
            { id: "daily-dd-breach", label: "Daily drawdown breach rate", status: "idea" },
            { id: "challenge-breach", label: "Overall challenge breach rate", status: "idea" },
            { id: "ftmo-fail-prob", label: "FTMO-style failure probability", status: "idea" },
            { id: "dd-recovery", label: "Drawdown recovery characteristics", status: "idea" },
        ],
    },
};

function readOverrides() {
    try {
        const raw = (typeof localStorage !== "undefined") ? localStorage.getItem(STORAGE_KEY) : null;
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeOverrides(obj) {
    try {
        if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
        /* ignore quota / unavailable */
    }
}

const VALID = new Set(ROADMAP_STATUSES.map((s) => s.key));

// Merge seed defaults with persisted status overrides for one section.
export function getRoadmap(sectionKey) {
    const seed = ROADMAP_SEEDS[sectionKey] || { title: "Roadmap", items: [] };
    const overrides = readOverrides()[sectionKey] || {};
    const items = seed.items.map((it) => ({
        ...it,
        status: VALID.has(overrides[it.id]) ? overrides[it.id] : it.status,
    }));
    return { title: seed.title, sectionKey, items };
}

// Persist a single item's status override.
export function setRoadmapStatus(sectionKey, itemId, status) {
    if (!VALID.has(status)) return;
    const all = readOverrides();
    const section = { ...(all[sectionKey] || {}) };
    section[itemId] = status;
    all[sectionKey] = section;
    writeOverrides(all);
}
