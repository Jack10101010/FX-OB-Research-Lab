import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Field, NeonSelect, NeonInput } from "@/components/lab/controls";
import { useDataset, updateRunBundle, deleteRunBundle, clearAllRuns, getRunsBackupPayload, importRunsBackup, getRunDisplayName, compactTimeframe, formatRunDateRange, reloadFullRunFromSidecar, autoReloadIndexedRunsFromSidecar } from "@/data/store";
import { Check, Copy, Download, Edit3, RefreshCw, ShieldAlert, Trash2, Upload, X } from "lucide-react";
import { summarizeBeCoverage } from "@/components/lab/researchBanner/bannerRun";
import RunBatchSection from "@/components/lab/runs/RunBatchSection";

const RUN_SORT_OPTIONS = [
    { value: "created_asc", label: "Created ↑ oldest first" },
    { value: "created_desc", label: "Created ↓ newest first" },
    { value: "netR_desc", label: "Net R ↓ best first" },
    { value: "netR_asc", label: "Net R ↑ worst first" },
    { value: "maxDd_desc", label: "Max DD ↓ worst first" },
    { value: "maxDd_asc", label: "Max DD ↑ best first" },
    { value: "trades_desc", label: "Trades ↓ most first" },
    { value: "trades_asc", label: "Trades ↑ fewest first" },
];

function normalizeRunsSort(value) {
    return RUN_SORT_OPTIONS.some((option) => option.value === value) ? value : "created_asc";
}

