import React, { useEffect, useMemo, useRef, useState } from "react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Field, NeonInput, NeonToggle, Segment } from "@/components/lab/controls";
import { ResultsLensControl } from "@/components/lab/ResultsLensControl";
import { useTheme, THEMES } from "@/context/ThemeContext";
import { ImportZone } from "@/components/lab/ImportZone";
import { Pill } from "@/components/lab/DataTable";
import { getLatestSidecarOutputs, getSidecarHealth, getSidecarRun, startSidecarRun, DEFAULT_SIDECAR_URL } from "@/data/sidecarClient";
import { getRunsBackupPayload, getStorageDiagnostics, getIndexedDbDiagnostics, importRunsBackup, useDataset } from "@/data/store";
import { Check, Database, Download, HardDrive, PlugZap, ShieldAlert, Sparkles, Upload } from "lucide-react";

const RUNNER_PRESETS = ["baseline", "protection sweep", "entry penetration sweep", "session filter sweep", "custom config"];
const REIMPORT_REMINDER = "After running, import the latest outputs/runs folder back into Research Lab.";
const TEST_CONFIG = {
    symbol: "EURUSD",
    start_date: "2025-01-01",
    end_date: "2025-01-31",
    news_blackout_enabled: true,
    news_file: "data/news/master_economic_calendar_2020_present.csv",
    news_blackout_minutes_before: 15,
    news_blackout_minutes_after: 15,
    news_blackout_impacts: ["high"],
};

