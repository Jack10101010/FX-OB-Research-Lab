/**
 * TableCompareShell — inline Table Compare Layer 1 (Phase TC-1).
 *
 * Wraps a single CanonicalBucketTable (Side A) and adds a subtle corner control:
 *
 *     Compare:  None  ·  Previous Run  ·  Select Run…
 *
 * When a compare target is chosen the panel "expands downward" into a stacked
 * comparison: Side-B table (the same CanonicalBucketTable, bare) + a Δ summary
 * matched row-by-row against Side A.
 *
 * Scope (TC-1): OrderBlockLab → Structure Quality pilot only. This component is
 * generic, but the caller supplies the OB-specific resolution so the shell stays
 * free of page concerns:
 *   • resolveCompared(runId) -> { trades, universe } | null   (Side-B trade list,
 *     resolved under the SAME scenario + filters as Side A; null/empty when the
 *     run's full data isn't available — the shell warns, never fakes).
 *   • buildRows(trades) -> legacyBucketRows                    (the SAME bucket
 *     builder Side A used, so both sides are produced by identical math).
 *
 * Deltas are Raw R (see lib/tableCompare.js). Under Current Equity the page table
 * still renders contribution, but the Δ summary stays Raw R with a caveat — per
 * TABLE_COMPARE_BASIS_AUDIT.md (contribution deltas are path-dependent).
 */

import React from "react";
import { Link } from "react-router-dom";
import { GitCompare, AlertTriangle, ArrowRight, Layers, Lightbulb, Check } from "lucide-react";
import { useDataset, getRunDisplayName, addProjectFinding } from "@/data/store";
import { useResultsLens } from "@/data/useResultsLens";
import { CanonicalBucketTable } from "@/components/lab/CanonicalBucketTable";
import { DataTable, Pill, ColoredR } from "@/components/lab/DataTable";
import { NeonSelect, Segment } from "@/components/lab/controls";
import { cn } from "@/lib/utils";
import { buildResearchFindingPayload } from "@/data/projectWorkflow";
import {
    buildTableComparison,
    resolveCompareMetrics,
    formatCompareDelta,
    DEFAULT_COMPARE_METRICS,
} from "@/lib/tableCompare";

const MODE_NONE = "none";
const MODE_PREVIOUS = "previous";
const MODE_SELECT = "select";

// TC-3 — comparison view modes.
const VIEW_STACKED = "stacked";   // Side A table + Side B table + Δ summary
const VIEW_INLINE = "inline";     // single Side-A-based table with delta columns
// Inline column layout: each metric contributes a value column then a Δ column,
// in this order (only metrics present in the configured `metrics` set are shown).
const INLINE_METRIC_ORDER = ["count", "winRate", "netR", "expectancy", "profitFactor"];

// ── TC-4 — per-table persistence ────────────────────────────────────────────────
// Compare UI (mode / selected run / view mode) is remembered per `testId` so each
// table restores independently. Versioned key; fully defensive against missing
// testId, absent/blocked storage, and corrupt values. Defaults: none + stacked.
const PERSIST_PREFIX = "fxob_table_compare_ui_v1:";
const ALLOWED_MODES = [MODE_NONE, MODE_PREVIOUS, MODE_SELECT];
const ALLOWED_VIEWS = [VIEW_STACKED, VIEW_INLINE];
const DEFAULT_UI = Object.freeze({ mode: MODE_NONE, selectedRunId: "", viewMode: VIEW_STACKED });

function loadCompareUI(testId) {
    if (!testId || typeof window === "undefined" || !window.localStorage) return { ...DEFAULT_UI };
    try {
        const raw = window.localStorage.getItem(PERSIST_PREFIX + testId);
        if (!raw) return { ...DEFAULT_UI };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { ...DEFAULT_UI };
        return {
            mode: ALLOWED_MODES.includes(parsed.mode) ? parsed.mode : MODE_NONE,
            selectedRunId: typeof parsed.selectedRunId === "string" ? parsed.selectedRunId : "",
            viewMode: ALLOWED_VIEWS.includes(parsed.viewMode) ? parsed.viewMode : VIEW_STACKED,
        };
    } catch {
        return { ...DEFAULT_UI };
    }
}

