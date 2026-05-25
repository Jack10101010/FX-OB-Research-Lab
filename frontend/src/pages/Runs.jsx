import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Field, NeonSelect, NeonInput } from "@/components/lab/controls";
import { useDataset, updateRunBundle, deleteRunBundle, clearAllRuns, getRunsBackupPayload, getRunDisplayName, compactTimeframe, formatRunDateRange } from "@/data/store";
import { Check, Download, Edit3, ShieldAlert, Trash2, X } from "lucide-react";

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
    const { RUNS, PROJECTS, importedCount, persistWarning, candlePersistenceNotice, getRunData } = useDataset();
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
    const [editingId, setEditingId] = useState("");
    const [editName, setEditName] = useState("");

    const runStoreId = (run) => run?._bundleId || run?.id;

    useEffect(() => {
        try {
            localStorage.setItem("fxob_runs_sort_v1", sort);
        } catch {}
    }, [sort]);

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

    const filtered = useMemo(() => {
        const arr = RUNS.map((run, index) => ({ run: enrichRunMetrics(run, getRunData), index })).filter(({ run: r }) => {
            if (symbol !== "All" && r.symbol !== symbol) return false;
            if (tf !== "All" && r.detectionTf !== tf) return false;
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
            <PageHeader
                eyebrow="RUNS INVENTORY"
                title="All Backtest Runs"
                subtitle={`${filtered.length} run${filtered.length === 1 ? "" : "s"} matching filters`}
            />

            <div className="px-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
                <Field label="Symbol"><NeonSelect testId="runs-symbol" value={symbol} onChange={setSymbol} options={["All", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"]} /></Field>
                <Field label="Timeframe"><NeonSelect value={tf} onChange={setTf} options={["All", "M5", "M15", "M30", "H1"]} /></Field>
                <Field label="Execution Mode"><NeonSelect value={mode} onChange={setMode} options={["All", "single_position", "one_per_direction", "allow_multi_position"]} /></Field>
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
                    <Pill tone="muted">{filtered.length} rows</Pill>
                    {importedCount > 0 && <Pill tone="primary">{importedCount} imported</Pill>}
                    <button
                        type="button"
                        onClick={downloadRunsBackup}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-50 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        <Download className="w-3 h-3" />
                        Export Backup
                    </button>
                    <button
                        type="button"
                        onClick={deleteImportedRuns}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.55)] hover:text-[hsl(var(--danger))] disabled:opacity-40 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        Delete Imported
                    </button>
                    <button
                        type="button"
                        onClick={deleteAllRuns}
                        disabled={!importedCount}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.55)] hover:text-[hsl(var(--danger))] disabled:opacity-40 disabled:cursor-not-allowed clip-bevel-sm"
                    >
                        Delete All Runs
                    </button>
                </div>
            </div>

            {persistWarning && (
                <div className="px-6 mb-3">
                    <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                            Some run data may not have been persisted because browser storage is full. Export a backup or re-import from output folders.
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
                                    saveRename={saveRename}
                                    cancelRename={cancelRename}
                                />
                            ) },
                            { key: "symbol",      label: "Symbol" },
                            { key: "projectName", label: "Project", render: (r) => <ProjectLabel run={r} /> },
                            { key: "detectionTf", label: "TF", render: (r) => compactTimeframe(r.detectionTf) },
                            { key: "dateRange",   label: "Date Range", render: (r) => formatRunDateRange(r.dateRange) },
                            { key: "rr",          label: "RR",         align: "right", render: (r) => r.rr.toFixed(1) },
                            { key: "trades",      label: "Trades",     align: "right", render: (r) => r.validTradeCount ?? r.trades ?? "—" },
                            { key: "winRate",     label: "WR",         align: "right", render: (r) => `${r.winRate.toFixed(1)}%` },
                            { key: "netR",        label: "Net R",      align: "right", render: (r) => <ColoredR value={r.netR} /> },
                            { key: "maxDd",       label: "Max DD",     align: "right", render: (r) => <MaxDdValue value={r.maxDd} /> },
                            { key: "validation",  label: "Val",        align: "right", render: (r) => <span className="text-[hsl(var(--success))]">{r.validation.toFixed(1)}%</span> },
                        ]}
                        rows={filtered}
                        rowKey="id"
                    />
                    {!filtered.length && (
                        <div className="py-10 text-center">
                            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-lab">No Real Runs</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">
                                Import a completed run or launch one from Strategy Builder to populate this table.
                            </div>
                        </div>
                    )}
                </NeonPanel>
            </div>
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
    const validTrades = Array.isArray(trades) ? trades.filter(isValidExecutedTrade) : null;
    if (!validTrades) return {};
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

function RunNameCell({ run, editingId, editName, setEditName, startRename, deleteRun, saveRename, cancelRename }) {
    const label = getRunDisplayName(run);
    const storeId = run._bundleId || run.id;
    const identityTitle = [
        `App ID: ${storeId}`,
        run.originalRunId && run.originalRunId !== storeId ? `Source ID: ${run.originalRunId}` : null,
        run.sourceOutputFolder || run.outputFolder ? `Folder: ${run.sourceOutputFolder || run.outputFolder}` : null,
    ].filter(Boolean).join("\n");
    const isEditing = editingId === storeId;
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
            {run.candlesStorage === "indexeddb" && <Pill tone="secondary">Candles stored</Pill>}
            {run._source === "imported" && (
                <>
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
            {run.runRole && <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{run.runRole}</span>}
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
