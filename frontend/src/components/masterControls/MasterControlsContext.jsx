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
    getRawTradeDataToken,
    addRunBundle,
    setPreviewLens,
    clearPreviewLens,
    getPreviewLens,
} from "@/data/store";
import { REGISTRY_BY_KEY, highestRerunTierForKeys } from "@/data/configRegistry";
import { buildRunConfigLoadReport, getDefaultBuilderConfig, buildBacktesterConfig } from "@/data/configTranslator";
import { startSidecarRun, getSidecarRun, getSidecarRunBundle, cancelSidecarRun } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";
// Phase 13: the composer is the single preview build path. The four single-kind
// builders (buildRescoredBundle / buildFilteredBundle / buildFftPreviewBundle /
// buildRrPreviewBundle) are no longer invoked here — only COST_KEYS / FILTER_KEYS
// (for dirty-set classification) remain imported.
import { COST_KEYS } from "./costRescore";
import { FILTER_KEYS } from "./tradeFilter";
import { composePreviewBundle } from "./previewComposer";

// The single config key that drives the FFT preview lens (Phase 10B).
const FFT_DRAFT_KEY = "triggeredEdgeCancelOnFirstFailedTag";
// The single config key that drives the RR preview lens (Phase 11C).
const RR_DRAFT_KEY = "rr";

// ─── Phase 13 — single composer-driven preview ───────────────────────────────
// The composer (previewComposer) is now the SOLE preview build path. It combines
// the four instant transforms (Swap → Filter → RR → Cost) into ONE bundle and
// handles every dirty-set size from a single stage kind up to all four. The old
// per-kind signatures/build-effects/lenses (cost / filter / FFT / RR) have been
// removed; only the unified composed signature below survives.
//
// The full set of instant-previewable draft keys (union of the four stage key-sets).
// A dirty set is composer-eligible only when EVERY dirty field is in here. stopBuffer /
// entryBuffer and any backend-tier field are intentionally absent (they need a rerun).
const COMPOSED_INSTANT_KEYS = new Set([
    ...COST_KEYS,
    ...FILTER_KEYS,
    FFT_DRAFT_KEY,
    RR_DRAFT_KEY,
]);