export default function Runs() {
    const { RUNS, PROJECTS, importedCount, persistWarning, candlePersistenceNotice, getRunData, autoReloadInProgress, autoReloadFailedCount } = useDataset();
    const [symbol, setSymbol] = useState("All");
    const [tf, setTf] = useState("All");
    const [mode, setMode] = useState("All");
    const [project, setProject] = useState("All");
    const [sort, setSort] = useState(() => {
        try {
            return normalizeRunsSort(localStorage.getItem("fxob_runs_sort_v1"));
        } catch {
            return "created_asc";
        }
    });
    const [q, setQ] = useState("");
    const [viewMode, setViewMode] = useState(() => {
        try {
            return localStorage.getItem("fxob_runs_view_v1") === "cards" ? "cards" : "table";
        } catch {
            return "table";
        }
    });
    const [editingId, setEditingId] = useState("");
    const [editName, setEditName] = useState("");
    const [reloadBusyId, setReloadBusyId] = useState("");
    const [reloadError, setReloadError] = useState("");
    const restoreInputRef = useRef(null);
    const [restoreMsg, setRestoreMsg] = useState(null); // { tone, text }

    const runStoreId = (run) => run?._bundleId || run?.id;

    const handleRestoreFile = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let payload;
            try {
                payload = JSON.parse(String(reader.result || ""));
            } catch {
                setRestoreMsg({ tone: "error", text: "Invalid file: not valid JSON." });
                return;
            }
            const result = importRunsBackup(payload);
            if (!result.ok) {
                setRestoreMsg({ tone: "error", text: result.error || "Restore failed." });
                return;
            }
            const parts = [`Imported ${result.imported} run${result.imported === 1 ? "" : "s"}`];
            if (result.skipped) parts.push(`${result.skipped} skipped`);
            if (result.projectsImported) parts.push(`${result.projectsImported} project${result.projectsImported === 1 ? "" : "s"}`);
            setRestoreMsg({ tone: result.imported ? "success" : "warning", text: `${parts.join(" · ")}.` });
        };
        reader.onerror = () => setRestoreMsg({ tone: "error", text: "Could not read the selected file." });
        reader.readAsText(file);
    };

    useEffect(() => {
        autoReloadIndexedRunsFromSidecar().catch((error) => {
            console.debug("[Runs] auto reload failed", error);
        });
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem("fxob_runs_sort_v1", sort);
        } catch {}
    }, [sort]);

    useEffect(() => {
        try {
            localStorage.setItem("fxob_runs_view_v1", viewMode);
        } catch {}
    }, [viewMode]);

    const startRename = (event, run) => {
        event?.preventDefault();
        event?.stopPropagation();
        const id = runStoreId(run);
        if (!id || run._source !== "imported") return;
        setEditingId(id);
        setEditName(getRunDisplayName(run));
    };
    const cancelRename = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        setEditingId("");
        setEditName("");
    };
    const saveRename = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        const name = editName.trim();
        if (!editingId || !name) return;
        updateRunBundle(editingId, {
            displayName: name,
            name,
            summary: { displayName: name, name },
        });
        cancelRename();
    };
    const deleteRun = (event, run) => {
        event?.preventDefault();
        event?.stopPropagation();
        const id = runStoreId(run);
        if (!id || run._source !== "imported") return;
        if (!confirmDelete("Delete this run?")) return;
        if (editingId === id) cancelRename();
        deleteRunBundle(id);
    };
    const deleteImportedRuns = () => {
        if (!confirmDelete("Delete all imported/sidecar runs?")) return;
        clearAllRuns();
    };
    const deleteAllRuns = () => {
        if (!confirmDelete("Delete all runs?")) return;
        clearAllRuns();
    };
    const reloadFullRun = async (event, run) => {
        event?.preventDefault();
        event?.stopPropagation();
        const id = runStoreId(run);
        if (!id) {
            setReloadError("Could not reload full run data from sidecar. Make sure sidecar is running and output folder exists.");
            return;
        }
        setReloadBusyId(id);
        setReloadError("");
        try {
            await reloadFullRunFromSidecar(id);
        } catch (error) {
            const detail = error?.message ? ` (${error.message})` : "";
            setReloadError(`Could not reload full run data from sidecar. Make sure sidecar is running and output folder exists.${detail}`);
        } finally {
            setReloadBusyId("");
        }
    };

    // Dynamic filter options derived from actual RUNS data.
    const symbolOptions = useMemo(() => {
        const unique = [...new Set((RUNS || []).map((r) => r.symbol).filter(Boolean))].sort();
        return ["All", ...unique];
    }, [RUNS]);

    const tfOptions = useMemo(() => {
        const unique = [...new Set((RUNS || []).map((r) => compactTimeframe(r.detectionTf)).filter(Boolean))].sort();
        return ["All", ...unique];
    }, [RUNS]);

    const modeOptions = useMemo(() => {
        const unique = [...new Set((RUNS || []).map((r) => r.executionMode).filter(Boolean))].sort();
        return ["All", ...unique];
    }, [RUNS]);

    const filtered = useMemo(() => {
        const arr = RUNS.map((run, index) => ({ run: enrichRunMetrics(run, getRunData), index })).filter(({ run: r }) => {
            if (symbol !== "All" && r.symbol !== symbol) return false;
            if (tf !== "All" && compactTimeframe(r.detectionTf) !== tf) return false;
            if (mode !== "All" && r.executionMode !== mode) return false;
            if (project === "Unassigned" && r.projectId) return false;
            if (project !== "All" && project !== "Unassigned" && r.projectId !== project) return false;
            const haystack = `${r.id} ${r._bundleId || ""} ${r.displayName || ""} ${r.name || ""} ${r.projectName || ""} ${r.runRole || ""}`.toLowerCase();
            if (q && !haystack.includes(q.toLowerCase())) return false;
            return true;
        });
        return arr.sort((a, b) => compareRuns(a, b, sort)).map(({ run }) => run);
    }, [symbol, tf, mode, project, sort, q, RUNS, getRunData]);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Runs Inventory"
                title="All Backtest Runs"
                description={`${filtered.length} run${filtered.length === 1 ? "" : "s"} matching filters`}
            />

            <div className="px-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
                <Field label="Symbol"><NeonSelect testId="runs-symbol" value={symbol} onChange={setSymbol} options={symbolOptions} /></Field>
                <Field label="Timeframe"><NeonSelect value={tf} onChange={setTf} options={tfOptions} /></Field>
                <Field label="Execution Mode"><NeonSelect value={mode} onChange={setMode} options={modeOptions} /></Field>
                <Field label="Project">
                    <NeonSelect
                        value={project}
                        onChange={setProject}
                        options={[
                            { value: "All", label: "All" },
                            { value: "Unassigned", label: "Unassigned" },
                            ...(PROJECTS || []).map((p) => ({ value: p.id, label: p.name })),
                        ]}
                    />
                </Field>
                <Field label="Search Run"><NeonInput data-testid="runs-search" placeholder="EURUSD · M15…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            </div>

            <div className="px-6 mb-3 flex items-center justify-between gap-3 flex-wrap">
                <Field label="Sort">
                    <NeonSelect
                        testId="runs-sort"
                        value={sort}
                        onChange={(value) => setSort(normalizeRunsSort(value))}
                        options={RUN_SORT_OPTIONS}
                    />
                </Field>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded border border-[hsl(var(--border-soft))] overflow-hidden" role="group" aria-label="Runs view">
                        {["table", "cards"].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                data-testid={`runs-view-${mode}`}
                                onClick={() => setViewMode(mode)}
                                className="px-2 py-1 text-[10px] font-ui capitalize"
                                style={viewMode === mode
                                    ? { background: "hsl(var(--accent-primary))", color: "hsl(var(--bg-0,var(--panel)))" }
                                    : { color: "hsl(var(--text-2))" }}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                    <Pill tone="muted">{filtered.length} runs</Pill>
                    {importedCount > 0 && <Pill tone="primary">{importedCount} imported</Pill>}
                    <button
                        type="button"
                        onClick={downloadRunsBackup}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-50 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        <Download className="w-3 h-3" />
                        Export Backup
                    </button>
                    <button
                        type="button"
                        onClick={() => restoreInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.45)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)] hover:bg-[hsl(var(--accent-primary)/0.12)] clip-bevel-sm"
                    >
                        <Upload className="w-3 h-3" />
                        Restore Backup
                    </button>
                    <input
                        ref={restoreInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleRestoreFile}
                        className="hidden"
                        data-testid="runs-restore-backup-input"
                    />
                    <button
                        type="button"
                        onClick={deleteImportedRuns}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.55)] hover:text-[hsl(var(--danger))] disabled:opacity-40 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        Delete Imported
                    </button>
                    <button
                        type="button"
                        onClick={deleteAllRuns}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.55)] hover:text-[hsl(var(--danger))] disabled:opacity-40 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        Delete All Runs
                    </button>
                </div>
            </div>

            {restoreMsg && (
                <div className="px-6 mb-3">
                    <div
                        className={`text-[11px] leading-relaxed font-ui clip-bevel-sm px-3 py-2 border ${
                            restoreMsg.tone === "error"
                                ? "border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] text-[hsl(var(--danger))]"
                                : restoreMsg.tone === "warning"
                                    ? "border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))]"
                                    : "border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.06)] text-[hsl(var(--accent-primary))]"
                        }`}
                    >
                        {restoreMsg.text}
                    </div>
                </div>
            )}

            {persistWarning && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            {persistWarning}
                        </span>
                    </div>
                </div>
            )}
            {!persistWarning && candlePersistenceNotice && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--accent-secondary)/0.3)] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))]" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            {candlePersistenceNotice}
                        </span>
                    </div>
                </div>
            )}
            {reloadError && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            {reloadError}
                        </span>
                    </div>
                </div>
            )}
            {autoReloadInProgress && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--accent-secondary)/0.3)] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm px-3 py-2">
                        <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))] animate-spin" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            Reloading saved runs from sidecar...
                        </span>
                    </div>
                </div>
            )}
            {!autoReloadInProgress && autoReloadFailedCount > 0 && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            Sidecar unavailable for {autoReloadFailedCount} run{autoReloadFailedCount === 1 ? "" : "s"}. Start sidecar to reload full run data.
                        </span>
                    </div>
                </div>
            )}

            {viewMode === "cards" ? (
                <div className="px-6 space-y-3" data-testid="runs-cards">
                    {filtered.map((r) => (
                        <RunBatchSection key={r.id} run={r} getRunData={getRunData} />
                    ))}
                    {!filtered.length && (
                        <div className="py-10 text-center">
                            <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Real Runs</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">
                                Import a completed run or launch one from Strategy Builder to populate this view.
                            </div>
                        </div>
                    )}
                </div>
            ) : (
            <div className="px-6">
                <NeonPanel dense>
                    <DataTable
                        testId="runs-table"
                        columns={[
                            { key: "id",          label: "Run",     render: (r) => (
                                <RunNameCell
                                    run={r}
                                    editingId={editingId}
                                    editName={editName}
                                    setEditName={setEditName}
                                    startRename={startRename}
                                    deleteRun={deleteRun}
                                    reloadFullRun={reloadFullRun}
                                    reloadBusyId={reloadBusyId}
                                    saveRename={saveRename}
                                    cancelRename={cancelRename}
                                />
                            ) },
                            { key: "symbol",      label: "Symbol" },
                            { key: "projectName", label: "Project", render: (r) => <ProjectLabel run={r} /> },
                            { key: "detectionTf", label: "TF", render: (r) => compactTimeframe(r.detectionTf) },
                            { key: "dateRange",   label: "Date Range", render: (r) => formatRunDateRange(r.dateRange) },
                            { key: "rr",          label: "RR",         align: "right", tip: "rr", render: (r) => formatNumericCell(r.rr, 1) },
                            { key: "trades",      label: "Trades",     align: "right", render: (r) => formatIntegerCell(r.validTradeCount ?? r.trades) },
                            { key: "winRate",     label: "WR",         align: "right", render: (r) => formatPercentCell(r.winRate, 1) },
                            { key: "netR",        label: "Net R",      align: "right", render: (r) => <SafeColoredR value={r.netR} /> },
                            { key: "be",          label: "BE",         align: "center", render: (r) => <BeCell coverage={r.beCoverage} /> },
                            { key: "maxDd",       label: "Max DD",     align: "right", render: (r) => <MaxDdValue value={r.maxDd} /> },
                            { key: "validation",  label: "Val",        align: "right", render: (r) => <span className="text-[hsl(var(--success))]">{formatPercentCell(r.validation, 1)}</span> },
                        ]}
                        rows={filtered}
                        rowKey="id"
                    />
                    {!filtered.length && (
                        <div className="py-10 text-center">
                            <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Real Runs</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">
                                Import a completed run or launch one from Strategy Builder to populate this table.
                            </div>
                        </div>
                    )}
                </NeonPanel>
            </div>
            )}
        </div>
    );
}

