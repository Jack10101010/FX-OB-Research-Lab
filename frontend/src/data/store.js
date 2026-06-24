// Reactive dataset store.
// - Default module is still imported for legacy constants, but run views no longer fall back to demo data.
// - `runs` map holds imported FX-OB-Backtester bundles keyed by run id.
// - `activeRunId` selects which run drives the derived TRADES/CANDLES/OB_BOXES/EQUITY_CURVE.
// - Persisted as a lightweight localStorage index only; full run bundles stay in memory.
// - Large candles live in IndexedDB when available and are optional for run-list persistence.

import { useEffect, useState } from "react";
import * as defaults from "./mock";
import {
    saveCandles,
    loadCandles,
    deleteCandles,
    saveRunBundle as idbSaveRunBundle,
    loadRunBundle as idbLoadRunBundle,
    deleteRunBundle as idbDeleteRunBundle,
    listRunBundleIds as idbListRunBundleIds,
    listCandleRunIds as idbListCandleRunIds,
} from "./artifactStore";
import { buildTradesByObId, deriveOBLifecycle } from "./obLifecycle";
import { ingestRunBundle, enrichBeTradeRowsLazy, beTradeFileInfo, entryVariantStorageKeys, parseOrderBlocksCSV, selectScenarioBaselineUniverse } from "./importer";
import { getRunBundleByRunId, getRunCandlesByRunId, getRunFileByRunId, getRunManifestByRunId, listSidecarRuns } from "./sidecarClient";
import { fetchProjectsFromBackend, saveProjectsToBackend } from "./projectsBackend";
import { summarizeTradeClassifications } from "./tradeClassification";
// Phase RB-1 — Results Basis foundation. The store owns the canonical
// `resultsBasis` + `accountSettings` slices (the "how are trades measured?"
// axis). Account-config normalization is reused from the existing compounding
// engine so defaults match RunDetail exactly.
import { normalizeAccountSettings } from "../components/lab/account/accountEquity";
// Phase 2A — shared store-level trade universe resolver. Pages that want a
// named, scenario-aware trade list (with stats, source filename, warnings,
// baseline reference) should call `getTradeUniverse(runId, scenarioOverride)`
// instead of poking at runData.tradesByVariant / entryResults.tradesByMode.
import {
    resolveTradeUniverse,
    resolveBaselineUniverse,
    describeTradeUniverse,
} from "./tradeUniverse";
import { applyScenarioPatchLayerSafety } from "./runVariantResolve";
import { normalizeProfiles, isProfilesActive, emptyProfiles } from "./sessionProfiles";
// PORTFOLIO-SAVE-LOAD (MVP) — named, immutable snapshots of a session portfolio.
// Pure logic lives in portfolioLibrary.js; state + persistence are owned here
// (mirrors the sessionProfiles.js ↔ store.js split). The working copy stays
// `state.sessionProfiles`; `loadedPortfolioId` points at the record it descends
// from. Library is backend-mirrored via makeDomainBackend; the working copy is not.
import {
    normalizeLibrary, normalizeRecord, mergeLibraries, isLibraryEmpty, listRecords,
    createRecord, duplicateRecord, renameRecord, setRecordDescription, deleteRecord,
    saveIntoRecord, isDirty as isPortfolioDirtyPure,
} from "./portfolioLibrary";
import { makeDomainBackend as makePortfolioBackend } from "./backendDomainSync";

const LS_KEY = "fxob_runs";
const LS_RUN_INDEX = "fxob_runs_index_v1";
const LS_RUN_PREFIX = "fxob_run_v1:";
const LS_PROJECTS = "fxob_projects";
const LS_ACTIVE = "fxob_active_run_id";
const LS_ACTIVE_PROJECT = "fxob_active_project_id";
const LS_SCENARIO = "fxob_scenario_v1";
const LS_SESSION_PROFILES = "fxob_session_profiles_v1";
// PORTFOLIO-SAVE-LOAD — the named library map + the single "loaded" pointer.
const LS_PORTFOLIOS = "fxob_portfolios_v1";
const LS_LOADED_PORTFOLIO_ID = "fxob_loaded_portfolio_id";
// Phase RB-1 — Results Basis + Account Settings persistence.
const LS_RESULTS_BASIS = "fxob_results_basis_v1";
const LS_ACCOUNT_SETTINGS = "fxob_account_settings_v1";
// Legacy RunDetail account-view key. Read once for a non-destructive migration
// into LS_ACCOUNT_SETTINGS; intentionally NOT deleted in this phase.
const LS_LEGACY_ACCOUNT_SETTINGS = "fxob_account_view_settings_v1";

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

// ── Canonical scenario selection ──────────────────────────────────────────
// ONE object drives what the Strategy Map is showing. Phase 1: structured
// state only — no UI changes yet. Downstream consumers still read the legacy
// activeRunId / selectedTradeVariant fields which remain fully backward-compat.
const DEFAULT_SCENARIO = {
    runId: null,            // string | null  — which run bundle
    family: null,           // 'baseline' | 'triggered_edge' | 'penetration' | 'directional' | null
    positionVariant: null,  // 'single_position' | 'one_per_direction' | 'allow_multi_position' | null
    threshold: null,        // number | null  — e.g. 5, 10, 25 (penetration %)
    fillMode: null,         // 'same' | 'next' | 'both' | null  (triggered_edge only; null = both)
    directionalStorageKey: null, // string | null  — directional backend scenario key (family === 'directional')
    // PROTECTION-LAYER Phase 2 — ordered protection/qualification layers applied
    // on top of the resolved entry universe (e.g. break_even). [] = no protection
    // (base entry universe unchanged). resolveTradeUniverse folds these into a
    // "protected_result" universe. `protection` (single-layer sugar) is accepted
    // on load for back-compat, but new writes use `layers`.
    layers: [],             // Layer[] — see data/protectionLayers.js
};

// Normalize a persisted/loaded layers value: array of valid {type} layer objects,
// with `protection` single-layer sugar promoted into the array. Old scenarios
// (neither key) → []. Never throws.
function normalizeScenarioLayers(saved) {
    if (Array.isArray(saved?.layers)) {
        return saved.layers.filter((l) => l && typeof l === "object" && typeof l.type === "string");
    }
    if (saved?.protection && typeof saved.protection === "object" && typeof saved.protection.type === "string") {
        return [saved.protection];
    }
    return [];
}

function loadPersistedScenario(fallbackRunId) {
    try {
        const saved = safeJsonParse(localStorage.getItem(LS_SCENARIO), null);
        if (saved && typeof saved === "object") {
            return {
                runId: typeof saved.runId === "string" ? saved.runId : (fallbackRunId || null),
                family: typeof saved.family === "string" ? saved.family : null,
                positionVariant: typeof saved.positionVariant === "string" ? saved.positionVariant : null,
                threshold: typeof saved.threshold === "number" ? saved.threshold : null,
                fillMode: typeof saved.fillMode === "string" ? saved.fillMode : null,
                directionalStorageKey: typeof saved.directionalStorageKey === "string" ? saved.directionalStorageKey : null,
                layers: normalizeScenarioLayers(saved),
            };
        }
    } catch { /* fall through */ }
    // No stored scenario — derive minimal defaults from the existing active-run key.
    return { ...DEFAULT_SCENARIO, runId: fallbackRunId || null };
}

// ── Session profiles (SESSION-STRATEGY-PROFILES Phase 1) ───────────────────────
// A frontend-only per-session × structure × direction enable matrix. Persisted in
// its OWN slice (NOT inside `scenario`) so it survives run switches, which reset
// the scenario to DEFAULT_SCENARIO. Merged into the scenario at universe read-time
// (see getTradeUniverse / getTradeUniverseSignature) so the pure resolver only
// needs to know about `scenario.sessionProfiles`. Default is disabled → byte-
// identical to pre-feature behavior.
function loadPersistedSessionProfiles() {
    try {
        return normalizeProfiles(safeJsonParse(localStorage.getItem(LS_SESSION_PROFILES), null));
    } catch {
        return emptyProfiles();
    }
}

// ── Portfolio library (PORTFOLIO-SAVE-LOAD MVP) ─────────────────────────────────
// The library is a separate localStorage slice (id-keyed records). The working
// copy remains LS_SESSION_PROFILES. `loadedPortfolioId` is the single pointer.
function loadPersistedPortfolios() {
    try {
        return normalizeLibrary(safeJsonParse(localStorage.getItem(LS_PORTFOLIOS), null));
    } catch {
        return {};
    }
}
function loadLoadedPortfolioId() {
    try {
        return localStorage.getItem(LS_LOADED_PORTFOLIO_ID) || null;
    } catch {
        return null;
    }
}

// ── Results Basis + Account Settings (Phase RB-1) ──────────────────────────
// "Results Basis" answers HOW trades are measured (Raw R vs Current Equity).
// Defaults to "raw_r" so nothing about visible analytics changes in this phase.
function loadPersistedResultsBasis() {
    try {
        const raw = localStorage.getItem(LS_RESULTS_BASIS);
        if (raw === "raw_r" || raw === "current_equity") return raw;
    } catch { /* fall through */ }
    return "raw_r";
}

// Account settings default to normalizeAccountSettings() — the SAME defaults
// RunDetail uses (mode "r_only", $10,000, 1%, USD). Includes a one-time,
// non-destructive migration from RunDetail's legacy localStorage key.
function loadPersistedAccountSettings() {
    try {
        const existing = localStorage.getItem(LS_ACCOUNT_SETTINGS);
        if (existing != null) {
            return normalizeAccountSettings(safeJsonParse(existing, {}));
        }
        // Migration: adopt RunDetail's prior account-view settings if present.
        const legacy = localStorage.getItem(LS_LEGACY_ACCOUNT_SETTINGS);
        if (legacy != null) {
            const migrated = normalizeAccountSettings(safeJsonParse(legacy, {}));
            try {
                localStorage.setItem(LS_ACCOUNT_SETTINGS, JSON.stringify(migrated));
            } catch { /* persistence is best-effort */ }
            // NOTE: legacy key is intentionally left in place this phase.
            return migrated;
        }
    } catch { /* fall through */ }
    return normalizeAccountSettings();
}

let state = {
    ...defaults,
    runs: loadPersistedRuns(),
    projects: loadPersistedProjects(),
    activeRunId: (() => { try { return localStorage.getItem(LS_ACTIVE) || null; } catch { return null; } })(),
    activeProjectId: (() => { try { return localStorage.getItem(LS_ACTIVE_PROJECT) || null; } catch { return null; } })(),
    selectedTradeVariant: null,
    // One-shot, non-persisted cross-page focus handoff (RunDetail FFT drilldown →
    // Strategy Map). Transient: never written to localStorage; the consumer clears it.
    focusedFftEvent: null,
    // Structured scenario — the canonical answer to "what is the Strategy Map showing?"
    scenario: loadPersistedScenario((() => { try { return localStorage.getItem(LS_ACTIVE) || null; } catch { return null; } })()),
    // Session profiles — frontend-only enable matrix (own slice; see loader above).
    sessionProfiles: loadPersistedSessionProfiles(),
    // Portfolio library — named snapshots of `sessionProfiles` + the loaded pointer.
    // Bootstrapped (migration "My Portfolio") + orphan-reconciled just below.
    portfolios: loadPersistedPortfolios(),
    loadedPortfolioId: loadLoadedPortfolioId(),
    // Results Basis axis (Phase RB-1) — HOW trades are measured. No page reads
    // these yet; they default to current behavior (Raw R).
    resultsBasis: loadPersistedResultsBasis(),
    accountSettings: loadPersistedAccountSettings(),
    persistWarning: null,
    candlePersistenceNotice: null,
    autoReloadStatus: {},
    autoReloadInProgress: false,
    autoReloadCompletedAt: null,
    autoReloadFailedCount: 0,
    candleLoadStatus: {},
    // Preview Lens (Phase 8A) — ephemeral, read-only overlay. NEVER persisted,
    // NEVER added to `runs` / RUNS. Lets a temporary bundle stand in for one real
    // run at read time. Shape when active:
    //   { active, sourceRunId, bundle, mode, label, appliedAt }
    previewLens: null,
};

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
const AUTO_RELOAD_SESSION_ATTEMPTS = new Set();

