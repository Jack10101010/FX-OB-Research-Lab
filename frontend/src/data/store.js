// Reactive dataset store.
// - Default module is still imported for legacy constants, but run views no longer fall back to demo data.
// - `runs` map holds imported FX-OB-Backtester bundles keyed by run id.
// - `activeRunId` selects which run drives the derived TRADES/CANDLES/OB_BOXES/EQUITY_CURVE.
// - Persisted as a lightweight localStorage index only; full run bundles stay in memory.
// - Large candles live in IndexedDB when available and are optional for run-list persistence.

import { useEffect, useState } from "react";
import * as defaults from "./mock";
import { saveCandles, loadCandles, deleteCandles } from "./artifactStore";
import { buildTradesByObId, deriveOBLifecycle } from "./obLifecycle";
import { ingestRunBundle } from "./importer";
import { getRunBundleByRunId } from "./sidecarClient";

const LS_KEY = "fxob_runs";
const LS_RUN_INDEX = "fxob_runs_index_v1";
const LS_RUN_PREFIX = "fxob_run_v1:";
const LS_PROJECTS = "fxob_projects";
const LS_ACTIVE = "fxob_active_run_id";
const LS_ACTIVE_PROJECT = "fxob_active_project_id";

function loadPersistedRuns() {
    const indexedRuns = loadIndexedRuns();
    if (Object.keys(indexedRuns).length) return indexedRuns;

    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        const legacyRuns = JSON.parse(raw) || {};
        migrateLegacyRuns(legacyRuns);
        return legacyRuns;
    } catch {
        return {};
    }
}

function safeJsonParse(raw, fallback = null) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function runStorageKey(runId) {
    return `${LS_RUN_PREFIX}${encodeURIComponent(String(runId))}`;
}

function loadIndexedRuns() {
    try {
        const index = safeJsonParse(localStorage.getItem(LS_RUN_INDEX), null);
        const entries = Array.isArray(index?.runs) ? index.runs : [];
        const runs = {};
        for (const entry of entries) {
            const run = indexEntryToRun(entry);
            if (!run?.id) continue;
            runs[run.id] = run;
        }
        if (entries.length) {
            cleanupLegacyRunKeys();
            try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
        }
        return runs;
    } catch {
        return {};
    }
}

function migrateLegacyRuns(legacyRuns) {
    if (!legacyRuns || typeof legacyRuns !== "object") return;
    const entries = Object.entries(legacyRuns).map(([id, run]) => buildRunIndexEntry({ ...run, id }));
    if (!entries.length) return;
    try {
        localStorage.setItem(LS_RUN_INDEX, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), runs: entries }));
        localStorage.removeItem(LS_KEY);
    } catch {
        // Keep the legacy blob as fallback if index migration cannot be written.
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
    autoReloadStatus: {},
    autoReloadInProgress: false,
    autoReloadCompletedAt: null,
    autoReloadFailedCount: 0,
};

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
const AUTO_RELOAD_SESSION_ATTEMPTS = new Set();

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