function saveCompareUI(testId, state) {
    if (!testId || typeof window === "undefined" || !window.localStorage) return;
    try {
        window.localStorage.setItem(
            PERSIST_PREFIX + testId,
            JSON.stringify({
                mode: state.mode,
                selectedRunId: state.selectedRunId,
                viewMode: state.viewMode,
            }),
        );
    } catch {
        /* ignore quota / serialization errors — persistence is best-effort */
    }
}

/**
 * Choose the "previous run" relative to the active one: the imported run
 * immediately before it in import-time order. Falls back to the most recent
 * other imported run. Returns null when there is no other run.
 */
function pickPreviousRunId(runs, activeRunId) {
    const list = (Array.isArray(runs) ? runs : []).filter((r) => r && r.id);
    if (!list.length) return null;
    const ordered = [...list].sort((a, b) => {
        const ta = Date.parse(a.importedAt || "") || 0;
        const tb = Date.parse(b.importedAt || "") || 0;
        return ta - tb; // oldest → newest
    });
    const idx = ordered.findIndex((r) => r.id === activeRunId);
    if (idx > 0) return ordered[idx - 1].id;
    // active not found, or it's the oldest → most recent other run
    const others = ordered.filter((r) => r.id !== activeRunId);
    return others.length ? others[others.length - 1].id : null;
}

