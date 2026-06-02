const DB_NAME = "fxob_artifacts";
// SP-2: bumped 1 → 2 to add the `runs` object store for full run-bundle
// persistence. The existing `candles` store is preserved unchanged so candle
// persistence keeps working across the upgrade.
const DB_VERSION = 2;
const CANDLES_STORE = "candles";
const RUNS_STORE = "runs";

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB is not available in this browser."));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            // Idempotent: only create stores that don't already exist so the
            // v1 → v2 upgrade keeps `candles` intact and just adds `runs`.
            if (!db.objectStoreNames.contains(CANDLES_STORE)) {
                db.createObjectStore(CANDLES_STORE, { keyPath: "runId" });
            }
            if (!db.objectStoreNames.contains(RUNS_STORE)) {
                db.createObjectStore(RUNS_STORE, { keyPath: "runId" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
    });
}

function withStore(storeName, mode, callback) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        tx.oncomplete = () => {
            db.close();
            resolve(result);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error || new Error("IndexedDB transaction failed."));
        };
        result = callback(store);
    }));
}

function candleTime(value) {
    if (!value) return null;
    return value.time ?? value.t ?? null;
}

// ── Candles store (unchanged behavior from v1) ──────────────────────────────

export function saveCandles(runId, candles, meta = {}) {
    if (!runId || !Array.isArray(candles)) return Promise.resolve(false);
    const first = candles[0];
    const last = candles[candles.length - 1];
    const payload = {
        runId,
        candles,
        candleCount: candles.length,
        candleTimeStart: meta.candleTimeStart ?? candleTime(first),
        candleTimeEnd: meta.candleTimeEnd ?? candleTime(last),
        savedAt: new Date().toISOString(),
        ...meta,
    };
    return withStore(CANDLES_STORE, "readwrite", (store) => store.put(payload)).then(() => true);
}

export function loadCandles(runId) {
    if (!runId) return Promise.resolve(null);
    return withStore(CANDLES_STORE, "readonly", (store) => {
        const request = store.get(runId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("Failed to load candles."));
        });
    });
}

export function deleteCandles(runId) {
    if (!runId) return Promise.resolve(false);
    return withStore(CANDLES_STORE, "readwrite", (store) => store.delete(runId)).then(() => true);
}

export function hasCandles(runId) {
    if (!runId) return Promise.resolve(false);
    return loadCandles(runId).then((record) => !!record?.candles?.length);
}

// SP-3 read-only diagnostics: enumerate persisted candle record keys. Does not
// load the (heavy) candle arrays — keys only.
export function listCandleRunIds() {
    return withStore(CANDLES_STORE, "readonly", (store) => {
        const request = store.getAllKeys();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error || new Error("Failed to list candle records."));
        });
    });
}

// ── Run bundle store (SP-2) ─────────────────────────────────────────────────
// Full run bundles (trades, variants, equity curves, order blocks, entry /
// protection results) are persisted here so a refresh on the same origin
// restores full data WITHOUT needing the sidecar. Candle arrays are NOT stored
// here — they continue to live in the `candles` store and are rehydrated
// separately — so callers should strip the heavy candle array before saving.

export function saveRunBundle(runId, bundle) {
    if (!runId || !bundle || typeof bundle !== "object") return Promise.resolve(false);
    const payload = {
        runId,
        bundle,
        savedAt: new Date().toISOString(),
    };
    return withStore(RUNS_STORE, "readwrite", (store) => store.put(payload)).then(() => true);
}

export function loadRunBundle(runId) {
    if (!runId) return Promise.resolve(null);
    return withStore(RUNS_STORE, "readonly", (store) => {
        const request = store.get(runId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("Failed to load run bundle."));
        });
    });
}

export function deleteRunBundle(runId) {
    if (!runId) return Promise.resolve(false);
    return withStore(RUNS_STORE, "readwrite", (store) => store.delete(runId)).then(() => true);
}

export function listRunBundleIds() {
    return withStore(RUNS_STORE, "readonly", (store) => {
        const request = store.getAllKeys();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => reject(request.error || new Error("Failed to list run bundles."));
        });
    });
}
