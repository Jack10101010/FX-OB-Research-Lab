// Reactive dataset store.
// - Default state seeded from mock.js (preserves demo when no imports yet).
// - `runs` map holds imported FX-OB-Backtester bundles keyed by run id.
// - `activeRunId` selects which run drives the derived TRADES/CANDLES/OB_BOXES/EQUITY_CURVE.
// - Persisted to localStorage('fxob_runs') with a 4 MB safety budget; candles dropped first.

import { useEffect, useState } from "react";
import * as defaults from "./mock";

const LS_KEY = "fxob_runs";
const LS_ACTIVE = "fxob_active_run_id";
const LS_HIDE_MOCKS = "fxob_hide_mocks";
const PERSIST_BUDGET_BYTES = 4 * 1024 * 1024;

function loadPersistedRuns() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

let state = {
    ...defaults,
    runs: loadPersistedRuns(),
    activeRunId: (() => { try { return localStorage.getItem(LS_ACTIVE) || null; } catch { return null; } })(),
    hideMocks:  (() => { try { return localStorage.getItem(LS_HIDE_MOCKS) === "1"; } catch { return false; } })(),
    persistWarning: null,
};

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

// ─────────────────────────── Derived view ───────────────────────────

function buildDerived() {
    const active = state.activeRunId ? state.runs[state.activeRunId] : null;

    // RUNS list: imported first (newest first), then mock (unless hidden)
    const importedList = Object.values(state.runs)
        .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))
        .map((r) => ({ ...r.summary, _source: "imported" }));
    const mockList = state.hideMocks ? [] : defaults.RUNS.map((r) => ({ ...r, _source: "mock" }));

    return {
        ...state,
        // Active-run views (fall back to mock defaults when nothing imported)
        TRADES:        active?.trades?.length        ? active.trades        : defaults.TRADES,
        CANDLES:       active?.candles?.length       ? active.candles       : defaults.CANDLES,
        OB_BOXES:      active?.orderBlocks?.length   ? active.orderBlocks   : defaults.OB_BOXES,
        TRADE_MARKERS: active?.tradeMarkers?.length  ? active.tradeMarkers  : defaults.TRADE_MARKERS,
        EQUITY_CURVE:  active?.equityCurve?.length   ? active.equityCurve   : defaults.EQUITY_CURVE,
        ACTIVE_RUN:    active?.summary               || defaults.ACTIVE_RUN,
        RUNS: [...importedList, ...mockList],
        // Helpers exposed for per-run lookups
        getRunData,
        hasImportedRuns: importedList.length > 0,
        importedCount: importedList.length,
    };
}

// ─────────────────────────── Public API ───────────────────────────

export function getDataset() {
    return buildDerived();
}

export function getRunData(runId) {
    if (!runId) return null;
    return state.runs[runId] || null;
}

export function setActiveRunId(runId) {
    state = { ...state, activeRunId: runId || null };
    try {
        if (runId) localStorage.setItem(LS_ACTIVE, runId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    notify();
}

export function setHideMocks(hide) {
    state = { ...state, hideMocks: !!hide };
    try { localStorage.setItem(LS_HIDE_MOCKS, hide ? "1" : "0"); } catch { /* noop */ }
    notify();
}

export function addRunBundle(bundle) {
    if (!bundle?.id) return;
    state = {
        ...state,
        runs: { ...state.runs, [bundle.id]: bundle },
        activeRunId: bundle.id,  // auto-focus newly imported run
    };
    try { localStorage.setItem(LS_ACTIVE, bundle.id); } catch { /* noop */ }
    persistRuns();
    notify();
}

export function removeRunBundle(id) {
    if (!state.runs[id]) return;
    const next = { ...state.runs };
    delete next[id];
    const activeRunId = state.activeRunId === id ? null : state.activeRunId;
    state = { ...state, runs: next, activeRunId };
    try {
        if (!activeRunId) localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistRuns();
    notify();
}

export function clearAllRuns() {
    state = { ...state, runs: {}, activeRunId: null, persistWarning: null };
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    notify();
}

// Legacy helpers preserved (used by older code paths)
export function setDataset(patch) {
    state = { ...state, ...patch };
    notify();
}
export function resetDataset() {
    clearAllRuns();
}

export function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }

export function useDataset() {
    const [, force] = useState(0);
    useEffect(() => subscribe(() => force((n) => n + 1)), []);
    return buildDerived();
}

// ─────────────────────────── Persistence ───────────────────────────

function persistRuns() {
    let runsToPersist = { ...state.runs };
    let droppedCandlesFor = [];
    try {
        let str = JSON.stringify(runsToPersist);
        if (str.length > PERSIST_BUDGET_BYTES) {
            // First-pass mitigation: drop large candle arrays, keep everything else.
            for (const id of Object.keys(runsToPersist)) {
                const r = runsToPersist[id];
                if (r.candles?.length) {
                    droppedCandlesFor.push(id);
                    runsToPersist[id] = { ...r, candles: null, hasCandles: false, candlesDroppedForStorage: true };
                }
            }
            str = JSON.stringify(runsToPersist);
        }
        if (str.length > PERSIST_BUDGET_BYTES) {
            // Still too large — abandon persistence rather than corrupt storage.
            state = { ...state, persistWarning: `Run bundle exceeds ${(PERSIST_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB; not persisted to localStorage.` };
            return;
        }
        localStorage.setItem(LS_KEY, str);
        if (droppedCandlesFor.length) {
            state = {
                ...state,
                persistWarning: `Candles omitted from localStorage for: ${droppedCandlesFor.join(", ")} (size budget). Session retains candles in memory.`,
            };
        } else {
            state = { ...state, persistWarning: null };
        }
    } catch (e) {
        state = { ...state, persistWarning: `localStorage write failed: ${e.message || e}` };
    }
}
