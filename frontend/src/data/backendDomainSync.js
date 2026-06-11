// ── backendDomainSync.js ─────────────────────────────────────────────────────
// Reusable client + wiring for the generic per-domain durable store
// (backend/server.py → GET/PUT /api/storage/{domain} → backend/data/{domain}.json).
//
// STORAGE MODEL (Phase 1):
//   • localStorage  = instant cache + offline fallback (authoritative when the
//                     backend is down). Existing write paths are unchanged.
//   • backend JSON  = durable local mirror / system-of-record candidate.
//   • A future SQLite migration will sit behind this SAME API, so callers don't
//     change when the storage engine does.
//
// GUARANTEES:
//   • No network at import time.
//   • Backend unreachable/slow → fails fast (timeout) and is swallowed; the app
//     keeps working from localStorage.
//   • An empty/absent backend NEVER wipes localStorage (see makeDomainBackend).

import { PROJECTS_API_BASE } from "./projectsBackend";

const API_BASE = PROJECTS_API_BASE; // single source for the Research Store origin
const REQUEST_TIMEOUT_MS = 4000;
const SYNC_DEBOUNCE_MS = 800;

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
 * Load a domain payload from the backend.
 * @returns {Promise<any|null>} the stored payload, or null when absent/empty.
 * @throws when the backend is unreachable or returns a non-OK status.
 */
export async function loadDomain(domain) {
    if (!canFetch()) throw new Error("fetch unavailable");
    const res = await withTimeout((signal) =>
        fetch(`${API_BASE}/api/storage/${encodeURIComponent(domain)}`, { method: "GET", signal }),
    );
    if (!res.ok) throw new Error(`storage GET ${domain} ${res.status}`);
    const data = await res.json();
    return data && "payload" in data ? data.payload : null;
}

/**
 * Replace a domain payload on the backend.
 * @throws when the backend is unreachable or returns a non-OK status.
 */
export async function saveDomain(domain, payload) {
    if (!canFetch()) throw new Error("fetch unavailable");
    const res = await withTimeout((signal) =>
        fetch(`${API_BASE}/api/storage/${encodeURIComponent(domain)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: payload ?? null }),
            signal,
        }),
    );
    if (!res.ok) throw new Error(`storage PUT ${domain} ${res.status}`);
    return res.json();
}

// ── Per-domain pub/sub (same-tab refresh after async hydration) ───────────────
// localStorage.setItem does NOT fire a 'storage' event in the same tab, so we
// notify subscribers explicitly after a hydrate merges new data into the cache.
const domainListeners = new Map(); // domain -> Set<cb>

export function subscribeDomain(domain, cb) {
    if (!domainListeners.has(domain)) domainListeners.set(domain, new Set());
    domainListeners.get(domain).add(cb);
    return () => {
        const set = domainListeners.get(domain);
        if (set) set.delete(cb);
    };
}

export function notifyDomain(domain) {
    const set = domainListeners.get(domain);
    if (set) set.forEach((cb) => { try { cb(); } catch { /* listener error is non-fatal */ } });
}

function stableDiffer(a, b) {
    try { return JSON.stringify(a) !== JSON.stringify(b); } catch { return true; }
}

/**
 * Build the durable-mirror wiring for one domain. The owner module supplies its
 * localStorage IO + a pure merge + an emptiness test; this factory handles
 * hydrate-on-boot, debounced mirror-on-write, and subscriber notification.
 *
 * @param {object}   o
 * @param {string}   o.domain      backend domain key (must be allowlisted server-side)
 * @param {Function} o.loadLocal   () => payload    read current localStorage value
 * @param {Function} o.saveLocal   (payload) => any write merged value to localStorage
 * @param {Function} o.merge       (local, remote) => merged   pure, non-destructive
 * @param {Function} [o.isEmpty]   (payload) => boolean  treat as "no data"
 * @returns {{ hydrate:Function, scheduleSync:Function, subscribe:Function, kickoff:Function }}
 */
export function makeDomainBackend({ domain, loadLocal, saveLocal, merge, isEmpty }) {
    let hydrated = false;
    let timer = null;

    const empty = typeof isEmpty === "function"
        ? isEmpty
        : (p) => p == null
            || (Array.isArray(p) && p.length === 0)
            || (typeof p === "object" && Object.keys(p).length === 0);

    async function hydrate() {
        if (hydrated) return;
        hydrated = true;
        let remote;
        try {
            remote = await loadDomain(domain);
        } catch {
            return; // backend optional / down — localStorage stays authoritative
        }
        const local = loadLocal();
        // Empty/absent backend must NEVER wipe local. Instead, seed the backend
        // from local if we have anything worth persisting.
        if (empty(remote)) {
            if (!empty(local)) saveDomain(domain, local).catch(() => {});
            return;
        }
        // Both sides may have data → merge non-destructively.
        const merged = empty(local) ? remote : merge(local, remote);
        if (stableDiffer(local, merged)) {
            saveLocal(merged);
            notifyDomain(domain);
        }
        // Converge the backend too if the merge added anything it lacked.
        if (stableDiffer(remote, merged)) {
            saveDomain(domain, merged).catch(() => {});
        }
    }

    function scheduleSync() {
        if (typeof window === "undefined") return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            // Re-read the freshly-written localStorage value as the source of truth.
            saveDomain(domain, loadLocal()).catch(() => {});
        }, SYNC_DEBOUNCE_MS);
    }

    function subscribe(cb) {
        return subscribeDomain(domain, cb);
    }

    function kickoff() {
        if (typeof window === "undefined") return;
        Promise.resolve().then(() => hydrate().catch(() => {}));
    }

    return { hydrate, scheduleSync, subscribe, kickoff };
}
