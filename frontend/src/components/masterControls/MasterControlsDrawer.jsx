import React, { useState, useMemo, useEffect } from "react";
import { X, SlidersHorizontal, Database, Layers, Zap, GitBranch, Activity, Settings2, Play, AlertTriangle } from "lucide-react";
import { useMasterControls } from "./MasterControlsContext";
import { CONFIG_REGISTRY, getVisibleEntries } from "@/data/configRegistry";
import { useDataset } from "@/data/store";

// ─── Registry summary (static — computed once at module load) ────────────────

const GROUP_ORDER = ["core", "structure", "execution", "entry", "protection", "session", "news", "cost"];

const GROUP_LABELS = {
    core:       "Core",
    structure:  "Structure",
    execution:  "Execution",
    entry:      "Entry",
    protection: "Protection",
    session:    "Session",
    news:       "News",
    cost:       "Cost",
};

const REGISTRY_SUMMARY = (() => {
    const total      = CONFIG_REGISTRY.length;
    const emitted    = CONFIG_REGISTRY.filter((e) => e.emitted).length;
    const byGroup    = {};
    const byTier     = { 1: 0, 2: 0, 3: 0 };

    for (const entry of CONFIG_REGISTRY) {
        byGroup[entry.group] = (byGroup[entry.group] || 0) + 1;
        if (entry.tier >= 1 && entry.tier <= 3) byTier[entry.tier]++;
    }

    return { total, emitted, notEmitted: total - emitted, byGroup, byTier };
})();

const TIER_META = {
    1: { label: "Tier 1 — Frontend filter",   desc: "No rerun required" },
    2: { label: "Tier 2 — Rescore candidate", desc: "Rerun optional" },
    3: { label: "Tier 3 — Full rerun",        desc: "Rerun required" },
};

// ─── Phase 3E — safe editable subset ─────────────────────────────────────────

/**
 * Only keys in this set receive editable controls in the drawer.
 * All other fields remain read-only regardless of edit mode.
 */
const SAFE_EDITABLE_SUBSET = new Set([
    // Execution — Tier 2 (rescore, no full rerun)
    "rr",
    "stopBuffer",
    "entryBuffer",
    // Cost — Tier 2
    "spread",
    "slippage",
    "commission",
    // Session chips — Tier 1 (frontend filter only)
    "london",
    "lull",
    "newYork",
    "asia",
    "outside",
]);

// ─── Config view helpers ──────────────────────────────────────────────────────

/**
 * Build a list of { group, subgroups: [{ subgroup, entries }] } for the
 * config overview, respecting the showAdvanced toggle.
 */
function buildGroupedConfig(showAdvanced) {
    const visible = getVisibleEntries(showAdvanced);
    const result  = [];
    for (const group of GROUP_ORDER) {
        const groupEntries = visible.filter((e) => e.group === group);
        if (groupEntries.length === 0) continue;
        const seen = new Map(); // subgroup → entry[]
        for (const entry of groupEntries) {
            const sg = entry.subgroup ?? null;
            if (!seen.has(sg)) seen.set(sg, []);
            seen.get(sg).push(entry);
        }
        result.push({
            group,
            subgroups: [...seen.entries()].map(([sg, entries]) => ({ subgroup: sg, entries })),
        });
    }
    return result;
}