// ── Portfolio library persistence + backend mirror + bootstrap ──────────────────
function persistPortfolios() {
    try { localStorage.setItem(LS_PORTFOLIOS, JSON.stringify(state.portfolios || {})); } catch { /* non-critical */ }
    try { portfoliosBackend.scheduleSync(); } catch { /* backend optional */ }
}
function persistLoadedPortfolioId() {
    try {
        if (state.loadedPortfolioId) localStorage.setItem(LS_LOADED_PORTFOLIO_ID, state.loadedPortfolioId);
        else localStorage.removeItem(LS_LOADED_PORTFOLIO_ID);
    } catch { /* non-critical */ }
}
// Drop a loaded pointer that no longer resolves (e.g. record deleted on another
// device and removed by a backend-hydrate merge). Returns true if it changed.
function reconcileLoadedPointer() {
    if (state.loadedPortfolioId && !state.portfolios?.[state.loadedPortfolioId]) {
        state = { ...state, loadedPortfolioId: null };
        persistLoadedPortfolioId();
        return true;
    }
    return false;
}
// Durable mirror — same pattern as presets/projects. Library only; the working
// copy (LS_SESSION_PROFILES) is intentionally NOT synced.
const portfoliosBackend = makePortfolioBackend({
    domain: "portfolios",
    loadLocal: () => { try { return JSON.parse(localStorage.getItem(LS_PORTFOLIOS) || "{}"); } catch { return {}; } },
    saveLocal: (map) => {
        try { localStorage.setItem(LS_PORTFOLIOS, JSON.stringify(map || {})); } catch { /* noop */ }
        state = { ...state, portfolios: normalizeLibrary(map) };
        reconcileLoadedPointer();
        notify();
    },
    merge: mergeLibraries,
    isEmpty: isLibraryEmpty,
});
// First-run migration: every existing user receives a "My Portfolio" snapshot of
// their current working copy. Non-destructive — the working copy is untouched.
function bootstrapPortfolios() {
    if (isLibraryEmpty(state.portfolios)) {
        const { library, id } = createRecord(state.portfolios || {}, { name: "My Portfolio", description: "", profiles: state.sessionProfiles });
        state = { ...state, portfolios: library, loadedPortfolioId: id };
        persistPortfolios();
        persistLoadedPortfolioId();
    } else {
        reconcileLoadedPointer(); // boot-time orphan reconciliation
    }
}
bootstrapPortfolios();
try { portfoliosBackend.kickoff(); } catch { /* backend optional */ }

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

// LARGE-RUN-IMPORT Phase 2B — the entry-variant keys a run exposes, gathered
// from the lazy entry index AND the nested entry_results summary. Persisted
// (tiny) so the full TE universe lists after a refresh, even before a sidecar
// manifest reload. Reconstructs a minimal nested summary on the way back.
function extractEntryVariantKeys(run) {
    const out = new Set();
    (run?.entryScenarioIndex || []).forEach((s) => { if (s?.entryVariantKey) out.add(s.entryVariantKey); });
    const summary = run?.entryResults?.summary;
    if (summary && typeof summary === "object") {
        Object.keys(summary).forEach((k) => { if (k === "baseline" || k.startsWith("entry_")) out.add(k); });
        Object.values(summary).forEach((v) => {
            if (v && typeof v === "object") {
                Object.keys(v).forEach((k) => { if (k === "baseline" || k.startsWith("entry_")) out.add(k); });
            }
        });
    }
    return [...out].filter(Boolean);
}

function entrySummaryFromKeys(keys, wrapperKey) {
    if (!Array.isArray(keys) || !keys.length) return {};
    return { [wrapperKey || "allow_multi_position"]: Object.fromEntries(keys.map((k) => [k, {}])) };
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
        // Phase 1B — remember this was a large/lazy import so reload uses the
        // lightweight manifest path (the full /bundle endpoint 413s on cubes).
        lazy: Boolean(run?.lazy),
        // Phase 2B — persist the entry-variant key list (tiny) so the full TE
        // universe lists immediately after a refresh, before any sidecar reload.
        entryVariantKeys: extractEntryVariantKeys(run),
        memoryHasFullData: hasFullData,
        originalRunId: reloadMeta.originalRunId,
        sidecarJobId: reloadMeta.sidecarJobId,
        sidecarRunId: reloadMeta.sidecarRunId,
        run_id: reloadMeta.sidecarRunId,
        outputFolder: reloadMeta.outputFolder,
        sourceOutputFolder: reloadMeta.sourceOutputFolder,
        folderName: reloadMeta.folderName,
        // Phase 1B — persist source identity so reload after refresh resolves the
        // real run folder (not the frontend imported_<ts> id).
        sourceRunFolderName: reloadMeta.sourceRunFolderName,
        sourceRunId: reloadMeta.sourceRunId,
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
        sourceRunFolderName: reloadMeta.sourceRunFolderName,
        sourceRunId: reloadMeta.sourceRunId,
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
        sourceRunFolderName: reloadMeta.sourceRunFolderName,
        sourceRunId: reloadMeta.sourceRunId,
        projectId: entry.projectId,
        runRole: entry.runRole,
        experimentType: entry.experimentType,
        primaryVariant: entry.primaryVariant || null,
        config,
        summary,
        trades: [],
        tradesByVariant: {},
        // primaryVariant is set above from entry.primaryVariant; do NOT re-declare
        // it as null here — a duplicate key would clobber the restored value, leaving
        // the in-memory bundle variant-less. That makes resolveTradeUniverse pick a
        // null variant, so a triggered-edge scenario resolves to a prefix-less
        // sourceFile ("entry_…d25.csv" instead of "trades_<variant>__entry_…d25.csv").
        // useLazyEntryVariant only hydrates files matching /__entry_/ (or the base
        // pattern), so the prefix-less name is skipped → KPIs/equity stay empty after
        // selecting an entry variant on a restored lazy/index-only run.
        tradeMarkers: [],
        tradeMarkersByVariant: {},
        equityCurve: [],
        equityCurveByVariant: {},
        protectionResults: { summary: {}, tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: true },
        // Phase 2B — reconstruct a minimal entry summary from the persisted key
        // list so the full TE universe is listable right after refresh (the
        // resolver descends this nested shape; values are empty stat stubs).
        entryResults: {
            summary: entrySummaryFromKeys(entry.entryVariantKeys, entry.primaryVariant),
            tradesByMode: {}, equityCurveByMode: {}, sourceFiles: [], tradesOmittedForStorage: true,
        },
        // BE Exact Replay (BE-FRONTEND-INTEGRATION). Index-only stub defaults so
        // consumers never crash before full data loads; old runs have no BE data.
        beResults: {},
        beTradesByMode: {},
        beSourceFiles: [],
        newsEvents: [],
        orderBlocks: [],
        candles: null,
        hasCandles: entry.hasCandles,
        candlesStorage: entry.candlesStorage,
        hasFullData: false,
        storageMode: "index_only",
        lazy: Boolean(entry.lazy),
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
    // Phase 1B — the source run-folder name (from the folder picker) is the most
    // reliable reload id: the sidecar resolves it directly under outputs/runs.
    const folderName = readReloadValue(
        run?.sourceRunFolderName,
        summary.sourceRunFolderName,
        run?.folderName,
        summary.folderName,
        outputFolderName(sourceOutputFolder),
        outputFolderName(outputFolder),
    );
    const sidecarRunId = readReloadValue(
        run?.sourceRunId,
        summary.sourceRunId,
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
        // First-class source identity (persisted + restored across refresh).
        sourceRunFolderName: readReloadValue(run?.sourceRunFolderName, summary.sourceRunFolderName, folderName),
        sourceRunId: readReloadValue(run?.sourceRunId, summary.sourceRunId, sidecarRunId),
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
            scenario: {
                ...state.scenario,
                runId: activeRunId || null,
            },
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
    const list = trades || [];
    // Use the canonical classifier so a variant's summary doesn't silently
    // bucket UNFILLED / INVALID / NEWS_FLATTEN rows into "losses" — see
    // tradeClassification.js for the categories.
    const rollup = summarizeTradeClassifications(list);
    const netR = list.reduce((s, t) => s + (Number(t.r) || 0), 0);
    return {
        ...summary,
        trades: list.length,
        wins: rollup.wins,
        losses: rollup.losses,
        winRate: Number((rollup.winRate ?? 0).toFixed(1)),
        netR: Number(netR.toFixed(1)),
        executionMode: variant,
        selectedTradeVariant: variant,
    };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    // Active-run views read through the lens overlay; the RUNS list below still
    // iterates state.runs, so the lens never appears as a separate run.
    const active = effectiveActiveRunId ? bundleFor(effectiveActiveRunId) : null;
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
                candlesLoading: state.candleLoadStatus?.[r.id]?.status === "loading",
                candlesLoaded: state.candleLoadStatus?.[r.id]?.status === "loaded",
                candlesError: state.candleLoadStatus?.[r.id]?.error || "",
                candlesCount: state.candleLoadStatus?.[r.id]?.count ?? r.candleCount ?? summary?.candleCount ?? 0,
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
        SWEEP_RR: [], // sweep data is not stored in bundles; SweepLab owns its own state
        ACTIVE_TRADE_VARIANT: activeVariantData?.variant || null,
        AVAILABLE_TRADE_VARIANTS: activeVariantData?.variants || [],
        // Structured scenario — canonical selection driving Strategy Map overlays.
        SCENARIO: state.scenario,
        // One-shot FFT focus handoff (RunDetail → Strategy Map); transient, not persisted.
        FOCUSED_FFT_EVENT: state.focusedFftEvent,
        setFocusedFftEvent,
        clearFocusedFftEvent,
        // One-shot BE focus handoff (Protection Lab → Strategy Map); transient.
        FOCUSED_BE_TRADE: state.focusedBeTrade,
        setFocusedBeTrade,
        clearFocusedBeTrade,
        // Results Basis axis (Phase RB-1) — exposed for future consumers; no
        // page reads these yet, so this is inert.
        RESULTS_BASIS: state.resultsBasis,
        ACCOUNT_SETTINGS: state.accountSettings,
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
        candleLoadStatus: state.candleLoadStatus,
        loadCandlesForRun,
    };
}

// ─────────────────────────── Public API ───────────────────────────

export function getDataset() {
    return buildDerived();
}

// ── Preview Lens (Phase 8A) — ephemeral, read-only overlay ──────────────────
// `bundleFor` lets a temporary bundle stand in for ONE real run at read time,
// WITHOUT ever entering state.runs / RUNS / persistence. Keyed on sourceRunId so
// it only overlays the run it derives from; cleared whenever the real active run
// changes (see the run-switch setters below).

/** Resolve the bundle for a runId, applying the preview lens when it matches. */
function bundleFor(runId) {
    const lens = state.previewLens;
    if (lens?.active && runId && runId === lens.sourceRunId && lens.bundle) {
        return lens.bundle;
    }
    return state.runs[runId] || null;
}

/** Lens-aware bundle accessor — pages should use this. */
export function getRunData(runId) {
    if (!runId) return null;
    return bundleFor(runId);
}

/** Raw bundle accessor — ALWAYS the real stored run, never the lens. */
export function getRawRunData(runId) {
    if (!runId) return null;
    return state.runs[runId] || null;
}

/** Current preview lens (or null). Read-only. */
export function getPreviewLens() {
    return state.previewLens;
}

/**
 * Apply an ephemeral preview lens. The lens bundle stands in for `sourceRunId`
 * at read time only — it is NEVER added to state.runs, RUNS, or persistence.
 */
export function setPreviewLens(lens) {
    if (!lens || typeof lens !== "object") return;
    if (!lens.sourceRunId || !lens.bundle || typeof lens.bundle !== "object") return;
    state = {
        ...state,
        previewLens: {
            active: true,
            sourceRunId: lens.sourceRunId,
            bundle: lens.bundle,
            mode: lens.mode || "local_rescore",
            label: lens.label || "",
            appliedAt: lens.appliedAt || new Date().toISOString(),
        },
    };
    notify();
}

/** Remove the preview lens WITHOUT notifying — for callers that notify once at the end. */
function clearPreviewLensSilently() {
    if (state.previewLens) state = { ...state, previewLens: null };
}

/** Remove the preview lens and re-render. No-op when none is active. */
export function clearPreviewLens() {
    if (!state.previewLens) return;
    state = { ...state, previewLens: null };
    notify();
}

