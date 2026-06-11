import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
    useRef,
} from "react";
import {
    useDataset,
    getRunData,
    getRawRunData,
    addRunBundle,
    setPreviewLens,
    clearPreviewLens,
    getPreviewLens,
} from "@/data/store";
import { REGISTRY_BY_KEY, highestRerunTierForKeys } from "@/data/configRegistry";
import { buildRunConfigLoadReport, getDefaultBuilderConfig, buildBacktesterConfig } from "@/data/configTranslator";
import { startSidecarRun, getSidecarRun, getSidecarRunBundle, cancelSidecarRun } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";
import { isCostOnlyDirty, rescoreCostsForBundle, buildRescoredBundle, COST_KEYS } from "./costRescore";
import { isFilterOnlyDirty, buildTradePredicate, buildFilteredBundle, FILTER_KEYS } from "./tradeFilter";
import { buildFftPreviewBundle } from "./controlSwap";
import { canRescoreRr, rescoreRrForBundle, buildRrPreviewBundle } from "./rrRescore";
import { composePreviewBundle } from "./previewComposer";

// The single config key that drives the FFT preview lens (Phase 10B).
const FFT_DRAFT_KEY = "triggeredEdgeCancelOnFirstFailedTag";
// The single config key that drives the RR preview lens (Phase 11C).
const RR_DRAFT_KEY = "rr";

// Signature of a cost-only rescore (run id + cost values). Used so a manually-cleared
// temporary bundle isn't immediately rebuilt until the cost config or run changes.
function lensSignature(runId, cfg) {
    return JSON.stringify({
        runId: runId || null,
        spread: cfg?.spread ?? null,
        slippage: cfg?.slippage ?? null,
        commission: cfg?.commission ?? null,
    });
}

// Signature of a filter-only change (run id + the filter-relevant config fields). Used
// so a manually-cleared temporary filter bundle isn't rebuilt until the filter config
// or run changes (Phase 10A).
function filterSignature(runId, cfg) {
    return JSON.stringify({
        runId: runId || null,
        sessionFilter: cfg?.sessionFilter ?? null,
        london: cfg?.london ?? null,
        lull: cfg?.lull ?? null,
        newYork: cfg?.newYork ?? null,
        asia: cfg?.asia ?? null,
        outside: cfg?.outside ?? null,
        bosLong: cfg?.bosLong ?? null,
        bosShort: cfg?.bosShort ?? null,
        chochLong: cfg?.chochLong ?? null,
        chochShort: cfg?.chochShort ?? null,
        direction: cfg?.direction ?? null,
    });
}

// Signature of an FFT-only change (run id + the FFT field). Used so a manually-cleared
// temporary FFT bundle isn't rebuilt until the FFT toggle or run changes (Phase 10B).
function fftSignature(runId, cfg) {
    return JSON.stringify({
        runId: runId || null,
        [FFT_DRAFT_KEY]: cfg?.[FFT_DRAFT_KEY] ?? null,
    });
}

// Signature of an RR-only change (run id + the RR multiple). Used so a manually-cleared
// temporary RR bundle isn't rebuilt until the RR value or run changes (Phase 11C).
function rrSignature(runId, cfg) {
    return JSON.stringify({
        runId: runId || null,
        [RR_DRAFT_KEY]: cfg?.[RR_DRAFT_KEY] ?? null,
    });
}

// ─── Phase 12B-2 — composed preview ──────────────────────────────────────────
// The composed preview (previewComposer) combines the four instant transforms
// (Swap → Filter → RR → Cost) into ONE bundle. It covers the MIXED case the four
// single-kind lenses above cannot: more than one instant stage dirty at once
// (e.g. filter + cost, RR + cost, filter + FFT). Single-kind dirty sets are still
// handled by their dedicated lens, so this never fights them.
//
// The full set of instant-previewable draft keys (union of the four lens key-sets).
// A dirty set is composer-eligible only when EVERY dirty field is in here AND at
// least two distinct stage kinds are dirty. stopBuffer / entryBuffer and any
// backend-tier field are intentionally absent (they need a real rerun).
const COMPOSED_INSTANT_KEYS = new Set([
    ...COST_KEYS,
    ...FILTER_KEYS,
    FFT_DRAFT_KEY,
    RR_DRAFT_KEY,
]);

// Combined signature across every instant field (run id + cost + filter + FFT + RR).
// Used so a manually-cleared composed bundle isn't rebuilt until one of the relevant
// fields or the run changes (mirrors the per-lens signatures above, unified).
function composedSignature(runId, cfg) {
    return JSON.stringify({
        runId: runId || null,
        spread: cfg?.spread ?? null,
        slippage: cfg?.slippage ?? null,
        commission: cfg?.commission ?? null,
        sessionFilter: cfg?.sessionFilter ?? null,
        london: cfg?.london ?? null,
        lull: cfg?.lull ?? null,
        newYork: cfg?.newYork ?? null,
        asia: cfg?.asia ?? null,
        outside: cfg?.outside ?? null,
        bosLong: cfg?.bosLong ?? null,
        bosShort: cfg?.bosShort ?? null,
        chochLong: cfg?.chochLong ?? null,
        chochShort: cfg?.chochShort ?? null,
        direction: cfg?.direction ?? null,
        [FFT_DRAFT_KEY]: cfg?.[FFT_DRAFT_KEY] ?? null,
        [RR_DRAFT_KEY]: cfg?.[RR_DRAFT_KEY] ?? null,
    });
}

// ── Unified preview-lens banner labels (Phase 12C-1) ─────────────────────────
// Single lenses use the bare stage name ("Cost", "Filter", "FFT OFF", "RR {value}").
// Composed lenses ALWAYS start with "Composed · " and never collapse to a single
// stage name, so the banner can never be confused with a single lens. Requested
// stages that did NOT apply (unavailable or no-op/skipped) are appended as "(… n/a)".
const COMPOSED_ORDER = ["fft", "filter", "rr", "cost"];
const COMPOSED_STAGE_BARE = { fft: "FFT", filter: "Filter", rr: "RR", cost: "Cost" };

