const DB_NAME = "fxob_artifacts";
const DB_VERSION = 1;
const CANDLES_STORE = "candles";

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB is not available in this browser."));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CANDLES_STORE)) {
                db.createObjectStore(CANDLES_STORE, { keyPath: "runId" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
    });
}

function withStore(mode, callback) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(CANDLES_STORE, mode);
        const store = tx.objectStore(CANDLES_STORE);
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
    return withStore("readwrite", (store) => store.put(payload)).then(() => true);
}

export function loadCandles(runId) {
    if (!runId) return Promise.resolve(null);
    return withStore("readonly", (store) => {
        const request = store.get(runId);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error("Failed to load candles."));
        });
    });
}

export function deleteCandles(runId) {
    if (!runId) return Promise.resolve(false);
    return withStore("readwrite", (store) => store.delete(runId)).then(() => true);
}

export function hasCandles(runId) {
    if (!runId) return Promise.resolve(false);
    return loadCandles(runId).then((record) => !!record?.candles?.length);
}