/**
 * Resolve the active TradeUniverse for a given run, optionally overriding the
 * scenario. With no arguments this returns the universe for the active run
 * using the current `state.scenario`. Phase 2A foundation: no page consumes
 * this yet (Strategy Map continues to use `useResolvedScenario`); the export
 * exists so subsequent phases can migrate other surfaces (Failures, Hypothesis,
 * Protection) onto a single named trade universe without further plumbing.
 *
 * @param {string|null} [runId]              defaults to active run.
 * @param {object|null} [scenarioOverride]   overrides `state.scenario` for this call.
 * @returns {object} TradeUniverse — see `data/tradeUniverse.js` for shape.
 */
// SESSION-STRATEGY-PROFILES Phase 1 — inject the active session-profile matrix
// into the scenario at read-time. Returns the SAME scenario reference when no
// profiles are active, so resolveTradeUniverse stays on its byte-identical path.
//
// SESSION-CARD-OVERLAY-DEFAULT-OFF — this global frontend matrix
// (`fxob_session_profiles_v1`) is NO LONGER applied to the canonical trade universe
// by default. It silently mutated baseline + entry-variant results after the
// backtest (masking governed cohorts), which made KPIs/equity inconsistent between
// runs. The canonical universe must reflect the run's baked backend result, so
// callers must OPT IN (`sessionProfilesPreview: true`) to apply the matrix — that
// opt-in is reserved for the explicit Session-Portfolio preview surfaces, never the
// default Run Workspace / Failures / Research / Cockpit reads. The backend-baked
// `session_strategy_scenario` (per-session RR already in the imported rows) is
// unaffected — it lives in the trade data, not this overlay.
function scenarioWithSessionProfiles(scenario) {
    const profiles = state.sessionProfiles;
    if (!isProfilesActive(profiles)) return scenario;
    return { ...(scenario || {}), sessionProfiles: profiles };
}

export function getTradeUniverse(runId = null, scenarioOverride = null, { sessionProfilesPreview = false } = {}) {
    const effectiveRunId = runId || state.activeRunId || null;
    const bundle = effectiveRunId ? bundleFor(effectiveRunId) : null;
    const scenario = scenarioOverride || state.scenario || null;
    const fallbackVariant = state.selectedTradeVariant
        || bundle?.primaryVariant
        || null;
    // Default path = NO global session-card overlay (canonical = baked result).
    const effectiveScenario = sessionProfilesPreview ? scenarioWithSessionProfiles(scenario) : scenario;
    return resolveTradeUniverse({
        bundle,
        scenario: effectiveScenario,
        fallbackVariant,
    });
}

// ── Fair Baseline comparison universe (Session-First P2.5) — READ-ONLY ───────────
// Returns the backend Fair Baseline trade output (trades_<mode>__scenario_baseline.csv,
// stored in bundle.scenarioBaselineResults) as a PARALLEL, never-selectable universe.
// It is deliberately NOT routed through resolveTradeUniverse/getTradeUniverse and is
// NOT a Result-View option, so it can never replace or pollute the custom universe.
// Shape (stable, defensive):
//   { available, executionMode, trades, stats, provenance, warnings, sourceFile }
// Old runs (no CSV / no provenance) → { available:false, … } with empty trades/stats.
export function getScenarioBaselineUniverse(runId = null) {
    const effectiveRunId = runId || state.activeRunId || null;
    const bundle = effectiveRunId ? bundleFor(effectiveRunId) : null;
    // Pure derivation lives in importer.js (selectScenarioBaselineUniverse) so it is
    // testable in the validation harness; this wrapper only resolves the bundle.
    return selectScenarioBaselineUniverse(bundle);
}

// LAZY-RUN-PERFORMANCE Phase 1 — a cheap, stable signature of every input
// getTradeUniverse() actually depends on, so useTradeUniverse can memo on it
// instead of the whole buildDerived() object (which is a fresh reference on
// EVERY notify). It changes only when: the resolved run, the scenario/variant
// selection, or this run's trade collections change (e.g. a lazy load merges
// rows). Unrelated store updates leave it identical → no re-resolve/re-render
// work. O(#variants), never O(#rows) — reads lengths/keys, not row contents.
function tradeDataToken(bundle) {
    if (!bundle) return "none";
    const parts = [];
    parts.push("t" + (Array.isArray(bundle.trades) ? bundle.trades.length : 0));
    const tbv = bundle.tradesByVariant || {};
    parts.push("v" + Object.keys(tbv).sort().map((k) => `${k}:${tbv[k]?.length || 0}`).join(","));
    const em = bundle.entryResults?.tradesByMode || {};
    parts.push("e" + Object.keys(em).sort().map((k) => `${k}:${em[k]?.length || 0}`).join(","));
    const pm = bundle.protectionResults?.tradesByMode || {};
    parts.push("p" + Object.keys(pm).sort().map((k) => `${k}:${pm[k]?.length || 0}`).join(","));
    // BE is nested mode→entry→scenario; key paths are enough to detect a merge.
    const be = bundle.beTradesByMode || {};
    parts.push("b" + Object.keys(be).sort().map((m) => {
        const byEntry = be[m] || {};
        return `${m}{${Object.keys(byEntry).sort().map((ev) => `${ev}:${Object.keys(byEntry[ev] || {}).sort().join("+")}`).join(";")}}`;
    }).join(","));
    // Entry-variant inventory (the selectable LIST) — count is enough.
    const es = bundle.entryResults?.summary;
    parts.push("s" + (es && typeof es === "object" ? Object.keys(es).length : 0));
    return parts.join("|");
}

export function getTradeUniverseSignature(runId = null, scenarioOverride = null, { sessionProfilesPreview = false } = {}) {
    const effectiveRunId = runId || state.activeRunId || null;
    const bundle = effectiveRunId ? bundleFor(effectiveRunId) : null;
    const scenario = scenarioOverride || state.scenario || null;
    const fallbackVariant = state.selectedTradeVariant || bundle?.primaryVariant || null;
    // Scenario is a small object; JSON captures family/threshold/fillMode/
    // directionalStorageKey/layers/runId so any selection change re-resolves.
    // SESSION-CARD-OVERLAY-DEFAULT-OFF — the global matrix is only folded into the
    // signature when the caller explicitly previews it (matches getTradeUniverse), so
    // the canonical signature no longer churns when the matrix toggles.
    const scenarioForSig = sessionProfilesPreview ? scenarioWithSessionProfiles(scenario) : scenario;
    let scn = "";
    try { scn = scenarioForSig ? JSON.stringify(scenarioForSig) : ""; } catch { scn = String(scenarioForSig); }
    return `${effectiveRunId}::${fallbackVariant}::${scn}::${tradeDataToken(bundle)}`;
}

// LAZY-SNAPSHOT-FIX — cheap, deterministic token of the RAW run's trade
// collections (NOT the lensed bundle). Changes whenever lazy variant/baseline/BE
// rows merge into state.runs[runId], so Master Controls can recompose its preview
// lens after a lazy load instead of serving a stale snapshot. Uses getRawRunData
// (never bundleFor) so the token reflects real loaded data, not the lens itself.
export function getRawTradeDataToken(runId) {
    const id = runId || state.activeRunId || null;
    return id ? tradeDataToken(getRawRunData(id)) : "none";
}

// Re-export the resolver helpers for callers that don't want to import
// directly from data/tradeUniverse (keeps the store as the single discovery
// point for trade-data access).
export { resolveTradeUniverse, resolveBaselineUniverse, describeTradeUniverse };

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

// ── Storage diagnostics (Phase SP-3, read-only) ─────────────────────────────
// Synchronous snapshot of what the in-memory store + localStorage manifest hold.
// Pairs with getIndexedDbDiagnostics() for the async IndexedDB side. Performs no
// writes or deletes.
export function getStorageDiagnostics() {
    const runs = Object.values(state.runs);
    const perRun = runs.map((r) => {
        const memoryFull = bundleHasFullData(r);
        const storageMode = r.storageMode || (memoryFull ? "memory_full" : "index_only");
        return {
            id: r.id,
            displayName: getRunDisplayName(r),
            memoryFull,
            storageMode,
            indexOnly: !memoryFull,
            reloadAvailable: Boolean(r.reloadAvailable),
            candlesInMemory: Array.isArray(r.candles) && r.candles.length > 0,
            hasCandlesMeta: Boolean(r.hasCandles || r.candlesStorage),
            candlesStorage: r.candlesStorage || "",
            candleCount: r.candleCount ?? r.summary?.candleCount ?? 0,
            isActive: r.id === state.activeRunId,
        };
    });
    const activeRun = state.activeRunId ? perRun.find((r) => r.id === state.activeRunId) : null;
    return {
        indexCount: runs.length,
        memoryFullCount: perRun.filter((r) => r.memoryFull).length,
        indexOnlyCount: perRun.filter((r) => !r.memoryFull).length,
        hydratedCount: perRun.filter((r) => r.storageMode === "indexeddb_full").length,
        activeRunId: state.activeRunId,
        activeRunStorageMode: activeRun?.storageMode || "none",
        runs: perRun,
    };
}

// Async IndexedDB diagnostics — record KEYS/counts only (never loads the heavy
// candle arrays). Degrades gracefully if IndexedDB is unavailable or errors.
export async function getIndexedDbDiagnostics() {
    const [bundleIds, candleIds] = await Promise.all([
        idbListRunBundleIds().catch(() => null),
        idbListCandleRunIds().catch(() => null),
    ]);
    const available = bundleIds !== null || candleIds !== null;
    return {
        available,
        bundleIds: bundleIds || [],
        candleIds: candleIds || [],
        bundleCount: (bundleIds || []).length,
        candleCount: (candleIds || []).length,
    };
}

// ── Backup restore (Phase SP-1) ─────────────────────────────────────────────
// Companion to getRunsBackupPayload(). Non-destructive by default: merges the
// backup's runs/projects into the in-memory store WITHOUT wiping existing data,
// skips id collisions, preserves reload identifiers, and persists the run index
// + projects afterwards. Does NOT change the index-only persistence model — full
// run data restored from the backup stays in memory for the session exactly like
// a fresh import (the lightweight index is what survives a refresh).
function coerceBackupRuns(runs) {
    if (!runs) return null;
    if (Array.isArray(runs)) {
        const map = {};
        for (const run of runs) {
            const id = run?.id || run?.summary?.id;
            if (id) map[id] = run;
        }
        return map;
    }
    if (typeof runs === "object") return runs;
    return null;
}

function normalizeRestoredRun(id, bundle) {
    const reloadMeta = reloadMetadataForRun(bundle);
    return {
        ...bundle,
        id,
        // Preserve reload identifiers so index-only restores can still rehydrate
        // from the sidecar after a refresh.
        originalRunId: bundle.originalRunId || reloadMeta.originalRunId,
        sidecarJobId: bundle.sidecarJobId || reloadMeta.sidecarJobId,
        sidecarRunId: bundle.sidecarRunId || reloadMeta.sidecarRunId,
        outputFolder: bundle.outputFolder || reloadMeta.outputFolder,
        sourceOutputFolder: bundle.sourceOutputFolder || reloadMeta.sourceOutputFolder,
        folderName: bundle.folderName || reloadMeta.folderName,
        reloadAvailable: bundle.reloadAvailable ?? hasReloadIdentifier(reloadMeta),
        // Defensive shape — keep full data when present, default to empty so the
        // derived view never crashes on a partial/index-only backup entry.
        trades: Array.isArray(bundle.trades) ? bundle.trades : [],
        tradesByVariant: bundle.tradesByVariant && typeof bundle.tradesByVariant === "object" ? bundle.tradesByVariant : {},
        equityCurve: Array.isArray(bundle.equityCurve) ? bundle.equityCurve : [],
        equityCurveByVariant: bundle.equityCurveByVariant && typeof bundle.equityCurveByVariant === "object" ? bundle.equityCurveByVariant : {},
        tradeMarkers: Array.isArray(bundle.tradeMarkers) ? bundle.tradeMarkers : [],
        tradeMarkersByVariant: bundle.tradeMarkersByVariant && typeof bundle.tradeMarkersByVariant === "object" ? bundle.tradeMarkersByVariant : {},
        orderBlocks: Array.isArray(bundle.orderBlocks) ? bundle.orderBlocks : [],
        // Backend-verified OB retest artifacts (Phase 2.4). null when the run was
        // imported without them; preserved here so Retest Lab can prefer backend data.
        obRetests: Array.isArray(bundle.obRetests) ? bundle.obRetests : (bundle.obRetests ?? null),
        obRetestSummary: Array.isArray(bundle.obRetestSummary) ? bundle.obRetestSummary : (bundle.obRetestSummary ?? null),
        candles: Array.isArray(bundle.candles) ? bundle.candles : (bundle.candles ?? null),
        importedAt: bundle.importedAt || bundle.summary?.importedAt || new Date().toISOString(),
        summary: { ...(bundle.summary || {}), id },
    };
}