/** Applied-stage display name, in canonical order (RR carries its target value). */
function composedStageAppliedName(stage, stages) {
    switch (stage) {
        case "fft":    return "FFT OFF";
        case "filter": return "Filter";
        case "rr":     return `RR ${stages?.rr?.rr ?? ""}`.trim();
        case "cost":   return "Cost";
        default:       return stage;
    }
}

/**
 * Build the composed banner label from a composePreviewBundle result, e.g.
 *   "Composed · Filter + Cost"
 *   "Composed · Filter (RR n/a)"
 *   "Composed · FFT OFF + Filter + RR 5 + Cost"
 */
function composedLabelFromResult(result) {
    if (!result) return "Composed";
    const stages = result.stages || {};
    const applied = COMPOSED_ORDER.filter((s) => (result.appliedStages || []).includes(s));
    const notApplied = COMPOSED_ORDER.filter((s) =>
        (result.unavailableStages || []).includes(s) || (result.skippedStages || []).includes(s));
    const body = applied.map((s) => composedStageAppliedName(s, stages)).join(" + ") || "—";
    const na = notApplied.length
        ? ` (${notApplied.map((s) => `${COMPOSED_STAGE_BARE[s] || s} n/a`).join(", ")})`
        : "";
    return `Composed · ${body}${na}`;
}

// ─── Preview state ────────────────────────────────────────────────────────────
// Allowed statuses:
//   "idle" | "queued" | "running" | "completed" | "importing" | "done" | "failed"
// The preview bundle is stored here only — never passed to addRunBundle / store.
// activeRunId is never modified by preview operations.

const EMPTY_PREVIEW = {
    status:         "idle",
    job:            null,
    bundle:         null,
    error:          "",
    startedAt:      null,
    snapshotConfig: null,
};

// ─── Context default (shape only — values are overridden by the Provider) ────