function headlineSummary(run) {
    const summary = run?.summary || {};
    const config = run?.config || {};
    const reloadMeta = reloadMetadataForRun(run);
    const tradesByVariantCount = Object.values(run?.tradesByVariant || {}).reduce((max, trades) => (
        Array.isArray(trades) ? Math.max(max, trades.length) : max
    ), 0);
    const entryTradesByModeCount = Object.values(run?.entryResults?.tradesByMode || {}).reduce((max, trades) => (
        Array.isArray(trades) ? Math.max(max, trades.length) : max
    ), 0);
    const tradeCount = readFirstMetric(
        summary.trades,
        summary.trade_count,
        summary.tradeCount,
        summary.validTradeCount,
        run?.trade_count,
        run?.tradeCount,
        run?.validTradeCount,
        run?.trades?.length,
        tradesByVariantCount,
        entryTradesByModeCount,
    );
    const maxDd = readFirstMetric(
        summary.maxDd,
        summary.maxDD,
        summary.max_drawdown,
        summary.maxDrawdown,
        summary.max_dd,
        run?.maxDd,
        run?.maxDD,
        run?.max_drawdown,
        run?.maxDrawdown,
        run?.max_dd,
    );
    return {
        id: run?.id || summary.id,
        displayName: run?.displayName || run?.name || summary.displayName || summary.name || run?.id || summary.id,
        name: run?.name || summary.name,
        importedAt: run?.importedAt || summary.importedAt || "",
        symbol: summary.symbol || run?.symbol || config.symbol || "",
        detectionTf: summary.detectionTf || summary.detection_tf || run?.detectionTf || config.detection_timeframe || "",
        executionTf: summary.executionTf || summary.execution_tf || run?.executionTf || config.execution_timeframe || "",
        dateRange: summary.dateRange || run?.dateRange || `${summary.date_from || config.start_date || "?"} → ${summary.date_to || config.end_date || "?"}`,
        rr: summary.rr ?? run?.rr ?? config.rr_multiple ?? "",
        trades: tradeCount,
        trade_count: tradeCount,
        tradeCount,
        validTradeCount: tradeCount,
        totalTradeRows: readFirstMetric(summary.totalTradeRows, summary.total_trade_rows, run?.totalTradeRows, run?.trades?.length, tradesByVariantCount),
        wins: readFirstMetric(summary.wins, summary.win_count, summary.winCount, run?.wins, run?.win_count, run?.winCount),
        losses: readFirstMetric(summary.losses, summary.loss_count, summary.lossCount, run?.losses, run?.loss_count, run?.lossCount),
        winRate: readFirstMetric(summary.winRate, summary.win_rate, summary.winRatePct, run?.winRate, run?.win_rate, run?.winRatePct),
        netR: readFirstMetric(summary.netR, summary.net_r, summary.pnl_r, run?.netR, run?.net_r, run?.pnl_r),
        maxDd,
        maxDrawdown: maxDd,
        validation: summary.validation ?? "",
        executionMode: summary.executionMode || summary.execution_mode || run?.executionMode || run?.primaryVariant || "",
        primaryVariant: run?.primaryVariant || summary.primaryVariant || summary.primary_variant || "",
        originalRunId: run?.originalRunId || summary.originalRunId || "",
        sidecarJobId: run?.sidecarJobId || summary.sidecarJobId || "",
        sidecarRunId: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        source: run?.source || summary.source || "",
        projectId: run?.projectId || summary.projectId || null,
        runRole: run?.runRole || summary.runRole || "",
        experimentType: run?.experimentType || summary.experimentType || "",
        hasCandles: run?.hasCandles ?? summary.hasCandles ?? false,
        candlesStorage: run?.candlesStorage || summary.candlesStorage || "",
        candlesDroppedFromPersistence: run?.candlesDroppedFromPersistence ?? summary.candlesDroppedFromPersistence ?? false,
        candlesDroppedForStorage: run?.candlesDroppedForStorage ?? summary.candlesDroppedForStorage ?? false,
        configSummary: {
            symbol: config.symbol || summary.symbol || "",
            detection_timeframe: config.detection_timeframe || summary.detectionTf || summary.detection_tf || "",
            execution_timeframe: config.execution_timeframe || summary.executionTf || summary.execution_tf || "",
            start_date: config.start_date || summary.date_from || "",
            end_date: config.end_date || summary.date_to || "",
            rr_multiple: config.rr_multiple ?? summary.rr ?? "",
            stop_buffer_pips: config.stop_buffer_pips ?? summary.stopBuffer ?? "",
            entry_buffer_pips: config.entry_buffer_pips ?? summary.entryBuffer ?? "",
            verify_limit_ticks: config.verify_limit_ticks ?? summary.verifyTicks ?? "",
            ob_entry_depth_pct: config.ob_entry_depth_pct ?? "",
            structure_filter: config.structure_filter ?? config.structureFilter ?? summary.structure_filter ?? "",
        },
    };
}