/** Format a cfg value for display in read-only mode. */
function fmtCfgValue(v) {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Enabled" : "Disabled";
    if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "—";
    const s = String(v);
    return s === "" ? "—" : s;
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function MasterControlsDrawer() {
    const {
        isOpen, closeMasterControls,
        activeConfig, effectiveConfig,
        dirtyFields,
        dirtyCount, highestDirtyTier, hasDirtyFields,
        validationErrors, validationErrorList, hasValidationErrors,
        setDraftField, resetDraft,
        preview, startPreview, cancelPreview, clearPreview, previewIsStale,
    } = useMasterControls();
    const { activeRunId } = useDataset();

    // Local toggles
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showEditMode, setShowEditMode] = useState(false);

    // Grouped registry entries — recomputed only when the advanced toggle changes
    const groupedConfig = useMemo(() => buildGroupedConfig(showAdvanced), [showAdvanced]);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50"
                    onClick={closeMasterControls}
                />
            )}

            {/* Slide-over panel */}
            <div
                data-testid="master-controls-drawer"
                aria-label="Research Control Plane"
                className={[
                    "fixed inset-y-0 right-0 z-50 flex flex-col w-96",
                    "bg-[hsl(var(--bg-2)/0.97)] border-l border-[hsl(var(--border-soft))]",
                    "backdrop-blur-xl shadow-2xl font-ui",
                    "transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full",
                ].join(" ")}
            >
                {/* Header */}
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[hsl(var(--border-soft))] flex-shrink-0">
                    <SlidersHorizontal size={14} className="text-[hsl(var(--accent-primary))] shrink-0" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-title-lab">
                        Research Control Plane
                    </span>
                    <button
                        type="button"
                        onClick={closeMasterControls}
                        aria-label="Close master controls"
                        className="ml-auto p-1.5 rounded text-muted-lab hover:text-white hover:bg-[hsl(var(--panel))] transition-colors"
                    >
                        <X size={13} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-6">

                    {/* ── 1. Active Run ────────────────────────────────────── */}
                    <section>
                        <SectionLabel icon={<Zap size={11} />} label="Active Run" />
                        <div className="mt-2 px-3 py-2.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.5)]">
                            {activeRunId ? (
                                <>
                                    <p className="text-[11px] text-[hsl(var(--accent-primary))] font-mono truncate">{activeRunId}</p>
                                    <p className="text-[10px] text-muted-lab mt-0.5">
                                        {activeConfig ? "Config loaded" : "Config unavailable"}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-lab">No active run — import a bundle via the toolbar</p>
                            )}
                        </div>
                    </section>

                    {/* ── 2. Draft State — Phase 3C/3F debug readout ───────── */}
                    <section>
                        <SectionLabel icon={<Activity size={11} />} label="Draft State" />
                        <div className="mt-2 space-y-1.5">
                            <StatusRow label="Config" value={activeConfig ? "Loaded" : "None"} ok={!!activeConfig} />
                            <StatusRow
                                label="Dirty fields"
                                value={hasDirtyFields ? `${dirtyCount} (tier ${highestDirtyTier})` : "None"}
                                ok={!hasDirtyFields}
                            />
                            <StatusRow
                                label="Validation"
                                value={hasValidationErrors ? `${validationErrorList.length} error${validationErrorList.length !== 1 ? "s" : ""}` : "OK"}
                                ok={!hasValidationErrors}
                                warn={hasValidationErrors}
                            />
                            {/* Validation error detail list */}
                            {hasValidationErrors && (
                                <div className="rounded border border-[hsl(0_60%_50%/0.25)] bg-[hsl(0_60%_50%/0.06)] px-2.5 py-1.5 space-y-1.5">
                                    {validationErrorList.length > 0 ? (
                                        validationErrorList.map(({ key, label, message }) => (
                                            <div key={key}>
                                                <span className="text-[9px] font-mono text-[hsl(0_65%_65%)]">
                                                    {label}{" "}
                                                    <span className="opacity-55">({key})</span>
                                                </span>
                                                <p className="text-[9px] text-[hsl(0_70%_58%)] leading-snug">{message}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[9px] text-[hsl(0_65%_55%)]">
                                            Validation count is non-zero but no error details were provided.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── 3. Run Preview — Phase 4A ────────────────────────── */}
                    <section>
                        <SectionLabel icon={<Play size={11} />} label="Run Preview" />

                        {/* Status summary row */}
                        <div className="mt-2 space-y-1.5">
                            <StatusRow
                                label="Dirty fields"
                                value={hasDirtyFields ? `${dirtyCount} (max tier ${highestDirtyTier})` : "None"}
                                ok={!hasDirtyFields}
                            />
                            <StatusRow
                                label="Validation"
                                value={hasValidationErrors ? `${validationErrorList.length} error${validationErrorList.length !== 1 ? "s" : ""}` : "OK"}
                                ok={!hasValidationErrors}
                                warn={hasValidationErrors}
                            />
                            <StatusRow
                                label="Preview"
                                value={previewStatusLabel(preview.status)}
                                ok={preview.status === "done"}
                                warn={preview.status === "failed"}
                            />
                        </div>

                        {/* Error text when failed */}
                        {preview.status === "failed" && preview.error && (
                            <div className="mt-1.5 rounded border border-[hsl(0_60%_50%/0.25)] bg-[hsl(0_60%_50%/0.06)] px-2.5 py-1.5">
                                <p className="text-[10px] text-[hsl(0_70%_58%)] leading-snug break-all">{preview.error}</p>
                            </div>
                        )}

                        {/* Stale warning — kept adjacent to the preview results below */}
                        {previewIsStale && (
                            <div className="mt-1.5 flex items-start gap-1.5 rounded border border-[hsl(38_85%_55%/0.3)] bg-[hsl(38_85%_55%/0.07)] px-2.5 py-1.5">
                                <AlertTriangle size={11} className="shrink-0 mt-0.5 text-[hsl(38_85%_55%)]" />
                                <p className="text-[10px] text-[hsl(38_85%_55%)] leading-snug">
                                    Draft changed since this preview started. Rerun preview before trusting results.
                                </p>
                            </div>
                        )}

                        {/* ── Preview Results — Phase 4B (display only) ────────────
                            Renders a lightweight read-out of the in-context preview
                            bundle. NEVER touches the store: no addRunBundle, no
                            setActiveRunId, no promotion. The bundle lives only in
                            MasterControlsContext.preview.bundle. */}
                        {preview.status === "done" && preview.bundle && (
                            <PreviewResults bundle={preview.bundle} isStale={previewIsStale} />
                        )}

                        {/* Action buttons */}
                        <div className="mt-2 flex flex-wrap gap-2">
                            {/* Run Preview button — disabled when guards not met */}
                            <button
                                type="button"
                                onClick={startPreview}
                                disabled={!effectiveConfig || hasValidationErrors || preview.status !== "idle"}
                                className={[
                                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded",
                                    "text-[10px] font-medium border transition-colors",
                                    (!effectiveConfig || hasValidationErrors || preview.status !== "idle")
                                        ? "opacity-40 cursor-not-allowed text-muted-lab bg-[hsl(var(--panel-2))] border-[hsl(var(--border-soft))]"
                                        : "text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.10)] border-[hsl(var(--accent-primary)/0.3)] hover:bg-[hsl(var(--accent-primary)/0.18)]",
                                ].join(" ")}
                            >
                                <Play size={10} />
                                Run Preview
                            </button>

                            {/* Cancel button — shown while in-flight */}
                            {(preview.status === "queued" || preview.status === "running" || preview.status === "importing") && (
                                <button
                                    type="button"
                                    onClick={cancelPreview}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium border transition-colors text-[hsl(0_65%_58%)] bg-[hsl(0_60%_50%/0.07)] border-[hsl(0_60%_50%/0.25)] hover:bg-[hsl(0_60%_50%/0.12)]"
                                >
                                    Cancel preview
                                </button>
                            )}

                            {/* Clear button — shown after done or failed */}
                            {(preview.status === "done" || preview.status === "failed") && (
                                <button
                                    type="button"
                                    onClick={clearPreview}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium border transition-colors text-muted-lab bg-[hsl(var(--panel-2))] border-[hsl(var(--border-soft))] hover:text-white"
                                >
                                    Clear preview
                                </button>
                            )}
                        </div>
                    </section>

                    {/* ── 4. Active Config — Phase 3D/3E config view ───────── */}
                    <section>
                        {/* Section header with both toggles */}
                        <div className="flex items-center justify-between">
                            <SectionLabel icon={<Settings2 size={11} />} label="Active Config" />
                            <div className="flex items-center gap-2.5">
                                {/* Edit mode toggle — only shown when config is available */}
                                {effectiveConfig && (
                                    <button
                                        type="button"
                                        onClick={() => setShowEditMode((v) => !v)}
                                        className={[
                                            "text-[10px] transition-colors leading-none",
                                            showEditMode
                                                ? "text-[hsl(var(--accent-primary))] font-medium"
                                                : "text-muted-lab hover:text-white",
                                        ].join(" ")}
                                    >
                                        {showEditMode ? "Viewing draft edits" : "Edit safe fields"}
                                    </button>
                                )}
                                {/* Advanced toggle + chip */}
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvanced((v) => !v)}
                                        className="text-[10px] text-muted-lab hover:text-white transition-colors leading-none"
                                    >
                                        {showAdvanced ? "Hide advanced" : "Show advanced"}
                                    </button>
                                    {showAdvanced && (
                                        <span className="text-[8px] px-1 py-0.5 rounded border border-[hsl(196_80%_55%/0.4)] bg-[hsl(196_80%_55%/0.12)] text-[hsl(196_80%_65%)] font-semibold leading-none">
                                            ADV
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Draft actions bar — shown only when there are unsaved changes */}
                        {hasDirtyFields && (
                            <DraftActionsBar
                                dirtyCount={dirtyCount}
                                highestDirtyTier={highestDirtyTier}
                                onReset={resetDraft}
                            />
                        )}

                        {/* Empty state or grouped config view */}
                        {!effectiveConfig ? (
                            <div className="mt-2 px-3 py-4 rounded border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.2)]">
                                <p className="text-[11px] text-muted-lab text-center leading-relaxed">
                                    No active run config loaded yet.
                                    <span className="block mt-0.5 text-[10px]">Import or select a run first.</span>
                                </p>
                            </div>
                        ) : (
                            <div className="mt-2 space-y-3">
                                {groupedConfig.map(({ group, subgroups }) => (
                                    <ConfigGroupBlock
                                        key={group}
                                        group={group}
                                        subgroups={subgroups}
                                        config={effectiveConfig}
                                        dirtyFields={dirtyFields}
                                        validationErrors={validationErrors}
                                        showEditMode={showEditMode}
                                        setDraftField={setDraftField}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── 5. Registry summary ───────────────────────────────── */}
                    <section>
                        <SectionLabel icon={<Database size={11} />} label="Config Registry" />
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <StatCard label="Total"   value={REGISTRY_SUMMARY.total} />
                            <StatCard label="Emitted" value={REGISTRY_SUMMARY.emitted}    accent />
                            <StatCard label="Dropped" value={REGISTRY_SUMMARY.notEmitted} muted />
                        </div>
                    </section>

                    {/* ── 6. Control Groups ─────────────────────────────────── */}
                    <section>
                        <SectionLabel icon={<Layers size={11} />} label="Control Groups" />
                        <div className="mt-2 space-y-1.5">
                            {GROUP_ORDER.map((g) => (
                                <GroupRow
                                    key={g}
                                    group={g}
                                    count={REGISTRY_SUMMARY.byGroup[g] || 0}
                                    total={REGISTRY_SUMMARY.total}
                                />
                            ))}
                        </div>
                    </section>

                    {/* ── 7. Rerun tiers ────────────────────────────────────── */}
                    <section>
                        <SectionLabel icon={<GitBranch size={11} />} label="Rerun Tiers" />
                        <div className="mt-2 space-y-1.5">
                            {[1, 2, 3].map((t) => (
                                <TierRow key={t} tier={t} count={REGISTRY_SUMMARY.byTier[t] || 0} />
                            ))}
                        </div>
                    </section>

                    {/* ── 8. Phase roadmap ──────────────────────────────────── */}
                    <section>
                        <SectionLabel label="Roadmap" />
                        <div className="mt-2 space-y-2">
                            <PhasePlaceholder
                                phase={3}
                                label="Editable controls"
                                desc="Edit cfg fields and draft new configs without leaving the report page"
                            />
                            <PhasePlaceholder
                                phase={4}
                                label="Run preview"
                                desc="Preview what changes vs. the active run before dispatching to the sidecar"
                            />
                            <PhasePlaceholder
                                phase={5}
                                label="Compare & promote"
                                desc="Diff draft against live run, promote best config to project"
                            />
                        </div>
                    </section>

                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-3 border-t border-[hsl(var(--border-soft))]">
                    <p className="text-[10px] text-muted-lab">
                        Phase 4A — Run Preview · {REGISTRY_SUMMARY.total} cfg fields · {REGISTRY_SUMMARY.emitted} emitted
                    </p>
                </div>
            </div>
        </>
    );
}

// ─── Draft actions bar ────────────────────────────────────────────────────────

function DraftActionsBar({ dirtyCount, highestDirtyTier, onReset }) {
    return (
        <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 rounded border border-[hsl(38_85%_55%/0.3)] bg-[hsl(38_85%_55%/0.07)]">
            <span className="text-[10px] text-[hsl(38_85%_55%)]">
                {dirtyCount} field{dirtyCount !== 1 ? "s" : ""} changed
                {highestDirtyTier > 0 && (
                    <span className="opacity-70"> · max tier {highestDirtyTier}</span>
                )}
            </span>
            <button
                type="button"
                onClick={onReset}
                className="ml-3 text-[10px] text-muted-lab hover:text-white transition-colors shrink-0"
            >
                Reset draft
            </button>
        </div>
    );
}

// ─── Config group / subgroup / field row ──────────────────────────────────────

function ConfigGroupBlock({ group, subgroups, config, dirtyFields, validationErrors, showEditMode, setDraftField }) {
    return (
        <div className="space-y-2">
            {/* Group header — rule with label */}
            <div className="flex items-center gap-2">
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--accent-primary)/0.55)]">
                    {GROUP_LABELS[group] ?? group}
                </span>
                <div className="flex-1 h-px bg-[hsl(var(--border-soft))]" />
            </div>

            {subgroups.map(({ subgroup, entries }) => (
                <ConfigSubgroupBlock
                    key={subgroup ?? "_root"}
                    subgroup={subgroup}
                    entries={entries}
                    config={config}
                    dirtyFields={dirtyFields}
                    validationErrors={validationErrors}
                    showEditMode={showEditMode}
                    setDraftField={setDraftField}
                />
            ))}
        </div>
    );
}

function ConfigSubgroupBlock({ subgroup, entries, config, dirtyFields, validationErrors, showEditMode, setDraftField }) {
    return (
        <div>
            {subgroup && (
                <p className="mb-1 pl-0.5 text-[9px] uppercase tracking-wider text-muted-lab font-medium">
                    {subgroup}
                </p>
            )}
            <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)] overflow-hidden">
                {entries.map((entry, idx) => (
                    <ConfigFieldRow
                        key={entry.key}
                        entry={entry}
                        value={config[entry.key]}
                        isDirty={dirtyFields instanceof Set ? dirtyFields.has(entry.key) : false}
                        errorMsg={validationErrors?.[entry.key] ?? null}
                        isLast={idx === entries.length - 1}
                        showEditMode={showEditMode}
                        setDraftField={setDraftField}
                    />
                ))}
            </div>
        </div>
    );
}

function ConfigFieldRow({ entry, value, isDirty, errorMsg, isLast, showEditMode, setDraftField }) {
    // An editable control is shown only for the explicitly safe subset
    const isEditable = showEditMode && entry.editable && SAFE_EDITABLE_SUBSET.has(entry.key);
    // Advanced-mode rows get a subtle cyan left accent bar (inset box-shadow avoids
    // clipping by the parent container's overflow-hidden + rounded styles).
    const isAdvanced = entry.advancedMode === true;

    return (
        <div
            className={[
                "px-2.5 py-1.5",
                isDirty    ? "bg-[hsl(38_80%_50%/0.07)]" : "",
                isAdvanced ? "shadow-[inset_2px_0_0_hsl(196_80%_55%/0.45)]" : "",
                !isLast    ? "border-b border-[hsl(var(--border-soft))]" : "",
            ].filter(Boolean).join(" ")}
        >
            <div className="flex items-center gap-1.5">
                {/* Label — always visible */}
                <span
                    className={[
                        "flex-1 min-w-0 text-[11px] truncate",
                        isAdvanced ? "text-[hsl(196_70%_60%)]" : "text-muted-lab",
                    ].join(" ")}
                    title={entry.label}
                >
                    {entry.label}
                </span>

                {/* Value display or editable control */}
                {isEditable ? (
                    entry.inputType === "boolean" ? (
                        <BoolToggle
                            entryKey={entry.key}
                            value={value}
                            setDraftField={setDraftField}
                        />
                    ) : (
                        // number fields (all remaining safe subset entries are numbers)
                        <NumberFieldInput
                            entryKey={entry.key}
                            value={value}
                            validation={entry.validation}
                            setDraftField={setDraftField}
                        />
                    )
                ) : (
                    <span
                        className="shrink-0 text-[11px] text-white max-w-[110px] truncate text-right"
                        title={fmtCfgValue(value)}
                    >
                        {fmtCfgValue(value)}
                    </span>
                )}

                {/* Tier chip */}
                <TierChip tier={entry.tier} />

                {/* Dirty marker */}
                {isDirty && <ChangedChip />}
            </div>

            {/* Validation error sub-row */}
            {errorMsg && (
                <p className="mt-0.5 text-[9px] text-[hsl(0_70%_60%)] leading-tight">
                    {errorMsg}
                </p>
            )}
        </div>
    );
}

// ─── Editable controls ────────────────────────────────────────────────────────

/**
 * Compact number input.
 * Maintains local string state to allow mid-type states like "3." without
 * snapping back. Drafts are updated live on complete values; finalized on blur.
 * Syncs back when the external value changes (resetDraft, run switch).
 */
function NumberFieldInput({ entryKey, value, validation, setDraftField }) {
    const [raw, setRaw] = useState(() => (value != null ? String(value) : ""));

    // Sync when the prop changes from outside (e.g. resetDraft clears draftConfig)
    useEffect(() => {
        setRaw(value != null ? String(value) : "");
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (e) => {
        const s = e.target.value;
        setRaw(s);
        // Only commit to draft when the string is a complete number.
        // Strings ending in "." or "-" are mid-type; committing them would
        // cause a value round-trip that resets the input.
        if (s !== "" && !s.endsWith(".") && s !== "-") {
            const n = parseFloat(s);
            if (Number.isFinite(n)) setDraftField(entryKey, n);
        }
    };

    const handleBlur = () => {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) {
            // Revert to the last committed value
            setRaw(value != null ? String(value) : "");
        } else {
            setRaw(String(n));
            setDraftField(entryKey, n);
        }
    };

    return (
        <input
            type="number"
            value={raw}
            min={validation?.min}
            max={validation?.max}
            step={validation?.step ?? 1}
            onChange={handleChange}
            onBlur={handleBlur}
            className={[
                "shrink-0 w-[76px] h-6 px-1.5",
                "text-[11px] text-white font-mono",
                "bg-[hsl(var(--panel-2))] rounded",
                "border border-[hsl(var(--border-soft))]",
                "focus:outline-none focus:border-[hsl(var(--accent-primary)/0.6)]",
                "transition-colors",
            ].join(" ")}
        />
    );
}

/**
 * Compact boolean toggle button.
 * Clicking flips the boolean and calls setDraftField immediately.
 */
function BoolToggle({ entryKey, value, setDraftField }) {
    const on = Boolean(value);
    return (
        <button
            type="button"
            onClick={() => setDraftField(entryKey, !on)}
            className={[
                "shrink-0 h-5 px-2 rounded text-[10px] font-medium border transition-colors",
                on
                    ? "text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] border-[hsl(var(--accent-primary)/0.3)]"
                    : "text-muted-lab bg-[hsl(var(--panel-2))] border-[hsl(var(--border-soft))] hover:text-white",
            ].join(" ")}
        >
            {on ? "On" : "Off"}
        </button>
    );
}

// ─── Tier + Changed chips ─────────────────────────────────────────────────────

const TIER_CHIP_CLS = {
    1: "text-[hsl(142_55%_45%)] bg-[hsl(142_55%_45%/0.12)] border-[hsl(142_55%_45%/0.3)]",
    2: "text-[hsl(38_85%_55%)] bg-[hsl(38_85%_55%/0.12)] border-[hsl(38_85%_55%/0.3)]",
    3: "text-[hsl(18_80%_58%)] bg-[hsl(18_80%_58%/0.12)] border-[hsl(18_80%_58%/0.3)]",
};

function TierChip({ tier }) {
    const cls = TIER_CHIP_CLS[tier] ?? "text-muted-lab bg-[hsl(var(--panel-2))] border-transparent";
    return (
        <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded border font-mono leading-none ${cls}`}>
            T{tier}
        </span>
    );
}

function ChangedChip() {
    return (
        <span className="shrink-0 text-[8px] px-1 py-0.5 rounded border font-semibold leading-none text-[hsl(38_85%_55%)] bg-[hsl(38_85%_55%/0.12)] border-[hsl(38_85%_55%/0.3)]">
            ~
        </span>
    );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ icon, label }) {
    return (
        <div className="flex items-center gap-1.5">
            {icon && <span className="text-muted-lab">{icon}</span>}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-lab">{label}</span>
        </div>
    );
}

function StatCard({ label, value, accent, muted }) {
    const valueClass = accent
        ? "text-[hsl(var(--accent-primary))]"
        : muted
            ? "text-muted-lab"
            : "text-white";

    return (
        <div className="flex flex-col items-center px-2 py-2.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.4)]">
            <span className={`text-xl font-bold font-display leading-none ${valueClass}`}>{value}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-lab mt-1">{label}</span>
        </div>
    );
}

function GroupRow({ group, count, total }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[11px] text-muted-lab capitalize font-mono">{group}</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-[hsl(var(--panel-3))]">
                <div
                    className="h-full rounded-full bg-[hsl(var(--accent-primary)/0.45)]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-5 shrink-0 text-right text-[11px] text-muted-lab">{count}</span>
        </div>
    );
}

function TierRow({ tier, count }) {
    const { label, desc } = TIER_META[tier];
    return (
        <div className="px-3 py-2 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)]">
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-white">{label}</span>
                <span className="text-[11px] font-bold text-[hsl(var(--accent-primary))]">{count}</span>
            </div>
            <p className="text-[10px] text-muted-lab mt-0.5">{desc}</p>
        </div>
    );
}

function PhasePlaceholder({ phase, label, desc }) {
    return (
        <div className="px-3 py-2.5 rounded border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.2)]">
            <div className="flex items-center gap-2">
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--panel-2))] text-muted-lab font-mono uppercase tracking-wider">
                    Phase {phase}
                </span>
                <span className="text-[11px] text-white">{label}</span>
            </div>
            <p className="text-[10px] text-muted-lab mt-1">{desc}</p>
        </div>
    );
}

function previewStatusLabel(status) {
    switch (status) {
        case "idle":      return "No preview run yet";
        case "queued":    return "Running preview…";
        case "running":   return "Running preview…";
        case "completed": return "Completed — importing…";
        case "importing": return "Importing preview bundle…";
        case "done":      return "Preview ready";
        case "failed":    return "Failed";
        default:          return status;
    }
}

// ─── Preview results — Phase 4B (display only, never persisted) ───────────────

/** Return the first finite number from the given candidates, else null. */
function firstFiniteNumber(...values) {
    for (const v of values) {
        if (v === null || v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Count wins/losses from a trade array, preferring the parsed `outcome`. */
function countWinsLosses(trades) {
    let wins = 0;
    let losses = 0;
    for (const t of trades) {
        const outcome = String(t?.outcome ?? "").toLowerCase();
        if (outcome === "win") {
            wins++;
        } else if (outcome === "loss") {
            losses++;
        } else if (!outcome) {
            // No outcome label — fall back to the sign of R.
            const r = Number(t?.r);
            if (Number.isFinite(r)) {
                if (r > 0) wins++;
                else if (r < 0) losses++;
            }
        }
    }
    return { wins, losses };
}

/**
 * Max drawdown (positive R magnitude) from a cumulative equity curve, or from a
 * trade array as a fallback. Returns null when neither source is usable.
 */
function computeMaxDrawdown(equityCurve, trades) {
    let series = [];
    if (Array.isArray(equityCurve) && equityCurve.length) {
        series = equityCurve.map((p) => Number(p?.netR)).filter(Number.isFinite);
    } else if (Array.isArray(trades) && trades.length) {
        let cum = 0;
        series = trades.map((t) => { cum += Number(t?.r) || 0; return cum; });
    }
    if (!series.length) return null;
    let peak = series[0];
    let maxDd = 0;
    for (const v of series) {
        if (v > peak) peak = v;
        const dd = peak - v;
        if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
}

/**
 * Extract lightweight metrics from a preview bundle (the object produced by
 * ingestRunBundle and held in MasterControlsContext.preview.bundle).
 *
 * Strategy: prefer bundle.summary (already canonical from the importer), then
 * fall back to the primary variant in bundle.tradesByVariant / bundle.trades.
 * Fully defensive — any malformed input returns { ok: false } rather than throwing.
 */
function extractPreviewMetrics(bundle) {
    if (!bundle || typeof bundle !== "object") return { ok: false };
    try {
        const summary = bundle.summary && typeof bundle.summary === "object" ? bundle.summary : {};
        const tbv = bundle.tradesByVariant && typeof bundle.tradesByVariant === "object" ? bundle.tradesByVariant : {};

        // Run label / id — summary fields first, then bundle, then ids.
        const label =
            summary.displayName || summary.name ||
            bundle.displayName || bundle.name ||
            bundle.id || summary.id || null;

        // Selected / primary variant.
        const variant =
            bundle.primaryVariant ||
            summary.primaryVariant || summary.primary_variant ||
            summary.executionMode || summary.execution_mode ||
            null;

        // Best-effort fallback trade list: named variant → primary trades →
        // largest variant array → empty.
        const variantArrays = Object.values(tbv).filter(Array.isArray);
        const fallbackTrades =
            (variant && Array.isArray(tbv[variant]) ? tbv[variant] : null) ||
            (Array.isArray(bundle.trades) ? bundle.trades : null) ||
            variantArrays.slice().sort((a, b) => b.length - a.length)[0] ||
            [];

        let usedFallback = false;

        // Trades.
        let trades = firstFiniteNumber(summary.trades, summary.trade_count, summary.tradeCount, summary.total_trades, summary.n_trades);
        if (trades == null) { trades = fallbackTrades.length; usedFallback = true; }

        // Wins / losses.
        let wins = firstFiniteNumber(summary.wins, summary.win_count, summary.winCount);
        let losses = firstFiniteNumber(summary.losses, summary.loss_count, summary.lossCount);
        if (wins == null || losses == null) {
            const counted = countWinsLosses(fallbackTrades);
            if (wins == null) { wins = counted.wins; usedFallback = true; }
            if (losses == null) { losses = counted.losses; usedFallback = true; }
        }

        // Win rate (percentage).
        let winRate = firstFiniteNumber(summary.winRate, summary.win_rate, summary.winRatePct);
        if (winRate == null) {
            const denom = (Number(wins) || 0) + (Number(losses) || 0);
            winRate = denom > 0 ? (Number(wins) / denom) * 100 : null;
            if (winRate != null) usedFallback = true;
        }

        // Net R / total R.
        let netR = firstFiniteNumber(summary.netR, summary.net_r, summary.pnl_r, summary.totalR, summary.total_r);
        if (netR == null) {
            netR = fallbackTrades.reduce((s, t) => s + (Number(t?.r) || 0), 0);
            usedFallback = true;
        }

        // Max drawdown.
        let maxDd = firstFiniteNumber(summary.maxDd, summary.maxDD, summary.max_drawdown, summary.maxDrawdown, summary.max_dd);
        if (maxDd == null) {
            maxDd = computeMaxDrawdown(bundle.equityCurve, fallbackTrades);
            if (maxDd != null) usedFallback = true;
        }

        const totalTrades = Number.isFinite(trades) ? trades : 0;

        return {
            ok: true,
            label: label != null ? String(label) : null,
            variant: variant != null ? String(variant) : null,
            trades: totalTrades,
            wins: Number.isFinite(wins) ? wins : null,
            losses: Number.isFinite(losses) ? losses : null,
            winRate: Number.isFinite(winRate) ? winRate : null,
            netR: Number.isFinite(netR) ? netR : null,
            maxDd: Number.isFinite(maxDd) ? maxDd : null,
            noTrades: totalTrades === 0,
            usedFallback,
        };
    } catch {
        return { ok: false };
    }
}

function fmtPreviewInt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return String(Math.round(Number(v)));
}

function fmtPreviewPct(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return `${Number(v).toFixed(1)}%`;
}

function fmtPreviewR(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    const sign = n >= 0 ? "+" : "−";
    return `${sign}${Math.abs(n).toFixed(1)}R`;
}

function fmtPreviewDd(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const m = Math.abs(Number(v));
    return m === 0 ? "0.0R" : `−${m.toFixed(1)}R`;
}

function PreviewStat({ label, value, tone }) {
    const valueClass =
        tone === "pos" ? "text-[hsl(142_55%_55%)]"
        : tone === "neg" ? "text-[hsl(0_65%_62%)]"
        : "text-white";
    return (
        <div className="flex flex-col px-2 py-1.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.4)]">
            <span className="text-[9px] uppercase tracking-wider text-muted-lab">{label}</span>
            <span className={`mt-0.5 text-[13px] font-semibold font-mono leading-tight ${valueClass}`}>{value}</span>
        </div>
    );
}

function PreviewIsolationNote() {
    return (
        <p className="mt-2 pt-1.5 border-t border-[hsl(var(--border-soft))] text-[9px] text-muted-lab leading-snug">
            Preview is temporary and not saved to run history.
        </p>
    );
}

function PreviewResults({ bundle, isStale }) {
    const metrics = useMemo(() => extractPreviewMetrics(bundle), [bundle]);

    // Defensive: bundle exists but no usable metrics could be read.
    if (!metrics.ok) {
        return (
            <div className="mt-2 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent-primary))]">Preview Results</span>
                </div>
                <p className="mt-1.5 text-[10px] text-[hsl(38_85%_55%)] leading-snug">
                    Preview bundle loaded, but metrics could not be read.
                </p>
                <PreviewIsolationNote />
            </div>
        );
    }

    const netRTone = metrics.netR == null ? undefined : metrics.netR >= 0 ? "pos" : "neg";

    return (
        <div className="mt-2 rounded border border-[hsl(var(--accent-primary)/0.25)] bg-[hsl(var(--accent-primary)/0.04)] px-3 py-2.5">
            {/* Header */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent-primary))]">Preview Results</span>
                <span className="text-[8px] px-1 py-0.5 rounded border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))] font-semibold leading-none">
                    TEMP
                </span>
            </div>

            {/* Run label + variant */}
            {(metrics.label || metrics.variant) && (
                <div className="mt-1.5 space-y-0.5">
                    {metrics.label && (
                        <p className="text-[11px] text-white font-mono truncate" title={metrics.label}>{metrics.label}</p>
                    )}
                    {metrics.variant && (
                        <p className="text-[10px] text-muted-lab truncate">
                            Variant: <span className="text-white">{metrics.variant}</span>
                        </p>
                    )}
                </div>
            )}

            {/* Stale reminder — placed directly with the results it qualifies */}
            {isStale && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded border border-[hsl(38_85%_55%/0.3)] bg-[hsl(38_85%_55%/0.07)] px-2 py-1">
                    <AlertTriangle size={10} className="shrink-0 mt-0.5 text-[hsl(38_85%_55%)]" />
                    <p className="text-[9px] text-[hsl(38_85%_55%)] leading-snug">
                        Draft changed since this preview — results may be stale.
                    </p>
                </div>
            )}

            {/* No-trades warning */}
            {metrics.noTrades && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded border border-[hsl(38_85%_55%/0.3)] bg-[hsl(38_85%_55%/0.07)] px-2 py-1">
                    <AlertTriangle size={10} className="shrink-0 mt-0.5 text-[hsl(38_85%_55%)]" />
                    <p className="text-[9px] text-[hsl(38_85%_55%)] leading-snug">
                        No trades found in this preview run.
                    </p>
                </div>
            )}

            {/* Compact stat cards */}
            <div className="mt-2 grid grid-cols-2 gap-1.5">
                <PreviewStat label="Trades"   value={fmtPreviewInt(metrics.trades)} />
                <PreviewStat label="Win rate" value={fmtPreviewPct(metrics.winRate)} />
                <PreviewStat label="Net R"    value={fmtPreviewR(metrics.netR)} tone={netRTone} />
                <PreviewStat label="Max DD"   value={fmtPreviewDd(metrics.maxDd)} />
            </div>

            {/* Wins / losses detail */}
            <div className="mt-1.5 flex items-center gap-3 px-0.5">
                <span className="text-[9px] text-muted-lab">
                    Wins <span className="text-[hsl(142_55%_55%)] font-medium">{fmtPreviewInt(metrics.wins)}</span>
                </span>
                <span className="text-[9px] text-muted-lab">
                    Losses <span className="text-[hsl(0_65%_62%)] font-medium">{fmtPreviewInt(metrics.losses)}</span>
                </span>
                {metrics.usedFallback && (
                    <span className="ml-auto text-[8px] text-muted-lab opacity-70" title="Some metrics were derived from trade rows rather than the summary block.">
                        derived
                    </span>
                )}
            </div>

            <PreviewIsolationNote />
        </div>
    );
}

function StatusRow({ label, value, ok, warn }) {
    const valueClass = warn
        ? "text-[hsl(var(--accent-warn,35_90%_56%))]"
        : ok
            ? "text-[hsl(var(--accent-primary))]"
            : "text-muted-lab";
    return (
        <div className="flex items-center justify-between px-3 py-1.5 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.3)]">
            <span className="text-[11px] text-muted-lab">{label}</span>
            <span className={`text-[11px] font-medium ${valueClass}`}>{value}</span>
        </div>
    );
}
