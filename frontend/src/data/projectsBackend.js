// ── projectsBackend.js ───────────────────────────────────────────────────────
// Thin client for the durable projects/insights store served by backend/server.py
// (GET/PUT /api/projects → a local projects.json on disk).
//
// This is the "properly saved, not just in browser storage" layer. The store
// (store.js) keeps localStorage as an instant, offline-safe cache and mirrors
// every change here in the background. If the backend is not running, every call
// fails fast and the app keeps working from localStorage alone.

const DEFAULT_PROJECTS_API =
    (typeof process !== "undefined" && process.env && process.env.REACT_APP_PROJECTS_API) ||
    "http://127.0.0.1:8000";

// Short timeout so a missing backend never blocks the UI.
const REQUEST_TIMEOUT_MS = 4000;

function canFetch() {
    return typeof fetch === "function";
}

async function withTimeout(promiseFactory, ms = REQUEST_TIMEOUT_MS) {
    if (typeof AbortController === "undefined") return promiseFactory(undefined);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await promiseFactory(ctrl.signal);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Fetch the durable projects map from the backend.
 * @returns {Promise<Object>} projects map keyed by id (`{}` when empty/unreachable-safe at call site)
 * @throws if the backend is unreachable or returns a non-OK status
 */
export async function fetchProjectsFromBackend(baseUrl = DEFAULT_PROJECTS_API) {
    if (!canFetch()) throw new Error("fetch unavailable");
    const res = await withTimeout((signal) =>
        fetch(`${baseUrl}/api/projects`, { method: "GET", signal }),
    );
    if (!res.ok) throw new Error(`projects GET ${res.status}`);
    const data = await res.json();
    const projects = data && typeof data.projects === "object" && data.projects ? data.projects : {};
    return projects;
}

/**
 * Replace the on-disk projects map with the supplied full map.
 * @param {Object} projects full projects map (same shape the store serializes)
 * @returns {Promise<{ok:boolean,count:number,updatedAt:string}>}
 * @throws if the backend is unreachable or returns a non-OK status
 */
export async function saveProjectsToBackend(projects, baseUrl = DEFAULT_PROJECTS_API) {
    if (!canFetch()) throw new Error("fetch unavailable");
    const res = await withTimeout((signal) =>
        fetch(`${baseUrl}/api/projects`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projects: projects || {} }),
            signal,
        }),
    );
    if (!res.ok) throw new Error(`projects PUT ${res.status}`);
    return res.json();
}

export const PROJECTS_API_BASE = DEFAULT_PROJECTS_API;