export function TableCompareShell({
    title,
    testId,
    // Side A
    currentRows = [],
    currentTrades = [],
    currentUniverse = null,
    bucketDef = {},
    renderers,
    onDrill,
    compact = false,
    rowKey = "label",
    metrics = DEFAULT_COMPARE_METRICS,
    // Side B wiring (caller-supplied, keeps page concerns out of the shell)
    resolveCompared,
    buildRows,
    // Compact header opts — passed through to CanonicalBucketTable unchanged.
    eyebrow = null,
    hideChip = false,
    hideResultsBasis = false,
    basisFooter = false,
    controlsPopover = false,
}) {
    const { RUNS, activeRunId } = useDataset();
    const lens = useResultsLens();

    // TC-4 — restore persisted per-table compare UI once on mount.
    const initialUIRef = React.useRef(null);
    if (initialUIRef.current === null) initialUIRef.current = loadCompareUI(testId);
    const initialUI = initialUIRef.current;

    const [mode, setMode] = React.useState(initialUI.mode);
    const [selectedRunId, setSelectedRunId] = React.useState(initialUI.selectedRunId);
    const [viewMode, setViewMode] = React.useState(initialUI.viewMode);

    const otherRuns = React.useMemo(
        () => (Array.isArray(RUNS) ? RUNS.filter((r) => r && r.id && r.id !== activeRunId) : []),
        [RUNS, activeRunId],
    );
    const previousRunId = React.useMemo(
        () => pickPreviousRunId(RUNS, activeRunId),
        [RUNS, activeRunId],
    );

    // Default the Select-Run dropdown to the first available other run, and
    // safely recover when a restored (TC-4) selectedRunId no longer exists.
    React.useEffect(() => {
        if (mode !== MODE_SELECT) return;
        const exists = selectedRunId && otherRuns.some((r) => r.id === selectedRunId);
        if (!exists) setSelectedRunId(otherRuns.length ? otherRuns[0].id : "");
    }, [mode, selectedRunId, otherRuns]);

    // TC-4 — persist compare UI per testId whenever it changes.
    React.useEffect(() => {
        saveCompareUI(testId, { mode, selectedRunId, viewMode });
    }, [testId, mode, selectedRunId, viewMode]);

    const effectiveRunId =
        mode === MODE_PREVIOUS ? previousRunId :
        // Fall back to the first available run so "Select Run" resolves on the
        // first render (matches the dropdown's displayed value) instead of
        // briefly flashing the "data unavailable" guard before the effect runs.
        mode === MODE_SELECT ? (selectedRunId || otherRuns[0]?.id || null) :
        null;

    const comparedRun = React.useMemo(
        () => otherRuns.find((r) => r.id === effectiveRunId) || null,
        [otherRuns, effectiveRunId],
    );

    // Side B resolution — caller returns { trades, universe } or null.
    const comparedCtx = React.useMemo(() => {
        if (!effectiveRunId || typeof resolveCompared !== "function") return null;
        try { return resolveCompared(effectiveRunId) || null; }
        catch { return null; }
    }, [effectiveRunId, resolveCompared]);

    const comparedTrades = comparedCtx?.trades || [];
    const comparedRows = React.useMemo(() => {
        if (!comparedTrades.length || typeof buildRows !== "function") return [];
        try { return buildRows(comparedTrades) || []; }
        catch { return []; }
    }, [comparedTrades, buildRows]);

    const comparison = React.useMemo(
        () => buildTableComparison({ currentRows, comparedRows, rowKey, metrics }),
        [currentRows, comparedRows, rowKey, metrics],
    );

    const metricDefs = React.useMemo(() => resolveCompareMetrics(metrics), [metrics]);

    // WF-7 — save a compared bucket row as a project finding. Enabled only when
    // the active run is linked to a project. Reuses addProjectFinding (WF-4); no
    // comparison math is touched here — we only read the already-computed rows.
    const activeRun = React.useMemo(
        () => (Array.isArray(RUNS) ? RUNS.find((r) => r && r.id === activeRunId) || null : null),
        [RUNS, activeRunId],
    );
    const activeProjectId = activeRun?.projectId || null;
    const canSaveFinding = Boolean(activeProjectId);
    const comparedName = comparedRun ? getRunDisplayName(comparedRun) : "";
    const [savedRowKeys, setSavedRowKeys] = React.useState(() => new Set());

    // Reset the "saved" markers whenever the compared run changes — a saved row
    // for run B shouldn't appear saved after switching to run C.
    React.useEffect(() => { setSavedRowKeys(new Set()); }, [effectiveRunId]);

    const handleSaveRowFinding = React.useCallback((row) => {
        if (!canSaveFinding || !row) return;
        const metricBits = metricDefs.map((def) => {
            const delta = row.deltas?.[def.key];
            if (!delta || delta.value == null) return null;
            return `Δ${def.label} ${formatCompareDelta(def, delta)}`;
        }).filter(Boolean).join(" · ");
        const aN = row.current?.count ?? row.current?.rows;
        const bN = row.compared?.count ?? row.compared?.rows;
        const tableName = title || "Table Compare";
        const findingTitle = `${tableName} · ${row.key} vs ${comparedName || "comparison"}`;
        const note = `Bucket "${row.key}" — N ${aN == null ? "—" : aN} → ${bN == null ? "—" : bN}.${metricBits ? ` ${metricBits}` : ""}`;
        const entry = addProjectFinding(activeProjectId, buildResearchFindingPayload({
            source: "table_compare",
            tag: "Table Compare",
            title: findingTitle,
            note,
            runId: activeRunId,
            sourceRunId: activeRunId,
            comparedRunId: effectiveRunId || undefined,
            table: tableName,
            bucket: row.key,
        }));
        if (entry) {
            setSavedRowKeys((prev) => {
                const next = new Set(prev);
                next.add(row.key);
                return next;
            });
        }
    }, [canSaveFinding, metricDefs, title, comparedName, activeProjectId, activeRunId, effectiveRunId]);

    // ── Explicit universe / availability guards (never compare silently) ───────
    const sideAUniverseLabel = currentUniverse?.label || "Baseline";
    const sideBUniverseLabel = comparedCtx?.universe?.label || "—";
    const scenarioMismatch =
        comparedCtx?.universe?.sourceKey &&
        currentUniverse?.sourceKey &&
        comparedCtx.universe.sourceKey !== currentUniverse.sourceKey;
    const dataUnavailable = Boolean(effectiveRunId) && (!comparedCtx || comparedTrades.length === 0);
    const noOtherRuns = otherRuns.length === 0;

    const compareControl = (
        <CompareControl
            mode={mode}
            setMode={setMode}
            selectedRunId={selectedRunId}
            setSelectedRunId={setSelectedRunId}
            otherRuns={otherRuns}
            previousRunId={previousRunId}
            disabled={noOtherRuns}
            viewMode={viewMode}
            setViewMode={setViewMode}
            showViewToggle={mode !== MODE_NONE && !dataUnavailable}
        />
    );

    return (
        <div className="flex flex-col gap-3" data-testid={testId ? `${testId}-compare-shell` : undefined}>
            <CanonicalBucketTable
                title={title}
                testId={testId}
                rawRows={currentRows}
                trades={currentTrades}
                def={bucketDef}
                renderers={renderers}
                onDrill={onDrill}
                compact={compact}
                headerAction={compareControl}
                eyebrow={eyebrow}
                hideChip={hideChip}
                hideResultsBasis={hideResultsBasis}
                basisFooter={basisFooter}
                controlsPopover={controlsPopover}
            />

            {mode !== MODE_NONE && (
                <ComparisonRegion
                    comparedRun={comparedRun}
                    comparedCtx={comparedCtx}
                    comparedRows={comparedRows}
                    comparedTrades={comparedTrades}
                    bucketDef={bucketDef}
                    renderers={renderers}
                    comparison={comparison}
                    metricDefs={metricDefs}
                    viewMode={viewMode}
                    lens={lens}
                    sideAUniverseLabel={sideAUniverseLabel}
                    sideBUniverseLabel={sideBUniverseLabel}
                    scenarioMismatch={scenarioMismatch}
                    dataUnavailable={dataUnavailable}
                    noOtherRuns={noOtherRuns}
                    testId={testId}
                    onSaveRowFinding={handleSaveRowFinding}
                    canSaveFinding={canSaveFinding}
                    savedRowKeys={savedRowKeys}
                />
            )}
        </div>
    );
}

