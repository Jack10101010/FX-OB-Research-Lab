// Reactive dataset store.
// - Default module is still imported for legacy constants, but run views no longer fall back to demo data.
// - `runs` map holds imported FX-OB-Backtester bundles keyed by run id.
// - `activeRunId` selects which run drives the derived TRADES/CANDLES/OB_BOXES/EQUITY_CURVE.
// - Persisted to localStorage('fxob_runs') with a 4 MB safety budget; large candles live in IndexedDB.

import { useEffect, useState } from "react";
import * as defaults from "./mock";
import { saveCandles, loadCandles, deleteCandles } from "./artifactStore";
import { buildTradesByObId, deriveOBLifecycle } from "./obLifecycle";

const LS_KEY = "fxob_runs";
const LS_PROJECTS = "fxob_projects";
const LS_ACTIVE = "fxob_active_run_id";
const LS_ACTIVE_PROJECT = "fxob_active_project_id";
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

function loadPersistedProjects() {
    try {
        const raw = localStorage.getItem(LS_PROJECTS);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

let state = {
    ...defaults,
    runs: loadPersistedRuns(),
    projects: loadPersistedProjects(),
    activeRunId: (() => { try { return localStorage.getItem(LS_ACTIVE) || null; } catch { return null; } })(),
    activeProjectId: (() => { try { return localStorage.getItem(LS_ACTIVE_PROJECT) || null; } catch { return null; } })(),
    selectedTradeVariant: null,
    persistWarning: null,
    candlePersistenceNotice: null,
};

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function normalizeTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number" && isFinite(value)) {
        return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function candleMeta(candles) {
    if (!candles?.length) return {};
    const first = candles[0];
    const last = candles[candles.length - 1];
    return {
        hasCandles: true,
        candlesStorage: "indexeddb",
        candlesDroppedFromPersistence: true,
        candlesDroppedForStorage: true,
        candleCount: candles.length,
        candleTimeStart: first?.time ?? first?.t ?? null,
        candleTimeEnd: last?.time ?? last?.t ?? null,
    };
}

function withCandleMeta(bundle, candles) {
    const meta = candleMeta(candles);
    if (!meta.hasCandles) return bundle;
    const integrity = bundle.integrity ? {
        ...bundle.integrity,
        checks: {
            ...bundle.integrity.checks,
            candles: {
                ...bundle.integrity.checks?.candles,
                imported: true,
                count: meta.candleCount,
                storage: "indexeddb",
                droppedFromPersistence: true,
                droppedForStorage: true,
            },
        },
    } : bundle.integrity;
    return {
        ...bundle,
        ...meta,
        integrity,
        summary: {
            ...bundle.summary,
            ...meta,
            integrity,
        },
    };
}

function persistableRun(bundle) {
    if (!bundle?.candles?.length) return bundle;
    const next = withCandleMeta(bundle, bundle.candles);
    return {
        ...next,
        candles: null,
        summary: {
            ...next.summary,
            candles: null,
        },
    };
}

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
    const byTime = new Map();
    const ordered = [];
    (candles || []).forEach((c, i) => {
        const time = c.time ?? normalizeTimestamp(c.t);
        if (time == null) return;
        byTime.set(time, i);
        ordered.push({ time, i });
    });
    ordered.sort((a, b) => a.time - b.time);
    const gaps = [];
    for (let i = 1; i < ordered.length; i++) {
        const gap = ordered[i].time - ordered[i - 1].time;
        if (gap > 0) gaps.push(gap);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3600;
    return { byTime, ordered, toleranceSec: Math.max(60, Math.floor(medianGap * 1.5)) };
}

function timeToCandleIndex(time, idx) {
    const target = normalizeTimestamp(time);
    if (target == null || !idx) return { i: -1, quality: "missing", time: null };
    if (idx.byTime.has(target)) {
        const i = idx.byTime.get(target);
        return { i, quality: "exact", time: idx.ordered.find((c) => c.i === i)?.time ?? target };
    }
    let lo = 0;
    let hi = idx.ordered.length - 1;
    let best = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (idx.ordered[mid].time <= target) {
            best = idx.ordered[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (best && target - best.time <= idx.toleranceSec) {
        return { i: best.i, quality: "nearest_prior", time: best.time };
    }
    return { i: -1, quality: "missing", time: null };
}

function computeTradeMarkers(trades, candles) {
    const candleIdx = candles?.length ? buildCandleIndex(candles) : null;
    return (trades || []).map((t, idx) => {
        const mapped = candleIdx ? timeToCandleIndex(t.entry, candleIdx) : { i: -1, quality: "missing", time: null };
        return {
            i: mapped.i >= 0 ? mapped.i : idx * Math.max(1, Math.floor(220 / Math.max(1, (trades || []).length))),
            time: mapped.time,
            mappingQuality: mapped.quality,
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

function runHasPopulatedData(run) {
    if (!run) return false;
    if (Array.isArray(run.candles) && run.candles.length > 0) return true;
    if (run.hasCandles || run.candlesStorage === "indexeddb" || run.candlesStorage === "session") return true;
    if (Array.isArray(run.trades) && run.trades.length > 0) return true;
    if (Array.isArray(run.orderBlocks) && run.orderBlocks.length > 0) return true;
    if (Object.values(run.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length > 0)) return true;
    return false;
}

function runSortTimestamp(run) {
    return run?.importedAt || run?.createdAt || run?.summary?.importedAt || run?.summary?.createdAt || "";
}

function chooseFallbackRunId() {
    return Object.values(state.runs)
        .filter(runHasPopulatedData)
        .sort((a, b) => String(runSortTimestamp(b)).localeCompare(String(runSortTimestamp(a))))
        [0]?.id || null;
}

function sanitizeRunIdPart(value) {
    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48);
}

function runIdentitySuffix(bundle, importedAt) {
    return sanitizeRunIdPart(
        bundle?.sidecarJobId
        || bundle?.outputFolder
        || bundle?.sourceOutputFolder
        || bundle?.summary?.outputFolder
        || bundle?.summary?.sourceOutputFolder
        || [
            bundle?.config?.symbol,
            bundle?.config?.detection_timeframe,
            bundle?.config?.rr_multiple != null ? `rr${bundle.config.rr_multiple}` : "",
            bundle?.config?.start_date,
            bundle?.config?.end_date,
            importedAt,
        ].filter(Boolean).join("_"),
    );
}

function uniqueRunIdFor(bundle, importedAt = new Date().toISOString()) {
    const base = sanitizeRunIdPart(bundle?.id) || `imported_${Date.now()}`;
    if (!state.runs[base]) return base;
    const suffixBase = runIdentitySuffix(bundle, importedAt)
        || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    let candidate = `${base}__${suffixBase}`;
    let index = 2;
    while (state.runs[candidate]) {
        candidate = `${base}__${suffixBase}_${index}`;
        index += 1;
    }
    return candidate;
}

function normalizeIncomingRunBundle(bundle) {
    const importedAt = bundle.importedAt || new Date().toISOString();
    const originalRunId = String(
        bundle.originalRunId
        || bundle.summary?.originalRunId
        || bundle.id
        || bundle.summary?.id
        || `imported_${Date.now()}`,
    );
    const sourceOutputFolder = bundle.sourceOutputFolder || bundle.outputFolder || bundle.summary?.sourceOutputFolder || bundle.summary?.outputFolder || "";
    const id = uniqueRunIdFor({ ...bundle, id: originalRunId, sourceOutputFolder }, importedAt);

    // App run IDs are unique persistence keys. Backend/source IDs are metadata only:
    // future imports must pass through addRunBundle() so config variants cannot
    // overwrite each other or share IndexedDB candle records by accident.
    return {
        ...bundle,
        id,
        originalRunId,
        sourceOutputFolder,
        outputFolder: bundle.outputFolder || sourceOutputFolder,
        importedAt,
        summary: {
            ...bundle.summary,
            id,
            originalRunId,
            sourceOutputFolder,
            outputFolder: bundle.summary?.outputFolder || bundle.outputFolder || sourceOutputFolder,
            importedAt,
        },
    };
}

function ensureActiveRunId() {
    const current = state.activeRunId ? state.runs[state.activeRunId] : null;
    if (runHasPopulatedData(current)) return state.activeRunId;
    const activeRunId = chooseFallbackRunId();
    if (activeRunId !== state.activeRunId) {
        state = {
            ...state,
            activeRunId,
            selectedTradeVariant: activeRunId ? selectedVariantFor(state.runs[activeRunId]) : null,
        };
        try {
            if (activeRunId) localStorage.setItem(LS_ACTIVE, activeRunId);
            else localStorage.removeItem(LS_ACTIVE);
        } catch { /* noop */ }
    }
    return activeRunId;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─────────────────── Real-data analytics helpers ───────────────────
// These replace mock fallbacks in buildDerived(). They return empty arrays
// when called with no trades — callers render honest empty states.

function computeMonthly(trades) {
    if (!trades?.length) return [];
    const map = {};
    trades.forEach((t) => {
        const date = t.entry ? new Date(t.entry) : null;
        if (!date || !isFinite(date.getTime())) return;
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const key = `${year}-${String(month + 1).padStart(2, "0")}`;
        const m = `${MONTHS[month]} '${String(year).slice(-2)}`;
        if (!map[key]) map[key] = { key, m, v: 0 };
        map[key].v += Number(t.r) || 0;
    });
    return Object.values(map)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((entry) => ({ m: entry.m, v: Number(entry.v.toFixed(2)) }));
}

function computeRDist(trades) {
    if (!trades?.length) return [];
    const bins = {};
    trades.forEach((t) => {
        const r = Number(t.r);
        if (!isFinite(r)) return;
        const bin = Math.round(r * 2) / 2; // 0.5R buckets
        const label = `${bin >= 0 ? "+" : ""}${bin.toFixed(1)}R`;
        if (!bins[label]) bins[label] = { bucket: label, count: 0, _r: bin };
        bins[label].count += 1;
    });
    return Object.values(bins)
        .sort((a, b) => a._r - b._r)
        .map(({ bucket, count }) => ({ bucket, count }));
}

// Safe sentinel used when no run is active — all numeric fields default to 0.
const EMPTY_RUN = {
    id: null,
    netR: 0, winRate: 0, trades: 0, wins: 0, losses: 0,
    rr: 0, symbol: "—", detectionTf: "—", executionTf: "—",
    stopBuffer: 0, entryBuffer: 0, verifyTicks: 0,
    reverseCancels: 0, validation: 0, executionMode: "—",
    dateRange: "—", integrity: null,
};

export function getRunDisplayName(runOrBundle) {
    if (!runOrBundle) return "Run";
    const summary = runOrBundle.summary || {};
    const explicit = runOrBundle.displayName || runOrBundle.name || summary.displayName || summary.name;
    if (explicit) return explicit;

    const config = runOrBundle.config || {};
    const symbol = runOrBundle.symbol || summary.symbol || config.symbol;
    const tf = compactTimeframe(runOrBundle.detectionTf || summary.detectionTf || summary.detection_tf || config.detection_tf || config.detection_timeframe);
    const rr = Number(runOrBundle.rr ?? summary.rr ?? summary.rr_multiple ?? config.rr_multiple);
    const rrPart = isFinite(rr) && rr > 0 ? `RR${rr.toFixed(1)}` : null;
    const generated = [symbol, tf, rrPart].filter(Boolean).join("_");
    return generated || runOrBundle.id || summary.id || "Run";
}

export function getUniqueRunDisplayName(baseName, runId = null) {
    const base = String(baseName || "Run").trim() || "Run";
    const existing = new Set(
        Object.values(state.runs)
            .filter((run) => !runId || run.id !== runId)
            .map((run) => getRunDisplayName(run)),
    );
    if (!existing.has(base)) return base;
    let n = 2;
    while (existing.has(`${base}_${n}`)) n += 1;
    return `${base}_${n}`;
}

export function compactTimeframe(value) {
    return {
        "1min": "M1",
        "5min": "M5",
        "15min": "M15",
        "30min": "M30",
        "1h": "H1",
        "4h": "H4",
    }[value] || value || "—";
}

export function formatRunDateRange(value) {
    const parts = String(value || "").split("→").map((part) => part.trim());
    if (parts.length < 2) return formatDate(parts[0]) || value || "—";
    const start = formatDate(parts[0]);
    const end = formatDate(parts[1]);
    return start && end ? `${start} → ${end}` : value || "—";
}

function parseDateOnly(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDate(value) {
    const date = parseDateOnly(value);
    return date ? formatShortDate(date) : "";
}

function formatShortDate(date) {
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function defaultProjectChecklist() {
    return {
        baselineImported: false,
        inspected: false,
        entryTested: false,
        protectionTested: false,
        newsTested: false,
        candidateSelected: false,
        validated: false,
        configExported: false,
    };
}

function projectDisplayName(projectId) {
    if (!projectId) return "Unassigned";
    return state.projects[projectId]?.name || "Unassigned";
}

function projectList() {
    return Object.values(state.projects).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function chooseProjectActiveRun(project) {
    if (!project) return null;
    const priority = [project.activeRunId, project.baselineRunId, project.candidateRunId, project.finalRunId];
    for (const runId of priority) {
        if (runId && state.runs[runId]) return state.runs[runId];
    }
    const newest = (project.runIds || [])
        .map((runId) => state.runs[runId])
        .filter(Boolean)
        .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))[0];
    return newest || null;
}

// ─────────────────────────── Derived view ───────────────────────────

function buildDerived() {
    const effectiveActiveRunId = ensureActiveRunId();
    const active = effectiveActiveRunId ? state.runs[effectiveActiveRunId] : null;
    const activeProject = state.activeProjectId ? state.projects[state.activeProjectId] || null : null;
    const activeVariantData = active ? variantDataFor(active) : null;
    const activeSummary = active
        ? summaryForVariant(active.summary, activeVariantData.trades, activeVariantData.variant)
        : null;

    // RUNS list: real imported/sidecar/manual bundles only. No demo/mock runs.
    const importedList = Object.values(state.runs)
        .sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))
        .map((r) => {
            const vd = r.id === active?.id ? activeVariantData : variantDataFor(r);
            const summary = r.id === active?.id ? summaryForVariant(r.summary, vd.trades, vd.variant) : r.summary;
            return {
                ...summary,
                id: r.id,
                _bundleId: r.id,
                displayName: getRunDisplayName(r),
                name: r.name || summary?.name,
                source: r.source || summary?.source,
                originalRunId: r.originalRunId || summary?.originalRunId,
                sidecarJobId: r.sidecarJobId || summary?.sidecarJobId,
                sourceOutputFolder: r.sourceOutputFolder || summary?.sourceOutputFolder,
                outputFolder: r.outputFolder || summary?.outputFolder,
                hasCandles: r.hasCandles ?? summary?.hasCandles,
                candlesStorage: r.candlesStorage || summary?.candlesStorage,
                candlesDroppedFromPersistence: r.candlesDroppedFromPersistence ?? summary?.candlesDroppedFromPersistence,
                candleCount: r.candleCount ?? summary?.candleCount,
                projectId: r.projectId || summary?.projectId || null,
                projectName: projectDisplayName(r.projectId || summary?.projectId),
                runRole: r.runRole || summary?.runRole || "imported",
                experimentType: r.experimentType || summary?.experimentType || "manual",
                _source: "imported",
            };
        });
    const activeTrades = active ? activeVariantData.trades : [];
    const activeOrderBlocks = active?.orderBlocks?.length ? active.orderBlocks : [];
    const tradesByObId = buildTradesByObId(activeTrades);
    const lastCandle = active?.candles?.length ? active.candles[active.candles.length - 1] : null;
    const lastCandleTime = lastCandle?.time ?? lastCandle?.t ?? null;
    const enrichedOrderBlocks = activeOrderBlocks.map((ob) => {
        const key = String(ob?.id ?? ob?.obId ?? "").trim().toLowerCase();
        const numericKey = key.match(/\d+/) ? String(Number(key.match(/\d+/)[0])) : key;
        const linkedTrade = tradesByObId.get(numericKey) || tradesByObId.get(key) || null;
        return deriveOBLifecycle(ob, linkedTrade, lastCandleTime);
    });

    return {
        ...state,
        // Active-run views — empty arrays/null when nothing imported (no mock fallbacks)
        TRADES:        activeTrades,
        CANDLES:       active?.candles?.length     ? active.candles     : [],
        OB_BOXES:      activeOrderBlocks,
        OB_BOXES_ENRICHED: enrichedOrderBlocks,
        TRADE_MARKERS: active ? activeVariantData.tradeMarkers : [],
        EQUITY_CURVE:  active ? activeVariantData.equityCurve  : [],
        ACTIVE_RUN:    activeSummary || EMPTY_RUN,
        // Computed analytics — derived from real trades; empty when no active run
        MONTHLY:  computeMonthly(activeTrades),
        R_DIST:   computeRDist(activeTrades),
        SWEEP_RR: [], // sweep data is not stored in bundles; SweepLab owns its own state
        ACTIVE_TRADE_VARIANT: activeVariantData?.variant || null,
        AVAILABLE_TRADE_VARIANTS: activeVariantData?.variants || [],
        ACTIVE_PROJECT: activeProject,
        PROJECTS: projectList(),
        RUNS: importedList,
        // Helpers exposed for per-run lookups
        getRunData,
        getProjectRuns,
        getActiveProject,
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

export function getActiveProject() {
    return state.activeProjectId ? state.projects[state.activeProjectId] || null : null;
}

export function getProjectRuns(projectId) {
    if (!projectId) return [];
    const project = state.projects[projectId];
    const ids = project?.runIds || [];
    return ids.map((id) => state.runs[id]).filter(Boolean);
}

export function getRunsBackupPayload() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        activeRunId: state.activeRunId,
        activeProjectId: state.activeProjectId,
        projects: state.projects,
        runs: state.runs,
    };
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

export function setActiveProjectId(projectId) {
    const nextId = projectId && state.projects[projectId] ? projectId : null;
    const nextProject = nextId ? state.projects[nextId] : null;
    const projectRun = chooseProjectActiveRun(nextProject);
    const currentActiveIsValid = state.activeRunId && state.runs[state.activeRunId];
    const activeRunId = projectRun?.id || (currentActiveIsValid ? state.activeRunId : null);
    const selectedTradeVariant = projectRun
        ? projectRun.primaryVariant || null
        : (activeRunId ? selectedVariantFor(state.runs[activeRunId]) : null);
    state = { ...state, activeProjectId: nextId, activeRunId, selectedTradeVariant };
    try {
        if (nextId) localStorage.setItem(LS_ACTIVE_PROJECT, nextId);
        else localStorage.removeItem(LS_ACTIVE_PROJECT);
        if (activeRunId) localStorage.setItem(LS_ACTIVE, activeRunId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    notify();
}

export function setProjectActiveRun(projectId, runId) {
    if (!projectId || !state.projects[projectId]) return;
    if (!runId || !state.runs[runId]) return;
    const currentProject = state.projects[projectId];
    const nextProject = { ...currentProject, activeRunId: runId, updatedAt: new Date().toISOString() };
    state = {
        ...state,
        projects: { ...state.projects, [projectId]: nextProject },
    };
    // Propagate to global active run if this project is currently active
    if (state.activeProjectId === projectId) {
        const nextRun = state.runs[runId];
        state = {
            ...state,
            activeRunId: runId,
            selectedTradeVariant: nextRun?.primaryVariant || null,
        };
        try { localStorage.setItem(LS_ACTIVE, runId); } catch { /* noop */ }
    }
    persistProjects();
    notify();
}

export function createResearchProject(input = {}) {
    const now = new Date().toISOString();
    const baseId = String(input.id || input.name || `project_${Date.now()}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `project_${Date.now()}`;
    let id = baseId;
    let n = 2;
    while (state.projects[id]) {
        id = `${baseId}_${n}`;
        n += 1;
    }
    const project = {
        id,
        name: input.name || "Research Project",
        symbol: input.symbol || "",
        timeframe: input.timeframe || "",
        status: input.status || "active",
        createdAt: now,
        updatedAt: now,
        activeRunId: input.activeRunId || null,
        baselineRunId: input.baselineRunId || null,
        candidateRunId: input.candidateRunId || null,
        finalRunId: input.finalRunId || null,
        runIds: Array.isArray(input.runIds) ? [...new Set(input.runIds)] : [],
        checklist: { ...defaultProjectChecklist(), ...(input.checklist || {}) },
        notes: input.notes || "",
        findings: Array.isArray(input.findings) ? input.findings : [],
    };
    state = {
        ...state,
        projects: { ...state.projects, [id]: project },
        activeProjectId: id,
    };
    persistProjects();
    try { localStorage.setItem(LS_ACTIVE_PROJECT, id); } catch { /* noop */ }
    notify();
    return project;
}

export function updateResearchProject(projectId, patch) {
    if (!projectId || !state.projects[projectId]) return;
    const current = state.projects[projectId];
    const nextProject = {
        ...current,
        ...patch,
        checklist: {
            ...current.checklist,
            ...(patch.checklist || {}),
        },
        updatedAt: new Date().toISOString(),
    };
    state = {
        ...state,
        projects: { ...state.projects, [projectId]: nextProject },
    };
    persistProjects();
    notify();
}

export function assignRunToProject(runId, projectId, metadata = {}) {
    if (!runId || !state.runs[runId] || !projectId || !state.projects[projectId]) return;
    const currentRun = state.runs[runId];
    const currentProject = state.projects[projectId];
    const runRole = metadata.runRole || currentRun.runRole || "imported";
    const experimentType = metadata.experimentType || currentRun.experimentType || "manual";
    const nextRun = {
        ...currentRun,
        ...metadata,
        projectId,
        runRole,
        experimentType,
        summary: {
            ...currentRun.summary,
            ...(metadata.summary || {}),
            projectId,
            runRole,
            experimentType,
        },
    };
    const runIds = currentProject.runIds?.includes(runId)
        ? currentProject.runIds
        : [...(currentProject.runIds || []), runId];
    const projectPatch = {
        runIds,
        updatedAt: new Date().toISOString(),
    };
    if (runRole === "baseline" && !currentProject.baselineRunId) {
        projectPatch.baselineRunId = runId;
        projectPatch.checklist = { ...currentProject.checklist, baselineImported: true };
        // First baseline also becomes the project's active run if none is set
        if (!currentProject.activeRunId) {
            projectPatch.activeRunId = runId;
        }
    }
    if (runRole === "candidate") projectPatch.candidateRunId = runId;
    if (runRole === "final") projectPatch.finalRunId = runId;
    state = {
        ...state,
        runs: { ...state.runs, [runId]: nextRun },
        projects: {
            ...state.projects,
            [projectId]: {
                ...currentProject,
                ...projectPatch,
                checklist: {
                    ...currentProject.checklist,
                    ...(projectPatch.checklist || {}),
                },
            },
        },
    };
    // If this project is active and we just set its activeRunId, propagate to global
    if (projectPatch.activeRunId && state.activeProjectId === projectId) {
        state = {
            ...state,
            activeRunId: projectPatch.activeRunId,
            selectedTradeVariant: nextRun.primaryVariant || null,
        };
        try { localStorage.setItem(LS_ACTIVE, projectPatch.activeRunId); } catch { /* noop */ }
    }
    persistRuns();
    persistProjects();
    notify();
}

export function setSelectedTradeVariant(variant) {
    const active = state.activeRunId ? state.runs[state.activeRunId] : null;
    const variants = availableVariants(active);
    const selectedTradeVariant = variants.includes(variant) ? variant : selectedVariantFor(active);
    state = { ...state, selectedTradeVariant };
    notify();
}

export function addRunBundle(bundle) {
    if (!bundle?.id) return;
    const normalizedBundle = normalizeIncomingRunBundle(bundle);
    const id = normalizedBundle.id;
    const candles = Array.isArray(normalizedBundle.candles) ? normalizedBundle.candles : [];
    const nextBundle = candles.length ? withCandleMeta(normalizedBundle, candles) : normalizedBundle;
    state = {
        ...state,
        runs: { ...state.runs, [id]: nextBundle },
        activeRunId: id,  // auto-focus newly imported run
        selectedTradeVariant: normalizedBundle.primaryVariant || null,
    };
    try {
        localStorage.setItem(LS_ACTIVE, id);
    } catch { /* noop */ }
    if (candles.length) {
        const meta = candleMeta(candles);
        saveCandles(id, candles, meta).catch((e) => {
            const current = state.runs[id];
            const fallbackRun = current ? {
                ...current,
                candlesStorage: "session",
                summary: {
                    ...current.summary,
                    candlesStorage: "session",
                },
            } : current;
            state = {
                ...state,
                runs: fallbackRun ? { ...state.runs, [id]: fallbackRun } : state.runs,
                candlePersistenceNotice: `Candles imported but IndexedDB save failed for ${id}: ${e.message || e}.`,
            };
            persistRuns();
            notify();
        });
    }
    persistRuns();
    notify();
    return nextBundle;
}

export async function rehydrateRunCandles(runId) {
    if (!runId || !state.runs[runId]) return false;
    const record = await loadCandles(runId);
    if (!record?.candles?.length || !state.runs[runId]) return false;
    const current = state.runs[runId];
    const nextBundle = withCandleMeta({ ...current, candles: record.candles }, record.candles);
    state = {
        ...state,
        runs: { ...state.runs, [runId]: nextBundle },
        candlePersistenceNotice: null,
    };
    notify();
    return true;
}

export function updateRunBundle(runId, patch) {
    if (!runId || !state.runs[runId]) return;
    const current = state.runs[runId];
    const nextBundle = {
        ...current,
        ...patch,
        summary: {
            ...current.summary,
            ...(patch.summary || {}),
        },
    };
    state = {
        ...state,
        runs: { ...state.runs, [runId]: nextBundle },
    };
    persistRuns();
    notify();
}

export function deleteRunBundle(id) {
    if (!state.runs[id]) return;
    deleteCandles(id).catch(() => {});
    const next = { ...state.runs };
    delete next[id];
    const nextProjects = Object.fromEntries(Object.entries(state.projects).map(([projectId, project]) => [
        projectId,
        {
            ...project,
            activeRunId: project.activeRunId === id ? null : project.activeRunId,
            baselineRunId: project.baselineRunId === id ? null : project.baselineRunId,
            candidateRunId: project.candidateRunId === id ? null : project.candidateRunId,
            finalRunId: project.finalRunId === id ? null : project.finalRunId,
            runIds: (project.runIds || []).filter((runId) => runId !== id),
            updatedAt: new Date().toISOString(),
        },
    ]));
    const fallbackRun = Object.values(next).sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""))[0];
    const activeRunId = state.activeRunId === id ? (fallbackRun?.id || null) : state.activeRunId;
    const selectedTradeVariant = activeRunId ? selectedVariantFor(next[activeRunId]) : null;
    state = { ...state, runs: next, projects: nextProjects, activeRunId, selectedTradeVariant };
    try {
        if (activeRunId) localStorage.setItem(LS_ACTIVE, activeRunId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistRuns();
    persistProjects();
    notify();
}

export function removeRunBundle(id) {
    deleteRunBundle(id);
}

export function clearAllRuns() {
    Object.keys(state.runs).forEach((id) => deleteCandles(id).catch(() => {}));
    const nextProjects = Object.fromEntries(Object.entries(state.projects).map(([projectId, project]) => [
        projectId,
        {
            ...project,
            baselineRunId: null,
            candidateRunId: null,
            finalRunId: null,
            runIds: [],
            updatedAt: new Date().toISOString(),
        },
    ]));
    state = { ...state, runs: {}, projects: nextProjects, activeRunId: null, selectedTradeVariant: null, persistWarning: null, candlePersistenceNotice: null };
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistProjects();
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
    try {
        const runsToPersist = Object.fromEntries(Object.entries(state.runs).map(([id, r]) => [id, persistableRun(r)]));
        let str = JSON.stringify(runsToPersist);
        if (str.length > PERSIST_BUDGET_BYTES) {
            // Still too large — abandon persistence rather than corrupt storage.
            state = {
                ...state,
                persistWarning: `Run bundle exceeds ${(PERSIST_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB after omitting candles; not persisted to localStorage.`,
                candlePersistenceNotice: null,
            };
            return;
        }
        localStorage.setItem(LS_KEY, str);
        state = { ...state, persistWarning: null, candlePersistenceNotice: null };
    } catch (e) {
        state = { ...state, persistWarning: `localStorage write failed: ${e.message || e}` };
    }
}

function persistProjects() {
    try {
        localStorage.setItem(LS_PROJECTS, JSON.stringify(state.projects));
    } catch {
        // Project metadata is intentionally small; if persistence fails, keep session state.
    }
}