const MasterControlsContext = createContext({
    // Drawer open/close
    isOpen:               false,
    openMasterControls:   () => {},
    closeMasterControls:  () => {},
    toggleMasterControls: () => {},
    // Dock mode — when true the drawer is non-modal (no backdrop) so the page
    // stays interactive while it's open; persisted. Default false (modal).
    docked:               false,
    toggleDock:           () => {},

    // Config state
    activeConfig:         null,   // cfg derived from the active run bundle, or null
    draftConfig:          null,   // user's in-progress edits, or null (no edits yet)
    effectiveConfig:      null,   // draftConfig ?? activeConfig ?? null

    // Dirty tracking
    dirtyFields:          new Set(),
    dirtyFieldList:       [],
    dirtyCount:           0,
    highestDirtyTier:     0,      // 0 = no dirty fields; 1/2/3 = tier of dirtiest field
    highestRerunTier:     null,   // Phase 6 — rerunTier of the dirtiest field, or null
    hasDirtyFields:       false,

    // Validation
    validationErrors:     {},     // { [cfgKey]: string }
    validationErrorList:  [],     // [{ key, label, message }]
    hasValidationErrors:  false,

    // Actions
    setDraftField:        () => {},
    resetDraft:           () => {},

    // Preview — Phase 4A
    preview:              EMPTY_PREVIEW,
    startPreview:         () => {},
    cancelPreview:        () => {},
    clearPreview:         () => {},
    previewIsStale:       false,
    // Promotion — Phase 4C
    promotePreview:       () => {},
    // Temporary cost-rescored bundle — Phase 7B (context-only; not stored/applied)
    localRescoreBundle:      null,
    clearLocalRescoreBundle: () => {},
    // Preview lens — Phase 8B (apply the temporary bundle to the whole app, read-only)
    previewLens:             null,
    applyLocalRescoreLens:   () => {},
    exitPreviewLens:         () => {},
    // Temporary instant-filter bundle — Phase 10A (session / structure / direction)
    localFilterBundle:       null,
    clearLocalFilterBundle:  () => {},
    applyLocalFilterLens:    () => {},
    // Temporary FFT ON/OFF preview bundle — Phase 10B (control-trade universe swap)
    localFftBundle:          null,
    fftPreviewUnavailable:   false,
    clearFftPreview:         () => {},
    applyFftPreviewLens:     () => {},
    // Temporary RR preview bundle — Phase 11C (stop-anchored RR rescore)
    localRrBundle:           null,
    rrPreviewUnavailable:    false,
    clearRrPreview:          () => {},
    applyRrPreviewLens:      () => {},
    // Composed preview bundle — Phase 12B-2 (mixed instant stages in one bundle)
    composedPreviewResult:   null,
    localComposedBundle:     null,
    clearComposedPreview:    () => {},
    applyComposedPreviewLens: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MasterControlsProvider({ children }) {

    // ── Drawer state ────────────────────────────────────────────────────────
    const [isOpen, setIsOpen] = useState(false);

    const openMasterControls  = useCallback(() => setIsOpen(true),            []);
    const closeMasterControls = useCallback(() => setIsOpen(false),           []);
    const toggleMasterControls = useCallback(() => setIsOpen((v) => !v),      []);

    // Dock mode (non-modal). Persisted; default false (modal, current behaviour).
    const [docked, setDockedState] = useState(() => {
        try { return localStorage.getItem("fxob_mc_docked_v1") === "true"; } catch { return false; }
    });
    const toggleDock = useCallback(() => setDockedState((prev) => {
        const next = !prev;
        try { localStorage.setItem("fxob_mc_docked_v1", String(next)); } catch { /* best-effort */ }
        return next;
    }), []);

    // ── Store subscriptions ─────────────────────────────────────────────────
    const { activeRunId } = useDataset();

    // ── Draft config state ──────────────────────────────────────────────────
    // null  → no edits; the effective config falls back to activeConfig
    const [draftConfig, setDraftConfigState] = useState(null);

    // ── Preview state — Phase 4A ─────────────────────────────────────────────
    const [preview, setPreview] = useState(EMPTY_PREVIEW);

    // Tracks which sidecar job_id the import effect has claimed. Used instead of a
    // per-effect `cancelled` flag so the effect can't cancel itself when its own
    // `setPreview(status:"importing")` re-runs it. Reset to null on clear/cancel/
    // active-run change so a superseded import never writes a stale "done".
    const importJobRef = useRef(null);

    // ── Phase 7B — temporary cost-rescored bundle ───────────────────────────
    // A bundle-shaped object built from the Phase 7A cost rescore. Held in context
    // ONLY — never added to the store / run list, never persisted, never promoted.
    // It is the bridge toward a future Preview Lens (Phase 8); no page reads it yet.
    const [localRescoreBundle, setLocalRescoreBundle] = useState(null);
    // Signature the user manually dismissed, so the auto-build effect doesn't rebuild
    // the same bundle until the cost config / run changes.
    const lensSuppressRef = useRef("");

    // ── Phase 10A — temporary instant-filter bundle ─────────────────────────
    // A bundle-shaped object built by filtering the active run's trades (session /
    // structure / direction). Held in context ONLY — never stored / persisted /
    // promoted. Applied to the app via the same Preview Lens as the cost rescore.
    const [localFilterBundle, setLocalFilterBundle] = useState(null);
    const filterSuppressRef = useRef("");

    // ── Phase 10B — temporary FFT ON/OFF preview bundle ─────────────────────
    // A bundle-shaped object that swaps the triggered-edge scenarios for their
    // FFT-OFF control counterparts. Held in context ONLY — never stored / persisted.
    // `fftPreviewUnavailable` (Phase 12C-1) is true when the FFT toggle is the sole
    // dirty field but no ON→OFF control swap is possible, so the drawer can explain
    // instead of silently rendering nothing.
    const [localFftBundle, setLocalFftBundle] = useState(null);
    const [fftPreviewUnavailable, setFftPreviewUnavailable] = useState(false);
    const fftSuppressRef = useRef("");

    // ── Phase 11C — temporary RR preview bundle ─────────────────────────────
    // A bundle-shaped object that re-targets every trade to a new RR multiple using
    // the backend's stop-anchored excursion fields. Held in context ONLY — never
    // stored / persisted. `rrPreviewUnavailable` is true when RR is being edited but
    // the run lacks the required fields (old bundles), so the drawer can explain.
    const [localRrBundle, setLocalRrBundle] = useState(null);
    const [rrPreviewUnavailable, setRrPreviewUnavailable] = useState(false);
    const rrSuppressRef = useRef("");

    // ── Phase 12B-2 — composed preview (mixed instant stages) ───────────────
    // Full result of composePreviewBundle ({ bundle, ok, appliedStages, stages, … }).
    // Built ONLY when the dirty set spans ≥2 instant stage kinds (the case the four
    // single lenses don't cover). Held in context ONLY — never stored / persisted.
    const [composedPreviewResult, setComposedPreviewResult] = useState(null);
    const composedSuppressRef = useRef("");

    // Reset draft AND preview whenever the active run changes
    useEffect(() => {
        setDraftConfigState(null);
        setPreview(EMPTY_PREVIEW);
        importJobRef.current = null;
        setLocalRescoreBundle(null);
        lensSuppressRef.current = "";
        setLocalFilterBundle(null);
        filterSuppressRef.current = "";
        setLocalFftBundle(null);
        setFftPreviewUnavailable(false);
        fftSuppressRef.current = "";
        setLocalRrBundle(null);
        setRrPreviewUnavailable(false);
        rrSuppressRef.current = "";
        setComposedPreviewResult(null);
        composedSuppressRef.current = "";
    }, [activeRunId]);

    // ── activeConfig — derived from the active run bundle ───────────────────
    // Depends only on activeRunId.  getRunData reads from mutable store state
    // at memo time, so it's always fresh when the ID changes or on first mount.
    const activeConfig = useMemo(() => {
        if (!activeRunId) return null;
        const bundle = getRunData(activeRunId);
        if (!bundle) return null;
        const defaultCfg = getDefaultBuilderConfig();
        try {
            const { config } = buildRunConfigLoadReport(defaultCfg, bundle);
            return config;
        } catch (err) {
            console.warn("[MasterControls] buildRunConfigLoadReport failed:", err);
            return defaultCfg;
        }
    }, [activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── effectiveConfig — draft if present, else active ─────────────────────
    const effectiveConfig = useMemo(
        () => draftConfig ?? activeConfig ?? null,
        [draftConfig, activeConfig],
    );

    // ── Dirty fields — keys that differ between draftConfig and activeConfig ─
    const dirtyFields = useMemo(() => {
        const dirty = new Set();
        if (!draftConfig || !activeConfig) return dirty;
        for (const key of Object.keys(draftConfig)) {
            const dv = draftConfig[key];
            const av = activeConfig[key];
            // Shallow comparison — arrays compared by JSON string
            const dvStr = Array.isArray(dv) ? JSON.stringify(dv) : String(dv ?? "");
            const avStr = Array.isArray(av) ? JSON.stringify(av) : String(av ?? "");
            if (dvStr !== avStr) dirty.add(key);
        }
        return dirty;
    }, [draftConfig, activeConfig]);

    const dirtyFieldList = useMemo(() => [...dirtyFields], [dirtyFields]);
    const dirtyCount = dirtyFields.size;
    const hasDirtyFields = dirtyCount > 0;

    const highestDirtyTier = useMemo(() => {
        let max = 0;
        for (const key of dirtyFields) {
            const entry = REGISTRY_BY_KEY[key];
            if (entry?.tier && entry.tier > max) max = entry.tier;
        }
        return max;
    }, [dirtyFields]);

    // ── highestRerunTier — Phase 6 ──────────────────────────────────────────
    // The rerunTier of the dirtiest changed field (precedence:
    // full_backtest > backend_rescore > frontend_rescore > instant_filter).
    // null when nothing is dirty. Classification only — does NOT change how
    // startPreview executes (still the sidecar preview path).
    const highestRerunTier = useMemo(
        () => highestRerunTierForKeys(dirtyFieldList),
        [dirtyFieldList],
    );

    // ── Validation — run only against user-edited (dirty) fields ────────────
    // Validating effectiveConfig (= activeConfig when no draft) causes false
    // positives: e.g. maxObSizePips has defaultValue 100 but validation.max 50,
    // so a freshly-loaded run always produces a spurious error.
    // Fix: when there is no draft, return empty immediately. When there is a
    // draft, only validate the keys the user actually changed.
    const validationErrors = useMemo(() => {
        if (!draftConfig || dirtyFields.size === 0) return {};
        const errors = {};
        for (const key of dirtyFields) {
            const value = draftConfig[key];
            const entry = REGISTRY_BY_KEY[key];
            if (!entry?.editable || !entry?.validation) continue;
            const { min, max } = entry.validation;
            const n = Number(value);
            if (!Number.isFinite(n)) continue; // non-numeric fields skip range check
            if (min != null && n < min) {
                errors[key] = `${entry.label} must be ≥ ${min}`;
            } else if (max != null && n > max) {
                errors[key] = `${entry.label} must be ≤ ${max}`;
            }
        }
        return errors;
    }, [draftConfig, dirtyFields]);

    const validationErrorList = useMemo(
        () => Object.entries(validationErrors).map(([key, message]) => ({
            key,
            label: REGISTRY_BY_KEY[key]?.label ?? key,
            message,
        })),
        [validationErrors],
    );

    const hasValidationErrors = validationErrorList.length > 0;

    // ── Actions ──────────────────────────────────────────────────────────────

    /**
     * Set a single field in the draft config.
     * Lazy-initialises draftConfig from effectiveConfig on first edit.
     */
    const setDraftField = useCallback((key, value) => {
        setDraftConfigState((prev) => {
            const base = prev ?? activeConfig ?? getDefaultBuilderConfig();
            return { ...base, [key]: value };
        });
    }, [activeConfig]);

    /**
     * Discard all draft edits, reverting to activeConfig.
     */
    const resetDraft = useCallback(() => {
        setDraftConfigState(null);
        setLocalRescoreBundle(null);
        lensSuppressRef.current = "";
        setLocalFilterBundle(null);
        filterSuppressRef.current = "";
        setLocalFftBundle(null);
        setFftPreviewUnavailable(false);
        fftSuppressRef.current = "";
        setLocalRrBundle(null);
        setRrPreviewUnavailable(false);
        rrSuppressRef.current = "";
        setComposedPreviewResult(null);
        composedSuppressRef.current = "";
    }, []);

    // ── Preview actions — Phase 4A ────────────────────────────────────────────

    /**
     * Start a preview run from the current effectiveConfig.
     * Guards: status must be "idle", no validation errors, effectiveConfig must exist.
     * The preview bundle is held in context only — addRunBundle is NEVER called.
     */
    const startPreview = useCallback(async () => {
        if (preview.status !== "idle") return;
        if (hasValidationErrors) return;
        if (!effectiveConfig) return;

        // Deep copy via JSON round-trip — cfg contains only plain primitives/arrays
        const snapshotConfig = JSON.parse(JSON.stringify(effectiveConfig));

        // Build full backend config from the frontend cfg state
        const fullConfig = buildBacktesterConfig(snapshotConfig);

        // Strip all keys beginning with "_" — matches StrategyBuilder dd44c84 behavior.
        // buildBacktesterConfig emits _entry_mode/_selected_entry_model which must NOT
        // be sent to the sidecar; they are frontend-only round-trip hints.
        const sidecarPayload = Object.fromEntries(
            Object.entries(fullConfig).filter(([k]) => !k.startsWith("_"))
        );

        try {
            const job = await startSidecarRun(sidecarPayload);
            setPreview({
                status:         "queued",
                job,
                bundle:         null,
                error:          "",
                startedAt:      new Date().toISOString(),
                snapshotConfig,
            });
        } catch (err) {
            setPreview({
                ...EMPTY_PREVIEW,
                status: "failed",
                error:  err?.message || String(err),
            });
        }
    }, [preview.status, hasValidationErrors, effectiveConfig]);

    /**
     * Clear preview state without server interaction.
     */
    const clearPreview = useCallback(() => {
        importJobRef.current = null;
        setPreview(EMPTY_PREVIEW);
        setLocalRescoreBundle(null);
        setLocalFilterBundle(null);
        setLocalFftBundle(null);
        setFftPreviewUnavailable(false);
        setLocalRrBundle(null);
        setRrPreviewUnavailable(false);
        setComposedPreviewResult(null);
    }, []);

    /**
     * Manually dismiss the temporary cost-rescored bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for the current rescore so it does not pop back
     * immediately; suppression lifts when the cost config or active run changes.
     */
    const clearLocalRescoreBundle = useCallback(() => {
        lensSuppressRef.current = lensSignature(activeRunId, effectiveConfig);
        setLocalRescoreBundle(null);
    }, [activeRunId, effectiveConfig]);

    /**
     * Manually dismiss the temporary instant-filter bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for this exact filter so it does not pop back
     * immediately; suppression lifts when the filter config or active run changes.
     */
    const clearLocalFilterBundle = useCallback(() => {
        filterSuppressRef.current = filterSignature(activeRunId, effectiveConfig);
        setLocalFilterBundle(null);
    }, [activeRunId, effectiveConfig]);

    /**
     * Manually dismiss the temporary FFT preview bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for this exact FFT toggle until it or the
     * active run changes.
     */
    const clearFftPreview = useCallback(() => {
        fftSuppressRef.current = fftSignature(activeRunId, effectiveConfig);
        setLocalFftBundle(null);
        setFftPreviewUnavailable(false);
    }, [activeRunId, effectiveConfig]);

    /**
     * Manually dismiss the temporary RR preview bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for this exact RR until it or the run changes.
     */
    const clearRrPreview = useCallback(() => {
        rrSuppressRef.current = rrSignature(activeRunId, effectiveConfig);
        setLocalRrBundle(null);
    }, [activeRunId, effectiveConfig]);

    /**
     * Manually dismiss the temporary composed bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for this exact combination of instant fields
     * until one of them or the active run changes (Phase 12B-2).
     */
    const clearComposedPreview = useCallback(() => {
        composedSuppressRef.current = composedSignature(activeRunId, effectiveConfig);
        setComposedPreviewResult(null);
    }, [activeRunId, effectiveConfig]);

    /**
     * Promote the completed preview bundle into a permanent run — Phase 4C.
     *
     * This is the ONE deliberate point where the preview bundle crosses into the
     * store. addRunBundle() does all the work: it assigns a unique run id (so it
     * never overwrites an existing run), inserts the bundle, switches activeRunId
     * to it, resets the selected variant + scenario, and persists. We then clear
     * the local preview state (the activeRunId change also resets draft/preview via
     * the effect above, but clearing explicitly keeps the transition deterministic).
     *
     * Guarded so it is a no-op unless a finished preview bundle exists. No compare,
     * project assignment, export, rename, or duplicate detection — see Phase 4C scope.
     */
    const promotePreview = useCallback(() => {
        if (preview.status !== "done" || !preview.bundle) return;
        addRunBundle(preview.bundle);
        setPreview(EMPTY_PREVIEW);
    }, [preview.status, preview.bundle]);

    /**
     * Cancel a queued/running preview.
     * cancelSidecarRun POSTs to /cancel/{runId}. The sidecar job object may carry
     * both run_id and job_id as distinct fields; the cancel endpoint uses run_id.
     * Mirror StrategyBuilder's resolution: prefer run_id, fallback to job_id (line 283).
     * Local state is always cleared regardless of server response.
     */
    const cancelPreview = useCallback(async () => {
        // Prefer run_id (cancel endpoint) over job_id (status/bundle endpoint)
        const cancelId = preview.job?.run_id || preview.job?.job_id;
        if (cancelId && (preview.status === "queued" || preview.status === "running")) {
            try {
                await cancelSidecarRun(cancelId);
            } catch (err) {
                // Best-effort — clear locally regardless of server response
                console.warn("[MasterControls] cancelSidecarRun failed:", err);
            }
        }
        // Neutralise any in-flight import so it cannot write a stale "done" after cancel.
        importJobRef.current = null;
        setPreview(EMPTY_PREVIEW);
        setLocalRescoreBundle(null);
        setLocalFilterBundle(null);
        setLocalFftBundle(null);
        setFftPreviewUnavailable(false);
        setLocalRrBundle(null);
        setRrPreviewUnavailable(false);
        setComposedPreviewResult(null);
    }, [preview.status, preview.job]);

    // ── Polling effect — drives "queued"/"running" → "completed"/"failed" ────
    useEffect(() => {
        const jobId = preview.job?.job_id;
        if (!jobId || (preview.status !== "queued" && preview.status !== "running")) return;

        const intervalId = setInterval(async () => {
            try {
                const latest = await getSidecarRun(jobId);
                const latestStatus = String(latest?.status || "").toLowerCase();

                setPreview((prev) => {
                    // Re-check inside setter to avoid acting on stale closure
                    if (prev.status !== "queued" && prev.status !== "running") return prev;

                    if (latestStatus === "completed" || latestStatus === "succeeded") {
                        return { ...prev, job: latest, status: "completed" };
                    }
                    if (latestStatus === "failed" || latestStatus === "error" || latestStatus === "cancelled") {
                        const errorText = latest?.stderr_tail || latest?.error || `Run ${latestStatus}`;
                        return { ...prev, job: latest, status: "failed", error: String(errorText) };
                    }
                    // Still in progress — update job metadata, render as "running"
                    return { ...prev, job: latest, status: "running" };
                });
            } catch (err) {
                setPreview((prev) => ({
                    ...prev,
                    status: "failed",
                    error:  err?.message || "Polling error",
                }));
            }
        }, 2000);

        return () => clearInterval(intervalId);
    }, [preview.status, preview.job?.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Import effect — drives "completed" → "importing" → "done"/"failed" ──
    useEffect(() => {
        if (preview.status !== "completed") return;
        const jobId = preview.job?.job_id;
        const snapshotConfig = preview.snapshotConfig;
        if (!jobId) return;

        // The first line of doImport sets status → "importing", which re-runs this
        // effect (deps: preview.status). Keying the import on jobId via importJobRef —
        // instead of a per-effect `cancelled` flag — makes that self-triggered re-run a
        // no-op here, so the final "done" transition is no longer skipped. Staleness is
        // detected by comparing importJobRef.current to jobId before any write (cancel /
        // clear / active-run change reset the ref to null).
        if (importJobRef.current === jobId) return;
        importJobRef.current = jobId;

        const doImport = async () => {
            setPreview((prev) => ({ ...prev, status: "importing" }));
            try {
                // Sidecar /runs/{id}/bundle returns { files: [{ name, content }] }
                const payload = await getSidecarRunBundle(jobId);
                const files = (payload.files || []).map(
                    (f) => new File([f.content || ""], f.name, { type: "text/plain" })
                );
                const result = await ingestRunBundle(files);

                // Stale-guard: cancel / clear / active-run change reset importJobRef to
                // null (or a different job id), so a superseded import never writes "done".
                if (importJobRef.current !== jobId) return;

                if (!result.ok) {
                    const msg = [
                        ...(result.validationErrors || []).map((e) => e.message || String(e)),
                        ...(result.errors || []).map((e) => e.error || String(e)),
                    ].filter(Boolean)[0] || "Preview bundle import failed";
                    setPreview((prev) => ({ ...prev, status: "failed", error: msg }));
                    return;
                }

                // Inject frontend-only metadata from snapshotConfig into bundle.config so
                // that buildRunConfigLoadReport can recover entryMode/selectedEntryModel
                // if this preview is later promoted to a real run (Phase 4C).
                // addRunBundle is NOT called — bundle stays in context only.
                if (result.bundle.config) {
                    if (snapshotConfig?._entry_mode !== undefined)
                        result.bundle.config._entry_mode = snapshotConfig._entry_mode;
                    if (snapshotConfig?._selected_entry_model !== undefined)
                        result.bundle.config._selected_entry_model = snapshotConfig._selected_entry_model;
                }

                setPreview((prev) => ({
                    ...prev,
                    status: "done",
                    bundle: result.bundle,
                }));
            } catch (err) {
                // Only surface the error if this import is still the current job.
                if (importJobRef.current === jobId) {
                    setPreview((prev) => ({
                        ...prev,
                        status: "failed",
                        error:  err?.message || "Preview import failed",
                    }));
                }
            }
        };

        doImport();
    }, [preview.status]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── previewIsStale — true when effectiveConfig has drifted since preview ─
    const previewIsStale = useMemo(() => {
        if (preview.status !== "done") return false;
        if (!preview.snapshotConfig || !effectiveConfig) return false;
        return JSON.stringify(preview.snapshotConfig) !== JSON.stringify(effectiveConfig);
    }, [preview.status, preview.snapshotConfig, effectiveConfig]);

    // ── Phase 7B build effect — keep localRescoreBundle in sync with the cost rescore ─
    // Builds the temporary bundle when the dirty set is cost-only AND an exact rescore
    // is available; clears it otherwise. This is the SOLE writer of localRescoreBundle
    // (plus the explicit resets above), so it covers every reset rule: active-run change,
    // resetDraft, dirty fields no longer cost-only, and exact-rescore-unavailable.
    // It never touches the store, addRunBundle, or persistence.
    useEffect(() => {
        const costOnly = highestRerunTier === "frontend_rescore" && isCostOnlyDirty(dirtyFieldList);
        if (!costOnly || !effectiveConfig || !activeRunId) {
            lensSuppressRef.current = "";
            setLocalRescoreBundle(null);
            return;
        }
        // Respect a manual dismissal of this exact rescore.
        if (lensSuppressRef.current === lensSignature(activeRunId, effectiveConfig)) return;

        const costs = {
            spread: effectiveConfig.spread,
            slippage: effectiveConfig.slippage,
            commission: effectiveConfig.commission,
        };
        // Phase 12C-1: compose from the RAW persisted run (lens-immune), matching the
        // filter / FFT / RR / composed builders. Cost rescore is gross-anchored so this
        // is behaviour-preserving; it just removes the getRunData divergence.
        const sourceBundle = getRawRunData(activeRunId);
        const result = sourceBundle ? rescoreCostsForBundle(sourceBundle, costs) : null;
        if (!result || !result.ok || !result.exact) {
            setLocalRescoreBundle(null);
            return;
        }
        setLocalRescoreBundle(buildRescoredBundle(sourceBundle, result, {
            costs,
            dirtyFields: dirtyFieldList,
            rerunTier: highestRerunTier,
        }));
    }, [activeRunId, dirtyFieldList, effectiveConfig, highestRerunTier]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 10A build effect — keep localFilterBundle in sync with the filter draft ─
    // Builds the temporary filtered bundle when the dirty set is filter-only (session /
    // structure / direction, all instant_filter tier) AND the resulting predicate is an
    // actual restriction; clears it otherwise. Sole writer of localFilterBundle (plus the
    // explicit resets above). Filters the RAW run bundle (lens-immune via getRawRunData)
    // so it never compounds with an already-applied lens. No store writes, no persistence.
    useEffect(() => {
        const filterOnly = highestRerunTier === "instant_filter" && isFilterOnlyDirty(dirtyFieldList);
        if (!filterOnly || !effectiveConfig || !activeRunId) {
            filterSuppressRef.current = "";
            setLocalFilterBundle(null);
            return;
        }
        // Respect a manual dismissal of this exact filter.
        if (filterSuppressRef.current === filterSignature(activeRunId, effectiveConfig)) return;

        const predicate = buildTradePredicate(effectiveConfig);
        if (!predicate.active) {
            setLocalFilterBundle(null);
            return;
        }
        const sourceBundle = getRawRunData(activeRunId);
        if (!sourceBundle) {
            setLocalFilterBundle(null);
            return;
        }
        setLocalFilterBundle(buildFilteredBundle(sourceBundle, predicate, {
            dirtyFields: dirtyFieldList,
            rerunTier: highestRerunTier,
        }));
    }, [activeRunId, dirtyFieldList, effectiveConfig, highestRerunTier]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 10B build effect — keep localFftBundle in sync with the FFT toggle ──
    // Builds the temporary FFT-OFF bundle when the ONLY dirty field is the FFT toggle
    // and an ON→OFF control swap is available; clears it otherwise. Sole writer of
    // localFftBundle (plus the explicit resets above). Builds from the RAW run bundle
    // (lens-immune) so it never compounds with an already-applied lens. buildFftPreviewBundle
    // returns null for no-op / unavailable (already OFF, no controls, no covered scenario),
    // which collapses to "no block shown". No store writes, no persistence.
    useEffect(() => {
        const fftOnly = dirtyFieldList.length === 1 && dirtyFields.has(FFT_DRAFT_KEY);
        if (!fftOnly || !effectiveConfig || !activeRunId) {
            fftSuppressRef.current = "";
            setLocalFftBundle(null);
            setFftPreviewUnavailable(false);
            return;
        }
        const sourceBundle = getRawRunData(activeRunId);
        if (!sourceBundle) {
            setLocalFftBundle(null);
            setFftPreviewUnavailable(false);
            return;
        }
        // buildFftPreviewBundle returns null for no-op / unavailable (already OFF, OFF→ON,
        // no controls, no covered scenario). Phase 12C-1: surface that as an explicit
        // "unavailable" state instead of silently rendering nothing.
        const bundle = buildFftPreviewBundle(sourceBundle, {
            fftEnabled: Boolean(effectiveConfig[FFT_DRAFT_KEY]),
        });
        if (!bundle) {
            setLocalFftBundle(null);
            setFftPreviewUnavailable(true);
            return;
        }
        setFftPreviewUnavailable(false);
        // Respect a manual dismissal of this exact FFT toggle.
        if (fftSuppressRef.current === fftSignature(activeRunId, effectiveConfig)) return;
        setLocalFftBundle(bundle);
    }, [activeRunId, dirtyFieldList, effectiveConfig]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 11C build effect — keep localRrBundle in sync with the RR target ───
    // Builds the stop-anchored RR preview when the ONLY dirty field is `rr` AND the run
    // carries the excursion fields. When `rr` is dirty but the fields are absent (old
    // bundles), it sets `rrPreviewUnavailable` so the drawer can explain instead of
    // silently doing nothing. Builds from the RAW run bundle (lens-immune). Sole writer
    // of localRrBundle (plus the explicit resets above). No store writes, no persistence.
    useEffect(() => {
        const rrOnly = dirtyFieldList.length === 1 && dirtyFields.has(RR_DRAFT_KEY);
        if (!rrOnly || !effectiveConfig || !activeRunId) {
            rrSuppressRef.current = "";
            setLocalRrBundle(null);
            setRrPreviewUnavailable(false);
            return;
        }
        const sourceBundle = getRawRunData(activeRunId);
        if (!sourceBundle) {
            setLocalRrBundle(null);
            setRrPreviewUnavailable(false);
            return;
        }
        if (!canRescoreRr(sourceBundle)) {
            // RR edited but this run predates the Phase 11A export → unavailable.
            setLocalRrBundle(null);
            setRrPreviewUnavailable(true);
            return;
        }
        setRrPreviewUnavailable(false);
        if (rrSuppressRef.current === rrSignature(activeRunId, effectiveConfig)) return;

        const rrResult = rescoreRrForBundle(sourceBundle, { rr: effectiveConfig[RR_DRAFT_KEY] });
        if (!rrResult.ok) {
            setLocalRrBundle(null);
            return;
        }
        setLocalRrBundle(buildRrPreviewBundle(sourceBundle, rrResult, {
            rr: effectiveConfig[RR_DRAFT_KEY],
            dirtyFields: dirtyFieldList,
            rerunTier: highestRerunTier,
        }));
    }, [activeRunId, dirtyFieldList, effectiveConfig, highestRerunTier]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 12B-2 build effect — keep composedPreviewResult in sync (mixed only) ─
    // Builds the composed preview ONLY when the dirty set is fully instant AND spans ≥2
    // stage kinds (cost / filter / FFT / RR) — the case none of the four single lenses
    // above handle (each requires its own kind exclusively). For single-kind dirty sets
    // this stays null, leaving those lenses untouched. Composes from the RAW run bundle
    // (lens-immune) so it never compounds with an already-applied lens. Passes ONLY the
    // dirty stages' inputs, so a non-dirty stage is never spuriously applied. The composer
    // degrades per stage (unavailable RR/cost/FFT are skipped, not fatal). No store writes,
    // no addRunBundle, no setActiveRunId, no persistence. Sole writer of composedPreviewResult
    // (plus the explicit resets above).
    useEffect(() => {
        const costDirty   = dirtyFieldList.some((k) => COST_KEYS.includes(k));
        const filterDirty = dirtyFieldList.some((k) => FILTER_KEYS.includes(k));
        const fftDirty    = dirtyFields.has(FFT_DRAFT_KEY);
        const rrDirty     = dirtyFields.has(RR_DRAFT_KEY);
        const stageKinds  = [costDirty, filterDirty, fftDirty, rrDirty].filter(Boolean).length;
        const instantOnly = dirtyFieldList.length > 0
            && dirtyFieldList.every((k) => COMPOSED_INSTANT_KEYS.has(k));

        if (!instantOnly || stageKinds < 2 || !effectiveConfig || !activeRunId) {
            composedSuppressRef.current = "";
            setComposedPreviewResult(null);
            return;
        }
        // Respect a manual dismissal of this exact combination.
        if (composedSuppressRef.current === composedSignature(activeRunId, effectiveConfig)) return;

        const sourceBundle = getRawRunData(activeRunId);
        if (!sourceBundle) {
            setComposedPreviewResult(null);
            return;
        }

        // Pass only the dirty stages so a non-dirty stage is never applied.
        const input = { dirtyFields: dirtyFieldList, rerunTier: highestRerunTier };
        if (filterDirty) input.filters = effectiveConfig;
        if (fftDirty)    input.fft = { fftEnabled: Boolean(effectiveConfig[FFT_DRAFT_KEY]) };
        if (rrDirty)     input.rr = effectiveConfig[RR_DRAFT_KEY];
        if (costDirty)   input.costs = {
            spread: effectiveConfig.spread,
            slippage: effectiveConfig.slippage,
            commission: effectiveConfig.commission,
        };

        setComposedPreviewResult(composePreviewBundle(sourceBundle, input));
    }, [activeRunId, dirtyFieldList, effectiveConfig, highestRerunTier]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 8B — apply the temporary bundle to the whole app via the store lens ─
    // `previewLens` is read live from the store. The context re-renders on every store
    // notify() (it subscribes through useDataset above), so this read stays fresh.
    const previewLens = getPreviewLens();

    /** Apply the temporary cost-rescored bundle as a read-only Preview Lens. */
    const applyLocalRescoreLens = useCallback(() => {
        if (!localRescoreBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localRescoreBundle,
            mode: "local_rescore",
            label: "Cost",
        });
    }, [localRescoreBundle, activeRunId]);

    /** Exit the Preview Lens. Leaves draft + localRescoreBundle intact. */
    const exitPreviewLens = useCallback(() => {
        clearPreviewLens();
    }, []);

    // Keep OUR lens in sync with localRescoreBundle: re-push when the bundle changes, and
    // exit when the rescore goes away (non-cost-dirty / unavailable / reset / run switch).
    // Only manages the "local_rescore" lens; never touches a lens of another mode.
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "local_rescore") return;
        if (!localRescoreBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localRescoreBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localRescoreBundle,
                mode: "local_rescore",
                label: "Cost",
            });
        }
    }, [localRescoreBundle, activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 10A — apply the temporary filtered bundle via the same store lens ─
    /** Apply the temporary instant-filter bundle as a read-only Preview Lens. */
    const applyLocalFilterLens = useCallback(() => {
        if (!localFilterBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localFilterBundle,
            mode: "instant_filter",
            label: "Filter",
        });
    }, [localFilterBundle, activeRunId]);

    // Keep OUR filter lens in sync with localFilterBundle, mirroring the cost lens above.
    // Only manages the "instant_filter" lens — never touches a lens of another mode, so a
    // cost lens and a filter lens can't fight: each sync clears/repushes only its own kind,
    // and applying one mode overwrites the single store lens cleanly.
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "instant_filter") return;
        if (!localFilterBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localFilterBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localFilterBundle,
                mode: "instant_filter",
                label: "Filter",
            });
        }
    }, [localFilterBundle, activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 10B — apply the temporary FFT-OFF bundle via the same store lens ───
    /** Apply the temporary FFT preview bundle as a read-only Preview Lens. */
    const applyFftPreviewLens = useCallback(() => {
        if (!localFftBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localFftBundle,
            mode: "fft_swap",
            label: "FFT OFF",
        });
    }, [localFftBundle, activeRunId]);

    // Keep OUR FFT lens in sync with localFftBundle, mirroring the cost/filter lenses.
    // Only manages the "fft_swap" lens — never touches a lens of another mode, so the
    // cost, filter and FFT lenses can't fight: each sync clears/repushes only its own
    // kind, and applying one mode overwrites the single store lens cleanly.
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "fft_swap") return;
        if (!localFftBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localFftBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localFftBundle,
                mode: "fft_swap",
                label: "FFT OFF",
            });
        }
    }, [localFftBundle, activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 11C — apply the temporary RR preview bundle via the same store lens ─
    /** Apply the temporary RR-re-targeted bundle as a read-only Preview Lens. */
    const applyRrPreviewLens = useCallback(() => {
        if (!localRrBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localRrBundle,
            mode: "rr_rescore",
            label: `RR ${effectiveConfig?.[RR_DRAFT_KEY] ?? ""}`.trim(),
        });
    }, [localRrBundle, activeRunId, effectiveConfig]);

    // Keep OUR RR lens in sync with localRrBundle, mirroring the cost/filter/FFT lenses.
    // Only manages the "rr_rescore" lens — never touches a lens of another mode.
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "rr_rescore") return;
        if (!localRrBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localRrBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localRrBundle,
                mode: "rr_rescore",
                label: `RR ${effectiveConfig?.[RR_DRAFT_KEY] ?? ""}`.trim(),
            });
        }
    }, [localRrBundle, activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 12B-2 — derive the composed bundle + label from the result ─────────
    // The applyable bundle exists only when at least one stage applied (result.ok).
    // When nothing applied (e.g. every requested stage was unavailable) we keep the
    // result for its stage warnings but expose no bundle, so there is nothing to Apply.
    const localComposedBundle = useMemo(
        () => (composedPreviewResult?.ok ? composedPreviewResult.bundle : null),
        [composedPreviewResult],
    );
    const composedLabel = useMemo(
        () => composedLabelFromResult(composedPreviewResult),
        [composedPreviewResult],
    );

    /** Apply the temporary composed bundle as a read-only Preview Lens (mode "composed"). */
    const applyComposedPreviewLens = useCallback(() => {
        if (!localComposedBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localComposedBundle,
            mode: "composed",
            label: composedLabel,
        });
    }, [localComposedBundle, activeRunId, composedLabel]);

    // Keep OUR composed lens in sync with localComposedBundle, mirroring the four lenses
    // above. Only manages the "composed" lens — never touches a lens of another mode, so
    // the composed lens and the four single-mode lenses can't fight: each sync clears /
    // repushes only its own kind, and applying one mode overwrites the single store lens.
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "composed") return;
        if (!localComposedBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localComposedBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localComposedBundle,
                mode: "composed",
                label: composedLabel,
            });
        }
    }, [localComposedBundle, activeRunId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Context value ────────────────────────────────────────────────────────

    const value = useMemo(() => ({
        // Drawer
        isOpen,
        openMasterControls,
        closeMasterControls,
        toggleMasterControls,
        docked,
        toggleDock,
        // Config
        activeConfig,
        draftConfig,
        effectiveConfig,
        // Dirty
        dirtyFields,
        dirtyFieldList,
        dirtyCount,
        highestDirtyTier,
        highestRerunTier,
        hasDirtyFields,
        // Validation
        validationErrors,
        validationErrorList,
        hasValidationErrors,
        // Actions
        setDraftField,
        resetDraft,
        // Preview — Phase 4A
        preview,
        startPreview,
        cancelPreview,
        clearPreview,
        previewIsStale,
        // Promotion — Phase 4C
        promotePreview,
        // Temporary rescored bundle — Phase 7B
        localRescoreBundle,
        clearLocalRescoreBundle,
        // Preview lens — Phase 8B
        previewLens,
        applyLocalRescoreLens,
        exitPreviewLens,
        // Instant filter lens — Phase 10A
        localFilterBundle,
        clearLocalFilterBundle,
        applyLocalFilterLens,
        // FFT preview lens — Phase 10B
        localFftBundle,
        fftPreviewUnavailable,
        clearFftPreview,
        applyFftPreviewLens,
        // RR preview lens — Phase 11C
        localRrBundle,
        rrPreviewUnavailable,
        clearRrPreview,
        applyRrPreviewLens,
        // Composed preview lens — Phase 12B-2
        composedPreviewResult,
        localComposedBundle,
        clearComposedPreview,
        applyComposedPreviewLens,
    }), [
        isOpen,
        openMasterControls,
        closeMasterControls,
        toggleMasterControls,
        docked,
        toggleDock,
        activeConfig,
        draftConfig,
        effectiveConfig,
        dirtyFields,
        dirtyFieldList,
        dirtyCount,
        highestDirtyTier,
        highestRerunTier,
        hasDirtyFields,
        validationErrors,
        validationErrorList,
        hasValidationErrors,
        setDraftField,
        resetDraft,
        preview,
        startPreview,
        cancelPreview,
        clearPreview,
        previewIsStale,
        promotePreview,
        localRescoreBundle,
        clearLocalRescoreBundle,
        previewLens,
        applyLocalRescoreLens,
        exitPreviewLens,
        localFilterBundle,
        clearLocalFilterBundle,
        applyLocalFilterLens,
        localFftBundle,
        fftPreviewUnavailable,
        clearFftPreview,
        applyFftPreviewLens,
        localRrBundle,
        rrPreviewUnavailable,
        clearRrPreview,
        applyRrPreviewLens,
        composedPreviewResult,
        localComposedBundle,
        clearComposedPreview,
        applyComposedPreviewLens,
        composedLabel,
    ]);

    return (
        <MasterControlsContext.Provider value={value}>
            {children}
        </MasterControlsContext.Provider>
    );
}

export const useMasterControls = () => useContext(MasterControlsContext);