/**
 * Import a backup produced by getRunsBackupPayload().
 * @param {object} payload  Parsed backup JSON.
 * @param {{ overwriteExisting?: boolean }} [options]
 * @returns {{ ok, error?, imported, skipped, projectsImported, warnings }}
 */
export function importRunsBackup(payload, options = {}) {
    const { overwriteExisting = false } = options;
    const fail = (error) => ({ ok: false, error, imported: 0, skipped: 0, projectsImported: 0, warnings: [] });

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return fail("Backup file is not a valid object.");
    }
    if (Number(payload.version) !== 1) {
        return fail(`Unsupported backup version: ${payload.version ?? "unknown"}. Expected version 1.`);
    }
    const incomingRuns = coerceBackupRuns(payload.runs);
    if (!incomingRuns) {
        return fail("Backup is missing a valid `runs` map/array.");
    }

    const warnings = [];
    let imported = 0;
    let skipped = 0;
    const nextRuns = { ...state.runs };
    for (const [id, bundle] of Object.entries(incomingRuns)) {
        if (!id || !bundle || typeof bundle !== "object") {
            warnings.push(`Skipped malformed run entry "${id}".`);
            skipped += 1;
            continue;
        }
        if (nextRuns[id] && !overwriteExisting) {
            skipped += 1;
            continue;
        }
        const restored = normalizeRestoredRun(id, bundle);
        nextRuns[id] = restored;
        imported += 1;
        // SP-2: if the backup carried full data, persist it to IndexedDB so it
        // survives a later refresh. Stubs are skipped inside persistRunBundleToIdb.
        persistRunBundleToIdb(id, restored);
    }

    // Merge projects (non-destructive: keep existing, add only new ids).
    let projectsImported = 0;
    const nextProjects = { ...state.projects };
    const incomingProjects = payload.projects && typeof payload.projects === "object" && !Array.isArray(payload.projects)
        ? payload.projects
        : {};
    for (const [pid, project] of Object.entries(incomingProjects)) {
        if (!pid || !project || typeof project !== "object") continue;
        if (nextProjects[pid]) continue;
        nextProjects[pid] = project;
        projectsImported += 1;
    }

    state = { ...state, runs: nextRuns, projects: nextProjects };

    // Set a useful active run only if none is currently valid.
    const currentValid = state.activeRunId && state.runs[state.activeRunId];
    if (!currentValid) {
        const desired = (payload.activeRunId && state.runs[payload.activeRunId])
            ? payload.activeRunId
            : chooseFallbackRunId();
        if (desired) {
            state = {
                ...state,
                activeRunId: desired,
                selectedTradeVariant: selectedVariantFor(state.runs[desired]),
                scenario: { ...DEFAULT_SCENARIO, runId: desired },
            };
            try { localStorage.setItem(LS_ACTIVE, desired); } catch { /* noop */ }
        }
    }
    // Adopt the backup's active project only if none is set locally.
    if (!state.activeProjectId && payload.activeProjectId && state.projects[payload.activeProjectId]) {
        state = { ...state, activeProjectId: payload.activeProjectId };
        try { localStorage.setItem(LS_ACTIVE_PROJECT, payload.activeProjectId); } catch { /* noop */ }
    }

    persistRuns();
    persistProjects();
    persistScenario();
    notify();
    return { ok: true, imported, skipped, projectsImported, warnings };
}