// ─── Corner compare control ────────────────────────────────────────────────────

function CompareControl({
    mode, setMode, selectedRunId, setSelectedRunId, otherRuns, previousRunId, disabled,
    viewMode, setViewMode, showViewToggle,
}) {
    const ctrl = "!py-1 !px-2 !text-[10.5px] !bg-[hsl(var(--panel-2))]";
    return (
        <div className="flex items-center gap-1.5">
            <GitCompare className="w-3 h-3 text-[hsl(var(--text-muted))]" />
            <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))] hidden sm:inline">Compare</span>
            <NeonSelect
                testId="table-compare-mode"
                value={mode}
                onChange={setMode}
                className={ctrl}
                options={[
                    { value: "none", label: "None" },
                    { value: "previous", label: disabled ? "Previous Run (none)" : "Previous Run" },
                    { value: "select", label: disabled ? "Select Run (none)" : "Select Run…" },
                ]}
            />
            {mode === "select" && !disabled && (
                <NeonSelect
                    testId="table-compare-run"
                    value={selectedRunId || (otherRuns[0]?.id ?? "")}
                    onChange={setSelectedRunId}
                    className={ctrl}
                    options={otherRuns.map((r) => ({ value: r.id, label: getRunDisplayName(r) }))}
                />
            )}
            {showViewToggle && (
                <Segment
                    testId="table-compare-view"
                    value={viewMode}
                    onChange={setViewMode}
                    className="!p-0.5"
                    options={[
                        { value: VIEW_STACKED, label: "Stacked" },
                        { value: VIEW_INLINE, label: "Inline Δ" },
                    ]}
                />
            )}
        </div>
    );
}

// ─── Stacked comparison region (expands downward) ───────────────────────────────

