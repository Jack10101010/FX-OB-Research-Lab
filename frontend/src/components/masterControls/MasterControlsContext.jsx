import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useEffect,
} from "react";
import { useDataset, getRunData } from "@/data/store";
import { REGISTRY_BY_KEY } from "@/data/configRegistry";
import { buildRunConfigLoadReport, getDefaultBuilderConfig } from "@/data/configTranslator";

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
    hasDirtyFields:       false,

    // Validation
    validationErrors:     {},     // { [cfgKey]: string }
    validationErrorList:  [],     // [{ key, label, message }]
    hasValidationErrors:  false,

    // Actions
    setDraftField:        () => {},
    resetDraft:           () => {},
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

    // Reset draft whenever the active run changes
    useEffect(() => {
        setDraftConfigState(null);
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
        hasDirtyFields,
        // Validation
        validationErrors,
        validationErrorList,
        hasValidationErrors,
        // Actions
        setDraftField,
        resetDraft,
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
        hasDirtyFields,
        validationErrors,
        validationErrorList,
        hasValidationErrors,
        setDraftField,
        resetDraft,
    ]);

    return (
        <MasterControlsContext.Provider value={value}>
            {children}
        </MasterControlsContext.Provider>
    );
}

export const useMasterControls = () => useContext(MasterControlsContext);