export function setActiveRunId(runId) {
    clearPreviewLensSilently(); // a real run switch drops any temporary lens
    const nextRun = runId ? state.runs[runId] : null;
    const selectedTradeVariant = nextRun?.primaryVariant || null;
    state = {
        ...state,
        activeRunId: runId || null,
        selectedTradeVariant,
        // Keep scenario.runId in sync. Reset family/threshold/fillMode so future
        // phases can derive clean defaults for the newly selected run.
        scenario: {
            ...DEFAULT_SCENARIO,
            runId: runId || null,
        },
    };
    try {
        if (runId) localStorage.setItem(LS_ACTIVE, runId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistScenario();
    notify();
}

export function setActiveProjectId(projectId) {
    clearPreviewLensSilently();
    const nextId = projectId && state.projects[projectId] ? projectId : null;
    const nextProject = nextId ? state.projects[nextId] : null;
    const projectRun = chooseProjectActiveRun(nextProject);
    const currentActiveIsValid = state.activeRunId && state.runs[state.activeRunId];
    const activeRunId = projectRun?.id || (currentActiveIsValid ? state.activeRunId : null);
    const selectedTradeVariant = projectRun
        ? projectRun.primaryVariant || null
        : (activeRunId ? selectedVariantFor(state.runs[activeRunId]) : null);
    state = {
        ...state,
        activeProjectId: nextId,
        activeRunId,
        selectedTradeVariant,
        scenario: {
            ...DEFAULT_SCENARIO,
            runId: activeRunId || null,
        },
    };
    try {
        if (nextId) localStorage.setItem(LS_ACTIVE_PROJECT, nextId);
        else localStorage.removeItem(LS_ACTIVE_PROJECT);
        if (activeRunId) localStorage.setItem(LS_ACTIVE, activeRunId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistScenario();
    notify();
}

export function setProjectActiveRun(projectId, runId) {
    if (!projectId || !state.projects[projectId]) return;
    if (!runId || !state.runs[runId]) return;
    clearPreviewLensSilently();
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
            scenario: {
                ...DEFAULT_SCENARIO,
                runId,
            },
        };
        try { localStorage.setItem(LS_ACTIVE, runId); } catch { /* noop */ }
        persistScenario();
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

// PROJECTS-1B: delete a project and unlink its runs without deleting them.
// Clears run.projectId / run.summary.projectId for every run that was assigned
// to this project, removes the project from state.projects, resets
// activeProjectId when it matched, then persists both the run index and the
// projects blob.
export function deleteProject(projectId) {
    if (!projectId || !state.projects[projectId]) return;

    // Unlink all runs that belonged to this project.
    const nextRuns = Object.fromEntries(
        Object.entries(state.runs).map(([id, run]) => {
            const assignedId = run.projectId || run.summary?.projectId || null;
            if (assignedId !== projectId) return [id, run];
            return [id, {
                ...run,
                projectId: null,
                summary: run.summary ? { ...run.summary, projectId: null } : run.summary,
            }];
        })
    );

    // Remove the project entry.
    const nextProjects = { ...state.projects };
    delete nextProjects[projectId];

    // Reset active project if it was the one being deleted.
    const nextActiveProjectId = state.activeProjectId === projectId ? null : state.activeProjectId;

    state = {
        ...state,
        runs: nextRuns,
        projects: nextProjects,
        activeProjectId: nextActiveProjectId,
    };

    try {
        if (nextActiveProjectId == null) localStorage.removeItem(LS_ACTIVE_PROJECT);
        else localStorage.setItem(LS_ACTIVE_PROJECT, nextActiveProjectId);
    } catch { /* noop */ }

    persistRuns();
    persistProjects();
    notify();
}

// WF-4: append a single research finding to a project. Reuses the existing
// findings model so notes captured from Run Workspace render identically in
// ProjectDetail. Returns the created entry, or null when the project/input is
// invalid. Persisted via updateResearchProject → persistProjects().
export function addProjectFinding(projectId, finding = {}) {
    if (!projectId || !state.projects[projectId]) return null;
    const cleanTitle = String(finding.title || "").trim();
    const cleanNote = String(finding.note || "").trim();
    if (!cleanTitle && !cleanNote) return null;
    const current = state.projects[projectId];
    const entry = {
        id: `finding_${Date.now()}`,
        type: finding.type || "finding",
        title: cleanTitle || "Finding",
        note: cleanNote,
        sourceRunId: finding.sourceRunId || finding.runId || "",
        createdAt: new Date().toISOString(),
        // Metadata (ignored by existing renderers, available to future Insights).
        source: finding.source || "run_workspace",
        runId: finding.runId || finding.sourceRunId || "",
        ...(finding.tag ? { tag: finding.tag } : {}),
        // Optional context pass-through (e.g. Table Compare). Only stored when
        // provided; existing renderers ignore unknown keys.
        ...(finding.comparedRunId ? { comparedRunId: finding.comparedRunId } : {}),
        ...(finding.table ? { table: finding.table } : {}),
        ...(finding.bucket ? { bucket: finding.bucket } : {}),
        ...(finding.meta && typeof finding.meta === "object" ? { meta: finding.meta } : {}),
    };
    updateResearchProject(projectId, {
        findings: [entry, ...(current.findings || [])],
    });
    return entry;
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
    state = {
        ...state,
        selectedTradeVariant,
        scenario: {
            ...state.scenario,
            positionVariant: selectedTradeVariant || null,
        },
    };
    persistScenario();
    notify();
}

// ── Scenario actions ───────────────────────────────────────────────────────
// These are the Phase 1 additions for the canonical scenario state.
// Phase 2+ will wire these to the ScenarioSelector UI component.

/**
 * Merge a partial patch into the current scenario.
 * Conservative in Phase 1: no automatic cascade of dependents.
 * Callers are responsible for providing a coherent patch.
 *
 * @param {{ runId?, family?, positionVariant?, threshold?, fillMode? }} patch
 */
export function setScenario(patch) {
    if (!patch || typeof patch !== "object") return;
    // Layer-safety merge (PROTECTION-LAYER Phase 2): changing the base entry view
    // clears stale protection layers; `protection` sugar promotes to layers[];
    // explicit `layers` (the "Open as Result View" path) is preserved. Pure rule
    // lives in runVariantResolve.applyScenarioPatchLayerSafety (unit-tested).
    state = { ...state, scenario: applyScenarioPatchLayerSafety(state.scenario, patch) };
    persistScenario();
    notify();
}

/**
 * Set the active protection/qualification layers (PROTECTION-LAYER Phase 2).
 * Pass a layer array (typically one BE layer). Non-array → cleared to [].
 * Does not touch the base entry view (family/threshold/fillMode/variant).
 */
export function setScenarioLayers(layers) {
    setScenario({ layers: Array.isArray(layers) ? layers.filter((l) => l && typeof l.type === "string") : [] });
}

/** Clear all protection layers, returning to the base entry universe. */
export function clearScenarioLayers() {
    setScenario({ layers: [] });
}

// ── One-shot FFT focus handoff (RunDetail drilldown → Strategy Map) ─────────
// Transient cross-page channel: NOT persisted to localStorage. The Strategy Map
// consumer clears it after the scenario overlays resolve (matched or not).
export function setFocusedFftEvent(event) {
    state = { ...state, focusedFftEvent: event || null };
    notify();
}

export function clearFocusedFftEvent() {
    if (state.focusedFftEvent == null) return;
    state = { ...state, focusedFftEvent: null };
    notify();
}

// ── One-shot BE focus handoff (Protection Lab → Strategy Map) ────────────────
// Transient cross-page channel (NOT persisted), same pattern as the FFT focus.
// Carries { runId, tradeId, beArmLevel, beTriggerBasis }. The Strategy Map
// consumer selects the trade, enables BE verification + the scenario, then clears.
export function setFocusedBeTrade(event) {
    state = { ...state, focusedBeTrade: event || null };
    notify();
}

export function clearFocusedBeTrade() {
    if (state.focusedBeTrade == null) return;
    state = { ...state, focusedBeTrade: null };
    notify();
}

// ── Results Basis setters (Phase RB-1) ─────────────────────────────────────
// Same pattern as setScenario: mutate the slice, persist, notify. No consumer
// reads these yet, so calling them is inert beyond persistence.
export function setResultsBasis(basis) {
    const next = basis === "current_equity" ? "current_equity" : "raw_r";
    if (next === state.resultsBasis) return;
    state = { ...state, resultsBasis: next };
    persistResultsBasis();
    notify();
}

export function setAccountSettings(patch) {
    if (!patch || typeof patch !== "object") return;
    state = {
        ...state,
        accountSettings: normalizeAccountSettings({ ...state.accountSettings, ...patch }),
    };
    persistAccountSettings();
    notify();
}

// ── Session profile actions (SESSION-STRATEGY-CARDS) ───────────────────────────
/** Read the current (normalized) session cards config. */
export function getSessionProfiles() {
    return state.sessionProfiles || emptyProfiles();
}

/** The active run's resolved bundle (or null). Used by Session Cards to check
 *  which entry/BE variants exist in this export. Read-only. */
export function getActiveBundle() {
    const id = state.activeRunId || null;
    return id ? bundleFor(id) : null;
}

/**
 * Replace the session-profile matrix with a normalized version of `next`.
 * Frontend-only; never triggers a backend run. Persists + notifies so every
 * useTradeUniverse consumer re-resolves against the new mask.
 */
export function setSessionProfiles(next) {
    state = { ...state, sessionProfiles: normalizeProfiles(next) };
    persistSessionProfiles();
    notify();
}

// ── Portfolio library actions (PORTFOLIO-SAVE-LOAD MVP) ─────────────────────────
/** All records, newest-updated first. */
export function listPortfolios() { return listRecords(state.portfolios); }
/** The loaded pointer (single source of truth) — or null (Untitled working copy). */
export function getLoadedPortfolioId() { return state.loadedPortfolioId || null; }
/** The loaded record (or null). */
export function getLoadedPortfolio() {
    const id = state.loadedPortfolioId;
    return id ? (state.portfolios?.[id] || null) : null;
}
/** Derived dirty state — working copy vs the record it descends from (enabled
 *  excluded; both sides re-normalized). Never stored. */
export function isWorkingCopyDirty() {
    return isPortfolioDirtyPure(state.sessionProfiles, getLoadedPortfolio());
}

// Apply a record's profiles into the working copy WITHOUT changing the live
// master On/Off (enabled is working-session state, not portfolio identity).
function applyProfilesPreservingEnabled(profiles) {
    const enabled = !!(state.sessionProfiles && state.sessionProfiles.enabled);
    return normalizeProfiles({ ...normalizeProfiles(profiles), enabled });
}

/** Load a saved portfolio into the working copy. Returns true on success. */
export function loadPortfolio(id) {
    const rec = state.portfolios?.[id];
    if (!rec) return false;
    state = {
        ...state,
        sessionProfiles: applyProfilesPreservingEnabled(rec.profiles),
        loadedPortfolioId: id,
    };
    persistSessionProfiles();
    persistLoadedPortfolioId();
    notify();
    return true;
}

/** Save the working copy into the loaded record. Returns the id, or null when
 *  there is no loaded record (the caller should use saveAs instead). */
export function savePortfolio() {
    const id = state.loadedPortfolioId;
    if (!id || !state.portfolios?.[id]) return null;
    state = { ...state, portfolios: saveIntoRecord(state.portfolios, id, state.sessionProfiles) };
    persistPortfolios();
    notify();
    return id;
}

/** Save the working copy as a new named record and load it. Returns the new id. */
export function savePortfolioAs(name, description = "") {
    const { library, id } = createRecord(state.portfolios || {}, { name, description, profiles: state.sessionProfiles });
    state = { ...state, portfolios: library, loadedPortfolioId: id };
    persistPortfolios();
    persistLoadedPortfolioId();
    notify();
    return id;
}

/** Create a fresh empty portfolio, load it as the working copy. Returns its id. */
export function createPortfolio(name, description = "") {
    const { library, id } = createRecord(state.portfolios || {}, { name, description, profiles: emptyProfiles() });
    state = {
        ...state,
        portfolios: library,
        loadedPortfolioId: id,
        sessionProfiles: applyProfilesPreservingEnabled(emptyProfiles()),
    };
    persistPortfolios();
    persistLoadedPortfolioId();
    persistSessionProfiles();
    notify();
    return id;
}

/** Revert the working copy to the loaded record's snapshot. Returns true on success. */
export function revertPortfolio() {
    const rec = getLoadedPortfolio();
    if (!rec) return false;
    state = { ...state, sessionProfiles: applyProfilesPreservingEnabled(rec.profiles) };
    persistSessionProfiles();
    notify();
    return true;
}

/** Duplicate a record (new id, de-collided name). Returns the new id, or null. */
export function duplicatePortfolio(id) {
    const { library, id: newId } = duplicateRecord(state.portfolios || {}, id);
    if (!newId) return null;
    state = { ...state, portfolios: library };
    persistPortfolios();
    notify();
    return newId;
}

/** Rename a record. Returns true on success. */
export function renamePortfolio(id, name) {
    const lib = renameRecord(state.portfolios || {}, id, name);
    if (lib === state.portfolios) return false;
    state = { ...state, portfolios: lib };
    persistPortfolios();
    notify();
    return true;
}

/** Update a record's description. Returns true on success. */
export function setPortfolioDescription(id, description) {
    const lib = setRecordDescription(state.portfolios || {}, id, description);
    if (lib === state.portfolios) return false;
    state = { ...state, portfolios: lib };
    persistPortfolios();
    notify();
    return true;
}

/** Delete a record. Clears the loaded pointer if it was the deleted one. */
export function deletePortfolio(id) {
    const lib = deleteRecord(state.portfolios || {}, id);
    if (lib === state.portfolios) return false;
    const nextLoaded = state.loadedPortfolioId === id ? null : state.loadedPortfolioId;
    state = { ...state, portfolios: lib, loadedPortfolioId: nextLoaded };
    persistPortfolios();
    persistLoadedPortfolioId();
    notify();
    return true;
}

/**
 * Switch to a different run. Resets family / positionVariant / threshold /
 * fillMode to null so Phase 2+ selectors can derive clean defaults for the
 * newly selected run's bundle.
 *
 * Also calls setActiveRunId internally so the rest of the app (which still
 * reads activeRunId) stays coherent.
 *
 * @param {string|null} runId
 */
export function setScenarioRun(runId) {
    clearPreviewLensSilently();
    const nextRun = runId ? state.runs[runId] : null;
    const selectedTradeVariant = nextRun?.primaryVariant || null;
    state = {
        ...state,
        activeRunId: runId || null,
        selectedTradeVariant,
        scenario: {
            ...DEFAULT_SCENARIO,
            runId: runId || null,
        },
    };
    try {
        if (runId) localStorage.setItem(LS_ACTIVE, runId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistScenario();
    notify();
}

// ── LARGE-RUN-IMPORT Phase 1 — lazy run file registry + on-demand BE loading ──
// Session-scoped (NEVER persisted): maps runId → Map(fileName → File handle) for
// the files a large bundle deferred at import. File handles can't be structured-
// cloned to IndexedDB, so they live here only and vanish on refresh (after which
// lazy loads fall back to the sidecar /file endpoint).
const LAZY_RUN_FILES = new Map();
// In-flight de-dupe so concurrent consumers of the same scenario share one fetch.
const LAZY_BE_INFLIGHT = new Map();

export function registerLazyRunFiles(runId, fileMap) {
    if (!runId || !fileMap || typeof fileMap.forEach !== "function") return;
    const existing = LAZY_RUN_FILES.get(runId) || new Map();
    fileMap.forEach((file, name) => existing.set(name, file));
    LAZY_RUN_FILES.set(runId, existing);
}

export function getLazyRunFileNames(runId) {
    const m = LAZY_RUN_FILES.get(runId);
    return m ? [...m.keys()] : [];
}

function sidecarRunIdFor(run) {
    return run?.sidecarRunId || run?.summary?.sidecarRunId || run?.summary?.run_id
        || run?.originalRunId || run?.id || null;
}

async function readLazyFileText(runId, name, run) {
    // Prefer the in-session File handle (no network); fall back to the sidecar.
    const handle = LAZY_RUN_FILES.get(runId)?.get(name);
    if (handle && typeof handle.text === "function") return handle.text();
    const sidecarId = sidecarRunIdFor(run);
    if (!sidecarId) throw new Error("File not available in session and no sidecar run id to reload it.");
    const payload = await getRunFileByRunId(sidecarId, name);
    return payload?.content ?? "";
}

/**
 * Lazily load ONE BE scenario's trade rows for a large/lazy run and merge them
 * into state.runs[id].beTradesByMode[em][evk][scenarioKey]. Idempotent: returns
 * immediately if already loaded. Concurrent calls for the same file share one
 * fetch. Throws on read/parse failure so callers can show an error state.
 */
export async function ensureBeScenarioTrades(runId, fileName) {
    const run = runId ? state.runs[runId] : null;
    if (!run || !fileName) return null;
    const info = beTradeFileInfo(fileName);
    if (!info) throw new Error(`Not a BE scenario file: ${fileName}`);
    const { executionMode: em, entryVariantKey: evk, scenarioKey } = info;

    const already = run.beTradesByMode?.[em]?.[evk]?.[scenarioKey];
    if (Array.isArray(already)) return already;

    const inflightKey = `${runId}::${fileName}`;
    if (LAZY_BE_INFLIGHT.has(inflightKey)) return LAZY_BE_INFLIGHT.get(inflightKey);

    const task = (async () => {
        const text = await readLazyFileText(runId, fileName, run);
        const trades = enrichBeTradeRowsLazy(text, {
            orderBlocks: run.orderBlocks || [],
            config: run.config || {},
            summary: run.summary || {},
        });
        // Merge immutably into the run's BE map (copy only the touched branch).
        const current = state.runs[runId];
        if (!current) return trades;
        const byMode = { ...(current.beTradesByMode || {}) };
        const byEntry = { ...(byMode[em] || {}) };
        const byScenario = { ...(byEntry[evk] || {}) };
        byScenario[scenarioKey] = trades;
        byEntry[evk] = byScenario;
        byMode[em] = byEntry;
        state = { ...state, runs: { ...state.runs, [runId]: { ...current, beTradesByMode: byMode } } };
        notify();
        return trades;
    })();
    LAZY_BE_INFLIGHT.set(inflightKey, task);
    try {
        return await task;
    } finally {
        LAZY_BE_INFLIGHT.delete(inflightKey);
    }
}

/**
 * LARGE-RUN-IMPORT Phase 2 — lazily load ONE entry-variant trade CSV for a
 * large/lazy run and merge it into entryResults.tradesByMode (the same keys the
 * resolver reads), so triggered-edge variants become usable on selection.
 * Idempotent + de-duped; reads the in-session File handle first, else the
 * sidecar /file endpoint (after refresh). Throws on read/parse failure.
 */
export async function ensureVariantTrades(runId, fileName) {
    const run = runId ? state.runs[runId] : null;
    if (!run || !fileName) return null;
    const keys = entryVariantStorageKeys(fileName);
    if (!keys) return null; // base/BE/candles — not an entry variant file
    const existing = run.entryResults?.tradesByMode?.[keys.mode];
    if (Array.isArray(existing) && existing.length) return existing;

    const inflightKey = `var::${runId}::${fileName}`;
    if (LAZY_BE_INFLIGHT.has(inflightKey)) return LAZY_BE_INFLIGHT.get(inflightKey);

    const task = (async () => {
        const text = await readLazyFileText(runId, fileName, run);
        const trades = enrichBeTradeRowsLazy(text, {
            orderBlocks: run.orderBlocks || [],
            config: run.config || {},
            summary: run.summary || {},
        });
        const current = state.runs[runId];
        if (!current) return trades;
        const er = current.entryResults || {};
        const byMode = { ...(er.tradesByMode || {}) };
        keys.keys.forEach((k) => { byMode[k] = trades; });
        state = {
            ...state,
            runs: { ...state.runs, [runId]: { ...current, entryResults: { ...er, tradesByMode: byMode } } },
        };
        notify();
        return trades;
    })();
    LAZY_BE_INFLIGHT.set(inflightKey, task);
    try { return await task; } finally { LAZY_BE_INFLIGHT.delete(inflightKey); }
}

/**
 * LARGE-RUN-IMPORT Phase 2C — lazily load the BASE primary trade CSV
 * (trades_<mode>.csv) for a lazy run so Baseline shows rows. In-session the base
 * file is parsed eagerly (this returns early); it matters after a refresh, when
 * the restored stub has tradesByVariant:{} — then it fetches via the sidecar
 * /file endpoint. Merges into tradesByVariant[mode] (+ top-level trades when
 * that mode is primary). Idempotent + de-duped.
 */
export async function ensureBaselineTrades(runId, fileName) {
    const run = runId ? state.runs[runId] : null;
    if (!run || !fileName) return null;
    const base = String(fileName).split(/[\\/]/).pop();
    const m = /^trades_(single_position|allow_multi_position|one_per_direction)\.csv$/i.exec(base);
    if (!m) return null;
    const variant = m[1].toLowerCase();
    const existing = run.tradesByVariant?.[variant];
    if (Array.isArray(existing) && existing.length) return existing;

    const inflightKey = `base::${runId}::${base}`;
    if (LAZY_BE_INFLIGHT.has(inflightKey)) return LAZY_BE_INFLIGHT.get(inflightKey);

    const task = (async () => {
        const text = await readLazyFileText(runId, base, run);
        const trades = enrichBeTradeRowsLazy(text, {
            orderBlocks: run.orderBlocks || [], config: run.config || {}, summary: run.summary || {},
        });
        const current = state.runs[runId];
        if (!current) return trades;
        const tbv = { ...(current.tradesByVariant || {}), [variant]: trades };
        const isPrimary = !current.primaryVariant || current.primaryVariant === variant;
        state = {
            ...state,
            runs: {
                ...state.runs,
                [runId]: {
                    ...current,
                    tradesByVariant: tbv,
                    primaryVariant: current.primaryVariant || variant,
                    ...(isPrimary ? { trades } : {}),
                },
            },
        };
        notify();
        return trades;
    })();
    LAZY_BE_INFLIGHT.set(inflightKey, task);
    try { return await task; } finally { LAZY_BE_INFLIGHT.delete(inflightKey); }
}

/**
 * SHARED RUN-UNIVERSE BRIDGE — ensure a run's visible trade universe has resident
 * rows, hydrating from the sidecar when needed. Lets Research Lab / Cockpit load a
 * lazy/guarded run on demand (the same way Run Detail does via useLazyEntryVariant),
 * without duplicating RunDetail-only logic. Idempotent + de-duped (the underlying
 * ensure* helpers guard in-flight). Resolves the active universe's source file via
 * getTradeUniverse, then loads the entry-variant OR baseline file — whichever yields
 * rows (the helpers no-op for the wrong file type, so trying both is safe).
 * @returns {Promise<{ hydrated:boolean, reason:string, file?:string, error?:string }>}
 */
function _hasResidentRows(b) {
    return (Array.isArray(b?.trades) && b.trades.length > 0)
        || Object.values(b?.tradesByVariant || {}).some((v) => Array.isArray(v) && v.length > 0)
        || Object.values(b?.entryResults?.tradesByMode || {}).some((v) => Array.isArray(v) && v.length > 0);
}

// Bound the sidecar fetch so an unresponsive sidecar degrades to the error/CTA
// instead of hanging the UI forever. The underlying load keeps running in the
// background — if it later resolves and merges rows, the next render picks them up.
const HYDRATE_TIMEOUT_MS = 20000;
function _withTimeout(promise, ms = HYDRATE_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("hydration timed out (sidecar unreachable)")), ms)),
    ]);
}

export async function ensureRunTradeUniverse(runId) {
    if (!runId) return { hydrated: false, reason: "no_run" };
    const bundle = state.runs[runId];
    if (!bundle) return { hydrated: false, reason: "no_bundle" };
    if (_hasResidentRows(bundle)) return { hydrated: true, reason: "resident" };

    // 1) Lazy run — light, targeted load of the active universe's source file
    //    (entry-variant → tradesByMode, or baseline → tradesByVariant/trades).
    if (bundle.lazy) {
        const file = getTradeUniverse(runId)?.sourceFile || null;
        if (file) {
            try {
                let rows = await _withTimeout(ensureVariantTrades(runId, file));   // null for non-entry files
                if (!(Array.isArray(rows) && rows.length)) rows = await _withTimeout(ensureBaselineTrades(runId, file));
                if (Array.isArray(rows) && rows.length) return { hydrated: true, reason: "loaded", file };
            } catch (e) { /* fall through to the full reload below */ }
        }
    }

    // 2) General fallback — full reload from the sidecar. Covers index-only
    //    non-lazy runs (bundle reload) and lazy runs (manifest reload). Writes
    //    rows back into state.runs (same path Run Detail uses).
    if (bundle.lazy || bundle.reloadAvailable) {
        try {
            await _withTimeout(reloadFullRunFromSidecar(runId));
            const ok = _hasResidentRows(state.runs[runId]);
            return { hydrated: ok, reason: ok ? "reloaded" : "no_rows" };
        } catch (e) {
            return { hydrated: false, reason: "error", error: String(e?.message || e) };
        }
    }
    return { hydrated: false, reason: "not_loadable" };
}

/** Find the BE scenario filename in a lazy run's index for a UI selection. */
export function findBeFileForRun(run, { executionMode, entryVariantKey, triggerBasis, armLevelR } = {}) {
    const idx = run?.beScenarioIndex;
    if (!Array.isArray(idx) || !idx.length) return null;
    const wantEntry = entryVariantKey || "baseline";
    const trig = String(triggerBasis || "").toLowerCase();
    const arm = Number(armLevelR);
    if (!Number.isFinite(arm)) return null;
    // entryVariantKey (baseline↔null), triggerBasis and armLevelR (epsilon) must
    // always match. executionMode is matched STRICTLY first; if that misses we
    // retry IGNORING execution mode — BE files are unique per (variant, trigger,
    // arm) within a run, so a mode-label mismatch (selection passing a blank or
    // different mode than the indexed one) must not drop an otherwise-unambiguous
    // file and silently force a REPLAY fallback (LAZY-BE-EXACT regression fix).
    const matchesCore = (s) =>
        (s.entryVariantKey || "baseline") === wantEntry
        && String(s.triggerBasis || "").toLowerCase() === trig
        && Math.abs(Number(s.armLevelR) - arm) < 1e-6;
    const strict = idx.find((s) => matchesCore(s) && (!executionMode || s.executionMode === executionMode));
    if (strict) return strict.name;
    const tolerant = idx.find(matchesCore);
    return tolerant ? tolerant.name : null;
}

export function addRunBundle(bundle) {
    if (!bundle?.id) return;
    clearPreviewLensSilently(); // a newly added real run must not be overlaid by a stale lens
    const normalizedBundle = normalizeIncomingRunBundle(bundle);
    const id = normalizedBundle.id;
    const candles = Array.isArray(normalizedBundle.candles) ? normalizedBundle.candles : [];
    const nextBundle = candles.length ? withCandleMeta(normalizedBundle, candles) : normalizedBundle;
    state = {
        ...state,
        runs: { ...state.runs, [id]: nextBundle },
        activeRunId: id,  // auto-focus newly imported run
        selectedTradeVariant: normalizedBundle.primaryVariant || null,
        // New import: reset scenario to clean slate for this run so
        // future phases can auto-derive family/threshold from the bundle.
        scenario: {
            ...DEFAULT_SCENARIO,
            runId: id,
        },
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
    persistScenario();
    notify();
    // SP-2: mirror the full bundle into IndexedDB so a refresh restores it
    // without the sidecar. Non-blocking; candles are stripped (stored separately).
    persistRunBundleToIdb(id, nextBundle);
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
        // Preserve existing candles when the incoming bundle was fetched without them
        // (reloadFullRunFromSidecar uses includeCandles: false, so bundle.candles = null).
        // Without this, the spread `...bundle` above would wipe previously loaded candles.
        candles: bundle.candles?.length ? bundle.candles : (current.candles ?? null),
        hasCandles: !!(bundle.candles?.length ? bundle.candles.length : current.candles?.length),
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
        // Sidecar reload refreshes the bundle; keep scenario.runId in sync but
        // preserve any family/threshold the user had selected if they match this run.
        scenario: {
            ...state.scenario,
            runId,
        },
    };
    try { localStorage.setItem(LS_ACTIVE, runId); } catch { /* noop */ }
    persistRuns();
    persistScenario();
    notify();
    // SP-2: persist the refreshed full bundle (e.g. after a sidecar reload) so
    // subsequent refreshes hydrate from IndexedDB instead of re-hitting the sidecar.
    persistRunBundleToIdb(runId, nextBundle);
    return nextBundle;
}

// Recover a stale run record's sidecar identity. A persisted record may carry an
// id the sidecar can't resolve (a frontend-local id, or an output folder captured
// before the run folder was finalised), so /bundle 404s with "Run output folder
// does not exist". We ask the sidecar for its run list, match THIS run — by display
// name first, then by any stored identifier appearing in the run's id/folder — and
// backfill + persist the real run_id + folder so this and all future reloads
// resolve. Returns the resolvable sidecar run_id, or "" if there's no confident match.
async function reconcileRunIdentityFromSidecar(runId, current) {
    let listing;
    try {
        listing = await listSidecarRuns();
    } catch {
        return "";
    }
    const runs = (listing && listing.runs) || [];
    if (!runs.length) return "";

    const targetName = String(getRunDisplayName(current) || "").trim();
    let match = targetName
        ? runs.find((r) => String(r.display_name || r.displayName || "").trim() === targetName)
        : null;

    if (!match) {
        const ids = runReloadIdentifiers(runId, current);
        match = runs.find((r) => {
            const rid = String(r.run_id || "");
            const base = outputFolderName(r.folder || "");
            return ids.some((id) => id && (rid === id || base === id || String(r.folder || "").includes(id)));
        });
    }
    if (!match || !match.run_id) return "";

    const folder = String(match.folder || "");
    const folderName = outputFolderName(folder);
    updateRunBundle(runId, {
        sidecarRunId: match.run_id,
        run_id: match.run_id,
        sourceRunId: match.run_id,
        outputFolder: folder || current.outputFolder || "",
        sourceOutputFolder: folder || current.sourceOutputFolder || "",
        folderName: folderName || current.folderName || "",
        sourceRunFolderName: folderName || current.sourceRunFolderName || "",
        reloadAvailable: true,
    });
    return match.run_id;
}

// Phase 1B — restore a LAZY (large-run) index stub from the sidecar manifest.
// True when a sidecar request failed because the response was too large (HTTP 413).
// Used to route an over-cap /bundle request to the manifest-based lazy import.
function isBundleTooLargeError(error) {
    if (!error) return false;
    if (error.status === 413) return true;
    const msg = String(error.message || error).toLowerCase();
    return msg.includes("413")
        || msg.includes("too large")
        || msg.includes("entity too large")
        || msg.includes("payload too large");
}

// The full /bundle endpoint 413s on cube-scale runs, so lazy runs reload the
// compact manifest instead: it rehydrates the BE scenario index + provenance +
// candle metadata so on-demand BE loads (via the sidecar /file endpoint) work
// again after a refresh. Trade rows themselves stay lazy.
export async function reloadLazyRunFromManifest(runId, options = {}) {
    // lazyReason marks WHY this run went lazy — "bundle_413" when the 413 fallback
    // routed here, else a generic "lazy_manifest". Surfaced on the run record so the
    // status chip can say "Large-run lazy import" rather than implying global lazy mode.
    const lazyReason = options.reason || "lazy_manifest";
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");
    const identifiers = runReloadIdentifiers(runId, current);
    if (!identifiers.length) throw new Error("This run has no source run id or output folder reference.");

    let manifest = null;
    let lastError = null;
    let matched = "";
    for (const identifier of identifiers) {
        try {
            manifest = await getRunManifestByRunId(identifier);
            matched = identifier;
            break;
        } catch (error) { lastError = error; }
    }
    if (!manifest) {
        // Stored identity may be stale — reconcile against the sidecar run list and retry once.
        const reconciledId = await reconcileRunIdentityFromSidecar(runId, current);
        if (reconciledId) {
            try { manifest = await getRunManifestByRunId(reconciledId); matched = reconciledId; }
            catch (error) { lastError = error; }
        }
    }
    if (!manifest) throw lastError || new Error("Could not reload run manifest from sidecar.");

    // Load order_blocks ONCE for a lazy run so OB-dependent enrichment (penetration %,
    // OB-relative fields in entry/BE rows) does not run against []. Graceful: a missing
    // or unreadable order_blocks.csv degrades to whatever was already resident (else [])
    // with a warning surfaced on the run record — it never throws / blocks the import.
    let lazyOrderBlocks = Array.isArray(current.orderBlocks) ? current.orderBlocks : [];
    const lazyWarnings = [];
    if (!lazyOrderBlocks.length) {
        try {
            const obPayload = await getRunFileByRunId(matched, "order_blocks.csv");
            const obText = obPayload?.content ?? "";
            const parsed = obText ? parseOrderBlocksCSV(obText) : [];
            if (Array.isArray(parsed) && parsed.length) {
                lazyOrderBlocks = parsed;
            } else {
                lazyWarnings.push("order_blocks.csv was empty or unavailable; OB-dependent fields may be degraded.");
            }
        } catch (error) {
            lazyWarnings.push(`Could not load order_blocks.csv: ${String(error?.message || error)}`);
        }
    }

    const beScenarioIndex = (manifest.be_matrix?.scenarios || []).map((s) => ({
        name: s.name,
        executionMode: s.execution_mode ?? null,
        entryVariantKey: s.entry_variant_key ?? null,
        scenarioKey: s.scenario_key ?? null,
        triggerBasis: s.trigger_basis ?? null,
        armLevelR: s.arm_level_r ?? null,
        size: s.size ?? null,
    }));
    const folderName = outputFolderName(manifest.folder) || matched;
    // Restore the primary execution-mode variant so deriveSourceFile() can
    // reconstruct entry-variant filenames (trades_<variant>__<entryKey>.csv)
    // after a refresh, when the in-session bundle/handles are gone.
    const primaryVariant = (manifest.available_variants && manifest.available_variants[0]) || current.primaryVariant || null;
    // Phase 2B — restore the entry universe so all TE variants list after refresh.
    const entryScenarioIndex = (manifest.entry_scenarios?.scenarios || []).map((s) => ({
        name: s.name,
        type: "entry",
        executionMode: s.execution_mode ?? null,
        entryVariantKey: s.entry_variant_key ?? null,
        sourceFile: s.name,
        threshold: s.threshold ?? null,
        fillMode: s.fill_mode ?? null,
        label: s.label ?? null,
        size: s.size ?? null,
    }));
    const manifestEntrySummary = (manifest.entry_results && Object.keys(manifest.entry_results).length)
        ? manifest.entry_results
        : entrySummaryFromKeys(entryScenarioIndex.map((s) => s.entryVariantKey).filter(Boolean), primaryVariant);
    const prevEntry = current.entryResults || {};
    const patch = {
        lazy: true,
        reloadAvailable: true,
        // GUARD: a lazy-manifest run is index-backed (rows fetched on demand). Mark it
        // explicitly as NOT fully loaded so RunDetail/selectors never treat it as eager
        // and never inherit a stale hasFullData=true from a prior eager load.
        indexOnly: true,
        hasFullData: false,
        largeRun: true,
        lazyReason,
        lazyWarnings,
        orderBlocks: lazyOrderBlocks,
        storageMode: "lazy_manifest",
        primaryVariant,
        // Preserve any already-loaded entry rows; refresh the summary + index.
        entryResults: { ...prevEntry, summary: manifestEntrySummary, tradesByMode: prevEntry.tradesByMode || {} },
        entryScenarioIndex,
        beScenarioIndex,
        candlesMeta: manifest.candles ? { name: manifest.candles.name, size: manifest.candles.size } : null,
        candlesLazy: Boolean(manifest.candles),
        provenance: {
            beMultiarmEnabled: manifest.provenance?.be_multiarm_enabled ?? null,
            reverseTouchCancelEnabled: manifest.provenance?.reverse_touch_cancel_enabled ?? null,
            executionModes: manifest.provenance?.execution_modes ?? null,
        },
        largeRunMeta: {
            reasons: ["manifest reload"],
            fileCount: manifest.file_count ?? null,
            beScenarioCount: manifest.be_matrix?.scenario_count ?? beScenarioIndex.length,
            candlesDeferred: Boolean(manifest.candles),
        },
        sourceRunFolderName: folderName || current.sourceRunFolderName || "",
        sourceRunId: manifest.run_id || current.sourceRunId || "",
        folderName: folderName || current.folderName || "",
    };
    return updateRunBundle(runId, patch);
}

export async function reloadFullRunFromSidecar(runId) {
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");

    // Phase 1B — lazy/large runs can't use the heavy /bundle endpoint (413).
    if (current.lazy) return reloadLazyRunFromManifest(runId);

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
            // Large BE / deep-triggered-edge runs exceed the monolithic /bundle cap
            // (MAX_BUNDLE_BYTES → 413). A 413 means the run is too big for eager bundle
            // import — fall back to the manifest-based lazy path, which discovers ALL
            // entry variants (incl. d20–d50) via /runs/{id}/manifest without loading rows.
            // Not a hard failure; never raise MAX_BUNDLE_BYTES.
            if (isBundleTooLargeError(error)) {
                return reloadLazyRunFromManifest(runId, { reason: "bundle_413" });
            }
        }
    }
    if (!payload) {
        // Stored identity may be stale — reconcile against the sidecar run list and retry once.
        const reconciledId = await reconcileRunIdentityFromSidecar(runId, current);
        if (reconciledId) {
            try {
                payload = await getRunBundleByRunId(reconciledId, { includeCandles: false });
                matchedIdentifier = reconciledId;
            } catch (error) {
                lastError = error;
            }
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
    const previousScenario = state.scenario;
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
        // Restore scenario to what it was before the batch reload; individual
        // replaceRunBundleData calls may have shifted it during the parallel workers.
        scenario: restoredActiveRun ? previousScenario : state.scenario,
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

export async function loadCandlesForRun(runId, options = {}) {
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");

    // DISPLAY path (Strategy Map): aggregated OHLC candles are cached SEPARATELY in
    // `displayCandles` so they can never satisfy or overwrite the full-resolution
    // `candles` that OB Retest / Breakeven verification depend on. A full request
    // (no purpose/aggregate) never reads or writes this slot, so there is no
    // cross-contamination either way.
    const isDisplay = options.purpose === "display" || Boolean(options.aggregate);
    if (isDisplay) {
        if (Array.isArray(current.displayCandles) && current.displayCandles.length) return current.displayCandles;
        const dispIds = runReloadIdentifiers(runId, current);
        if (!dispIds.length) throw new Error("This run has no sidecar run id or output folder reference.");
        setCandleLoadStatus(runId, "loading", "", current.candleCount || 0);
        let dispPayload = null;
        let dispError = null;
        for (const identifier of dispIds) {
            try { dispPayload = await getRunCandlesByRunId(identifier, options); break; }
            catch (error) { dispError = error; }
        }
        if (!dispPayload) {
            const message = dispError?.message || "Could not load candle data from sidecar. Make sure sidecar is running and candles.csv exists.";
            setCandleLoadStatus(runId, "failed", message, 0);
            throw new Error(message);
        }
        const displayCandles = Array.isArray(dispPayload.candles) ? dispPayload.candles : [];
        const cur = state.runs[runId] || current;
        state = {
            ...state,
            runs: { ...state.runs, [runId]: {
                ...cur,
                displayCandles,
                displayCandlesMeta: {
                    aggregated: Boolean(dispPayload.aggregated),
                    sourceCount: dispPayload.source_count ?? null,
                    returnedCount: dispPayload.returned_count ?? displayCandles.length,
                    bucketSeconds: dispPayload.bucket_seconds ?? null,
                    bucketLabel: dispPayload.bucket_label || "",
                },
            } },
        };
        setCandleLoadStatus(runId, "loaded", "", displayCandles.length);
        return displayCandles;
    }

    if (Array.isArray(current.candles) && current.candles.length) return current.candles;

    const identifiers = runReloadIdentifiers(runId, current);
    if (!identifiers.length) {
        throw new Error("This run has no sidecar run id or output folder reference.");
    }

    setCandleLoadStatus(runId, "loading", "", current.candleCount || 0);
    let payload = null;
    let lastError = null;
    for (const identifier of identifiers) {
        try {
            payload = await getRunCandlesByRunId(identifier, options);
            break;
        } catch (error) {
            lastError = error;
        }
    }
    if (!payload) {
        const message = lastError?.message || "Could not load candle data from sidecar. Make sure sidecar is running and candles.csv exists.";
        setCandleLoadStatus(runId, "failed", message, 0);
        throw new Error(message);
    }

    const candles = Array.isArray(payload.candles) ? payload.candles : [];
    const nextRun = {
        ...current,
        candles,
        hasCandles: candles.length > 0,
        candlesStorage: "memory",
        candleCount: candles.length,
        summary: {
            ...current.summary,
            hasCandles: candles.length > 0,
            candlesStorage: "memory",
            candleCount: candles.length,
        },
    };
    state = {
        ...state,
        runs: { ...state.runs, [runId]: nextRun },
    };
    setCandleLoadStatus(runId, "loaded", "", candles.length);
    return candles;
}

// Intrabar inspector: fetch a SMALL full-resolution (1m) candle window around a
// selected event via the sidecar range endpoint (no aggregation). Cached per
// window in run.intrabarCandlesByWindow[`${start}_${end}`] — NEVER touches
// run.candles (full-resolution consumers) or run.displayCandles (aggregated
// overview). Idempotent + de-duped; never loads the whole candles.csv.
const INSPECTOR_WINDOW_INFLIGHT = new Map();
export async function loadInspectorWindowCandles(runId, { start, end } = {}) {
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");
    if (!start || !end) throw new Error("Inspector window requires start and end times.");
    const key = `${start}_${end}`;
    const cached = current.intrabarCandlesByWindow?.[key];
    if (Array.isArray(cached) && cached.length) return cached;
    const inflightKey = `${runId}::${key}`;
    if (INSPECTOR_WINDOW_INFLIGHT.has(inflightKey)) return INSPECTOR_WINDOW_INFLIGHT.get(inflightKey);
    const identifiers = runReloadIdentifiers(runId, current);
    if (!identifiers.length) throw new Error("This run has no sidecar run id or output folder reference.");
    const task = (async () => {
        let payload = null;
        let lastError = null;
        for (const identifier of identifiers) {
            // No aggregate / max_points → the sidecar returns FULL-resolution rows
            // in [start, end] only.
            try { payload = await getRunCandlesByRunId(identifier, { start, end }); break; }
            catch (error) { lastError = error; }
        }
        if (!payload) throw lastError || new Error("Could not load inspector candle window from sidecar.");
        const windowCandles = Array.isArray(payload.candles) ? payload.candles : [];
        const cur = state.runs[runId];
        if (cur) {
            // Store the window for cache reuse WITHOUT notify(): the caller (the
            // inspector effect) receives the candles via this promise and sets its
            // own component state. Calling notify() here would re-render StrategyMap
            // with a new bundle identity — harmless now that the fetch effect keys
            // off primitive start/end, but an unnecessary full-tree re-render. The
            // cache mutation is intentionally non-reactive (read only by this fn).
            state = {
                ...state,
                runs: { ...state.runs, [runId]: {
                    ...cur,
                    intrabarCandlesByWindow: { ...(cur.intrabarCandlesByWindow || {}), [key]: windowCandles },
                } },
            };
        }
        return windowCandles;
    })();
    INSPECTOR_WINDOW_INFLIGHT.set(inflightKey, task);
    try { return await task; } finally { INSPECTOR_WINDOW_INFLIGHT.delete(inflightKey); }
}

// Strategy Map "M15 window" mode: fetch a BOUNDED, server-aggregated 15m OHLC window
// (aggregate=ohlc & bucket=15m) over [start,end]. Cached per window in
// run.m15Windows[`m15_${start}_${end}`] — a slot distinct from run.candles (full-res),
// run.displayCandles (6h overview), and run.intrabarCandlesByWindow (1m inspector).
// Forced bucket (no max_points) so the bounded range stays at 15m with no auto-upshift;
// the caller bounds the range (≤ ~1Y). Never loads the whole candles.csv.
const M15_WINDOW_INFLIGHT = new Map();
export async function loadM15WindowCandles(runId, { start, end } = {}) {
    const current = runId ? state.runs[runId] : null;
    if (!current) throw new Error("Run is not available in the local index.");
    if (!start || !end) throw new Error("M15 window requires start and end times.");
    const key = `m15_${start}_${end}`;
    const cached = current.m15Windows?.[key];
    if (Array.isArray(cached) && cached.length) return cached;
    const inflightKey = `${runId}::${key}`;
    if (M15_WINDOW_INFLIGHT.has(inflightKey)) return M15_WINDOW_INFLIGHT.get(inflightKey);
    const identifiers = runReloadIdentifiers(runId, current);
    if (!identifiers.length) throw new Error("This run has no sidecar run id or output folder reference.");
    const task = (async () => {
        let payload = null;
        let lastError = null;
        for (const identifier of identifiers) {
            try { payload = await getRunCandlesByRunId(identifier, { start, end, aggregate: "ohlc", bucket: "15m" }); break; }
            catch (error) { lastError = error; }
        }
        if (!payload) throw lastError || new Error("Could not load M15 window from sidecar.");
        const windowCandles = Array.isArray(payload.candles) ? payload.candles : [];
        const cur = state.runs[runId];
        if (cur) {
            // Non-reactive cache mutation (read only by this fn); the caller receives
            // candles via this promise and sets its own component state.
            state = {
                ...state,
                runs: { ...state.runs, [runId]: {
                    ...cur,
                    m15Windows: { ...(cur.m15Windows || {}), [key]: windowCandles },
                } },
            };
        }
        return windowCandles;
    })();
    M15_WINDOW_INFLIGHT.set(inflightKey, task);
    try { return await task; } finally { M15_WINDOW_INFLIGHT.delete(inflightKey); }
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

function setCandleLoadStatus(runId, status, error = "", count = 0) {
    state = {
        ...state,
        candleLoadStatus: {
            ...state.candleLoadStatus,
            [runId]: { status, error, count },
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
    // SP-2: also drop the persisted full bundle from IndexedDB.
    idbDeleteRunBundle(id).catch(() => {});
    IDB_BUNDLE_SESSION_SAVED.delete(id);
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
    // If the deleted run was selected in the scenario, reset scenario to the
    // fallback run (same clean-slate approach as setActiveRunId).
    const nextScenario = state.scenario.runId === id
        ? { ...DEFAULT_SCENARIO, runId: activeRunId || null }
        : { ...state.scenario, runId: state.scenario.runId === id ? (activeRunId || null) : state.scenario.runId };
    state = { ...state, runs: next, projects: nextProjects, activeRunId, selectedTradeVariant, scenario: nextScenario };
    try {
        if (activeRunId) localStorage.setItem(LS_ACTIVE, activeRunId);
        else localStorage.removeItem(LS_ACTIVE);
    } catch { /* noop */ }
    persistRuns();
    persistProjects();
    persistScenario();
    notify();
}

export function removeRunBundle(id) {
    deleteRunBundle(id);
}

export function clearAllRuns() {
    Object.keys(state.runs).forEach((id) => {
        deleteCandles(id).catch(() => {});
        // SP-2: also drop persisted full bundles from IndexedDB.
        idbDeleteRunBundle(id).catch(() => {});
        IDB_BUNDLE_SESSION_SAVED.delete(id);
    });
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
    state = { ...state, runs: {}, projects: nextProjects, activeRunId: null, selectedTradeVariant: null, scenario: { ...DEFAULT_SCENARIO }, persistWarning: null, candlePersistenceNotice: null };
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_RUN_INDEX);
        localStorage.removeItem(LS_ACTIVE);
        localStorage.removeItem(LS_SCENARIO);
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
    // Mirror to the durable on-disk backend store (best-effort, debounced). The
    // localStorage write above stays the instant, offline-safe cache; this push
    // is what makes saved insights survive browser-data clears.
    scheduleBackendProjectsSync();
}

// ── Durable backend mirror for projects/insights ─────────────────────────────
// The full projects map is mirrored to backend/server.py (/api/projects → a
// projects.json on disk). Writes are debounced to coalesce bursts; failures are
// non-fatal (the backend is optional — the app still runs from localStorage).
let backendSyncTimer = null;
const BACKEND_SYNC_DEBOUNCE_MS = 800;

function scheduleBackendProjectsSync() {
    if (typeof window === "undefined") return;
    if (backendSyncTimer) clearTimeout(backendSyncTimer);
    const snapshot = state.projects;
    backendSyncTimer = setTimeout(() => {
        backendSyncTimer = null;
        saveProjectsToBackend(snapshot).catch(() => {
            // Backend not running / unreachable — localStorage remains the source
            // of truth and the next change will retry. No user-facing error.
        });
    }, BACKEND_SYNC_DEBOUNCE_MS);
}

// Merge two projects maps without losing data from either side. Used on boot so
// insights created offline (localStorage-only) and insights already persisted on
// disk both survive. Findings are unioned by id; project metadata follows the
// most-recently-updated side.
function mergeProjectsMaps(localProjects = {}, remoteProjects = {}) {
    const merged = {};
    const ids = new Set([...Object.keys(localProjects || {}), ...Object.keys(remoteProjects || {})]);
    for (const id of ids) {
        const local = localProjects[id];
        const remote = remoteProjects[id];
        if (!local) { merged[id] = remote; continue; }
        if (!remote) { merged[id] = local; continue; }

        // Union findings by id (newest-first order preserved by createdAt sort).
        const byId = new Map();
        for (const f of [...(remote.findings || []), ...(local.findings || [])]) {
            if (f && f.id && !byId.has(f.id)) byId.set(f.id, f);
        }
        const findings = Array.from(byId.values()).sort((a, b) => {
            const ta = Date.parse(a?.createdAt || "") || 0;
            const tb = Date.parse(b?.createdAt || "") || 0;
            return tb - ta;
        });

        // Scalar metadata: prefer the side with the newer updatedAt.
        const localTime = Date.parse(local.updatedAt || "") || 0;
        const remoteTime = Date.parse(remote.updatedAt || "") || 0;
        const base = remoteTime > localTime ? { ...local, ...remote } : { ...remote, ...local };
        merged[id] = { ...base, findings };
    }
    return merged;
}

function projectsMapsDiffer(a = {}, b = {}) {
    try {
        return JSON.stringify(a) !== JSON.stringify(b);
    } catch {
        return true;
    }
}

// One-shot boot hydration: pull the durable on-disk projects, merge with what
// localStorage already loaded, and converge both sides. Safe no-op when the
// backend is down. Exported for explicit/test invocation; also auto-runs once
// at module load (see bottom of file).
let projectsHydrated = false;
export async function hydrateProjectsFromBackend() {
    if (projectsHydrated) return;
    projectsHydrated = true;
    let remote;
    try {
        remote = await fetchProjectsFromBackend();
    } catch {
        return; // backend optional / not running
    }
    const merged = mergeProjectsMaps(state.projects, remote || {});
    const changedLocally = projectsMapsDiffer(state.projects, merged);
    if (changedLocally) {
        state = { ...state, projects: merged };
        try { localStorage.setItem(LS_PROJECTS, JSON.stringify(merged)); } catch { /* noop */ }
        notify();
    }
    // Push the converged map back so the disk file gains any offline-created
    // findings (only when the merge added something the backend didn't have).
    if (projectsMapsDiffer(remote || {}, merged)) {
        saveProjectsToBackend(merged).catch(() => { /* retry on next change */ });
    }
}

function persistScenario() {
    try {
        localStorage.setItem(LS_SCENARIO, JSON.stringify(state.scenario));
    } catch {
        // Scenario is non-critical; session state is authoritative.
    }
}

function persistResultsBasis() {
    try {
        localStorage.setItem(LS_RESULTS_BASIS, state.resultsBasis);
    } catch {
        // Results Basis is non-critical; session state is authoritative.
    }
}

function persistAccountSettings() {
    try {
        localStorage.setItem(LS_ACCOUNT_SETTINGS, JSON.stringify(state.accountSettings));
    } catch {
        // Account settings are non-critical display prefs.
    }
}

function persistSessionProfiles() {
    try {
        localStorage.setItem(LS_SESSION_PROFILES, JSON.stringify(state.sessionProfiles));
    } catch {
        // Session profiles are a non-critical frontend-only overlay.
    }
}

// ── IndexedDB full-run-bundle persistence (Phase SP-2) ──────────────────────
// localStorage keeps an index-only manifest (unchanged). The full bundle —
// trades, variants, equity curves, order blocks, entry/protection results —
// is mirrored into the IndexedDB `runs` store so a refresh on the same origin
// restores full data without the sidecar. Candle arrays are intentionally NOT
// duplicated here (they live in the `candles` store and rehydrate separately).
const IDB_BUNDLE_SESSION_SAVED = new Set();

function bundleHasFullData(run) {
    if (!run) return false;
    return Boolean(
        (Array.isArray(run.trades) && run.trades.length)
        || Object.values(run.tradesByVariant || {}).some((t) => Array.isArray(t) && t.length)
        || Object.values(run.entryResults?.tradesByMode || {}).some((t) => Array.isArray(t) && t.length)
        || Object.values(run.protectionResults?.tradesByMode || {}).some((t) => Array.isArray(t) && t.length)
        || (Array.isArray(run.orderBlocks) && run.orderBlocks.length)
    );
}

// Drop the heavy candle array before persisting — candles are stored/rehydrated
// via the separate `candles` object store. Candle metadata fields are retained.
function stripBundleForIdb(bundle) {
    if (!bundle || typeof bundle !== "object") return bundle;
    return { ...bundle, candles: null };
}

function persistRunBundleToIdb(runId, bundle) {
    if (!runId || !bundle) return;
    // LARGE-RUN-IMPORT Phase 1 — never structured-clone a lazy/large bundle into
    // IndexedDB. Lazy runs carry only metadata + the primary variant; their heavy
    // collections load on demand from File handles / the sidecar, so persisting
    // the mirror adds little and risks a multi-second clone or quota blowup.
    if (bundle.lazy) return;
    // Only persist bundles that carry full data; index-only stubs add nothing
    // and would overwrite a previously-saved full bundle with an empty one.
    if (!bundleHasFullData(bundle)) return;
    idbSaveRunBundle(runId, stripBundleForIdb(bundle))
        .then(() => { IDB_BUNDLE_SESSION_SAVED.add(runId); })
        .catch((e) => {
            // Non-blocking: memory + localStorage index already hold the run.
            state = {
                ...state,
                candlePersistenceNotice: `Run kept in memory; IndexedDB bundle save failed for ${runId}: ${e?.message || e}.`,
            };
            notify();
        });
}

let __idbHydrationDone = false;

// Boot hydration: after loadIndexedRuns() restored index-only stubs, pull full
// bundles from IndexedDB and merge them in. Skips runs that already have full
// data in memory (just imported, or already reloaded from the sidecar) so it
// never clobbers fresher data. Active run/project/scenario are left untouched —
// only the runs map is enriched — and a single notify() re-renders subscribers.
async function hydrateRunsFromIndexedDB() {
    if (__idbHydrationDone) return;
    __idbHydrationDone = true;
    const ids = Object.keys(state.runs);
    if (!ids.length) return;
    let changed = false;
    for (const id of ids) {
        const current = state.runs[id];
        if (!current || bundleHasFullData(current)) continue;
        let record = null;
        try {
            record = await idbLoadRunBundle(id);
        } catch {
            record = null;
        }
        const saved = record?.bundle;
        if (!saved || !bundleHasFullData(saved)) continue;
        // Re-check liveness — state may have moved on during the await.
        const live = state.runs[id];
        if (!live || bundleHasFullData(live)) continue;
        const merged = {
            ...saved,
            id,
            // Candles rehydrate separately; preserve any already loaded into memory.
            candles: live.candles ?? null,
            displayName: live.displayName || saved.displayName,
            name: live.name || saved.name,
            projectId: live.projectId ?? saved.projectId,
            runRole: live.runRole || saved.runRole,
            experimentType: live.experimentType || saved.experimentType,
            reloadAvailable: live.reloadAvailable ?? saved.reloadAvailable ?? false,
            hasFullData: true,
            storageMode: "indexeddb_full",
            indexOnly: false,
            summary: { ...(saved.summary || {}), id },
        };
        state = { ...state, runs: { ...state.runs, [id]: merged } };
        IDB_BUNDLE_SESSION_SAVED.add(id);
        changed = true;
    }
    if (changed) notify();
}

// Kick off boot hydration immediately but non-blocking. The synchronous initial
// state already holds index-only stubs, so the app renders right away; full
// bundles merge in as they load.
if (typeof window !== "undefined") {
    Promise.resolve().then(() => hydrateRunsFromIndexedDB().catch(() => { /* best-effort */ }));
    // Pull the durable on-disk projects/insights and merge with localStorage so
    // saved insights survive browser-data clears. No-op if the backend is down.
    Promise.resolve().then(() => hydrateProjectsFromBackend().catch(() => { /* best-effort */ }));
}