// Combined signature across every instant field (run id + cost + filter + FFT + RR).
// Used so a manually-cleared composed bundle isn't rebuilt until one of the relevant
// fields or the run changes (mirrors the per-lens signatures above, unified).
function composedSignature(runId, cfg, rawDataToken = "") {
    return JSON.stringify({
        runId: runId || null,
        // LAZY-SNAPSHOT-FIX — RAW trade-data token so the signature (and the manual
        // suppression keyed on it) changes when lazy variant rows merge, forcing a
        // recompose instead of serving a stale preview-lens snapshot.
        rawDataToken: rawDataToken || null,
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
    // Preview lens — Phase 8B (apply the temporary bundle to the whole app, read-only)
    previewLens:             null,
    exitPreviewLens:         () => {},
    // Composed preview — Phase 13 (the SOLE preview path: cost / filter / FFT / RR / mixed,
    // composed into one bundle and applied via the single "preview" lens)
    composedPreviewResult:   null,
    localComposedBundle:     null,
    composedLabel:           "",
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

    // LAZY-SNAPSHOT-FIX — recomputed each render (the context re-renders on every
    // store notify, including lazy variant merges). Feeds the composed-preview
    // build effect + suppression signature so the preview lens recomposes when the
    // active run's RAW trade rows change, instead of serving a stale snapshot.
    const rawDataToken = getRawTradeDataToken(activeRunId);

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

    // ── Phase 13 — single composed preview state ────────────────────────────
    // Full result of composePreviewBundle ({ bundle, ok, appliedStages, stages, … }).
    // The composer is the SOLE preview build path now: this one state serves cost /
    // filter / FFT / RR and any mixed combination. Held in context ONLY — never added
    // to the store / run list, never persisted, never promoted. `composedSuppressRef`
    // holds a signature the user manually dismissed, so the auto-build effect doesn't
    // rebuild the same preview until one of the instant fields or the run changes.
    const [composedPreviewResult, setComposedPreviewResult] = useState(null);
    const composedSuppressRef = useRef("");

    // Reset draft AND preview whenever the active run changes
    useEffect(() => {
        setDraftConfigState(null);
        setPreview(EMPTY_PREVIEW);
        importJobRef.current = null;
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
        setComposedPreviewResult(null);
    }, []);

    /**
     * Manually dismiss the temporary composed bundle (drawer "Clear" button).
     * Suppresses the auto-build effect for this exact combination of instant fields
     * until one of them or the active run changes (Phase 12B-2).
     */
    const clearComposedPreview = useCallback(() => {
        composedSuppressRef.current = composedSignature(activeRunId, effectiveConfig, rawDataToken);
        setComposedPreviewResult(null);
    }, [activeRunId, effectiveConfig, rawDataToken]);

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

    // ── Phase 13 build effect — keep composedPreviewResult in sync (the SOLE path) ─
    // Builds the composed preview whenever the dirty set is fully instant (every dirty
    // field is in COMPOSED_INSTANT_KEYS), for ANY number of dirty stage kinds — one
    // (cost-only / filter-only / FFT-only / RR-only) through all four. This single effect
    // replaces the four former per-kind build effects. Composes from the RAW run bundle
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
        const instantOnly = dirtyFieldList.length > 0
            && dirtyFieldList.every((k) => COMPOSED_INSTANT_KEYS.has(k));

        if (!instantOnly || !effectiveConfig || !activeRunId) {
            composedSuppressRef.current = "";
            setComposedPreviewResult(null);
            return;
        }
        // Respect a manual dismissal of this exact combination (incl. raw-data
        // state, so a dismissal from a pre-lazy-load snapshot doesn't block the
        // recompose once new variant rows arrive).
        if (composedSuppressRef.current === composedSignature(activeRunId, effectiveConfig, rawDataToken)) return;

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
        // LAZY-SNAPSHOT-FIX — rawDataToken added so a lazy variant/row merge into
        // the RAW store re-runs this effect and recomposes the lens (it composes
        // from getRawRunData, which now carries the freshly-loaded rows).
    }, [activeRunId, dirtyFieldList, effectiveConfig, highestRerunTier, rawDataToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Phase 8B — apply the temporary bundle to the whole app via the store lens ─
    // `previewLens` is read live from the store. The context re-renders on every store
    // notify() (it subscribes through useDataset above), so this read stays fresh.
    const previewLens = getPreviewLens();

    /** Exit the Preview Lens. Leaves the draft + composed preview intact. */
    const exitPreviewLens = useCallback(() => {
        clearPreviewLens();
    }, []);

    // ── Phase 13 — derive the composed bundle + label from the result ────────────
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

    /** Apply the composed bundle as the single read-only Preview Lens (mode "preview"). */
    const applyComposedPreviewLens = useCallback(() => {
        if (!localComposedBundle || !activeRunId) return;
        setPreviewLens({
            sourceRunId: activeRunId,
            bundle: localComposedBundle,
            mode: "preview",
            label: composedLabel,
        });
    }, [localComposedBundle, activeRunId, composedLabel]);

    // Keep the single preview lens in sync with localComposedBundle. Phase 13: there is
    // now ONE lens mode ("preview"); this effect manages it exclusively — re-pushing when
    // the bundle changes and clearing it when the preview goes away (no longer instant-
    // dirty / unavailable / reset / run switch).
    useEffect(() => {
        const lens = getPreviewLens();
        if (!lens || lens.mode !== "preview") return;
        if (!localComposedBundle || !activeRunId || lens.sourceRunId !== activeRunId) {
            clearPreviewLens();
            return;
        }
        if (lens.bundle !== localComposedBundle) {
            setPreviewLens({
                sourceRunId: activeRunId,
                bundle: localComposedBundle,
                mode: "preview",
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
        // Preview lens — Phase 8B / 13 (single composed preview applied app-wide)
        previewLens,
        exitPreviewLens,
        // Composed preview — Phase 13 (the SOLE preview path: cost / filter / FFT / RR / mixed)
        composedPreviewResult,
        localComposedBundle,
        composedLabel,
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
        previewLens,
        exitPreviewLens,
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
