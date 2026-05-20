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
    selectedTradeVariant: null,
    hideMocks:  (() => { try { return localStorage.getItem(LS_HIDE_MOCKS) === "1"; } catch { return false; } })(),
    persistWarning: null,
};

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function computeEquityCurve(trades) {
    let cum = 0;
    return (trades || []).map((t, i) => {
        cum += Number(t.r) || 0;
        const ref = t.entry ? new Date(t.entry) : new Date(Date.now() - ((trades || []).length - i) * 86400000);
        return {
            i,
            date: isFinite(ref.getTime()) ? ref.toISOString().slice(0, 10) : "",
            label: isFinite(ref.getTime()) ? ref.toLocaleString("en", { month: "short", year: "2-digit" }) : "",
            netR: Number(cum.toFixed(2)),
        };
    });
}

function buildCandleIndex(candles) {
    const byExact = new Map();
    const byDay = new Map();
    (candles || []).forEach((c, i) => {
        if (!c.t) return;
        byExact.set(String(c.t), i);
        byDay.set(String(c.t).slice(0, 10), i);
    });
    return { byExact, byDay };
}

function timeToCandleIndex(time, idx) {
    if (!time || !idx) return -1;
    const s = String(time);
    if (idx.byExact.has(s)) return idx.byExact.get(s);
    const day = s.slice(0, 10);
    if (idx.byDay.has(day)) return idx.byDay.get(day);
    return -1;
}

function computeTradeMarkers(trades, candles) {
    const candleIdx = candles?.length ? buildCandleIndex(candles) : null;
    return (trades || []).map((t, idx) => {
        const i = candleIdx ? timeToCandleIndex(t.entry, candleIdx) : -1;
        return {
            i: i >= 0 ? i : idx * Math.max(1, Math.floor(220 / Math.max(1, (trades || []).length))),
            price: t.entryPrice,
            direction: t.direction,
            win: t.outcome === "Win",
            id: t.id,
        };
    });
}

function availableVariants(run) {
    return Object.keys(run?.tradesByVariant || {});
}

function selectedVariantFor(run) {
    const variants = availableVariants(run);
    if (!variants.length) return null;
    if (state.selectedTradeVariant && variants.includes(state.selectedTradeVariant)) return state.selectedTradeVariant;
    if (run.primaryVariant && variants.includes(run.primaryVariant)) return run.primaryVariant;
    return variants[0];
}

function variantDataFor(run) {
    const variant = selectedVariantFor(run);
    const trades = variant ? (run.tradesByVariant?.[variant] || []) : (run?.trades || []);
    const equityCurve = variant
        ? (run.equityCurveByVariant?.[variant] || computeEquityCurve(trades))
        : (run?.equityCurve || []);
    const tradeMarkers = variant
        ? (run.tradeMarkersByVariant?.[variant] || computeTradeMarkers(trades, run.candles))
        : (run?.tradeMarkers || []);
    return { variant, variants: availableVariants(run), trades, equityCurve, tradeMarkers };
}

function summaryForVariant(summary, trades, variant) {
    if (!summary || !variant) return summary;
    const wins = (trades || []).filter((t) => t.outcome === "Win").length;
    const losses = (trades || []).length - wins;
    const netR = (trades || []).reduce((s, t) => s + (Number(t.r) || 0), 0);
    return {
        ...summary,
        trades: (trades || []).length,
        wins,
        losses,
        winRate: Number(((trades || []).length ? (wins / (trades || []).length) * 100 : 0).toFixed(1)),
        netR: Number(netR.toFixed(1)),
        executionMode: variant,
        selectedTradeVariant: variant,
    };
}

// ─────────────────────────── Derived view ───────────────────────────

function buildDerived() {
    const active = state.activeRunId ? state.runs[state.activeRunId] : null;
    const activeVariantData = active ? variantDataFor(active) : null;
    const activeSummary = active
        ? summaryForVariant(active.summary, activeVariantData.trades, activeVariantData.variant)
        : null;

    // RUNS list: imported first (newest first), then mock (unless hidden)
    const importedList = Object.values(state.runs)
        .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))
        .map((r) => {
            const vd = r.id === active?.id ? activeVariantData : variantDataFor(r);
            const summary = r.id === active?.id ? summaryForVariant(r.summary, vd.trades, vd.variant) : r.summary;
            return { ...summary, _source: "imported" };
        });
    const mockList = state.hideMocks ? [] : defaults.RUNS.map((r) => ({ ...r, _source: "mock" }));

    return {
        ...state,
        // Active-run views (fall back to mock defaults when nothing imported)
        TRADES:        active ? activeVariantData.trades : defaults.TRADES,
        CANDLES:       active?.candles?.length       ? active.candles       : defaults.CANDLES,
        OB_BOXES:      active?.orderBlocks?.length   ? active.orderBlocks   : defaults.OB_BOXES,
        TRADE_MARKERS: active ? activeVariantData.tradeMarkers : defaults.TRADE_MARKERS,
        EQUITY_CURVE:  active ? activeVariantData.equityCurve : defaults.EQUITY_CURVE,
        ACTIVE_RUN:    activeSummary                 || defaults.ACTIVE_RUN,
        ACTIVE_TRADE_VARIANT: activeVariantData?.variant || null,
        AVAILABLE_TRADE_VARIANTS: activeVariantData?.variants || [],
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
    const nextRun = runId ? state.runs[runId] : null;
    const selectedTradeVariant = nextRun?.primaryVariant || null;
    state = { ...state, activeRunId: runId || null, selectedTradeVariant };
    try {
        if (runId) localStorage.setItem(LS_ACTIVE, runId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    notify();
}

export function setSelectedTradeVariant(variant) {
    const active = state.activeRunId ? state.runs[state.activeRunId] : null;
    const variants = availableVariants(active);
    const selectedTradeVariant = variants.includes(variant) ? variant : selectedVariantFor(active);
    state = { ...state, selectedTradeVariant };
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
        selectedTradeVariant: bundle.primaryVariant || null,
    };
    try {
        localStorage.setItem(LS_ACTIVE, bundle.id);
    } catch { /* noop */ }
    persistRuns();
    notify();
}

export function removeRunBundle(id) {
    if (!state.runs[id]) return;
    const next = { ...state.runs };
    delete next[id];
    const activeRunId = state.activeRunId === id ? null : state.activeRunId;
    const selectedTradeVariant = activeRunId ? selectedVariantFor(next[activeRunId]) : null;
    state = { ...state, runs: next, activeRunId, selectedTradeVariant };
    try {
        if (!activeRunId) localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistRuns();
    notify();
}

export function clearAllRuns() {
    state = { ...state, runs: {}, activeRunId: null, selectedTradeVariant: null, persistWarning: null };
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
                    const integrity = r.integrity ? {
                        ...r.integrity,
                        checks: {
                            ...r.integrity.checks,
                            candles: {
                                ...r.integrity.checks?.candles,
                                status: "WARNING",
                                imported: true,
                                count: r.candles.length,
                                droppedForStorage: true,
                            },
                        },
                        status: r.integrity.status === "FAIL" ? "FAIL" : "WARNING",
                    } : r.integrity;
                    runsToPersist[id] = {
                        ...r,
                        candles: null,
                        hasCandles: false,
                        candlesDroppedForStorage: true,
                        integrity,
                        summary: { ...r.summary, integrity },
                    };
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