export default function Settings() {
    const { persistWarning, importedCount, activeRunId, RUNS, ACTIVE_RUN } = useDataset();
    const { theme, setTheme } = useTheme();
    const restoreInputRef = useRef(null);
    const [restoreMsg, setRestoreMsg] = useState(null); // { tone: "success"|"warning"|"error", text }
    const storageOrigin = typeof window !== "undefined" ? window.location.origin : "—";
    const activeRunName = (RUNS || []).find((r) => r.id === activeRunId)?.displayName
        || (ACTIVE_RUN && ACTIVE_RUN.id ? ACTIVE_RUN.displayName : "")
        || activeRunId
        || "—";

    const handleRestoreFile = (event) => {
        const file = event.target.files?.[0];
        // Reset so selecting the same file again re-triggers onChange.
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
            if (result.skipped) parts.push(`${result.skipped} skipped (already present)`);
            if (result.projectsImported) parts.push(`${result.projectsImported} project${result.projectsImported === 1 ? "" : "s"}`);
            setRestoreMsg({
                tone: result.imported ? "success" : "warning",
                text: `${parts.join(" · ")}.`,
            });
        };
        reader.onerror = () => setRestoreMsg({ tone: "error", text: "Could not read the selected file." });
        reader.readAsText(file);
    };

    // SP-3 read-only storage diagnostics. Sync snapshot from the store + an async
    // IndexedDB record count that refreshes whenever the run set changes.
    const diagnostics = getStorageDiagnostics();
    const [idbDiag, setIdbDiag] = useState(null);
    const [idbDiagError, setIdbDiagError] = useState("");
    useEffect(() => {
        let cancelled = false;
        getIndexedDbDiagnostics()
            .then((res) => {
                if (cancelled) return;
                setIdbDiag(res);
                setIdbDiagError(res.available ? "" : "IndexedDB is unavailable in this browser.");
            })
            .catch((e) => {
                if (cancelled) return;
                setIdbDiag(null);
                setIdbDiagError(e?.message || "IndexedDB diagnostics could not be read.");
            });
        return () => { cancelled = true; };
    }, [importedCount]);
    const idbBundleSet = useMemo(() => new Set(idbDiag?.bundleIds || []), [idbDiag]);
    const idbCandleSet = useMemo(() => new Set(idbDiag?.candleIds || []), [idbDiag]);
    const [dense, setDense] = useState(true);
    const [glow, setGlow] = useState(70);
    const [markerSize, setMarkerSize] = useState(6);
    const [tableDensity, setTableDensity] = useState("Compact");
    const [runnerPath, setRunnerPath] = useState("~/Documents/Dev Projects/Lux-OB-Backtester");
    const [runnerPreset, setRunnerPreset] = useState("baseline");
    const [copiedRunner, setCopiedRunner] = useState("");
    const [sidecarHealth, setSidecarHealth] = useState(null);
    const [sidecarError, setSidecarError] = useState("");
    const [sidecarBusy, setSidecarBusy] = useState("");
    const [testConfigText, setTestConfigText] = useState(JSON.stringify(TEST_CONFIG, null, 2));
    const [sidecarJob, setSidecarJob] = useState(null);
    const [latestOutputs, setLatestOutputs] = useState([]);
    const [paths, setPaths] = useState({
        runs: "outputs/runs",
        sweeps: "outputs/sweeps",
        candles: "data/candles",
        tradingview: "data/tradingview",
    });
    const sidecarStatusTone = sidecarHealth?.ok ? "success" : sidecarError ? "warning" : "muted";
    const sidecarStatusText = sidecarHealth?.ok ? "CONNECTED" : sidecarError ? "ERROR" : "NOT TESTED";
    const parsedTestConfig = useMemo(() => {
        try {
            return { ok: true, value: JSON.parse(testConfigText), error: "" };
        } catch (error) {
            return { ok: false, value: null, error: error.message };
        }
    }, [testConfigText]);
    const sidecarJobRunning = ["queued", "running"].includes(sidecarJob?.status);

    useEffect(() => {
        if (!sidecarJob?.job_id || !["queued", "running"].includes(sidecarJob.status)) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const next = await getSidecarRun(sidecarJob.job_id);
                setSidecarJob(next);
                setSidecarError("");
            } catch (error) {
                setSidecarError(error.message);
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [sidecarJob?.job_id, sidecarJob?.status]);

    const testSidecarConnection = async () => {
        setSidecarBusy("health");
        setSidecarError("");
        try {
            const health = await getSidecarHealth();
            setSidecarHealth(health);
        } catch (error) {
            setSidecarHealth(null);
            setSidecarError(error.message);
        } finally {
            setSidecarBusy("");
        }
    };

    const runTestBacktest = async () => {
        if (!parsedTestConfig.ok) {
            setSidecarError(`Invalid JSON: ${parsedTestConfig.error}`);
            return;
        }
        setSidecarBusy("run");
        setSidecarError("");
        try {
            const started = await startSidecarRun(parsedTestConfig.value);
            setSidecarJob(started);
        } catch (error) {
            setSidecarError(error.message);
        } finally {
            setSidecarBusy("");
        }
    };

    const fetchLatestOutputs = async () => {
        setSidecarBusy("outputs");
        setSidecarError("");
        try {
            const result = await getLatestSidecarOutputs();
            setLatestOutputs(Array.isArray(result?.outputs) ? result.outputs : []);
        } catch (error) {
            setSidecarError(error.message);
        } finally {
            setSidecarBusy("");
        }
    };

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Settings"
                title="Workspace Configuration"
                description="Theme, data paths, symbol metadata, display preferences."
            />

            <div className="px-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel className="xl:col-span-3" title="Results Basis · Lens" action={<Pill tone="secondary">PREVIEW</Pill>}>
                    <p className="mb-3 text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">
                        Results Basis controls how trades are measured across the app. Trade Universe answers
                        “which trades?”; Results Basis answers “how are they measured?”. This is a global preview —
                        changing it persists your preference, but analytics pages still calculate in Raw R until each
                        is migrated.
                    </p>
                    <ResultsLensControl />
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Theme">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {THEMES.map((t) => {
                            const active = theme === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTheme(t.id)}
                                    data-testid={`theme-card-${t.id}`}
                                    className={`text-left clip-bevel p-[1px] transition-all ${
                                        active
                                            ? "bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]"
                                            : "bg-gradient-to-br from-[hsl(var(--border-mid))] to-[hsl(var(--border-soft))] hover:from-[hsl(var(--accent-primary))] hover:to-[hsl(var(--accent-secondary))]"
                                    }`}
                                >
                                    <div className="clip-bevel bg-[hsl(var(--panel))] p-3 relative overflow-hidden">
                                        <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                                        <div className="relative flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.swatch[0], boxShadow: `0 0 8px ${t.swatch[0]}` }} />
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.swatch[1], boxShadow: `0 0 8px ${t.swatch[1]}` }} />
                                            {active && <Check className="w-3.5 h-3.5 text-white ml-auto" />}
                                        </div>
                                        <div className="relative mt-3 font-display text-[13px] text-white">{t.name}</div>
                                        <div className="relative text-[10px] font-ui uppercase tracking-wider text-muted-lab mt-0.5">accent · {t.id}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </NeonPanel>

                <NeonPanel title="Display">
                    <div className="space-y-3">
                        <Row label="Dense Mode" checked={dense} onChange={setDense} />
                        <Field label={`Glow Intensity (${glow}%)`}>
                            <input type="range" min="0" max="100" value={glow} onChange={(e) => setGlow(Number(e.target.value))} className="accent-[hsl(var(--accent-primary))]" />
                        </Field>
                        <Field label={`Chart Marker Size (${markerSize}px)`}>
                            <input type="range" min="3" max="12" value={markerSize} onChange={(e) => setMarkerSize(Number(e.target.value))} className="accent-[hsl(var(--accent-primary))]" />
                        </Field>
                        <Field label="Table Density">
                            <Segment options={["Compact", "Comfortable", "Spacious"]} value={tableDensity} onChange={setTableDensity} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Data Sources · Import" action={<Pill tone="primary">FILE API</Pill>}>
                    <ImportZone />
                </NeonPanel>

                <NeonPanel title="Storage Origin" action={<Pill tone="muted">THIS URL</Pill>}>
                    <div className="space-y-2">
                        <div className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            <HardDrive className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))]" />
                            <span>Browser data (imported runs, candles, preferences) is tied to this exact URL/port. Open the app on a different port and it has a separate, empty storage bucket.</span>
                        </div>
                        <SidecarMeta k="Origin" v={storageOrigin} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <SidecarMeta k="Imported runs" v={importedCount} />
                            <SidecarMeta k="Active run" v={activeRunName} />
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Storage Diagnostics" action={<Pill tone="muted">READ ONLY</Pill>}>
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">
                            <Database className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--accent-secondary))]" />
                            <span>Read-only view of what is persisted for this origin. localStorage stores a lightweight run index; full run bundles and candles are persisted in IndexedDB and hydrated on load, with sidecar reload as a fallback.</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                            <SidecarMeta k="Run index (localStorage)" v={diagnostics.indexCount} />
                            <SidecarMeta k="Full in memory" v={diagnostics.memoryFullCount} />
                            <SidecarMeta k="Index only" v={diagnostics.indexOnlyCount} />
                            <SidecarMeta k="IndexedDB bundles" v={idbDiag ? idbDiag.bundleCount : "—"} />
                            <SidecarMeta k="IndexedDB candle records" v={idbDiag ? idbDiag.candleCount : "—"} />
                            <SidecarMeta k="Active run mode" v={diagnostics.activeRunStorageMode} />
                        </div>
                        {idbDiagError && (
                            <div className="text-[11px] font-ui clip-bevel-sm px-3 py-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] text-[hsl(var(--warning))]">
                                {idbDiagError}
                            </div>
                        )}
                        {diagnostics.runs.length > 0 ? (
                            <div className="overflow-x-auto scrollbar-thin border border-[hsl(var(--border-soft))] clip-bevel-sm">
                                <table className="w-full text-[10.5px] font-ui">
                                    <thead>
                                        <tr className="text-muted-lab uppercase tracking-wider border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)]">
                                            <th className="text-left px-2 py-1.5">Run</th>
                                            <th className="text-center px-2 py-1.5">Memory</th>
                                            <th className="text-center px-2 py-1.5">IDB Bundle</th>
                                            <th className="text-center px-2 py-1.5">Candles</th>
                                            <th className="text-center px-2 py-1.5">Reload</th>
                                            <th className="text-left px-2 py-1.5">Storage Mode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diagnostics.runs.map((r) => (
                                            <tr key={r.id} className="border-b border-[hsl(var(--border-soft)/0.5)] last:border-b-0">
                                                <td className="text-left px-2 py-1.5 text-[hsl(var(--text-2))] truncate max-w-[220px]" title={r.id}>
                                                    {r.isActive && <span className="text-[hsl(var(--accent-primary))]">● </span>}
                                                    {r.displayName}
                                                </td>
                                                <td className="text-center px-2 py-1.5"><DiagDot on={r.memoryFull} /></td>
                                                <td className="text-center px-2 py-1.5">
                                                    {idbDiag ? <DiagDot on={idbBundleSet.has(r.id)} /> : <span className="text-muted-lab">—</span>}
                                                </td>
                                                <td className="text-center px-2 py-1.5">
                                                    {idbDiag
                                                        ? <DiagDot on={idbCandleSet.has(r.id) || r.candlesInMemory} />
                                                        : <DiagDot on={r.candlesInMemory || r.hasCandlesMeta} />}
                                                </td>
                                                <td className="text-center px-2 py-1.5"><DiagDot on={r.reloadAvailable} /></td>
                                                <td className="text-left px-2 py-1.5 text-muted-lab">{r.storageMode}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-[11px] font-ui text-muted-lab">No runs persisted for this origin yet.</div>
                        )}
                    </div>
                </NeonPanel>

                <NeonPanel title="Run Persistence Backup" action={<Pill tone={persistWarning ? "warning" : "success"}>{persistWarning ? "CHECK STORAGE" : "READY"}</Pill>}>
                    <div className="space-y-3">
                        {persistWarning && (
                            <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                                <span className="text-[11px] leading-relaxed text-[hsl(var(--text-2))]">
                                    Some run data may not have been persisted because browser storage is full. Export a backup or re-import from output folders.
                                </span>
                            </div>
                        )}
                        {!persistWarning && (
                            <div className="text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">
                                Imported runs are stored in browser localStorage. Export a backup before clearing browser data or switching machines.
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={downloadRunsBackup}
                                disabled={!importedCount}
                                className="inline-flex items-center gap-2 px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-50 disabled:cursor-not-allowed clip-bevel-sm"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export Runs Backup
                            </button>
                            <button
                                type="button"
                                onClick={() => restoreInputRef.current?.click()}
                                className="inline-flex items-center gap-2 px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)] hover:bg-[hsl(var(--accent-primary)/0.12)] clip-bevel-sm"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                Restore Backup
                            </button>
                            <input
                                ref={restoreInputRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={handleRestoreFile}
                                className="hidden"
                                data-testid="restore-backup-input"
                            />
                        </div>
                        {restoreMsg && (
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
                        )}
                        <div className="text-[10.5px] font-ui text-muted-lab">
                            Restore merges runs from a backup file without deleting existing runs; entries with an id
                            already present are skipped.
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Data Paths">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(paths).map(([k, v]) => (
                            <Field key={k} label={k}>
                                <NeonInput value={v} onChange={(e) => setPaths((p) => ({ ...p, [k]: e.target.value }))} />
                            </Field>
                        ))}
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Local Test Runner · Command Builder" action={<Pill tone="secondary">COPY ONLY</Pill>}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Backtester path">
                            <NeonInput value={runnerPath} onChange={(e) => setRunnerPath(e.target.value)} />
                        </Field>
                        <Field label="Preset">
                            <Segment options={RUNNER_PRESETS} value={runnerPreset} onChange={setRunnerPreset} />
                        </Field>
                    </div>
                    <div className="mt-3 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Generated command</span>
                            <Pill tone={runnerPreset === "baseline" ? "success" : "warning"}>{runnerPreset === "baseline" ? "REAL" : "FUTURE PRESET"}</Pill>
                        </div>
                        <pre className="overflow-x-auto scrollbar-thin text-[11px] font-code text-[hsl(var(--accent-secondary))] leading-relaxed whitespace-pre-wrap">
                            {runnerCommand(runnerPath, runnerPreset)}
                        </pre>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => copyText(runnerCommand(runnerPath, runnerPreset), setCopiedRunner, "command")} className="px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] clip-bevel-sm">
                            {copiedRunner === "command" ? "Copied command" : "Copy command"}
                        </button>
                        <button type="button" onClick={() => copyText(REIMPORT_REMINDER, setCopiedRunner, "reminder")} className="px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)] hover:bg-[hsl(var(--accent-primary)/0.12)] clip-bevel-sm">
                            {copiedRunner === "reminder" ? "Copied reminder" : "Copy re-import reminder"}
                        </button>
                        <button type="button" disabled className="px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-dashed border-[hsl(var(--border-mid))] text-muted-lab bg-[hsl(var(--panel-2)/0.25)] opacity-70 cursor-not-allowed clip-bevel-sm">
                            Future: Generate config JSON
                        </button>
                    </div>
                    <div className="mt-3 text-[11px] text-[hsl(var(--text-2))] font-ui">
                        {REIMPORT_REMINDER}
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Sidecar Runner · Local Backtester" action={<Pill tone={sidecarStatusTone}>{sidecarStatusText}</Pill>}>
                    <div className="space-y-3">
                        <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2 text-[11.5px] text-[hsl(var(--text-2))]">
                            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                            <span>Local sidecar only. Do not expose this server publicly.</span>
                        </div>
                        <div className="flex items-center justify-between border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2">
                            <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">Status</span>
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-ui uppercase tracking-wider ${sidecarHealth?.ok ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--warning))]"}`}>
                                <PlugZap className="w-3 h-3" />
                                {sidecarStatusText}
                            </span>
                        </div>
                        <Field label="Sidecar URL">
                            <NeonInput value={DEFAULT_SIDECAR_URL} disabled readOnly />
                        </Field>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <RunnerButton onClick={testSidecarConnection} disabled={sidecarBusy === "health"}>
                                {sidecarBusy === "health" ? "Testing..." : "Test Connection"}
                            </RunnerButton>
                            <RunnerButton onClick={runTestBacktest} disabled={sidecarBusy === "run" || sidecarJobRunning || !parsedTestConfig.ok}>
                                {sidecarBusy === "run" ? "Starting..." : "Run Test Backtest"}
                            </RunnerButton>
                            <RunnerButton onClick={fetchLatestOutputs} disabled={sidecarBusy === "outputs"}>
                                {sidecarBusy === "outputs" ? "Fetching..." : "Fetch Latest Outputs"}
                            </RunnerButton>
                        </div>

                        {sidecarError && (
                            <div className="border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] clip-bevel-sm px-3 py-2 text-[11px] font-ui text-[hsl(var(--danger))]">
                                {sidecarError}
                            </div>
                        )}

                        {sidecarHealth && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <SidecarMeta k="Backtester root" v={sidecarHealth.backtester_root} />
                                <SidecarMeta k="Python executable" v={sidecarHealth.python_executable} />
                                <SidecarMeta k="Active job" v={sidecarHealth.active_job_id || "none"} />
                            </div>
                        )}

                        <Field label="Test config JSON">
                            <textarea
                                value={testConfigText}
                                onChange={(e) => setTestConfigText(e.target.value)}
                                spellCheck={false}
                                className="w-full min-h-[220px] clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[11px] leading-relaxed font-code text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-secondary)/0.65)]"
                            />
                        </Field>
                        {!parsedTestConfig.ok && (
                            <div className="text-[11px] font-ui text-[hsl(var(--danger))]">Invalid JSON: {parsedTestConfig.error}</div>
                        )}

                        {sidecarJob && (
                            <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="text-[10px] font-ui uppercase tracking-wider text-title-lab">Run status</div>
                                    <Pill tone={sidecarJob.status === "succeeded" ? "success" : sidecarJob.status === "failed" ? "warning" : "secondary"}>{sidecarJob.status}</Pill>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                                    <SidecarMeta k="Job ID" v={sidecarJob.job_id} />
                                    <SidecarMeta k="Return code" v={sidecarJob.return_code ?? "—"} />
                                    <SidecarMeta k="Output folder" v={sidecarJob.output_folder || "—"} />
                                </div>
                                <LogBlock title="stdout tail" text={sidecarJob.stdout_tail} />
                                <LogBlock title="stderr tail" text={sidecarJob.stderr_tail} tone="warning" />
                            </div>
                        )}

                        {latestOutputs.length > 0 && (
                            <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3">
                                <div className="text-[10px] font-ui uppercase tracking-wider text-title-lab mb-2">Latest output folders</div>
                                <div className="space-y-1.5">
                                    {latestOutputs.map((output) => (
                                        <div key={output.path} className="grid grid-cols-1 md:grid-cols-[0.8fr_1.4fr_0.8fr] gap-2 text-[10.5px] font-ui text-[hsl(var(--text-2))] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-2 py-1.5">
                                            <span className="text-title-lab">{output.name}</span>
                                            <span className="font-code truncate">{output.path}</span>
                                            <span className="text-muted-lab">{output.modified_at}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-1.5">
                            {["No auto-import yet", "No arbitrary command execution", "One local sidecar job at a time"].map((item) => (
                                <div key={item} className="flex items-center gap-2 text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">
                                    <PlugZap className="w-3 h-3 text-[hsl(var(--accent-secondary))]" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel title="Symbol Metadata">
                    <div className="space-y-2 font-ui text-[11.5px]">
                        <Meta k="EURUSD · pip size" v="0.00010" />
                        <Meta k="EURUSD · tick size" v="0.00001" />
                        <Meta k="GBPUSD · pip size" v="0.00010" />
                        <Meta k="USDJPY · pip size" v="0.01000" />
                        <Meta k="XAUUSD · pip size" v="0.10000" />
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Research Safety Notes" tone="secondary">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Note icon={ShieldAlert} title="Research Only" body="This workspace is for backtest analysis. It does not connect to brokers, place orders, or run live strategies." />
                        <Note icon={ShieldAlert} title="No Live Trading" body="Live execution belongs to a separate trading dashboard outside this product. There are no kill switches or live controls here." />
                        <Note icon={Sparkles}    title="Pine Parity First" body="Always verify new Python engine logic against TradingView/Pine exports before trusting it in further sweeps or Monte Carlo runs." />
                    </div>
                </NeonPanel>
            </div>
        </div>
    );
}

function Row({ label, checked, onChange }) {
    return (
        <div className="flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2">
            <span className="text-[11.5px] font-ui uppercase tracking-wider text-[hsl(var(--text-2))]">{label}</span>
            <NeonToggle checked={checked} onChange={onChange} />
        </div>
    );
}
function runnerCommand(path, preset) {
    const cdPath = shellEscapePath(path || "~/Documents/Dev Projects/Lux-OB-Backtester");
    const base = `cd ${cdPath}\npython3 scripts/run_backtest.py`;
    if (preset === "baseline") return base;
    return `${base}\n# FUTURE: ${preset} preset will require config selection before execution.`;
}
function shellEscapePath(path) {
    return String(path).replace(/ /g, "\\ ");
}
async function copyText(text, setCopied, key) {
    try {
        await navigator?.clipboard?.writeText(text);
        setCopied(key);
        window.setTimeout(() => setCopied(""), 1600);
    } catch (_) {
        setCopied("");
    }
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
function RunnerButton({ children, disabled = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] disabled:opacity-45 disabled:cursor-not-allowed clip-bevel-sm"
        >
            {children}
        </button>
    );
}
function DiagDot({ on }) {
    return on
        ? <Check className="inline w-3.5 h-3.5 text-[hsl(var(--success))]" aria-label="yes" />
        : <span className="text-muted-lab" aria-label="no">·</span>;
}
function SidecarMeta({ k, v }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-3 py-2">
            <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{k}</div>
            <div className="mt-1 text-[11px] font-code text-[hsl(var(--text-2))] break-all">{String(v ?? "—")}</div>
        </div>
    );
}
function LogBlock({ title, text, tone = "secondary" }) {
    if (!text) return null;
    const toneClass = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--accent-secondary))]";
    return (
        <div className="mt-2">
            <div className="mb-1 text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{title}</div>
            <pre className={`max-h-52 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.65)] clip-bevel-sm p-2 text-[10.5px] leading-relaxed font-code ${toneClass}`}>{text}</pre>
        </div>
    );
}
function Meta({ k, v }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-lab text-[10px] uppercase tracking-wider">{k}</span>
            <span className="font-num text-white">{v}</span>
        </div>
    );
}
function Note({ icon: Icon, title, body }) {
    return (
        <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-3">
            <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                <span className="text-[10.5px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">{title}</span>
            </div>
            <p className="text-[11.5px] text-[hsl(var(--text-2))] mt-2 leading-relaxed">{body}</p>
        </div>
    );
}