function runCreatedTime(run) {
    const value = run?.createdAt
        || run?.created_at
        || run?.importedAt
        || run?.imported_at
        || run?.started_at
        || run?.startedAt
        || run?.summary?.createdAt
        || run?.summary?.created_at
        || run?.summary?.importedAt
        || run?.summary?.imported_at
        || run?.summary?.started_at
        || run?.summary?.startedAt;
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
}

function runMetricValue(run, key) {
    if (key === "trades" && run?.validTradeCount != null) return run.validTradeCount;
    const value = run?.[key] ?? run?.summary?.[key];
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function isValidExecutedTrade(trade) {
    const outcome = String(trade?.outcome || trade?.result || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const missedReason = String(trade?.missed_reason || trade?.missedReason || "").trim();
    const entryTime = trade?.entry || trade?.fill_time || trade?.fillTime || trade?.entry_time || trade?.entryTime;
    if (!entryTime) return false;
    if (trade?.missed_trade || trade?.missedTrade || missedReason) return false;
    if (["SESSION_FILTERED", "NEWS_TOUCH_CANCEL", "NEWS_BLACKOUT", "UNFILLED", "INVALIDATED"].some((key) => outcome.includes(key))) return false;
    return true;
}

function computeValidTradeMetrics(trades) {
    // LARGE-RUN-IMPORT Phase 2C — a lazy/index-only run carries trades:[] (rows
    // not resident). Treat "no resident rows" as unknown so the caller falls back
    // to the summary-derived count, instead of overriding it with a hard 0.
    if (!Array.isArray(trades) || trades.length === 0) return {};
    const validTrades = trades.filter(isValidExecutedTrade);
    let cumR = 0;
    let peak = 0;
    let worstDrawdown = 0;
    validTrades.forEach((trade) => {
        cumR += Number(trade.r ?? trade.pnl_r ?? trade.news_flatten_r) || 0;
        if (cumR > peak) peak = cumR;
        const drawdown = cumR - peak;
        if (drawdown < worstDrawdown) worstDrawdown = drawdown;
    });
    return {
        validTradeCount: validTrades.length,
        maxDd: validTrades.length ? Number(worstDrawdown.toFixed(2)) : null,
    };
}

function runStoreId(run) {
    return run?._bundleId || run?.id;
}

function enrichRunMetrics(run, getRunData) {
    const bundle = typeof getRunData === "function" ? getRunData(runStoreId(run)) : null;
    const tradeMetrics = computeValidTradeMetrics(bundle?.trades);
    const fallbackMaxDd = runMetricValue(run, "maxDd")
        ?? runMetricValue(run, "maxDD")
        ?? runMetricValue(run, "max_drawdown")
        ?? runMetricValue(run, "maxDrawdown");
    const normalizedFallbackDd = fallbackMaxDd == null ? null : (fallbackMaxDd > 0 ? -fallbackMaxDd : fallbackMaxDd);
    return {
        ...run,
        validTradeCount: tradeMetrics.validTradeCount ?? runMetricValue(run, "trades"),
        maxDd: tradeMetrics.maxDd ?? normalizedFallbackDd,
        // BE coverage: bundle's loaded maps (beTradesByMode/beResults) plus the
        // beScenarioIndex from the bundle or the index row, so eager AND lazy/cube
        // runs both report BE without forcing a load.
        beCoverage: summarizeBeCoverage({
            beTradesByMode: bundle?.beTradesByMode,
            beResults: bundle?.beResults,
            beScenarioIndex: bundle?.beScenarioIndex || run?.beScenarioIndex,
        }),
    };
}

function compareRuns(a, b, sort) {
    const fallback = a.index - b.index;
    if (sort === "created_asc" || sort === "created_desc") {
        const av = runCreatedTime(a.run);
        const bv = runCreatedTime(b.run);
        if (av == null && bv == null) return fallback;
        if (av == null) return 1;
        if (bv == null) return -1;
        return sort === "created_asc" ? av - bv || fallback : bv - av || fallback;
    }

    const [key, direction] = String(sort || "created_asc").split("_");
    const av = runMetricValue(a.run, key);
    const bv = runMetricValue(b.run, key);
    if (av == null && bv == null) return fallback;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (key === "maxDd") return direction === "asc" ? bv - av || fallback : av - bv || fallback;
    return direction === "asc" ? av - bv || fallback : bv - av || fallback;
}

function MaxDdValue({ value }) {
    const number = Number(value);
    if (!Number.isFinite(number)) return <span className="text-muted-lab">—</span>;
    return <span className="text-[hsl(var(--danger))] tabular-nums">{`${number.toFixed(1)}R`}</span>;
}

function SafeColoredR({ value }) {
    const number = Number(value);
    if (!Number.isFinite(number)) return <span className="text-muted-lab">—</span>;
    return <ColoredR value={number} />;
}

// BE column: green tick when any break-even scenario was generated for the run;
// hover tooltip lists the entry variants (+ scenario count) BE was run for.
function BeCell({ coverage }) {
    if (!coverage || !coverage.ran) {
        return <span className="text-muted-lab" title="No break-even scenarios were generated for this run.">—</span>;
    }
    const variants = (coverage.variantLabels || []).join(", ");
    const scen = coverage.scenarioCount
        ? ` · ${coverage.scenarioCount} scenario${coverage.scenarioCount === 1 ? "" : "s"} per variant`
        : "";
    return (
        <span className="inline-flex justify-center" title={`Break-even generated for: ${variants}${scen}`}>
            <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
        </span>
    );
}

function formatNumericCell(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function formatIntegerCell(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.trunc(number)) : "—";
}

function formatPercentCell(value, digits = 1) {
    const formatted = formatNumericCell(value, digits);
    return formatted === "—" ? "—" : `${formatted}%`;
}

// Best Python-ready run path for sanity checks: prefer the backend run folder
// (outputs/runs/<folder>), fall back to the app/source run id.
function runFolderPath(run) {
    const raw = String(run?.sourceOutputFolder || run?.outputFolder || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!raw) return run?._bundleId || run?.id || "";       // no folder metadata → bare id fallback
    if (/outputs\/runs\//i.test(raw)) return raw;            // already a relative path under outputs/runs
    const folder = raw.split("/").filter(Boolean).pop();
    return folder ? `outputs/runs/${folder}` : (run?._bundleId || run?.id || "");
}

function RunNameCell({ run, editingId, editName, setEditName, startRename, deleteRun, reloadFullRun, reloadBusyId, saveRename, cancelRename }) {
    const label = getRunDisplayName(run);
    const [copied, setCopied] = useState(false);
    const copyRunPath = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const path = runFolderPath(run);
        try { navigator.clipboard?.writeText(path); } catch { /* clipboard unavailable */ }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };
    const storeId = run._bundleId || run.id;
    const identityTitle = [
        `App ID: ${storeId}`,
        run.originalRunId && run.originalRunId !== storeId ? `Source ID: ${run.originalRunId}` : null,
        run.sourceOutputFolder || run.outputFolder ? `Folder: ${run.sourceOutputFolder || run.outputFolder}` : null,
    ].filter(Boolean).join("\n");
    const isEditing = editingId === storeId;
    // RUNS-2: infer entry mode from config fields available on the index row.
    const entryModels = Array.isArray(run.config?.entry_models) ? run.config.entry_models : [];
    const isScenarioBatch = entryModels.length > 1
        || (Array.isArray(run.config?.entry_penetration_thresholds) && run.config.entry_penetration_thresholds.length > 1)
        || (Array.isArray(run.config?.triggered_edge_thresholds) && run.config.triggered_edge_thresholds.length > 1);
    if (isEditing) {
        return (
            <span className="flex items-center gap-1.5 min-w-[260px]">
                <NeonInput
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            saveRename();
                        }
                        if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            cancelRename();
                        }
                    }}
                    className="h-8 min-w-[220px]"
                    autoFocus
                />
                <button
                    type="button"
                    onClick={saveRename}
                    className="grid place-items-center w-7 h-7 clip-bevel-sm border border-[hsl(var(--success)/0.55)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]"
                    aria-label="Save run name"
                >
                    <Check className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={cancelRename}
                    className="grid place-items-center w-7 h-7 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"
                    aria-label="Cancel run rename"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </span>
        );
    }
    return (
        <span className="group/name inline-flex items-center gap-1.5" title={identityTitle}>
            <Link to={`/runs/${encodeURIComponent(storeId)}`} className="text-[hsl(var(--accent-primary))] hover:text-white">{label}</Link>
            {/* RUNS-2: only show research-relevant chips; storage internals removed */}
            {isScenarioBatch && <Pill tone="secondary">Scenario Batch</Pill>}
            {run.autoReloadStatus === "failed" && <Pill tone="warning">Auto-load failed</Pill>}
            {run._source === "imported" && !run.hasCandles && !run.candlesStorage && <Pill tone="muted">No candles</Pill>}
            {run._source === "imported" && (
                <>
                    {!run.hasFullData && run.reloadAvailable && (
                        <button
                            type="button"
                            onClick={(event) => reloadFullRun(event, run)}
                            disabled={reloadBusyId === storeId}
                            className="inline-flex items-center gap-1 px-1.5 h-6 clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.07)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-60"
                            aria-label="Reload full run data"
                            title="Reload full run data from sidecar now. Run Detail will also auto-load it when opened."
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${reloadBusyId === storeId ? "animate-spin" : ""}`} />
                            <span className="text-[10px] font-medium">Reload</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={copyRunPath}
                        className="grid place-items-center w-6 h-6 opacity-0 group-hover/name:opacity-100 group-focus-within/name:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white transition-opacity"
                        aria-label="Copy run path"
                        title={copied ? "Copied run path" : "Copy run path"}
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={(event) => startRename(event, run)}
                        className="grid place-items-center w-6 h-6 opacity-0 group-hover/name:opacity-100 group-focus-within/name:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white transition-opacity"
                        aria-label="Rename run"
                    >
                        <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => deleteRun(event, run)}
                        className="grid place-items-center w-6 h-6 opacity-0 group-hover/name:opacity-100 group-focus-within/name:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.65)] hover:text-[hsl(var(--danger))] transition-opacity"
                        aria-label="Delete run"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </>
            )}
        </span>
    );
}

function ProjectLabel({ run }) {
    if (run._source !== "imported") return <span className="text-muted-lab">—</span>;
    if (!run.projectId) return <Pill tone="muted">Unassigned</Pill>;
    return (
        <span className="inline-flex items-center gap-1.5">
            <Pill tone="secondary">{run.projectName || "Project"}</Pill>
            {run.runRole && <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{run.runRole}</span>}
        </span>
    );
}

function downloadRunsBackup() {
    const payload = getRunsBackupPayload();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fxob_runs_backup_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function confirmDelete(title) {
    return window.confirm(`${title} This removes it from the app. Export a backup first if you want to keep it.`);
}