function readFirstMetric(...values) {
    for (const value of values) {
        if (value == null || value === "") continue;
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return "";
}

function buildRunIndexEntry(run) {
    const summary = headlineSummary(run);
    const reloadMeta = reloadMetadataForRun(run);
    const reloadAvailable = hasReloadIdentifier(reloadMeta);
    const hasFullData = Boolean(
        (Array.isArray(run?.trades) && run.trades.length)
        || Object.values(run?.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length)
        || Object.values(run?.entryResults?.tradesByMode || {}).some((trades) => Array.isArray(trades) && trades.length)
    );
    return {
        ...summary,
        id: run?.id || summary.id,
        persisted: true,
        hasFullData: false,
        storageMode: "index_only",
        memoryHasFullData: hasFullData,
        originalRunId: reloadMeta.originalRunId,
        sidecarJobId: reloadMeta.sidecarJobId,
        sidecarRunId: reloadMeta.sidecarRunId,
        run_id: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        reloadAvailable,
        warning: reloadAvailable ? "" : "Full data not in memory. Re-import from sidecar/output folder.",
    };
}

function indexEntryToRun(entry) {
    if (!entry?.id) return null;
    const reloadMeta = reloadMetadataForRun(entry);
    const reloadAvailable = hasReloadIdentifier(reloadMeta) || Boolean(entry.reloadAvailable);
    const config = {
        ...(entry.configSummary || {}),
        structure_filter: entry.configSummary?.structure_filter ?? "",
    };
    const summary = {
        id: entry.id,
        displayName: entry.displayName,
        name: entry.name,
        importedAt: entry.importedAt,
        symbol: entry.symbol,
        detectionTf: entry.detectionTf,
        detection_tf: entry.detectionTf,
        executionTf: entry.executionTf,
        execution_tf: entry.executionTf,
        dateRange: entry.dateRange,
        rr: entry.rr,
        trades: entry.trades,
        trade_count: entry.trade_count ?? entry.trades,
        tradeCount: entry.tradeCount ?? entry.trades,
        validTradeCount: entry.validTradeCount ?? entry.trades,
        totalTradeRows: entry.totalTradeRows,
        wins: entry.wins,
        losses: entry.losses,
        winRate: entry.winRate,
        netR: entry.netR,
        maxDd: entry.maxDd,
        maxDrawdown: entry.maxDrawdown,
        validation: entry.validation,
        executionMode: entry.executionMode,
        primaryVariant: entry.primaryVariant,
        originalRunId: entry.originalRunId,
        sidecarJobId: entry.sidecarJobId,
        sidecarRunId: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        source: entry.source,
        projectId: entry.projectId,
        runRole: entry.runRole,
        experimentType: entry.experimentType,
        hasCandles: entry.hasCandles,
        candlesStorage: entry.candlesStorage,
    };
    return {
        id: entry.id,
        displayName: entry.displayName,
        name: entry.name,
        originalRunId: reloadMeta.originalRunId,
        importedAt: entry.importedAt,
        source: entry.source,
        sidecarJobId: reloadMeta.sidecarJobId,
        sidecarRunId: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        projectId: entry.projectId,
        runRole: entry.runRole,
        experimentType: entry.experimentType,
        primaryVariant: entry.primaryVariant || null,
        config,
        summary,
        trades: [],
        tradesByVariant: {},
        primaryVariant: null,
        tradeMarkers: [],
        tradeMarkersByVariant: {},
        equityCurve: [],
        equityCurveByVariant: {},
        protectionResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: true },
        entryResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: true },
        newsEvents: [],
        orderBlocks: [],
        candles: null,
        hasCandles: entry.hasCandles,
        candlesStorage: entry.candlesStorage,
        hasFullData: false,
        storageMode: "index_only",
        reloadAvailable,
        indexOnly: true,
        indexWarning: entry.warning || "",
    };
}

function reloadMetadataForRun(run) {
    const summary = run?.summary || {};
    const outputFolder = readReloadValue(
        run?.outputFolder,
        run?.sourceOutputFolder,
        summary.outputFolder,
        summary.sourceOutputFolder,
        run?.folder,
        summary.folder,
    );
    const sourceOutputFolder = readReloadValue(
        run?.sourceOutputFolder,
        summary.sourceOutputFolder,
        run?.outputFolder,
        summary.outputFolder,
        run?.folder,
        summary.folder,
    );
    const folderName = readReloadValue(
        run?.folderName,
        summary.folderName,
        outputFolderName(sourceOutputFolder),
        outputFolderName(outputFolder),
    );
    const sidecarRunId = readReloadValue(
        run?.sidecarRunId,
        run?.sidecar_run_id,
        run?.run_id,
        summary.sidecarRunId,
        summary.sidecar_run_id,
        summary.run_id,
        run?.sidecarJobId,
        summary.sidecarJobId,
        folderName,
    );
    return {
        originalRunId: readReloadValue(run?.originalRunId, summary.originalRunId, sidecarRunId),
        sidecarJobId: readReloadValue(run?.sidecarJobId, summary.sidecarJobId),
        sidecarRunId,
        outputFolder,
        sourceOutputFolder,
        folderName,
    };
}