function ComparisonRegion({
    comparedRun, comparedCtx, comparedRows, comparedTrades, bucketDef, renderers,
    comparison, metricDefs, viewMode, lens,
    sideAUniverseLabel, sideBUniverseLabel, scenarioMismatch, dataUnavailable, noOtherRuns, testId,
    onSaveRowFinding, canSaveFinding, savedRowKeys,
}) {
    const comparedName = comparedRun ? getRunDisplayName(comparedRun) : "—";
    const isInline = viewMode === VIEW_INLINE;

    return (
        <div className="relative border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--panel)/0.6)] clip-bevel-sm px-4 py-3 flex flex-col gap-3">
            {/* Header strip */}
            <div className="flex flex-wrap items-center gap-2">
                <Pill tone="secondary">COMPARISON</Pill>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-2))]">
                    <span className="text-[hsl(var(--accent-primary))] font-medium">A · Current</span>
                    <ArrowRight className="w-3 h-3 text-[hsl(var(--text-muted))]" />
                    {comparedRun
                        ? <Link to={`/runs/${encodeURIComponent(comparedRun.id)}`} className="text-[hsl(var(--accent-secondary))] font-medium hover:text-white">B · {comparedName}</Link>
                        : <span className="text-[hsl(var(--accent-secondary))] font-medium">B · {comparedName}</span>
                    }
                </span>
                <span className="text-[9px] font-ui uppercase tracking-widest text-[hsl(var(--text-muted))] ml-auto">Δ Basis</span>
                <Pill tone="muted">Raw R</Pill>
            </div>

            {/* Universe labels — always explicit (never silently mix Baseline vs scenario) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-ui text-muted-lab">
                <span>A universe: <span className="text-[hsl(var(--text-2))]">{sideAUniverseLabel}</span></span>
                <span>B universe: <span className="text-[hsl(var(--text-2))]">{sideBUniverseLabel}</span></span>
            </div>

            {/* Guards */}
            {noOtherRuns && (
                <GuardBanner tone="muted">No other imported runs are available to compare against.</GuardBanner>
            )}
            {!noOtherRuns && dataUnavailable && (
                <GuardBanner tone="warning">
                    Comparison data for this run isn’t loaded (no trades available). Open the run once to hydrate its data, then compare. No data is fabricated.
                </GuardBanner>
            )}
            {scenarioMismatch && !dataUnavailable && (
                <GuardBanner tone="warning">
                    Trade universes differ — comparing <b>{sideAUniverseLabel}</b> (A) against <b>{sideBUniverseLabel}</b> (B). Deltas mix the run change with a universe change; interpret with care.
                </GuardBanner>
            )}
            {lens.isCurrentEquity && !dataUnavailable && (
                <GuardBanner tone="muted">
                    Page is on Current Equity, but Δ is computed on Raw R — Current-Equity contribution deltas are sequence-dependent and are suppressed here.
                </GuardBanner>
            )}

            {/* Body — Stacked (Side B table + Δ summary) or Inline (A values + Δ columns) */}
            {!dataUnavailable && !isInline && (
                <>
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                            <Layers className="w-3 h-3 text-[hsl(var(--accent-secondary))]" />
                            <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">
                                B · {comparedName} · {sideBUniverseLabel} · {comparedTrades.length} trades
                            </span>
                        </div>
                        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
                            <CanonicalBucketTable
                                testId={testId ? `${testId}-sideB` : undefined}
                                bare
                                rawRows={comparedRows}
                                trades={comparedTrades}
                                def={bucketDef}
                                renderers={renderers}
                            />
                        </div>
                    </div>

                    <DeltaSummary
                        comparison={comparison}
                        metricDefs={metricDefs}
                        testId={testId}
                        onSaveRowFinding={onSaveRowFinding}
                        canSaveFinding={canSaveFinding}
                        savedRowKeys={savedRowKeys}
                    />
                </>
            )}

            {!dataUnavailable && isInline && (
                <InlineDeltaTable
                    comparison={comparison}
                    metricDefs={metricDefs}
                    testId={testId}
                    onSaveRowFinding={onSaveRowFinding}
                    canSaveFinding={canSaveFinding}
                    savedRowKeys={savedRowKeys}
                />
            )}
        </div>
    );
}

function GuardBanner({ tone = "muted", children }) {
    const map = {
        warning: "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--text-2))]",
        muted:   "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.5)] text-muted-lab",
    };
    return (
        <div className={cn("flex items-start gap-2 border clip-bevel-sm px-2.5 py-1.5 text-[10.5px] leading-relaxed", map[tone] || map.muted)}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
            <span>{children}</span>
        </div>
    );
}

// ─── Δ summary table ────────────────────────────────────────────────────────────

function statusLabel(status) {
    if (status === "only_current") return "only in A";
    if (status === "only_compared") return "only in B";
    return null;
}

