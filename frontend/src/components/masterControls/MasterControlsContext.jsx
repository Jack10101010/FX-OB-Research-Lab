import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
} from "react";
import { useDataset, getRunData, addRunBundle } from "@/data/store";
import { REGISTRY_BY_KEY, highestRerunTierForKeys } from "@/data/configRegistry";
import { buildRunConfigLoadReport, getDefaultBuilderConfig, buildBacktesterConfig } from "@/data/configTranslator";
import { startSidecarRun, getSidecarRun, getSidecarRunBundle, cancelSidecarRun } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";

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
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MasterControlsProvider({ children }) {

    // ── Drawer state ────────────────────────────────────────────────────────
    const [isOpen, setIsOpen] = useState(false);

    const openMasterControls  = useCallback(() => setIsOpen(true),            []);
    const closeMasterControls = useCallback(() => setIsOpen(false),           []);
    const toggleMasterControls = useCallback(() => setIsOpen((v) => !v),      []);

    // ── Store subscriptions ─────────────────────────────────────────────────
    const { activeRunId } = useDataset();

    // ── Draft config state ──────────────────────────────────────────────────
    // null  → no edits; the effective config falls back to activeConfig
    const [draftConfig, setDraftConfigState] = useState(null);

    // ── Preview state — Phase 4A ─────────────────────────────────────────────
    const [preview, setPreview] = useState(EMPTY_PREVIEW);

    // Reset draft AND preview whenever the active run changes
    useEffect(() => {
        setDraftConfigState(null);
        setPreview(EMPTY_PREVIEW);
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
        setPreview(EMPTY_PREVIEW);
    }, []);

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
        setPreview(EMPTY_PREVIEW);
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

        let cancelled = false;

        const doImport = async () => {
            setPreview((prev) => ({ ...prev, status: "importing" }));
            try {
                // Sidecar /runs/{id}/bundle returns { files: [{ name, content }] }
                const payload = await getSidecarRunBundle(jobId);
                const files = (payload.files || []).map(
                    (f) => new File([f.content || ""], f.name, { type: "text/plain" })
                );
                const result = await ingestRunBundle(files);

                if (cancelled) return;

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
                if (!cancelled) {
                    setPreview((prev) => ({
                        ...prev,
                        status: "failed",
                        error:  err?.message || "Preview import failed",
                    }));
                }
            }
        };

        doImport();
        return () => { cancelled = true; };
    }, [preview.status]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── previewIsStale — true when effectiveConfig has drifted since preview ─
    const previewIsStale = useMemo(() => {
        if (preview.status !== "done") return false;
        if (!preview.snapshotConfig || !effectiveConfig) return false;
        return JSON.stringify(preview.snapshotConfig) !== JSON.stringify(effectiveConfig);
    }, [preview.status, preview.snapshotConfig, effectiveConfig]);

    // ── Context value ────────────────────────────────────────────────────────

    const value = useMemo(() => ({
        // Drawer
        isOpen,
        openMasterControls,
        closeMasterControls,
        toggleMasterControls,
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
    }), [
        isOpen,
        openMasterControls,
        closeMasterControls,
        toggleMasterControls,
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
    ]);

    return (
        <MasterControlsContext.Provider value={value}>
            {children}
        </MasterControlsContext.Provider>
    );
}

export const useMasterControls = () => useContext(MasterControlsContext);