function readReloadValue(...values) {
    for (const value of values) {
        const text = String(value ?? "").trim();
        if (text) return text;
    }
    return "";
}

function hasReloadIdentifier(meta) {
    return Boolean(
        meta?.sidecarRunId
        || meta?.outputFolder
        || meta?.sourceOutputFolder
        || meta?.folderName
        || meta?.sidecarJobId
        || meta?.originalRunId
    );
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
    if (run.indexOnly || run.storageMode === "index_only") return false;
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
            bundle?.config?.structure_filter ?? bundle?.config?.structureFilter ?? bundle?.summary?.structure_filter,
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
    if (current?.id) return state.activeRunId;
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
                hasFullData: Boolean(
                    r.hasFullData
                    || (Array.isArray(r.trades) && r.trades.length)
                    || Object.values(r.tradesByVariant || {}).some((trades) => Array.isArray(trades) && trades.length)
                ),
                storageMode: r.storageMode || (r.indexOnly ? "index_only" : "memory_full"),
                reloadAvailable: Boolean(r.reloadAvailable || r.sidecarJobId || summary?.sidecarJobId || r.outputFolder || summary?.outputFolder || r.sourceOutputFolder || summary?.sourceOutputFolder || r.originalRunId || summary?.originalRunId),
                indexOnly: Boolean(r.indexOnly),
                indexWarning: r.indexWarning || "",
                autoReloadStatus: state.autoReloadStatus?.[r.id]?.status || "idle",
                autoReloadError: state.autoReloadStatus?.[r.id]?.error || "",
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
        autoReloadStatus: state.autoReloadStatus,
        autoReloadInProgress: state.autoReloadInProgress,
        autoReloadCompletedAt: state.autoReloadCompletedAt,
        autoReloadFailedCount: state.autoReloadFailedCount,
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

export function replaceRunBundleData(runId, bundle) {
    if (!runId || !bundle) return null;
    const current = state.runs[runId] || {};
    const currentReloadMeta = reloadMetadataForRun(current);
    const bundleReloadMeta = reloadMetadataForRun(bundle);
    const reloadMeta = {
        originalRunId: readReloadValue(currentReloadMeta.originalRunId, bundleReloadMeta.originalRunId, bundle.id, runId),
        sidecarJobId: readReloadValue(currentReloadMeta.sidecarJobId, bundleReloadMeta.sidecarJobId),
        sidecarRunId: readReloadValue(currentReloadMeta.sidecarRunId, bundleReloadMeta.sidecarRunId, bundle.id),
        outputFolder: readReloadValue(currentReloadMeta.outputFolder, bundleReloadMeta.outputFolder),
        sourceOutputFolder: readReloadValue(currentReloadMeta.sourceOutputFolder, bundleReloadMeta.sourceOutputFolder, currentReloadMeta.outputFolder, bundleReloadMeta.outputFolder),
        folderName: readReloadValue(currentReloadMeta.folderName, bundleReloadMeta.folderName, outputFolderName(bundleReloadMeta.sourceOutputFolder), outputFolderName(bundleReloadMeta.outputFolder)),
    };
    const nextBundle = {
        ...bundle,
        id: runId,
        originalRunId: reloadMeta.originalRunId,
        displayName: current.displayName || bundle.displayName || bundle.name || bundle.summary?.displayName,
        name: current.name || bundle.name || bundle.summary?.name,
        importedAt: current.importedAt || bundle.importedAt || new Date().toISOString(),
        projectId: current.projectId || bundle.projectId || bundle.summary?.projectId,
        runRole: current.runRole || bundle.runRole || bundle.summary?.runRole,
        experimentType: current.experimentType || bundle.experimentType || bundle.summary?.experimentType,
        sidecarJobId: reloadMeta.sidecarJobId,
        sidecarRunId: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        reloadAvailable: hasReloadIdentifier(reloadMeta),
        hasFullData: true,
        storageMode: "memory_full",
        indexOnly: false,
        summary: {
            ...bundle.summary,
            id: runId,
            originalRunId: reloadMeta.originalRunId,
            displayName: current.displayName || bundle.displayName || bundle.name || bundle.summary?.displayName,
            name: current.name || bundle.name || bundle.summary?.name,
            importedAt: current.importedAt || bundle.importedAt || new Date().toISOString(),
            projectId: current.projectId || bundle.projectId || bundle.summary?.projectId,
            runRole: current.runRole || bundle.runRole || bundle.summary?.runRole,
            experimentType: current.experimentType || bundle.experimentType || bundle.summary?.experimentType,
            sidecarJobId: reloadMeta.sidecarJobId,
            sidecarRunId: reloadMeta.sidecarRunId,
            run_id: reloadMeta.sidecarRunId,
            outputFolder: reloadMeta.outputFolder,
            sourceOutputFolder: reloadMeta.sourceOutputFolder,
            folderName: reloadMeta.folderName,
        },
    };
    state = {
        ...state,
        runs: { ...state.runs, [runId]: nextBundle },
        activeRunId: runId,
        selectedTradeVariant: nextBundle.primaryVariant || null,
    };
    try { localStorage.setItem(LS_ACTIVE, runId); } catch { /* noop */ }
    persistRuns();
    notify();
    return nextBundle;
}

export async function reloadFullRunFromSidecar(runId) {
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");

    const identifiers = runReloadIdentifiers(runId, current);
    if (!identifiers.length) {
        throw new Error("This run has no sidecar run id or output folder reference.");
    }

    let payload = null;
    let lastError = null;
    let matchedIdentifier = "";
    for (const identifier of identifiers) {
        try {
            payload = await getRunBundleByRunId(identifier, { includeCandles: false });
            matchedIdentifier = identifier;
            break;
        } catch (error) {
            lastError = error;
        }
    }
    if (!payload) {
        throw lastError || new Error("Could not reload full run data from sidecar.");
    }

    const files = (payload.files || []).map((file) => ({
        name: file.name,
        text: async () => file.content || "",
    }));
    const result = await ingestRunBundle(files);
    if (!result.ok) {
        const messages = [
            ...(result.validationErrors || []).map((error) => error.message || String(error)),
            ...(result.errors || []).map((error) => error.error || String(error)),
        ].filter(Boolean);
        throw new Error(messages[0] || "Run bundle could not be reloaded.");
    }

    const sourceOutputFolder = current.sourceOutputFolder || current.outputFolder || payload.folder || "";
    const sidecarRunId = payload.run_id || current.sidecarRunId || current.summary?.sidecarRunId || matchedIdentifier;
    const sidecarJobId = current.sidecarJobId || payload.job_id || sidecarRunId;
    const folderName = outputFolderName(sourceOutputFolder || payload.folder);
    const bundle = {
        ...result.bundle,
        source: current.source || result.bundle.source || "sidecar",
        sidecarJobId,
        sidecarRunId,
        outputFolder: current.outputFolder || payload.folder || "",
        sourceOutputFolder,
        folderName,
        summary: {
            ...result.bundle.summary,
            source: current.source || result.bundle.source || "sidecar",
            sidecarJobId,
            sidecarRunId,
            run_id: sidecarRunId,
            outputFolder: current.outputFolder || payload.folder || "",
            sourceOutputFolder,
            folderName,
        },
    };
    return replaceRunBundleData(runId, bundle);
}

export async function autoReloadIndexedRunsFromSidecar() {
    const candidates = Object.values(state.runs)
        .filter((run) => {
            if (!run?.id) return false;
            if (!run.reloadAvailable) return false;
            if (AUTO_RELOAD_SESSION_ATTEMPTS.has(run.id)) return false;
            if (run.hasFullData && run.storageMode === "memory_full") return false;
            return run.storageMode === "index_only" || run.indexOnly || run.hasFullData === false;
        })
        .map((run) => run.id);

    if (!candidates.length) return { total: 0, loaded: 0, failed: 0 };

    candidates.forEach((runId) => {
        AUTO_RELOAD_SESSION_ATTEMPTS.add(runId);
    });
    const previousActiveRunId = state.activeRunId;
    const previousSelectedTradeVariant = state.selectedTradeVariant;
    state = {
        ...state,
        autoReloadInProgress: true,
        autoReloadCompletedAt: null,
        autoReloadFailedCount: 0,
        autoReloadStatus: {
            ...state.autoReloadStatus,
            ...Object.fromEntries(candidates.map((runId) => [runId, { status: "loading", error: "" }])),
        },
    };
    notify();

    let loaded = 0;
    let failed = 0;
    let cursor = 0;
    const workerCount = Math.min(2, candidates.length);

    async function worker() {
        while (cursor < candidates.length) {
            const runId = candidates[cursor];
            cursor += 1;
            try {
                await reloadFullRunFromSidecar(runId);
                loaded += 1;
                setAutoReloadRunStatus(runId, "loaded", "");
            } catch (error) {
                failed += 1;
                const message = error?.message || "Sidecar unavailable. Start sidecar to reload full run data.";
                setAutoReloadRunStatus(runId, "failed", message);
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const restoredActiveRun = previousActiveRunId ? state.runs[previousActiveRunId] : null;
    state = {
        ...state,
        activeRunId: restoredActiveRun ? previousActiveRunId : state.activeRunId,
        selectedTradeVariant: restoredActiveRun ? previousSelectedTradeVariant : state.selectedTradeVariant,
        autoReloadInProgress: false,
        autoReloadCompletedAt: new Date().toISOString(),
        autoReloadFailedCount: failed,
        persistWarning: failed && loaded === 0
            ? "Sidecar unavailable. Start sidecar to reload full run data."
            : state.persistWarning,
    };
    notify();
    return { total: candidates.length, loaded, failed };
}

function setAutoReloadRunStatus(runId, status, error = "") {
    state = {
        ...state,
        autoReloadStatus: {
            ...state.autoReloadStatus,
            [runId]: { status, error },
        },
    };
    notify();
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

function runReloadIdentifiers(runId, run) {
    const meta = reloadMetadataForRun(run);
    return [
        meta.sidecarRunId,
        meta.folderName || outputFolderName(meta.outputFolder),
        outputFolderName(meta.sourceOutputFolder),
        meta.sidecarJobId,
        meta.originalRunId,
        runId,
    ].map((value) => String(value || "").trim()).filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index);
}

function outputFolderName(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const parts = text.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "";
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
    try { localStorage.removeItem(runStorageKey(id)); } catch { /* noop */ }
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
    cleanupLegacyRunKeys();
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
        localStorage.removeItem(LS_RUN_INDEX);
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
    const indexEntries = Object.values(state.runs).map((run) => buildRunIndexEntry(run));

    try {
        cleanupLegacyRunKeys();
        localStorage.setItem(LS_RUN_INDEX, JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            runs: indexEntries,
        }));
        localStorage.removeItem(LS_KEY);
        state = {
            ...state,
            persistWarning: null,
            candlePersistenceNotice: indexEntries.length
                ? "Full run data is kept in memory only. Lightweight run index was saved. Reopen/reload full data after refresh."
                : null,
        };
    } catch (e) {
        console.warn(`Failed to persist ${LS_RUN_INDEX}:`, e);
        state = {
            ...state,
            persistWarning: `Run index could not be persisted. Existing persisted runs may still restore, but new index changes may disappear on refresh. localStorage write failed: ${e.message || e}`,
            candlePersistenceNotice: null,
        };
    }
}

function cleanupLegacyRunKeys() {
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key && key.startsWith(LS_RUN_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
    } catch {
        // Cleanup is best-effort; stale large keys are ignored by the loader.
    }
}

function persistProjects() {
    try {
        localStorage.setItem(LS_PROJECTS, JSON.stringify(state.projects));
    } catch {
        // Project metadata is intentionally small; if persistence fails, keep session state.
    }
}