// WF-7 — per-row "save as finding" control. Disabled (with tooltip) when the
// active run isn't linked to a project; shows a check once saved.
function SaveFindingRowButton({ row, onSaveRowFinding, canSaveFinding, savedRowKeys }) {
    const saved = savedRowKeys?.has?.(row.key);
    // Don't offer save for rows that exist on only one side (no real delta).
    if (row.status && row.status !== "matched") {
        return <span className="text-muted-lab text-[10px]">—</span>;
    }
    if (saved) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-ui text-[hsl(var(--success))]" data-testid="table-compare-finding-saved">
                <Check className="w-3 h-3" /> Saved
            </span>
        );
    }
    return (
        <button
            type="button"
            data-testid="table-compare-save-finding"
            onClick={() => canSaveFinding && onSaveRowFinding?.(row)}
            disabled={!canSaveFinding}
            title={canSaveFinding ? "Save this bucket comparison as a project finding" : "Link this run to a project to save findings"}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-ui uppercase tracking-wider border clip-bevel-sm transition-colors",
                canSaveFinding
                    ? "border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.10)]"
                    : "border-[hsl(var(--border-soft))] text-muted-lab opacity-50 cursor-not-allowed",
            )}
        >
            <Lightbulb className="w-3 h-3" /> Save
        </button>
    );
}

function DeltaSummary({ comparison, metricDefs, testId, onSaveRowFinding, canSaveFinding, savedRowKeys }) {
    const { rows, summary } = comparison;

    const columns = React.useMemo(() => {
        const cols = [
            {
                key: "label",
                label: "Bucket",
                sortable: false,
                render: (r) => {
                    const note = statusLabel(r.status);
                    return (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="text-[hsl(var(--text-2))]">{r.key}</span>
                            {note && <Pill tone="muted">{note}</Pill>}
                        </span>
                    );
                },
            },
            {
                key: "n",
                label: "N (A→B)",
                align: "right",
                sortable: false,
                render: (r) => {
                    const a = r.current?.count ?? r.current?.rows;
                    const b = r.compared?.count ?? r.compared?.rows;
                    return (
                        <span className="font-ui text-[11px] text-muted-lab">
                            {a == null ? "—" : a}<span className="opacity-50"> → </span>{b == null ? "—" : b}
                        </span>
                    );
                },
            },
        ];
        for (const def of metricDefs) {
            cols.push({
                key: def.key,
                label: `Δ ${def.label}`,
                align: "right",
                sortable: false,
                render: (r) => <DeltaCell def={def} delta={r.deltas[def.key]} />,
            });
        }
        cols.push({
            key: "__save",
            label: "",
            align: "right",
            sortable: false,
            render: (r) => (
                <SaveFindingRowButton
                    row={r}
                    onSaveRowFinding={onSaveRowFinding}
                    canSaveFinding={canSaveFinding}
                    savedRowKeys={savedRowKeys}
                />
            ),
        });
        return cols;
    }, [metricDefs, onSaveRowFinding, canSaveFinding, savedRowKeys]);

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Δ Summary (A − B)</span>
                <Pill tone="muted">{summary.matched} matched</Pill>
                {summary.onlyCurrent > 0 && <Pill tone="warning">{summary.onlyCurrent} only in A</Pill>}
                {summary.onlyCompared > 0 && <Pill tone="warning">{summary.onlyCompared} only in B</Pill>}
                {summary.countDivergencePct >= 30 && (
                    <Pill tone="danger">Δ sample {summary.countDivergencePct}%</Pill>
                )}
            </div>
            <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
                <DataTable
                    testId={testId ? `${testId}-delta` : undefined}
                    columns={columns}
                    rows={rows}
                    rowKey="key"
                    maxHeight={260}
                />
            </div>
        </div>
    );
}

function DeltaCell({ def, delta }) {
    if (!delta || delta.value == null) {
        return <span className="text-muted-lab">—</span>;
    }
    const text = formatCompareDelta(def, delta);
    const cls = delta.better === true
        ? "text-[hsl(var(--success))]"
        : delta.better === false
            ? "text-[hsl(var(--danger))]"
            : "text-[hsl(var(--text-2))]"; // neutral (e.g. count) or flat
    return <span className={cn("font-num tabular-nums", cls)}>{text}</span>;
}

// ─── Inline Δ table (TC-3) ──────────────────────────────────────────────────────
// One Side-A-based table that shows each metric's value AND its delta beside it.
// Values come from Side A (`row.current`); deltas reuse the exact buildTableComparison
// output (no delta math duplicated). Only-A / only-B rows are handled explicitly so
// no fake Side-A values are shown for buckets that exist only in B.

function fmtPF(v) {
    if (v == null) return "∞";              // legacy convention: null = no losses
    if (!Number.isFinite(v)) return "—";
    return Number(v).toFixed(2);
}

function InlineBaseCell({ metricKey, row }) {
    const src = row.current; // Side A only — never B (would be a fake A value)
    if (!src) return <span className="text-muted-lab">—</span>;
    switch (metricKey) {
        case "count":
            return <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{src.count ?? src.rows ?? "—"}</span>;
        case "winRate":
            return <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{src.winRate == null ? "—" : `${Number(src.winRate).toFixed(1)}%`}</span>;
        case "netR":
            return src.netR == null ? <span className="text-muted-lab">—</span> : <ColoredR value={Number(src.netR)} />;
        case "expectancy": {
            if (src.expectancy == null) return <span className="text-muted-lab">—</span>;
            const v = Number(src.expectancy);
            return <span className={cn("font-num tabular-nums", v >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]")}>{`${v >= 0 ? "+" : ""}${v.toFixed(3)}`}</span>;
        }
        case "profitFactor":
            return <span className="font-num tabular-nums text-[hsl(var(--text-2))]">{fmtPF(src.profitFactor)}</span>;
        default:
            return <span className="text-muted-lab">—</span>;
    }
}

function InlineDeltaCell({ def, row }) {
    if (row.status === "only_current") return <span className="text-muted-lab text-[10px] font-ui">Only A</span>;
    if (row.status === "only_compared") return <span className="text-muted-lab text-[10px] font-ui">Only B</span>;
    return <DeltaCell def={def} delta={row.deltas[def.key]} />;
}

function InlineDeltaTable({ comparison, metricDefs, testId, onSaveRowFinding, canSaveFinding, savedRowKeys }) {
    const { rows, summary } = comparison;

    const columns = React.useMemo(() => {
        const byKey = Object.fromEntries(metricDefs.map((d) => [d.key, d]));
        const active = INLINE_METRIC_ORDER.map((k) => byKey[k]).filter(Boolean);
        const cols = [
            {
                key: "label",
                label: "Bucket",
                sortable: false,
                render: (r) => {
                    const note = statusLabel(r.status);
                    return (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="text-[hsl(var(--text-2))]">{r.key}</span>
                            {note && <Pill tone="muted">{note}</Pill>}
                        </span>
                    );
                },
            },
        ];
        for (const def of active) {
            // value column
            cols.push({
                key: `v_${def.key}`,
                label: def.label,
                align: "right",
                sortable: false,
                render: (r) => <InlineBaseCell metricKey={def.key} row={r} />,
            });
            // delta column beside it
            cols.push({
                key: `d_${def.key}`,
                label: `Δ ${def.label}`,
                align: "right",
                sortable: false,
                render: (r) => <InlineDeltaCell def={def} row={r} />,
            });
        }
        cols.push({
            key: "__save",
            label: "",
            align: "right",
            sortable: false,
            render: (r) => (
                <SaveFindingRowButton
                    row={r}
                    onSaveRowFinding={onSaveRowFinding}
                    canSaveFinding={canSaveFinding}
                    savedRowKeys={savedRowKeys}
                />
            ),
        });
        return cols;
    }, [metricDefs, onSaveRowFinding, canSaveFinding, savedRowKeys]);

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Inline Δ (value · A − B)</span>
                <Pill tone="muted">{summary.matched} matched</Pill>
                {summary.onlyCurrent > 0 && <Pill tone="warning">{summary.onlyCurrent} only in A</Pill>}
                {summary.onlyCompared > 0 && <Pill tone="warning">{summary.onlyCompared} only in B</Pill>}
                {summary.countDivergencePct >= 30 && (
                    <Pill tone="danger">Δ sample {summary.countDivergencePct}%</Pill>
                )}
            </div>
            <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm">
                <DataTable
                    testId={testId ? `${testId}-inline` : undefined}
                    columns={columns}
                    rows={rows}
                    rowKey="key"
                    maxHeight={300}
                />
            </div>
        </div>
    );
}

export default TableCompareShell;
